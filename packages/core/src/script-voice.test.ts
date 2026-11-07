import { describe, expect, it } from "vitest";

import { brandKitInput } from "./design.js";
import { applyScriptVoice, bannedPhrasesIn, endsOnSignOff, scriptVoice, secondLanguageLine, voiceBriefNote } from "./script-voice.js";

describe("script voice (#1203)", () => {
  it("takes a banned phrase out at a sentence start and hands the capital on", () => {
    const voiced = applyScriptVoice("Hey guys, today we fix a fuse. Literally in two minutes.", { banned_phrases: ["hey guys", "literally"] });
    expect(voiced.script).toBe("Today we fix a fuse. In two minutes.");
    expect(voiced.warnings).toEqual(['the script said "hey guys", "literally", banned by the saved script voice: they were taken out; ' +
      "rewrite a line if it now reads wrong"]);
    expect(voiced.removedWords).toBe(true);
  });

  /** Mutant (Codex r1): one pass over the phrases, and taking one out joins its neighbours into another that stays spoken. */
  it("takes out a banned phrase that taking another out has formed", () => {
    const voice = { banned_phrases: ["really very", "buy now"] };
    const voiced = applyScriptVoice("Buy really very now.", voice);
    expect(bannedPhrasesIn(voiced.script, voice)).toEqual([]);
    expect(voiced.warnings[0]).toContain('"buy now"');
  });

  /** Mutant (Codex r1): a line per phrase, and fifty of them push the sign-off line out of a plan's forty warnings. */
  it("says every phrase taken out in one line under 400 characters, the sign-off in its own", () => {
    const banned = Array.from({ length: 50 }, (_, at) => `bannedword${at}`);
    const voiced = applyScriptVoice(`${banned.join(" ")} stays.`, { banned_phrases: banned, sign_off: "Bye." });
    expect(voiced.warnings).toHaveLength(2);
    expect(voiced.warnings[0]!.length).toBeLessThanOrEqual(400);
    expect(voiced.warnings[0]).toMatch(/and \d+ more/);
    expect(voiced.warnings[1]).toContain('"Bye."');
  });

  it("takes a phrase out mid-sentence with one space left, every time it occurs, in any case", () => {
    const voiced = applyScriptVoice("This GAME-CHANGER kit is a game-changer, honestly.", { banned_phrases: ["game-changer"] });
    expect(voiced.script).toBe("This kit is a, honestly.");
    expect(voiced.warnings[0]).toContain('"game-changer" 2 times');
  });

  it("matches whole words only", () => {
    expect(applyScriptVoice("The cheapest way.", { banned_phrases: ["cheap"] }).changed).toBe(false);
    expect(bannedPhrasesIn("It is cheap.", { banned_phrases: ["cheap", "free"] })).toEqual(["cheap"]);
  });

  /** Mutants (Codex r2): take a sign or a decimal point for the gap's punctuation, and the cut changes a number nobody is warned about. */
  it("keeps a number's sign and decimal point beside a phrase taken out", () => {
    const voice = { banned_phrases: ["literally"] };
    expect(applyScriptVoice("Literally -20°C outside.", voice).script).toBe("-20°C outside.");
    expect(applyScriptVoice("It holds literally .5 liters.", voice).script).toBe("It holds .5 liters.");
    expect(applyScriptVoice("Literally .5 liters. Wow!", voice).script).toBe(".5 liters. Wow!");
    expect(applyScriptVoice("Cold, literally -20 outside.", voice).script).toBe("Cold, -20 outside.");
    expect(applyScriptVoice("It works, literally!! Try it.", voice).script).toBe("It works!! Try it.");
    expect(applyScriptVoice("Literally... it works.", voice).script).toBe("It works.");
  });

  it("drops a sentence that was only the phrase", () => {
    expect(applyScriptVoice("Fix it today. Trust me! Call us.", { banned_phrases: ["trust me"] }).script).toBe("Fix it today. Call us.");
  });

  it("adds the sign-off once, and never to a script that already ends on it", () => {
    const voice = { sign_off: "Volt & Co. Lights on." };
    const once = applyScriptVoice("Call an electrician", voice);
    expect(once.script).toBe("Call an electrician. Volt & Co. Lights on.");
    expect(once.warnings).toEqual(['the saved sign-off "Volt & Co. Lights on." was added as the script\'s last line']);
    expect(applyScriptVoice(once.script, voice).changed).toBe(false);
    expect(endsOnSignOff("…call us. volt & co, lights on!", voice.sign_off)).toBe(true);
    expect(applyScriptVoice("Call us.", voice, { signOff: false }).changed).toBe(false);
  });

  it("gives an emptied script no sign-off, so its caller refuses it", () => {
    const voiced = applyScriptVoice("Literally.", { banned_phrases: ["literally"], sign_off: "Bye." });
    expect(voiced.script).toBe("");
  });

  it("refuses an empty voice and a sign-off that says a banned phrase", () => {
    expect(scriptVoice.safeParse({}).success).toBe(false);
    expect(scriptVoice.safeParse({ sign_off: "Trust me, call us.", banned_phrases: ["trust me"] }).success).toBe(false);
    expect(scriptVoice.safeParse({ second_language: "Spanish" }).success).toBe(false);
    expect(scriptVoice.safeParse({ second_language: "pt-BR", default_format: "faceless" }).success).toBe(true);
  });

  it("saves design and voice on their own; a call naming neither is refused", () => {
    expect(brandKitInput.safeParse({ voice: { tone: "calm" } }).success).toBe(true);
    expect(brandKitInput.safeParse({ design: null }).success).toBe(true);
    expect(brandKitInput.safeParse({}).success).toBe(false);
  });

  it("words the voice for a writer and names the free second-language version", () => {
    expect(voiceBriefNote({ about: "An electrician to homeowners", banned_phrases: ["cheap"], sign_off: "Lights on." }))
      .toBe('Script voice of this account: Speaker and audience: An electrician to homeowners. End the narration with exactly: "Lights on.". ' +
        'Never use these words or phrases: "cheap".');
    expect(voiceBriefNote({ caption_cta: "Link in bio" })).toBeUndefined();
    expect(secondLanguageLine("es")).toContain("free");
  });
});
