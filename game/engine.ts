// ── The Grand Buffet · run engine (canvas 2D) ───────────────────────
import { BIOMES, BiomeDef, INGREDIENTS, RECIPES, RecipeDef, ROT_MULT } from "./data";

export interface CarriedItem {
  uid: number;
  kind: "ing" | "dish";
  id: string;          // ingredient or recipe id
  rotAt: number;       // engine-time seconds when it spoils (Infinity for dishes)
  spoiled: boolean;
}

export interface PlayerStats {
  cookTime: number;
  slots: number;
  harvestTime: number;
  rotMult: number;
  knownRecipes: string[];
}

export interface HudState {
  hp: number;
  hunger: number;
  time: number;
  stormIn: number;       // seconds until storm starts (<=0 means active)
  stormRadius: number;
  inStorm: boolean;
  slotsUsed: number;
  slotsMax: number;
  items: CarriedItem[];
  buffs: { kind: string; left: number }[];
  cooking: { recipe: string; left: number } | null;
  extracting: number;    // 0..1 progress, -1 if not in zone
  message: string;
  craftable: string[];   // recipe ids cookable right now
  haulValue: number;
}

export interface RunResult {
  outcome: "extracted" | "fainted" | "slain";
  gold: number;
  xp: number;
  items: CarriedItem[];
  time: number;
  biome: string;
}

interface Node { x: number; y: number; id: string; gone: boolean; respawnAt: number }
interface Fauna { x: number; y: number; vx: number; vy: number; docileUntil: number; hitCd: number; wanderT: number }
interface Hazard { x: number; y: number; r: number }

const WORLD = 2400;

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private biome: BiomeDef;
  private stats: PlayerStats;
  private onHud: (h: HudState) => void;
  private onEnd: (r: RunResult) => void;

  private keys: Record<string, boolean> = {};
  private raf = 0;
  private last = 0;
  private t = 0; // run time seconds
  private nextUid = 1;
  private msg = "";
  private msgUntil = 0;
  private hudAccum = 0;
  private ended = false;

  // player
  private px = WORLD / 2; private py = WORLD / 2;
  private hp = 100; private hunger = 100;
  private buffs: { kind: string; until: number }[] = [];
  private harvesting: { node: Node; left: number } | null = null;
  private cooking: { recipe: RecipeDef; left: number } | null = null;

  private items: CarriedItem[] = [];

  private nodes: Node[] = [];
  private fauna: Fauna[] = [];
  private hazards: Hazard[] = [];
  private extracts: { x: number; y: number; emoji: string; name: string }[] = [];
  private extractProgress = 0;

  // storm
  private eyeX = 0; private eyeY = 0;
  private stormRadius = WORLD;

  constructor(canvas: HTMLCanvasElement, biomeId: string, stats: PlayerStats, onHud: (h: HudState) => void, onEnd: (r: RunResult) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.biome = BIOMES[biomeId];
    this.stats = stats;
    this.onHud = onHud;
    this.onEnd = onEnd;
    this.genWorld();
    this.bind();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.say(`Dropped into ${this.biome.name}. Harvest, cook, extract.`, 5);
  }

  // ── setup ──────────────────────────────────────────────────────
  private genWorld() {
    const b = this.biome;
    const rnd = (a: number, z: number) => a + Math.random() * (z - a);
    // ingredient pool weighted by rarity
    const pool = Object.values(INGREDIENTS).filter(i => i.biomes.includes(b.id));
    const weighted: string[] = [];
    for (const ing of pool) {
      const w = ing.rarity === "common" ? 10 : ing.rarity === "rare" ? 4 : ing.rarity === "epic" ? 2 : 1;
      for (let i = 0; i < w; i++) weighted.push(ing.id);
    }
    for (let i = 0; i < b.nodeCount; i++) {
      this.nodes.push({ x: rnd(150, WORLD - 150), y: rnd(150, WORLD - 150), id: weighted[(Math.random() * weighted.length) | 0], gone: false, respawnAt: 0 });
    }
    // guarantee at least one truffle far from spawn
    this.nodes.push({ x: rnd(200, WORLD - 200), y: Math.random() < 0.5 ? rnd(150, 400) : rnd(WORLD - 400, WORLD - 150), id: "golden_truffle", gone: false, respawnAt: 0 });

    for (let i = 0; i < b.faunaCount; i++) {
      let x = 0, y = 0;
      do { x = rnd(120, WORLD - 120); y = rnd(120, WORLD - 120); } while (Math.hypot(x - this.px, y - this.py) < 420);
      this.fauna.push({ x, y, vx: 0, vy: 0, docileUntil: 0, hitCd: 0, wanderT: 0 });
    }

    if (b.id === "volcano") for (let i = 0; i < 9; i++) this.hazards.push({ x: rnd(150, WORLD - 150), y: rnd(150, WORLD - 150), r: rnd(60, 110) });
    if (b.id === "reef") for (let i = 0; i < 9; i++) this.hazards.push({ x: rnd(150, WORLD - 150), y: rnd(150, WORLD - 150), r: rnd(80, 140) });

    const exEmoji = b.id === "woods" ? ["🪨", "🎈"] : b.id === "volcano" ? ["🪨", "🛗"] : ["🎈", "🛗"];
    const exName = ["Old Stone Oven", "Hot Air Balloon", "Magic Dumbwaiter"];
    for (let i = 0; i < 2; i++) {
      let x = 0, y = 0;
      do { x = rnd(200, WORLD - 200); y = rnd(200, WORLD - 200); } while (Math.hypot(x - this.px, y - this.py) < 700);
      this.extracts.push({ x, y, emoji: exEmoji[i], name: exName[(Math.random() * 3) | 0] });
    }
    this.eyeX = this.extracts[0].x; this.eyeY = this.extracts[0].y;
  }

  private keydown = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    this.keys[e.key.toLowerCase()] = true;
    if (e.key === " ") this.tryHarvest();
    if (/^[1-9]$/.test(e.key)) this.useDish(parseInt(e.key) - 1);
    if (e.key.toLowerCase() === "r") this.eatRawBest();
  };
  private keyup = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };
  private bind() { window.addEventListener("keydown", this.keydown); window.addEventListener("keyup", this.keyup); }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
  }

  // ── public actions (called from React UI too) ──────────────────
  startCook(recipeId: string) {
    if (this.cooking) return;
    const r = RECIPES[recipeId];
    if (!r || !this.canCook(r)) { this.say("Missing ingredients.", 2); return; }
    // consume inputs (freshest last — consume most-rotted first)
    for (const [iid, qty] of Object.entries(r.inputs)) {
      let need = qty;
      this.items.sort((a, b) => a.rotAt - b.rotAt);
      this.items = this.items.filter(it => {
        if (need > 0 && it.kind === "ing" && it.id === iid && !it.spoiled) { need--; return false; }
        return true;
      });
    }
    this.cooking = { recipe: r, left: this.stats.cookTime };
    this.say(`Deployed stove — cooking ${r.name}…`, this.stats.cookTime);
  }

  private canCook(r: RecipeDef) {
    if (this.slotsUsed() - this.inputSlots(r) + r.size > this.stats.slots) return false;
    return Object.entries(r.inputs).every(([iid, qty]) =>
      this.items.filter(it => it.kind === "ing" && it.id === iid && !it.spoiled).length >= qty);
  }
  private inputSlots(r: RecipeDef) {
    return Object.entries(r.inputs).reduce((s, [iid, q]) => s + INGREDIENTS[iid].size * q, 0);
  }

  dropItem(uid: number) {
    this.items = this.items.filter(i => i.uid !== uid);
  }

  private useDish(idx: number) {
    const dishes = this.items.filter(i => i.kind === "dish");
    const d = dishes[idx];
    if (!d) return;
    const r = RECIPES[d.id];
    this.items = this.items.filter(i => i.uid !== d.uid);
    if (r.buff === "purge") {
      // thrown: pacify fauna within radius
      let hit = 0;
      for (const f of this.fauna) if (Math.hypot(f.x - this.px, f.y - this.py) < 320) { f.docileUntil = this.t + r.buffSeconds; hit++; }
      this.say(hit ? `Purge soup splashes — ${hit} creature(s) docile!` : "Purge soup splashes… nothing nearby.", 2.5);
      return;
    }
    this.hunger = Math.min(100, this.hunger + r.hunger);
    if (r.buff !== "none" && r.buff !== "feast") {
      this.buffs = this.buffs.filter(b => b.kind !== r.buff);
      this.buffs.push({ kind: r.buff, until: this.t + r.buffSeconds });
    }
    this.say(`Ate ${r.name}. ${r.buff === "shield" ? "Starch armor up!" : r.buff === "dash" ? "Pepper rush!" : "+" + r.hunger + " hunger."}`, 2.5);
  }

  private eatRawBest() {
    // eat the raw edible closest to rotting
    const edible = this.items
      .filter(i => i.kind === "ing" && !i.spoiled && INGREDIENTS[i.id].rawEat)
      .sort((a, b) => a.rotAt - b.rotAt)[0];
    if (!edible) { this.say("Nothing edible raw.", 2); return; }
    const def = INGREDIENTS[edible.id];
    this.items = this.items.filter(i => i.uid !== edible.uid);
    this.hunger = Math.min(100, this.hunger + def.rawEat!.hunger);
    if (def.rawEat!.effect === "dot") {
      this.buffs.push({ kind: "dash", until: this.t + 4 });
      this.buffs.push({ kind: "dot", until: this.t + 6 });
    }
    if (def.rawEat!.effect === "hallucinate") this.buffs.push({ kind: "hallucinate", until: this.t + 8 });
    if (def.rawEat!.effect === "fullRestore") this.hunger = 100;
    this.say(`Ate raw ${def.name}. ${def.rawEat!.note}`, 3);
  }

  private tryHarvest() {
    if (this.harvesting || this.cooking) return;
    const n = this.nodes.find(n => !n.gone && Math.hypot(n.x - this.px, n.y - this.py) < 64);
    if (!n) return;
    const def = INGREDIENTS[n.id];
    if (this.slotsUsed() + def.size > this.stats.slots) { this.say("Backpack full! Cook, eat or drop something.", 2.5); return; }
    this.harvesting = { node: n, left: this.stats.harvestTime };
  }

  private slotsUsed() {
    return this.items.reduce((s, it) => s + (it.kind === "ing" ? INGREDIENTS[it.id].size : RECIPES[it.id].size), 0);
  }

  private haulValue() {
    return this.items.reduce((s, it) => {
      const base = it.kind === "ing" ? INGREDIENTS[it.id].value : RECIPES[it.id].value;
      return s + Math.round(it.spoiled ? base * 0.1 : base);
    }, 0);
  }

  private say(m: string, secs: number) { this.msg = m; this.msgUntil = this.t + secs; }
  private hasBuff(k: string) { return this.buffs.some(b => b.kind === k && b.until > this.t); }

  // ── main loop ──────────────────────────────────────────────────
  private loop = (now: number) => {
    if (this.ended) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.update(dt);
    this.render();
    this.hudAccum += dt;
    if (this.hudAccum > 0.12) { this.hudAccum = 0; this.pushHud(); }
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    const b = this.biome;
    // movement
    let dx = 0, dy = 0;
    if (this.keys["w"] || this.keys["arrowup"]) dy -= 1;
    if (this.keys["s"] || this.keys["arrowdown"]) dy += 1;
    if (this.keys["a"] || this.keys["arrowleft"]) dx -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) dx += 1;
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy);
      let speed = 190;
      if (this.hasBuff("dash")) speed *= 1.8;
      if (this.hasBuff("hallucinate")) speed *= 0.85;
      // reef currents slow you
      if (b.id === "reef") for (const h of this.hazards) if (Math.hypot(h.x - this.px, h.y - this.py) < h.r) speed *= 0.55;
      this.px = Math.max(40, Math.min(WORLD - 40, this.px + (dx / len) * speed * dt));
      this.py = Math.max(40, Math.min(WORLD - 40, this.py + (dy / len) * speed * dt));
      if (this.harvesting) { this.harvesting = null; this.say("Harvest interrupted.", 1.5); }
      if (this.cooking) {
        // stove abandoned: refund nothing (risk!)
        this.cooking = null; this.say("You left the stove — dish ruined!", 2.5);
      }
    }

    // hunger
    this.hunger -= (moving ? 1.45 : 1.0) * dt;
    if (this.hasBuff("dot")) this.hp -= 3.5 * dt;
    if (this.hunger <= 0) return this.finish("fainted");
    if (this.hp <= 0) return this.finish("slain");

    // harvesting
    if (this.harvesting) {
      this.harvesting.left -= dt;
      if (this.harvesting.left <= 0) {
        const n = this.harvesting.node;
        n.gone = true; n.respawnAt = this.t + 60;
        const def = INGREDIENTS[n.id];
        this.items.push({ uid: this.nextUid++, kind: "ing", id: n.id, rotAt: this.t + def.rotSeconds * this.stats.rotMult, spoiled: false });
        this.say(`Harvested ${def.emoji} ${def.name}!`, 2);
        this.harvesting = null;
      }
    }
    for (const n of this.nodes) if (n.gone && this.t > n.respawnAt && Math.random() < 0.002) n.gone = false;

    // cooking
    if (this.cooking) {
      this.cooking.left -= dt;
      if (this.cooking.left <= 0) {
        const r = this.cooking.recipe;
        this.items.push({ uid: this.nextUid++, kind: "dish", id: r.id, rotAt: Infinity, spoiled: false });
        this.say(`${r.emoji} ${r.name} plated! Press its number key to use.`, 3);
        this.cooking = null;
      }
    }

    // rot
    for (const it of this.items) if (!it.spoiled && it.rotAt < this.t) { it.spoiled = true; this.say("Something in your pack just rotted…", 2); }

    // fauna AI
    for (const f of this.fauna) {
      f.hitCd -= dt;
      const dpx = this.px - f.x, dpy = this.py - f.y;
      const dist = Math.hypot(dpx, dpy);
      const docile = f.docileUntil > this.t;
      if (!docile && dist < 360) {
        const sp = b.faunaSpeed * (dist < 60 ? 0 : 1);
        f.x += (dpx / dist) * sp * dt;
        f.y += (dpy / dist) * sp * dt;
        if (dist < 46 && f.hitCd <= 0) {
          f.hitCd = 1.1;
          const dmg = this.hasBuff("shield") ? b.faunaDamage * 0.25 : b.faunaDamage;
          this.hp -= dmg;
          this.say(`${b.faunaEmoji} ${b.faunaName} hits you for ${Math.round(dmg)}!`, 1.5);
        }
      } else {
        f.wanderT -= dt;
        if (f.wanderT <= 0) { f.wanderT = 1.5 + Math.random() * 2; const a = Math.random() * Math.PI * 2; f.vx = Math.cos(a) * 40; f.vy = Math.sin(a) * 40; }
        f.x = Math.max(60, Math.min(WORLD - 60, f.x + f.vx * dt));
        f.y = Math.max(60, Math.min(WORLD - 60, f.y + f.vy * dt));
      }
    }

    // volcano lava damage
    if (b.id === "volcano") for (const h of this.hazards) if (Math.hypot(h.x - this.px, h.y - this.py) < h.r) this.hp -= 9 * dt;

    // storm
    const stormElapsed = this.t - b.stormDelay;
    if (stormElapsed > 0) {
      this.stormRadius = Math.max(140, WORLD - (stormElapsed / 130) * WORLD);
      const d = Math.hypot(this.px - this.eyeX, this.py - this.eyeY);
      if (d > this.stormRadius) { this.hp -= 6 * dt; this.hunger -= 2.5 * dt; }
    }

    // extraction
    const inZone = this.extracts.some(e => Math.hypot(e.x - this.px, e.y - this.py) < 80);
    if (inZone) {
      this.extractProgress += dt / 3;
      if (this.extractProgress >= 1) return this.finish("extracted");
    } else this.extractProgress = 0;
  }

  private finish(outcome: RunResult["outcome"]) {
    this.ended = true;
    this.destroy();
    const kept = outcome === "extracted" ? this.items : [];
    const gold = outcome === "extracted" ? this.haulValue() : 0;
    const xp = outcome === "extracted" ? Math.round(40 + gold * 0.6) : 15;
    this.onEnd({ outcome, gold, xp, items: kept, time: this.t, biome: this.biome.id });
  }

  private pushHud() {
    const b = this.biome;
    const stormIn = b.stormDelay - this.t;
    const d = Math.hypot(this.px - this.eyeX, this.py - this.eyeY);
    const craftable = this.cooking ? [] : this.stats.knownRecipes.filter(rid => this.canCook(RECIPES[rid]));
    this.onHud({
      hp: Math.max(0, this.hp),
      hunger: Math.max(0, this.hunger),
      time: this.t,
      stormIn,
      stormRadius: this.stormRadius,
      inStorm: stormIn <= 0 && d > this.stormRadius,
      slotsUsed: this.slotsUsed(),
      slotsMax: this.stats.slots,
      items: [...this.items],
      buffs: this.buffs.filter(bf => bf.until > this.t).map(bf => ({ kind: bf.kind, left: bf.until - this.t })),
      cooking: this.cooking ? { recipe: this.cooking.recipe.name, left: this.cooking.left } : null,
      extracting: this.extracts.some(e => Math.hypot(e.x - this.px, e.y - this.py) < 80) ? this.extractProgress : -1,
      message: this.t < this.msgUntil ? this.msg : "",
      craftable,
      haulValue: this.haulValue(),
    });
  }

  // ── render ─────────────────────────────────────────────────────
  private render() {
    const c = this.ctx, b = this.biome;
    const W = this.canvas.width, H = this.canvas.height;
    const camX = Math.max(0, Math.min(WORLD - W, this.px - W / 2));
    const camY = Math.max(0, Math.min(WORLD - H, this.py - H / 2));

    c.save();
    if (this.hasBuff("hallucinate")) {
      c.translate(W / 2, H / 2);
      c.rotate(Math.sin(this.t * 2) * 0.03);
      c.scale(1 + Math.sin(this.t * 3) * 0.02, 1 + Math.cos(this.t * 2.5) * 0.02);
      c.translate(-W / 2, -H / 2);
    }

    c.fillStyle = b.bg;
    c.fillRect(0, 0, W, H);

    // subtle ground texture
    c.fillStyle = b.accent + "22";
    for (let gx = -(camX % 120); gx < W; gx += 120)
      for (let gy = -(camY % 120); gy < H; gy += 120)
        c.fillRect(gx, gy, 2, 2);

    c.translate(-camX, -camY);

    // world border
    c.strokeStyle = b.accent;
    c.lineWidth = 6;
    c.strokeRect(20, 20, WORLD - 40, WORLD - 40);

    // hazards
    for (const h of this.hazards) {
      c.beginPath();
      c.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      c.fillStyle = b.id === "volcano" ? "rgba(255,90,30,0.35)" : "rgba(80,160,220,0.18)";
      c.fill();
    }

    // extraction zones
    for (const e of this.extracts) {
      c.beginPath();
      c.arc(e.x, e.y, 80, 0, Math.PI * 2);
      c.strokeStyle = "#e8b54a";
      c.setLineDash([10, 8]);
      c.lineWidth = 3;
      c.stroke();
      c.setLineDash([]);
      c.font = "40px serif";
      c.textAlign = "center";
      c.fillText(e.emoji, e.x, e.y + 14);
      c.font = "13px sans-serif";
      c.fillStyle = "#e8b54a";
      c.fillText("EXTRACT", e.x, e.y + 56);
    }

    // nodes
    c.textAlign = "center";
    for (const n of this.nodes) {
      if (n.gone) continue;
      const def = INGREDIENTS[n.id];
      c.font = "30px serif";
      c.fillText(def.emoji, n.x, n.y + 10);
      if (Math.hypot(n.x - this.px, n.y - this.py) < 64) {
        c.font = "12px sans-serif";
        c.fillStyle = "#fff";
        c.fillText(`SPACE · ${def.name}`, n.x, n.y - 26);
      }
    }

    // fauna
    for (const f of this.fauna) {
      c.font = "34px serif";
      c.globalAlpha = f.docileUntil > this.t ? 0.45 : 1;
      c.fillText(b.faunaEmoji, f.x, f.y + 12);
      if (f.docileUntil > this.t) { c.font = "16px serif"; c.fillText("💤", f.x + 18, f.y - 14); }
      c.globalAlpha = 1;
    }

    // player (+ stove while cooking)
    if (this.cooking) { c.font = "26px serif"; c.fillText("🔥", this.px + 26, this.py + 10); }
    c.font = "34px serif";
    c.fillText("🧑‍🍳", this.px, this.py + 12);
    if (this.hasBuff("shield")) {
      c.beginPath(); c.arc(this.px, this.py, 32, 0, Math.PI * 2);
      c.strokeStyle = "rgba(240,230,180,0.8)"; c.lineWidth = 3; c.stroke();
    }
    if (this.harvesting) {
      const p = 1 - this.harvesting.left / this.stats.harvestTime;
      c.fillStyle = "#222"; c.fillRect(this.px - 26, this.py - 40, 52, 7);
      c.fillStyle = "#7ad97a"; c.fillRect(this.px - 26, this.py - 40, 52 * p, 7);
    }

    // storm overlay (donut outside radius)
    if (this.t > b.stormDelay) {
      c.save();
      c.beginPath();
      c.rect(camX - 50, camY - 50, W + 100, H + 100);
      c.arc(this.eyeX, this.eyeY, this.stormRadius, 0, Math.PI * 2, true);
      c.fillStyle = "rgba(110,60,140,0.45)";
      c.fill();
      c.beginPath();
      c.arc(this.eyeX, this.eyeY, this.stormRadius, 0, Math.PI * 2);
      c.strokeStyle = "rgba(190,120,230,0.9)";
      c.lineWidth = 4;
      c.stroke();
      c.restore();
    }

    c.restore();

    // darkness vignette (woods/reef) — glow-shroom in pack widens light
    if (b.dark) {
      const hasGlow = this.items.some(i => i.kind === "ing" && i.id === "glow_shroom" && !i.spoiled);
      const r = hasGlow ? 420 : 260;
      const g = c.createRadialGradient(W / 2, H / 2, r * 0.5, W / 2, H / 2, r * 1.6);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.82)");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }

    // mini-map
    const ms = 130, mx = W - ms - 14, my = 14;
    c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(mx, my, ms, ms);
    c.strokeStyle = "#555"; c.strokeRect(mx, my, ms, ms);
    const sc = ms / WORLD;
    for (const e of this.extracts) { c.fillStyle = "#e8b54a"; c.fillRect(mx + e.x * sc - 2, my + e.y * sc - 2, 5, 5); }
    if (this.t > b.stormDelay) {
      c.beginPath(); c.arc(mx + this.eyeX * sc, my + this.eyeY * sc, this.stormRadius * sc, 0, Math.PI * 2);
      c.strokeStyle = "rgba(190,120,230,0.9)"; c.lineWidth = 1.5; c.stroke();
    }
    c.fillStyle = "#fff"; c.beginPath(); c.arc(mx + this.px * sc, my + this.py * sc, 3, 0, Math.PI * 2); c.fill();
  }
}
