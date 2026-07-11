import type { RowDataPacket } from "mysql2";
import { nanoid } from "nanoid";
import { db } from "../data/mysql.js";
import type { User, UserKind } from "../types/domain.js";
import { nowIso } from "../utils/time.js";

interface UserRow extends RowDataPacket {
  id: string;
  kind: UserKind;
  openid?: string | null;
  nickname: string;
  avatar_url?: string | null;
  profile_authorized: number | boolean;
  title: string;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
  best_score: number;
  created_at: Date;
  updated_at: Date;
}

function makeAnonymousName() {
  return `神秘手指${Math.floor(100 + Math.random() * 900)}`;
}

function makeBotName() {
  const names = ["嘴硬练习生", "十秒陪练员", "榜外高手", "复仇模拟器"];
  return names[Math.floor(Math.random() * names.length)];
}

function toDate(value: string) {
  return new Date(value);
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    kind: row.kind,
    openid: row.openid || undefined,
    nickname: row.nickname,
    avatarUrl: row.avatar_url || undefined,
    profileAuthorized: Boolean(row.profile_authorized),
    title: row.title,
    totalMatches: row.total_matches,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    bestScore: row.best_score,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function insertUser(user: User) {
  await db.execute(
    `INSERT INTO users (
      id, kind, openid, nickname, avatar_url, profile_authorized, title, total_matches, wins, losses, draws,
      current_streak, best_streak, best_score, created_at, updated_at
    ) VALUES (
      :id, :kind, :openid, :nickname, :avatarUrl, :profileAuthorized, :title, :totalMatches, :wins, :losses, :draws,
      :currentStreak, :bestStreak, :bestScore, :createdAt, :updatedAt
    )`,
    {
      ...user,
      openid: user.openid ?? null,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: toDate(user.createdAt),
      updatedAt: toDate(user.updatedAt)
    }
  );
}

export const userService = {
  async createAnonymousUser() {
    const id = nanoid(16);
    const now = nowIso();
    const user: User = {
      id,
      kind: "anonymous",
      nickname: makeAnonymousName(),
      profileAuthorized: false,
      title: "神秘手指",
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestScore: 0,
      createdAt: now,
      updatedAt: now
    };
    await insertUser(user);
    return user;
  },

  async createBotUser() {
    const id = nanoid(16);
    const now = nowIso();
    const user: User = {
      id,
      kind: "bot",
      nickname: makeBotName(),
      profileAuthorized: true,
      title: "系统陪练",
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestScore: 0,
      createdAt: now,
      updatedAt: now
    };
    await insertUser(user);
    return user;
  },

  async getUser(userId: string) {
    const [rows] = await db.execute<UserRow[]>("SELECT * FROM users WHERE id = :id LIMIT 1", { id: userId });
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },

  async ensureUser(userId?: string) {
    if (userId) {
      const found = await this.getUser(userId);
      if (found) return found;
    }
    return this.createAnonymousUser();
  },

  async upsertWechatUser(input: { openid: string; nickname?: string; avatarUrl?: string }) {
    const [rows] = await db.execute<UserRow[]>("SELECT * FROM users WHERE openid = :openid LIMIT 1", {
      openid: input.openid
    });
    const now = nowIso();

    if (rows[0]) {
      await db.execute(
        `UPDATE users SET
          nickname = :nickname,
          avatar_url = :avatarUrl,
          profile_authorized = :profileAuthorized,
          updated_at = :updatedAt
        WHERE id = :id`,
        {
          id: rows[0].id,
          nickname: input.nickname || rows[0].nickname,
          avatarUrl: input.avatarUrl || rows[0].avatar_url || null,
          profileAuthorized: Boolean(input.nickname || input.avatarUrl || rows[0].profile_authorized),
          updatedAt: toDate(now)
        }
      );
      return {
        ...rowToUser(rows[0]),
        nickname: input.nickname || rows[0].nickname,
        avatarUrl: input.avatarUrl || rows[0].avatar_url || undefined,
        profileAuthorized: Boolean(input.nickname || input.avatarUrl || rows[0].profile_authorized),
        updatedAt: now
      };
    }

    const id = nanoid(16);
    const user: User = {
      id,
      kind: "wechat",
      openid: input.openid,
      nickname: input.nickname || makeAnonymousName(),
      avatarUrl: input.avatarUrl,
      profileAuthorized: Boolean(input.nickname || input.avatarUrl),
      title: "神秘手指",
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestScore: 0,
      createdAt: now,
      updatedAt: now
    };
    await insertUser(user);
    return user;
  },

  async saveUserStats(user: User) {
    await db.execute(
      `UPDATE users SET
        title = :title,
        total_matches = :totalMatches,
        wins = :wins,
        losses = :losses,
        draws = :draws,
        current_streak = :currentStreak,
        best_streak = :bestStreak,
        best_score = :bestScore,
        updated_at = :updatedAt
      WHERE id = :id`,
      {
        ...user,
        updatedAt: toDate(user.updatedAt)
      }
    );
  },

  async updateProfile(userId: string, input: { nickname: string; avatarUrl?: string }) {
    const nickname = input.nickname.trim().slice(0, 32) || makeAnonymousName();
    const avatarUrl = input.avatarUrl || null;
    const now = nowIso();

    await db.execute(
      `UPDATE users SET
        nickname = :nickname,
        avatar_url = :avatarUrl,
        profile_authorized = TRUE,
        updated_at = :updatedAt
      WHERE id = :id`,
      {
        id: userId,
        nickname,
        avatarUrl,
        updatedAt: toDate(now)
      }
    );

    const user = await this.getUser(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return user;
  },

  async rankings(type: "wins" | "streak" | "bestScore" = "wins") {
    const orderBy = type === "streak" ? "current_streak" : type === "bestScore" ? "best_score" : "wins";
    const [rows] = await db.query<UserRow[]>(
      `SELECT * FROM users WHERE kind <> 'bot' ORDER BY ${orderBy} DESC, updated_at ASC LIMIT 50`
    );
    return rows.map(rowToUser);
  }
};
