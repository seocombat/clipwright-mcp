import { z } from "zod";
import { DESIGN_FONT_FAMILIES, DESIGN_LOOKS, DESIGN_PALETTE_ROLES, designPalette, DESIGN_MIN_CONTRAST, hexToHsl, hslToHex, readableShade,
  type DesignFont, type DesignInput, type DesignPalette, type DesignPaletteRole } from "./design.js";
import { contrastRatio } from "./templates/theme.js";

// A format skill's brand contract (#1291 F2): what a kit declares it takes from a brand, and the one resolver that turns the
// account's brand into the kit's own tokens, fonts and per-account variation. A kit with no manifest renders in its own style.

/** The closed set of rules a token may be derived by; a rule is data, never code. */
export const SKILL_THEME_FUNCTIONS = ["role", "mix", "shade", "alpha", "readable", "fixed"] as const;
export type SkillThemeFunction = (typeof SKILL_THEME_FUNCTIONS)[number];

const HEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\)$/;
const TOKEN_NAME = /^[a-z][A-Za-z0-9]{0,30}(?:\.[a-z][A-Za-z0-9]{0,30})?$/;
const AXIS_NAME = /^[a-z][a-z_]{0,30}$/;
const colour = z.string().refine(value => HEX.test(value) || RGBA.test(value), "must be #RRGGBB or rgba(r, g, b, a)");

/** One parsed rule. `a`/`b` name brand roles; `on` names another token; numbers are the rule's parameters. */
export type SkillThemeRule =
  | { fn: "role"; a: DesignPaletteRole }
  | { fn: "mix"; a: DesignPaletteRole; b: DesignPaletteRole; t: number }
  | { fn: "shade"; a: DesignPaletteRole; l: number }
  | { fn: "alpha"; a: DesignPaletteRole; x: number }
  | { fn: "readable"; a: DesignPaletteRole; on: string }
  | { fn: "fixed" };

const ROLE_SET: ReadonlySet<string> = new Set(DESIGN_PALETTE_ROLES);
const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** `mix(ink, background, 0.15)` → the rule, or a sentence saying why it is not one. */
export function parseSkillThemeRule(text: string): SkillThemeRule | string {
  const m = /^\s*([a-z]+)\s*\(\s*([^()]*)\)\s*$/.exec(text);
  if (!m) return `"${text}" is not fn(args)`;
  const fn = m[1]!, args = m[2]!.trim() === "" ? [] : m[2]!.split(",").map(s => s.trim());
  const role = (i: number) => (ROLE_SET.has(args[i] ?? "") ? args[i] as DesignPaletteRole : undefined);
  const num = (i: number, lo: number, hi: number) => {
    const v = NUMBER.test(args[i] ?? "") ? Number(args[i]) : Number.NaN;
    return v >= lo && v <= hi ? v : undefined;
  };
  const bad = (what: string) => `${fn}(${args.join(", ")}): ${what}`;
  switch (fn) {
    case "role": return args.length === 1 && role(0) ? { fn, a: role(0)! } : bad("takes one brand role");
    case "mix": {
      const t = num(2, 0, 1);
      return args.length === 3 && role(0) && role(1) && t !== undefined ? { fn, a: role(0)!, b: role(1)!, t } : bad("takes two roles and a share 0–1");
    }
    case "shade": {
      const l = num(1, -1, 1);
      return args.length === 2 && role(0) && l !== undefined ? { fn, a: role(0)!, l } : bad("takes a role and a lightness step −1–1");
    }
    case "alpha": {
      const x = num(1, 0, 1);
      return args.length === 2 && role(0) && x !== undefined ? { fn, a: role(0)!, x } : bad("takes a role and an opacity 0–1");
    }
    case "readable": return args.length === 2 && role(0) && TOKEN_NAME.test(args[1]!) ? { fn, a: role(0)!, on: args[1]! } : bad("takes a role and a token");
    case "fixed": return args.length === 0 ? { fn } : bad("takes nothing; the token keeps its default");
    default: return `${fn} is not one of ${SKILL_THEME_FUNCTIONS.join(", ")}`;
  }
}

export const SKILL_THEME_FONT_BINDINGS = ["brand.display", "brand.body", "fixed"] as const;
export const SKILL_THEME_LOGO_SLOTS = ["end_card", "corner", "in_scene"] as const;
export const SKILL_THEME_HERO_RIGS = ["atlas_9", "vector", "none"] as const;

/** A kit's theme.json. `roles` are the kit's own brand roles: a brand equal to them renders the kit exactly as its author drew it. */
export const skillThemeManifest = z.strictObject({
  version: z.literal(1),
  roles: designPalette,
  tokens: z.record(z.string().regex(TOKEN_NAME), z.strictObject({ rule: z.string().min(1).max(80), default: colour }))
    .refine(tokens => Object.keys(tokens).length >= 1 && Object.keys(tokens).length <= 80, "a kit names 1–80 tokens"),
  /** Text tokens over the fills they sit on, each held to 4.5:1 after the brand is applied. */
  pairs: z.array(z.tuple([z.string().regex(TOKEN_NAME), z.string().regex(TOKEN_NAME)])).max(40),
  fonts: z.record(z.string().regex(/^[a-z][a-z_]{0,20}$/), z.strictObject({ bind: z.enum(SKILL_THEME_FONT_BINDINGS), default: z.string().min(1).max(60) })),
  logo: z.union([z.literal("none"), z.array(z.enum(SKILL_THEME_LOGO_SLOTS)).min(1).max(3)]),
  hero: z.enum(SKILL_THEME_HERO_RIGS),
  /** What a brand never changes, so the style survives it; read by people and agents. */
  locks: z.array(z.string().min(1).max(60)).max(10),
  /** Axes the account's seed varies; each axis's first value is the kit's own. */
  variation: z.record(z.string().regex(AXIS_NAME), z.array(z.union([z.string().min(1).max(30), z.number()])).min(1).max(8)),
}).superRefine((manifest, context) => {
  for (const problem of skillThemeManifestProblems(manifest)) context.addIssue({ code: z.ZodIssueCode.custom, ...problem });
});
export type SkillThemeManifest = z.infer<typeof skillThemeManifest>;

/** Every rule parsed, every `readable` pointing at an earlier opaque token, every pair naming opaque tokens. */
function skillThemeManifestProblems(manifest: Pick<SkillThemeManifest, "tokens" | "pairs">): { path: (string | number)[]; message: string }[] {
  const problems: { path: (string | number)[]; message: string }[] = [], seen = new Set<string>();
  for (const [name, token] of Object.entries(manifest.tokens)) {
    const rule = parseSkillThemeRule(token.rule);
    if (typeof rule === "string") problems.push({ path: ["tokens", name, "rule"], message: rule });
    else if (rule.fn === "readable" && (!seen.has(rule.on) || !HEX.test(manifest.tokens[rule.on]!.default))) {
      problems.push({ path: ["tokens", name, "rule"], message: `readable() reads ${rule.on}, which must be an opaque token named before ${name}` });
    }
    seen.add(name);
  }
  for (const [i, pair] of manifest.pairs.entries()) {
    for (const [j, name] of pair.entries()) {
      const token = manifest.tokens[name];
      if (!token || !HEX.test(token.default)) problems.push({ path: ["pairs", i, j], message: `${name} is not an opaque token of this kit` });
    }
  }
  return problems;
}

// ── Colour arithmetic. Channels 0–255, alpha 0–1.
interface Rgba { r: number; g: number; b: number; a: number }
const parseColour = (text: string): Rgba => {
  if (HEX.test(text)) return { r: Number.parseInt(text.slice(1, 3), 16), g: Number.parseInt(text.slice(3, 5), 16), b: Number.parseInt(text.slice(5, 7), 16), a: 1 };
  const m = RGBA.exec(text);
  if (!m) throw new Error(`not a colour: ${text}`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number(m[4]) };
};
const hexOf = (c: Rgba) => `#${[c.r, c.g, c.b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const same = (x: Rgba, y: Rgba) => Math.round(x.r) === Math.round(y.r) && Math.round(x.g) === Math.round(y.g) && Math.round(x.b) === Math.round(y.b)
  && Math.abs(x.a - y.a) < 1e-9;
const formatColour = (c: Rgba): string => {
  if (c.a >= 1) return hexOf(c);
  const a = Number(c.a.toFixed(3));
  return `rgba(${[c.r, c.g, c.b].map(v => Math.round(Math.min(255, Math.max(0, v)))).join(", ")}, ${a})`;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Below this saturation a colour has no hue worth carrying over. */
const GREY = 0.06;

/** A rule's colour on one palette; `tokens` holds what `readable` reads. */
function evaluate(rule: Exclude<SkillThemeRule, { fn: "fixed" }>, palette: DesignPalette, tokens: Readonly<Record<string, string>>): Rgba {
  const role = (r: DesignPaletteRole) => parseColour(palette[r]);
  switch (rule.fn) {
    case "role": return role(rule.a);
    case "mix": {
      const x = role(rule.a), y = role(rule.b);
      return { r: x.r + (y.r - x.r) * rule.t, g: x.g + (y.g - x.g) * rule.t, b: x.b + (y.b - x.b) * rule.t, a: 1 };
    }
    case "shade": {
      const hsl = hexToHsl(palette[rule.a]);
      return parseColour(hslToHex({ ...hsl, l: clamp01(hsl.l + rule.l) }));
    }
    case "alpha": return { ...role(rule.a), a: rule.x };
    case "readable": return parseColour(readableShade(palette[rule.a], tokens[rule.on]!));
  }
}

/** D1: the kit's value moved by what the rule moved between the kit's roles and the brand's, in HSL. A value equal to its rule on the kit's
 *  roles is the rule's on the brand's; a rule that did not move leaves the kit's literal untouched. */
function carry(fallback: string, onKit: Rgba, onBrand: Rgba): string {
  const own = parseColour(fallback);
  if (same(onKit, onBrand)) return fallback;
  if (same(own, onKit)) return formatColour({ ...onBrand, a: own.a });
  const [k, b, o] = [onKit, onBrand, own].map(c => hexToHsl(hexOf(c))) as [ReturnType<typeof hexToHsl>, ReturnType<typeof hexToHsl>, ReturnType<typeof hexToHsl>];
  const h = k.s < GREY || o.s < GREY ? b.h : (o.h + (b.h - k.h) + 360) % 360;
  const moved = parseColour(hslToHex({ h, s: clamp01(o.s + (b.s - k.s)), l: clamp01(o.l + (b.l - k.l)) }));
  return formatColour({ ...moved, a: own.a });
}

/** Scripts that need the Cyrillic subset of a face. */
const CYRILLIC_LANGUAGES: ReadonlySet<string> = new Set(["ru", "uk", "be", "bg", "sr", "mk", "kk", "ky", "tg", "mn"]);
/** Which of our brand faces carry Cyrillic letters (the `cyrillic` subset of Google Fonts; a web test pins this to the bundled fonts). */
export const DESIGN_FONT_CYRILLIC: Readonly<Record<DesignFont, boolean>> = {
  "Plus Jakarta Sans": false, Inter: true, Montserrat: true, Roboto: true, "PT Sans": true, Oswald: true, "Bebas Neue": false, "Titan One": false,
  Bungee: false, Bangers: false, Caveat: true, "Permanent Marker": false,
};

/** The brand a skill film takes: palette roles, and fonts only where the brand chose them (a look's or its own), never our defaults. */
export interface SkillBrand { palette?: DesignPalette; fonts?: { display?: DesignFont; body?: DesignFont } }
export function skillBrandOf(design: DesignInput | null | undefined): SkillBrand {
  if (!design) return {};
  const look = design.look === undefined ? undefined : DESIGN_LOOKS[design.look];
  const palette = design.palette ?? look?.palette;
  const display = design.fonts?.display ?? look?.fonts.display, body = design.fonts?.body ?? look?.fonts.body;
  return { ...(palette ? { palette: { ...palette } } : {}),
    ...(display || body ? { fonts: { ...(display ? { display } : {}), ...(body ? { body } : {}) } } : {}) };
}

/** What a draft's call may set over the brand: roles, fonts and variation values, each winning over the brand kit. */
export const skillThemeOverrides = z.strictObject({
  palette: designPalette.partial().optional(),
  fonts: z.strictObject({ display: z.enum(DESIGN_FONT_FAMILIES).optional(), body: z.enum(DESIGN_FONT_FAMILIES).optional() }).optional(),
  variation: z.record(z.string().regex(AXIS_NAME), z.union([z.string().min(1).max(30), z.number()])).optional(),
});
export type SkillThemeOverrides = z.infer<typeof skillThemeOverrides>;

/** The theme a draft freezes and every still and render of it draws with. */
export const resolvedSkillTheme = z.strictObject({
  version: z.literal(1),
  tokens: z.record(z.string().regex(TOKEN_NAME), colour),
  fonts: z.record(z.string(), z.string().min(1).max(60)),
  variation: z.record(z.string().regex(AXIS_NAME), z.union([z.string(), z.number()])),
  hero: z.enum(SKILL_THEME_HERO_RIGS),
  logo: z.union([z.literal("none"), z.array(z.enum(SKILL_THEME_LOGO_SLOTS))]),
  /** Where the theme came from: the call's overrides, the account's brand kit, or the kit alone. */
  source: z.enum(["overrides", "brand_kit", "kit"]),
  warnings: z.array(z.string()),
});
export type ResolvedSkillTheme = z.infer<typeof resolvedSkillTheme>;

/** FNV-1a, 32 bits, with murmur3's finaliser so the low bits a small modulus reads are mixed: the same account picks the same variation on
 *  every machine, and neighbouring ids pick unlike ones. */
export function themeSeedHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

export interface ResolveSkillThemeInput {
  brand?: SkillBrand;
  overrides?: SkillThemeOverrides;
  /** The account's id: its variation seed. Absent, every axis keeps the kit's own value. */
  seed?: string;
  /** The script's language (ISO 639-1); a Cyrillic one keeps a brand face without Cyrillic off the kit. */
  language?: string;
}

/** The brand applied to a kit: precedence overrides → brand kit → the kit's own, then every declared text pair held to 4.5:1. */
export function resolveSkillTheme(manifest: SkillThemeManifest, input: ResolveSkillThemeInput = {}): ResolvedSkillTheme {
  const warnings: string[] = [];
  const palette = { ...manifest.roles, ...input.brand?.palette, ...stripUndefined(input.overrides?.palette) } as DesignPalette;
  const tokens: Record<string, string> = {}, onKit: Record<string, string> = {};
  for (const [name, token] of Object.entries(manifest.tokens)) {
    const rule = parseSkillThemeRule(token.rule);
    if (typeof rule === "string") throw new Error(`theme token ${name}: ${rule}`);
    onKit[name] = token.default;
    tokens[name] = rule.fn === "fixed" ? token.default : carry(token.default, evaluate(rule, manifest.roles, onKit), evaluate(rule, palette, tokens));
  }
  const fills = new Map<string, string[]>();
  for (const [text, fill] of manifest.pairs) fills.set(text, [...fills.get(text) ?? [], fill]);
  // A moved text token may be another pair's fill, so the pass repeats until nothing moves; each token keeps its last word.
  const moved = new Map<string, string>(), original = { ...tokens };
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [text, grounds] of fills) {
      const ground = grounds.map(g => tokens[g]!);
      if (worstContrast(tokens[text]!, ground) >= DESIGN_MIN_CONTRAST) continue;
      const shade = readableAgainst(tokens[text]!, ground), reached = worstContrast(shade, ground);
      if (shade === tokens[text]) continue;
      tokens[text] = shade;
      changed = true;
      moved.set(text, reached >= DESIGN_MIN_CONTRAST
        ? `${text} ${original[text]} was moved to ${shade} to read at ${DESIGN_MIN_CONTRAST}:1 on ${grounds.join(", ")}`
        : `${text} ${original[text]} was moved to ${shade}, which reaches only ${reached.toFixed(2)}:1 on ${grounds.join(", ")}: no shade of it reads at ` +
          `${DESIGN_MIN_CONTRAST}:1 on all of them`);
    }
    if (!changed) break;
  }
  warnings.push(...moved.values());
  const brandFonts = { ...input.brand?.fonts, ...stripUndefined(input.overrides?.fonts) };
  const cyrillic = input.language !== undefined && CYRILLIC_LANGUAGES.has(input.language.toLowerCase().slice(0, 2));
  const fonts: Record<string, string> = {};
  for (const [role, font] of Object.entries(manifest.fonts)) {
    const chosen = font.bind === "brand.display" ? brandFonts.display : font.bind === "brand.body" ? brandFonts.body : undefined;
    if (chosen === undefined) { fonts[role] = font.default; continue; }
    if (cyrillic && !DESIGN_FONT_CYRILLIC[chosen]) {
      fonts[role] = font.default;
      warnings.push(`${chosen} has no Cyrillic letters, so the ${role} text keeps ${font.default}`);
      continue;
    }
    fonts[role] = chosen;
  }
  const variation: Record<string, string | number> = {};
  for (const [axis, values] of Object.entries(manifest.variation)) {
    const asked = input.overrides?.variation?.[axis];
    if (asked !== undefined && values.includes(asked)) { variation[axis] = asked; continue; }
    if (asked !== undefined) warnings.push(`variation ${axis}=${String(asked)} is not one of ${values.join(", ")}; the account's own is kept`);
    variation[axis] = input.seed === undefined ? values[0]! : values[themeSeedHash(`${input.seed}:${axis}`) % values.length]!;
  }
  const source = input.overrides && (input.overrides.palette || input.overrides.fonts || input.overrides.variation) ? "overrides"
    : input.brand?.palette || input.brand?.fonts ? "brand_kit" : "kit";
  return { version: 1, tokens, fonts, variation, hero: manifest.hero, logo: manifest.logo, source, warnings };
}

const worstContrast = (colour: string, grounds: readonly string[]): number => Math.min(...grounds.map(g => contrastRatio(colour, g)));

/** The nearest shade that reads on every ground; with grounds on both sides of it, the lightness of its hue (or grey) that reads best on the
 *  worst of them, which the caller names when it is still under 4.5:1. */
function readableAgainst(colour: string, grounds: readonly string[]): string {
  let best = readableShade(colour, grounds);
  if (worstContrast(best, grounds) >= DESIGN_MIN_CONTRAST) return best;
  const { h, s } = hexToHsl(colour);
  for (const saturation of [s, 0]) {
    for (let step = 0; step <= 200; step++) {
      const shade = hslToHex({ h, s: saturation, l: step / 200 });
      if (worstContrast(shade, grounds) > worstContrast(best, grounds)) best = shade;
    }
  }
  return best;
}

const stripUndefined =<T extends object>(value: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
