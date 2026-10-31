const api = require("../../utils/api");
const { backToTapLobby } = require("../../utils/nav");
const { openRoomSocket } = require("../../utils/roomSocket");
const { ensureUser, saveUser } = require("../../utils/user");

Page({
  data: {
    roomId: "",
    room: {},
    user: {},
    score: 0,
    opponentScore: 0,
    opponentName: "对手",
    opponentOnline: false,
    socketReady: false,
    bothOnline: false,
    liveText: "连线中",
    phase: "loading",
    isFinished: false,
    phaseText: "加载中",
    tapText: "准备",
    hint: "尊严加载中",
    resultDelayText: ""
  },

  async onLoad(query) {
    this.setData({ roomId: query.roomId || "" });
    let user;
    let result;
    try {
      [user, result] = await Promise.all([
        ensureUser(),
        api.getRoom(query.roomId)
      ]);
    } catch (error) {
      const expired = api.errorCode(error) === "ROOM_NOT_FOUND";
      wx.showModal({
        title: expired ? "这局没了" : "没连上",
        content: expired ? "房间已经散了，可能过期了。" : "网络在嘴硬，回大厅重新来一局吧。",
        showCancel: false,
        confirmText: "回大厅",
        complete: () => backToTapLobby()
      });
      return;
    }

    const room = result.room;
    this.setData({ user });
    // Not started yet: nothing to count down to, go back to the waiting room.
    if (room.status === "waiting" || !room.playStartAt || !room.playEndsAt) {
      wx.redirectTo({ url: `/pages/room/room?roomId=${room.id}` });
      return;
    }

    this.updateRoom(room, result.onlineUserIds);
    this.connectBattleSocket();
    this.startCountdown(room);
  },

  onShow() {
    // Timers pause and the socket may drop while the app is in the background.
    if (this.socket) this.socket.reconnectNow();
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    if (this.liveScoreTimer) clearTimeout(this.liveScoreTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },

  updateRoom(room, onlineUserIds) {
    const userId = this.data.user && this.data.user.id;
    const isOwner = room.owner && room.owner.userId === userId;
    const opponentUser = isOwner ? room.guestUser : room.ownerUser;
    const opponentPlayer = isOwner ? room.guest : room.owner;
    const onlineSet = new Set(Array.isArray(onlineUserIds) ? onlineUserIds : []);
    const opponentOnline = Boolean(opponentPlayer && onlineSet.has(opponentPlayer.userId));

    this.setData({
      room,
      opponentName: opponentUser && opponentUser.nickname || "对手",
      opponentOnline,
      bothOnline: this.data.socketReady && opponentOnline,
      liveText: this.data.socketReady && opponentOnline ? "双方在线" : "连线中"
    });
  },

  connectBattleSocket() {
    if (!this.data.roomId || !this.data.user.id) return;

    this.socket = openRoomSocket({
      roomId: this.data.roomId,
      userId: this.data.user.id,
      onStatus: (ready) => {
        if (ready) {
          this.setData({
            socketReady: true,
            bothOnline: this.data.opponentOnline,
            liveText: this.data.opponentOnline ? "双方在线" : "连线中"
          });
          this.sendLiveScore(true);
        } else {
          this.setData({
            socketReady: false,
            opponentOnline: false,
            bothOnline: false,
            liveText: "连线中"
          });
        }
      },
      onMessage: (message) => {
        if (message.type === "battle:score" && message.userId !== this.data.user.id) {
          this.setData({ opponentScore: Number(message.score) || 0 });
        } else if (message.type === "room:update" && message.room) {
          this.updateRoom(message.room, message.onlineUserIds);
        } else if (message.type === "room:connected" && this.data.room.id) {
          this.updateRoom(this.data.room, message.onlineUserIds);
        }
      }
    });
  },

  sendLiveScore(force = false) {
    if (!this.socket || !this.data.socketReady) return;

    const sendScore = () => {
      this.lastLiveScoreAt = Date.now();
      this.socket.send({
        type: "battle:score",
        score: this.data.score
      });
    };

    if (force) {
      if (this.liveScoreTimer) {
        clearTimeout(this.liveScoreTimer);
        this.liveScoreTimer = null;
      }
      sendScore();
      return;
    }

    const elapsed = Date.now() - (this.lastLiveScoreAt || 0);
    if (elapsed >= 150) {
      sendScore();
      return;
    }

    if (!this.liveScoreTimer) {
      this.liveScoreTimer = setTimeout(() => {
        this.liveScoreTimer = null;
        sendScore();
      }, 150 - elapsed);
    }
  },

  startCountdown(room) {
    const playStart = new Date(room.playStartAt).getTime();
    const playEnd = new Date(room.playEndsAt).getTime();

    this.timer = setInterval(() => {
      const now = Date.now();

      if (now < playStart) {
        const left = Math.max(1, Math.ceil((playStart - now) / 1000));
        this.setData({
          phase: "countdown",
          phaseText: `${left}`,
          tapText: "别急",
          hint: "系统正在检测谁更能装"
        });
        return;
      }

      if (now < playEnd) {
        const left = Math.max(0, Math.ceil((playEnd - now) / 1000));
        this.setData({
          phase: "playing",
          phaseText: `${left}s`,
          tapText: "疯狂点",
          hint: "手指别下班"
        });
        return;
      }

      clearInterval(this.timer);
      this.finish();
    }, 100);
  },

  tapBattle() {
    if (this.data.phase !== "playing") return;
    this.setData({ score: this.data.score + 1 });
    this.sendLiveScore();
  },

  async finish() {
    if (this.finished) return;
    this.finished = true;
    this.sendLiveScore(true);

    this.setData({
      phase: "finished",
      isFinished: true,
      phaseText: "结束",
      tapText: "收手",
      hint: "系统正在整理说辞",
      resultDelayText: "别点了，正在送你去接受审判"
    });

    let result;
    try {
      const user = this.data.user && this.data.user.id ? this.data.user : await ensureUser();
      result = await api.submitScore(this.data.roomId, user.id, this.data.score);
    } catch (error) {
      // The server settles overdue matches on its own; the result page polls until then.
      result = null;
    }
    try {
      const refreshed = await ensureUser({ refresh: true });
      saveUser(refreshed);
    } catch (error) {
      // Ranking has already been updated on the server; local stats can refresh next launch.
    }
    const app = getApp();
    app.globalData.lastResult = result;

    this.redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: `/pages/result/result?roomId=${this.data.roomId}`
      });
    }, 1200);
  }
});
