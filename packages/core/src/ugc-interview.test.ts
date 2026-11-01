import { describe, expect, it } from "vitest";
import { makeUgcInput, serverUgcInputWith } from "./skills.js";
import { dispositionWarnings, mcpUgcInputShape } from "./contract-dispositions.js";
import { interviewOffScreenVoice, interviewRefusals, interviewTexts, interviewTurnRanges, MAX_INTERVIEW_TAKES, presenterTakeCount, wordGazes,
  wordSpeakers } from "./ugc-interview.js";

// The reference: an interviewer's questions off screen, one-word answers, a call to action to the lens.
const JOB = "What's the best AI for writing? Claude. And for images? Midjourney. What about video? Veo. Follow for daily AI tips.";
const jobTurns = [{ anchor: { quote: "What's the best AI for writing" } }, { anchor: { quote: "And for images" } }, { anchor: { quote: "What about video" } }];
// An unlike one: a founder answering two long questions, a female interviewer, captions white for both.
const FOUNDER = "Why did you start Northwind? Because every small bakery I knew lost a third of its bread each week, and nobody could tell them why. " +
  "What changed in year two? We stopped selling software and started selling fewer wasted loaves, and the shops paid for that gladly.";
const founderTurns = [{ anchor: { quote: "Why did you start Northwind" } }, { anchor: { quote: "What changed in year two" } }];
const base = { broll_policy: "anyone" as const, resolution: "1080p" as const };

describe("interview texts", () => {
  it("cuts the script into alternating lines at word boundaries and keeps punctuation with its word", () => {
    const turns = interviewTurnRanges(JOB, jobTurns);
    if (!Array.isArray(turns)) throw new Error(turns.message);
    expect(interviewTexts(JOB, turns).map(line => [line.speaker, line.text])).toEqual([
      ["off_screen", "What's the best AI for writing?"], ["presenter", "Claude."], ["off_screen", "And for images?"], ["presenter", "Midjourney."],
      ["off_screen", "What about video?"], ["presenter", "Veo. Follow for daily AI tips."]]);
  });

  it("splits inside a chunk when a turn ends at a word glued to the next one", () => {
    const script = "Ready?Yes,absolutely we are.";
    const turns = interviewTurnRanges(script, [{ anchor: { startWord: 0, endWord: 1 } }]);
    if (!Array.isArray(turns)) throw new Error(turns.message);
    expect(interviewTexts(script, turns).map(line => line.text)).toEqual(["Ready?", "Yes,absolutely we are."]);
  });

  it("joins adjacent turns into one line and orders turns by their words", () => {
    const turns = interviewTurnRanges(FOUNDER, [founderTurns[1]!, founderTurns[0]!]);
    expect(turns).toEqual([{ startWord: 0, coverWord: 5 }, { startWord: 25, coverWord: 30 }]);
    expect(interviewTurnRanges("One two three four.", [{ anchor: { startWord: 0, endWord: 1 } }, { anchor: { startWord: 1, endWord: 2 } }]))
      .toEqual([{ startWord: 0, coverWord: 2 }]);
  });

  it("names each word's speaker and gaze", () => {
    const turns = interviewTurnRanges(JOB, jobTurns) as { startWord: number; coverWord: number }[];
    const speakers = wordSpeakers(20, turns);
    expect(speakers.slice(0, 8)).toEqual(["off_screen", "off_screen", "off_screen", "off_screen", "off_screen", "off_screen", "presenter", "off_screen"]);
    const gazes = wordGazes(JOB, { interview: { gaze: "left" }, presenter_gaze: [{ anchor: { quote: "Follow for daily AI tips" }, gaze: "camera" }] });
    expect(gazes.slice(-6)).toEqual(["left", "camera", "camera", "camera", "camera", "camera"]);
  });
});

describe("interview contract", () => {
  const job = { ...base, script: JOB, actor_id: "actor_18", captions: true, interview: { turns: jobTurns, gaze: "left" as const },
    presenter_gaze: [{ anchor: { quote: "Follow for daily AI tips" }, gaze: "camera" as const }] };

  it("accepts the reference and counts one take per answer plus one at the change of gaze", () => {
    expect(makeUgcInput.safeParse(job).success).toBe(true);
    expect(presenterTakeCount(JOB, job)).toBe(4);
  });

  it("accepts an unlike interview: two long answers, a female interviewer and white captions for both", () => {
    const founder = { ...base, script: FOUNDER, captions: true, caption_style: "accent" as const,
      interview: { turns: founderTurns, off_screen: { voice: "sarah", caption: { style: "minimalist" as const } } } };
    const parsed = makeUgcInput.safeParse(founder);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(presenterTakeCount(FOUNDER, founder)).toBe(2);
    expect(dispositionWarnings(parsed.data as never)).toContain("the opening question freezes the presenter on the first frame of their first answer");
  });

  const refused = (input: Record<string, unknown>) => {
    const parsed = makeUgcInput.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
  };

  it("refuses before money, each refusal naming its field", () => {
    expect(refused({ ...job, interview: { turns: [{ anchor: { quote: "What about video" } }, { anchor: { quote: "about video" } }] } }))
      .toContain("interview.turns.1.anchor: overlaps turn 0");
    expect(refused({ ...job, presenter_gaze: undefined, interview: { turns: [{ anchor: { startWord: 0, endWord: 20 } }] } }))
      .toContain("interview.turns: every word is the off-screen speaker's: the presenter needs words");
    expect(refused({ ...job, voice: "sarah", interview: { turns: jobTurns, off_screen: { voice: "sarah" } } }))
      .toContain("interview.off_screen.voice: the off-screen speaker needs a voice other than the presenter's");
    expect(refused({ ...job, actor_id: undefined, interview: { turns: jobTurns } })).toContain(
      "presenter_gaze.0: presenter_gaze[0]: needs actor_id; list_actors shows each actor's views");
    expect(refused({ ...job, actor_id: undefined, presenter_gaze: undefined })).toContain("interview.gaze: interview.gaze needs actor_id; list_actors shows each actor's views");
    expect(refused({ ...job, presenter_gaze: [{ anchor: { quote: "And for images" }, gaze: "camera" }] }))
      .toContain("presenter_gaze.0.anchor: the presenter looks where they speak: these words are the off-screen speaker's");
    expect(refused({ ...job, caption_emphasis: ["images"] })).toContain("caption_emphasis.0: \"images\" is spoken off screen; emphasis marks the presenter's words");
    expect(refused({ ...job, tts_model: "eleven_flash_v2_5" }))
      .toContain("tts_model: an interview speaks both voices as one conversation on eleven_v4: omit tts_model or pass eleven_v4");
    expect(refused({ ...job, interview: { turns: jobTurns, listening: "live" } })[0]).toMatch(/^interview\.listening: listening live is not offered yet/);
    expect(refused({ ...job, captions: false, interview: { turns: jobTurns, gaze: "left", off_screen: { caption: { style: "hormozi" } } } }))
      .toContain("interview.off_screen.caption: interview.off_screen.caption requires captions=true: it styles the off-screen speaker's captions");
    expect(refused({ ...job, call: { after: { quote: "Claude" }, lines: [{ speaker: "agent", text: "Hi" }, { speaker: "caller", text: "Hey" }] } }))
      .toContain("interview: interview needs script and cannot be combined with segments or call");
  });

  it("refuses an interview whose presenter would appear in more takes than the cap", () => {
    const answers = Array.from({ length: MAX_INTERVIEW_TAKES + 1 }, (_, index) => `Question number ${index + 1}? Answer ${index + 1}.`).join(" ");
    const turns = Array.from({ length: MAX_INTERVIEW_TAKES + 1 }, (_, index) => ({ anchor: { quote: `Question number ${index + 1}` } }));
    expect(interviewRefusals({ script: answers, interview: { turns: turns.slice(0, 12) } }))
      .toEqual([{ path: ["interview"], message: "the presenter appears in 11 takes, more than 10; merge answers or drop a change of gaze" }]);
  });

  it("checks the off-screen voice against the catalog, as the call's voices are", () => {
    const schema = serverUgcInputWith(voice => voice === "nobody" ? "voice \"nobody\" is not in list_voices" : undefined);
    const parsed = schema.safeParse({ ...job, interview: { turns: jobTurns, gaze: "left", off_screen: { voice: "nobody" } } });
    expect(parsed.success ? [] : parsed.error.issues.map(issue => issue.message)).toEqual(["voice \"nobody\" is not in list_voices"]);
  });

  // #972 I2: the presenter without `voice` speaks its gender's default, so an off-screen voice equal to that default is refused.
  it("refuses an off-screen voice equal to the presenter's default when the input names the presenter's gender", () => {
    const plain = { script: JOB, broll_policy: "anyone", interview: { turns: jobTurns } };
    const voiceOf = (input: Record<string, unknown>, voice: string) => interviewRefusals({ ...plain, ...input,
      interview: { ...plain.interview, off_screen: { voice } } }).map(refusal => `${refusal.path.join(".")}: ${refusal.message}`);
    const shared = "interview.off_screen.voice: the off-screen speaker needs a voice other than the presenter's";
    expect(voiceOf({}, "george")).toEqual([shared]);
    expect(voiceOf({}, "sarah")).toEqual([]);
    expect(voiceOf({ image: "https://media.test/p.png", actor_gender: "female" }, "sarah")).toEqual([shared]);
    expect(voiceOf({ image: "https://media.test/p.png", actor_gender: "female" }, "george")).toEqual([]);
    expect(voiceOf({ voice_id: "a".repeat(20) }, "george")).toEqual([]);
    expect(voiceOf({ actor_id: "actor_anna", voice: "george" }, "george")).toEqual([shared]);
  });

  it("keeps the off-screen voice off the presenter's by default", () => {
    expect(interviewOffScreenVoice({}, () => false)).toBe("en_male_mark");
    expect(interviewOffScreenVoice({}, voice => voice === "en_male_mark")).toBe("en_female_cassidy");
    expect(interviewOffScreenVoice({ off_screen: { voice: "sarah" } }, () => true)).toBe("sarah");
  });

  it("names a long freeze and an unhonoured voice_pace in warnings[]", () => {
    const long = `${"Tell me everything about how you hired your first ten people and what went wrong ".repeat(2)}? We hired friends.`;
    const warnings = dispositionWarnings({ script: long, interview: { turns: [{ anchor: { startWord: 0, endWord: 30 } }] }, voice_pace: 1.1 });
    expect(warnings.some(line => /^the presenter holds still for about \d+\.\d s while the off-screen speaker talks$/.test(line))).toBe(true);
    expect(warnings.some(line => line.startsWith("voice_pace does not change an interview"))).toBe(true);
  });

  it("offers MCP a slim interview and the gaze list", () => {
    expect(Object.keys(mcpUgcInputShape)).toEqual(expect.arrayContaining(["interview", "presenter_gaze"]));
  });
});
