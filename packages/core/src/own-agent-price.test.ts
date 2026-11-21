import { describe, expect, it } from "vitest";
import { FACELESS_IMAGE_CREDITS } from "./faceless-price.js";
import { isOwnAgentEnabled, OWN_AGENT_TARIFF, OWN_AGENT_TARIFF_V1, ownAgentCharge, ownAgentTerms, ownAgentTermsNow, ownCutCredits, ownEditCredits, ownFilmRenderCredits, ownHeroCredits, ownStillsCredits,
  ownTakeCheckCredits, ownVoiceCredits, type OwnAgentTerms } from "./own-agent-price.js";

// #1291 F2, 02-solution §4: the «own agent» prices as parameters, the owner's proposal (still 1, render 100 to 60 s + 2/s, voice 2/s).

describe("the own-agent tariff", () => {
  it("freezes the proposal as a snapshot its schema accepts", () => {
    expect(ownAgentTerms.parse(ownAgentTermsNow())).toEqual({ tariff: OWN_AGENT_TARIFF, still_credits: 1, render_credits: 100, included_seconds: 60,
      extra_second_credits: 2, voice_credits_per_second: 2, pose_credits: 9, head_credits: 120, edit_credits: 10, music_credits: 60, film_music_credits: 20, take_check_credits: 10,
      picture_check_credits: 20, picture_check_long_credits: 38, free_stills: 120,
      free_stills_window_hours: 24, cut_credits: 45, cut_included_seconds: 60, cut_extra_second_credits: 1, cut_bed_credits: 35,
      cut_take_sound_credits_per_second: 4, cut_music_credits: 60 });
  });

  // Faceless DIY F1 (owner 16.11: the bed 35 once per cut). Mutants: the bed charged per started span, take sound dropped, music or seconds over 60 dropped.
  it("charges a cut its base, each second over 60, a described bed once, its takes' own sound and music", () => {
    const now = ownAgentTermsNow(), plain = { bed: false, take_sound_seconds: 0, music: false };
    expect(ownAgentCharge({ skill: "film_cut", seconds: 27.9, ...plain }, now, 45)).toBe(45);
    expect(ownCutCredits({ seconds: 74.04, bed: true, take_sound_seconds: 11, music: true }, now)).toBe(45 + 15 + 35 + 4 * 11 + 60);
    for (const seconds of [10, 30, 31, 60, 90]) expect(ownCutCredits({ seconds, ...plain, bed: true }, now), `${seconds} s`)
      .toBe(45 + Math.max(0, seconds - 60) + 35);
    // A take's own sound is billed over the whole take, so it may pass the cut's own length: 16 takes of 10 s in a 20 s cut.
    expect(ownCutCredits({ seconds: 20, ...plain, take_sound_seconds: 160 }, now)).toBe(45 + 4 * 160);
    expect(() => ownCutCredits({ seconds: 20, ...plain, take_sound_seconds: -1 }, now)).toThrow("not a length");
    expect(() => ownCutCredits({ seconds: 90.5, ...plain }, now)).toThrow("outside 0–90");
    expect(() => ownAgentCharge({ skill: "film_cut", seconds: 30, ...plain, bed: true }, now, 79)).toThrow(/over its hold/);
    const { cut_credits: _c, ...partial } = now;
    expect(ownAgentTerms.safeParse(partial).success).toBe(false);
    const { cut_credits: _a, cut_included_seconds: _b, cut_extra_second_credits: _d, cut_bed_credits: _e,
      cut_take_sound_credits_per_second: _g, cut_music_credits: _h, ...old } = now;
    expect(() => ownCutCredits({ seconds: 20, ...plain }, ownAgentTerms.parse(old))).toThrow("these terms price no cut");
  });

  // Mutants: take frames charged anything, a second verdict charged, or a check charged on terms frozen before it was sold.
  it("charges take frames nothing and a take check its frozen price once, and never on terms without one", () => {
    expect(ownAgentCharge({ skill: "film_take_frames", sheets: 4 }, ownAgentTermsNow(), 0)).toBe(0);
    expect(() => ownAgentCharge({ skill: "film_take_frames", sheets: 97 }, ownAgentTermsNow(), 0)).toThrow("outside 0–96");
    expect(ownAgentCharge({ skill: "film_take_check", checks: 1 }, { ...ownAgentTermsNow(), take_check_credits: 25 }, 25)).toBe(25);
    expect(() => ownAgentCharge({ skill: "film_take_check", checks: 2 }, ownAgentTermsNow(), 20)).toThrow("outside 0–1");
    const { take_check_credits: _t, ...old } = ownAgentTermsNow();
    expect(() => ownAgentCharge({ skill: "film_take_check", checks: 1 }, old, 10)).toThrow("these terms price no take check");
  });

  // F2 disposition #8, priced on the function without the hold clip. Mutants: a picture check priced as a motion one, the mode dropped so
  // a picture verdict charges 10, or terms frozen before the picture check priced at today's 20 (F3 D6, owner 17.11; a run admitted at 5 keeps 5).
  it("prices a take check by the frozen mode: picture 20, motion 10, and none on terms without the picture price", () => {
    const now = ownAgentTermsNow();
    expect([ownTakeCheckCredits(1, now, "picture"), ownTakeCheckCredits(1, now, "motion"), ownTakeCheckCredits(1, now)]).toEqual([20, 10, 10]);
    expect(ownAgentCharge({ skill: "film_take_check", checks: 1, against: "picture" }, now, 1000)).toBe(20);
    expect(ownAgentCharge({ skill: "film_take_check", checks: 1, against: "picture" }, { ...now, picture_check_credits: 5 }, 1000)).toBe(5);
    expect(ownTakeCheckCredits(0, now, "picture")).toBe(0);
    expect(ownAgentCharge({ skill: "film_take_check", checks: 1, against: "motion" }, now, 1000)).toBe(10);
    expect(ownTakeCheckCredits(1, { ...now, picture_check_credits: 7 }, "picture")).toBe(7);
    const { picture_check_credits: _p, ...old } = now;
    expect(() => ownTakeCheckCredits(1, old, "picture")).toThrow("these terms price no picture check");
    expect(ownTakeCheckCredits(1, old, "motion")).toBe(10);
  });

  // G2b C1. Mutants: the long price taken on a short take, for a motion check, unsaid, on terms frozen without it, or past the hold.
  it("prices a long take against its picture at 38 when the terms carry it, and every other check at its one price", () => {
    const now = ownAgentTermsNow();
    expect([false, true].map(long => ownTakeCheckCredits(1, now, "picture", long))).toEqual([20, 38]);
    expect([ownTakeCheckCredits(1, now, "motion", true), ownTakeCheckCredits(1, now, "picture"), ownTakeCheckCredits(0, now, "picture", true)]).toEqual([10, 20, 0]);
    expect(ownAgentCharge({ skill: "film_take_check", checks: 1, against: "picture", long: true }, now, 38)).toBe(38);
    expect(() => ownAgentCharge({ skill: "film_take_check", checks: 1, against: "picture", long: true }, now, 20)).toThrow("over its hold");
    const { picture_check_long_credits: _l, ...short } = now;
    for (const frozen of [{ ...short, picture_check_credits: 5 }, short])
      expect(ownAgentCharge({ skill: "film_take_check", checks: 1, against: "picture", long: true }, frozen, 1000)).toBe(frozen.picture_check_credits);
  });

  // F3 D5. Mutants: a preview charged its free stills, or priced apart from a draft's stills.
  it("charges a cut preview its stills past the free ones it was granted, as a draft's stills", () => {
    const now = ownAgentTermsNow();
    expect(ownAgentCharge({ skill: "film_cut_preview", frames: 6, free: 6 }, now, 0)).toBe(0);
    expect(ownAgentCharge({ skill: "film_cut_preview", frames: 6, free: 2 }, now, 4)).toBe(4);
    expect(ownAgentCharge({ skill: "film_cut_preview", frames: 6 }, now, 6)).toBe(6);
    expect(() => ownAgentCharge({ skill: "film_cut_preview", frames: 6 }, now, 5)).toThrow(/over its hold/);
  });

  // Mutants: an edit charged by its seconds, or on terms frozen before the edit was sold.
  it("charges an edit its flat price up to the longest edit, and never on terms without one", () => {
    expect([ownEditCredits(0.5), ownEditCredits(60)]).toEqual([10, 10]);
    expect(() => ownEditCredits(60.5)).toThrow("outside 0–60 s");
    const { edit_credits: _e, ...old } = ownAgentTermsNow();
    expect(() => ownEditCredits(10, old)).toThrow("these terms price no edit");
    expect(ownAgentCharge({ skill: "film_edit", seconds: 19 }, ownAgentTermsNow(), 10)).toBe(10);
    expect(() => ownAgentCharge({ skill: "film_edit", seconds: 19 }, ownAgentTermsNow(), 9)).toThrow("over its hold");
  });

  // Mutants: the made track left off the charge, charged on terms that price no music, or past the hold of a cut without it.
  it("adds a made track's 60 to an edit that carries it, and never on terms without a music price", () => {
    expect([ownEditCredits(19, ownAgentTermsNow(), true), ownAgentTermsNow().music_credits]).toEqual([70, 60]);
    expect(ownAgentCharge({ skill: "film_edit", seconds: 19, music: true }, ownAgentTermsNow(), 70)).toBe(70);
    expect(ownAgentCharge({ skill: "film_edit", seconds: 19, music: false }, ownAgentTermsNow(), 70)).toBe(10);
    expect(() => ownAgentCharge({ skill: "film_edit", seconds: 19, music: true }, ownAgentTermsNow(), 10)).toThrow("over its hold");
    const { music_credits: _m, ...old } = ownAgentTermsNow();
    expect(() => ownEditCredits(10, old, true)).toThrow("these terms price no music");
    expect(ownEditCredits(10, old)).toBe(10);
    // A run settles by its frozen music price, not today's.
    const frozen = { ...ownAgentTermsNow(), music_credits: 25 };
    expect([ownEditCredits(10, frozen, true), ownAgentCharge({ skill: "film_edit", seconds: 10, music: true }, frozen, 35)]).toEqual([35, 35]);
  });

  // render_film's music, 20 on its own term (owner 20.11). Mutants: left off the charge, charged unproven, on terms without it, or at 60.
  it("adds a made track's 20 to a film that carries it, and never on terms without a film music price", () => {
    const now = ownAgentTermsNow();
    expect([now.film_music_credits, now.music_credits, ownEditCredits(19, now, true)]).toEqual([20, 60, 70]);
    expect([ownFilmRenderCredits(46, now), ownFilmRenderCredits(46, now, true), ownFilmRenderCredits(76, now, true)]).toEqual([100, 120, 152]);
    expect(ownAgentCharge({ skill: "film_render", seconds: 46, music: true }, now, 120)).toBe(120);
    expect(ownAgentCharge({ skill: "film_render", seconds: 46, music: false }, now, 120)).toBe(100);
    expect(ownAgentCharge({ skill: "film_render", seconds: 46 }, now, 120)).toBe(100);
    expect(() => ownAgentCharge({ skill: "film_render", seconds: 46, music: true }, now, 100)).toThrow("over its hold");
    const { film_music_credits: _m, ...old } = now;
    expect(() => ownFilmRenderCredits(46, old, true)).toThrow("these terms price no film music");
    expect(ownFilmRenderCredits(46, old)).toBe(100);
    expect(ownAgentCharge({ skill: "film_render", seconds: 46, music: true }, { ...now, film_music_credits: 25 }, 125)).toBe(125);
  });

  /** #1369 stage 2. Mutants: keep the old tariff name for the new price, accept free stills on the old one, or charge granted stills. */
  it("names free stills a new tariff and charges only the delivered stills past the grant", () => {
    const { free_stills: _f, free_stills_window_hours: _w, ...rest } = ownAgentTermsNow();
    const before: OwnAgentTerms = { ...rest, tariff: OWN_AGENT_TARIFF_V1 };
    expect([OWN_AGENT_TARIFF, ownAgentTerms.parse(before).tariff]).toEqual(["own-agent-v2", "own-agent-v1"]);
    expect(() => ownAgentTerms.parse({ ...before, free_stills: 120, free_stills_window_hours: 24 })).toThrow(/only on own-agent-v2/);
    expect(() => ownAgentTerms.parse(rest)).toThrow(/only on own-agent-v2/);
    expect(() => ownAgentTerms.parse({ ...ownAgentTermsNow(), free_stills_window_hours: undefined })).toThrow(/with their window/);
    expect([ownStillsCredits(24, ownAgentTermsNow(), 24), ownStillsCredits(24, ownAgentTermsNow(), 10), ownStillsCredits(20, ownAgentTermsNow(), 24)])
      .toEqual([0, 14, 0]);
    expect(ownAgentCharge({ skill: "film_stills", frames: 12, free: 10 }, ownAgentTermsNow(), 14)).toBe(2);
    expect(() => ownStillsCredits(4, before, 1)).toThrow(/outside these terms/);
    expect(() => ownStillsCredits(24, ownAgentTermsNow(), 121)).toThrow(/outside these terms/);
  });

  /** #1356, #1692. Mutants: price a new pose at anything but 9, a run frozen at 7 at today's 9, take a tenth pose, or price a hero on terms
   *  frozen before poses; or move the done-for-you explainer's pose with the DIY one. */
  it("prices a hero's published poses at 9 each, up to nine, a run frozen at 7 at 7, and none on terms that price no pose", () => {
    expect([ownHeroCredits(9), ownHeroCredits(7), ownHeroCredits(0)]).toEqual([81, 63, 0]);
    expect(() => ownHeroCredits(10)).toThrow();
    const { pose_credits: _, ...before } = ownAgentTermsNow();
    expect(ownAgentTerms.parse(before)).toEqual(before);
    expect(() => ownAgentCharge({ skill: "film_hero", poses: 9 }, before, 81)).toThrow(/price no hero pose/);
    expect(ownAgentCharge({ skill: "film_hero", poses: 9 }, { ...before, pose_credits: 7 }, 63)).toBe(63);
    expect(ownAgentCharge({ skill: "film_hero", poses: 7 }, { ...before, pose_credits: 5 }, 63)).toBe(35);
    expect(() => ownAgentCharge({ skill: "film_hero", poses: 9 }, ownAgentTermsNow(), 80)).toThrow(/over its hold/);
    expect(FACELESS_IMAGE_CREDITS).toBe(7);
  });

  /** Mutants: price a head per pose, a head on terms without its price, sprites on terms frozen without the switch, or past twelve. */
  it("prices one head at 120, a sprite hero's talking sprites at 8 on top of its poses, and neither on terms that price none", () => {
    const sprites = ownAgentTermsNow({ sprites: true });
    expect([ownHeroCredits(1, ownAgentTermsNow(), 0, true), ownHeroCredits(0, ownAgentTermsNow(), 0, true)]).toEqual([120, 0]);
    expect([ownHeroCredits(9, sprites, 12), ownHeroCredits(8, sprites, 9), ownHeroCredits(9, sprites)]).toEqual([177, 144, 81]);
    expect([ownAgentTermsNow().sprite_credits, sprites.sprite_credits]).toEqual([undefined, 8]);
    expect(ownAgentCharge({ skill: "film_hero", poses: 1, head: true }, ownAgentTermsNow(), 120)).toBe(120);
    expect(ownAgentCharge({ skill: "film_hero", poses: 9, sprites: 12 }, sprites, 177)).toBe(177);
    const { head_credits: _, ...before } = ownAgentTermsNow();
    expect(() => ownHeroCredits(1, before, 0, true)).toThrow(/price no head/);
    expect(() => ownHeroCredits(2, ownAgentTermsNow(), 0, true)).toThrow();
    expect(() => ownHeroCredits(9, ownAgentTermsNow(), 1)).toThrow(/price no sprite/);
    expect(() => ownHeroCredits(9, sprites, 13)).toThrow();
  });

  /** Mutants: charge the extra seconds from zero, floor a started second, or round each word instead of the take once. */
  it("prices a film by its started seconds over the base, a take once rounded up and each still", () => {
    expect([ownFilmRenderCredits(45), ownFilmRenderCredits(60), ownFilmRenderCredits(60.2), ownFilmRenderCredits(75)]).toEqual([100, 100, 102, 130]);
    expect([ownVoiceCredits(12.3), ownVoiceCredits(12)]).toEqual([26, 24]);
    // #1356 C5: up to 24 stills a call at 1 credit each; a 25th is never held or charged.
    expect([ownStillsCredits(0), ownStillsCredits(4), ownStillsCredits(24)]).toEqual([0, 4, 24]);
    expect(() => ownFilmRenderCredits(0)).toThrow();
    expect(() => ownFilmRenderCredits(121)).toThrow();
    expect(() => ownStillsCredits(25)).toThrow();
  });

  /** Mutant (Codex r1): any unit priced by today's constants instead of the run's snapshot, and a price change reprices runs already held. */
  it("settles every unit by the run's frozen terms, never above the hold", () => {
    const old = { ...ownAgentTermsNow(), still_credits: 3, render_credits: 80, included_seconds: 30, extra_second_credits: 5, voice_credits_per_second: 1 };
    expect(ownAgentCharge({ skill: "film_render", seconds: 30 }, old, 500)).toBe(80);
    expect(ownAgentCharge({ skill: "film_render", seconds: 45 }, old, 500)).toBe(155);
    expect(ownAgentCharge({ skill: "film_voice", seconds: 12.3 }, old, 30)).toBe(13);
    expect(ownAgentCharge({ skill: "film_stills", frames: 4 }, old, 30)).toBe(12);
    // Codex r2: a charge equal to its hold is charged, one credit past it is a defect; for every unit.
    const now = ownAgentTermsNow();
    for (const [delivery, charge] of [[{ skill: "film_render", seconds: 45 }, 100], [{ skill: "film_voice", seconds: 12.3 }, 26],
      [{ skill: "film_stills", frames: 4 }, 4]] as const) {
      expect(ownAgentCharge(delivery, now, charge)).toBe(charge);
      expect(() => ownAgentCharge(delivery, now, charge - 1)).toThrow(/over its hold/);
    }
    expect(() => ownAgentCharge({ skill: "film_render", seconds: 75 }, ownAgentTermsNow(), 100)).toThrow(/over its hold/);
  });

  // Mutants: any part of a cut's charge read from today's constant instead of the run's frozen terms.
  it("settles a cut by its frozen terms, part by part, never by today's prices", () => {
    const frozen = { ...ownAgentTermsNow(), cut_credits: 20, cut_included_seconds: 30, cut_extra_second_credits: 3, cut_bed_credits: 11,
      cut_take_sound_credits_per_second: 7, cut_music_credits: 13 };
    const plain = { bed: false, take_sound_seconds: 0, music: false };
    for (const [part, cut, charge] of [
      ["cut_credits", { seconds: 25, ...plain }, 20],
      ["extra seconds over the frozen included ones", { seconds: 34.2, ...plain }, 20 + 5 * 3],
      ["the frozen bed once", { seconds: 34.2, ...plain, bed: true }, 20 + 5 * 3 + 11],
      ["take sound per second", { seconds: 25, ...plain, take_sound_seconds: 4 }, 20 + 4 * 7],
      ["music", { seconds: 25, ...plain, music: true }, 20 + 13],
    ] as const) expect(ownAgentCharge({ skill: "film_cut", ...cut }, frozen, 500), part).toBe(charge);
    // Codex r2: held at 55 (20 and a described bed), the bed then failed: the frozen cut alone.
    expect(ownAgentCharge({ skill: "film_cut", seconds: 28, ...plain }, { ...ownAgentTermsNow(), cut_credits: 20 }, 55)).toBe(20);
  });

  it("is sold only behind CLIPWRIGHT_OWN_AGENT=1", () => {
    expect(isOwnAgentEnabled({ CLIPWRIGHT_OWN_AGENT: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", " 1"]) expect(isOwnAgentEnabled({ CLIPWRIGHT_OWN_AGENT: value })).toBe(false);
  });
});
