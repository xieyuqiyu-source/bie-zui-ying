const api = require("../../utils/api");
const { saveUser } = require("../../utils/user");

Page({
  data: {
    headline: "战报出炉",
    trashTalk: "对方还没输，只是在整理说辞。",
    ownerName: "房主",
    guestName: "兄弟",
    ownerScore: 0,
    guestScore: 0
  },

  onLoad() {
    const app = getApp();
    const result = app.globalData.lastResult;
    if (!result || !result.match) {
      this.setData({
        headline: "等对方交卷",
        trashTalk: "战报正在路上，嘴硬先别急。"
      });
      return;
    }

    const room = result.room;
    const match = result.match;
    this.setData({
      headline: match.resultType === "draw" ? "平局，加赛" : "胜负已分",
      trashTalk: match.trashTalk,
      ownerName: room.ownerUser.nickname,
      guestName: room.guestUser.nickname,
      ownerScore: match.playerAScore,
      guestScore: match.playerBScore
    });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.headline}：${this.data.trashTalk}`,
      path: "/pages/home/home"
    };
  },

  goRanking() {
    wx.navigateTo({ url: "/pages/ranking/ranking" });
  },

  goHome() {
    wx.reLaunch({ url: "/pages/home/home" });
  },

  login() {
    wx.login({
      success: async (res) => {
        try {
          const result = await api.wechatLogin({ code: res.code });
          if (result.error) {
            wx.showToast({ title: "登录暂时不服", icon: "none" });
            return;
          }
          saveUser(result.user);
          wx.showToast({ title: "已留名" });
        } catch (error) {
          wx.showToast({ title: "网络晃了一下", icon: "none" });
        }
      },
      fail() {
        wx.showToast({ title: "微信登录失败", icon: "none" });
      }
    });
  }
});
