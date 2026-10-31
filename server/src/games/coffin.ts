import type { GameDefinition, Judgement, RoleContext, Submission } from "./types.js";

// 双人抬棺: two players carry a coffin together, one at the front and one at the rear, and
// tip the body into a pit at the end of the track. Cooperative: they win or lose together.
//
// The owner's phone runs the physics (miniprogram/pages/coffin/physics.js) and is the only
// one whose submission counts. It submits score = milliseconds until the match ended and
// trace = [outcome, reason, blame] using the codes below. The guest submits too, so the
// match settles without waiting, but its numbers are ignored.
//
// The server can't re-run the physics, so a modified owner client can claim any win that
// is not faster than MIN_CLEAR_MS. Same trust level as every other score for now.
const DURATION_SECONDS = 27;
// The team needs about 21 s just to walk to the pit; nothing real finishes sooner.
const MIN_CLEAR_MS = 20000;

export const COFFIN_REASONS = { pit: 1, thrown: 2, tipped: 3, timeout: 4, absent: 5, branch: 6 } as const;
export const COFFIN_BLAME = { none: 0, front: 1, rear: 2 } as const;

const winTalks = [
  "棺材板都没晃一下，这俩是职业的。",
  "一路稳如老狗，入土为安。",
  "配合这么默契，殡葬行业缺你俩。"
];

const loseTalks: Record<number, string[]> = {
  [COFFIN_REASONS.thrown]: ["起太猛，人直接飞了。", "这一抬，抬出了蹦床的效果。"],
  [COFFIN_REASONS.tipped]: ["棺材歪成滑梯，人顺着溜下去了。", "倾斜角度很有想法，人很没办法。"],
  [COFFIN_REASONS.timeout]: ["磨磨蹭蹭，天都黑了还没下葬。", "走到坑边就不会倒了？"],
  [COFFIN_REASONS.absent]: ["前面那位半路跑了。"],
  [COFFIN_REASONS.branch]: ["树枝都看见了，你俩没看见。", "低头这么简单的事，愣是没做到。"]
};

const blameTalks: Record<number, string> = {
  [COFFIN_BLAME.front]: "锅归前面那位。",
  [COFFIN_BLAME.rear]: "锅归后面那位。"
};

function pick(items: string[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function codeIn(value: number | undefined, codes: Record<string, number>, fallback: number) {
  return Object.values(codes).includes(value as number) ? (value as number) : fallback;
}

export const coffinGame: GameDefinition = {
  id: "coffin",
  durationSeconds: DURATION_SECONDS,
  // Owner carries the front, guest the rear.
  roles: ["front", "rear"],
  betterScore: "lower",
  cooperative: true,
  normalizeSubmission(raw) {
    const trace = Array.isArray(raw.trace) ? raw.trace : [];
    const atMs = Math.max(0, Math.min(Math.round(Number(raw.score) || 0), DURATION_SECONDS * 1000));
    let reason = codeIn(trace[1], COFFIN_REASONS, COFFIN_REASONS.timeout);
    const blame = codeIn(trace[2], COFFIN_BLAME, COFFIN_BLAME.none);
    let won = trace[0] === 1 && reason === COFFIN_REASONS.pit;
    if (won && atMs < MIN_CLEAR_MS) {
      won = false;
      reason = COFFIN_REASONS.timeout;
    }
    if (!won && reason === COFFIN_REASONS.pit) reason = COFFIN_REASONS.timeout;
    return { score: atMs, trace: [won ? 1 : 0, reason, blame] };
  },
  judge(owner: Submission | undefined, _guest, _roles: RoleContext): Judgement {
    const trace = owner?.trace ?? [0, COFFIN_REASONS.absent, COFFIN_BLAME.none];
    const won = trace[0] === 1;
    const score = owner?.score ?? 0;
    return {
      ownerScore: score,
      guestScore: score,
      winner: null,
      team: won ? "win" : "lose",
      detail: { atMs: score, reason: trace[1], blame: trace[2] }
    };
  },
  trashTalk(judgement) {
    if (judgement.team === "win") return pick(winTalks);
    const detail = judgement.detail ?? {};
    const line = pick(loseTalks[detail.reason] ?? loseTalks[COFFIN_REASONS.timeout]);
    return line + (blameTalks[detail.blame] ?? "");
  },
  rankings: {
    wins: { column: "wins", direction: "DESC" },
    bestScore: { column: "best_score", direction: "ASC" }
  }
};
