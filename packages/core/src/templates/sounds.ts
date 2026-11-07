import { z } from "zod";

// Template sounds: one list of names per beat, with the default first in each.

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
    plays: "a full-frame template's wipe or zoom, in and out, and a compare's reveal; on make_faceless, each light leak cut, its peak on the cut" },
  flash: { default: "shutter", names: ["shutter", "glitch", "swish"],
    plays: "a full-frame template's flash, on each of its cuts; on make_faceless, each flash cut, its peak on the cut" },
  pop: { default: "plop", names: ["plop"], plays: "a tag or a callout pops in" },
  hangup: { default: "phone", names: ["phone"], plays: "an answered phone_call hangs up, just before it leaves" },
  money: { default: "cash_register", names: ["cash_register", "coins"], plays: "a stat with a currency sign in its prefix or suffix counts up" },
  edit: { default: "air_whoosh", names: ["air_whoosh", "swing", "swipe", "swell_hit", "whoosh_deep", "whoosh_low", "boom_low", "sub_drop", "riser_boom",
    "riser_hit"],
    plays: "with edit_sounds, each cut: to or from an insert, a full-frame template's cut without its own whoosh or flash, a layout window's in and out; " +
      "on make_faceless, every scene change; its peak lands on the cut" },
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
function soundsRefusal(input: unknown, schema: z.ZodType = overrides): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "template_sounds is false (no sounds) or { beat: name }";
  const issue = schema.safeParse(input).error?.issues[0];
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
export const editSounds = z.boolean().describe("A short sound on every cut (insert, full-frame template, layout window, framing), its peak on the cut. " +
  "Needs one of those (inserts, templates, layout_windows, framing); template_sounds.edit picks it (list_template_sounds). Price unchanged.");

/** Refusals of `edit_sounds` and `template_sounds.edit` that would otherwise be ignored: nothing to cut, a name without the switch, both on and muted. */
export function editSoundRefusals(input: { edit_sounds?: boolean | undefined; inserts?: unknown; layout_windows?: unknown; framing?: unknown;
  template_sounds?: unknown; fullTemplates?: boolean | undefined }): { path: (string | number)[]; message: string }[] {
  const sounds = input.template_sounds;
  if (input.edit_sounds !== true) {
    return sounds !== null && typeof sounds === "object" && "edit" in sounds
      ? [{ path: ["template_sounds", "edit"], message: "template_sounds.edit picks the edit sound: add edit_sounds: true or drop it" }] : [];
  }
  return [...(input.inserts === undefined && input.layout_windows === undefined && input.framing === undefined && input.fullTemplates !== true ? [{ path: ["edit_sounds"],
    message: "edit_sounds sounds the cuts of inserts, full-frame templates, layout windows and framing: add one of them, or drop it" }] : []),
  ...(sounds === false ? [{ path: ["edit_sounds"], message: "edit_sounds plays a sound on each cut and template_sounds: false mutes every sound: drop one" }] : [])];
}

/** The beats a faceless video plays (#1067): a flash cut's, a light leak cut's and, with edit_sounds, the scene changes'. */
export const FACELESS_SOUND_BEATS = ["flash", "whoosh", "edit"] as const satisfies readonly TemplateSoundBeat[];
/** The beat each faceless cut look sounds. */
export const FACELESS_LOOK_SOUND = { flash: "flash", light_leak: "whoosh" } as const satisfies Record<string, (typeof FACELESS_SOUND_BEATS)[number]>;
const facelessOverrides = z.strictObject({ flash: name("flash"), whoosh: name("whoosh"), edit: name("edit") }, {
  error: issue => (issue.code === "unrecognized_keys"
    ? `template_sounds of make_faceless has no beat ${issue.keys.join(", ")}: the beats are ${FACELESS_SOUND_BEATS.join(", ")}` : undefined),
});
export const facelessTemplateSounds = z.union([z.literal(false), facelessOverrides], { error: issue => soundsRefusal(issue.input, facelessOverrides) })
  .describe("Sounds: false for none, or { flash, whoosh, edit: name } over the defaults; list_template_sounds names them.");
export type FacelessTemplateSounds = z.infer<typeof facelessTemplateSounds>;
export type FacelessSoundMap = { [B in (typeof FACELESS_SOUND_BEATS)[number]]?: TemplateSoundMap[B] };

/** Refusals of faceless sound fields that would otherwise be ignored: a beat whose look or switch the run lacks, both on and muted. */
export function facelessSoundRefusals(input: { edit_sounds?: boolean | undefined; template_sounds?: unknown; look: string | undefined }):
  { path: (string | number)[]; message: string }[] {
  const sounds = input.template_sounds, named = sounds !== null && typeof sounds === "object" ? sounds : {};
  const looks = Object.entries(FACELESS_LOOK_SOUND).filter(([look, beat]) => beat in named && look !== input.look);
  return [...looks.map(([look, beat]) => ({ path: ["template_sounds", beat],
    message: `template_sounds.${beat} picks the sound of a ${look} cut, and this run draws ${input.look ? `${input.look} cuts` : "no transitions"}: drop it` })),
  ...(input.edit_sounds !== true && "edit" in named
    ? [{ path: ["template_sounds", "edit"], message: "template_sounds.edit picks the edit sound: add edit_sounds: true or drop it" }] : []),
  ...(input.edit_sounds === true && sounds === false
    ? [{ path: ["edit_sounds"], message: "edit_sounds plays a sound on each cut and template_sounds: false mutes every sound: drop one" }] : [])];
}

/** A faceless run's sounds by name: both looks' beats, so a revision's new look sounds too, and edit with edit_sounds; none for `false`. */
export function facelessSoundMap(input: { edit_sounds?: boolean | undefined; template_sounds?: FacelessTemplateSounds | undefined }): FacelessSoundMap {
  if (input.template_sounds === false) return {};
  const { flash, whoosh, edit } = { ...DEFAULT_TEMPLATE_SOUNDS, ...input.template_sounds } as TemplateSoundMap;
  return { flash, whoosh, ...(input.edit_sounds ? { edit } : {}) };
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
