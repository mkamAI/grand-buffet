import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getRedis, PROFILE_KEY, META_KEY, BOARD_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const redis = getRedis();
  const id = cookies().get("gb_id")?.value;
  if (!redis || !id) return NextResponse.json({ cloud: false });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const profile = {
    username: String(body.username ?? "Line Cook").slice(0, 20) || "Line Cook",
    gold: Math.max(0, Math.min(10_000_000, Number(body.gold) || 0)),
    xp: Math.max(0, Math.min(10_000_000, Number(body.xp) || 0)),
    level: Math.max(1, Math.min(999, Number(body.level) || 1)),
    upgrades: { stove: Math.max(0, Math.min(2, Number(body?.upgrades?.stove) || 0)), backpack: Math.max(0, Math.min(2, Number(body?.upgrades?.backpack) || 0)), knife: Math.max(0, Math.min(2, Number(body?.upgrades?.knife) || 0)) },
    recipes: Array.isArray(body.recipes) ? body.recipes.slice(0, 50).map(String) : [],
    bestHaul: Math.max(0, Math.min(10_000_000, Number(body.bestHaul) || 0)),
    runs: Math.max(0, Number(body.runs) || 0),
    extractions: Math.max(0, Number(body.extractions) || 0),
    streakCount: Math.max(0, Number(body.streakCount) || 0),
    streakDay: String(body.streakDay ?? "").slice(0, 10),
  };
  try {
    await Promise.all([
      redis.set(PROFILE_KEY(id), profile),
      redis.zadd(BOARD_KEY, { score: profile.bestHaul, member: id }),
      redis.hset(META_KEY(id), { username: profile.username, level: profile.level, extractions: profile.extractions }),
    ]);
  } catch { return NextResponse.json({ cloud: false }); }
  return NextResponse.json({ cloud: true });
}
