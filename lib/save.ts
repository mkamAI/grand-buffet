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
  streakDay: string;
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

export async function cloudLoad(): Promise<{ cloud: boolean; profile: Profile | null }> {
  try {
    const r = await fetch("/api/load", { cache: "no-store" });
    if (!r.ok) return { cloud: false, profile: null };
    const j = await r.json();
    return { cloud: !!j.cloud, profile: j.profile ? { ...DEFAULT_PROFILE, ...j.profile } : null };
  } catch {
    return { cloud: false, profile: null };
  }
}

export async function cloudSave(p: Profile) {
  try {
    await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
  } catch {}
}

export interface LeaderRow { username: string; best_haul: number; level: number; extractions: number }

export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  try {
    const r = await fetch("/api/leaderboard", { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()).rows ?? [];
  } catch {
    return [];
  }
}

export function claimDailyStreak(p: Profile): { p: Profile; reward: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (p.streakDay === today) return { p, reward: 0 };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const count = p.streakDay === yesterday ? p.streakCount + 1 : 1;
  const reward = Math.min(150, 25 * count);
  return { p: { ...p, streakCount: count, streakDay: today, gold: p.gold + reward }, reward };
}
