import { z } from "zod";

// Template sounds (#778 S3c): the owner's library of 23.10, refreshed and extended on 25.10, one list of names per beat, with his default first in each.

export const TEMPLATE_SOUND_BEATS = ["click", "toggle", "ring", "answer", "notify", "step", "whoosh", "flash", "pop", "hangup", "money", "edit"] as const;
export type TemplateSoundBeat = (typeof TEMPLATE_SOUND_BEATS)[number];

/** Each beat's names, its default and where it plays; the composition bundles `<beat>__<name>.mp3` for each, and a test keeps the two equal. */
export const TEMPLATE_SOUNDS = {
  click: { default: "click_mouse", names: ["click_mouse", "click_soft", "click_crisp", "click_light"],
    plays: "a checklist's cursor clicks a row, on each click" },
  toggle: { default: "switch_flip", names: ["switch_flip", "toggle_snap", "switch_heavy", "switch_light"],
    plays: "a checklist row's switch or check box lands, just after each click" },
  ring: { default: "ring_classic", names: ["ring_classic", "ring_marimba", "ring_digital", "ring_double"],
    plays: "a phone_call rings from its pop, repeating, until it is answered; over a call it rings ring_double once, before the first line" },
  answer: { default: "answer_confirm", names: ["answer_confirm", "answer_open", "answer_pop", "answer_select", "pickup"],
    plays: "a phone_call is answered, on answer_at" },
  notify: { default: "chime", names: ["chime", "glass_ping", "glass_soft", "bong", "question_ping"], plays: "a notification drops in" },
  step: { default: "drop", names: ["drop", "drop_high", "tick", "pluck", "pluck_bright"], plays: "a progress step fills, and each rating star" },
  whoosh: { default: "whoosh", names: ["whoosh", "whip", "paper_swipe", "sweep", "slide_quick"],
    plays: "a full-frame template's wipe or zoom, in and out, and a compare's reveal" },
  flash: { default: "shutter", names: ["shutter", "glitch", "swish"], plays: "a full-frame template's flash, on each of its cuts" },
  pop: { default: "plop", names: ["plop"], plays: "a tag or a callout pops in" },
  hangup: { default: "phone", names: ["phone"], plays: "an answered phone_call hangs up, just before it leaves" },
  money: { default: "cash_register", names: ["cash_register", "coins"], plays: "a stat with a currency sign in its prefix or suffix counts up" },
  edit: { default: "swell_hit", names: ["swell_hit", "whoosh_deep", "whoosh_low", "boom_low", "sub_drop", "riser_boom", "riser_hit"],
    plays: "with edit_sounds, each cut: to or from an insert, a full-frame template's cut without its own whoosh or flash, a layout window's in and out; " +
      "its peak lands on the cut" },
} as const satisfies Record<TemplateSoundBeat, { default: string; names: readonly string[]; plays: string }>;

/** The beats each kind plays over the presenter; a full-frame template adds its transition's beat (see `templateSoundBeats`). */
export const TEMPLATE_KIND_SOUNDS: Readonly<Record<string, readonly TemplateSoundBeat[]>> = {
  checklist: ["click", "toggle"], phone_call: ["ring", "answer", "hangup"], notification: ["notify"], progress: ["step"], rating: ["step"], compare: ["whoosh"],
  tag: ["pop"], callout: ["pop"], stat: ["money"],
};

export type TemplateSoundMap = { [B in TemplateSoundBeat]: (typeof TEMPLATE_SOUNDS)[B]["names"][number] };
export const DEFAULT_TEMPLATE_SOUNDS = Object.freeze(Object.fromEntries(TEMPLATE_SOUND_BEATS.map(beat => [beat, TEMPLATE_SOUNDS[beat].default]))) as TemplateSoundMap;

const name = <B extends TemplateSoundBeat>(beat: B) => z.enum(TEMPLATE_SOUNDS[beat].names, {
  error: issue => `${JSON.stringify(issue.input)} is not ${/^[aeiou]/.test(beat) ? "an" : "a"} ${beat} sound: use ${TEMPLATE_SOUNDS[beat].names.join(", ")}`,
}).optional();
const overrides = z.strictObject({ click: name("click"), toggle: name("toggle"), ring: name("ring"), answer: name("answer"), notify: name("notify"),
  step: name("step"), whoosh: name("whoosh"), flash: name("flash"), pop: name("pop"), hangup: name("hangup"), money: name("money"), edit: name("edit") }, {
  error: issue => (issue.code === "unrecognized_keys" ? `template_sounds has no beat ${issue.keys.join(", ")}: the beats are ${TEMPLATE_SOUND_BEATS.join(", ")}` : undefined),
});

/** Why a value cannot be the field, with the beat's path; a union names no branch on its own, so the message does. */
function soundsRefusal(input: unknown): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "template_sounds is false (no sounds) or { beat: name }";
  const issue = overrides.safeParse(input).error?.issues[0];
  // zod 4.6 may surface the unknown-beat issue past the union, so that message carries its own path.
  if (issue?.code === "unrecognized_keys") return issue.message;
  return `${["template_sounds", ...(issue?.path ?? []).map(String)].join(".")} ${issue?.message ?? "is invalid"}`;
}

export const templateSounds = z.union([z.literal(false), overrides], { error: issue => soundsRefusal(issue.input) })
  .describe("Template sounds: false for none, or { beat: name } over the defaults; list_template_sounds names them.");
export type TemplateSounds = z.infer<typeof templateSounds>;
/** The slim MCP field, which keeps tools/list small: any beat and name pass here, and the server checks them strictly (S3 D3). */
export const mcpTemplateSounds = z.union([z.literal(false), z.record(z.string(), z.string())]).describe(templateSounds.description!);

/** Opt-in, so a run that never asked keeps its silent cuts (rule 3); no default in the schema. */
export const editSounds = z.boolean().describe("A low sound on every cut (insert, full-frame template, layout window, framing), its peak on the cut. " +
  "Needs inserts, layout_windows or framing; template_sounds.edit picks it (list_template_sounds). Price unchanged.");

/** Refusals of `edit_sounds` and `template_sounds.edit` that would otherwise be ignored: nothing to cut, a name without the switch, both on and muted. */
export function editSoundRefusals(input: { edit_sounds?: boolean | undefined; inserts?: unknown; layout_windows?: unknown; framing?: unknown;
  template_sounds?: unknown }): { path: (string | number)[]; message: string }[] {
  const sounds = input.template_sounds;
  if (input.edit_sounds !== true) {
    return sounds !== null && typeof sounds === "object" && "edit" in sounds
      ? [{ path: ["template_sounds", "edit"], message: "template_sounds.edit picks the edit sound: add edit_sounds: true or drop it" }] : [];
  }
  return [...(input.inserts === undefined && input.layout_windows === undefined && input.framing === undefined ? [{ path: ["edit_sounds"],
    message: "edit_sounds sounds the cuts of inserts, layout windows and framing: add inserts, layout_windows or framing, or drop it" }] : []),
  ...(sounds === false ? [{ path: ["edit_sounds"], message: "edit_sounds plays a sound on each cut and template_sounds: false mutes every sound: drop one" }] : [])];
}

/** A run's sounds: the defaults with its overrides, or none for `false` (S3c C2, C4). */
export function templateSoundMap(sounds: TemplateSounds | undefined): TemplateSoundMap | undefined {
  return sounds === false ? undefined : { ...DEFAULT_TEMPLATE_SOUNDS, ...sounds } as TemplateSoundMap;
}

/** The beats one template plays: its kind's, and on a full frame its wipe or zoom (whoosh) or flash; money only with a currency sign around a stat. */
export function templateSoundBeats(item: { kind: string; placement: string; transition?: string | undefined; data?: Record<string, unknown> | undefined }):
  TemplateSoundBeat[] {
  const transition = item.placement !== "full" ? [] : item.transition === "wipe" || item.transition === "zoom" ? ["whoosh" as const]
    : item.transition === "flash" ? ["flash" as const] : [];
  const currency = [item.data?.prefix, item.data?.suffix].some(text => typeof text === "string" && /\p{Sc}/u.test(text));
  return [...new Set([...(TEMPLATE_KIND_SOUNDS[item.kind] ?? []).filter(beat => beat !== "money" || currency), ...transition])];
}

export const TEMPLATE_SOUNDS_PATH = "/v1/template-sounds";
/** The catalog `GET /v1/template-sounds` and `list_template_sounds` return. */
export const templateSoundsList = z.strictObject({
  beats: z.array(z.strictObject({ beat: z.enum(TEMPLATE_SOUND_BEATS), default: z.string().min(1), names: z.array(z.string().min(1)).min(1),
    plays: z.string().min(1) })),
  contract_version: z.string().min(1),
});
export type TemplateSoundsList = z.infer<typeof templateSoundsList>;

export function listTemplateSounds(): TemplateSoundsList["beats"] {
  return TEMPLATE_SOUND_BEATS.map(beat => ({ beat, default: TEMPLATE_SOUNDS[beat].default, names: [...TEMPLATE_SOUNDS[beat].names],
    plays: TEMPLATE_SOUNDS[beat].plays }));
}
