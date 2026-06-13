import { Redis } from "@upstash/redis";

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export const PROFILE_KEY = (id: string) => `gb:profile:${id}`;
export const META_KEY = (id: string) => `gb:meta:${id}`;
export const BOARD_KEY = "gb:leaderboard";
