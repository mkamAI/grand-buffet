// ── The Grand Buffet · static game data ─────────────────────────────

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface IngredientDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  size: number;        // inventory slots consumed
  value: number;       // raw sell value (gold)
  rotSeconds: number;  // time until spoiled (modified by backpack)
  rawEat?: { hunger: number; effect?: "dot" | "hallucinate" | "fullRestore"; note: string };
  biomes: string[];    // spawn pools
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  wild_rice:      { id: "wild_rice", name: "Wild Rice", emoji: "🌾", rarity: "common", size: 1, value: 5,  rotSeconds: 300, rawEat: { hunger: 6, note: "Bland but safe." }, biomes: ["woods", "volcano", "reef"] },
  root_veg:       { id: "root_veg", name: "Root Vegetable", emoji: "🥕", rarity: "common", size: 1, value: 4, rotSeconds: 260, rawEat: { hunger: 8, note: "Crunchy." }, biomes: ["woods", "volcano"] },
  broth_base:     { id: "broth_base", name: "Baseline Broth", emoji: "🫙", rarity: "common", size: 1, value: 6, rotSeconds: 300, biomes: ["woods", "volcano", "reef"] },
  ghost_pepper:   { id: "ghost_pepper", name: "Ghost Fire Pepper", emoji: "🌶️", rarity: "rare", size: 2, value: 40, rotSeconds: 130, rawEat: { hunger: 4, effect: "dot", note: "Speed burst… then it burns." }, biomes: ["volcano", "woods"] },
  glow_shroom:    { id: "glow_shroom", name: "Glow-shroom", emoji: "🍄", rarity: "rare", size: 1, value: 30, rotSeconds: 150, rawEat: { hunger: 10, effect: "hallucinate", note: "Lights the dark. Warps the mind." }, biomes: ["woods", "reef"] },
  frost_kelp:     { id: "frost_kelp", name: "Frost Kelp", emoji: "🪸", rarity: "rare", size: 2, value: 35, rotSeconds: 140, biomes: ["reef"] },
  ember_root:     { id: "ember_root", name: "Ember Root", emoji: "🫚", rarity: "rare", size: 2, value: 35, rotSeconds: 140, biomes: ["volcano"] },
  leviathan_fish: { id: "leviathan_fish", name: "Leviathan Scale Fish", emoji: "🐟", rarity: "epic", size: 3, value: 90, rotSeconds: 95, biomes: ["reef"] },
  golden_truffle: { id: "golden_truffle", name: "Golden Truffle", emoji: "🍄‍🟫", rarity: "legendary", size: 2, value: 200, rotSeconds: 110, rawEat: { hunger: 100, effect: "fullRestore", note: "Eat it to live. Sell it to thrive." }, biomes: ["woods", "volcano", "reef"] },
};

export type BuffKind = "shield" | "dash" | "purge" | "feast" | "none";

export interface RecipeDef {
  id: string;
  name: string;
  emoji: string;
  inputs: Record<string, number>; // ingredientId -> qty
  hunger: number;                 // hunger restored when eaten
  buff: BuffKind;
  buffSeconds: number;
  value: number;                  // cooked sell value
  size: number;
  unlockCost: number;             // 0 = known from start
  unlockLevel: number;
  desc: string;
}

export const RECIPES: Record<string, RecipeDef> = {
  hearty_stew:    { id: "hearty_stew", name: "Hearty Stew", emoji: "🍲", inputs: { root_veg: 2, broth_base: 1 }, hunger: 45, buff: "none", buffSeconds: 0, value: 30, size: 1, unlockCost: 0, unlockLevel: 1, desc: "Restores 45 hunger. The field staple." },
  starch_shield:  { id: "starch_shield", name: "Starch Shield Risotto", emoji: "🍚", inputs: { wild_rice: 2, broth_base: 1 }, hunger: 25, buff: "shield", buffSeconds: 18, value: 45, size: 1, unlockCost: 0, unlockLevel: 1, desc: "+Armor 18s: tank fauna hits while harvesting." },
  pepper_dash:    { id: "pepper_dash", name: "Pepper Dash Stir-fry", emoji: "🥘", inputs: { ghost_pepper: 1, root_veg: 1 }, hunger: 15, buff: "dash", buffSeconds: 8, value: 70, size: 1, unlockCost: 150, unlockLevel: 2, desc: "+80% speed 8s: outrun the Spoilage Storm." },
  herbal_purge:   { id: "herbal_purge", name: "Herbal Purge Soup", emoji: "🥣", inputs: { glow_shroom: 1, broth_base: 1 }, hunger: 0, buff: "purge", buffSeconds: 10, value: 60, size: 1, unlockCost: 200, unlockLevel: 2, desc: "Throwable: blinds nearby fauna, makes them docile 10s." },
  sashimi:        { id: "sashimi", name: "Leviathan Sashimi", emoji: "🍣", inputs: { leviathan_fish: 1, frost_kelp: 1 }, hunger: 60, buff: "feast", buffSeconds: 0, value: 260, size: 2, unlockCost: 400, unlockLevel: 3, desc: "Restores 60 hunger. Critics pay a fortune." },
  ember_curry:    { id: "ember_curry", name: "Ember Curry", emoji: "🍛", inputs: { ember_root: 1, ghost_pepper: 1, wild_rice: 1 }, hunger: 50, buff: "dash", buffSeconds: 12, value: 240, size: 2, unlockCost: 400, unlockLevel: 3, desc: "50 hunger + 12s dash. Volcano specialty." },
  truffle_royale: { id: "truffle_royale", name: "Truffle Royale", emoji: "🍽️", inputs: { golden_truffle: 1, wild_rice: 1, broth_base: 1 }, hunger: 80, buff: "shield", buffSeconds: 25, value: 650, size: 2, unlockCost: 900, unlockLevel: 4, desc: "The signature dish. 80 hunger, 25s armor, critic bait." },
};

export interface BiomeDef {
  id: string;
  name: string;
  emoji: string;
  unlockLevel: number;
  bg: string;        // canvas base color
  accent: string;
  hazardNote: string;
  faunaEmoji: string;
  faunaName: string;
  faunaSpeed: number;
  faunaDamage: number;
  faunaCount: number;
  nodeCount: number;
  stormDelay: number; // seconds before storm starts shrinking
  dark?: boolean;     // glow-shroom matters here
}

export const BIOMES: Record<string, BiomeDef> = {
  woods:   { id: "woods", name: "The Whispering Woods", emoji: "🌲", unlockLevel: 1, bg: "#10231a", accent: "#3f7d4f", hazardNote: "Fog limits vision. Territorial boars.", faunaEmoji: "🐗", faunaName: "Territorial Boar", faunaSpeed: 95, faunaDamage: 14, faunaCount: 6, nodeCount: 26, stormDelay: 100, dark: true },
  volcano: { id: "volcano", name: "The Volcanic Kitchen", emoji: "🌋", unlockLevel: 2, bg: "#241312", accent: "#b3502c", hazardNote: "Lava pools deal contact damage. Fire crabs hit hard.", faunaEmoji: "🦀", faunaName: "Fire Crab", faunaSpeed: 80, faunaDamage: 20, faunaCount: 7, nodeCount: 24, stormDelay: 90 },
  reef:    { id: "reef", name: "The Sunken Reef", emoji: "🪼", unlockLevel: 3, bg: "#0c1c2c", accent: "#2e6f8e", hazardNote: "Currents slow you. Best fish in the realm.", faunaEmoji: "🦞", faunaName: "Reef Lobster", faunaSpeed: 105, faunaDamage: 16, faunaCount: 7, nodeCount: 24, stormDelay: 85, dark: true },
};

export interface UpgradeTier { name: string; cost: number; stat: number }
export interface UpgradeDef { id: string; name: string; emoji: string; statLabel: (v: number) => string; tiers: UpgradeTier[] }

export const UPGRADES: Record<string, UpgradeDef> = {
  stove: {
    id: "stove", name: "Portable Stove", emoji: "🔥",
    statLabel: v => `Cook time ${v}s`,
    tiers: [
      { name: "Camp Burner", cost: 0, stat: 4 },
      { name: "Brass Wok Station", cost: 250, stat: 2.5 },
      { name: "Dragonfire Range", cost: 700, stat: 1.4 },
    ],
  },
  backpack: {
    id: "backpack", name: "Insulated Backpack", emoji: "🎒",
    statLabel: v => `${v} slots`,
    tiers: [
      { name: "Burlap Sack", cost: 0, stat: 12 },
      { name: "Chiller Pack", cost: 300, stat: 16 },
      { name: "Cryo-Larder", cost: 850, stat: 22 },
    ],
  },
  knife: {
    id: "knife", name: "Chef Knife", emoji: "🔪",
    statLabel: v => `Harvest ${v}s`,
    tiers: [
      { name: "Dull Cleaver", cost: 0, stat: 2.4 },
      { name: "Honed Santoku", cost: 220, stat: 1.6 },
      { name: "Moonsteel Gyuto", cost: 650, stat: 0.9 },
    ],
  },
};

// Backpack tier also slows rot: tier index -> rot multiplier
export const ROT_MULT = [1.0, 0.7, 0.5];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9aa68f",
  rare: "#5fb4d9",
  epic: "#b07fe0",
  legendary: "#e8b54a",
};

export function xpForLevel(level: number) {
  return Math.round(120 * Math.pow(level, 1.6));
}
