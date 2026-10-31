import type { GameDefinition } from "./types.js";

const MAX_REASONABLE_SCORE = 180;

export const tapGame: GameDefinition = {
  id: "tap",
  durationSeconds: 10,
  betterScore: "higher",
  absentScore: 0,
  normalizeScore(raw) {
    return Math.max(0, Math.min(Math.floor(raw), MAX_REASONABLE_SCORE));
  },
  compare(a, b) {
    return a - b;
  },
  botScore() {
    const botBase = 58 + Math.floor(Math.random() * 42);
    const swing = Math.floor(Math.random() * 19) - 9;
    return Math.max(30, Math.min(MAX_REASONABLE_SCORE, botBase + swing));
  },
  rankings: {
    wins: { column: "wins", direction: "DESC" },
    streak: { column: "current_streak", direction: "DESC" },
    bestScore: { column: "best_score", direction: "DESC" }
  }
};
