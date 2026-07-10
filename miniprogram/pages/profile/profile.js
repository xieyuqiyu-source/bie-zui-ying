const { ensureUser } = require("../../utils/user");

Page({
  data: {
    user: {}
  },

  async onShow() {
    const user = await ensureUser();
    this.setData({ user });
  }
});

