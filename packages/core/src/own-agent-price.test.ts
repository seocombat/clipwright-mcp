import { describe, expect, it } from "vitest";
import { isOwnAgentEnabled, OWN_AGENT_TARIFF, OWN_AGENT_TARIFF_V1, ownAgentCharge, ownAgentTerms, ownAgentTermsNow, ownFilmRenderCredits, ownHeroCredits, ownStillsCredits,
  ownVoiceCredits, type OwnAgentTerms } from "./own-agent-price.js";

// #1291 F2, 02-solution §4: the «own agent» prices as parameters, the owner's proposal (still 1, render 100 to 60 s + 2/s, voice 2/s).

describe("the own-agent tariff", () => {
  it("freezes the proposal as a snapshot its schema accepts", () => {
    expect(ownAgentTerms.parse(ownAgentTermsNow())).toEqual({ tariff: OWN_AGENT_TARIFF, still_credits: 1, render_credits: 100, included_seconds: 60,
      extra_second_credits: 2, voice_credits_per_second: 2, pose_credits: 7, free_stills: 120, free_stills_window_hours: 24 });
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

  /** #1356. Mutants: price a pose at anything but the done-for-you's 7, take a tenth pose, or price a hero on terms frozen before poses. */
  it("prices a hero's published poses at 7 each, up to nine, and none on terms that price no pose", () => {
    expect([ownHeroCredits(9), ownHeroCredits(7), ownHeroCredits(0)]).toEqual([63, 49, 0]);
    expect(() => ownHeroCredits(10)).toThrow();
    const { pose_credits: _, ...before } = ownAgentTermsNow();
    expect(ownAgentTerms.parse(before)).toEqual(before);
    expect(() => ownAgentCharge({ skill: "film_hero", poses: 9 }, before, 63)).toThrow(/price no hero pose/);
    expect(ownAgentCharge({ skill: "film_hero", poses: 7 }, { ...before, pose_credits: 5 }, 63)).toBe(35);
    expect(() => ownAgentCharge({ skill: "film_hero", poses: 9 }, ownAgentTermsNow(), 62)).toThrow(/over its hold/);
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

  it("is sold only behind CLIPWRIGHT_OWN_AGENT=1", () => {
    expect(isOwnAgentEnabled({ CLIPWRIGHT_OWN_AGENT: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", " 1"]) expect(isOwnAgentEnabled({ CLIPWRIGHT_OWN_AGENT: value })).toBe(false);
  });
});
