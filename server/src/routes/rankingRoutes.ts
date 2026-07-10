import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { roomService } from "../services/roomService.js";

export async function rankingRoutes(app: FastifyInstance) {
  app.get("/api/rankings", async (request) => {
    const query = z
      .object({
        type: z.enum(["wins", "streak", "bestScore"]).optional()
      })
      .parse(request.query);

    return { items: roomService.rankings(query.type) };
  });
}

