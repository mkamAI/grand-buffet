import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getRedis, PROFILE_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const redis = getRedis();
  let id = cookies().get("gb_id")?.value;
  const isNew = !id;
  if (!id) id = randomUUID();

  let profile: unknown = null;
  if (redis && !isNew) {
    try { profile = await redis.get(PROFILE_KEY(id)); } catch {}
  }

  const res = NextResponse.json({ cloud: !!redis, profile });
  res.cookies.set("gb_id", id, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, path: "/",
  });
  return res;
}
