import "dotenv/config";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { rankingRoutes } from "./routes/rankingRoutes.js";
import { roomRoutes } from "./routes/roomRoutes.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});
await app.register(websocket);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(roomRoutes);
await app.register(rankingRoutes);

app.get("/ws/rooms/:roomId", { websocket: true }, (connection, request) => {
  const { roomId } = request.params as { roomId: string };
  connection.socket.send(JSON.stringify({ type: "connected", roomId }));
});

try {
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
