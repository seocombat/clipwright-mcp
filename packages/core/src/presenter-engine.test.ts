import { describe, expect, it } from "vitest";
import * as core from "./index.js";

// #1773, owner 19.11: Avatar IV 10 and Avatar 6 Turbo 12 a presenter second on parts-v5, Turbo the default where offered.
describe("parts-v5: the presenter second by HeyGen model", () => {
  const charge = (engine: core.ShortPresenterEngine, tariff = core.durationPartsTariffFor(engine === "heygen_avatar6_turbo"
    ? "heygen_avatar6_turbo" : "heygen"), delivered = true) => core.calculateDurationPartsCharge(35, engine, tariff, delivered);

  /** Rule 5's two runs. Mutants: Turbo at IV's rate, IV left at parts-v2's 9, the two rates swapped, or the Turbo label on IV. */
  it("bills a 35 s ad 385 on Avatar IV and 455 on Avatar 6 Turbo", () => {
    expect(charge("heygen").credits).toBe(10 * 35 + 35);
    expect(charge("heygen_avatar6_turbo").credits).toBe(12 * 35 + 35);
    expect(charge("heygen_avatar6_turbo").lines[0]).toEqual({ label: "presenter, HeyGen Avatar 6 Turbo", unit: "face_second", quantity: 35,
      unit_credits: 12, credits: 420 });
    expect(charge("heygen").lines[0]!.label).toBe("presenter, HeyGen Avatar IV");
    expect(core.PARTS_DURATION_TARIFF.pricingVersion).toBe("parts-v5");
  });

  /** Mutant: price a Turbo take on a snapshot frozen before parts-v5 by a fallback rate, and a run is charged a second never quoted. */
  it("keeps parts-v2's 9 for runs admitted on it and prices no Turbo take there", () => {
    const partsV2: core.DurationPartsTariff = { version: 1, pricingVersion: "parts-v2", presenterCreditsPerSecond: { heygen: 9, omnihuman: 22 },
      productionCreditsPerSecond: 1, minimumCredits: 50 };
    expect(core.calculateDurationPartsCharge(35, "heygen", partsV2, true).credits).toBe(350);
    expect(() => core.calculateDurationPartsCharge(35, "heygen_avatar6_turbo", partsV2, true)).toThrow(RangeError);
    expect(core.durationPartsTariffSchema.parse(partsV2)).toEqual(partsV2);
  });

  /** Mutant: the frozen engine dropped from the snapshot, and the bill can no longer tell an IV take on a Turbo run. */
  it("freezes the chosen model in the snapshot", () => {
    expect(core.durationPartsTariffFor("heygen_avatar6_turbo")).toMatchObject({ pricingVersion: "parts-v5", presenterEngine: "heygen_avatar6_turbo",
      presenterCreditsPerSecond: { heygen: 10, heygen_avatar6_turbo: 12 } });
    expect(core.PARTS_V2_FACE_TARIFF.presenterCreditsPerSecond).toEqual({ heygen: 9, omnihuman: 22 });
    expect(core.PARTS_OMNI_FACE_TARIFF.presenterCreditsPerSecond.heygen).toBe(9);
  });
});

describe("the presenter model a make_ugc run renders on", () => {
  const short = { presenter_engine: undefined } as const;
  const portrait = { source: { width: 1080, height: 1920 } };
  const resolve = (input: Parameters<typeof core.resolvePresenterEngine>[0], facts: Parameters<typeof core.resolvePresenterEngine>[3] = portrait,
    aspect: core.AspectRatio = "9:16", enabled = true) => core.resolvePresenterEngine(input, aspect, enabled, facts);

  /** Mutants: default to IV, at 16:9, or with the switch off. */
  it("is Turbo by default on a short 9:16 video while offered, Avatar IV elsewhere", () => {
    expect(resolve(short)).toEqual({ choice: "avatar6_turbo", warnings: [] });
    expect(resolve(short, portrait, "9:16", false)).toEqual({ choice: "avatar_iv", warnings: [] });
    expect(resolve(short, portrait, "16:9").choice).toBe("avatar_iv");
    expect(resolve({ presenter_engine: "avatar_iv" })).toEqual({ choice: "avatar_iv", warnings: [] });
  });

  /** #1776 C1. Mutants: refuse Turbo to the narrated or segmented path, or to a shot that is not the presenter talking. */
  it("is Turbo on a narrated or segmented 9:16 video too", () => {
    for (const input of [{ ...short, inserts: [] }, { ...short, segments: [] }, { ...short, end_hold_s: 1 }, { ...short, overlays: [] },
      { ...short, shots: [{ id: "s1", kind: "action", anchor: { quote: "hi" } }] }] as const) {
      expect(resolve(input as Parameters<typeof resolve>[0]), JSON.stringify(input)).toEqual({ choice: "avatar6_turbo", warnings: [] });
    }
  });

  /** #1776 D2: a run whose presenter takes cannot all be Turbo is all Avatar IV. Mutant: any one of the four left on Turbo. */
  it("renders a call, an interview, presenter_gaze or a talking shot on Avatar IV", () => {
    const talking = { shots: [{ id: "s1", kind: "talking", anchor: { quote: "hi" } }] };
    for (const extra of [{ call: {} }, { interview: {} }, { presenter_gaze: [] }, talking]) {
      expect(resolve({ ...short, ...extra } as Parameters<typeof resolve>[0]), JSON.stringify(extra)).toEqual({ choice: "avatar_iv", warnings: [] });
      expect(resolve({ presenter_engine: "avatar6_turbo", ...extra } as Parameters<typeof resolve>[0]).warnings[0])
        .toMatch(/no video with a call, interview, presenter_gaze or talking shot; .*avatar_iv/);
    }
  });

  /** #1776 D6. Mutants: Turbo on a picture of unknown shape or one more than 2% from 9:16, and the take is refused after it is paid. */
  it("renders on Avatar IV a picture it could not measure or one more than 2% from 9:16", () => {
    const asked = { presenter_engine: "avatar6_turbo" } as const;
    expect(resolve(short, { source: null })).toEqual({ choice: "avatar_iv", warnings: [] });
    expect(resolve(asked, { source: null }).warnings[0]).toMatch(/could not be measured; .*avatar_iv/);
    expect(resolve(short, { source: { width: 1024, height: 1700 } }).choice).toBe("avatar_iv");
    expect(resolve(asked, { source: { width: 1024, height: 1700 } }).warnings[0]).toMatch(/within 2% of 9:16, and this one is 1024×1700; .*avatar_iv/);
    expect(resolve(short, { source: { width: 1078, height: 1920 } }).choice).toBe("avatar6_turbo");
    expect(resolve(short, { source: { width: 432, height: 768 } }).choice).toBe("avatar6_turbo");
  });

  /** #1776 D6. Mutant: a unit estimated past 36 s sent to Turbo, whose longest measured request was 42.6 s. */
  it("renders on Avatar IV a video with a presenter part estimated past 36 s", () => {
    expect(core.TURBO_UNIT_MAX_ESTIMATE_SEC).toBe(36);
    expect(core.TURBO_UNIT_MAX_SEC).toBe(42);
    const long = { ...short, inserts: [] } as Parameters<typeof resolve>[0];
    expect(resolve(long, { ...portrait, longestUnitSec: 36 }).choice).toBe("avatar6_turbo");
    expect(resolve(long, { ...portrait, longestUnitSec: 40 })).toEqual({ choice: "avatar_iv", warnings: [] });
    expect(resolve({ ...long, presenter_engine: "avatar6_turbo" }, { ...portrait, longestUnitSec: 40 }).warnings[0])
      .toMatch(/parts of up to 36 s, and one part of this video is estimated at 40 s; .*avatar_iv/);
  });

  /** Rule 3. Mutant: an asked Turbo silently rendered on IV, or the warning naming no reason. */
  it("says why an asked Turbo renders on Avatar IV", () => {
    const asked = { presenter_engine: "avatar6_turbo" } as const;
    expect(resolve(asked, portrait, "9:16", false).warnings[0]).toMatch(/not available right now; .*avatar_iv/);
    expect(resolve(asked, portrait, "1:1").warnings[0]).toMatch(/only 9:16 videos, and this one is 1:1/);
  });

  /** The contract: the field is offered, and the price list sells Turbo only while it can be ordered. */
  it("is a make_ugc field, and a Turbo price line only behind its switch", () => {
    expect(core.makeUgcInput.safeParse({ script: "Hi there.", presenter_engine: "avatar6_turbo" }).success).toBe(true);
    expect(core.makeUgcInput.safeParse({ script: "Hi there.", presenter_engine: "avatar_v" }).success).toBe(false);
    const turbo = (env: Record<string, string>) => core.priceListFor(env).filter((entry) => entry.variant === "HeyGen Avatar 6 Turbo presenter");
    expect(turbo({})).toEqual([]);
    expect(turbo({ CLIPWRIGHT_HEYGEN_AVATAR6: "1" })[0]!.lines[0]).toMatchObject({ unit: "face_second", credits: 12 });
  });
});
