import type { Match, Room, User } from "../types/domain.js";

export const store = {
  users: new Map<string, User>(),
  openidToUserId: new Map<string, string>(),
  rooms: new Map<string, Room>(),
  matches: new Map<string, Match>()
};

