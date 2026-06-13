# 🍳 The Grand Buffet

Browser-based extraction cooking game. Drop into procedurally generated biomes, harvest volatile ingredients that rot in your pack, cook hot-keyed survival meals on a portable stove, and extract before hunger or the Spoilage Storm finishes you. Bank your haul at your Restaurant: sell to the critics, upgrade your kitchen, unlock recipes.

**Stack:** Next.js 14 · Canvas 2D engine (zero game-framework deps) · Supabase (auth + cloud saves + leaderboard) · Vercel/Railway ready.

## Core loop
```
[Drop into Map] → [Harvest Ingredients] → [Cook to Buff/Survive] → [Extract to Restaurant]
      ▲                                                                    │
      └────────── [Upgrade Kitchen · Learn Recipes · Sell to Critics] ◄────┘
```

## Quick start (local)
```bash
npm install
npm run dev        # http://localhost:3000 — runs fully local, no Supabase needed
```
Without Supabase env vars, progress persists to localStorage and the leaderboard tab shows local best only.

## Fast login + cloud saves (Supabase, ~5 min)
1. Create a free project at supabase.com.
2. SQL Editor → run `supabase/schema.sql`.
3. Authentication → Providers → enable **Anonymous** sign-ins (this powers one-click "Play as Guest").
4. Copy `.env.example` → `.env.local`, fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Guest = one click, zero friction, anonymous Supabase user. Magic-link email upgrades to a portable cross-device account.

## Deploy

### Vercel
```bash
npx vercel --prod
```
Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in Project → Settings → Environment Variables. No other config needed.

### Railway
New project → Deploy from repo. Railway auto-detects Next.js (`npm run build` / `npm start`). Add the same two env vars.

## Controls
| Input | Action |
|---|---|
| WASD / arrows | Move |
| SPACE | Harvest nearby node (interrupted by moving) |
| Cook buttons | Deploy portable stove — stand still or the dish is ruined |
| 1–9 | Eat / throw cooked dish (Purge Soup is a throwable AoE) |
| R | Eat the raw edible closest to rotting |
| Right-click item | Drop it (inventory pressure is real) |

## Rewards system
- **Gold**: critics pay full price for fresh cooked dishes, less for raw, 10% for spoiled.
- **XP / levels**: gate biomes (Volcanic Kitchen at 2, Sunken Reef at 3) and recipes.
- **Daily streak**: opening bonus, +25g per consecutive day, capped at 150g.
- **Upgrades**: stove (cook speed), insulated backpack (slots + rot rate), chef knife (harvest speed).
- **Leaderboard**: global best-haul board via Supabase.

## Project map
```
app/            Next.js shell
components/Game.tsx   Screens: login → restaurant hub → run HUD → results
game/engine.ts        Canvas run engine (world gen, fauna AI, storm, rot, extraction)
game/data.ts          Ingredients, recipes, biomes, upgrades — tune balance here
lib/save.ts           Supabase client, local/cloud persistence, daily streak
supabase/schema.sql   profiles table + RLS
```
# Sat Jun 13 13:08:16 EDT 2026
