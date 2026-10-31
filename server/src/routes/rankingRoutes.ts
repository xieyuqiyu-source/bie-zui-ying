import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEFAULT_GAME_ID, gameIds } from "../games/index.js";
import { roomService } from "../services/roomService.js";

export async function rankingRoutes(app: FastifyInstance) {
  app.get("/api/rankings", async (request) => {
    const query = z
      .object({
        gameId: z.enum(gameIds).default(DEFAULT_GAME_ID),
        type: z.enum(["wins", "streak", "bestScore"]).optional()
      })
      .parse(request.query);

    return { items: await roomService.rankings(query.gameId, query.type) };
  });
}
