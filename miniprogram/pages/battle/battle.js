const api = require("../../utils/api");
const { WS_BASE_URL } = require("../../utils/config");
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
    phaseText: "加载中",
    tapText: "准备",
    hint: "尊严加载中"
  },

  async onLoad(query) {
    this.setData({ roomId: query.roomId });
    const [user, result] = await Promise.all([
      ensureUser(),
      api.getRoom(query.roomId)
    ]);
    this.setData({ user });
    this.updateRoom(result.room, result.onlineUserIds);
    this.connectBattleSocket();
    this.startCountdown(result.room);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    if (this.liveScoreTimer) clearTimeout(this.liveScoreTimer);
    if (this.socketTask) {
      this.socketTask.close({ code: 1000, reason: "leave battle" });
      this.socketTask = null;
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

    const socketTask = wx.connectSocket({
      url: `${WS_BASE_URL}/ws/rooms/${this.data.roomId}?userId=${this.data.user.id}`
    });
    this.socketTask = socketTask;

    socketTask.onOpen(() => {
      this.setData({
        socketReady: true,
        bothOnline: this.data.opponentOnline,
        liveText: this.data.opponentOnline ? "双方在线" : "连线中"
      });
      this.sendLiveScore(true);
    });

    socketTask.onMessage((event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "battle:score" && message.userId !== this.data.user.id) {
          this.setData({ opponentScore: Number(message.score) || 0 });
          return;
        }

        if (message.type === "room:update" && message.room) {
          this.updateRoom(message.room, message.onlineUserIds);
          return;
        }

        if (message.type === "room:connected") {
          const room = this.data.room;
          if (room && room.id) {
            this.updateRoom(room, message.onlineUserIds);
          }
        }
      } catch (error) {
        // Ignore malformed socket messages.
      }
    });

    socketTask.onClose(() => {
      this.setData({
        socketReady: false,
        opponentOnline: false,
        bothOnline: false,
        liveText: "连线中"
      });
    });

    socketTask.onError(() => {
      this.setData({ socketReady: false, bothOnline: false, liveText: "连线中" });
    });
  },

  sendLiveScore(force = false) {
    if (!this.socketTask || !this.data.socketReady) return;

    const sendScore = () => {
      this.lastLiveScoreAt = Date.now();
      this.socketTask.send({
        data: JSON.stringify({
          type: "battle:score",
          score: this.data.score
        })
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
      phaseText: "结束",
      tapText: "收手",
      hint: "系统正在整理说辞"
    });

    const user = this.data.user && this.data.user.id ? this.data.user : await ensureUser();
    const result = await api.submitScore(this.data.roomId, user.id, this.data.score);
    try {
      const refreshed = await ensureUser({ refresh: true });
      saveUser(refreshed);
    } catch (error) {
      // Ranking has already been updated on the server; local stats can refresh next launch.
    }
    const app = getApp();
    app.globalData.lastResult = result;

    wx.redirectTo({
      url: `/pages/result/result?roomId=${this.data.roomId}`
    });
  }
});
