import type { RowDataPacket } from "mysql2";
import { db } from "../data/mysql.js";
import { getGame } from "../games/index.js";
import type { RankingType } from "../games/types.js";
import type { GameStats, User, UserKind } from "../types/domain.js";

type Outcome = "win" | "loss" | "draw";

interface RankingRow extends RowDataPacket {
  user_id: string;
  game_id: string;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
  best_score: number | null;
  total_matches: number;
  stats_updated_at: Date;
  kind: UserKind;
  nickname: string;
  avatar_url: string | null;
  profile_authorized: number | boolean;
  title: string;
}

function rowToStats(row: RankingRow): GameStats {
  return {
    userId: row.user_id,
    gameId: row.game_id,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    bestScore: row.best_score ?? undefined,
    totalMatches: row.total_matches,
    updatedAt: row.stats_updated_at.toISOString()
  };
}

export const gameStatsService = {
  // Increments in SQL rather than read-modify-write, so concurrent settlements can't lose updates.
  async recordResult(userId: string, gameId: string, outcome: Outcome, score: number) {
    const game = getGame(gameId);
    const bestFn = game.betterScore === "higher" ? "GREATEST" : "LEAST";
    const win = outcome === "win" ? 1 : 0;

    // MySQL evaluates ON DUPLICATE KEY assignments left to right, so best_streak must read
    // current_streak before it is changed.
    await db.execute(
      `INSERT INTO user_game_stats (
        user_id, game_id, wins, losses, draws, current_streak, best_streak, best_score, total_matches, updated_at
      ) VALUES (
        :userId, :gameId, :win, :loss, :draw, :win, :win, :score, 1, :updatedAt
      )
      ON DUPLICATE KEY UPDATE
        wins = wins + :win,
        losses = losses + :loss,
        draws = draws + :draw,
        best_streak = IF(:win = 1, GREATEST(best_streak, current_streak + 1), best_streak),
        current_streak = IF(:win = 1, current_streak + 1, 0),
        best_score = ${bestFn}(COALESCE(best_score, :score), :score),
        total_matches = total_matches + 1,
        updated_at = :updatedAt`,
      {
        userId,
        gameId,
        win,
        loss: outcome === "loss" ? 1 : 0,
        draw: outcome === "draw" ? 1 : 0,
        score,
        updatedAt: new Date()
      }
    );
  },

  async rankings(gameId: string, type: RankingType) {
    const spec = getGame(gameId).rankings[type];
    if (!spec) throw new Error("RANKING_NOT_SUPPORTED");

    // spec.column / spec.direction come from the game definition, never from the request.
    const [rows] = await db.query<RankingRow[]>(
      `SELECT s.*, s.updated_at AS stats_updated_at,
        u.kind, u.nickname, u.avatar_url, u.profile_authorized, u.title
       FROM user_game_stats s
       JOIN users u ON u.id = s.user_id
       WHERE s.game_id = ? AND u.kind <> 'bot' AND s.total_matches > 0
         AND (? <> 'best_score' OR s.best_score IS NOT NULL)
       ORDER BY s.${spec.column} ${spec.direction}, s.updated_at ASC
       LIMIT 50`,
      [gameId, spec.column]
    );

    return rows.map((row) => ({
      stats: rowToStats(row),
      user: {
        id: row.user_id,
        nickname: row.nickname,
        avatarUrl: row.avatar_url || undefined,
        profileAuthorized: Boolean(row.profile_authorized),
        title: row.title
      } satisfies Pick<User, "id" | "nickname" | "avatarUrl" | "profileAuthorized" | "title">
    }));
  }
};
