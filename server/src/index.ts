import "dotenv/config";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "./config/env.js";
import { initDatabase } from "./data/mysql.js";
import { initRedis } from "./data/redis.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { rankingRoutes } from "./routes/rankingRoutes.js";
import { roomRoutes } from "./routes/roomRoutes.js";
import { uploadRoutes } from "./routes/uploadRoutes.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});
await mkdir(path.resolve(env.uploadDir, "avatars"), { recursive: true });
await app.register(multipart, {
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});
await app.register(fastifyStatic, {
  root: path.resolve(env.uploadDir),
  prefix: "/uploads/"
});
await app.register(websocket);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(uploadRoutes);
await app.register(roomRoutes);
await app.register(rankingRoutes);

app.get("/ws/rooms/:roomId", { websocket: true }, (connection, request) => {
  const { roomId } = request.params as { roomId: string };
  connection.socket.send(JSON.stringify({ type: "connected", roomId }));
});

try {
  await initDatabase();
  await initRedis();
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
