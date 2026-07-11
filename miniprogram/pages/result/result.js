const api = require("../../utils/api");
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
    fameModalVisible: false,
    fameNickname: "",
    fameAvatarTemp: "",
    savingProfile: false
  },

  async onLoad(query) {
    const user = await ensureUser({ refresh: true });
    this.setData({ user, roomId: query.roomId || "" });
    const app = getApp();
    const result = app.globalData.lastResult;
    if (!this.renderResult(result)) {
      this.setData({
        headline: "等对方交卷",
        trashTalk: "战报正在路上，嘴硬先别急。",
        waitingResult: true
      });
      this.startResultPolling();
    }
  },

  onUnload() {
    this.stopResultPolling();
  },

  renderResult(result) {
    if (!result || !result.room) return false;

    const room = result.room;
    this.setData({
      ownerName: room.ownerUser && room.ownerUser.nickname || "房主",
      guestName: room.guestUser && room.guestUser.nickname || "兄弟",
      ownerScore: room.owner && room.owner.score !== undefined ? room.owner.score : 0,
      guestScore: room.guest && room.guest.score !== undefined ? room.guest.score : 0
    });

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
      // Keep waiting; transient network hiccups should not trap the result page.
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.headline}：${this.data.trashTalk}`,
      path: "/pages/home/home"
    };
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking" });
  },

  goHome() {
    wx.reLaunch({ url: "/pages/home/home" });
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
