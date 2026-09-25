import { describe, expect, it } from "vitest";

import {
  ASPECT_MATCH_THRESHOLD,
  ASPECT_RATIOS,
  ASPECT_RATIO_VALUES,
  ASPECT_SNAP_THRESHOLD,
  DEFAULT_ACTOR_SOURCE,
  aspectDistance,
  makeUgcInput,
  negotiateCapabilities,
  resolveAspectRatio,
  snapAspect,
  type AspectSource,
  type BackendCapabilities,
  deliveryWarnings,
  expectedVendorFrame,
  upscaleWarning,
  vendorAspectFor,
} from "@clipwright/core";

/** A probed source with the given dimensions. */
const probed = (width: number, height: number): AspectSource => ({
  width,
  height,
  origin: "probed",
});

describe("aspectDistance / snapAspect", () => {
  it("equal ratios give zero", () => {
    expect(aspectDistance(0.5625, 0.5625)).toBe(0);
  });

  it("the distance is relative to the SMALLER ratio, so the guard errs toward asking", () => {
    // Order does not matter, and the value is the larger relative error: dividing by the
    // larger ratio would trip the 15% threshold later, in favor of silent spending.
    expect(aspectDistance(1, 0.5)).toBe(aspectDistance(0.5, 1));
    expect(aspectDistance(1, 0.5)).toBe(1);
  });

  it("picks the nearest format from the supported ones instead of inventing one", () => {
    expect(snapAspect(0.5625)).toBe("9:16");
    expect(snapAspect(1.0)).toBe("1:1");
    // 16:9 is declared, so a landscape source no longer snaps to square.
    expect(snapAspect(16 / 9)).toBe("16:9");
    expect(ASPECT_RATIOS).toContain(snapAspect(0.3));
  });
});

// Thresholds checked at BOTH edges: a mid-range check cannot tell `<=` from `<`, and
// the edge decides between spending money and refusing.
describe("resolveAspectRatio — 2% / 15% thresholds", () => {
  const target = ASPECT_RATIO_VALUES["9:16"];

  /** A source exactly `distance` away from 9:16. Sides are not rounded: rounding shifts */
  /** the ratio by ~1e-3 and would decide the edge case for us. */
  const sourceAtDistance = (distance: number): AspectSource =>
    // aspectDistance divides by the smaller ratio; a source WIDER than the target
    // makes the target the smaller one, so the distance is exact.
    probed(target * (1 + distance) * 10_000, 10_000);

  it("exactly at the 2% edge: still a match, zero warnings", () => {
    const result = resolveAspectRatio({
      requested: "9:16",
      source: sourceAtDistance(ASPECT_MATCH_THRESHOLD),
    });
    expect(result).toEqual({ kind: "resolved", aspectRatio: "9:16", warnings: [] });
  });

  it("just past 2%: a snap with a warning, not a refusal", () => {
    const result = resolveAspectRatio({
      requested: "9:16",
      source: sourceAtDistance(ASPECT_MATCH_THRESHOLD + 0.01),
    });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("center-crop");
    }
  });

  it("exactly at the 15% edge: still a snap, not a refusal", () => {
    const result = resolveAspectRatio({
      requested: "9:16",
      source: sourceAtDistance(ASPECT_SNAP_THRESHOLD),
    });
    expect(result.kind).toBe("resolved");
  });

  it("just past 15% on an EXPLICIT request: refused", () => {
    const result = resolveAspectRatio({
      requested: "9:16",
      source: sourceAtDistance(ASPECT_SNAP_THRESHOLD + 0.01),
    });
    expect(result.kind).toBe("rejected");
  });
});

describe("resolveAspectRatio — a silent client is never refused", () => {
  it("a 4:3 source without a request: snap + warning, not rejection", () => {
    // The client claimed no format, so nothing is violated. The source is 4:3 because
    // a 16:9 source now matches a declared format exactly and gives no warning.
    const result = resolveAspectRatio({ requested: undefined, source: probed(1600, 1200) });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.warnings).toHaveLength(1);
    }
  });

  it("a 16:9 landscape source matches EXACTLY and gives no warning", () => {
    const result = resolveAspectRatio({ requested: undefined, source: probed(1376, 768) });
    expect(result).toEqual({ kind: "resolved", aspectRatio: "16:9", warnings: [] });
  });

  it("a source that matches a format exactly gives no warning", () => {
    const result = resolveAspectRatio({ requested: undefined, source: probed(1080, 1920) });
    expect(result).toEqual({ kind: "resolved", aspectRatio: "9:16", warnings: [] });
  });

  it("an unprobed source is not a refusal but a deferred check", () => {
    // An unreachable foreign URL is not a client claim about the format.
    const result = resolveAspectRatio({ requested: "1:1", source: null });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.aspectRatio).toBe("1:1");
      expect(result.warnings[0]).toContain("probed");
    }
  });
});

// `1:1` without `image`: the default actor is a KNOWN source, and the refusal names it,
// so the vendor never crops silently and the constant is not invisible.
describe("1:1 without image", () => {
  it("the default actor is exactly 9:16, so it is a full source, not a gap", () => {
    expect(DEFAULT_ACTOR_SOURCE.width / DEFAULT_ACTOR_SOURCE.height).toBeCloseTo(
      ASPECT_RATIO_VALUES["9:16"],
      6,
    );
  });

  it("1:1 on the default actor: REFUSED, and the text names image", () => {
    const result = resolveAspectRatio({
      requested: "1:1",
      source: DEFAULT_ACTOR_SOURCE,
    });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.message).toContain("image");
      expect(result.message).toContain("1:1");
    }
  });

  it("9:16 on the default actor: clean, ZERO warnings", () => {
    expect(
      resolveAspectRatio({ requested: "9:16", source: DEFAULT_ACTOR_SOURCE }),
    ).toEqual({ kind: "resolved", aspectRatio: "9:16", warnings: [] });
  });

  it("1:1 with a square source passes", () => {
    expect(resolveAspectRatio({ requested: "1:1", source: probed(1080, 1080) })).toEqual({
      kind: "resolved",
      aspectRatio: "1:1",
      warnings: [],
    });
  });
});

// `resolveAspectRatio` owns format warnings; the aspect branch of `negotiateCapabilities`
// is proven unreachable by walking the whole enum, so two generators never overlap.
describe("the aspect branch of negotiateCapabilities is provably dead", () => {
  const HEYGEN_CAPS: BackendCapabilities = {
    resolutions: ["720p", "1080p", "4k"],
    // A hand copy of the adapter list (`packages/core` cannot import `apps/web`);
    // the test below keeps the copy from drifting.
    aspectRatios: ["9:16", "1:1", "16:9"],
    maxAudioSec: null,
  };

  it("no value of the public enum gives an aspect warning", () => {
    for (const aspectRatio of ASPECT_RATIOS) {
      const { warnings } = negotiateCapabilities(
        { resolution: "1080p", aspectRatio },
        HEYGEN_CAPS,
        "heygen",
      );
      expect(warnings.filter((w) => w.includes("aspect_ratio"))).toEqual([]);
    }
  });

  it("the public enum EQUALS what the backend declares, or the branch would revive", () => {
    // This equality is why the branch is dead; a drift turns this red before users see it.
    expect([...ASPECT_RATIOS].sort()).toEqual([...HEYGEN_CAPS.aspectRatios].sort());
  });
});

describe("schema: aspect_ratio has no default", () => {
  it("parsing a minimal input has NO aspect_ratio key", () => {
    // A schema default would make a silent client indistinguishable from an explicit 9:16.
    const parsed = makeUgcInput.parse({ script: "hello world" });
    expect("aspect_ratio" in parsed).toBe(false);
  });

  it("an explicit format still reaches the parsed input", () => {
    expect(makeUgcInput.parse({ script: "x", aspect_ratio: "1:1" }).aspect_ratio).toBe(
      "1:1",
    );
  });
});

// The vendor pads a frame wider than the source with white bars and center-crops a
// narrower one; each test fails if the two directions are swapped.
describe("resolveAspectRatio — the snap text names exactly what the vendor will do", () => {
  it("frame WIDER than the source: warns about white bars", () => {
    const result = resolveAspectRatio({
      requested: "1:1",
      source: { width: 950, height: 1000, origin: "probed" },
    });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.warnings[0]).toContain("white bars");
      expect(result.warnings[0]).not.toContain("center-crop");
    }
  });

  it("frame NARROWER than the source: warns about a side center-crop", () => {
    const result = resolveAspectRatio({
      requested: "1:1",
      source: { width: 1050, height: 1000, origin: "probed" },
    });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.warnings[0]).toContain("center-crop");
      expect(result.warnings[0]).not.toContain("white bars");
    }
  });
});

// The vendor format is the one nearest the source: "always ask for 1:1" left a square
// source intact but would crop the sides of the 432×768 default actor on every run.
describe("vendorAspectFor — ask the vendor for a match with the source", () => {
  const supported = ["9:16", "1:1"] as const;

  it("the 432×768 default actor gives 9:16, NOT square", () => {
    expect(vendorAspectFor(DEFAULT_ACTOR_SOURCE, supported)).toBe("9:16");
  });

  it("a square source gives 1:1", () => {
    expect(
      vendorAspectFor({ width: 1080, height: 1080, origin: "probed" }, supported),
    ).toBe("1:1");
  });

  it("a nearly square source also gives 1:1", () => {
    expect(
      vendorAspectFor({ width: 1000, height: 1050, origin: "probed" }, supported),
    ).toBe("1:1");
  });

  it("a tall portrait source gives 9:16", () => {
    expect(
      vendorAspectFor({ width: 600, height: 1400, origin: "probed" }, supported),
    ).toBe("9:16");
  });

  it("does NOT depend on what the client asked for: there is no request argument", () => {
    // The signature is part of the check: a "requested format" parameter would tie the choice to the client.
    expect(vendorAspectFor.length).toBe(2);
  });

  it("refuses to choose when the backend declares no formats", () => {
    expect(() => vendorAspectFor(DEFAULT_ACTOR_SOURCE, [])).toThrow(/no supported/);
  });
});

// Our vendor rules come from one day of measurements; comparing delivered to predicted
// is how they are noticed going stale.
describe("deliveryWarnings — every paid run as a re-measurement", () => {
  const predicted = { width: 1080, height: 1920, durationSec: 8.6 };

  it("a match gives NO warnings", () => {
    expect(deliveryWarnings({ predicted, actual: { ...predicted } })).toEqual([]);
  });

  it("different dimensions name BOTH numbers, not just the mismatch", () => {
    const [warning] = deliveryWarnings({
      predicted,
      actual: { ...predicted, width: 1920, height: 1080 },
    });
    expect(warning).toContain("1920×1080");
    expect(warning).toContain("1080×1920");
  });

  it("ignores a fractional duration mismatch within tolerance", () => {
    expect(
      deliveryWarnings({ predicted, actual: { ...predicted, durationSec: 8.62 } }),
    ).toEqual([]);
  });

  it("a duration mismatch beyond tolerance names both numbers", () => {
    const warnings = deliveryWarnings({
      predicted,
      actual: { ...predicted, durationSec: 12 },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("12s");
    expect(warnings[0]).toContain("8.6s");
  });

  it("names padding to a whole second SEPARATELY from other mismatches", () => {
    const warnings = deliveryWarnings({
      predicted: { width: 1080, height: 1080, durationSec: 0.6 },
      actual: { width: 1080, height: 1080, durationSec: 1 },
    });
    expect(warnings[0]).toContain("padded");
    expect(warnings[0]).toContain("0.6s");
  });

  it("reports dimensions AND duration together when both diverge", () => {
    expect(
      deliveryWarnings({
        predicted,
        actual: { width: 720, height: 1280, durationSec: 20 },
      }),
    ).toHaveLength(2);
  });
});

// Known padding vs unknown mismatch: negative cases, since "padded" would satisfy the
// positive asserts even where the vendor padded nothing.
describe("deliveryWarnings — padding differs from a mismatch", () => {
  const predicted = { width: 1080, height: 1920, durationSec: 8.6 };

  it("a mismatch of seconds is NOT called padding", () => {
    const [warning] = deliveryWarnings({
      predicted,
      actual: { ...predicted, durationSec: 12 },
    });
    expect(warning).not.toContain("padded");
  });

  it("a long clip is not called padding even with a whole-second duration", () => {
    const [warning] = deliveryWarnings({
      predicted,
      actual: { ...predicted, durationSec: 20 },
    });
    expect(warning).not.toContain("padded");
  });

  it("shortening is NOT called padding", () => {
    const [warning] = deliveryWarnings({
      predicted: { ...predicted, durationSec: 5 },
      actual: { ...predicted, durationSec: 1 },
    });
    expect(warning).not.toContain("padded");
  });
});

// The frame prediction accounts for RESOLUTION; otherwise every 720p run reads as a mismatch.
describe("expectedVendorFrame — format AND resolution", () => {
  it("720p portrait gives 720×1280, not 1080×1920", () => {
    expect(expectedVendorFrame("720p", "9:16")).toEqual({ width: 720, height: 1280 });
  });

  it("1080p portrait gives 1080×1920", () => {
    expect(expectedVendorFrame("1080p", "9:16")).toEqual({ width: 1080, height: 1920 });
  });

  it("4k portrait gives 2160×3840", () => {
    expect(expectedVendorFrame("4k", "9:16")).toEqual({ width: 2160, height: 3840 });
  });

  it("square at 720p gives 720×720", () => {
    expect(expectedVendorFrame("720p", "1:1")).toEqual({ width: 720, height: 720 });
  });

  it("the comparison is silent on a 720p run: prediction matches delivery", () => {
    const predicted = { ...expectedVendorFrame("720p", "9:16"), durationSec: 8.6 };
    expect(deliveryWarnings({ predicted, actual: { ...predicted } })).toEqual([]);
  });
});

// With today's enum `vendorAspectFor` is provably equivalent to the resolved format:
// the 15% threshold already refuses every case where they would differ.
describe("vendorAspectFor — equivalence under TODAY's enum", () => {
  // Taken from the contract, not a literal, so extending the enum breaks this test.
  const supported = ASPECT_RATIOS;

  // A sweep of ratios instead of a few examples: a divergence will first appear at
  // some specific ratio that cannot be guessed in advance.
  const ratios: number[] = [];
  for (let ratio = 0.3; ratio <= 3.0001; ratio += 0.05) {
    ratios.push(Number(ratio.toFixed(2)));
  }

  const sourceOf = (ratio: number) => ({
    width: Math.round(1000 * ratio),
    height: 1000,
    origin: "probed" as const,
  });

  it("silent client: the vendor format equals the resolved one at ANY ratio", () => {
    for (const ratio of ratios) {
      const source = sourceOf(ratio);
      const resolution = resolveAspectRatio({ requested: undefined, source });
      if (resolution.kind !== "resolved") continue;
      expect(vendorAspectFor(source, supported)).toBe(resolution.aspectRatio);
    }
  });

  it("explicit request: wherever it is ACCEPTED, the vendor format is the same", () => {
    // A divergence appears here first: a snap within 15% accepts the requested format
    // while the nearest one to the source is another.
    for (const ratio of ratios) {
      const source = sourceOf(ratio);
      for (const requested of supported) {
        const resolution = resolveAspectRatio({ requested, source });
        if (resolution.kind !== "resolved") continue;
        expect(vendorAspectFor(source, supported)).toBe(resolution.aspectRatio);
      }
    }
  });
});

// A 1376×768 source is within 0.8% of 16:9; on a square source the vendor renders 44%
// of the frame white. The honesty belongs to the source match, not the format.
describe("16:9 is honest on a native landscape source", () => {
  const wide = { width: 1376, height: 768, origin: "probed" as const };

  it("an explicit 16:9 request is accepted with NO warnings", () => {
    expect(resolveAspectRatio({ requested: "16:9", source: wide })).toEqual({
      kind: "resolved",
      aspectRatio: "16:9",
      warnings: [],
    });
  });

  it("a silent client on this source also gets 16:9", () => {
    const result = resolveAspectRatio({ requested: undefined, source: wide });
    expect(result).toEqual({ kind: "resolved", aspectRatio: "16:9", warnings: [] });
  });

  it("the same format on a SQUARE source is refused before the paid call", () => {
    // 16:9 from a square is 44% white, and the client learns it from a refusal, not a file.
    const square = { width: 1080, height: 1080, origin: "probed" as const };
    expect(resolveAspectRatio({ requested: "16:9", source: square }).kind).toBe(
      "rejected",
    );
  });

  it("the vendor format for a landscape source is 16:9, not square", () => {
    expect(vendorAspectFor(wide, ASPECT_RATIOS)).toBe("16:9");
  });
});

/** Upscaling a foreign frame is named, like a format snap is; our own actor stays silent. */
describe("upscaleWarning — upscaling a foreign frame is named, our actor stays silent", () => {
  const probed = (width: number, height: number): AspectSource => ({ width, height, origin: "probed" });

  it("a foreign frame smaller than the output: a warning with both sizes", () => {
    // Removing the short-side comparison turns this red.
    const warning = upscaleWarning(probed(540, 960), "1080p", "9:16");

    expect(warning).toContain("540×960");
    expect(warning).toContain("1080×1920");
    expect(warning).toContain("1080 px");
  });

  it("the default actor stays silent despite 432×768 against a 1080×1920 output", () => {
    // A product property, not a request mismatch, so it is documented once instead.
    expect(DEFAULT_ACTOR_SOURCE.width).toBe(432);
    expect(upscaleWarning(DEFAULT_ACTOR_SOURCE, "1080p", "9:16")).toBeNull();
  });

  it("equal and larger sources are silent, and so is an unprobed one", () => {
    expect(upscaleWarning(probed(1080, 1920), "1080p", "9:16")).toBeNull();
    expect(upscaleWarning(probed(2160, 3840), "1080p", "9:16")).toBeNull();
    expect(upscaleWarning(null, "1080p", "9:16")).toBeNull();
  });

  it("the threshold follows the resolution rather than a hard-coded number", () => {
    expect(upscaleWarning(probed(900, 1600), "720p", "9:16")).toBeNull();
    expect(upscaleWarning(probed(900, 1600), "4k", "9:16")).toContain("2160 px");
  });
});
