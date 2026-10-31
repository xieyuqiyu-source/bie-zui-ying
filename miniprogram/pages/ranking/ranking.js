const api = require("../../utils/api");
const { ensureUser } = require("../../utils/user");

// Boards each game offers, in tab order. The value column shows `field` from the item.
const BOARDS = {
  tap: [
    { type: "bestScore", label: "最佳", valueLabel: "最佳点击", field: "bestScore" },
    { type: "wins", label: "胜场", valueLabel: "最佳点击", field: "bestScore" },
    { type: "streak", label: "连胜", valueLabel: "最佳点击", field: "bestScore" }
  ],
  bus: [{ type: "wins", label: "总胜场", valueLabel: "胜场", field: "wins" }]
};

Page({
  data: {
    gameId: "tap",
    boards: BOARDS.tap,
    type: "bestScore",
    valueLabel: "最佳点击",
    user: {},
    items: []
  },

  onLoad(query) {
    const gameId = BOARDS[query.gameId] ? query.gameId : "tap";
    const boards = BOARDS[gameId];
    this.setData({ gameId, boards, type: boards[0].type, valueLabel: boards[0].valueLabel });
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const user = await ensureUser({ refresh: true });
      const result = await api.rankings(this.data.type, this.data.gameId);
      const board = this.data.boards.find((item) => item.type === this.data.type) || this.data.boards[0];
      const items = (result.items || []).map((item) => ({
        ...item,
        value: item.user ? item.user[board.field] : 0,
        isMe: item.user && item.user.id === user.id
      }));
      this.setData({ user, items, valueLabel: board.valueLabel });
    } catch (error) {
      wx.showToast({ title: "排行榜在装死", icon: "none" });
    }
  },

  switchType(event) {
    this.setData({ type: event.currentTarget.dataset.type }, () => this.load());
  }
});
