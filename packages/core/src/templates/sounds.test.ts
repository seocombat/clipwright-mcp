import { describe, expect, it } from "vitest";
import { makeUgcInput, storedUgcInput } from "../skills.js";
import { mcpUgcInputShape, offeredUgcInputShape, resolveDispositions } from "../contract-dispositions.js";
import { API_ENDPOINTS } from "../endpoints.js";
import { DEFAULT_TEMPLATE_SOUNDS, listTemplateSounds, TEMPLATE_KIND_SOUNDS, TEMPLATE_KINDS, TEMPLATE_SOUND_BEATS, TEMPLATE_SOUNDS, templateSoundBeats, templateSoundMap,
  templateSounds, templateSoundsList } from "./index.js";
import { editSoundRefusals } from "./sounds.js";

const script = "One two three four five six seven eight nine ten eleven twelve";
const longForm = { broll_policy: "anyone", inserts: [{ id: "shot", media_url: "https://example.com/shot.png", media_type: "image", anchor: { startWord: 10, endWord: 11 } }] };
const pill = { id: "t", kind: "tag", anchor: { startWord: 0, endWord: 2 }, data: { text: "sounds natural", position: "top" } };
function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

/** The owner's library and defaults of 23.10, refreshed and extended by ear on 25.10, written here and not read from core, so editing the
 * catalog cannot move the check. */
const OWNER = {
  click: ["click_mouse", "click_soft", "click_crisp", "click_light"], toggle: ["switch_flip", "toggle_snap", "switch_heavy", "switch_light"],
  ring: ["ring_classic", "ring_marimba", "ring_digital", "ring_double"], answer: ["answer_confirm", "answer_open", "answer_pop", "answer_select", "pickup"],
  notify: ["chime", "glass_ping", "glass_soft", "bong", "question_ping"], step: ["drop", "drop_high", "tick", "pluck", "pluck_bright"],
  whoosh: ["whoosh", "whip", "paper_swipe", "sweep", "slide_quick"], flash: ["shutter", "glitch", "swish"], pop: ["plop"], hangup: ["phone"],
  money: ["cash_register", "coins"], edit: ["swell_hit", "whoosh_deep", "whoosh_low", "boom_low", "sub_drop", "riser_boom", "riser_hit"],
};

describe("template sounds (#778 S3c, C2–C4)", () => {
  it("holds the owner's 45 sounds and the call's ring by beat, his default first in each", () => {
    expect(Object.fromEntries(TEMPLATE_SOUND_BEATS.map(beat => [beat, TEMPLATE_SOUNDS[beat].names]))).toEqual(OWNER);
    expect(DEFAULT_TEMPLATE_SOUNDS).toEqual({ click: "click_mouse", toggle: "switch_flip", ring: "ring_classic", answer: "answer_confirm", notify: "chime",
      step: "drop", whoosh: "whoosh", flash: "shutter", pop: "plop", hangup: "phone", money: "cash_register", edit: "swell_hit" });
    expect(Object.values(OWNER).flat()).toHaveLength(46);
  });

  /** Mutant: accept any string as a name, or any key as a beat, and an unknown sound reaches the composition. */
  it("refuses an unknown beat, a name outside its beat's list, and any other value, each with its path", () => {
    const sounded = (template_sounds: unknown) => refusals({ ...longForm, template_sounds, templates: [pill] });
    expect(sounded({ click: "chime" })).toEqual(["template_sounds: template_sounds.click \"chime\" is not a click sound: use click_mouse, click_soft, click_crisp, click_light"]);
    expect(sounded({ boom: "chime" })).toEqual(["template_sounds: template_sounds has no beat boom: the beats are click, toggle, ring, answer, notify, step, " +
      "whoosh, flash, pop, hangup, money, edit"]);
    for (const value of [true, "chime", ["chime"], null, { click: 1 }]) expect(sounded(value)).toEqual([expect.stringMatching(/^template_sounds: template_sounds/)]);
    expect([sounded(false), sounded({}), sounded({ ring: "ring_digital", flash: "glitch" })]).toEqual([[], [], []]);
  });

  it("refuses template_sounds without templates, the way template_theme is", () => {
    expect(refusals({ ...longForm, template_sounds: false })).toEqual(["template_sounds: template_sounds sounds templates: add templates or drop it"]);
    expect(refusals({ ...longForm, template_sounds: { step: "tick" } })).toEqual(["template_sounds: template_sounds sounds templates: add templates or drop it"]);
  });

  it("has no default in the schema: an omitted field stays absent in the parsed and stored request", () => {
    expect("template_sounds" in makeUgcInput.parse({ script, ...longForm, templates: [pill] })).toBe(false);
    expect(storedUgcInput.parse({ script, ...longForm, templates: [pill], template_sounds: { click: "click_soft" } }).template_sounds).toEqual({ click: "click_soft" });
  });

  /** Mutant: apply the defaults under `false`, or drop an override, and the run plays what it did not ask for. */
  it("resolves a run's map: the defaults with its overrides, none for false", () => {
    expect(templateSoundMap(undefined)).toEqual(DEFAULT_TEMPLATE_SOUNDS);
    expect(templateSoundMap({ ring: "ring_marimba", step: "tick" })).toEqual({ ...DEFAULT_TEMPLATE_SOUNDS, ring: "ring_marimba", step: "tick" });
    expect(templateSoundMap(false)).toBeUndefined();
  });

  it("names the beats each template plays: its kind's, and a full frame's transition", () => {
    const beats = (kind: string, placement: string, transition?: string) => templateSoundBeats({ kind, placement, transition });
    expect([beats("checklist", "over"), beats("phone_call", "over"), beats("notification", "over"), beats("progress", "over"), beats("rating", "over"),
      beats("compare", "full"), beats("tag", "over"), beats("title_card", "full"), beats("title_card", "full", "wipe"), beats("quote", "full", "zoom"),
      beats("stat", "full", "flash"), beats("compare", "full", "wipe"), beats("callout", "over"), beats("lower_third", "over")])
      .toEqual([["click", "toggle"], ["ring", "answer", "hangup"], ["notify"], ["step"], ["step"], ["whoosh"], ["pop"], [], ["whoosh"], ["whoosh"], ["flash"],
        ["whoosh"], ["pop"], []]);
    // A transition on an over-presenter item is refused at admission; here it plays only its kind's beats.
    expect(beats("tag", "over", "flash")).toEqual(["pop"]);
    expect(Object.keys(TEMPLATE_KIND_SOUNDS).every(kind => TEMPLATE_KINDS.some(entry => entry.kind === kind))).toBe(true);
    // No template plays the edit beat: edit_sounds places it on the cuts.
    expect(TEMPLATE_KINDS.some(kind => kind.placements.some(placement => templateSoundBeats({ kind: kind.kind, placement, transition: "flash",
      data: { prefix: "$" } }).includes("edit")))).toBe(false);
  });

  /** Mutant: ring the till on every stat, or on none, and a percentage sounds like a sale or a raise sounds like nothing. */
  it("plays money only on a stat whose prefix or suffix is a currency sign", () => {
    const stat = (data: Record<string, unknown>) => templateSoundBeats({ kind: "stat", placement: "over", data });
    expect([stat({ value: 17, prefix: "$", suffix: "M" }), stat({ value: 9, suffix: " €" }), stat({ value: 3, prefix: "₽" }), stat({ value: 87, suffix: "%" }),
      stat({ value: 87 }), templateSoundBeats({ kind: "stat", placement: "full" })]).toEqual([["money"], ["money"], ["money"], [], [], []]);
  });

  /** Mutants: accept edit_sounds with nothing to cut, keep the edit name without edit_sounds, or mute edit_sounds silently under false. */
  it("takes edit_sounds on a run with inserts or layout windows, its name in template_sounds.edit, and refuses what it would ignore", () => {
    expect([refusals({ ...longForm, edit_sounds: true }), refusals({ ...longForm, edit_sounds: true, template_sounds: { edit: "boom_low" } }),
      refusals({ ...longForm, edit_sounds: false }), refusals({ ...longForm, edit_sounds: true, templates: [pill], template_sounds: { edit: "sub_drop", ring: "ring_digital" } })])
      .toEqual([[], [], [], []]);
    expect(makeUgcInput.parse({ script, ...longForm, edit_sounds: true, template_sounds: { edit: "riser_hit" } })).toMatchObject({ edit_sounds: true,
      template_sounds: { edit: "riser_hit" } });
    expect("edit_sounds" in makeUgcInput.parse({ script, ...longForm })).toBe(false);
    expect(refusals({ edit_sounds: true })).toEqual(["edit_sounds: edit_sounds sounds the cuts of inserts, layout windows and framing: add inserts, " +
      "layout_windows or framing, or drop it"]);
    // Framing cuts are edits too (reference-elements S2): a run with framing alone takes edit_sounds.
    expect(refusals({ edit_sounds: true, framing: [{ id: "f", anchor: { quote: "two" } }] })).toEqual([]);
    expect(refusals({ ...longForm, template_sounds: { edit: "boom_low" } }))
      .toEqual(["template_sounds.edit: template_sounds.edit picks the edit sound: add edit_sounds: true or drop it"]);
    expect(refusals({ ...longForm, edit_sounds: false, templates: [pill], template_sounds: { edit: "boom_low" } }))
      .toEqual(["template_sounds.edit: template_sounds.edit picks the edit sound: add edit_sounds: true or drop it"]);
    expect(refusals({ ...longForm, edit_sounds: true, template_sounds: false }))
      .toEqual(["edit_sounds: edit_sounds plays a sound on each cut and template_sounds: false mutes every sound: drop one"]);
    // Without templates template_sounds may name only the edit sound.
    expect(refusals({ ...longForm, edit_sounds: true, template_sounds: { edit: "boom_low", click: "click_soft" } }))
      .toEqual(["template_sounds: template_sounds sounds templates: add templates or drop it"]);
    expect(refusals({ ...longForm, edit_sounds: true, template_sounds: { edit: "boom" } }))
      .toEqual(["template_sounds: template_sounds.edit \"boom\" is not an edit sound: use swell_hit, whoosh_deep, whoosh_low, boom_low, sub_drop, riser_boom, riser_hit"]);
    expect(refusals({ ...longForm, edit_sounds: "yes" })).toHaveLength(1);
    // Mutant (Codex r3): require inserts, and a run with only layout windows is refused.
    expect([editSoundRefusals({ edit_sounds: true, layout_windows: [] }), editSoundRefusals({ edit_sounds: true, inserts: [] })]).toEqual([[], []]);
  });

  it("lists the catalog for REST and MCP: every beat with its default, names and where it plays", () => {
    const list = templateSoundsList.parse({ beats: listTemplateSounds(), contract_version: "x" });
    expect(list.beats.map(({ beat, default: preset, names }) => [beat, preset, names])).toEqual(TEMPLATE_SOUND_BEATS.map(beat => [beat, DEFAULT_TEMPLATE_SOUNDS[beat], OWNER[beat]]));
    expect(list.beats.every(entry => entry.plays.length > 10)).toBe(true);
    expect(API_ENDPOINTS.find(endpoint => endpoint.path === "/v1/template-sounds")).toEqual({ method: "GET", path: "/v1/template-sounds", billed: false,
      onQuickstart: false, jsonBody: false, cabinet: false, mcp: true });
  });

  it("offers edit_sounds on long form only, as inserts are", () => {
    expect(resolveDispositions({ longForm: false, remoteFetch: true, compose: true }).edit_sounds.kind).toBe("rejected");
    expect(resolveDispositions({ longForm: true, remoteFetch: true, compose: true }).edit_sounds).toEqual({ kind: "implemented", provenBy: "composition" });
    expect(offeredUgcInputShape.edit_sounds.unwrap().safeParse(true).success).toBe(true);
    expect(mcpUgcInputShape.edit_sounds.unwrap().description).toContain("template_sounds.edit");
  });

  it("offers the field on long form only, strict for REST and slim for MCP", () => {
    expect(resolveDispositions({ longForm: false, remoteFetch: true, compose: true } as never).template_sounds.kind).toBe("rejected");
    // A plain run never needed inserts, so the refusal names the templates and not the long-form fix (#840 D6).
    for (const field of ["templates", "template_theme", "template_sounds"] as const) {
      expect(resolveDispositions({ longForm: false, remoteFetch: true, compose: true })[field])
        .toEqual({ kind: "rejected", message: "templates are not available right now; omit templates, template_theme and template_sounds" });
    }
    expect(resolveDispositions({ longForm: true, remoteFetch: true, compose: true } as never).template_sounds).toEqual({ kind: "implemented", provenBy: "composition" });
    expect(offeredUgcInputShape.template_sounds.unwrap()).toBe(templateSounds);
    const slim = mcpUgcInputShape.template_sounds;
    expect([slim.safeParse({ any: "name" }).success, slim.safeParse(false).success, slim.safeParse(true).success]).toEqual([true, true, false]);
    expect(slim.unwrap().description).toContain("list_template_sounds");
  });
});
