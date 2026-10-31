import { busGame } from "./bus.js";
import { tapGame } from "./tap.js";
import type { GameDefinition } from "./types.js";

export const DEFAULT_GAME_ID = "tap";

const games: Record<string, GameDefinition> = {
  [tapGame.id]: tapGame,
  [busGame.id]: busGame
};

export const gameIds = Object.keys(games) as [string, ...string[]];

export function getGame(gameId: string = DEFAULT_GAME_ID) {
  const game = games[gameId];
  if (!game) throw new Error("GAME_NOT_FOUND");
  return game;
}
