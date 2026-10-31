const api = require("../../../utils/api");
const { ensureUser, saveUser } = require("../../../utils/user");

const taunts = [
  "师傅说了，这班车谁也不等。",
  "两条腿能不能跑赢四个轮，今天见分晓。",
  "方向盘转冒烟，也别让兄弟上车。",
  "迟到的人，从来都有一万个理由。"
];

Page({
  data: {
    user: {},
    role: "bus",
    taunt: taunts[0],
    creating: false,
    creatingBot: false
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

  pickRole(event) {
    this.setData({ role: event.currentTarget.dataset.role });
  },

  async createRoom() {
    if (this.data.creating) return;
    this.setData({ creating: true });
    try {
      const user = await ensureUser();
      const result = await api.createRoom(user.id, { gameId: "bus", role: this.data.role });
      saveUser(result.user);
      wx.navigateTo({ url: `/pages/bus/room/room?roomId=${result.room.id}&role=owner` });
    } catch (error) {
      wx.showToast({ title: "车没发动起来", icon: "none" });
    } finally {
      this.setData({ creating: false });
    }
  },

  async createBotRoom() {
    if (this.data.creatingBot) return;
    this.setData({ creatingBot: true });
    try {
      const user = await ensureUser();
      const result = await api.createBotRoom(user.id, { gameId: "bus", role: this.data.role });
      saveUser(result.user);
      wx.navigateTo({ url: `/pages/bus/battle/battle?roomId=${result.room.id}&bot=1` });
    } catch (error) {
      wx.showToast({ title: "陪练迟到了", icon: "none" });
    } finally {
      this.setData({ creatingBot: false });
    }
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking?gameId=bus" });
  }
});
