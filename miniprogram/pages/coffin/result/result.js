const api = require("../../../utils/api");
const { backToLobby } = require("../../../utils/nav");
const { openRoomSocket } = require("../../../utils/roomSocket");
const { ensureUser } = require("../../../utils/user");
const { LOBBY_URL, REASON_CODES, SIDE_NAMES } = require("../rules");

const REASON_TEXT = {
  [REASON_CODES.thrown]: "人被颠飞了",
  [REASON_CODES.tipped]: "人顺着棺材滑下去了",
  [REASON_CODES.timeout]: "时间到了还没下葬",
  [REASON_CODES.absent]: "前面那位掉线了",
  [REASON_CODES.branch]: "人被树枝刮下去了"
};

Page({
  data: {
    headline: "战报出炉",
    trashTalk: "正在清点人数，战报马上到。",
    verdictText: "",
    ownerName: "房主",
    guestName: "兄弟",
    ownerRole: SIDE_NAMES.front,
    guestRole: SIDE_NAMES.rear,
    timeText: "",
    user: {},
    roomId: "",
    waitingResult: false,
    room: {},
    isWinner: false,
    opponentName: "兄弟",
    opponentOnline: false,
    presenceText: "兄弟状态确认中",
    rematchLoading: false,
    rematchButtonText: "邀兄弟再抬一趟",
    socketReady: false,
    fameModalVisible: false
  },

  async onLoad(query) {
    let user;
    try {
      user = await ensureUser({ refresh: true });
    } catch (error) {
      user = getApp().globalData.user || {};
    }
    this.setData({ user, roomId: query.roomId || "" });
    this.connectResultSocket();
    const lastResult = getApp().globalData.lastResult;
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
      guestName: room.guestUser && room.guestUser.nickname || "兄弟"
    });
    this.updatePresence(room, result.onlineUserIds);
    if (!result.match) return false;

    const match = result.match;
    const detail = room.resultDetail || {};
    // Cooperative: both players share one result. Scores are ms until the match ended.
    const isWinner = match.resultType === "coop_win";
    const seconds = (match.playerAScore / 1000).toFixed(1);
    this.setData({
      headline: isWinner ? "入土为安" : "人掉了",
      isWinner,
      trashTalk: match.trashTalk,
      verdictText: isWinner ? `${seconds} 秒送进坑` : REASON_TEXT[detail.reason] || "没抬到地方",
      timeText: isWinner ? `${seconds} 秒` : "没送到",
      waitingResult: false
    });
    this.stopResultPolling();
    getApp().globalData.lastResult = result;
    if (!this.data.user.profileAuthorized && !this.autoFamePromptShown) {
      this.autoFamePromptShown = true;
      this.setData({ fameModalVisible: true });
    }
    return true;
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
        this.setData({ opponentOnline: false, presenceText: "连线断了，正在重连", rematchButtonText: "连线中…" });
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
      presenceText: opponentOnline ? `${opponentName}还没走` : `${opponentName}已经走了`,
      rematchButtonText: this.data.rematchLoading ? this.data.rematchButtonText : opponentOnline ? "邀兄弟再抬一趟" : "兄弟不在，先回大厅"
    });
  },

  requestRematch() {
    if (this.data.rematchLoading || this.data.waitingResult) return;
    if (!this.data.socketReady || !this.data.opponentOnline) {
      wx.showToast({ title: this.data.socketReady ? "兄弟已经走了" : "连线还没接上", icon: "none" });
      return;
    }
    if (!this.socket.send({ type: "rematch:invite" })) {
      wx.showToast({ title: "连线还没接上", icon: "none" });
      return;
    }
    this.setData({ rematchLoading: true, rematchButtonText: "已发邀约，等他嘴硬" });
    this.rematchTimer = setTimeout(() => this.clearRematchWaiting(), 15000);
  },

  clearRematchWaiting() {
    if (this.rematchTimer) {
      clearTimeout(this.rematchTimer);
      this.rematchTimer = null;
    }
    if (!this.data.rematchLoading) return;
    this.setData({
      rematchLoading: false,
      rematchButtonText: this.data.opponentOnline ? "邀兄弟再抬一趟" : "兄弟不在，先回大厅"
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
      content: `${inviterName}邀你再抬一趟，还是原来的位置，敢不敢？`,
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
      wx.showToast({ title: "再来失败，棺材没抬起来", icon: "none" });
    }
  },

  enterRematch(roomId) {
    if (this.enteringRematch) return;
    this.enteringRematch = true;
    if (this.rematchTimer) clearTimeout(this.rematchTimer);
    wx.redirectTo({ url: `/pages/coffin/play/play?roomId=${roomId}` });
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
      if (api.errorCode(error) === "ROOM_NOT_FOUND") {
        this.stopResultPolling();
        this.setData({ headline: "战报走丢了", trashTalk: "房间已经散了，这一趟就当没发生过。", waitingResult: false });
      }
    }
  },

  onShareAppMessage() {
    return {
      title: `双人抬棺：${this.data.trashTalk}`,
      path: "/pages/hub/hub"
    };
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking?gameId=coffin" });
  },

  goHome() {
    backToLobby(LOBBY_URL);
  },

  openFameModal() {
    this.setData({ fameModalVisible: true });
  },

  closeFameModal() {
    this.setData({ fameModalVisible: false });
  },

  onFameSaved(event) {
    this.setData({ user: event.detail.user, fameModalVisible: false });
  }
});
