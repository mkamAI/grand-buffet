// ── Auth + persistence: Supabase when configured, localStorage always ──
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const cloudEnabled = !!supabase;

export interface Profile {
  username: string;
  gold: number;
  xp: number;
  level: number;
  upgrades: { stove: number; backpack: number; knife: number };
  recipes: string[];
  bestHaul: number;
  runs: number;
  extractions: number;
  streakCount: number;
  streakDay: string; // YYYY-MM-DD of last claim
}

export const DEFAULT_PROFILE: Profile = {
  username: "Line Cook",
  gold: 50,
  xp: 0,
  level: 1,
  upgrades: { stove: 0, backpack: 0, knife: 0 },
  recipes: ["hearty_stew", "starch_shield"],
  bestHaul: 0,
  runs: 0,
  extractions: 0,
  streakCount: 0,
  streakDay: "",
};

const LS_KEY = "grand-buffet-profile";

export function loadLocal(): Profile {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PROFILE };
}

export function saveLocal(p: Profile) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

// ── Cloud ──────────────────────────────────────────────────────────
export async function signInGuest(): Promise<User | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  if (s.session?.user) return s.session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { console.warn("guest sign-in failed:", error.message); return null; }
  return data.user;
}

export async function signInEmail(email: string): Promise<string> {
  if (!supabase) return "Cloud sync not configured.";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
  return error ? error.message : "Magic link sent — check your inbox.";
}

export async function loadCloud(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("data").eq("id", userId).maybeSingle();
  return data?.data ? { ...DEFAULT_PROFILE, ...data.data } : null;
}

export async function saveCloud(userId: string, p: Profile) {
  if (!supabase) return;
  await supabase.from("profiles").upsert({
    id: userId,
    username: p.username,
    best_haul: p.bestHaul,
    level: p.level,
    extractions: p.extractions,
    data: p,
    updated_at: new Date().toISOString(),
  });
}

export interface LeaderRow { username: string; best_haul: number; level: number; extractions: number }

export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("profiles")
    .select("username,best_haul,level,extractions")
    .order("best_haul", { ascending: false })
    .limit(10);
  return (data as LeaderRow[]) ?? [];
}

// ── Daily streak reward ────────────────────────────────────────────
export function claimDailyStreak(p: Profile): { p: Profile; reward: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (p.streakDay === today) return { p, reward: 0 };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const count = p.streakDay === yesterday ? p.streakCount + 1 : 1;
  const reward = Math.min(150, 25 * count);
  return { p: { ...p, streakCount: count, streakDay: today, gold: p.gold + reward }, reward };
}
