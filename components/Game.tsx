"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, HudState, RunResult, PlayerStats, CarriedItem } from "@/game/engine";
import { BIOMES, INGREDIENTS, RECIPES, UPGRADES, ROT_MULT, RARITY_COLOR, xpForLevel } from "@/game/data";
import {
  Profile, DEFAULT_PROFILE, loadLocal, saveLocal, cloudEnabled,
} from "@/lib/save";

type Screen = "login" | "hub" | "run" | "results";

export default function Game() {
  const [screen, setScreen] = useState<Screen>("login");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [userId, setUserId] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [streakMsg, setStreakMsg] = useState("");
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [hubTab, setHubTab] = useState<"expedition" | "shop" | "recipes" | "leaderboard">("expedition");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // ── persistence ──
  const persist = useCallback((p: Profile) => {
    setProfile(p);
    saveLocal(p);
    if (userId) saveCloud(userId, p);
  }, [userId]);

  // resume cloud session on load
  useEffect(() => {
      if (data.session?.user) await enterHub(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enterHub(uid: string | null) {
    let p = loadLocal();
    if (uid) {
      const cloud = await loadCloud(uid);
      if (cloud && cloud.xp >= p.xp) p = cloud; // keep richer save
      setUserId(uid);
    }
    const { p: p2, reward } = claimDailyStreak(p);
    if (reward > 0) setStreakMsg(`Day ${p2.streakCount} streak — +${reward}g opening bonus!`);
    setProfile(p2);
    saveLocal(p2);
    if (uid) saveCloud(uid, p2);
    setScreen("hub");
  }

  async function handleGuest() {
    const u = await signInGuest(); // null if cloud not configured → local-only
    await enterHub(u?.id ?? null);
  }

  async function handleEmail() {
    if (!email.includes("@")) { setEmailMsg("Enter a valid email."); return; }
    setEmailMsg(await signInEmail(email));
  }

  // ── run lifecycle ──
  function startRun(biomeId: string) {
    const p = profileRef.current;
    const stats: PlayerStats = {
      cookTime: UPGRADES.stove.tiers[p.upgrades.stove].stat,
      slots: UPGRADES.backpack.tiers[p.upgrades.backpack].stat,
      harvestTime: UPGRADES.knife.tiers[p.upgrades.knife].stat,
      rotMult: 1 / ROT_MULT[p.upgrades.backpack], // higher = ingredients last longer
      knownRecipes: p.recipes,
    };
    setHud(null);
    setResult(null);
    setScreen("run");
    requestAnimationFrame(() => {
      const cv = canvasRef.current!;
      cv.width = cv.clientWidth;
      cv.height = cv.clientHeight;
      engineRef.current?.destroy();
      engineRef.current = new Engine(cv, biomeId, stats, setHud, onRunEnd);
    });
  }

  function onRunEnd(r: RunResult) {
    engineRef.current = null;
    const p = { ...profileRef.current };
    p.runs += 1;
    p.gold += r.gold;
    p.xp += r.xp;
    if (r.outcome === "extracted") {
      p.extractions += 1;
      p.bestHaul = Math.max(p.bestHaul, r.gold);
    }
    while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level += 1; }
    persist(p);
    setResult(r);
    setScreen("results");
  }

  function abandonRun() {
    engineRef.current?.destroy();
    engineRef.current = null;
    setScreen("hub");
  }

  useEffect(() => () => engineRef.current?.destroy(), []);

  useEffect(() => {
    if (screen === "hub" && hubTab === "leaderboard" && cloudEnabled) fetchLeaderboard().then(setLeaders);
  }, [screen, hubTab]);

  // ── shop actions ──
  function buyUpgrade(uid: "stove" | "backpack" | "knife") {
    const p = { ...profile, upgrades: { ...profile.upgrades } };
    const next = p.upgrades[uid] + 1;
    const tier = UPGRADES[uid].tiers[next];
    if (!tier || p.gold < tier.cost) return;
    p.gold -= tier.cost;
    p.upgrades[uid] = next;
    persist(p);
  }

  function buyRecipe(rid: string) {
    const r = RECIPES[rid];
    if (profile.recipes.includes(rid) || profile.gold < r.unlockCost || profile.level < r.unlockLevel) return;
    persist({ ...profile, gold: profile.gold - r.unlockCost, recipes: [...profile.recipes, rid] });
  }

  function renameChef(name: string) {
    persist({ ...profile, username: name.slice(0, 20) || "Line Cook" });
  }

  // ── render ──
  if (screen === "login") return <Login onGuest={handleGuest} email={email} setEmail={setEmail} onEmail={handleEmail} emailMsg={emailMsg} />;
  if (screen === "hub") return (
    <Hub profile={profile} tab={hubTab} setTab={setHubTab} streakMsg={streakMsg}
      onStart={startRun} onBuyUpgrade={buyUpgrade} onBuyRecipe={buyRecipe} leaders={leaders} onRename={renameChef} />
  );
  if (screen === "results" && result) return <Results r={result} profile={profile} onContinue={() => setScreen("hub")} />;

  // run screen
  return (
    <div className="run-wrap">
      <canvas ref={canvasRef} className="game-canvas" />
      {hud && <Hud hud={hud} onCook={(rid) => engineRef.current?.startCook(rid)} onDrop={(uid) => engineRef.current?.dropItem(uid)} />}
      <button className="abandon" onClick={abandonRun}>Abandon run</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
function Login(props: { onGuest: () => void; email: string; setEmail: (s: string) => void; onEmail: () => void; emailMsg: string }) {
  return (
    <div className="screen center">
      <div className="login-card">
        <div className="logo">🍳</div>
        <h1>The Grand Buffet</h1>
        <p className="tagline">Drop in. Harvest. Cook to survive. Extract before you starve.</p>
        <button className="btn primary big" onClick={props.onGuest}>▶ Play now as Guest</button>
        <div className="divider">{cloudEnabled ? "or save progress across devices" : "cloud sync not configured — progress saves to this browser"}</div>
        {cloudEnabled && (
          <div className="email-row">
            <input placeholder="chef@kitchen.com" value={props.email} onChange={e => props.setEmail(e.target.value)} />
            <button className="btn" onClick={props.onEmail}>Send magic link</button>
          </div>
        )}
        {props.emailMsg && <p className="hint">{props.emailMsg}</p>}
        <div className="howto">
          <b>How a run works</b>
          <span>🌾 Harvest volatile ingredients — they rot and hog backpack space</span>
          <span>🔥 Stand still to cook hot-keyed meals: armor, speed, throwable purge soup</span>
          <span>🍴 Hunger ticks down constantly; the Spoilage Storm closes in</span>
          <span>🛗 Reach an extraction point to bank your haul at the Restaurant</span>
        </div>
      </div>
    </div>
  );
}

function Hub(props: {
  profile: Profile; tab: string; setTab: (t: any) => void; streakMsg: string;
  onStart: (b: string) => void; onBuyUpgrade: (u: any) => void; onBuyRecipe: (r: string) => void;
  leaders: LeaderRow[]; onRename: (n: string) => void;
}) {
  const p = props.profile;
  const xpNeed = xpForLevel(p.level);
  return (
    <div className="screen hub">
      <header className="hub-head">
        <div>
          <h1>🏮 Your Restaurant</h1>
          <input className="chef-name" value={p.username} onChange={e => props.onRename(e.target.value)} title="Chef name (shown on leaderboard)" />
        </div>
        <div className="stats-row">
          <span className="pill gold">🪙 {p.gold}</span>
          <span className="pill">Lv {p.level}</span>
          <span className="pill xp">XP {p.xp}/{xpNeed}</span>
          <span className="pill">🔥 Streak {p.streakCount}</span>
          <span className="pill">Best haul {p.bestHaul}g</span>
        </div>
      </header>
      {props.streakMsg && <div className="banner">{props.streakMsg}</div>}

      <nav className="tabs">
        {(["expedition", "shop", "recipes", "leaderboard"] as const).map(t => (
          <button key={t} className={props.tab === t ? "tab on" : "tab"} onClick={() => props.setTab(t)}>
            {t === "expedition" ? "🗺️ Expeditions" : t === "shop" ? "🛒 Kitchen Upgrades" : t === "recipes" ? "📖 Recipe Tree" : "🏆 Critics' Board"}
          </button>
        ))}
      </nav>

      {props.tab === "expedition" && (
        <div className="grid">
          {Object.values(BIOMES).map(b => {
            const locked = p.level < b.unlockLevel;
            return (
              <div key={b.id} className={"card biome" + (locked ? " locked" : "")}>
                <div className="card-emoji">{b.emoji}</div>
                <h3>{b.name}</h3>
                <p>{b.hazardNote}</p>
                <p className="muted">{b.faunaEmoji} {b.faunaName} · Storm in ~{b.stormDelay}s</p>
                {locked
                  ? <span className="lock">🔒 Unlocks at level {b.unlockLevel}</span>
                  : <button className="btn primary" onClick={() => props.onStart(b.id)}>Drop in</button>}
              </div>
            );
          })}
          <div className="card controls-card">
            <h3>Controls</h3>
            <p>WASD / arrows — move<br />SPACE — harvest nearby node<br />Cook buttons — deploy stove (stand still!)<br />1–9 — eat / throw cooked dish<br />R — eat rawest raw edible</p>
          </div>
        </div>
      )}

      {props.tab === "shop" && (
        <div className="grid">
          {Object.values(UPGRADES).map(u => {
            const cur = p.upgrades[u.id as keyof typeof p.upgrades];
            const next = u.tiers[cur + 1];
            return (
              <div key={u.id} className="card">
                <div className="card-emoji">{u.emoji}</div>
                <h3>{u.name}</h3>
                <p>Now: <b>{u.tiers[cur].name}</b> · {u.statLabel(u.tiers[cur].stat)}{u.id === "backpack" ? ` · rot ×${ROT_MULT[cur]}` : ""}</p>
                {next
                  ? <button className="btn" disabled={p.gold < next.cost} onClick={() => props.onBuyUpgrade(u.id)}>
                      Upgrade → {next.name} ({u.statLabel(next.stat)}) · 🪙{next.cost}
                    </button>
                  : <span className="lock">★ Maxed</span>}
              </div>
            );
          })}
        </div>
      )}

      {props.tab === "recipes" && (
        <div className="grid">
          {Object.values(RECIPES).map(r => {
            const owned = p.recipes.includes(r.id);
            const lockedLv = p.level < r.unlockLevel;
            return (
              <div key={r.id} className={"card" + (owned ? " owned" : "")}>
                <div className="card-emoji">{r.emoji}</div>
                <h3>{r.name}</h3>
                <p>{r.desc}</p>
                <p className="muted">Needs: {Object.entries(r.inputs).map(([i, q]) => `${INGREDIENTS[i].emoji}×${q}`).join(" ")} · Sells 🪙{r.value}</p>
                {owned ? <span className="lock owned-tag">✓ Known</span>
                  : lockedLv ? <span className="lock">🔒 Level {r.unlockLevel}</span>
                  : <button className="btn" disabled={p.gold < r.unlockCost} onClick={() => props.onBuyRecipe(r.id)}>Learn · 🪙{r.unlockCost}</button>}
              </div>
            );
          })}
        </div>
      )}

      {props.tab === "leaderboard" && (
        <div className="board">
          {!cloudEnabled && <p className="hint">Connect Supabase to enable the global Critics' Board. Your local best haul: <b>{p.bestHaul}g</b>.</p>}
          {cloudEnabled && props.leaders.length === 0 && <p className="hint">No critics have rated anyone yet. Be first.</p>}
          {props.leaders.map((l, i) => (
            <div key={i} className="board-row">
              <span className="rank">{i === 0 ? "👑" : `#${i + 1}`}</span>
              <span className="name">{l.username}</span>
              <span>Lv {l.level}</span>
              <span>{l.extractions} extractions</span>
              <span className="gold">🪙 {l.best_haul}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Hud(props: { hud: HudState; onCook: (rid: string) => void; onDrop: (uid: number) => void }) {
  const h = props.hud;
  const dishes = h.items.filter(i => i.kind === "dish");
  return (
    <>
      {/* top bars */}
      <div className="hud-top">
        <Bar label="❤️" value={h.hp} max={100} color="#e05a5a" />
        <Bar label="🍴" value={h.hunger} max={100} color="#e8a23a" warn={h.hunger < 25} />
        <div className="hud-meta">
          <span>⏱ {Math.floor(h.time)}s</span>
          <span className={h.inStorm ? "storm-warn" : ""}>
            {h.stormIn > 0 ? `🌀 Storm in ${Math.ceil(h.stormIn)}s` : h.inStorm ? "🌀 IN THE STORM — RUN" : "🌀 Storm closing"}
          </span>
          <span>💰 Haul {h.haulValue}g</span>
        </div>
      </div>

      {h.message && <div className="toast">{h.message}</div>}
      {h.cooking && <div className="cooking-toast">🔥 {h.cooking.recipe} — {h.cooking.left.toFixed(1)}s (don't move!)</div>}
      {h.extracting >= 0 && (
        <div className="extract-ring">
          <div className="extract-fill" style={{ width: `${h.extracting * 100}%` }} />
          <span>Extracting… hold position</span>
        </div>
      )}

      {/* buffs */}
      <div className="buff-row">
        {h.buffs.map((b, i) => (
          <span key={i} className="buff">
            {b.kind === "shield" ? "🛡️" : b.kind === "dash" ? "💨" : b.kind === "dot" ? "🔥" : b.kind === "hallucinate" ? "🌀" : "✨"} {Math.ceil(b.left)}s
          </span>
        ))}
      </div>

      {/* inventory + cook panel */}
      <div className="hud-bottom">
        <div className="inv">
          <div className="inv-head">🎒 {h.slotsUsed}/{h.slotsMax}</div>
          <div className="inv-items">
            {h.items.map(it => {
              const def = it.kind === "ing" ? INGREDIENTS[it.id] : RECIPES[it.id];
              const rotLeft = it.kind === "ing" && isFinite(it.rotAt) ? Math.max(0, it.rotAt - h.time) : null;
              const dishIdx = it.kind === "dish" ? dishes.findIndex(d => d.uid === it.uid) : -1;
              return (
                <div key={it.uid}
                  className={"inv-item" + (it.spoiled ? " spoiled" : "") + (rotLeft !== null && rotLeft < 25 ? " rotting" : "")}
                  style={{ borderColor: it.kind === "ing" ? RARITY_COLOR[INGREDIENTS[it.id].rarity] : "#e8b54a" }}
                  title={`${def.name}${it.spoiled ? " (SPOILED)" : ""} — right-click to drop`}
                  onContextMenu={e => { e.preventDefault(); props.onDrop(it.uid); }}>
                  <span className="inv-emoji">{def.emoji}</span>
                  {dishIdx >= 0 && <span className="hotkey">{dishIdx + 1}</span>}
                  {rotLeft !== null && !it.spoiled && <span className="rot">{Math.ceil(rotLeft)}s</span>}
                  {it.spoiled && <span className="rot">☠️</span>}
                </div>
              );
            })}
            {h.items.length === 0 && <span className="muted small">Empty — go harvest (SPACE near a node)</span>}
          </div>
        </div>
        <div className="cookbar">
          {h.craftable.length === 0
            ? <span className="muted small">No cookable recipes — gather more ingredients</span>
            : h.craftable.map(rid => (
              <button key={rid} className="btn cook" onClick={() => props.onCook(rid)}>
                {RECIPES[rid].emoji} Cook {RECIPES[rid].name}
              </button>
            ))}
        </div>
      </div>
    </>
  );
}

function Bar(props: { label: string; value: number; max: number; color: string; warn?: boolean }) {
  return (
    <div className={"bar" + (props.warn ? " pulse" : "")}>
      <span>{props.label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${(props.value / props.max) * 100}%`, background: props.color }} /></div>
      <b>{Math.ceil(props.value)}</b>
    </div>
  );
}

function Results(props: { r: RunResult; profile: Profile; onContinue: () => void }) {
  const { r } = props;
  const titles = { extracted: "🛗 Extraction successful!", fainted: "😵 You fainted from hunger…", slain: "💀 The wilds claimed you…" };
  return (
    <div className="screen center">
      <div className="login-card results-card">
        <h1>{titles[r.outcome]}</h1>
        <p className="muted">{BIOMES[r.biome].name} · {Math.floor(r.time)}s</p>
        {r.outcome === "extracted" ? (
          <>
            <div className="haul-list">
              {r.items.map(it => {
                const def = it.kind === "ing" ? INGREDIENTS[it.id] : RECIPES[it.id];
                const v = Math.round(it.spoiled ? (def as any).value * 0.1 : (def as any).value);
                return <div key={it.uid} className="haul-row"><span>{def.emoji} {def.name}{it.spoiled ? " (spoiled)" : ""}</span><span className="gold">🪙 {v}</span></div>;
              })}
            </div>
            <div className="haul-total">The critics pay <b className="gold">🪙 {r.gold}</b> · +{r.xp} XP</div>
          </>
        ) : (
          <p>Your entire haul was lost. The critics are unimpressed. <br />+{r.xp} XP for the lesson.</p>
        )}
        <button className="btn primary big" onClick={props.onContinue}>Return to the Restaurant</button>
      </div>
    </div>
  );
}
