import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { listVoices } from "./voice-listing.js";
import { measuredPaceOf, VOICE_PACE, voicesNearestPace } from "./voice-pace.js";
import { DEFAULT_TTS_MODEL } from "./voices.js";

type Measurement = { model: string; script: string; rows: { voice: string; gender: string; words_per_second: number }[] };
const read = (file: string) => JSON.parse(readFileSync(new URL(`../../../docs/assets/measurements/${file}`, import.meta.url), "utf8")) as Measurement;
// The fast voices of #1086 were measured later with the same script and model; their rows join the first measurement's.
const measurements = [read("voice-pace-2026-10-28.json"), read("voice-pace-2026-11-04-fast-voices.json")];
const measurement = { model: measurements[0]!.model, rows: measurements.flatMap(item => item.rows) };

describe("the voice pace table (#890)", () => {
  /** Mutant: edit one pace by hand, and the table no longer says what the probe measured. */
  it("is the per-voice mean of every take in the measurement, any speed, since eleven_v4 has none", () => {
    const voices = [...new Set(measurement.rows.map(row => row.voice))];
    const mean = (voice: string) => { const takes = measurement.rows.filter(row => row.voice === voice).map(row => row.words_per_second);
      return Math.round((takes.reduce((a, b) => a + b, 0) / takes.length) * 100) / 100; };
    expect(new Set(measurements.map(item => `${item.model}\n${item.script}`)).size).toBe(1);
    expect(VOICE_PACE.model).toBe(measurement.model);
    expect(Object.fromEntries(VOICE_PACE.voices.map(entry => [entry.voice, [entry.gender, entry.words_per_second]])))
      .toEqual(Object.fromEntries(voices.map(voice => [voice, [measurement.rows.find(row => row.voice === voice)!.gender, mean(voice)]])));
  });

  it("names only English make_ugc voices that speak the measured model", () => {
    const listed = new Map(listVoices({ language: "en" }).voices.map(entry => [entry.name, entry]));
    for (const entry of VOICE_PACE.voices) {
      expect(listed.get(entry.voice), entry.voice).toMatchObject({ model: DEFAULT_TTS_MODEL, gender: entry.gender });
    }
  });

  it("puts the nearest voices first, of one gender when asked", () => {
    expect(voicesNearestPace(3.7, "male").map(entry => entry.voice)).toEqual(["en_male_marcus", "en_male_dexter", "en_male_liam"]);
    expect(voicesNearestPace(3.0, "female", 1).map(entry => entry.voice)).toEqual(["en_female_jessica_anne_bogart"]);
    expect(measuredPaceOf("daria_ru_female")).toBeUndefined();
  });
});

describe("list_voices words_per_second (#890)", () => {
  /** Mutant: drop the pace from the listing, and an agent has nothing to match a reference presenter with. */
  it("carries the measured pace on measured voices and omits it elsewhere", () => {
    const { voices } = listVoices({});
    const byName = new Map(voices.map(entry => [entry.name, entry]));
    expect(byName.get("sarah")?.words_per_second).toBe(3.33);
    expect(byName.get("en_male_mark")?.words_per_second).toBe(3.58);
    expect(byName.get("daria_ru_female")).not.toHaveProperty("words_per_second");
    expect(voices.filter(entry => entry.words_per_second !== undefined)).toHaveLength(VOICE_PACE.voices.length);
  });

  /** Mutant: key the pace on the model filter instead of the entry's own model, and a filtered list loses it. */
  it("keeps the pace under a model filter: it belongs to the entry's own model", () => {
    const sarah = listVoices({ model: "eleven_flash_v2_5" }).voices.find(entry => entry.name === "sarah");
    expect(sarah).toMatchObject({ model: DEFAULT_TTS_MODEL, words_per_second: 3.33 });
  });
});
