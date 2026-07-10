const { API_BASE_URL } = require("./config");

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json"
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || { error: "REQUEST_FAILED" });
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  anonymous(userId) {
    return request("/api/auth/anonymous", {
      method: "POST",
      data: { userId }
    });
  },

  wechatLogin(payload) {
    return request("/api/auth/wechat-login", {
      method: "POST",
      data: payload
    });
  },

  createRoom(userId) {
    return request("/api/rooms", {
      method: "POST",
      data: { userId }
    });
  },

  createBotRoom(userId) {
    return request("/api/rooms/bot", {
      method: "POST",
      data: { userId }
    });
  },

  getRoom(roomId) {
    return request(`/api/rooms/${roomId}`);
  },

  joinRoom(roomId, userId) {
    return request(`/api/rooms/${roomId}/join`, {
      method: "POST",
      data: { userId }
    });
  },

  ready(roomId, userId) {
    return request(`/api/rooms/${roomId}/ready`, {
      method: "POST",
      data: { userId }
    });
  },

  submitScore(roomId, userId, score) {
    return request(`/api/rooms/${roomId}/score`, {
      method: "POST",
      data: { userId, score }
    });
  },

  rankings(type = "wins") {
    return request(`/api/rankings?type=${type}`);
  }
};
