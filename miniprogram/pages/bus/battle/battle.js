const api = require("../../../utils/api");
const { backToLobby } = require("../../../utils/nav");
const { openRoomSocket } = require("../../../utils/roomSocket");
const { ensureUser } = require("../../../utils/user");
const rules = require("../rules");
const { drawFrame } = require("./scene");

const POS_SEND_MS = 100;
const HUD_MS = 100;
// Fraction of the canvas used by the street. The driver's wheel is drawn below it; the
// runner's foot buttons sit under the canvas, so the runner gets the whole canvas.
const BUS_SCENE_RATIO = 0.48;

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
    timeLeftText: (rules.DURATION_MS / 1000).toFixed(1),
    gapText: rules.START_GAP.toFixed(1),
    footHint: "",
    nextFoot: "left",
    kneeling: false,
    opponentName: "对手",
    liveText: "连线中",
    bothOnline: false
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
    // An old backend ignores gameId and hands back a tap room with no roles. Say so instead
    // of quietly playing it as a runner against a bus that never moves.
    if (room.gameId !== "bus" || !room.owner.role) {
      wx.showModal({
        title: "车没对上",
        content: "这不是追赶巴士的房间，可能连到了旧版后端。",
        showCancel: false,
        confirmText: "回大厅",
        complete: () => backToLobby(rules.LOBBY_URL)
      });
      return;
    }
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
    // Distance earned by taps but not yet walked (see RUNNER_MAX_SPEED).
    this.pendingD = 0;
    this.kneelUntil = 0;
    this.busSpeed = rules.BUS_MIN_SPEED;
    this.wheelAngle = 0;
    this.spinSamples = [];
    this.lastTouchAngle = null;
    this.lastTouchQuality = 1;
    this.lastFrameAt = 0;
    this.pageStart = Date.now();
    // Smoothed on-screen numbers for the characters' animation.
    this.anim = { runnerD: 0, runnerSpeed: 0, busD: 0, busSpeed: rules.BUS_MIN_SPEED };

    this.setData({
      role: this.role,
      roleName: rules.ROLE_NAMES[this.role],
      opponentName: opponentUser && opponentUser.nickname || "对手",
      footHint: this.role === "runner" ? "左右脚交替点，先迈左脚" : "手指绕着方向盘画圈"
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
          // Only a catch ends a match early, so if a real opponent has already handed in its
          // run, it saw the catch first (its view of us lags ~100 ms). Stop and hand in ours.
          // A bot's run is in the room from the start, so this doesn't apply to bot rooms.
          const opponent = message.room.owner.userId === this.opponentId ? message.room.owner : message.room.guest;
          const opponentDone = !this.opponentTrace && opponent && opponent.score !== undefined;
          if (message.room.status === "finished" || opponentDone) {
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
        this.sceneRatio = this.role === "bus" ? BUS_SCENE_RATIO : 1;
        const controlTop = info.height * this.sceneRatio;
        const r = Math.min(info.width * 0.32, (info.height - controlTop) * 0.38);
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
      if (this.data.phase !== "countdown") this.setData({ phase: "countdown" });
    } else if (!this.finished) {
      if (this.data.phase !== "playing") this.setData({ phase: "playing" });
      if (this.role === "bus") this.updateBus(now, dt);
      else this.payOutSteps(now);
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
    if (this.boarded && !this.boardedAt) this.boardedAt = now;

    this.updateAnim(dt, busD, runnerD);
    this.updateHud(now, gap);
    this.view = drawFrame(
      this.ctx,
      this.canvasW,
      this.canvasH,
      {
        busD,
        runnerD,
        sceneRatio: this.sceneRatio,
        banner: this.bannerFor(now),
        kneeling: this.role === "runner" ? now < this.kneelUntil : false,
        time: (now - this.pageStart) / 1000,
        // One stride per step: the legs cycle half a turn every STEP_METRES.
        runnerPhase: (this.anim.runnerD / rules.STEP_METRES) * Math.PI,
        runnerSpeed: this.anim.runnerSpeed,
        boardProgress: this.boardedAt ? Math.min(1, (now - this.boardedAt) / 550) : 0,
        busSpeed: this.role === "bus" ? this.busSpeed : this.anim.busSpeed,
        // The other player's driver turns the wheel in step with how far the bus went.
        driverSpin: this.role === "bus" ? this.wheelAngle : this.anim.busD * 1.6,
        boarded: this.boarded,
        wheel: this.role === "bus" ? this.wheel : null,
        wheelAngle: this.wheelAngle
      },
      this.view
    );
  },

  updateAnim(dt, busD, runnerD) {
    const a = this.anim;
    if (dt <= 0) return;
    // Our own runner jumps 0.5 m per tap; glide there so the legs don't snap.
    const nextRunnerD = a.runnerD + (runnerD - a.runnerD) * Math.min(1, dt * 14);
    const k = Math.min(1, dt * 4);
    a.runnerSpeed += ((nextRunnerD - a.runnerD) / dt - a.runnerSpeed) * k;
    a.busSpeed += ((busD - a.busD) / dt - a.busSpeed) * k;
    a.runnerD = nextRunnerD;
    a.busD = busD;
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
      next.footHint = kneeling ? "踩错脚，跪了！" : "左右交替，别踩同一只";
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

    if (foot === this.lastFoot) {
      this.kneelUntil = now + rules.KNEEL_MS;
      this.lastFoot = "";
      this.setData({ kneeling: true, footHint: "踩错脚，跪了！" });
      wx.vibrateShort && wx.vibrateShort({ type: "heavy" });
      return;
    }

    this.lastFoot = foot;
    this.stepCount += 1;
    this.stepTimes.push(now);
    if (this.stepTimes.length > 24) this.stepTimes.shift();
    this.pendingD += rules.STEP_METRES;
    this.payOutSteps(now);
    // Only the highlight changes per tap; the hint text stays put so setData stays tiny.
    this.setData({ nextFoot: foot === "left" ? "right" : "left" });
  },

  // Walk banked distance, no faster than RUNNER_MAX_SPEED since the last payout.
  payOutSteps(now) {
    if (this.pendingD <= 0) {
      this.lastPayoutAt = now;
      return;
    }
    const since = this.lastPayoutAt ? Math.max(0, now - this.lastPayoutAt) / 1000 : 1;
    // A pause lets one step through at once; flat-out tapping is held to the cap.
    const allowance = Math.max(rules.STEP_METRES, rules.RUNNER_MAX_SPEED * since);
    const step = Math.min(this.pendingD, allowance);
    this.myD += step;
    this.pendingD -= step;
    this.lastPayoutAt = now;
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

    const hint = effort > 0.7 ? "稳！车飞起来了" : effort > 0.3 ? "再快点，画圆！" : "手指绕着方向盘画圈";
    if (hint !== this.data.footHint && !this.finished) this.setData({ footHint: hint });
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
    this.endBanner = this.boarded
      ? (this.role === "runner" ? "挤上车了！" : "被追上了…")
      : now >= this.playEnd ? "车门关了" : "这趟结束了";
    this.setData({ phase: "finished", footHint: "正在出战报" });

    let result = null;
    try {
      result = await api.submitScore(this.data.roomId, this.user.id, 0, this.trace);
    } catch (error) {
      // The server settles overdue matches on its own; the result page polls until then.
    }
    getApp().globalData.lastResult = result;
    this.redirectTimer = setTimeout(() => this.goResult(), 1200);
  },

  // Big text drawn over the street: countdown before the start, verdict at the end.
  bannerFor(now) {
    if (this.endBanner) return { title: this.endBanner, sub: "正在出战报" };
    if (now < this.playStart) {
      return {
        title: `${Math.max(1, Math.ceil((this.playStart - now) / 1000))}`,
        sub: this.role === "bus" ? "准备踩油门" : "准备起跑"
      };
    }
    return null;
  },

  currentSpeed(now) {
    if (this.role === "bus") return this.busSpeed;
    if (now < this.kneelUntil) return 0;
    const recent = this.stepTimes.filter((at) => now - at <= rules.SAMPLE_MS).length;
    return Math.min(rules.RUNNER_MAX_SPEED, (recent * rules.STEP_METRES) / (rules.SAMPLE_MS / 1000));
  },

  goResult() {
    if (this.left) return;
    wx.redirectTo({ url: `/pages/bus/result/result?roomId=${this.data.roomId}` });
  }
});
