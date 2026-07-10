const api = require("../../utils/api");
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
    creatingBot: false
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

  login() {
    wx.login({
      success: async (res) => {
        const userInfo = this.data.user || {};
        const result = await api.wechatLogin({
          code: res.code,
          nickname: userInfo.nickname,
          avatarUrl: userInfo.avatarUrl
        });
        saveUser(result.user);
        this.setData({ user: result.user });
        wx.showToast({ title: "已留名" });
      }
    });
  }
});
