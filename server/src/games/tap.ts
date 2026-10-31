import type { GameDefinition } from "./types.js";

const MAX_REASONABLE_SCORE = 180;

export const tapGame: GameDefinition = {
  id: "tap",
  durationSeconds: 10,
  betterScore: "higher",
  normalizeSubmission(raw) {
    return { score: Math.max(0, Math.min(Math.floor(raw.score), MAX_REASONABLE_SCORE)) };
  },
  botSubmission() {
    const botBase = 58 + Math.floor(Math.random() * 42);
    const swing = Math.floor(Math.random() * 19) - 9;
    return { score: Math.max(30, Math.min(MAX_REASONABLE_SCORE, botBase + swing)) };
  },
  judge(owner, guest) {
    // A missing score counts as 0.
    const ownerScore = owner?.score ?? 0;
    const guestScore = guest?.score ?? 0;
    const winner = ownerScore > guestScore ? "owner" : guestScore > ownerScore ? "guest" : null;
    return { ownerScore, guestScore, winner };
  },
  rankings: {
    wins: { column: "wins", direction: "DESC" },
    streak: { column: "current_streak", direction: "DESC" },
    bestScore: { column: "best_score", direction: "DESC" }
  }
};
