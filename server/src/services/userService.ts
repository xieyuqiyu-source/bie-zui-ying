import { nanoid } from "nanoid";
import { store } from "../data/store.js";
import type { User } from "../types/domain.js";
import { nowIso } from "../utils/time.js";

function makeAnonymousName() {
  return `神秘手指${Math.floor(100 + Math.random() * 900)}`;
}

function makeBotName() {
  const names = ["嘴硬练习生", "十秒陪练员", "榜外高手", "复仇模拟器"];
  return names[Math.floor(Math.random() * names.length)];
}

export const userService = {
  createAnonymousUser() {
    const id = nanoid(16);
    const now = nowIso();
    const user: User = {
      id,
      kind: "anonymous",
      nickname: makeAnonymousName(),
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
    store.users.set(id, user);
    return user;
  },

  createBotUser() {
    const id = nanoid(16);
    const now = nowIso();
    const user: User = {
      id,
      kind: "bot",
      nickname: makeBotName(),
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
    store.users.set(id, user);
    return user;
  },

  getUser(userId: string) {
    return store.users.get(userId);
  },

  ensureUser(userId?: string) {
    if (userId) {
      const found = store.users.get(userId);
      if (found) return found;
    }
    return this.createAnonymousUser();
  },

  upsertWechatUser(input: { openid: string; nickname?: string; avatarUrl?: string }) {
    const existingUserId = store.openidToUserId.get(input.openid);
    const now = nowIso();
    if (existingUserId) {
      const existing = store.users.get(existingUserId);
      if (existing) {
        existing.nickname = input.nickname || existing.nickname;
        existing.avatarUrl = input.avatarUrl || existing.avatarUrl;
        existing.updatedAt = now;
        return existing;
      }
    }

    const id = nanoid(16);
    const user: User = {
      id,
      kind: "wechat",
      openid: input.openid,
      nickname: input.nickname || makeAnonymousName(),
      avatarUrl: input.avatarUrl,
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
    store.users.set(id, user);
    store.openidToUserId.set(input.openid, id);
    return user;
  }
};
