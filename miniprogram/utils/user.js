const api = require("./api");

async function ensureUser() {
  const app = getApp();
  if (app.globalData.user) return app.globalData.user;

  const stored = wx.getStorageSync("user");
  const result = await api.anonymous(stored && stored.id);
  app.globalData.user = result.user;
  wx.setStorageSync("user", result.user);
  return result.user;
}

function saveUser(user) {
  const app = getApp();
  app.globalData.user = user;
  wx.setStorageSync("user", user);
}

module.exports = {
  ensureUser,
  saveUser
};

