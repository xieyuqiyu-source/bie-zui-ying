// Draws one frame of 双人抬棺 on a 2d canvas. Pure drawing: all game state comes in `snap`
// (physics.snapshot or sync.decodeState); the previous view is passed back in to smooth the
// camera.
const { groundY, shoulderY, walkPhase, walkFactor, RULES } = require("./physics.js");

const INK = "#111";
const SKY_TOP = "#ffe9a8";
const SKY_BOTTOM = "#fff6d6";
const SUN = "#ffb43a";
const HILL_FAR = "#d9c48f";
const HILL_NEAR = "#bfa86e";
const DIRT = "#b98a55";
const DIRT_DARK = "#8f6438";
const GRASS = "#5d9e45";
const STONE = "#c9c3b4";
const WOOD = "#8a5530";
const WOOD_LIGHT = "#b0743f";
const WOOD_DARK = "#4e2e19";
const TREE = "#4f7d3a";
const SHROUD = "#f4f1e8";
const SKIN = "#f2c9a0";
const HEADBAND = "#fff";
const SHIRT = { rear: "#2f6fed", front: "#e33124" };
const PANTS = "#2b2b2b";

const SCREEN_METRES = 5.6;
// Body proportions in metres: short legs and a big head read better at phone size.
// Standing (shoulders at 1.1 m) leaves the knees just slightly bent.
const TORSO = 0.36;
const THIGH = 0.36;
const SHIN = 0.36;
const STRIDE_HALF = 0.18;

// Deterministic pseudo-random in [0, 1) so scenery doesn't flicker between frames.
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function fillStroke(ctx, fill, width) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function sx(view, x) {
  return (x - view.cameraX) * view.ppm;
}

function sy(view, y) {
  return view.baseY - y * view.ppm;
}

function drawSky(ctx, view) {
  const { w, h } = view;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.2, Math.min(w, h) * 0.09, 0, Math.PI * 2);
  fillStroke(ctx, SUN, 3);

  // Clouds drift slowly against the camera.
  for (let i = 0; i < 4; i += 1) {
    const span = w * 1.6;
    const x = ((i * span) / 4 - view.cameraX * view.ppm * 0.08) % span;
    const cx = x < -w * 0.3 ? x + span : x;
    const cy = h * (0.12 + 0.12 * hash(i));
    const r = view.ppm * (0.22 + 0.1 * hash(i + 9));
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(cx + r * 1.1, cy - r * 0.6, r * 1.1, Math.PI, Math.PI * 2);
    ctx.arc(cx + r * 2.3, cy, r, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    fillStroke(ctx, "#fff", 3);
  }
}

// Rolling hills at a given parallax factor.
function drawHills(ctx, view, factor, color, height, seed) {
  const { w, h, ppm } = view;
  const offset = view.cameraX * ppm * factor;
  const top = view.baseY - view.groundScreen * factor;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 10; x += 10) {
    const u = (x + offset) / (ppm * 3);
    const y = top - ppm * height * (0.55 + 0.25 * Math.sin(u + seed) + 0.2 * Math.sin(u * 2.3 + seed * 3));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// Tombstones on the far side of the path, slightly slower than the ground.
function drawGraveyard(ctx, view) {
  const factor = 0.75;
  const left = view.cameraX * factor - 1;
  const right = left + view.w / view.ppm / factor + 2;
  for (let i = Math.floor(left / 2.3); i <= right / 2.3; i += 1) {
    if (hash(i * 3.1) < 0.35) continue;
    const worldX = i * 2.3 + hash(i) * 1.2;
    const x = (worldX - view.cameraX * factor) * view.ppm;
    const base = view.baseY - view.groundScreen * factor - view.ppm * 0.15;
    const ww = view.ppm * (0.32 + 0.12 * hash(i + 4));
    const hh = view.ppm * (0.42 + 0.2 * hash(i + 7));
    ctx.beginPath();
    if (hash(i + 2) < 0.5) {
      ctx.moveTo(x - ww / 2, base);
      ctx.lineTo(x - ww / 2, base - hh + ww / 2);
      ctx.arc(x, base - hh + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(x + ww / 2, base);
    } else {
      ctx.rect(x - ww / 2, base - hh, ww, hh);
    }
    ctx.closePath();
    fillStroke(ctx, STONE, 2.5);
    ctx.lineWidth = 2;
    line(ctx, x, base - hh * 0.7, x, base - hh * 0.25);
  }
}

function drawGround(ctx, view) {
  const { w, h, ppm, cameraX } = view;
  const left = cameraX - 0.5;
  const right = cameraX + w / ppm + 0.5;
  const STEP = 0.04;

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = left; x <= right; x += STEP) ctx.lineTo(sx(view, x), sy(view, groundY(x)));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = DIRT;
  ctx.fill();

  // Pebbles, fixed to world positions.
  ctx.fillStyle = DIRT_DARK;
  for (let i = Math.floor(left / 0.45); i <= right / 0.45; i += 1) {
    const x = i * 0.45 + hash(i) * 0.3;
    if (x >= RULES.PIT_X - 0.1 && x <= RULES.PIT_X + RULES.PIT_WIDTH + 0.1) continue;
    const depth = 0.15 + hash(i + 5) * 0.6;
    ctx.beginPath();
    ctx.arc(sx(view, x), sy(view, groundY(x) - depth), ppm * (0.025 + 0.025 * hash(i + 2)), 0, Math.PI * 2);
    ctx.fill();
  }

  // Grass edge, broken at the pit.
  ctx.beginPath();
  let drawing = false;
  for (let x = left; x <= right; x += STEP) {
    const inPit = x >= RULES.PIT_X && x <= RULES.PIT_X + RULES.PIT_WIDTH;
    if (inPit) {
      drawing = false;
      continue;
    }
    if (drawing) ctx.lineTo(sx(view, x), sy(view, groundY(x)));
    else ctx.moveTo(sx(view, x), sy(view, groundY(x)));
    drawing = true;
  }
  ctx.lineWidth = ppm * 0.07;
  ctx.strokeStyle = GRASS;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawPit(ctx, view) {
  const { ppm } = view;
  const x0 = sx(view, RULES.PIT_X);
  const x1 = sx(view, RULES.PIT_X + RULES.PIT_WIDTH);
  const top = sy(view, 0);
  const bottom = sy(view, -RULES.PIT_DEPTH);
  ctx.fillStyle = "#3b2a1a";
  ctx.fillRect(x0, top, x1 - x0, bottom - top);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x0, top, x1 - x0, bottom - top);

  // Dug-out mound and a waiting headstone past the far edge.
  const moundX = x1 + ppm * 0.7;
  ctx.beginPath();
  ctx.moveTo(x1 + ppm * 0.1, top);
  ctx.quadraticCurveTo(moundX, top - ppm * 0.7, x1 + ppm * 1.4, top);
  ctx.closePath();
  fillStroke(ctx, DIRT_DARK, 3);
  const stoneX = x1 + ppm * 1.9;
  const sw = ppm * 0.5;
  const sh = ppm * 0.8;
  ctx.beginPath();
  ctx.moveTo(stoneX - sw / 2, top);
  ctx.lineTo(stoneX - sw / 2, top - sh + sw / 2);
  ctx.arc(stoneX, top - sh + sw / 2, sw / 2, Math.PI, 0);
  ctx.lineTo(stoneX + sw / 2, top);
  ctx.closePath();
  fillStroke(ctx, STONE, 3);
  ctx.fillStyle = INK;
  ctx.font = `900 ${Math.round(ppm * 0.16)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("安", stoneX, top - sh * 0.62);
  ctx.fillText("息", stoneX, top - sh * 0.36);

  // Arrow pointing into the hole.
  const ax = (x0 + x1) / 2;
  ctx.beginPath();
  ctx.moveTo(ax - ppm * 0.18, top - ppm * 1.55);
  ctx.lineTo(ax + ppm * 0.18, top - ppm * 1.55);
  ctx.lineTo(ax + ppm * 0.18, top - ppm * 1.3);
  ctx.lineTo(ax + ppm * 0.32, top - ppm * 1.3);
  ctx.lineTo(ax, top - ppm * 1.0);
  ctx.lineTo(ax - ppm * 0.32, top - ppm * 1.3);
  ctx.lineTo(ax - ppm * 0.18, top - ppm * 1.3);
  ctx.closePath();
  fillStroke(ctx, "#e33124", 3);
}

function drawSigns(ctx, view) {
  const { ppm } = view;
  ctx.font = `900 ${Math.round(ppm * 0.2)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const sign of RULES.SIGNS) {
    const x = sx(view, sign.x);
    if (x < -ppm || x > view.w + ppm) continue;
    const base = sy(view, groundY(sign.x));
    ctx.fillStyle = WOOD;
    ctx.fillRect(x - 2, base - ppm * 0.95, 4, ppm * 0.95);
    const bw = ppm * (0.32 + 0.22 * sign.text.length);
    ctx.beginPath();
    ctx.rect(x - bw / 2, base - ppm * 1.2, bw, ppm * 0.36);
    fillStroke(ctx, "#fff", 3);
    ctx.fillStyle = INK;
    ctx.fillText(sign.text, x, base - ppm * 1.02);
  }
}

// Tree trunks behind the path; their leaves are drawn on top of everything (drawBranches).
function drawTrunks(ctx, view) {
  const { ppm } = view;
  for (const branch of RULES.BRANCHES) {
    const trunkX = sx(view, branch.x + branch.width / 2 + 0.5);
    const base = sy(view, groundY(branch.x));
    const top = sy(view, groundY(branch.x) + branch.clearance + 0.5);
    ctx.beginPath();
    ctx.rect(trunkX - ppm * 0.12, top, ppm * 0.24, base - top);
    fillStroke(ctx, WOOD_DARK, 3);
  }
}

function drawBranches(ctx, view) {
  const { ppm } = view;
  for (const branch of RULES.BRANCHES) {
    const y = sy(view, groundY(branch.x) + branch.clearance);
    const x0 = sx(view, branch.x - branch.width / 2 - 0.15);
    const x1 = sx(view, branch.x + branch.width / 2 + 0.5);
    ctx.lineCap = "round";
    ctx.lineWidth = ppm * 0.12;
    ctx.strokeStyle = INK;
    line(ctx, x0, y + ppm * 0.03, x1, y - ppm * 0.08);
    ctx.lineWidth = ppm * 0.07;
    ctx.strokeStyle = WOOD_DARK;
    line(ctx, x0, y + ppm * 0.03, x1, y - ppm * 0.08);
    for (let i = 0; i < 5; i += 1) {
      const lx = x0 + (x1 - x0) * (0.1 + 0.2 * i);
      const ly = y - ppm * (0.12 + 0.12 * hash(i + 31));
      ctx.beginPath();
      ctx.arc(lx, ly, ppm * (0.2 + 0.08 * hash(i + 17)), 0, Math.PI * 2);
      fillStroke(ctx, TREE, 3);
    }
  }
}

// Two-segment leg from hip to foot, knee bending toward `facing`.
function drawLeg(ctx, hip, foot, facing, ppm, shade) {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const thigh = THIGH * ppm;
  const reach = Math.min(Math.sqrt(dx * dx + dy * dy), (THIGH + SHIN) * ppm * 0.999);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, reach / (2 * thigh))));
  // Screen y grows downward, so a knee in front is a negative rotation when facing right.
  const angle = base - bend * facing;
  const knee = { x: hip.x + Math.cos(angle) * thigh, y: hip.y + Math.sin(angle) * thigh };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y - ppm * 0.03);
  ctx.lineWidth = ppm * 0.15;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = ppm * 0.1;
  ctx.strokeStyle = shade ? "#1c1c1c" : PANTS;
  ctx.stroke();
  // Cloth shoe, toe pointing the way the bearer faces.
  ctx.beginPath();
  ctx.moveTo(foot.x - facing * ppm * 0.06, foot.y);
  ctx.lineTo(foot.x - facing * ppm * 0.06, foot.y - ppm * 0.07);
  ctx.quadraticCurveTo(foot.x + facing * ppm * 0.08, foot.y - ppm * 0.08, foot.x + facing * ppm * 0.12, foot.y);
  ctx.closePath();
  fillStroke(ctx, shade ? "#333" : "#444", 2.5);
}

// Where a bearer's parts are on screen this frame. The coffin end rests on the inner
// shoulder; the body stands just outside it, leaning out more the lower it squats.
function bearerPose(view, snap, who) {
  const { ppm } = view;
  const bearer = snap[who];
  const facing = who === "front" ? 1 : -1;
  const s = snap.rear.x;
  const board = { x: sx(view, bearer.x), y: sy(view, shoulderY(bearer.x, bearer.h, s, who)) };
  const { crouch, stand } = RULES.SHOULDER_HEIGHT;
  const squat = Math.max(0, Math.min(1, (stand - bearer.h) / (stand - crouch)));
  const lean = squat * 0.35;
  // Stand clear of the coffin end so the head isn't hidden behind it.
  const neck = { x: board.x + facing * ppm * 0.3, y: board.y + ppm * 0.02 };
  const axis = { x: facing * Math.sin(lean), y: -Math.cos(lean) };
  const hip = { x: neck.x - axis.x * TORSO * ppm, y: neck.y - axis.y * TORSO * ppm };
  const head = { x: neck.x + axis.x * ppm * 0.21 + facing * ppm * 0.03, y: neck.y + axis.y * ppm * 0.21 };
  return { bearer, facing, s, board, neck, hip, head, axis, squat };
}

// Legs and torso, drawn before the coffin.
function drawBearer(ctx, view, snap, who) {
  const { ppm } = view;
  const pose = bearerPose(view, snap, who);
  const { bearer, facing, s, hip, neck, axis } = pose;
  const walking = walkFactor(s);
  // Shoulders above the pose's height (mid-jump): the feet leave the ground by that much.
  const lift = Math.max(0, bearer.h - RULES.SHOULDER_HEIGHT[bearer.pose]) * ppm;
  const phase = walkPhase(s) * Math.PI + (who === "front" ? Math.PI / 2 : 0);
  const hipWorldX = bearer.x + (hip.x - pose.board.x) / ppm;

  // Far leg first (shaded), then the near leg.
  for (let leg = 1; leg >= 0; leg -= 1) {
    const p = phase + leg * Math.PI;
    const footWorldX = hipWorldX + Math.sin(p) * STRIDE_HALF * walking;
    const step = Math.max(0, Math.cos(p)) * 0.06 * walking * ppm;
    const foot = { x: sx(view, footWorldX), y: sy(view, groundY(footWorldX)) - step - lift };
    drawLeg(ctx, hip, foot, facing, ppm, leg === 1);
  }

  // Jacket: a tapered block from hips to shoulders, with a belt and a collar.
  const px = -axis.y;
  const py = axis.x;
  const top = ppm * 0.14;
  const bottom = ppm * 0.12;
  ctx.beginPath();
  ctx.moveTo(hip.x - px * bottom, hip.y - py * bottom);
  ctx.lineTo(hip.x + px * bottom, hip.y + py * bottom);
  ctx.lineTo(neck.x + px * top, neck.y + py * top);
  ctx.quadraticCurveTo(neck.x + axis.x * ppm * 0.06, neck.y + axis.y * ppm * 0.06, neck.x - px * top, neck.y - py * top);
  ctx.closePath();
  ctx.lineJoin = "round";
  fillStroke(ctx, SHIRT[who], 3);
  const belt = { x: hip.x + axis.x * ppm * 0.07, y: hip.y + axis.y * ppm * 0.07 };
  ctx.lineWidth = ppm * 0.04;
  ctx.strokeStyle = HEADBAND;
  line(ctx, belt.x - px * bottom * 1.02, belt.y - py * bottom * 1.02, belt.x + px * bottom * 1.02, belt.y + py * bottom * 1.02);
  // Buttons down the front edge.
  ctx.fillStyle = HEADBAND;
  for (let i = 1; i <= 2; i += 1) {
    const f = 0.3 + i * 0.22;
    ctx.beginPath();
    ctx.arc(hip.x + (neck.x - hip.x) * f + facing * px * top * 0.55 * facing, hip.y + (neck.y - hip.y) * f, ppm * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Head beside the coffin end, looking outward. Drawn after the coffin.
function drawHead(ctx, view, snap, who) {
  const { ppm } = view;
  const pose = bearerPose(view, snap, who);
  const { facing, head, neck, bearer } = pose;
  const r = ppm * 0.2;
  const jumping = bearer.h > RULES.SHOULDER_HEIGHT[bearer.pose] + 0.05;

  // Neck.
  ctx.lineCap = "round";
  ctx.lineWidth = ppm * 0.1;
  ctx.strokeStyle = INK;
  line(ctx, neck.x, neck.y, head.x - facing * r * 0.1, head.y + r * 0.6);
  ctx.lineWidth = ppm * 0.06;
  ctx.strokeStyle = SKIN;
  line(ctx, neck.x, neck.y, head.x - facing * r * 0.1, head.y + r * 0.6);

  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  fillStroke(ctx, SKIN, 3);
  // Hair over the back and top of the head.
  ctx.beginPath();
  if (facing > 0) ctx.arc(head.x, head.y, r, Math.PI * 0.62, Math.PI * 1.62);
  else ctx.arc(head.x, head.y, r, Math.PI * 1.38, Math.PI * 2.38);
  ctx.quadraticCurveTo(head.x - facing * r * 0.1, head.y - r * 0.2, head.x - facing * r * 0.62, head.y + r * 0.78);
  ctx.closePath();
  fillStroke(ctx, "#2a1f17", 2);
  // Ear in front of the hair.
  ctx.beginPath();
  ctx.arc(head.x - facing * r * 0.18, head.y + r * 0.12, r * 0.18, 0, Math.PI * 2);
  fillStroke(ctx, SKIN, 2);

  // White mourning headband with two tails fluttering behind.
  ctx.lineCap = "butt";
  ctx.lineWidth = r * 0.32;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 0.93, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = HEADBAND;
  ctx.stroke();
  const knot = { x: head.x - facing * r * 0.85, y: head.y - r * 0.5 };
  const sway = Math.sin(snap.t / 110 + (who === "front" ? 1.3 : 0));
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i += 1) {
    const end = { x: knot.x - facing * r * (1.1 + 0.25 * i), y: knot.y + r * (0.15 + 0.45 * i) + sway * r * 0.25 };
    ctx.lineWidth = r * 0.26;
    ctx.strokeStyle = INK;
    line(ctx, knot.x, knot.y, end.x, end.y);
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = HEADBAND;
    line(ctx, knot.x, knot.y, end.x, end.y);
  }

  // Face on the outward side.
  const eye = { x: head.x + facing * r * 0.45, y: head.y + r * 0.02 };
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  if (pose.squat > 0.7 && !jumping) {
    // Squeezed shut with effort.
    line(ctx, eye.x - r * 0.14, eye.y - r * 0.08, eye.x + r * 0.1, eye.y);
    line(ctx, eye.x + r * 0.1, eye.y, eye.x - r * 0.14, eye.y + r * 0.08);
  } else {
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, r * 0.09, r * (jumping ? 0.16 : 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eyebrow, raised when jumping, knitted when crouching.
  const browLift = jumping ? -r * 0.12 : 0;
  const browTilt = pose.squat > 0.7 ? r * 0.1 : 0;
  line(ctx, eye.x - facing * r * 0.12, eye.y - r * 0.24 + browLift - browTilt, eye.x + facing * r * 0.16, eye.y - r * 0.24 + browLift + browTilt);
  // Nose sticking out past the outline.
  ctx.beginPath();
  ctx.arc(head.x + facing * r * 0.95, head.y + r * 0.2, r * 0.14, 0, Math.PI * 2);
  fillStroke(ctx, SKIN, 2);
  // Mouth.
  const mouth = { x: head.x + facing * r * 0.55, y: head.y + r * 0.55 };
  if (jumping) {
    ctx.beginPath();
    ctx.ellipse(mouth.x, mouth.y, r * 0.12, r * 0.15, 0, 0, Math.PI * 2);
    fillStroke(ctx, "#7a1f1f", 2);
  } else if (pose.squat > 0.7) {
    // Gritted teeth and a sweat drop.
    ctx.beginPath();
    ctx.rect(mouth.x - r * 0.18, mouth.y - r * 0.07, r * 0.36, r * 0.14);
    fillStroke(ctx, "#fff", 2);
    line(ctx, mouth.x, mouth.y - r * 0.07, mouth.x, mouth.y + r * 0.07);
    ctx.beginPath();
    const drop = { x: head.x - facing * r * 0.2, y: head.y - r * 1.05 + ((snap.t / 8) % (r * 0.6)) };
    ctx.moveTo(drop.x, drop.y - r * 0.18);
    ctx.quadraticCurveTo(drop.x + r * 0.12, drop.y, drop.x, drop.y + r * 0.08);
    ctx.quadraticCurveTo(drop.x - r * 0.12, drop.y, drop.x, drop.y - r * 0.18);
    fillStroke(ctx, "#8fd3ff", 1.5);
  } else {
    ctx.beginPath();
    ctx.arc(mouth.x, mouth.y - r * 0.12, r * 0.16, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
  }
}

// Both arms reach up to grip the underside of the coffin end; drawn after the coffin.
function drawArms(ctx, view, snap, who) {
  const { ppm } = view;
  const pose = bearerPose(view, snap, who);
  const { facing, neck, board, axis } = pose;
  const shoulder = { x: neck.x - axis.x * ppm * 0.05, y: neck.y - axis.y * ppm * 0.05 };
  for (let arm = 0; arm < 2; arm += 1) {
    const hand = { x: board.x + facing * ppm * (0.1 - arm * 0.1), y: board.y + ppm * 0.06 };
    const elbow = { x: shoulder.x - facing * ppm * (0.02 + arm * 0.05), y: shoulder.y + ppm * 0.16 };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.lineWidth = ppm * 0.11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = ppm * 0.065;
    ctx.strokeStyle = SHIRT[who];
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, ppm * 0.05, 0, Math.PI * 2);
    fillStroke(ctx, SKIN, 2.5);
  }
}

// Coffin in its own frame: x along the board (front = +x), y up, origin at the board centre.
function coffinPath(ctx, ppm, top) {
  const half = RULES.COFFIN_HALF * ppm;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  // Head end (front) is taller than the foot end, like a traditional coffin.
  ctx.lineTo(half + ppm * 0.04, -top * 1.25);
  ctx.lineTo(-half - ppm * 0.03, -top);
  ctx.closePath();
}

function withCoffin(ctx, view, coffin, draw) {
  ctx.save();
  ctx.translate(sx(view, coffin.x), sy(view, coffin.y));
  ctx.rotate(-coffin.angle);
  draw();
  ctx.restore();
}

// Back panel, end walls and floor: everything behind the body.
function drawCoffinBack(ctx, view, coffin) {
  const { ppm } = view;
  const wall = RULES.WALL_HEIGHT * ppm;
  const half = RULES.COFFIN_HALF * ppm;
  withCoffin(ctx, view, coffin, () => {
    coffinPath(ctx, ppm, wall * 1.9);
    fillStroke(ctx, WOOD_DARK, 4);
    // Lid propped open behind, so it reads as an open coffin.
    ctx.beginPath();
    ctx.moveTo(-half * 0.9, -wall * 1.9);
    ctx.lineTo(half * 0.95, -wall * 2.35);
    ctx.lineTo(half * 0.95, -wall * 2.0);
    ctx.lineTo(-half * 0.9, -wall * 1.65);
    ctx.closePath();
    fillStroke(ctx, WOOD, 3);
    // Floor plank.
    ctx.beginPath();
    ctx.rect(-half - ppm * 0.05, -ppm * 0.02, half * 2 + ppm * 0.1, ppm * 0.12);
    fillStroke(ctx, WOOD, 3);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = WOOD_DARK;
    for (let i = -2; i <= 2; i += 1) line(ctx, i * half * 0.38, ppm * 0.01, i * half * 0.38 + ppm * 0.12, ppm * 0.08);
    // End walls, the ones the body actually bumps into.
    ctx.beginPath();
    ctx.rect(-half - ppm * 0.06, -wall * 1.9, ppm * 0.11, wall * 1.9);
    fillStroke(ctx, WOOD_LIGHT, 4);
    ctx.beginPath();
    ctx.rect(half - ppm * 0.05, -wall * 2.3, ppm * 0.11, wall * 2.3);
    fillStroke(ctx, WOOD_LIGHT, 4);
  });
}

// Low front rail: in front of the body, so it reads as lying inside a box.
function drawCoffinFront(ctx, view, coffin) {
  const { ppm } = view;
  const half = RULES.COFFIN_HALF * ppm;
  const rail = RULES.WALL_HEIGHT * ppm * 0.15;
  withCoffin(ctx, view, coffin, () => {
    ctx.beginPath();
    ctx.rect(-half - ppm * 0.06, -rail, half * 2 + ppm * 0.12, rail + ppm * 0.12);
    fillStroke(ctx, WOOD_LIGHT, 4);
    // Brass corner caps.
    ctx.fillStyle = "#d9a441";
    for (const x of [-half - ppm * 0.06, half - ppm * 0.04]) {
      ctx.beginPath();
      ctx.rect(x, -rail, ppm * 0.1, rail + ppm * 0.12);
      fillStroke(ctx, "#d9a441", 3);
    }
    // A paper 奠 seal on the side.
    ctx.beginPath();
    ctx.arc(0, ppm * 0.03, ppm * 0.085, 0, Math.PI * 2);
    fillStroke(ctx, "#fff", 2);
    ctx.fillStyle = INK;
    ctx.font = `900 ${Math.round(ppm * 0.11)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("奠", 0, ppm * 0.035);
  });
}

function drawBody(ctx, view, body, coffin, t) {
  const { ppm } = view;
  const half = RULES.BODY_HALF * ppm;
  // Height above the board. The walking bob lifts the body for an instant every step, so
  // only a clear gap counts as flying; otherwise the arms would flicker.
  const lift = (body.x - coffin.x) * -Math.sin(coffin.angle) + (body.y - coffin.y) * Math.cos(coffin.angle);
  const flying = lift > 0.12;
  ctx.save();
  ctx.translate(sx(view, body.x), sy(view, body.y));
  ctx.rotate(-body.angle);

  // Arms and legs flail when airborne.
  if (flying) {
    const flap = Math.sin(t / 60) * 0.6;
    ctx.lineCap = "round";
    ctx.lineWidth = ppm * 0.07;
    ctx.strokeStyle = INK;
    line(ctx, half * 0.35, -ppm * 0.14, half * 0.35 + Math.cos(-1.2 + flap) * ppm * 0.3, -ppm * 0.14 + Math.sin(-1.2 + flap) * ppm * 0.3);
    line(ctx, half * 0.1, -ppm * 0.12, half * 0.1 + Math.cos(-1.9 - flap) * ppm * 0.3, -ppm * 0.12 + Math.sin(-1.9 - flap) * ppm * 0.3);
    line(ctx, -half * 0.7, -ppm * 0.08, -half * 0.7 + Math.cos(-2.4 + flap) * ppm * 0.28, -ppm * 0.08 + Math.sin(-2.4 + flap) * ppm * 0.28);
  }

  // Wrapped body on its back, head toward the front.
  ctx.beginPath();
  ctx.moveTo(-half, -ppm * 0.02);
  ctx.quadraticCurveTo(-half * 0.2, -ppm * 0.3, half - ppm * 0.2, -ppm * 0.08);
  ctx.lineTo(half - ppm * 0.2, -ppm * 0.01);
  ctx.lineTo(-half, -ppm * 0.01);
  ctx.closePath();
  fillStroke(ctx, SHROUD, 3);
  // Wrapping bands.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#b9b2a0";
  for (let i = 1; i <= 3; i += 1) {
    const x = -half + (half * 1.6 * i) / 4;
    line(ctx, x, -ppm * 0.02, x + ppm * 0.05, -ppm * 0.2);
  }
  // Hands folded on the chest.
  if (!flying) {
    ctx.beginPath();
    ctx.arc(half * 0.25, -ppm * 0.22, ppm * 0.05, 0, Math.PI * 2);
    fillStroke(ctx, SKIN, 2);
  }

  const head = { x: half - ppm * 0.1, y: -ppm * 0.12 };
  ctx.beginPath();
  ctx.arc(head.x, head.y, ppm * 0.12, 0, Math.PI * 2);
  fillStroke(ctx, SKIN, 3);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  if (flying) {
    // Wide-eyed and screaming.
    ctx.beginPath();
    ctx.arc(head.x - ppm * 0.02, head.y - ppm * 0.04, ppm * 0.025, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x + ppm * 0.05, head.y + ppm * 0.03, ppm * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  } else {
    line(ctx, head.x - ppm * 0.05, head.y - ppm * 0.05, head.x + ppm * 0.01, head.y - ppm * 0.05);
  }
  ctx.restore();
}

// Paper money drifting across the screen, a little detail that keeps the frame moving.
function drawPaperMoney(ctx, view, t) {
  const { w, h, ppm } = view;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  for (let i = 0; i < 4; i += 1) {
    const speed = 0.04 + hash(i) * 0.03;
    const x = ((hash(i + 3) * w - (t * speed) * 0.5 + view.cameraX * ppm * 0.2) % (w + 40) + w + 40) % (w + 40) - 20;
    const y = ((hash(i + 8) * h + t * speed) % (h * 0.75));
    const size = ppm * 0.07;
    const tilt = Math.sin(t / 300 + i) * 0.8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fillStyle = "#fffdf2";
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
    ctx.restore();
  }
}

// Camera follows the team, keeping it a little left of centre and easing vertically.
function drawFrame(ctx, w, h, snap, previousView) {
  const ppm = w / SCREEN_METRES;
  const teamX = (snap.rear.x + snap.front.x) / 2;
  const targetGround = groundY(teamX) * ppm;
  const groundScreen = previousView ? previousView.groundScreen + (targetGround - previousView.groundScreen) * 0.12 : targetGround;
  const view = {
    w,
    h,
    ppm,
    groundScreen,
    cameraX: teamX - SCREEN_METRES * 0.4,
    baseY: h * 0.7 + groundScreen
  };

  drawSky(ctx, view);
  drawHills(ctx, view, 0.25, HILL_FAR, 1.6, 1);
  drawHills(ctx, view, 0.5, HILL_NEAR, 0.9, 4);
  drawGraveyard(ctx, view);
  drawTrunks(ctx, view);
  drawGround(ctx, view);
  drawSigns(ctx, view);
  drawPit(ctx, view);
  drawBearer(ctx, view, snap, "rear");
  drawCoffinBack(ctx, view, snap.coffin);
  drawBody(ctx, view, snap.body, snap.coffin, snap.t);
  drawCoffinFront(ctx, view, snap.coffin);
  drawBearer(ctx, view, snap, "front");
  drawHead(ctx, view, snap, "rear");
  drawHead(ctx, view, snap, "front");
  drawArms(ctx, view, snap, "rear");
  drawArms(ctx, view, snap, "front");
  drawBranches(ctx, view);
  drawPaperMoney(ctx, view, snap.t);
  return view;
}

module.exports = {
  drawFrame
};
