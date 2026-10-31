const api = require("../../utils/api");
const { backToTapLobby } = require("../../utils/nav");
const { openRoomSocket } = require("../../utils/roomSocket");
const { ensureUser, saveUser } = require("../../utils/user");

Page({
  data: {
    headline: "战报出炉",
    trashTalk: "对方还没输，只是在整理说辞。",
    ownerName: "房主",
    guestName: "兄弟",
    ownerScore: 0,
    guestScore: 0,
    user: {},
    roomId: "",
    waitingResult: false,
    room: {},
    opponentName: "兄弟",
    opponentOnline: false,
    presenceText: "兄弟状态确认中",
    rematchLoading: false,
    rematchButtonText: "邀兄弟再来一局",
    socketReady: false,
    fameModalVisible: false,
    fameNickname: "",
    fameAvatarTemp: "",
    savingProfile: false
  },

  async onLoad(query) {
    let user;
    try {
      user = await ensureUser({ refresh: true });
    } catch (error) {
      // Stats refresh failed; the cached user is enough to show the result.
      user = getApp().globalData.user || {};
    }
    this.setData({ user, roomId: query.roomId || "" });
    this.connectResultSocket();
    const app = getApp();
    const lastResult = app.globalData.lastResult;
    const result = lastResult && lastResult.room && lastResult.room.id === query.roomId ? lastResult : null;
    if (!this.renderResult(result)) {
      this.setData({
        headline: "等对方交卷",
        trashTalk: "战报正在路上，嘴硬先别急。",
        waitingResult: true
      });
      this.startResultPolling();
    }
  },

  onShow() {
    if (this.socket) this.socket.reconnectNow();
  },

  onUnload() {
    this.stopResultPolling();
    if (this.rematchTimer) clearTimeout(this.rematchTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },

  renderResult(result) {
    if (!result || !result.room) return false;

    const room = result.room;
    this.setData({
      room,
      ownerName: room.ownerUser && room.ownerUser.nickname || "房主",
      guestName: room.guestUser && room.guestUser.nickname || "兄弟",
      ownerScore: room.owner && room.owner.score !== undefined ? room.owner.score : 0,
      guestScore: room.guest && room.guest.score !== undefined ? room.guest.score : 0
    });
    this.updatePresence(room, result.onlineUserIds);

    if (!result.match) return false;

    const match = result.match;
    this.setData({
      headline: match.resultType === "draw" ? "平局，加赛" : "胜负已分",
      trashTalk: match.trashTalk,
      ownerScore: match.playerAScore,
      guestScore: match.playerBScore,
      waitingResult: false
    });
    this.stopResultPolling();
    const app = getApp();
    app.globalData.lastResult = result;
    this.maybeOpenFameModal();
    return true;
  },

  maybeOpenFameModal() {
    if (this.autoFamePromptShown) return;
    const user = this.data.user || {};
    if (user.profileAuthorized) return;

    this.autoFamePromptShown = true;
    this.setData({
      fameModalVisible: true,
      fameNickname: "",
      fameAvatarTemp: ""
    });
  },

  connectResultSocket() {
    if (!this.data.roomId || !this.data.user.id) return;

    this.socket = openRoomSocket({
      roomId: this.data.roomId,
      userId: this.data.user.id,
      onStatus: (ready) => {
        this.setData({ socketReady: ready });
        if (ready) return;
        // Our own line is down, so we can't tell whether the opponent left.
        this.clearRematchWaiting();
        this.setData({
          opponentOnline: false,
          presenceText: "连线断了，正在重连",
          rematchButtonText: "连线中…"
        });
      },
      onMessage: (message) => {
        if (message.type === "room:update" && message.room) {
          this.updatePresence(message.room, message.onlineUserIds);
        } else if (message.type === "room:connected") {
          this.updatePresence(this.data.room, message.onlineUserIds);
        } else if (message.type === "rematch:invite" && message.fromUserId !== this.data.user.id) {
          this.showRematchInvite(message.fromUserId);
        } else if (message.type === "rematch:decline" && message.fromUserId !== this.data.user.id) {
          this.clearRematchWaiting();
          wx.showToast({ title: "兄弟说先缓缓", icon: "none" });
        } else if (message.type === "rematch:start" && message.room && message.room.id) {
          this.enterRematch(message.room.id);
        }
      }
    });
  },

  updatePresence(room, onlineUserIds) {
    if (!room || !room.id) return;

    const userId = this.data.user && this.data.user.id;
    const isOwner = room.owner && room.owner.userId === userId;
    const opponentPlayer = isOwner ? room.guest : room.owner;
    const opponentUser = isOwner ? room.guestUser : room.ownerUser;
    const onlineSet = new Set(Array.isArray(onlineUserIds) ? onlineUserIds : []);
    const opponentOnline = Boolean(opponentPlayer && onlineSet.has(opponentPlayer.userId));
    const opponentName = opponentUser && opponentUser.nickname || "兄弟";

    this.setData({
      room,
      opponentName,
      opponentOnline,
      presenceText: opponentOnline ? `${opponentName}还在桌上` : `${opponentName}已离桌`,
      rematchButtonText: opponentOnline ? "邀兄弟再来一局" : "兄弟不在，先回首页"
    });
  },

  requestRematch() {
    if (this.data.rematchLoading || this.data.waitingResult) return;
    if (!this.data.socketReady) {
      wx.showToast({ title: "连线还没接上", icon: "none" });
      return;
    }
    if (!this.data.opponentOnline) {
      wx.showToast({ title: "兄弟已经离桌", icon: "none" });
      return;
    }
    if (!this.socket.send({ type: "rematch:invite" })) {
      wx.showToast({ title: "连线还没接上", icon: "none" });
      return;
    }

    this.setData({
      rematchLoading: true,
      rematchButtonText: "已发邀约，等他嘴硬"
    });
    this.rematchTimer = setTimeout(() => {
      this.clearRematchWaiting();
    }, 15000);
  },

  clearRematchWaiting() {
    if (this.rematchTimer) {
      clearTimeout(this.rematchTimer);
      this.rematchTimer = null;
    }
    if (!this.data.rematchLoading) return;
    this.setData({
      rematchLoading: false,
      rematchButtonText: this.data.opponentOnline ? "邀兄弟再来一局" : "兄弟不在，先回首页"
    });
  },

  showRematchInvite(fromUserId) {
    if (this.rematchInviteOpen) return;
    const room = this.data.room || {};
    const fromUser = room.owner && room.owner.userId === fromUserId ? room.ownerUser : room.guestUser;
    const inviterName = fromUser && fromUser.nickname || "兄弟";
    this.rematchInviteOpen = true;

    wx.showModal({
      title: "兄弟又嘴硬了",
      content: `${inviterName}邀你再来一局，敢不敢立刻回击？`,
      confirmText: "接招",
      cancelText: "先缓缓",
      success: async (res) => {
        this.rematchInviteOpen = false;
        if (res.confirm) {
          await this.acceptRematch();
        } else if (this.socket) {
          this.socket.send({ type: "rematch:decline" });
        }
      },
      fail: () => {
        this.rematchInviteOpen = false;
      }
    });
  },

  async acceptRematch() {
    if (this.data.rematchLoading) return;
    this.setData({ rematchLoading: true });
    try {
      const result = await api.createRematch(this.data.roomId, this.data.user.id);
      this.enterRematch(result.room.id);
    } catch (error) {
      this.setData({ rematchLoading: false });
      wx.showToast({ title: "再来失败，兄弟跑太快", icon: "none" });
    }
  },

  enterRematch(roomId) {
    if (this.enteringRematch) return;
    this.enteringRematch = true;
    if (this.rematchTimer) clearTimeout(this.rematchTimer);
    wx.redirectTo({
      url: `/pages/battle/battle?roomId=${roomId}`
    });
  },

  startResultPolling() {
    if (this.resultPoller || !this.data.roomId) return;
    this.resultPoller = setInterval(() => this.refreshResult(), 1000);
    this.refreshResult();
  },

  stopResultPolling() {
    if (this.resultPoller) {
      clearInterval(this.resultPoller);
      this.resultPoller = null;
    }
  },

  async refreshResult() {
    if (!this.data.roomId) return;
    try {
      const result = await api.getRoom(this.data.roomId);
      this.renderResult(result);
    } catch (error) {
      if (error && error.error === "ROOM_NOT_FOUND") {
        this.stopResultPolling();
        this.setData({
          headline: "战报走丢了",
          trashTalk: "房间已经散了，这局就当没发生过。",
          waitingResult: false
        });
      }
      // Otherwise keep waiting; transient network hiccups should not trap the result page.
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.headline}：${this.data.trashTalk}`,
      path: "/pages/hub/hub"
    };
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking" });
  },

  goHome() {
    backToTapLobby();
  },

  openFameModal() {
    const user = this.data.user || {};
    this.setData({
      fameModalVisible: true,
      fameNickname: user.profileAuthorized ? user.nickname : "",
      fameAvatarTemp: ""
    });
  },

  closeFameModal() {
    this.setData({ fameModalVisible: false, savingProfile: false });
  },

  chooseAvatar(event) {
    this.setData({ fameAvatarTemp: event.detail.avatarUrl });
  },

  inputFameNickname(event) {
    this.setData({ fameNickname: event.detail.value });
  },

  async saveProfile() {
    if (this.data.savingProfile) return;
    const nickname = (this.data.fameNickname || "").trim();
    if (!nickname) {
      wx.showToast({ title: "名号不能为空", icon: "none" });
      return;
    }

    this.setData({ savingProfile: true });
    try {
      const user = await ensureUser();
      let avatarUrl = user.avatarUrl;
      if (this.data.fameAvatarTemp) {
        const uploaded = await api.uploadAvatar(user.id, this.data.fameAvatarTemp);
        avatarUrl = uploaded.avatarUrl;
      }
      const result = await api.updateProfile({
        userId: user.id,
        nickname,
        avatarUrl
      });
      saveUser(result.user);
      this.setData({
        user: result.user,
        fameModalVisible: false,
        fameAvatarTemp: ""
      });
      wx.showToast({ title: "已留下威名" });
    } catch (error) {
      wx.showToast({ title: "留名失败，稍后再装", icon: "none" });
    } finally {
      this.setData({ savingProfile: false });
    }
  }
});
