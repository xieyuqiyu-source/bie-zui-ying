// 双人抬棺 practice page: one phone controls both bearers, no server. Used to tune the feel
// of physics.js before the two-player version exists.
const physics = require("../physics.js");
const { drawFrame } = require("../scene.js");

const POSES = [
  { id: "jump", label: "跳" },
  { id: "stand", label: "直立" },
  { id: "half", label: "半蹲" },
  { id: "crouch", label: "蹲下" }
];

const REASON_TEXT = {
  thrown: "起太猛，人直接飞出去了。",
  tipped: "棺材歪成滑梯，人顺着溜下去了。",
  timeout: "磨磨蹭蹭，天都黑了还没下葬。",
  branch: "过树枝不低头，人被刮下去了。"
};

const BLAME_TEXT = { front: "锅归前面那位。", rear: "锅归后面那位。" };

// Never simulate more than this much catch-up in one frame (e.g. after a hitch).
const MAX_FRAME_SECONDS = 0.1;

function sidesOf(state) {
  return [
    { who: "rear", label: "后面", color: "#2f6fed", pose: state ? state.rear.pose : "half" },
    { who: "front", label: "前面", color: "#e33124", pose: state ? state.front.pose : "half" }
  ];
}

Page({
  data: {
    poses: POSES,
    sides: sidesOf(null),
    timeText: "0.0",
    statusText: "稳住，别抖",
    result: null
  },

  onReady() {
    this.initCanvas();
  },

  onUnload() {
    this.left = true;
    if (this.canvas && this.frameId) this.canvas.cancelAnimationFrame(this.frameId);
  },

  restart() {
    this.world = physics.createWorld();
    this.lastAt = Date.now();
    this.carry = 0;
    this.shownTenths = -1;
    this.setData({ sides: sidesOf(this.world), result: null, statusText: "稳住，别抖" });
  },

  pressPose(event) {
    const { who, pose } = event.currentTarget.dataset;
    if (!this.world || this.world.result) return;
    physics.setPose(this.world, who, pose);
    if (pose !== "jump") this.setData({ sides: sidesOf(this.world) });
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
        this.restart();
        const loop = () => {
          if (this.left) return;
          this.tick();
          this.frameId = canvas.requestAnimationFrame(loop);
        };
        this.frameId = canvas.requestAnimationFrame(loop);
      });
  },

  tick() {
    const world = this.world;
    const now = Date.now();
    if (!world.result) {
      // Fixed-step physics regardless of frame rate.
      this.carry += Math.min(MAX_FRAME_SECONDS, (now - this.lastAt) / 1000);
      const dt = world.rules.STEP_SECONDS;
      while (this.carry >= dt && !world.result) {
        physics.step(world);
        this.carry -= dt;
      }
      if (world.result) this.showResult(world.result);
    }
    this.lastAt = now;

    const snap = physics.snapshot(world);
    this.view = drawFrame(this.ctx, this.canvasW, this.canvasH, snap, this.view);

    const tenths = Math.floor(world.t * 10);
    if (tenths !== this.shownTenths) {
      this.shownTenths = tenths;
      const status = snap.body.onBoard ? "稳住，别抖" : "人飞起来了！";
      this.setData({ timeText: (tenths / 10).toFixed(1), statusText: status });
    }
  },

  showResult(result) {
    if (result.outcome === "win") {
      this.setData({
        result: { title: "入土为安", text: `${(result.atMs / 1000).toFixed(1)} 秒送到，专业团队。` }
      });
      return;
    }
    const blame = result.blame ? BLAME_TEXT[result.blame] : "";
    this.setData({ result: { title: "人掉了", text: (REASON_TEXT[result.reason] || "") + blame } });
  }
});
