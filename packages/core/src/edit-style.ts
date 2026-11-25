import type { z } from "zod";
import { DEFAULT_EDIT_STYLE, EDIT_STYLE_NAMES, STYLE_FIELD_DEFAULTS, type EditStyleName, type EditStyleSource } from "./edit-style-names.js";
import { captionEmphasisOf, type CaptionEmphasisItem, type CaptionPresetId, isNarratedUgcInput, MAX_CAPTION_EMPHASIS, MAX_CAPTION_EMPHASIS_CHARS,
  speechModelRefusals } from "./skills.js";
import { lexicalTokens, quoteOccurrences } from "./semantic-inserts.js";
import { hasFullFrameTemplate } from "./templates/index.js";
import { MAX_SCRIPT_CHARS } from "./voices.js";

export const EMPHASIS_KINDS = ["number", "offer", "name", "cta", "negation", "look"] as const;
export type EmphasisKind = (typeof EMPHASIS_KINDS)[number];

export interface EditStyle {
  readonly captions: boolean;
  readonly caption_style?: CaptionPresetId;
  readonly emphasis: readonly EmphasisKind[];
  readonly edit_sounds: boolean;
  readonly punch_in: boolean;
}

export const EDIT_STYLES: Readonly<Record<EditStyleName, EditStyle>> = Object.freeze({
  "house-v1": { captions: true, caption_style: "hormozi", emphasis: ["number", "offer", "name", "cta"], edit_sounds: true, punch_in: false },
  "calm-v1": { captions: true, caption_style: "accent", emphasis: ["name", "cta"], edit_sounds: false, punch_in: false },
  "bold-v1": { captions: true, caption_style: "hormozi", emphasis: EMPHASIS_KINDS, edit_sounds: true, punch_in: true },
  bare: { captions: false, emphasis: [], edit_sounds: false, punch_in: false },
});

export const EDIT_STYLE_FIELDS = ["caption_emphasis", "edit_sounds", "caption_style", "captions"] as const;
export type EditStyleField = (typeof EDIT_STYLE_FIELDS)[number];
type StyleField = EditStyleField;
const CAPTION_DEPENDENTS: readonly StyleField[] = ["caption_emphasis", "caption_style"];

export interface AppliedEditStyle {
  name: EditStyleName;
  source: EditStyleSource;
  fields: StyleField[];
  left_out: string[];
}
export interface StyleExpansion {
  body: unknown;
  style?: AppliedEditStyle;
}
export interface ExpandEditStyleOptions {
  defaultStyle: boolean;
  longForm: boolean;
  emphasis?: (script: string, kinds: readonly EmphasisKind[]) => readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const isStyleName = (value: unknown): value is EditStyleName => EDIT_STYLE_NAMES.includes(value as EditStyleName);

function hasCuts(raw: Record<string, unknown>): boolean {
  if (raw.inserts !== undefined || raw.layout_windows !== undefined || raw.framing !== undefined) return true;
  try { return hasFullFrameTemplate(raw.templates); } catch { return false; }
}

export function expandEditStyle(raw: unknown, options: ExpandEditStyleOptions): StyleExpansion {
  if (!isRecord(raw)) return { body: raw };
  const asked = raw.edit_style;
  if (asked !== undefined && !isStyleName(asked)) return { body: raw };
  const name = asked ?? (options.defaultStyle ? DEFAULT_EDIT_STYLE : undefined);
  if (name === undefined) return { body: raw };
  const style = EDIT_STYLES[name], body: Record<string, unknown> = { ...raw }, fields: StyleField[] = [], leftOut: string[] = [];
  const applied = (): AppliedEditStyle => ({ name, source: asked === undefined ? "default" : "asked", fields, left_out: leftOut });
  if (!style.captions) return { body, style: applied() };
  let captions = raw.captions === true;
  if (!("captions" in raw)) {
    const refused = speechModelRefusals({ tts_model: text(raw.tts_model), voice: text(raw.voice), captions: true }).some(one => one.field === "captions");
    if (raw.segments !== undefined) leftOut.push("captions: a video of segments takes none");
    else if (refused) leftOut.push("captions: the voice's speech model returns no word timings");
    else { body.captions = true; fields.push("captions"); captions = true; }
  }
  if (captions && style.caption_style !== undefined && !("caption_style" in raw)) { body.caption_style = style.caption_style; fields.push("caption_style"); }
  const script = text(raw.script), readable = script !== undefined && script.length <= MAX_SCRIPT_CHARS;
  if (captions && style.emphasis.length > 0 && !("caption_emphasis" in raw) && readable && options.emphasis) {
    const quotes = [...new Set(options.emphasis(script, style.emphasis))]
      .filter(quote => quote.trim().length > 0 && quote.length <= MAX_CAPTION_EMPHASIS_CHARS).slice(0, MAX_CAPTION_EMPHASIS);
    const punch = style.punch_in && options.longForm && isNarratedUgcInput(raw);
    if (quotes.length > 0) { body.caption_emphasis = quotes.map(quote => (punch ? { quote, punch_in: true } : quote)); fields.push("caption_emphasis"); }
  }
  if (style.edit_sounds && !("edit_sounds" in raw) && raw.template_sounds !== false && hasCuts(raw)) { body.edit_sounds = true; fields.push("edit_sounds"); }
  return { body, style: applied() };
}

function withStyleFields(expansion: StyleExpansion, keep: readonly StyleField[]): StyleExpansion {
  if (!expansion.style || !isRecord(expansion.body)) return expansion;
  const body = { ...expansion.body };
  for (const field of expansion.style.fields) if (!keep.includes(field)) delete body[field];
  return { body, style: { ...expansion.style, fields: expansion.style.fields.filter(field => keep.includes(field)) } };
}

export function leaveOutStyleFields(expansion: StyleExpansion, hits: readonly { field: string; reason: string }[]): StyleExpansion {
  const style = expansion.style;
  if (!style) return expansion;
  const why = new Map(hits.filter(hit => style.fields.includes(hit.field as StyleField)).map(hit => [hit.field as StyleField, hit.reason]));
  const captions = why.get("captions");
  if (captions !== undefined) for (const dependent of CAPTION_DEPENDENTS) if (style.fields.includes(dependent) && !why.has(dependent)) why.set(dependent, captions);
  if (why.size === 0) return expansion;
  const kept = withStyleFields(expansion, style.fields.filter(field => !why.has(field)));
  kept.style!.left_out = [...style.left_out, ...style.fields.filter(field => why.has(field)).map(field => `${field}: ${shortReason(why.get(field)!)}`)];
  return kept;
}

const REASON_CHARS = 200;
const shortReason = (message: string) => (message.length > REASON_CHARS ? `${message.slice(0, REASON_CHARS - 1)}…` : message);

export function parseStyled<T>(schema: z.ZodType<T>, expansion: StyleExpansion):
  { success: true; data: T; expansion: StyleExpansion } | { success: false; error: z.ZodError } {
  let current = expansion;
  for (;;) {
    const parsed = schema.safeParse(current.body);
    if (parsed.success) return { success: true, data: parsed.data, expansion: current };
    const style = current.style;
    if (!style || style.fields.length === 0) return { success: false, error: parsed.error };
    const hit = new Set(parsed.error.issues.map(issue => String(issue.path[0])).filter((field): field is StyleField => style.fields.includes(field as StyleField)));
    if (hit.has("captions")) for (const dependent of CAPTION_DEPENDENTS) hit.add(dependent);
    const dropped = hit.size > 0 ? style.fields.filter(field => hit.has(field)) : style.fields;
    if (hit.size === 0 && !schema.safeParse(withStyleFields(current, []).body).success) return { success: false, error: parsed.error };
    const reason = shortReason(parsed.error.issues[0]!.message);
    current = withStyleFields(current, style.fields.filter(field => !dropped.includes(field)));
    current.style!.left_out = [...style.left_out, ...dropped.map(field => `${field}: ${reason}`)];
  }
}

export interface EditStylePins {
  edit_style?: string | undefined;
  edit_style_source?: EditStyleSource | undefined;
  edit_style_fields?: string[] | undefined;
  edit_style_left_out?: string[] | undefined;
}
export interface RequestStylePins {
  edit_style?: EditStyleName;
  edit_style_source?: EditStyleSource;
  edit_style_fields?: string[];
  edit_style_left_out?: string[];
}
export const editStylePins = (style: AppliedEditStyle | undefined): RequestStylePins => style
  ? { edit_style: style.name, edit_style_source: style.source, edit_style_fields: [...style.fields], ...(style.left_out.length ? { edit_style_left_out: [...style.left_out] } : {}) }
  : {};
export const editStylePinsOf = (input: object): RequestStylePins => {
  const { edit_style, edit_style_source, edit_style_fields = [], edit_style_left_out } = input as EditStylePins;
  return edit_style_source === undefined || !isStyleName(edit_style) ? {} : { edit_style, edit_style_source, edit_style_fields: [...edit_style_fields],
    ...(edit_style_left_out?.length ? { edit_style_left_out: [...edit_style_left_out] } : {}) };
};

export function askedUgcBody<T extends object>(input: T): T {
  const pins = input as EditStylePins;
  if (pins.edit_style_source === undefined) return input;
  const { edit_style_source: _source, edit_style_fields: fields = [], edit_style_left_out: _left, ...rest } = input as T & EditStylePins;
  const body: Record<string, unknown> = { ...rest };
  if (pins.edit_style_source === "default") delete body.edit_style;
  for (const field of fields) delete body[field];
  return body as T;
}

export function withoutStyleCaptions<T extends object>(input: T, reason: string): T {
  const fields = (input as EditStylePins).edit_style_fields ?? [];
  if (!fields.includes("captions")) return input;
  const body: Record<string, unknown> = { ...input as Record<string, unknown> };
  const given = (["captions", ...CAPTION_DEPENDENTS] as const).filter(field => fields.includes(field));
  for (const field of given) {
    if (field in STYLE_FIELD_DEFAULTS) body[field] = STYLE_FIELD_DEFAULTS[field as keyof typeof STYLE_FIELD_DEFAULTS];
    else delete body[field];
  }
  body.edit_style_fields = fields.filter(field => !given.includes(field as (typeof given)[number]));
  body.edit_style_left_out = [...(input as EditStylePins).edit_style_left_out ?? [], `captions: ${reason}`];
  return body as T;
}

const NEEDS_CAPTIONS = ["caption_emphasis", "caption_position", "caption_place", "caption_mode"] as const;
export function styleCaptionsRefusal(input: object, reason: string): string | undefined {
  const values = input as Record<string, unknown>, fields = (input as EditStylePins).edit_style_fields ?? [];
  if (values.captions === true) return undefined;
  const own = NEEDS_CAPTIONS.filter(field => values[field] !== undefined && !fields.includes(field) && (field !== "caption_mode" || values[field] === "highlights"));
  return own.length === 0 ? undefined : `${own.join(", ")} ${own.length === 1 ? "needs" : "need"} captions, which the style turned on and then left out: ` +
    `${reason}. Pick a voice whose speech model times words, or drop ${own.join(", ")}`;
}

export function withStyleEmphasisOn<T extends object>(input: T, script: string, reason: string): T {
  const values = input as Record<string, unknown>, fields = (input as EditStylePins).edit_style_fields ?? [];
  const items = values.caption_emphasis as CaptionEmphasisItem[] | undefined;
  if (!fields.includes("caption_emphasis") || !items?.length) return input;
  const tokens = lexicalTokens(script);
  const said = items.filter(item => quoteOccurrences(tokens, captionEmphasisOf(item).quote).length > 0);
  if (said.length === items.length) return input;
  const gone = items.filter(item => !said.includes(item)).map(item => `"${captionEmphasisOf(item).quote}"`).join(", ");
  const body: Record<string, unknown> = { ...values, edit_style_left_out: [...(input as EditStylePins).edit_style_left_out ?? [],
    shortReason(`caption_emphasis ${gone}: ${reason}`)] };
  if (said.length > 0) body.caption_emphasis = said;
  else { delete body.caption_emphasis; body.edit_style_fields = fields.filter(field => field !== "caption_emphasis"); }
  return body as T;
}

export function editStyleLines(input: object): string[] {
  const { edit_style: name, edit_style_source: source, edit_style_fields: fields = [], edit_style_left_out: leftOut = [] } = input as EditStylePins;
  if (source === undefined || name === undefined) return [];
  const choice = name === "bare" ? `Style: bare (${source}): no captions, emphasis or cut sounds added.`
    : fields.length === 0 ? `Style: ${name} (${source}): it set no field; the request sets them itself.`
      : `Style: ${name} (${source}) set ${fields.join(", ")}. A field you pass wins over it; edit_style "bare" sets none.`;
  return [choice, ...(leftOut.length ? [`Style ${name} left out ${leftOut.join("; ")}.`] : [])];
}

export function editStyleApplied(input: object): { name: string; source: EditStyleSource; fields: Record<string, unknown>; left_out?: string[] } | undefined {
  const { edit_style: name, edit_style_source: source, edit_style_fields: fields = [], edit_style_left_out: leftOut = [] } = input as EditStylePins;
  if (source === undefined || name === undefined) return undefined;
  const values = input as unknown as Record<string, unknown>;
  return { name, source, fields: Object.fromEntries(fields.map(field => [field, values[field]])), ...(leftOut.length ? { left_out: leftOut } : {}) };
}
