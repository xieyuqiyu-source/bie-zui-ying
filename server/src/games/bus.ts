import type { GameDefinition, Judgement, RoleContext, Submission } from "./types.js";

// 追赶巴士: one player drives the bus by spinning a wheel, the other runs after it by
// alternating left/right taps. The runner wins by reaching the door before time runs out.
//
// Each client samples its own cumulative distance (metres) every SAMPLE_SECONDS and submits
// the samples as `trace`. Keep these numbers in sync with miniprogram/pages/bus/rules.js.
const DURATION_SECONDS = 15;
const SAMPLE_SECONDS = 0.5;
const SAMPLE_COUNT = DURATION_SECONDS / SAMPLE_SECONDS;
const START_GAP_METRES = 12;
// The server sees positions only every half second, so allow a little slack at the door.
const CATCH_TOLERANCE_METRES = 1.2;
const BUS_MIN_SPEED = 0.5;
const BUS_MAX_SPEED = 3;
const RUNNER_MAX_SPEED = 6;
// Slack for clock jitter between samples.
const SPEED_TOLERANCE = 1.05;

type Role = "bus" | "runner";

const winTalks: Record<Role, string[]> = {
  bus: [
    "师傅一脚油门，你的尊严没赶上车。",
    "车门关了，嘴硬留在了站台。",
    "这班车不等人，尤其不等你。",
    "方向盘转出了火星子，兄弟只能看尾气。"
  ],
  runner: [
    "门缝里挤上车，师傅都服了。",
    "两条腿跑赢四个轮，兄弟圈新传说。",
    "师傅：开这么多年，没见过这么能追的。",
    "车门还没关严，你已经坐下了。"
  ]
};

function pick(items: string[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function isRole(value: string | undefined): value is Role {
  return value === "bus" || value === "runner";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

// Re-integrate the trace with every step clamped to what the role can physically do.
function clampTrace(trace: number[], role: Role) {
  const maxStep = (role === "bus" ? BUS_MAX_SPEED : RUNNER_MAX_SPEED) * SAMPLE_SECONDS * SPEED_TOLERANCE;
  // A bus never stops; one that reports less (e.g. app in background) idles along.
  const minStep = role === "bus" ? BUS_MIN_SPEED * SAMPLE_SECONDS : 0;
  const result: number[] = [];
  let previousRaw = 0;
  let total = 0;
  for (const raw of trace.slice(0, SAMPLE_COUNT)) {
    const value = Number.isFinite(raw) ? raw : previousRaw;
    const step = Math.max(minStep, Math.min(maxStep, value - previousRaw));
    previousRaw = value;
    total += step;
    result.push(round1(total));
  }
  return result;
}

// Positions at every sample. A trace that stops early holds its last value, so cutting
// your own trace short can only hurt you.
function fullTrace(submission: Submission | undefined, role: Role) {
  const trace = submission?.trace ?? [];
  const result: number[] = [];
  let last = 0;
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    if (i < trace.length) {
      last = trace[i];
    } else if (role === "bus" && trace.length > 0) {
      // A bus that submitted early (because it saw the runner board) keeps idling.
      last += BUS_MIN_SPEED * SAMPLE_SECONDS;
    }
    result.push(last);
  }
  return result;
}

function bySide(roles: RoleContext, owner: Submission | undefined, guest: Submission | undefined) {
  const ownerIsBus = roles.owner !== "runner";
  return ownerIsBus
    ? { bus: owner, runner: guest, busSide: "owner" as const, runnerSide: "guest" as const }
    : { bus: guest, runner: owner, busSide: "guest" as const, runnerSide: "owner" as const };
}

function botTrace(role: Role) {
  const trace: number[] = [];
  let total = 0;
  let stumbleSamples = 0;
  const phase = Math.random() * Math.PI * 2;
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    let speed: number;
    if (role === "bus") {
      // A middling driver: around 2.4 m/s, surging and sagging as it loses rhythm.
      speed = 2.4 + 0.5 * Math.sin(phase + i / 3) + (Math.random() - 0.5) * 0.4;
      speed = Math.max(BUS_MIN_SPEED, Math.min(BUS_MAX_SPEED, speed));
    } else if (stumbleSamples > 0) {
      stumbleSamples -= 1;
      speed = 1;
    } else {
      // Around 7 steps a second, and now and then it hits the same foot twice and kneels.
      speed = 3.4 + (Math.random() - 0.5) * 0.8;
      if (Math.random() < 0.08) stumbleSamples = 1;
    }
    total += speed * SAMPLE_SECONDS;
    trace.push(round1(total));
  }
  return trace;
}

export const busGame: GameDefinition = {
  id: "bus",
  durationSeconds: DURATION_SECONDS,
  roles: ["bus", "runner"],
  betterScore: "higher",
  normalizeSubmission(raw, role) {
    const trace = clampTrace(Array.isArray(raw.trace) ? raw.trace : [], isRole(role) ? role : "runner");
    // Score is distance covered in decimetres, so it fits the INT score columns.
    return { score: Math.round((trace[trace.length - 1] ?? 0) * 10), trace };
  },
  botSubmission(role) {
    const trace = botTrace(isRole(role) ? role : "bus");
    return { score: Math.round(trace[trace.length - 1] * 10), trace };
  },
  judge(owner, guest, roles): Judgement {
    const side = bySide(roles, owner, guest);
    const bus = fullTrace(side.bus, "bus");
    const runner = fullTrace(side.runner, "runner");

    let previousGap = START_GAP_METRES;
    let catchAtMs: number | undefined;
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const gap = START_GAP_METRES + bus[i] - runner[i];
      if (gap <= CATCH_TOLERANCE_METRES) {
        // Interpolate within the half second where the gap crossed the line.
        const fraction = previousGap === gap ? 1 : (previousGap - CATCH_TOLERANCE_METRES) / (previousGap - gap);
        catchAtMs = Math.round((i + Math.max(0, Math.min(1, fraction))) * SAMPLE_SECONDS * 1000);
        break;
      }
      previousGap = gap;
    }

    const busScore = side.bus?.score ?? 0;
    const runnerScore = side.runner?.score ?? 0;
    const winnerSide = catchAtMs !== undefined ? side.runnerSide : side.busSide;
    const lastIndex = SAMPLE_COUNT - 1;
    const detail: Record<string, number> = {
      finalGapDm: Math.round(Math.max(0, START_GAP_METRES + bus[lastIndex] - runner[lastIndex]) * 10)
    };
    if (catchAtMs !== undefined) detail.catchAtMs = catchAtMs;

    return {
      ownerScore: side.busSide === "owner" ? busScore : runnerScore,
      guestScore: side.busSide === "guest" ? busScore : runnerScore,
      winner: winnerSide,
      detail
    };
  },
  trashTalk(judgement, roles) {
    const winnerRole = judgement.winner === "owner" ? roles.owner : roles.guest;
    return pick(winTalks[isRole(winnerRole) ? winnerRole : "bus"]);
  },
  rankings: {
    wins: { column: "wins", direction: "DESC" }
  }
};
