const api = require("../../utils/api");

Page({
  data: {
    type: "wins",
    items: []
  },

  onShow() {
    this.load();
  },

  async load() {
    const result = await api.rankings(this.data.type);
    this.setData({ items: result.items });
  },

  switchType(event) {
    this.setData({ type: event.currentTarget.dataset.type }, () => this.load());
  }
});

