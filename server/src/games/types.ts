export type RankingType = "wins" | "streak" | "bestScore";

// Columns of user_game_stats a ranking may sort by. Whitelisted: they end up in ORDER BY.
export type RankingColumn = "wins" | "current_streak" | "best_streak" | "best_score";

export interface RankingSpec {
  column: RankingColumn;
  direction: "ASC" | "DESC";
}

export interface GameDefinition {
  id: string;
  durationSeconds: number;
  // "higher" for points, "lower" for things like reaction time.
  betterScore: "higher" | "lower";
  // Score recorded for a player who never submitted. Must lose to any real score
  // (0 for "higher" games; a cap value for "lower" games).
  absentScore: number;
  normalizeScore(raw: number): number;
  // > 0 when a beats b, < 0 when b beats a, 0 for a draw.
  compare(a: number, b: number): number;
  botScore(): number;
  rankings: Partial<Record<RankingType, RankingSpec>>;
}
