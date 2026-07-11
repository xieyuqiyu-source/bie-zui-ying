const api = require("./api");

async function ensureUser(options = {}) {
  const app = getApp();
  if (app.globalData.user && !options.refresh) return app.globalData.user;

  const stored = wx.getStorageSync("user");
  const userId = app.globalData.user && app.globalData.user.id || stored && stored.id;
  const result = await api.anonymous(userId);
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
