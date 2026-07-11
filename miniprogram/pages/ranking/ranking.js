const api = require("../../utils/api");
const { ensureUser } = require("../../utils/user");

Page({
  data: {
    type: "bestScore",
    user: {},
    items: []
  },

  onShow() {
    this.load();
  },

  async load() {
    const user = await ensureUser({ refresh: true });
    const result = await api.rankings(this.data.type);
    const items = (result.items || []).map((item) => ({
      ...item,
      isMe: item.user && item.user.id === user.id
    }));
    this.setData({ user, items });
  },

  switchType(event) {
    this.setData({ type: event.currentTarget.dataset.type }, () => this.load());
  }
});
