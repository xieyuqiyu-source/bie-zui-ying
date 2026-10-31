// Draws one frame of 追赶巴士 on a 2d canvas. Pure drawing: all game state comes in `state`.
const { START_GAP } = require("../rules");
const { drawRunner, drawDriver, drawExhaust, drawSpeedLines } = require("./characters");

const INK = "#111";
const SKY = "#fff3c4";
const BUS_YELLOW = "#f7c531";
const BUS_GREEN = "#1f5a4a";
const ROAD = "#4a4a4a";
const SIDEWALK = "#e9dcc0";
const BUS_LENGTH = 6;
// Where the door sits, measured from the bus's rear.
const DOOR_OFFSET = 0.9;
const RUNNER_SCREEN_METRES = 1.6;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillStroke(ctx, fill, lineWidth) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// Deterministic pseudo-random in [0, 1) so buildings don't flicker between frames.
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function drawBuildings(ctx, view, line) {
  const { w, horizonY, ppm, cameraX } = view;
  // Far layer scrolls at 40% speed.
  const parallax = 0.4;
  const blockMetres = 4.5;
  const offset = cameraX * parallax;
  const first = Math.floor(offset / blockMetres) - 1;
  const last = first + Math.ceil(w / (blockMetres * ppm)) + 2;
  for (let i = first; i <= last; i += 1) {
    const x = (i * blockMetres - offset) * ppm;
    const bw = blockMetres * ppm * 0.92;
    const bh = (2.2 + hash(i) * 2.2) * ppm;
    const fill = hash(i + 7) > 0.5 ? "#fff" : "#f2e6c8";
    roundRect(ctx, x, horizonY - bh, bw, bh + line, line);
    fillStroke(ctx, fill, line);
    const win = ppm * 0.55;
    for (let row = 0; row < Math.floor(bh / (win * 1.8)); row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const wx = x + bw * (0.14 + col * 0.3);
        const wy = horizonY - bh + win * 0.7 + row * win * 1.8;
        roundRect(ctx, wx, wy, win, win, line * 0.5);
        fillStroke(ctx, "#bfe3e8", line * 0.6);
      }
    }
  }
}

function drawRoad(ctx, view, line) {
  const { w, horizonY, roadY, curbY, groundBottom, ppm, cameraX } = view;
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, horizonY, w, curbY - horizonY);
  ctx.fillStyle = SIDEWALK;
  ctx.fillRect(0, curbY, w, groundBottom - curbY);

  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.moveTo(0, curbY);
  ctx.lineTo(w, curbY);
  ctx.stroke();

  // Lane dashes and paving joints move with the ground, so they show speed.
  const dash = 2;
  const firstDash = Math.floor(cameraX / dash);
  ctx.fillStyle = "#fff";
  for (let i = firstDash; i <= firstDash + Math.ceil(w / (dash * ppm)) + 1; i += 1) {
    const x = (i * dash - cameraX) * ppm;
    ctx.fillRect(x, roadY - line * 3, dash * ppm * 0.5, line * 1.6);
  }
  ctx.strokeStyle = "rgba(17,17,17,0.25)";
  ctx.lineWidth = line * 0.6;
  for (let i = firstDash; i <= firstDash + Math.ceil(w / (dash * ppm)) + 1; i += 1) {
    const x = (i * dash - cameraX) * ppm;
    ctx.beginPath();
    ctx.moveTo(x, curbY);
    ctx.lineTo(x - ppm * 0.6, groundBottom);
    ctx.stroke();
  }
}

function drawWheel(ctx, cx, cy, r, line, spin) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  fillStroke(ctx, INK, line);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  fillStroke(ctx, "#ddd", line * 0.6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = line * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(spin) * r * 0.5, cy + Math.sin(spin) * r * 0.5);
  ctx.lineTo(cx - Math.cos(spin) * r * 0.5, cy - Math.sin(spin) * r * 0.5);
  ctx.stroke();
}

function drawBus(ctx, view, line, rearX, open, state) {
  const { ppm, roadY } = view;
  const len = BUS_LENGTH * ppm;
  const height = 2.3 * ppm;
  const top = roadY - height - ppm * 0.35;
  const wheelR = ppm * 0.42;
  const wheelSpin = (rearX / ppm) * 1.2;

  drawExhaust(ctx, rearX - ppm * 0.05, roadY - ppm * 0.55, ppm, line, state.time, state.busSpeed);
  drawSpeedLines(ctx, rearX, top, height, ppm * 2, line, state.time, state.busSpeed);

  // The body rocks a little at speed.
  const rock = Math.sin(state.time * 18) * ppm * 0.02 * Math.min(1, state.busSpeed / 3);
  ctx.save();
  ctx.translate(0, rock);
  roundRect(ctx, rearX, top, len, height, ppm * 0.25);
  fillStroke(ctx, BUS_YELLOW, line * 1.4);
  // White window band and green stripe.
  roundRect(ctx, rearX + ppm * 0.2, top + ppm * 0.2, len - ppm * 0.4, height * 0.42, ppm * 0.12);
  fillStroke(ctx, "#fff", line);
  ctx.fillStyle = BUS_GREEN;
  ctx.fillRect(rearX + line, top + height * 0.66, len - line * 2, ppm * 0.18);

  // The driver sits in the front pane, then the window frames go on top.
  const paneW = (len - ppm * 0.4) / 5;
  drawDriver(
    ctx,
    { x: rearX + ppm * 0.2 + paneW * 4, y: top + ppm * 0.2, w: paneW, h: height * 0.42 },
    line,
    { spin: state.driverSpin, speed: state.busSpeed, time: state.time }
  );
  ctx.strokeStyle = INK;
  ctx.lineWidth = line * 0.8;
  for (let i = 1; i < 5; i += 1) {
    const x = rearX + ppm * 0.2 + paneW * i;
    ctx.beginPath();
    ctx.moveTo(x, top + ppm * 0.2);
    ctx.lineTo(x, top + ppm * 0.2 + height * 0.42);
    ctx.stroke();
  }
  roundRect(ctx, rearX + ppm * 0.2, top + ppm * 0.2, len - ppm * 0.4, height * 0.42, ppm * 0.12);
  ctx.lineWidth = line;
  ctx.stroke();

  // Door near the rear; it slides open while the runner is close.
  const doorX = rearX + (DOOR_OFFSET - 0.45) * ppm;
  const doorW = ppm * 0.9;
  const doorTop = top + ppm * 0.25;
  const doorH = height - ppm * 0.25;
  roundRect(ctx, doorX, doorTop, doorW, doorH, ppm * 0.08);
  fillStroke(ctx, open ? "#2b2b2b" : "#bfe3e8", line);
  if (!open) {
    ctx.beginPath();
    ctx.moveTo(doorX + doorW / 2, doorTop);
    ctx.lineTo(doorX + doorW / 2, doorTop + doorH);
    ctx.stroke();
  }

  ctx.restore();
  drawWheel(ctx, rearX + ppm * 1.6, roadY - ppm * 0.3, wheelR, line, wheelSpin);
  drawWheel(ctx, rearX + len - ppm * 1.3, roadY - ppm * 0.3, wheelR, line, wheelSpin);
  return doorX + doorW / 2;
}

function drawSteeringWheel(ctx, wheel, line, angle) {
  const { cx, cy, r } = wheel;
  // Guide ring: the circle to trace for full speed.
  ctx.setLineDash([line * 2, line * 2]);
  ctx.strokeStyle = "rgba(17,17,17,0.35)";
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.2 + line * 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = BUS_GREEN;
  ctx.stroke();

  for (let i = 0; i < 3; i += 1) {
    const a = angle + (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.lineWidth = r * 0.13 + line * 2;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
    ctx.lineWidth = r * 0.13;
    ctx.strokeStyle = i === 0 ? "#e33124" : "#2b2b2b";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  fillStroke(ctx, BUS_YELLOW, line * 1.2);
}

function drawBanner(ctx, view, line, banner) {
  const { w, sceneH } = view;
  const cx = w / 2;
  const cy = sceneH * 0.36;
  const big = Math.min(w * 0.2, sceneH * 0.3);
  ctx.font = `900 ${big}px sans-serif`;
  const titleW = Math.max(ctx.measureText(banner.title).width + big * 0.8, big * 1.6);
  const titleH = big * 1.3;
  roundRect(ctx, cx - titleW / 2 + line * 3, cy - titleH / 2 + line * 3, titleW, titleH, line * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  roundRect(ctx, cx - titleW / 2, cy - titleH / 2, titleW, titleH, line * 2);
  fillStroke(ctx, "#f7d84a", line * 2);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(banner.title, cx, cy + big * 0.05);

  if (banner.sub) {
    const small = big * 0.3;
    ctx.font = `900 ${small}px sans-serif`;
    const subW = ctx.measureText(banner.sub).width + small * 1.4;
    const subH = small * 1.8;
    const subY = cy + titleH / 2 + small * 1.4;
    roundRect(ctx, cx - subW / 2, subY - subH / 2, subW, subH, line * 1.5);
    fillStroke(ctx, "#fff", line * 1.5);
    ctx.fillStyle = INK;
    ctx.fillText(banner.sub, cx, subY);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// Camera: keep the runner near the left edge and zoom out as the bus pulls away.
function computeView(w, h, state, previous) {
  const gap = START_GAP + state.busD - state.runnerD;
  const targetSpan = Math.max(10, Math.min(40, gap + 8.5));
  const span = previous ? previous.span + (targetSpan - previous.span) * 0.08 : targetSpan;
  const ppm = w / span;
  const sceneH = h * state.sceneRatio;
  const groundBottom = sceneH;
  const curbY = sceneH - Math.min(sceneH * 0.24, ppm * 2.4);
  const roadY = curbY - ppm * 0.25;
  const horizonY = roadY - Math.max(ppm * 3.2, sceneH * 0.3);
  return {
    w,
    h,
    span,
    ppm,
    sceneH,
    groundBottom,
    curbY,
    roadY,
    horizonY,
    cameraX: state.runnerD - RUNNER_SCREEN_METRES
  };
}

function drawFrame(ctx, w, h, state, previousView) {
  const view = computeView(w, h, state, previousView);
  const line = Math.max(1.5, w / 190);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, view.horizonY);
  drawBuildings(ctx, view, line);
  drawRoad(ctx, view, line);

  const doorWorld = START_GAP + state.busD;
  const rearX = (doorWorld - DOOR_OFFSET - view.cameraX) * view.ppm;
  const gap = doorWorld - state.runnerD;
  const doorCenterX = drawBus(ctx, view, line, rearX, state.boarded || gap < 2.5, state);
  drawRunner(
    ctx,
    RUNNER_SCREEN_METRES * view.ppm,
    view.curbY + view.ppm * 0.9,
    view.ppm * 1.7,
    line,
    {
      phase: state.runnerPhase,
      speed: state.runnerSpeed,
      kneeling: state.kneeling,
      time: state.time,
      board: state.boardProgress
    },
    doorCenterX
  );

  // Control area under the scene (driver only).
  if (view.sceneH < h) {
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(0, view.sceneH, w, h - view.sceneH);
    ctx.lineWidth = line * 1.5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, view.sceneH);
    ctx.lineTo(w, view.sceneH);
    ctx.stroke();
  }
  if (state.wheel) drawSteeringWheel(ctx, state.wheel, line, state.wheelAngle);
  if (state.banner) drawBanner(ctx, view, line, state.banner);

  return view;
}

module.exports = {
  drawFrame
};
