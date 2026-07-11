const api = require("../../utils/api");
const { pickDefaultAvatar } = require("../../utils/defaultAvatars");
const { ensureUser, saveUser } = require("../../utils/user");

const taunts = [
  "你的手速，配得上你的嘴硬吗？",
  "这不是游戏，这是兄弟之间的尊严测试。",
  "十秒以后，我们重新定义兄弟地位。",
  "来，给你的嘴硬找个证据。"
];

Page({
  data: {
    user: {},
    taunt: taunts[0],
    creating: false,
    creatingBot: false,
    fameModalVisible: false,
    fameNickname: "",
    fameAvatarTemp: "",
    fameDefaultAvatar: pickDefaultAvatar(),
    savingProfile: false
  },

  async onShow() {
    const user = await ensureUser();
    this.setData({
      user,
      taunt: taunts[Math.floor(Math.random() * taunts.length)]
    });
  },

  async createRoom() {
    if (this.data.creating) return;
    this.setData({ creating: true });
    try {
      const user = await ensureUser();
      const result = await api.createRoom(user.id);
      saveUser(result.user);
      wx.navigateTo({
        url: `/pages/room/room?roomId=${result.room.id}&role=owner`
      });
    } catch (error) {
      wx.showToast({ title: "开局失败", icon: "none" });
    } finally {
      this.setData({ creating: false });
    }
  },

  async createBotRoom() {
    if (this.data.creatingBot) return;
    this.setData({ creatingBot: true });
    try {
      const user = await ensureUser();
      const result = await api.createBotRoom(user.id);
      saveUser(result.user);
      wx.navigateTo({
        url: `/pages/battle/battle?roomId=${result.room.id}`
      });
    } catch (error) {
      wx.showToast({ title: "陪练迟到了", icon: "none" });
    } finally {
      this.setData({ creatingBot: false });
    }
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking" });
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
