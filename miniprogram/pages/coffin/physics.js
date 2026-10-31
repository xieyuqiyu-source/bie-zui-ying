// 双人抬棺 physics. Pure functions over a plain state object, so the host phone can run it
// at a fixed step and broadcast snapshots, and node can run it to tune parameters.
//
// Model: two bearers walk at a fixed pace and hold the coffin on their shoulders. The coffin
// is a kinematic board between the shoulders. The body inside is a point mass that collides
// with the board (Coulomb friction, small bounce) and with the two low end walls. Jerking a
// shoulder up and stopping it hard throws the body; tilting the board too far tips it over a
// wall. The body touching the ground loses, falling into the pit wins.
const RULES = require("./rules.js");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function groundY(x, rules) {
  const r = rules || RULES;
  if (x >= r.PIT_X && x <= r.PIT_X + r.PIT_WIDTH) return -r.PIT_DEPTH;
  const points = r.GROUND;
  let y = points[points.length - 1][1];
  if (x <= points[0][0]) {
    y = points[0][1];
  } else {
    for (let i = 1; i < points.length; i += 1) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        break;
      }
    }
  }
  for (const bump of r.BUMPS) {
    const offset = Math.abs(x - bump.x);
    if (offset < bump.width / 2) {
      y += (bump.height * (1 + Math.cos((offset / (bump.width / 2)) * Math.PI))) / 2;
    }
  }
  return y;
}

function createBearer(x, rules) {
  const h = rules.SHOULDER_HEIGHT.half;
  return { x, pose: "half", h, vh: 0, jumpLeft: 0, lastChangeAt: -1 };
}

// Where the team stops: the front bearer at the pit edge.
function stopAt(rules) {
  return rules.PIT_X - rules.PIT_MARGIN - rules.BEARER_GAP;
}

// 0..1, how hard the team is walking at rear position s. Only depends on s, so the guest can
// recompute it from a broadcast state.
function walkFactor(s, rules) {
  const r = rules || RULES;
  return Math.min(1, Math.sqrt(Math.max(0, stopAt(r) - s) / r.BRAKE_DISTANCE));
}

// Walking phase in steps; each bearer's shoulder dips once per step, out of phase.
function walkPhase(s, rules) {
  return s / (rules || RULES).STRIDE;
}

function bob(s, who, rules) {
  const r = rules || RULES;
  const phase = walkPhase(s, r) * Math.PI + (who === "front" ? Math.PI / 2 : 0);
  return -r.WALK_BOB * Math.abs(Math.sin(phase)) * walkFactor(s, r);
}

// World height of a bearer's shoulder.
function shoulderY(x, h, s, who, rules) {
  return groundY(x, rules) + h + bob(s, who, rules);
}

function shoulder(state, who) {
  const bearer = state[who];
  return { x: bearer.x, y: shoulderY(bearer.x, bearer.h, state.s, who, state.rules) };
}

function boardFrame(state) {
  const rear = shoulder(state, "rear");
  const front = shoulder(state, "front");
  const dx = front.x - rear.x;
  const dy = front.y - rear.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / length;
  const uy = dy / length;
  return {
    rear,
    front,
    length,
    cx: (rear.x + front.x) / 2,
    cy: (rear.y + front.y) / 2,
    ux,
    uy,
    // Board normal, pointing up.
    nx: -uy,
    ny: ux,
    angle: Math.atan2(dy, dx)
  };
}

function createWorld(rules) {
  const r = rules || RULES;
  const state = {
    rules: r,
    t: 0,
    s: 0,
    walkSpeed: r.WALK_SPEED,
    rear: createBearer(0, r),
    front: createBearer(r.BEARER_GAP, r),
    body: { x: 0, y: 0, vx: 0, vy: 0, onBoard: true, airborne: false, tipped: false, knocked: false, angle: 0, spin: 0 },
    result: null
  };
  const frame = boardFrame(state);
  state.body.x = frame.cx;
  state.body.y = frame.cy;
  state.body.vx = r.WALK_SPEED;
  state.prevFrame = frame;
  return state;
}

// who: "front" | "rear"; pose: "crouch" | "half" | "stand" | "jump".
function setPose(state, who, pose) {
  const bearer = state[who];
  if (!bearer || state.result) return;
  if (pose === "jump") {
    if (bearer.jumpLeft > 0) return;
    bearer.jumpLeft = state.rules.JUMP_SECONDS;
  } else if (state.rules.POSES.indexOf(pose) >= 0) {
    if (bearer.pose === pose) return;
    bearer.pose = pose;
  } else {
    return;
  }
  bearer.lastChangeAt = state.t;
}

function stepBearer(bearer, dt, rules) {
  let target = rules.SHOULDER_HEIGHT[bearer.pose];
  let maxSpeed = rules.MAX_LIFT_SPEED;
  if (bearer.jumpLeft > 0) {
    target += rules.JUMP_EXTRA;
    maxSpeed = rules.JUMP_LIFT_SPEED;
    bearer.jumpLeft = Math.max(0, bearer.jumpLeft - dt);
  }
  // Move at full speed and brake as late as possible: a quick stand-up ends in a hard stop,
  // and that stop is what throws the body.
  const distance = target - bearer.h;
  const brakeSpeed = Math.sqrt(2 * rules.MAX_LIFT_ACCEL * Math.abs(distance));
  const wanted = Math.sign(distance) * Math.min(maxSpeed, brakeSpeed, rules.SHOULDER_GAIN * Math.abs(distance) + 0.5);
  const maxDelta = rules.MAX_LIFT_ACCEL * dt;
  bearer.vh += clamp(wanted - bearer.vh, -maxDelta, maxDelta);
  bearer.h += bearer.vh * dt;
}

function stepWalk(state, dt) {
  const rules = state.rules;
  state.walkSpeed = rules.WALK_SPEED * walkFactor(state.s, rules);
  state.s = Math.min(stopAt(rules), state.s + state.walkSpeed * dt);
  state.rear.x = state.s;
  state.front.x = state.s + rules.BEARER_GAP;
}

function finish(state, outcome, reason) {
  // Blame whoever moved last; a fall nobody caused (e.g. on a bump) blames nobody.
  const rear = state.rear.lastChangeAt;
  const front = state.front.lastChangeAt;
  let blame = null;
  if (outcome === "lose" && Math.max(rear, front) >= state.t - 2) {
    blame = front >= rear ? "front" : "rear";
  }
  state.result = { outcome, reason, blame, atMs: Math.round(state.t * 1000) };
}

function collideBoard(state, frame, prev, dt) {
  const rules = state.rules;
  const body = state.body;
  const relX = body.x - frame.cx;
  const relY = body.y - frame.cy;
  const along = relX * frame.ux + relY * frame.uy;
  const height = relX * frame.nx + relY * frame.ny;
  const wallAt = rules.COFFIN_HALF - rules.BODY_HALF;

  // Velocity of the board at the body's position, from how the shoulders moved this step.
  const share = clamp(0.5 + along / frame.length, 0, 1);
  const bvx = ((frame.rear.x - prev.rear.x) * (1 - share) + (frame.front.x - prev.front.x) * share) / dt;
  const bvy = ((frame.rear.y - prev.rear.y) * (1 - share) + (frame.front.y - prev.front.y) * share) / dt;
  let rvx = body.vx - bvx;
  let rvy = body.vy - bvy;

  body.onBoard = false;
  // Coming down with its middle over an end wall (thrown sideways while airborne): over it
  // goes. Landing just inside is caught by the wall below.
  if (!body.tipped && body.airborne && Math.abs(along) > rules.RIM_AT && height < rules.WALL_HEIGHT && rvx * frame.nx + rvy * frame.ny < 0) {
    body.tipped = true;
    body.spin = Math.sign(along) * -6;
  }
  if (Math.abs(along) <= rules.COFFIN_HALF && height < 0 && height > -0.3) {
    // Push the body back onto the surface and remove the approaching normal velocity.
    body.x -= frame.nx * height;
    body.y -= frame.ny * height;
    const vn = rvx * frame.nx + rvy * frame.ny;
    const vt = rvx * frame.ux + rvy * frame.uy;
    if (vn < 0) {
      // A slow approach is a resting contact: no bounce, or it would jitter forever.
      const bounce = -vn > 0.5 ? rules.RESTITUTION : 0;
      const newVn = -vn * bounce;
      // Coulomb: tangential impulse is capped by friction times the normal impulse.
      const friction = rules.FRICTION * -vn * (1 + bounce);
      const newVt = Math.abs(vt) <= friction ? 0 : vt - Math.sign(vt) * friction;
      rvx = frame.nx * newVn + frame.ux * newVt;
      rvy = frame.ny * newVn + frame.uy * newVt;
      if (-vn > 0.5) body.spin *= 0.3;
    }
    body.onBoard = true;
  }

  // End walls: a body low enough to hit one bounces back, unless it hits too hard or the
  // board is so steep the body rolls over the edge.
  if (!body.tipped && Math.abs(along) > wallAt && height < rules.WALL_HEIGHT) {
    const side = Math.sign(along);
    const vt = rvx * frame.ux + rvy * frame.uy;
    const steep = Math.abs(frame.angle) > rules.TIP_ANGLE && Math.sign(frame.uy) === -side;
    if (vt * side > rules.WALL_TIP_SPEED || (steep && height < 0.05)) {
      body.tipped = true;
      body.spin = side * -6;
    } else if (vt * side > 0) {
      const correction = (Math.abs(along) - wallAt) * side;
      body.x -= frame.ux * correction;
      body.y -= frame.uy * correction;
      const newVt = -vt * rules.WALL_RESTITUTION;
      rvx += frame.ux * (newVt - vt);
      rvy += frame.uy * (newVt - vt);
    }
  }

  body.vx = rvx + bvx;
  body.vy = rvy + bvy;
  // Airborne means clear of the walls; only then can it land on a rim.
  if (body.onBoard) {
    body.airborne = false;
  } else if (height > rules.WALL_HEIGHT && !body.airborne) {
    body.airborne = true;
    // Leaving the board while sliding sets it tumbling.
    const vt = rvx * frame.ux + rvy * frame.uy;
    body.spin = clamp(-vt * 4 + (frame.angle - prev.angle) / dt, -9, 9);
  }
  if (body.onBoard && !body.tipped) {
    // Lying on the board, swaying a little with how fast it slides.
    const vt = rvx * frame.ux + rvy * frame.uy;
    body.angle = frame.angle + clamp(-vt * 0.25, -0.3, 0.3);
  }
}

// A low branch sweeps the body off backwards if it rides too high.
function hitBranches(state) {
  const rules = state.rules;
  const body = state.body;
  if (body.knocked) return;
  for (const branch of rules.BRANCHES) {
    if (Math.abs(body.x - branch.x) > branch.width / 2) continue;
    if (body.y + rules.BODY_THICKNESS <= groundY(branch.x, rules) + branch.clearance) continue;
    body.knocked = true;
    body.tipped = true;
    body.vx -= rules.WALK_SPEED + 2.2;
    body.vy = Math.max(body.vy, 0) + 1.2;
    body.spin = 7;
    return;
  }
}

function step(state) {
  if (state.result) return;
  const rules = state.rules;
  const dt = rules.STEP_SECONDS;
  state.t += dt;

  stepWalk(state, dt);
  stepBearer(state.rear, dt, rules);
  stepBearer(state.front, dt, rules);
  const frame = boardFrame(state);

  const body = state.body;
  body.vy -= rules.GRAVITY * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  if (!body.onBoard || body.tipped) body.angle += body.spin * dt;
  collideBoard(state, frame, state.prevFrame, dt);
  hitBranches(state);
  state.prevFrame = frame;

  const inPit = body.x > rules.PIT_X && body.x < rules.PIT_X + rules.PIT_WIDTH;
  if (inPit && body.y < -0.2) {
    finish(state, "win", "pit");
  } else if (body.y < groundY(body.x, rules) + 0.12) {
    finish(state, "lose", body.knocked ? "branch" : body.tipped ? "tipped" : "thrown");
  } else if (state.t >= rules.TIME_LIMIT_SECONDS) {
    finish(state, "lose", "timeout");
  }
}

function advance(state, seconds) {
  const steps = Math.round(seconds / state.rules.STEP_SECONDS);
  for (let i = 0; i < steps && !state.result; i += 1) step(state);
}

// Everything the renderer needs, in world units. Also the shape of the host's broadcast.
function snapshot(state) {
  const frame = state.prevFrame;
  return {
    t: Math.round(state.t * 1000),
    rear: { x: state.rear.x, h: state.rear.h, pose: state.rear.pose, jumping: state.rear.jumpLeft > 0 },
    front: { x: state.front.x, h: state.front.h, pose: state.front.pose, jumping: state.front.jumpLeft > 0 },
    coffin: { x: frame.cx, y: frame.cy, angle: frame.angle },
    body: { x: state.body.x, y: state.body.y, angle: state.body.angle, onBoard: state.body.onBoard },
    result: state.result
  };
}

module.exports = {
  RULES,
  groundY,
  shoulderY,
  walkPhase,
  walkFactor,
  createWorld,
  setPose,
  step,
  advance,
  snapshot
};
