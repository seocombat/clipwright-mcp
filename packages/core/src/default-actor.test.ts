import { describe, expect, it } from "vitest";

import {
  actorForInput,
  actorGenderIgnoredWarning,
  buildActorGenderWarnings,
  buildVoiceActorMatchWarnings,
  buildVoiceWarnings,
  DEFAULT_ACTOR,
  DEFAULT_ACTOR_GENDER,
  DEFAULT_ACTOR_SOURCE,
  IMAGE_DEFAULT_VOICE_WARNING,
  RAW_VOICE_ID_VALIDATION_WARNING,
  voiceActorGenderWarning,
  voiceGenderFor,
  VOICE_PRESETS,
} from "@clipwright/core";
import { voiceGenderOf } from "@clipwright/core/voice-admission";

/** The actor as an observable value, and the default voice chosen by its gender. */

describe("DEFAULT_ACTOR — a recorded measurement, not a guess", () => {
  it("the gender is declared, and it is the one measured on the look", () => {
    expect(DEFAULT_ACTOR_GENDER).toBe("male");
    expect(DEFAULT_ACTOR).toEqual({ gender: "male" });
  });

  it("the frame sides match the vendor's answer about the look", () => {
    expect(DEFAULT_ACTOR_SOURCE).toEqual({ width: 432, height: 768, origin: "default" });
  });
});

describe("actorForInput — we stay silent about someone else's face", () => {
  it("describes the resolved catalog actor and refuses an unresolved ID", () => {
    expect(actorForInput({ actor_id: "actor_anna" }, { actor_id: "actor_anna", gender: "female", version: 1 }))
      .toEqual({ actor_id: "actor_anna", gender: "female", version: 1 });
    expect(() => actorForInput({ actor_id: "actor_anna" })).toThrow();
  });
  it("without image our actor is in the frame, and we name it", () => {
    expect(actorForInput({})).toEqual({ gender: "male" });
    expect(actorForInput({ image: undefined })).toEqual({ gender: "male" });
  });

  // Returning DEFAULT_ACTOR unconditionally turns this red: claiming our face where
  // a foreign one renders describes a different clip.
  it("with image the actor is NOT named: the client's face is in the frame", () => {
    expect(actorForInput({ image: "https://example.com/face.png" })).toBeNull();
  });
});

describe("voices and actor share one type", () => {
  // The pair it was all for: the owner's voice on the product's actor.
  it("the owner's clone matches the actor, the female presets do not", () => {
    expect(VOICE_PRESETS.owner_ru_clone.gender).toBe(DEFAULT_ACTOR_GENDER);
    expect(VOICE_PRESETS.george.gender).toBe(DEFAULT_ACTOR_GENDER);
    expect(VOICE_PRESETS.sarah.gender).not.toBe(DEFAULT_ACTOR_GENDER);
    expect(VOICE_PRESETS.daria_ru_female.gender).not.toBe(DEFAULT_ACTOR_GENDER);
  });

  // An explicit voice is used as requested: the chosen actor's gender neither replaces nor disputes it.
  it("an explicit voice on an actor or the default face raises no gender warning", () => {
    for (const name of Object.keys(VOICE_PRESETS)) {
      const voice = name as keyof typeof VOICE_PRESETS;
      const warnings = [
        ...buildVoiceWarnings({ voice, script: "Привет! Сегодня расскажу, как собрать короткое видео за минуту." }),
        ...buildActorGenderWarnings({ voice }),
        ...buildActorGenderWarnings({ voice, actor_id: "actor_anna" }),
      ];
      expect(warnings.join(" ")).not.toMatch(/gender|male|female|актёр|actor/i);
    }
  });
});

describe("voiceGenderFor — the gender that picks the default voice", () => {
  it("actor_id → the pin's gender, not the input hint", () => {
    const pin = { actor_id: "actor_anna", gender: "female" as const };
    expect(voiceGenderFor({ actor_id: "actor_anna" }, pin)).toBe("female");
    expect(voiceGenderFor({ actor_id: "actor_anna", actor_gender: "male" }, pin)).toBe("female");
  });

  // A personal actor is not in the catalog: the gender is read from the pin, not looked up by actor_id.
  it("takes the gender from the pin for an actor_id unknown to the catalog", () => {
    expect(voiceGenderFor({ actor_id: "actor_u_x1" }, { actor_id: "actor_u_x1", gender: "male" })).toBe("male");
  });

  it("actor_id without a pin, or with another actor's pin, throws instead of using a wrong gender", () => {
    expect(() => voiceGenderFor({ actor_id: "actor_anna" })).toThrow();
    expect(() => voiceGenderFor({ actor_id: "actor_anna" }, { actor_id: "actor_maya", gender: "female" })).toThrow();
  });

  it("image → actor_gender; image without a hint → unknown; nothing → the default actor's gender", () => {
    const image = "https://example.com/face.png";
    expect(voiceGenderFor({ image, actor_gender: "female" })).toBe("female");
    expect(voiceGenderFor({ image, actor_gender: "male" })).toBe("male");
    expect(voiceGenderFor({ image })).toBeUndefined();
    expect(voiceGenderFor({})).toBe(DEFAULT_ACTOR_GENDER);
  });
});

describe("buildActorGenderWarnings — a gender-based voice is declared, not guessed silently", () => {
  const image = "https://example.com/face.png";

  it("image without a voice or actor_gender → a default-voice warning naming voice first", () => {
    expect(buildActorGenderWarnings({ image })).toEqual([IMAGE_DEFAULT_VOICE_WARNING]);
    expect(IMAGE_DEFAULT_VOICE_WARNING).toContain('"george"');
    expect(IMAGE_DEFAULT_VOICE_WARNING.indexOf("voice (")).toBeLessThan(IMAGE_DEFAULT_VOICE_WARNING.indexOf("actor_gender"));
  });

  it("actor_gender with an explicit voice or voice_id → \"changed nothing\", naming the field", () => {
    expect(buildActorGenderWarnings({ image, actor_gender: "female", voice: "george" })).toEqual([
      actorGenderIgnoredWarning("voice"),
    ]);
    expect(buildActorGenderWarnings({ image, actor_gender: "female", voice_id: "EXAVITQu4vr4xnSDxMaL" })).toEqual([
      actorGenderIgnoredWarning("voice_id"),
    ]);
  });

  it("is silent on actor_id, on the default actor and on image with actor_gender", () => {
    expect(buildActorGenderWarnings({ actor_id: "actor_anna" })).toEqual([]);
    expect(buildActorGenderWarnings({})).toEqual([]);
    expect(buildActorGenderWarnings({ image, actor_gender: "male" })).toEqual([]);
    expect(buildActorGenderWarnings({ image, voice: "sarah" })).toEqual([]);
  });

  it("does not emit the quote-only raw voice_id line", () => {
    const warnings = buildActorGenderWarnings({ image, actor_gender: "male", voice_id: "EXAVITQu4vr4xnSDxMaL" });
    expect(warnings).not.toContain(RAW_VOICE_ID_VALIDATION_WARNING);
  });
});

/** An explicit voice was never checked, so a male face could speak with a female voice */
/** silently: a paid clip that gets thrown away. */
describe("buildVoiceActorMatchWarnings — voice and face gender mismatch", () => {
  const image = "https://example.com/face.png";
  const match = (input: Parameters<typeof buildVoiceActorMatchWarnings>[0], pin?: "female" | "male") =>
    buildVoiceActorMatchWarnings(input, voiceGenderOf, pin);

  it("the default (male) actor + a female voice → a warning", () => {
    // Removing the check turns this red.
    const warnings = match({ voice: "daria_ru_female" });

    expect(warnings).toEqual([voiceActorGenderWarning("daria_ru_female", "female", "male")]);
    expect(warnings[0]).toContain("daria_ru_female");
  });

  it("a male actor_id + a female voice → a warning by the PIN's gender", () => {
    expect(match({ actor_id: "actor_anna", voice: "sarah" }, "male")).toEqual([
      voiceActorGenderWarning("sarah", "female", "male"),
    ]);
  });

  it("image + actor_gender: female + a male voice → a warning", () => {
    expect(match({ image, actor_gender: "female", voice: "george" })).toEqual([
      voiceActorGenderWarning("george", "male", "female"),
    ]);
  });

  it("a catalog voice is checked by the vendor label, not only presets", () => {
    expect(match({ voice: "ru_female_marina" })).toHaveLength(1);
    expect(match({ voice: "ru_male_nikolay" })).toEqual([]);
  });

  it("a match is silent, and so is everything there is nothing to judge by", () => {
    expect(match({ voice: "george" })).toEqual([]);
    expect(match({ image, voice: "sarah" }), "face gender unknown").toEqual([]);
    expect(match({ voice_id: "EXAVITQu4vr4xnSDxMaL" }), "a raw id has no gender").toEqual([]);
    expect(match({ actor_id: "actor_anna", voice: "sarah" }), "no pin, nothing to judge by").toEqual([]);
  });
});
