const api = require("../../../utils/api");
const { backToLobby } = require("../../../utils/nav");
const { openRoomSocket } = require("../../../utils/roomSocket");
const { ensureUser } = require("../../../utils/user");
const rules = require("../rules");
const { drawFrame } = require("./scene");

const POS_SEND_MS = 100;
const HUD_MS = 100;
// Fraction of the canvas height used by the street; the rest holds the controls.
const SCENE_RATIO = 0.6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Position along a sampled trace at elapsed ms, for the bot's pre-generated run.
function traceAt(trace, elapsedMs) {
  if (!trace || trace.length === 0) return 0;
  const t = elapsedMs / rules.SAMPLE_MS;
  const i = Math.floor(t);
  const before = i <= 0 ? 0 : trace[Math.min(i, trace.length) - 1];
  const after = trace[Math.min(i, trace.length - 1)];
  if (i >= trace.length) return trace[trace.length - 1];
  return before + (after - before) * (t - i);
}

Page({
  data: {
    roomId: "",
    role: "",
    roleName: "",
    phase: "loading",
    countdownText: "",
    timeLeftText: "15.0",
    gapText: "12.0",
    footHint: "",
    nextFoot: "left",
    kneeling: false,
    opponentName: "对手",
    liveText: "连线中",
    bothOnline: false,
    banner: ""
  },

  async onLoad(query) {
    this.setData({ roomId: query.roomId || "" });
    let user;
    let result;
    try {
      [user, result] = await Promise.all([ensureUser(), api.getRoom(query.roomId)]);
    } catch (error) {
      const expired = api.errorCode(error) === "ROOM_NOT_FOUND";
      wx.showModal({
        title: expired ? "车开走了" : "没连上",
        content: expired ? "房间已经散了，可能过期了。" : "网络在嘴硬，回大厅重新来一局吧。",
        showCancel: false,
        confirmText: "回大厅",
        complete: () => backToLobby(rules.LOBBY_URL)
      });
      return;
    }

    const room = result.room;
    if (room.status === "waiting" || !room.playStartAt || !room.playEndsAt) {
      wx.redirectTo({ url: `/pages/bus/room/room?roomId=${room.id}` });
      return;
    }

    const isOwner = room.owner.userId === user.id;
    const me = isOwner ? room.owner : room.guest;
    const opponent = isOwner ? room.guest : room.owner;
    const opponentUser = isOwner ? room.guestUser : room.ownerUser;
    this.user = user;
    this.room = room;
    this.role = me.role || "runner";
    this.opponentId = opponent.userId;
    // Bot rooms carry the bot's whole run up front; real opponents stream their position.
    this.opponentTrace = query.bot === "1" && opponent.trace ? opponent.trace : null;
    this.playStart = new Date(room.playStartAt).getTime();
    this.playEnd = this.playStart + rules.DURATION_MS;

    this.myD = 0;
    this.opponentD = 0;
    this.opponentShownD = 0;
    this.trace = [];
    this.stepCount = 0;
    this.stepTimes = [];
    this.lastFoot = "";
    this.lastStepAt = 0;
    this.kneelUntil = 0;
    this.busSpeed = rules.BUS_MIN_SPEED;
    this.wheelAngle = 0;
    this.spinSamples = [];
    this.lastTouchAngle = null;
    this.lastTouchQuality = 1;
    this.lastFrameAt = 0;

    this.setData({
      role: this.role,
      roleName: rules.ROLE_NAMES[this.role],
      opponentName: opponentUser && opponentUser.nickname || "对手",
      footHint: this.role === "runner" ? "先迈左脚" : "绕着方向盘画圈"
    });

    // A finished room (e.g. reopened from history) goes straight to the result.
    if (room.status === "finished") {
      this.goResult();
      return;
    }

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

  connectSocket(onlineUserIds) {
    this.updateOnline(onlineUserIds);
    this.socket = openRoomSocket({
      roomId: this.data.roomId,
      userId: this.user.id,
      onStatus: (ready) => {
        this.socketReady = ready;
        if (!ready) this.setData({ bothOnline: false, liveText: "连线中" });
      },
      onMessage: (message) => {
        if (message.type === "bus:pos" && message.userId === this.opponentId) {
          this.opponentD = Math.max(this.opponentD, Number(message.d) || 0);
        } else if (message.type === "room:update" && message.room) {
          this.updateOnline(message.onlineUserIds);
          // Only a catch ends a match early, so if the other side has already handed in its
          // run, it saw the catch first (its view of us lags ~100 ms). Stop and hand in ours.
          const opponent = message.room.owner.userId === this.opponentId ? message.room.owner : message.room.guest;
          if (message.room.status === "finished" || (opponent && opponent.score !== undefined)) {
            if (Date.now() < this.playEnd) this.boarded = true;
            this.finish();
          }
        } else if (message.type === "room:connected") {
          this.updateOnline(message.onlineUserIds);
        }
      }
    });
  },

  updateOnline(onlineUserIds) {
    if (this.opponentTrace) {
      this.setData({ bothOnline: true, liveText: "陪练在线" });
      return;
    }
    const online = new Set(Array.isArray(onlineUserIds) ? onlineUserIds : []);
    const both = online.has(this.opponentId);
    this.setData({ bothOnline: both, liveText: both ? "双方在线" : "连线中" });
  },

  initCanvas() {
    wx.createSelectorQuery()
      .select("#scene")
      .fields({ node: true, size: true, rect: true })
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
        this.canvasTop = info.top || 0;
        this.canvasLeft = info.left || 0;
        const controlTop = info.height * SCENE_RATIO;
        const r = Math.min(info.width * 0.3, (info.height - controlTop) * 0.36);
        this.wheel = { cx: info.width / 2, cy: controlTop + (info.height - controlTop) / 2, r };
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
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 0;
    this.lastFrameAt = now;

    if (now < this.playStart) {
      const left = Math.max(1, Math.ceil((this.playStart - now) / 1000));
      if (this.data.phase !== "countdown" || this.data.countdownText !== `${left}`) {
        this.setData({ phase: "countdown", countdownText: `${left}` });
      }
    } else if (!this.finished) {
      if (this.data.phase !== "playing") this.setData({ phase: "playing", countdownText: "" });
      if (this.role === "bus") this.updateBus(now, dt);
      this.recordSamples(now);
      this.sendPosition(now);
      if (now >= this.playEnd) this.finish();
    }

    if (this.opponentTrace) {
      this.opponentD = traceAt(this.opponentTrace, clamp(now - this.playStart, 0, rules.DURATION_MS));
    }
    // Ease toward the last reported position so 100 ms updates don't look jumpy.
    this.opponentShownD += (this.opponentD - this.opponentShownD) * Math.min(1, dt * 10);
    const busD = this.role === "bus" ? this.myD : this.opponentShownD;
    const runnerD = this.role === "runner" ? this.myD : this.opponentShownD;
    const gap = rules.START_GAP + busD - runnerD;
    if (!this.finished && now >= this.playStart && gap <= rules.CLIENT_CATCH_GAP) {
      this.boarded = true;
      this.finish();
    }

    this.updateHud(now, gap);
    this.view = drawFrame(
      this.ctx,
      this.canvasW,
      this.canvasH,
      {
        busD,
        runnerD,
        sceneRatio: SCENE_RATIO,
        kneeling: this.role === "runner" ? now < this.kneelUntil : false,
        stepCount: this.role === "runner" ? this.stepCount : Math.floor(runnerD / rules.STEP_METRES),
        boarded: this.boarded,
        wheel: this.role === "bus" ? this.wheel : null,
        wheelAngle: this.wheelAngle
      },
      this.view
    );
  },

  updateHud(now, gap) {
    if (this.lastHudAt && now - this.lastHudAt < HUD_MS) return;
    this.lastHudAt = now;
    const left = clamp((this.playEnd - Math.max(now, this.playStart)) / 1000, 0, rules.DURATION_MS / 1000);
    const next = {
      timeLeftText: this.finished ? this.data.timeLeftText : left.toFixed(1),
      gapText: Math.max(0, gap).toFixed(1)
    };
    const kneeling = this.role === "runner" && now < this.kneelUntil;
    if (kneeling !== this.data.kneeling) {
      next.kneeling = kneeling;
      next.footHint = kneeling ? "踩错脚，跪了！" : this.data.nextFoot === "left" ? "换左脚" : "换右脚";
    }
    if (next.timeLeftText !== this.data.timeLeftText || next.gapText !== this.data.gapText || "kneeling" in next) {
      this.setData(next);
    }
  },

  // One sample per 500 ms of play. If the app was in the background, the missed samples all
  // get the current distance (the server tops a stalled bus up to its minimum speed).
  recordSamples(now) {
    const due = Math.min(rules.SAMPLE_COUNT, Math.floor((now - this.playStart) / rules.SAMPLE_MS));
    while (this.trace.length < due) {
      this.trace.push(Math.round(this.myD * 10) / 10);
    }
  },

  sendPosition(now, force) {
    if (this.opponentTrace || !this.socket || !this.socketReady) return;
    if (!force && this.lastPosAt && now - this.lastPosAt < POS_SEND_MS) return;
    this.lastPosAt = now;
    this.socket.send({ type: "bus:pos", d: Math.round(this.myD * 10) / 10 });
  },

  // --- runner ---

  tapFoot(event) {
    if (this.role !== "runner" || this.data.phase !== "playing" || this.finished) return;
    const foot = event.currentTarget.dataset.foot;
    const now = Date.now();
    if (now < this.kneelUntil) return;
    if (now - this.lastStepAt < rules.MIN_STEP_INTERVAL_MS) return;

    if (foot === this.lastFoot) {
      this.kneelUntil = now + rules.KNEEL_MS;
      this.lastFoot = "";
      this.setData({ kneeling: true, footHint: "踩错脚，跪了！" });
      wx.vibrateShort && wx.vibrateShort({ type: "heavy" });
      return;
    }

    this.lastFoot = foot;
    this.lastStepAt = now;
    this.stepCount += 1;
    this.stepTimes.push(now);
    if (this.stepTimes.length > 12) this.stepTimes.shift();
    this.myD += rules.STEP_METRES;
    const nextFoot = foot === "left" ? "right" : "left";
    this.setData({ nextFoot, footHint: nextFoot === "left" ? "换左脚" : "换右脚" });
  },

  // --- bus ---

  touchWheel(event) {
    if (this.role !== "bus" || !this.wheel) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const { cx, cy, r } = this.wheel;
    const dx = touch.x - cx;
    const dy = touch.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    // Tracing the rim is best; scribbling near the hub or far outside wastes effort.
    const ratio = dist / r;
    const quality = ratio < 0.35 ? 0 : clamp(1 - Math.abs(ratio - 1) * 1.1, 0.25, 1);

    if (event.type === "touchstart" || this.lastTouchAngle === null) {
      this.lastTouchAngle = angle;
      return;
    }
    const delta = angleDelta(this.lastTouchAngle, angle);
    this.lastTouchAngle = angle;
    this.wheelAngle += delta;
    if (this.data.phase === "playing") {
      this.spinSamples.push({ at: Date.now(), delta, quality });
    }
  },

  releaseWheel() {
    this.lastTouchAngle = null;
  },

  updateBus(now, dt) {
    const windowMs = 350;
    this.spinSamples = this.spinSamples.filter((s) => now - s.at <= windowMs);
    let net = 0;
    let travelled = 0;
    let weighted = 0;
    for (const s of this.spinSamples) {
      net += s.delta;
      travelled += Math.abs(s.delta);
      weighted += Math.abs(s.delta) * s.quality;
    }
    // Back-and-forth wiggling cancels out; only steady spinning one way counts.
    const steadiness = travelled > 0 ? Math.abs(net) / travelled : 0;
    const quality = travelled > 0 ? weighted / travelled : 0;
    const rps = Math.abs(net) / (Math.PI * 2) / (windowMs / 1000);
    const effort = clamp(rps / rules.WHEEL_FULL_SPEED_RPS, 0, 1) * quality * steadiness * steadiness;
    const target = rules.BUS_MIN_SPEED + (rules.BUS_MAX_SPEED - rules.BUS_MIN_SPEED) * effort;
    const rate = target > this.busSpeed ? rules.BUS_ACCEL : rules.BUS_DECEL;
    this.busSpeed += clamp(target - this.busSpeed, -rate * dt, rate * dt);
    this.busSpeed = clamp(this.busSpeed, rules.BUS_MIN_SPEED, rules.BUS_MAX_SPEED);
    this.myD += this.busSpeed * dt;

    const hint = effort > 0.7 ? "稳！车飞起来了" : effort > 0.3 ? "再快点，画圆！" : "绕着方向盘画圈";
    if (hint !== this.data.footHint) this.setData({ footHint: hint });
  },

  // --- end ---

  async finish() {
    if (this.finished) return;
    this.finished = true;
    const now = Date.now();
    this.recordSamples(now);
    // Ending mid-sample: the server compares positions at sample boundaries, so project ours
    // to the next boundary at the current pace. Otherwise the bus would get up to half a
    // second of extra distance on paper and a real catch could be judged a miss.
    if (this.trace.length < rules.SAMPLE_COUNT && now < this.playEnd) {
      const boundary = this.playStart + (this.trace.length + 1) * rules.SAMPLE_MS;
      const ahead = Math.max(0, (boundary - now) / 1000) * this.currentSpeed(now);
      this.trace.push(Math.round((this.myD + ahead) * 10) / 10);
    }
    this.sendPosition(now, true);
    this.setData({
      phase: "finished",
      banner: this.boarded
        ? (this.role === "runner" ? "挤上车了！" : "被追上了…")
        : now >= this.playEnd ? "车门关了" : "这趟结束了"
    });

    let result = null;
    try {
      result = await api.submitScore(this.data.roomId, this.user.id, 0, this.trace);
    } catch (error) {
      // The server settles overdue matches on its own; the result page polls until then.
    }
    getApp().globalData.lastResult = result;
    this.redirectTimer = setTimeout(() => this.goResult(), 1200);
  },

  currentSpeed(now) {
    if (this.role === "bus") return this.busSpeed;
    if (now < this.kneelUntil) return 0;
    const recent = this.stepTimes.filter((at) => now - at <= rules.SAMPLE_MS).length;
    return (recent * rules.STEP_METRES) / (rules.SAMPLE_MS / 1000);
  },

  goResult() {
    if (this.left) return;
    wx.redirectTo({ url: `/pages/bus/result/result?roomId=${this.data.roomId}` });
  }
});
