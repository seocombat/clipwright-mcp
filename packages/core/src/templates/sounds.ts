import { z } from "zod";

// Template sounds (#778 S3c): the owner's library of 23.10, one list of names per beat, with his default first in each.

export const TEMPLATE_SOUND_BEATS = ["click", "toggle", "ring", "answer", "notify", "step", "whoosh", "flash"] as const;
export type TemplateSoundBeat = (typeof TEMPLATE_SOUND_BEATS)[number];

/** Each beat's names, its default and where it plays; the composition bundles `<beat>__<name>.mp3` for each, and a test keeps the two equal. */
export const TEMPLATE_SOUNDS = {
  click: { default: "click_mouse", names: ["click_mouse", "click_soft", "click_crisp", "click_light"],
    plays: "a checklist's cursor clicks a row, on each click" },
  toggle: { default: "switch_flip", names: ["switch_flip", "toggle_snap", "switch_heavy", "switch_light"],
    plays: "a checklist row's switch or check box lands, just after each click" },
  ring: { default: "ring_classic", names: ["ring_classic", "ring_marimba", "ring_digital"],
    plays: "a phone_call rings from its pop, repeating, until it is answered" },
  answer: { default: "answer_confirm", names: ["answer_confirm", "answer_open", "answer_pop", "answer_select"],
    plays: "a phone_call is answered, on answer_at" },
  notify: { default: "chime", names: ["chime", "glass_ping", "glass_soft", "bong", "question_ping"], plays: "a notification drops in" },
  step: { default: "drop", names: ["drop", "drop_high", "tick", "pluck", "pluck_bright"], plays: "a progress step fills, and each rating star" },
  whoosh: { default: "whoosh", names: ["whoosh", "whip", "paper_swipe", "sweep"],
    plays: "a full-frame template's wipe or zoom, in and out, and a compare's reveal" },
  flash: { default: "shutter", names: ["shutter", "glitch"], plays: "a full-frame template's flash, on each of its cuts" },
} as const satisfies Record<TemplateSoundBeat, { default: string; names: readonly string[]; plays: string }>;

/** The beats each kind plays over the presenter; a full-frame template adds its transition's beat (see `templateSoundBeats`). */
export const TEMPLATE_KIND_SOUNDS: Readonly<Record<string, readonly TemplateSoundBeat[]>> = {
  checklist: ["click", "toggle"], phone_call: ["ring", "answer"], notification: ["notify"], progress: ["step"], rating: ["step"], compare: ["whoosh"],
};

export type TemplateSoundMap = { [B in TemplateSoundBeat]: (typeof TEMPLATE_SOUNDS)[B]["names"][number] };
export const DEFAULT_TEMPLATE_SOUNDS = Object.freeze(Object.fromEntries(TEMPLATE_SOUND_BEATS.map(beat => [beat, TEMPLATE_SOUNDS[beat].default]))) as TemplateSoundMap;

const name = <B extends TemplateSoundBeat>(beat: B) => z.enum(TEMPLATE_SOUNDS[beat].names, {
  error: issue => `${JSON.stringify(issue.input)} is not a ${beat} sound: use ${TEMPLATE_SOUNDS[beat].names.join(", ")}`,
}).optional();
const overrides = z.strictObject({ click: name("click"), toggle: name("toggle"), ring: name("ring"), answer: name("answer"), notify: name("notify"),
  step: name("step"), whoosh: name("whoosh"), flash: name("flash") }, {
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

/** A run's sounds: the defaults with its overrides, or none for `false` (S3c C2, C4). */
export function templateSoundMap(sounds: TemplateSounds | undefined): TemplateSoundMap | undefined {
  return sounds === false ? undefined : { ...DEFAULT_TEMPLATE_SOUNDS, ...sounds } as TemplateSoundMap;
}

/** The beats one template plays: its kind's, and on a full frame its wipe or zoom (whoosh) or flash. */
export function templateSoundBeats(item: { kind: string; placement: string; transition?: string | undefined }): TemplateSoundBeat[] {
  const transition = item.placement !== "full" ? [] : item.transition === "wipe" || item.transition === "zoom" ? ["whoosh" as const]
    : item.transition === "flash" ? ["flash" as const] : [];
  return [...new Set([...(TEMPLATE_KIND_SOUNDS[item.kind] ?? []), ...transition])];
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
