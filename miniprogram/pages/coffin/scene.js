// Draws one frame of 双人抬棺 on a 2d canvas. Pure drawing: all game state comes in `snap`.
const { groundY, RULES } = require("./physics.js");

const INK = "#111";
const SKY = "#fff3c4";
const DIRT = "#c9a36b";
const GRASS = "#6aa84f";
const WOOD = "#7a4a2a";
const WOOD_DARK = "#4e2e19";
const SHROUD = "#f4f1e8";
const SKIN = "#f2c9a0";
const SHIRT = { rear: "#2f6fed", front: "#e33124" };
const SCREEN_METRES = 7;

function poseBend(h) {
  // 0 = standing straight, 1 = full crouch.
  const { crouch, stand } = RULES.SHOULDER_HEIGHT;
  return Math.max(0, Math.min(1, (stand - h) / (stand - crouch)));
}

function drawGround(ctx, view) {
  const { w, h, ppm, cameraX, baseY } = view;
  const left = cameraX - 1;
  const right = cameraX + w / ppm + 1;
  const toY = (y) => baseY - y * ppm;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = left; x <= right; x += 0.05) {
    ctx.lineTo((x - cameraX) * ppm, toY(groundY(x)));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = DIRT;
  ctx.fill();

  ctx.beginPath();
  let started = false;
  for (let x = left; x <= right; x += 0.05) {
    const inPit = x >= RULES.PIT_X && x <= RULES.PIT_X + RULES.PIT_WIDTH;
    const sx = (x - cameraX) * ppm;
    if (inPit) {
      started = false;
      continue;
    }
    if (!started) ctx.moveTo(sx, toY(groundY(x)));
    else ctx.lineTo(sx, toY(groundY(x)));
    started = true;
  }
  ctx.lineWidth = 6;
  ctx.strokeStyle = GRASS;
  ctx.stroke();

  // Pit outline and a sign.
  const px = (RULES.PIT_X - cameraX) * ppm;
  const pw = RULES.PIT_WIDTH * ppm;
  ctx.fillStyle = "#3b2a1a";
  ctx.fillRect(px, toY(0), pw, RULES.PIT_DEPTH * ppm);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(px, toY(0), pw, RULES.PIT_DEPTH * ppm);
  const signX = px + pw + 0.5 * ppm;
  ctx.fillStyle = WOOD;
  ctx.fillRect(signX - 2, toY(0) - 1.2 * ppm, 4, 1.2 * ppm);
  ctx.fillStyle = "#fff";
  ctx.fillRect(signX - 0.45 * ppm, toY(0) - 1.35 * ppm, 0.9 * ppm, 0.4 * ppm);
  ctx.strokeRect(signX - 0.45 * ppm, toY(0) - 1.35 * ppm, 0.9 * ppm, 0.4 * ppm);
  ctx.fillStyle = INK;
  ctx.font = `900 ${Math.round(0.22 * ppm)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("坑在这", signX, toY(0) - 1.15 * ppm);
}

function drawBearer(ctx, view, bearer, who, shoulderY) {
  const { ppm, cameraX, baseY } = view;
  const x = (bearer.x - cameraX) * ppm;
  const footY = baseY - groundY(bearer.x) * ppm;
  const sy = baseY - shoulderY * ppm;
  const bend = poseBend(bearer.h);
  const hipY = sy + (footY - sy) * 0.42;
  // Knees stick out more the lower the crouch.
  const kneeX = x + (who === "front" ? 1 : -1) * (0.05 + bend * 0.3) * ppm;
  const kneeY = hipY + (footY - hipY) * 0.5;
  const airborne = bearer.jumping ? 0.12 * ppm : 0;

  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.09 * ppm;
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(x, footY - airborne);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, sy + 0.05 * ppm);
  ctx.lineWidth = 0.22 * ppm;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 0.16 * ppm;
  ctx.strokeStyle = SHIRT[who];
  ctx.stroke();

  // Head sits beside the coffin, a bit outward.
  const headX = x + (who === "front" ? 0.18 : -0.18) * ppm;
  ctx.beginPath();
  ctx.arc(headX, sy - 0.12 * ppm, 0.13 * ppm, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawCoffin(ctx, view, coffin) {
  const { ppm, cameraX, baseY } = view;
  const half = RULES.COFFIN_HALF * ppm;
  const wall = RULES.WALL_HEIGHT * ppm;
  ctx.save();
  ctx.translate((coffin.x - cameraX) * ppm, baseY - coffin.y * ppm);
  ctx.rotate(-coffin.angle);
  ctx.fillStyle = WOOD;
  ctx.fillRect(-half, -0.05 * ppm, half * 2, 0.1 * ppm);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(-half, -wall, 0.08 * ppm, wall);
  ctx.fillRect(half - 0.08 * ppm, -wall, 0.08 * ppm, wall);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeRect(-half, -0.05 * ppm, half * 2, 0.1 * ppm);
  ctx.strokeRect(-half, -wall, 0.08 * ppm, wall);
  ctx.strokeRect(half - 0.08 * ppm, -wall, 0.08 * ppm, wall);
  ctx.restore();
}

function drawBody(ctx, view, body) {
  const { ppm, cameraX, baseY } = view;
  const half = RULES.BODY_HALF * ppm;
  ctx.save();
  ctx.translate((body.x - cameraX) * ppm, baseY - body.y * ppm);
  ctx.rotate(-body.angle);
  // Wrapped body lying on its back, head toward the front.
  ctx.beginPath();
  ctx.moveTo(-half, -0.05 * ppm);
  ctx.quadraticCurveTo(0, -0.26 * ppm, half - 0.18 * ppm, -0.08 * ppm);
  ctx.lineTo(half - 0.18 * ppm, -0.05 * ppm);
  ctx.lineTo(-half, -0.05 * ppm);
  ctx.closePath();
  ctx.fillStyle = SHROUD;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(half - 0.1 * ppm, -0.13 * ppm, 0.11 * ppm, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Camera follows the team, keeping it a third from the left. Returns the view for reuse.
function drawFrame(ctx, w, h, snap) {
  const ppm = w / SCREEN_METRES;
  const teamX = (snap.rear.x + snap.front.x) / 2;
  const view = {
    w,
    h,
    ppm,
    cameraX: teamX - SCREEN_METRES * 0.38,
    // Keep the ground under the team around 70% down the canvas.
    baseY: h * 0.7 + groundY(teamX) * ppm
  };
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);
  drawGround(ctx, view);
  const rearShoulder = groundY(snap.rear.x) + snap.rear.h;
  const frontShoulder = groundY(snap.front.x) + snap.front.h;
  drawBearer(ctx, view, snap.rear, "rear", rearShoulder);
  drawCoffin(ctx, view, snap.coffin);
  drawBody(ctx, view, snap.body);
  drawBearer(ctx, view, snap.front, "front", frontShoulder);
  return view;
}

module.exports = {
  drawFrame
};
