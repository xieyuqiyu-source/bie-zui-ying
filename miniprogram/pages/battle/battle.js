const api = require("../../utils/api");
const { ensureUser, saveUser } = require("../../utils/user");

Page({
  data: {
    roomId: "",
    room: {},
    score: 0,
    phase: "loading",
    phaseText: "加载中",
    tapText: "准备",
    hint: "尊严加载中"
  },

  async onLoad(query) {
    this.setData({ roomId: query.roomId });
    const result = await api.getRoom(query.roomId);
    this.setData({ room: result.room });
    this.startCountdown(result.room);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  startCountdown(room) {
    const playStart = new Date(room.playStartAt).getTime();
    const playEnd = new Date(room.playEndsAt).getTime();

    this.timer = setInterval(() => {
      const now = Date.now();

      if (now < playStart) {
        const left = Math.max(1, Math.ceil((playStart - now) / 1000));
        this.setData({
          phase: "countdown",
          phaseText: `${left}`,
          tapText: "别急",
          hint: "系统正在检测谁更能装"
        });
        return;
      }

      if (now < playEnd) {
        const left = Math.max(0, Math.ceil((playEnd - now) / 1000));
        this.setData({
          phase: "playing",
          phaseText: `${left}s`,
          tapText: "疯狂点",
          hint: "手指别下班"
        });
        return;
      }

      clearInterval(this.timer);
      this.finish();
    }, 100);
  },

  tapBattle() {
    if (this.data.phase !== "playing") return;
    this.setData({ score: this.data.score + 1 });
  },

  async finish() {
    this.setData({
      phase: "finished",
      phaseText: "结束",
      tapText: "收手",
      hint: "系统正在整理说辞"
    });

    const user = await ensureUser();
    const result = await api.submitScore(this.data.roomId, user.id, this.data.score);
    try {
      const refreshed = await ensureUser({ refresh: true });
      saveUser(refreshed);
    } catch (error) {
      // Ranking has already been updated on the server; local stats can refresh next launch.
    }
    const app = getApp();
    app.globalData.lastResult = result;

    wx.redirectTo({
      url: `/pages/result/result?roomId=${this.data.roomId}`
    });
  }
});
