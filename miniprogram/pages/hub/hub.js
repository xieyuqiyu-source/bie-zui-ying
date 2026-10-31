const { APP_VERSION } = require("../../utils/config");
const { GAMES } = require("../../utils/games");
const { ensureUser } = require("../../utils/user");

const taunts = [
  "选个项目，别挑你最菜的。",
  "这不是游戏，这是兄弟之间的尊严测试。",
  "嘴硬没用，换个玩法照样输。",
  "今天想在哪方面被兄弟碾压？"
];

Page({
  data: {
    appVersion: APP_VERSION,
    user: {},
    taunt: taunts[0],
    games: GAMES.map((game) => ({ ...game, playable: Boolean(game.entry) }))
  },

  async onShow() {
    this.setData({ taunt: taunts[Math.floor(Math.random() * taunts.length)] });
    try {
      const user = await ensureUser({ refresh: true });
      this.setData({ user });
    } catch (error) {
      // The hub stays usable offline; the game lobby retries the login.
    }
  },

  openGame(event) {
    const game = GAMES.find((item) => item.id === event.currentTarget.dataset.id);
    if (!game) return;
    if (!game.entry) {
      wx.showToast({ title: "还在练，过几天再来装", icon: "none" });
      return;
    }
    wx.navigateTo({ url: game.entry });
  },

  onShareAppMessage() {
    return {
      title: "别嘴硬，选个项目见真章。",
      path: "/pages/hub/hub"
    };
  }
});
