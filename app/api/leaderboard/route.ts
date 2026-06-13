import { NextResponse } from "next/server";
import { getRedis, META_KEY, BOARD_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ cloud: false, rows: [] });
  try {
    const flat = await redis.zrange<(string | number)[]>(BOARD_KEY, 0, 9, { rev: true, withScores: true });
    const rows = [];
    for (let i = 0; i < flat.length; i += 2) {
      const id = String(flat[i]);
      const score = Number(flat[i + 1]) || 0;
      const meta = await redis.hgetall<Record<string, string>>(META_KEY(id));
      rows.push({ username: meta?.username ?? "Line Cook", best_haul: score, level: Number(meta?.level) || 1, extractions: Number(meta?.extractions) || 0 });
    }
    return NextResponse.json({ cloud: true, rows });
  } catch { return NextResponse.json({ cloud: true, rows: [] }); }
}
