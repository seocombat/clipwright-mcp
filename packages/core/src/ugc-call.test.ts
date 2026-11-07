import { describe, expect, it } from "vitest";
import { dispositionWarnings, GOOGLE_TTS_MODEL, isNarratedUgcInput, makeUgcInput, MODEL_VOICE_MODEL, resolveDispositions, serverUgcInputWith } from "@clipwright/core";
import { CALL_LIVE_SEC, callGapFrames, callVoices, DEFAULT_CALL_VOICES, MAX_CALL_CHARS, MAX_CALL_LINE_CHARS, MAX_CALL_SEC } from "./ugc-call.js";

// The call field (#857 S5, C1, C2): its refusals before money and the gap arithmetic the worker opens.

const script = "Here is the proof it actually works. And that is how you never miss a call.";
const lines = [{ speaker: "agent", text: "Hi, thanks for calling Brightline Plumbing! This is Mia. How can I help you?" },
  { speaker: "caller", text: "Hey Mia, it's Dan Walker. My water heater just started leaking, and I need someone out today." },
  { speaker: "agent", text: "Of course, Dan. I've booked you for two o'clock today, and I'm texting you the details now." }];
const call = { after: { quote: "actually works" }, lines };

function refusals(body: Record<string, unknown>): string[] {
  const parsed = makeUgcInput.safeParse({ script, ...body });
  return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

describe("call in the make_ugc contract (C1)", () => {
  it("accepts a call after a quote and takes the narrated long-form path", () => {
    const parsed = makeUgcInput.parse({ script, call });
    expect(parsed.call).toEqual(call);
    expect(isNarratedUgcInput(parsed)).toBe(true);
    expect(isNarratedUgcInput(makeUgcInput.parse({ script }))).toBe(false);
    // The call brings its own phone, which the run's theme and sounds style without any template.
    expect(refusals({ call, template_sounds: false, template_theme: { preset: "bold_dark" } })).toEqual([]);
    expect(refusals({ template_sounds: false })).toEqual(["template_sounds: template_sounds sounds templates: add templates or drop it"]);
  });

  const long = (chars: number) => "word ".repeat(Math.ceil(chars / 5)).slice(0, chars - 1) + ".";
  /** Each row is one refusal of C1; mutant: drop any one, and the run reaches money with a call it cannot place. */
  const cases: [string, Record<string, unknown>, string][] = [
    ["no script", { script: undefined, segments: [{ kind: "actor", script: "Hello there friend." }], call },
      "call: call requires script and cannot be combined with segments"],
    ["a frame other than 9:16", { call, aspect_ratio: "16:9" },
      "call: call needs a 9:16 frame: the phone and the listening presenter are staged for it, not 16:9"],
    ["after not in the script", { call: { ...call, after: { quote: "never said" } } }, 'call.after: anchor quote "never said" does not occur in script'],
    ["no words after the call", { call: { ...call, after: { quote: "miss a call" } } },
      "call.after: the call needs words after it: the presenter resumes on the word after its quote"],
    ["an insert over its last word", { call, inserts: [{ id: "i", media_url: "https://example.com/a.png", media_type: "image", anchor: { quote: "works" } }],
      broll_policy: "anyone" }, 'call.after: the call opens after words insert "i" covers: the presenter must be on screen to listen'],
    ["fewer than 2 lines", { call: { ...call, lines: lines.slice(0, 1) } }, "call.lines: a call needs at least two lines"],
    ["lines from one speaker", { call: { ...call, lines: [lines[0], lines[2]] } }, "call.lines: a call needs lines from both the agent and the caller"],
    ["a line over 1000 characters", { call: { ...call, lines: [lines[0], { speaker: "caller", text: long(MAX_CALL_LINE_CHARS + 1) }] } },
      "call.lines.1.text: Too big: expected string to have <=1000 characters"],
    ["more than 5,000 characters", { call: { ...call, lines: Array.from({ length: 6 }, (_, at) => ({ speaker: at % 2 ? "caller" : "agent", text: long(900) })) } },
      `call.lines: the call's lines hold 5400 characters, more than ${MAX_CALL_CHARS}`],
    ["a call estimated over 120 s", { call: { ...call, lines: Array.from({ length: 3 }, (_, at) => ({ speaker: at % 2 ? "caller" : "agent", text: long(800) })) } },
      `call.lines: the call runs about 127 s, longer than ${MAX_CALL_SEC} s: shorten its lines`],
    ["a narration model with no word timings", { call, tts_model: GOOGLE_TTS_MODEL },
      `call: call is not available with ${GOOGLE_TTS_MODEL}: it returns no word timings to open the call after its quote; omit call, or choose another tts_model`],
    ["the agent in the narration's voice", { voice: "en_female_cassidy", call: { ...call, voices: { agent: "en_female_cassidy" } } },
      "call.voices.agent: the call's agent needs a voice other than the narration's, or the presenter seems to answer in their own voice"],
  ];
  it.each(cases)("refuses %s before money", (_name, body, message) => {
    expect(refusals(body)).toEqual([message]);
  });

  it("refuses a model voice or an unknown name on the server, by path", () => {
    const server = serverUgcInputWith(voice => voice === "nobody" ? 'voice "nobody" is not in list_voices' : undefined);
    const issues = server.safeParse({ script, call: { ...call, voices: { agent: "nobody", caller: "kore" } } }).error?.issues
      .map(issue => `${issue.path.join(".")}: ${issue.message}`);
    expect(issues).toEqual(['call.voices.agent: voice "nobody" is not in list_voices', `call.voices.caller: "kore" is a voice of ${MODEL_VOICE_MODEL}, which speaks no call`]);
  });

  /** Mutant: drop the warning line, and a 21 s freeze is delivered unnamed (rule 3). */
  it("names a call over 20 s in warnings and stays quiet under it", () => {
    const longer = { ...call, lines: [...lines, ...lines, ...lines.slice(0, 1)] };
    expect(dispositionWarnings({ script, call: longer })).toEqual(["the call runs about 32 s, longer than 20 s: the presenter holds still through all of it"]);
    expect(dispositionWarnings({ script, call })).toEqual([]);
  });

  it("is offered with long-form qualification only", () => {
    expect(resolveDispositions({ remoteFetch: true, compose: true, longForm: true }).call).toEqual({ kind: "implemented", provenBy: "composition" });
    expect(resolveDispositions({ remoteFetch: true, compose: true, longForm: false }).call.kind).toBe("rejected");
  });

  it("picks the bake-off pair, and a second agent when the narration speaks the first", () => {
    expect(callVoices({}, "george")).toEqual(DEFAULT_CALL_VOICES);
    expect(callVoices({}, DEFAULT_CALL_VOICES.agent)).toEqual({ agent: "sarah", caller: DEFAULT_CALL_VOICES.caller });
    expect(callVoices({ voices: { caller: "george" } }, undefined)).toEqual({ agent: DEFAULT_CALL_VOICES.agent, caller: "george" });
  });
});

describe("the call's gap (C2, D2)", () => {
  const fps = 25, live = Math.round(CALL_LIVE_SEC * fps);
  /** The reference: a 15.76 s call after 3.58 s of listening gives a 17.30 s gap and a 13.72 s hold; its phone enters 0.38 s before the
   *  presenter's last word ends, which ours cannot (#924), so ours runs those 0.38 s longer. */
  it("matches the reference but for the phone's lead: gap = ring lead + call + 0.40 s tail, hold = gap − live", () => {
    const gap = callGapFrames({ callFrames: Math.ceil(15.76 * fps), liveFrames: live, fps });
    expect(Math.abs(gap.gapFrames / fps - (17.3 + 0.38))).toBeLessThanOrEqual(1 / fps);
    expect(Math.abs(gap.holdFrames / fps - (13.72 + 0.38))).toBeLessThanOrEqual(1 / fps);
    expect(gap.holdFrames).toBe(gap.gapFrames - live);
    // The first word 1.52 s after the presenter's last, the ring 0.07 s after the phone.
    expect(Math.abs(gap.voiceFrom / fps - 1.52)).toBeLessThanOrEqual(1 / fps);
    expect(gap.ringFrom - gap.phoneEntry).toBe(2);
    expect(gap.gapFrames - gap.voiceFrom - Math.ceil(15.76 * fps)).toBe(10);
  });

  /** #924: S6's ring began 0.36 s before the phone showed: the phone was timed to enter 9 frames before the gap, over the talking take, where the
   *  composition never draws it. Mutant: drop the floor, and the ring plays over the last word again. */
  it("enters the phone no earlier than the gap's first frame, the ring 0.07 s after it", () => {
    expect(callGapFrames({ callFrames: 400, liveFrames: live, fps })).toMatchObject({ phoneEntry: 0, ringFrom: 2, voiceFrom: 38 });
    // A live beat longer than the lead takes the phone 3.96 s before the freeze, as the reference.
    expect(callGapFrames({ callFrames: 400, liveFrames: 120, fps })).toMatchObject({ phoneEntry: 21, ringFrom: 23 });
  });

  it("without the live beat the phone enters at the freeze: gap = 1.92 s + call", () => {
    const gap = callGapFrames({ callFrames: 400, liveFrames: 0, fps });
    expect(gap).toEqual({ phoneEntry: 0, ringFrom: 2, voiceFrom: 38, gapFrames: 448, holdFrames: 448 });
  });

  it("keeps a hold of one tail under a call too short to outlast the listening", () => {
    expect(callGapFrames({ callFrames: 25, liveFrames: live, fps })).toMatchObject({ gapFrames: live + 10, holdFrames: 10 });
    expect(() => callGapFrames({ callFrames: 0, liveFrames: live, fps })).toThrow("whole frames");
  });
});
