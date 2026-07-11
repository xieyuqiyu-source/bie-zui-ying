const api = require("../../utils/api");
const { pickDefaultAvatar } = require("../../utils/defaultAvatars");
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
    fameModalVisible: false,
    fameNickname: "",
    fameAvatarTemp: "",
    fameDefaultAvatar: pickDefaultAvatar(),
    savingProfile: false
  },

  async onLoad() {
    const user = await ensureUser();
    this.setData({ user });
    const app = getApp();
    const result = app.globalData.lastResult;
    if (!result || !result.match) {
      this.setData({
        headline: "等对方交卷",
        trashTalk: "战报正在路上，嘴硬先别急。"
      });
      return;
    }

    const room = result.room;
    const match = result.match;
    this.setData({
      headline: match.resultType === "draw" ? "平局，加赛" : "胜负已分",
      trashTalk: match.trashTalk,
      ownerName: room.ownerUser.nickname,
      guestName: room.guestUser.nickname,
      ownerScore: match.playerAScore,
      guestScore: match.playerBScore
    });
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
      fameAvatarTemp: "",
      fameDefaultAvatar: pickDefaultAvatar()
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
