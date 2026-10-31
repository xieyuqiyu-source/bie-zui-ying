const api = require("../../../utils/api");
const { ensureUser, saveUser } = require("../../../utils/user");

const taunts = [
  "抬得稳的是兄弟，抬不稳的是仇人。",
  "一个起太猛，一个蹲太快，人就没了。",
  "这活讲究默契，嘴硬没用。",
  "八抬大轿抬不动，两个人抬棺试试。"
];

Page({
  data: {
    user: {},
    taunt: taunts[0],
    creating: false
  },

  async onShow() {
    this.setData({ taunt: taunts[Math.floor(Math.random() * taunts.length)] });
    try {
      const user = await ensureUser({ refresh: true });
      this.setData({ user });
    } catch (error) {
      // Creating a room retries the login.
    }
  },

  async createRoom() {
    if (this.data.creating) return;
    this.setData({ creating: true });
    try {
      const user = await ensureUser();
      const result = await api.createRoom(user.id, { gameId: "coffin" });
      saveUser(result.user);
      wx.navigateTo({ url: `/pages/coffin/room/room?roomId=${result.room.id}&role=owner` });
    } catch (error) {
      wx.showToast({ title: "棺材没抬起来", icon: "none" });
    } finally {
      this.setData({ creating: false });
    }
  },

  goSandbox() {
    wx.navigateTo({ url: "/pages/coffin/sandbox/sandbox" });
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking?gameId=coffin" });
  }
});
