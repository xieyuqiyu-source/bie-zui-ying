import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3
});

export async function initRedis() {
  if (redis.status === "wait") {
    await redis.connect();
  }
  await redis.ping();
}
