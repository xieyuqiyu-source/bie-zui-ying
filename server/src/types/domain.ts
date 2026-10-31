export type UserKind = "anonymous" | "wechat" | "bot";

export type RoomStatus = "waiting" | "countdown" | "playing" | "finished" | "expired";

export type MatchResultType = "win" | "draw";

export interface User {
  id: string;
  kind: UserKind;
  openid?: string;
  nickname: string;
  avatarUrl?: string;
  profileAuthorized: boolean;
  title: string;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPlayer {
  userId: string;
  ready: boolean;
  score?: number;
  submittedAt?: string;
}

export interface Room {
  id: string;
  // Missing on rooms created before games were split; treat as "tap".
  gameId?: string;
  code: string;
  status: RoomStatus;
  owner: RoomPlayer;
  guest?: RoomPlayer;
  matchId?: string;
  countdownStartAt?: string;
  playStartAt?: string;
  playEndsAt?: string;
  createdAt: string;
  expiresAt: string;
  endedAt?: string;
  rematchRoomId?: string;
}

export interface Match {
  id: string;
  roomId: string;
  gameId: string;
  playerAId: string;
  playerBId: string;
  playerAScore: number;
  playerBScore: number;
  winnerId?: string;
  resultType: MatchResultType;
  durationSeconds: number;
  trashTalk: string;
  createdAt: string;
}

export interface GameStats {
  userId: string;
  gameId: string;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  bestScore?: number;
  totalMatches: number;
  updatedAt: string;
}
