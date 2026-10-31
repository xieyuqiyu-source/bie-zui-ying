// Cartoon characters for 追赶巴士: the runner, the bus driver, and the little effects around
// them (sweat, dizzy stars, exhaust). Everything is drawn from shapes with a thick ink outline
// so it matches the comic style of the rest of the app.
//
// Angles for limbs are measured from straight down, positive = toward +x (the way they run).

const INK = "#111";
const SKIN = "#f6c99f";
const BLUSH = "rgba(227, 49, 36, 0.35)";
const HAIR = "#3b2414";
const SHIRT = "#ff7a2f";
const TROUSERS = "#2f4a7a";
const SHOE = "#f7f7f7";
const PACK = "#1f5a4a";
const CAP = "#1f5a4a";
const CAP_BADGE = "#f7c531";
const UNIFORM = "#d9ecf2";

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx, x, y, rx, ry, rotation) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2);
}

function fillStroke(ctx, fill, lineWidth) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// A limb drawn twice: a fat ink stroke, then the colour on top, so it gets an outline.
function limb(ctx, points, width, colour, line) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [stroke, w] of [[INK, width + line * 2], [colour, width]]) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }
}

function joint(x, y, angle, length) {
  return [x + Math.sin(angle) * length, y + Math.cos(angle) * length];
}

function star(ctx, x, y, r, rotation) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = rotation + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Drops flying off a hot head. `side` is -1 for behind (left), 1 for in front.
function drawSweat(ctx, x, y, size, time, line, side) {
  for (let i = 0; i < 3; i += 1) {
    const age = (time * 2.2 + i / 3) % 1;
    const dx = side * size * (0.3 + age * 1.1) * (i === 1 ? 1.2 : 1);
    const dy = -size * (0.6 - i * 0.35) + age * age * size * 1.4;
    const r = size * 0.16 * (1 - age * 0.4);
    ctx.globalAlpha = 1 - age;
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy - r * 1.8);
    ctx.quadraticCurveTo(x + dx + r, y + dy, x + dx, y + dy + r);
    ctx.quadraticCurveTo(x + dx - r, y + dy, x + dx, y + dy - r * 1.8);
    fillStroke(ctx, "#8fd3ff", line * 0.6);
  }
  ctx.globalAlpha = 1;
}

function drawDizzyStars(ctx, x, y, size, time, line) {
  for (let i = 0; i < 3; i += 1) {
    const a = time * 5 + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * size * 0.75;
    const sy = y + Math.sin(a) * size * 0.22;
    star(ctx, sx, sy, size * 0.2, time * 4);
    fillStroke(ctx, "#f7d84a", line * 0.7);
  }
}

// --- runner ---

function drawRunnerFace(ctx, cx, cy, r, line, mood) {
  // Eyes: dots when running, X's when kneeling.
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  const eyeY = cy - r * 0.05;
  for (const ex of [cx + r * 0.18, cx + r * 0.58]) {
    if (mood === "dizzy") {
      const e = r * 0.11;
      ctx.beginPath();
      ctx.moveTo(ex - e, eyeY - e);
      ctx.lineTo(ex + e, eyeY + e);
      ctx.moveTo(ex + e, eyeY - e);
      ctx.lineTo(ex - e, eyeY + e);
      ctx.stroke();
    } else {
      circle(ctx, ex, eyeY, r * 0.09);
      ctx.fill();
    }
  }
  // Cheek.
  ellipse(ctx, cx + r * 0.42, cy + r * 0.28, r * 0.15, r * 0.09);
  ctx.fillStyle = BLUSH;
  ctx.fill();
  // Mouth: open "O" when sprinting, wobbly when dizzy, small smile otherwise.
  ctx.lineWidth = line * 0.9;
  if (mood === "sprint") {
    ellipse(ctx, cx + r * 0.42, cy + r * 0.42, r * 0.11, r * 0.15);
    fillStroke(ctx, "#7a1f16", line * 0.8);
  } else if (mood === "dizzy") {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.22, cy + r * 0.45);
    ctx.quadraticCurveTo(cx + r * 0.32, cy + r * 0.32, cx + r * 0.42, cy + r * 0.45);
    ctx.quadraticCurveTo(cx + r * 0.52, cy + r * 0.58, cx + r * 0.62, cy + r * 0.45);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx + r * 0.42, cy + r * 0.3, r * 0.16, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

function drawRunnerHead(ctx, cx, cy, r, line, mood, time) {
  // Ear and head.
  circle(ctx, cx - r * 0.2, cy + r * 0.05, r * 0.2);
  fillStroke(ctx, SKIN, line);
  circle(ctx, cx, cy, r);
  fillStroke(ctx, SKIN, line * 1.2);
  // Hair cap with a tuft that bounces.
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.45, cx - r * 0.1, cy - r * 0.35);
  ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.2, cx - r * 0.98, cy - r * 0.05);
  ctx.closePath();
  fillStroke(ctx, HAIR, line);
  const tuft = Math.sin(time * 14) * r * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, cy - r * 0.95);
  ctx.quadraticCurveTo(cx - r * 0.35 + tuft, cy - r * 1.45, cx - r * 0.55 + tuft, cy - r * 1.25);
  ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 1.1, cx - r * 0.3, cy - r * 0.9);
  fillStroke(ctx, HAIR, line);
  drawRunnerFace(ctx, cx, cy, r, line, mood);
}

// pose: { phase, speed, kneeling, time, board } where `board` (0..1) is the hop into the door.
// x is the runner's centre, feetY the ground. s is about one body height in pixels.
function drawRunner(ctx, x, feetY, s, line, pose, doorX) {
  const { phase, speed, kneeling, time } = pose;
  const board = pose.board || 0;
  if (board >= 1) return;

  ctx.save();
  // Hop into the door: arc up and over, shrinking a little as they disappear inside.
  if (board > 0) {
    const hopX = x + (doorX - x) * board;
    const hopY = feetY - Math.sin(board * Math.PI) * s * 0.7 - board * s * 0.25;
    const scale = 1 - board * 0.35;
    ctx.translate(hopX, hopY);
    ctx.scale(scale, scale);
    ctx.translate(-x, -feetY);
  }

  const effort = Math.min(1, speed / 5);
  const thigh = s * 0.24;
  const shin = s * 0.24;
  const legW = s * 0.11;
  const bob = kneeling ? 0 : Math.abs(Math.cos(phase)) * s * 0.06 * (0.4 + effort);
  const hipY = kneeling ? feetY - s * 0.2 : feetY - thigh - shin + s * 0.02 - bob;
  const lean = kneeling ? 0.35 : 0.08 + effort * 0.22;
  const torso = s * 0.3;
  const shoulder = [x + Math.sin(lean) * torso, hipY - Math.cos(lean) * torso];
  const headR = s * 0.21;
  const head = [shoulder[0] + Math.sin(lean) * headR * 1.1, shoulder[1] - headR * 1.05];

  function leg(p, colour) {
    if (kneeling) {
      const side = p > 0 ? 1 : -1;
      const knee = [x + side * s * 0.1, feetY - s * 0.02];
      const foot = [knee[0] - s * 0.22, feetY - s * 0.02];
      limb(ctx, [[x, hipY], knee, foot], legW, colour, line);
      ellipse(ctx, foot[0] - s * 0.03, foot[1] - s * 0.01, s * 0.07, s * 0.045);
      fillStroke(ctx, SHOE, line);
      return;
    }
    const swing = 0.75 * (0.5 + effort * 0.6);
    const a = swing * Math.sin(p);
    // The knee folds while the leg swings forward.
    const bend = 1.3 * Math.max(0, Math.cos(p)) * (0.5 + effort * 0.5);
    const knee = joint(x, hipY, a, thigh);
    const foot = joint(knee[0], knee[1], a - bend, shin);
    limb(ctx, [[x, hipY], knee, foot], legW, colour, line);
    ellipse(ctx, foot[0] + s * 0.04, foot[1], s * 0.075, s * 0.045, a - bend);
    fillStroke(ctx, SHOE, line);
  }

  function arm(p, colour) {
    const upper = s * 0.16;
    const lower = s * 0.15;
    if (kneeling) {
      // Hands on knees, catching breath.
      const elbow = [shoulder[0] + s * 0.08, shoulder[1] + upper];
      const hand = [elbow[0] + s * 0.05, feetY - s * 0.06];
      limb(ctx, [shoulder, elbow, hand], s * 0.08, colour, line);
      circle(ctx, hand[0], hand[1], s * 0.045);
      fillStroke(ctx, SKIN, line * 0.8);
      return;
    }
    const a = -0.9 * (0.5 + effort * 0.6) * Math.sin(p);
    const elbow = joint(shoulder[0], shoulder[1], a, upper);
    const hand = joint(elbow[0], elbow[1], a + 1.4, lower);
    limb(ctx, [shoulder, elbow, hand], s * 0.08, colour, line);
    circle(ctx, hand[0], hand[1], s * 0.045);
    fillStroke(ctx, SKIN, line * 0.8);
  }

  // Far limbs first (darker), then body, then near limbs.
  leg(phase + Math.PI, "#243a61");
  arm(phase + Math.PI, "#d9622a");

  // Backpack bounces a beat behind the body.
  const packBob = Math.sin(phase * 2 + 0.6) * s * 0.025;
  ctx.save();
  ctx.translate((x + shoulder[0]) / 2 - s * 0.13, (hipY + shoulder[1]) / 2 + packBob);
  ctx.rotate(lean);
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(-s * 0.1, -s * 0.13, s * 0.13, s * 0.26, s * 0.04)
    : ctx.rect(-s * 0.1, -s * 0.13, s * 0.13, s * 0.26);
  fillStroke(ctx, PACK, line);
  ctx.restore();

  // Torso: a rounded trapezoid along the lean.
  limb(ctx, [[x, hipY], shoulder], s * 0.2, SHIRT, line);
  // Shorts over the hip joint.
  circle(ctx, x, hipY, s * 0.1);
  fillStroke(ctx, TROUSERS, line);

  leg(phase, TROUSERS);
  // Backpack strap over the shoulder.
  ctx.strokeStyle = PACK;
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.moveTo(shoulder[0] - s * 0.04, shoulder[1] + s * 0.02);
  ctx.lineTo(x - s * 0.02, hipY - s * 0.06);
  ctx.stroke();

  const mood = kneeling ? "dizzy" : effort > 0.6 ? "sprint" : "run";
  drawRunnerHead(ctx, head[0], head[1], headR, line, mood, time);
  arm(phase, SHIRT);

  if (kneeling) drawDizzyStars(ctx, head[0], head[1] - headR * 1.3, headR * 1.6, time, line);
  else if (effort > 0.7) drawSweat(ctx, head[0] - headR * 0.9, head[1] - headR * 0.3, headR, time, line, -1);

  ctx.restore();
}

// --- driver ---

// Drawn inside the bus's front window. `rect` is that window in pixels; the driver faces +x.
// pose: { spin, speed, time } where spin is how far the wheel has turned (radians).
function drawDriver(ctx, rect, line, pose) {
  const { spin, speed, time } = pose;
  const effort = Math.max(0, Math.min(1, (speed - 0.5) / 2.5));
  const s = rect.h;
  // He throws his whole body into each turn of the wheel.
  const sway = Math.sin(spin) * 0.18 * (0.3 + effort);
  const bounce = Math.abs(Math.sin(time * (4 + effort * 8))) * s * 0.03;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const seatX = rect.x + rect.w * 0.38;
  const seatY = rect.y + rect.h * 1.05 - bounce;
  ctx.translate(seatX, seatY);
  ctx.rotate(sway);

  // Shoulders and uniform.
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.05, s * 0.32, s * 0.3, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  fillStroke(ctx, UNIFORM, line);
  // Tie.
  ctx.beginPath();
  ctx.moveTo(s * 0.05, -s * 0.33);
  ctx.lineTo(s * 0.11, -s * 0.12);
  ctx.lineTo(s * 0.02, -s * 0.12);
  ctx.closePath();
  fillStroke(ctx, "#e33124", line * 0.6);

  // Head.
  const hx = s * 0.04;
  const hy = -s * 0.52;
  const hr = s * 0.2;
  circle(ctx, hx, hy, hr);
  fillStroke(ctx, SKIN, line);
  // Cap with a badge and a peak toward the windscreen.
  ctx.beginPath();
  ctx.moveTo(hx - hr * 1.05, hy - hr * 0.2);
  ctx.quadraticCurveTo(hx - hr * 0.9, hy - hr * 1.45, hx + hr * 0.2, hy - hr * 1.3);
  ctx.quadraticCurveTo(hx + hr * 1.05, hy - hr * 1.15, hx + hr * 1.0, hy - hr * 0.3);
  ctx.closePath();
  fillStroke(ctx, CAP, line);
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.6, hy - hr * 0.35);
  ctx.quadraticCurveTo(hx + hr * 1.5, hy - hr * 0.45, hx + hr * 1.6, hy - hr * 0.2);
  ctx.lineTo(hx + hr * 0.8, hy - hr * 0.15);
  ctx.closePath();
  fillStroke(ctx, INK, line * 0.6);
  circle(ctx, hx + hr * 0.1, hy - hr * 0.85, hr * 0.2);
  fillStroke(ctx, CAP_BADGE, line * 0.6);

  // Face: determined brow, round nose, big moustache.
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  const browTilt = effort * hr * 0.18;
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.25, hy - hr * 0.22 - browTilt);
  ctx.lineTo(hx + hr * 0.7, hy - hr * 0.12 + browTilt);
  ctx.stroke();
  circle(ctx, hx + hr * 0.5, hy + hr * 0.02, hr * 0.1);
  ctx.fill();
  circle(ctx, hx + hr * 0.95, hy + hr * 0.2, hr * 0.17);
  fillStroke(ctx, "#f0a77a", line * 0.7);
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.35, hy + hr * 0.5);
  ctx.quadraticCurveTo(hx + hr * 0.65, hy + hr * 0.25, hx + hr * 0.95, hy + hr * 0.45);
  ctx.quadraticCurveTo(hx + hr * 1.1, hy + hr * 0.7, hx + hr * 0.75, hy + hr * 0.62);
  ctx.quadraticCurveTo(hx + hr * 0.55, hy + hr * 0.75, hx + hr * 0.35, hy + hr * 0.5);
  fillStroke(ctx, HAIR, line * 0.6);

  // Arms reaching to the wheel; the hands go round with it.
  const wheelX = s * 0.42;
  const wheelY = -s * 0.2;
  const wheelR = s * 0.16;
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(seatX, seatY);
  const wx = wheelX;
  const wy = wheelY;
  // Wheel rim seen from the side: a tilted ellipse.
  ellipse(ctx, wx, wy, wheelR * 0.35, wheelR, 0.35);
  ctx.lineWidth = line * 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = line * 1.1;
  ctx.strokeStyle = "#2b2b2b";
  ctx.stroke();
  for (const offset of [0, Math.PI]) {
    const a = spin + offset;
    const hand = [wx + Math.cos(a) * wheelR * 0.3, wy + Math.sin(a) * wheelR];
    const shoulder = [Math.sin(sway) * s * 0.4 + (offset ? -s * 0.12 : s * 0.12), -s * 0.25];
    const elbow = [(shoulder[0] + hand[0]) / 2 - s * 0.02, Math.max(shoulder[1], hand[1]) + s * 0.08];
    limb(ctx, [shoulder, elbow, hand], s * 0.07, UNIFORM, line);
    circle(ctx, hand[0], hand[1], s * 0.05);
    fillStroke(ctx, SKIN, line * 0.7);
  }
  ctx.restore();

  if (effort > 0.65) {
    // Sweat flies off backward, outside the window clip so it reads at small sizes.
    const headX = seatX + Math.sin(sway) * s * 0.5 + hx;
    const headY = seatY + hy;
    drawSweat(ctx, headX - hr * 0.8, headY - hr * 0.2, hr, time, line, -1);
  }
}

// --- bus effects ---

// Exhaust puffs from the tailpipe at (x, y); denser and darker the harder he drives.
function drawExhaust(ctx, x, y, size, line, time, speed) {
  const effort = Math.max(0, Math.min(1, (speed - 0.5) / 2.5));
  const count = 4;
  for (let i = 0; i < count; i += 1) {
    const age = (time * (0.8 + effort * 1.6) + i / count) % 1;
    const px = x - age * size * (1.6 + effort * 1.5);
    const py = y - age * size * 0.7 + Math.sin(age * 6 + i) * size * 0.06;
    const r = size * (0.12 + age * (0.25 + effort * 0.25));
    ctx.globalAlpha = (1 - age) * (0.35 + effort * 0.5);
    circle(ctx, px, py, r);
    fillStroke(ctx, effort > 0.6 ? "#9a9a9a" : "#d6d6d6", line * 0.6);
  }
  ctx.globalAlpha = 1;
}

// Speed lines trailing the bus when it's flying.
function drawSpeedLines(ctx, x, top, height, size, line, time, speed) {
  const effort = Math.max(0, Math.min(1, (speed - 0.5) / 2.5));
  if (effort < 0.55) return;
  ctx.strokeStyle = "rgba(17,17,17,0.55)";
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const y = top + height * (0.25 + i * 0.25);
    const shift = ((time * 6 + i * 0.37) % 1) * size * 0.4;
    const len = size * (0.4 + effort * 0.5) * (i === 1 ? 1.3 : 1);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.2 - shift, y);
    ctx.lineTo(x - size * 0.2 - shift - len, y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

module.exports = {
  drawRunner,
  drawDriver,
  drawExhaust,
  drawSpeedLines
};
