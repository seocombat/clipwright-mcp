import { describe, expect, it } from "vitest";
import { FIELD_DISPOSITIONS, resolveDispositions } from "./contract-dispositions.js";
import { quoteFaceless } from "./faceless-price.js";
import { isMusicEnabled, MUSIC_BED_CREDITS, musicLine, musicRequest } from "./music.js";
import { partsLineSchema } from "./parts-pricing.js";
import { makeUgcInput } from "./skills.js";

/** #1063 S1: music is a field the client must ask for, with its own line on the quote and a switch that refuses it when off. */

describe("the music field", () => {
  it('takes "auto" or { mood } and nothing looser', () => {
    expect(musicRequest.parse("auto")).toBe("auto");
    expect(musicRequest.parse({ mood: "  calm lo-fi " })).toEqual({ mood: "calm lo-fi" });
    for (const bad of [true, "loud", {}, { mood: "" }, { mood: "x".repeat(401) }, { mood: "a\nb" }, { mood: "calm", genre: "rock" }]) {
      expect(musicRequest.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  // Mutant: a default on the field, and every video carries music no one asked for.
  it("is absent from a make_ugc input that did not name it", () => {
    expect(makeUgcInput.parse({ script: "Hello there." }).music).toBeUndefined();
    expect(makeUgcInput.parse({ script: "Hello there.", music: "auto" }).music).toBe("auto");
  });

  it("is offered only behind its switch: off, the field is refused before any reserve", () => {
    expect(FIELD_DISPOSITIONS.music).toEqual({ kind: "implemented", provenBy: "finalization" });
    expect(resolveDispositions({ remoteFetch: true, compose: true }).music).toEqual({ kind: "rejected",
      message: "music is not available right now; omit it" });
    expect(resolveDispositions({ remoteFetch: true, compose: true, music: true }).music.kind).toBe("implemented");
    expect(isMusicEnabled({})).toBe(false);
    expect(isMusicEnabled({ CLIPWRIGHT_MUSIC: "1" })).toBe(true);
  });
});

describe("the music price", () => {
  it("is one track line a quote carries", () => {
    expect(musicLine()).toEqual({ label: "music", unit: "track", quantity: 1, unit_credits: MUSIC_BED_CREDITS, credits: MUSIC_BED_CREDITS });
    expect(partsLineSchema.safeParse(musicLine()).success).toBe(true);
  });

  // Mutant: a faceless quote adding music it was not asked for, or leaving it out of the total.
  it("adds to a faceless quote only when asked", () => {
    const plain = quoteFaceless({ outputFrames: 2250, captions: true });
    const music = quoteFaceless({ outputFrames: 2250, captions: true, music: "auto" });
    expect(plain.musicCredits).toBeUndefined();
    expect(music.musicCredits).toBe(MUSIC_BED_CREDITS);
    expect(music.totalCredits).toBe(plain.totalCredits + MUSIC_BED_CREDITS);
  });
});
