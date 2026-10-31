// 双人抬棺 match. The owner carries the front and is the host: its phone runs physics.js,
// applies the guest's poses as they arrive and streams the state. The guest carries the rear,
// sends its poses and draws the host's state a little in the past (see sync.js).
const api = require("../../../utils/api");
const { backToLobby } = require("../../../utils/nav");
const { openRoomSocket } = require("../../../utils/roomSocket");
const { ensureUser } = require("../../../utils/user");
const physics = require("../physics.js");
const rules = require("../rules.js");
const sync = require("../sync.js");
const { drawFrame } = require("../scene.js");

const POSES = [
  { id: "jump", label: "跳" },
  { id: "stand", label: "直立" },
  { id: "crouch", label: "蹲下" },
  { id: "half", label: "半蹲" }
];
const SIDE_COLORS = { front: "#e33124", rear: "#2f6fed" };
// Host: never simulate more than this much catch-up in one frame (e.g. after a hitch).
const MAX_CATCHUP_SECONDS = 0.25;
// Guest: no state from the host for this long after the start means it is gone.
const HOST_SILENT_MS = 4000;
const HUD_MS = 100;

const RESULT_BANNERS = {
  win: { title: "入土为安", sub: "正在出战报" },
  lose: { title: "人掉了", sub: "正在出战报" }
};

Page({
  data: {
    poses: POSES,
    myPose: "half",
    sideName: "",
    sideColor: "#111",
    timeText: "0.0",
    statusText: "",
    banner: null,
    hint: "",
    bothOnline: false,
    liveText: "连线中"
  },

  async onLoad(query) {
    this.roomId = query.roomId || "";
    let user;
    let result;
    try {
      [user, result] = await Promise.all([ensureUser(), api.getRoom(this.roomId)]);
    } catch (error) {
      const expired = api.errorCode(error) === "ROOM_NOT_FOUND";
      this.leaveWithError(expired ? "房间已经散了，可能过期了。" : "网络在嘴硬，回大厅重新来一局吧。");
      return;
    }

    const room = result.room;
    if (room.gameId !== "coffin" || !room.guest) {
      this.leaveWithError("这不是双人抬棺的房间，可能连到了旧版后端。");
      return;
    }
    if (room.status === "waiting" || !room.playStartAt) {
      wx.redirectTo({ url: `/pages/coffin/room/room?roomId=${room.id}` });
      return;
    }
    if (room.status === "finished") {
      this.goResult();
      return;
    }

    this.user = user;
    this.isHost = room.owner.userId === user.id;
    this.side = this.isHost ? "front" : "rear";
    this.partnerId = this.isHost ? room.guest.userId : room.owner.userId;
    this.playStart = new Date(room.playStartAt).getTime();
    this.world = physics.createWorld();
    this.buffer = this.isHost ? null : sync.createStateBuffer();
    this.lastSentAt = 0;
    this.lastHudAt = 0;
    this.finished = false;

    this.setData({
      sideName: rules.SIDE_NAMES[this.side],
      sideColor: SIDE_COLORS[this.side],
      hint: this.isHost ? "你抬前面：上坡蹲，下坡站，坑边先蹲" : "你抬后面：上坡站，下坡蹲，坑边猛起"
    });

    this.connectSocket(result.onlineUserIds);
    this.initCanvas();
  },

  onShow() {
    if (this.socket) this.socket.reconnectNow();
  },

  onUnload() {
    this.left = true;
    if (this.canvas && this.frameId) this.canvas.cancelAnimationFrame(this.frameId);
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  },

  leaveWithError(content) {
    if (this.left) return;
    this.left = true;
    wx.showModal({
      title: "抬不起来",
      content,
      showCancel: false,
      confirmText: "回大厅",
      complete: () => backToLobby(rules.LOBBY_URL)
    });
  },

  connectSocket(onlineUserIds) {
    this.updateOnline(onlineUserIds);
    this.socket = openRoomSocket({
      roomId: this.roomId,
      userId: this.user.id,
      onStatus: (ready) => {
        if (!ready) this.setData({ bothOnline: false, liveText: "连线中" });
      },
      onMessage: (message) => this.handleMessage(message)
    });
  },

  handleMessage(message) {
    if (message.type === "room:update" || message.type === "room:connected") {
      this.updateOnline(message.onlineUserIds);
      if (message.room && message.room.status === "finished" && !this.finished) this.goResult();
      return;
    }
    if (this.isHost) {
      if (message.type === "coffin:input" && message.userId === this.partnerId && this.started()) {
        physics.setPose(this.world, "rear", message.pose);
      }
      return;
    }
    if (message.userId !== this.partnerId || !Array.isArray(message.v)) return;
    if (message.type === "coffin:state") {
      this.buffer.push(message.v, Date.now());
    } else if (message.type === "coffin:end") {
      const [won, reason, blame, atMs] = message.v;
      this.finish({ outcome: won === 1 ? "win" : "lose", reason, blame, atMs }, [won, reason, blame]);
    }
  },

  updateOnline(onlineUserIds) {
    if (!Array.isArray(onlineUserIds)) return;
    const both = onlineUserIds.includes(this.partnerId);
    this.setData({ bothOnline: both, liveText: both ? "兄弟在线" : "兄弟掉线了" });
  },

  started() {
    return Date.now() >= this.playStart;
  },

  pressPose(event) {
    const pose = event.currentTarget.dataset.pose;
    if (this.finished || !this.world || !this.started()) return;
    if (this.isHost) {
      physics.setPose(this.world, "front", pose);
    } else if (this.socket) {
      this.socket.send({ type: "coffin:input", pose });
    }
    if (pose !== "jump") this.setData({ myPose: pose });
  },

  initCanvas() {
    wx.createSelectorQuery()
      .select("#scene")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node || this.left) return;
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;
        const canvas = info.node;
        canvas.width = info.width * dpr;
        canvas.height = info.height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        this.canvas = canvas;
        this.ctx = ctx;
        this.canvasW = info.width;
        this.canvasH = info.height;
        const loop = () => {
          if (this.left) return;
          this.tick();
          this.frameId = canvas.requestAnimationFrame(loop);
        };
        this.frameId = canvas.requestAnimationFrame(loop);
      });
  },

  tick() {
    const now = Date.now();
    const snap = this.isHost ? this.tickHost(now) : this.tickGuest(now);
    this.view = drawFrame(this.ctx, this.canvasW, this.canvasH, snap, this.view);
    if (now - this.lastHudAt >= HUD_MS) {
      this.lastHudAt = now;
      this.updateHud(now, snap);
    }
  },

  tickHost(now) {
    const world = this.world;
    if (!this.finished && now >= this.playStart) {
      // Follow the shared clock, but catch up gradually after a hitch.
      const target = Math.min((now - this.playStart) / 1000, world.t + MAX_CATCHUP_SECONDS);
      while (world.t + world.rules.STEP_SECONDS <= target && !world.result) physics.step(world);
      if (world.result) {
        const end = sync.encodeEnd(world.result);
        if (this.socket) this.socket.send({ type: "coffin:end", v: end });
        this.finish(world.result, end.slice(0, 3));
      } else if (now - this.lastSentAt >= sync.SEND_MS) {
        this.lastSentAt = now;
        if (this.socket) this.socket.send({ type: "coffin:state", v: sync.encodeState(world) });
      }
    }
    return physics.snapshot(world);
  },

  tickGuest(now) {
    const snap = this.buffer.sample(now) || physics.snapshot(this.world);
    if (!this.finished && now > this.playStart + HOST_SILENT_MS && now - (this.buffer.lastAt() || this.playStart) > HOST_SILENT_MS) {
      // The host stopped sending; the server will settle this as a loss.
      this.finish({ outcome: "lose", reason: "absent", blame: null, atMs: 0 }, [0, rules.REASON_CODES.absent, 0]);
    }
    return snap;
  },

  updateHud(now, snap) {
    if (this.finished) return;
    if (now < this.playStart) {
      const seconds = Math.max(1, Math.ceil((this.playStart - now) / 1000));
      this.setData({ banner: { title: `${seconds}`, sub: "准备起棺" }, timeText: "0.0", statusText: "稳住" });
      return;
    }
    const timeLeft = Math.max(0, rules.TIME_LIMIT_SECONDS - snap.t / 1000);
    this.setData({
      banner: null,
      timeText: timeLeft.toFixed(1),
      statusText: snap.body.onBoard ? "稳住，别抖" : "人飞起来了！"
    });
  },

  // trace: [won, reason code, blame code], the same codes the server expects.
  async finish(result, trace) {
    if (this.finished) return;
    this.finished = true;
    this.setData({ banner: RESULT_BANNERS[result.outcome === "win" ? "win" : "lose"] });
    let response = null;
    try {
      response = await api.submitScore(this.roomId, this.user.id, result.atMs || 0, trace);
    } catch (error) {
      // The server settles overdue matches on its own; the result page polls until then.
    }
    getApp().globalData.lastResult = response;
    this.redirectTimer = setTimeout(() => this.goResult(), 1200);
  },

  goResult() {
    if (this.left) return;
    this.left = true;
    wx.redirectTo({ url: `/pages/coffin/result/result?roomId=${this.roomId}` });
  }
});
