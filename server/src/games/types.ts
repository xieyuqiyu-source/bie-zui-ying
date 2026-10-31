export type RankingType = "wins" | "streak" | "bestScore";

// Columns of user_game_stats a ranking may sort by. Whitelisted: they end up in ORDER BY.
export type RankingColumn = "wins" | "current_streak" | "best_streak" | "best_score";

export interface RankingSpec {
  column: RankingColumn;
  direction: "ASC" | "DESC";
}

// What a client sends at the end of a match. Games that only need a number ignore trace.
export interface RawSubmission {
  score: number;
  trace?: number[];
}

export interface Submission {
  score: number;
  trace?: number[];
}

export interface Judgement {
  ownerScore: number;
  guestScore: number;
  winner: "owner" | "guest" | null;
  // Cooperative games only: both players win or lose together. winner is then null.
  team?: "win" | "lose";
  // Game-specific numbers for the result page, e.g. when the runner reached the door.
  detail?: Record<string, number>;
}

export interface RoleContext {
  owner?: string;
  guest?: string;
}

export interface GameDefinition {
  id: string;
  durationSeconds: number;
  // Asymmetric games: the owner picks one, the guest gets the other.
  roles?: readonly [string, string];
  // "higher" for points, "lower" for things like reaction time. Drives best_score.
  betterScore: "higher" | "lower";
  // Both players are on one team (see Judgement.team). Only a won match's score counts
  // toward best_score, so a quick failure can't set a "best time".
  cooperative?: boolean;
  // Clamp and validate what the client sent; never trust it as-is.
  normalizeSubmission(raw: RawSubmission, role?: string): Submission;
  // Games without one can't be played against a bot.
  botSubmission?(role?: string): Submission;
  // owner/guest are undefined when that player never submitted.
  judge(owner: Submission | undefined, guest: Submission | undefined, roles: RoleContext): Judgement;
  trashTalk?(judgement: Judgement, roles: RoleContext): string;
  rankings: Partial<Record<RankingType, RankingSpec>>;
}
