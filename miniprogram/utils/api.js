const { API_BASE_URL } = require("./config");

function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const maxRetries = options.retries === undefined ? 1 : options.retries;
  const timeout = options.timeout || 10000;

  function run(attempt) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: options.method || "GET",
        data: options.data || {},
        timeout,
        header: {
          "content-type": "application/json"
        },
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(res.data || { error: "REQUEST_FAILED", statusCode: res.statusCode, url });
          }
        },
        fail(error) {
          const message = error && (error.errMsg || error.message) || "request fail";
          const shouldRetry = attempt < maxRetries && /timeout|fail|interrupted/i.test(message);
          if (shouldRetry) {
            setTimeout(() => {
              run(attempt + 1).then(resolve).catch(reject);
            }, 300);
            return;
          }
          reject({
            error: "NETWORK_ERROR",
            message,
            url
          });
        }
      });
    });
  }

  return run(0);
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
