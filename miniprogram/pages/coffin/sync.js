// 双人抬棺 network format. The host (owner, front bearer) runs physics.js and sends
// `coffin:state` with v = encodeState(world) every SEND_MS; the guest rebuilds a drawable
// snapshot with decodeState and interpolates between them. The server only checks that v
// is an array of 10 numbers (server/src/services/roomSocketService.ts).
const { groundY } = require("./physics.js");
const RULES = require("./rules.js");

const SEND_MS = 50;
// The guest draws this far in the past so it always has two states to blend.
const RENDER_DELAY_MS = 120;

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// Pose index, plus 4 while a jump is in progress.
function bearerCode(bearer) {
  return RULES.POSES.indexOf(bearer.pose) + (bearer.jumpLeft > 0 ? 4 : 0);
}

function encodeState(world) {
  const body = world.body;
  return [
    Math.round(world.t * 1000),
    round3(world.s),
    round3(world.rear.h),
    round3(world.front.h),
    round3(body.x),
    round3(body.y),
    round3(body.angle),
    body.onBoard ? 1 : 0,
    bearerCode(world.rear),
    bearerCode(world.front)
  ];
}

function bearerOf(x, h, code) {
  return { x, h, pose: RULES.POSES[code % 4] || "half", jumping: code >= 4 };
}

// Same shape as physics.snapshot(), so scene.drawFrame can draw either.
function decodeState(v) {
  const [t, s, rearH, frontH, bodyX, bodyY, bodyAngle, onBoard, rearCode, frontCode] = v;
  const rear = bearerOf(s, rearH, rearCode);
  const front = bearerOf(s + RULES.BEARER_GAP, frontH, frontCode);
  const rearY = groundY(rear.x) + rear.h;
  const frontY = groundY(front.x) + front.h;
  return {
    t,
    rear,
    front,
    coffin: {
      x: (rear.x + front.x) / 2,
      y: (rearY + frontY) / 2,
      angle: Math.atan2(frontY - rearY, front.x - rear.x)
    },
    body: { x: bodyX, y: bodyY, angle: bodyAngle, onBoard: onBoard === 1 },
    result: null
  };
}

// Blend the numeric fields of two encoded states; pose codes come from the newer one.
function blendStates(a, b, f) {
  return b.map((value, i) => (i >= 7 ? value : a[i] + (value - a[i]) * f));
}

// Buffer of received states for the guest. push() as they arrive, sample() each frame.
function createStateBuffer() {
  const items = [];
  return {
    push(v, receivedAt) {
      // Drop out-of-order packets.
      if (items.length && v[0] <= items[items.length - 1].v[0]) return;
      items.push({ v, at: receivedAt });
      if (items.length > 30) items.shift();
    },
    lastAt() {
      return items.length ? items[items.length - 1].at : 0;
    },
    sample(now) {
      if (!items.length) return null;
      const target = now - RENDER_DELAY_MS;
      let i = items.length - 1;
      while (i > 0 && items[i - 1].at > target) i -= 1;
      if (i === 0) return decodeState(items[0].v);
      const a = items[i - 1];
      const b = items[i];
      const f = b.at === a.at ? 1 : Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)));
      return decodeState(blendStates(a.v, b.v, f));
    }
  };
}

// coffin:end payload: [won 1/0, reason code, blame code, atMs].
function encodeEnd(result) {
  return [
    result.outcome === "win" ? 1 : 0,
    RULES.REASON_CODES[result.reason] || RULES.REASON_CODES.timeout,
    RULES.BLAME_CODES[result.blame || "none"],
    result.atMs
  ];
}

module.exports = {
  SEND_MS,
  encodeState,
  decodeState,
  createStateBuffer,
  encodeEnd
};
