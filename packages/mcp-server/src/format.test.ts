import { describe, expect, it } from "vitest";

import { AI_DISCLOSURE_TEXT, RUN_MONEY_FIELDS, SKILLS, VIDEO_URL_CHECK, type RunRead } from "@clipwright/core";

import { formatGetRun, PENDING_RESULTS } from "./format.js";

/** A run in the read projection (`state: string`) with any state. */
function run(state: string, over: Partial<RunRead> = {}): RunRead {
  return {
    run_id: "run_test1",
    skill: "make_ugc",
    state,
    credits_reserved: 8,
    credits_charged: null,
    warnings: [],
    error: null,
    final_output: null,
    steps: [],
    created_at: new Date().toISOString(),
    finished_at: null,
    ...over,
  } as RunRead;
}

it("preserves explicit unavailable speech timing gaps in successful MCP output", () => {
  const metric = { status: "unavailable", reason: "missing_timings" } as const;
  const result = payload(formatGetRun(run("succeeded", { final_output: {
    video_url: "https://cdn.example/v.mp4", duration_seconds: 7.36,
    ai_generated: true, ai_disclosure: AI_DISCLOSURE_TEXT, speech_timing_gaps: metric,
  } })));
  expect(result.speech_timing_gaps).toEqual(metric);
});

/** #1366. Mutants: the post lines dropped from the success answer or from its report, or a key added to a film delivered without them. */
it("a film delivered with post lines carries them and shows them quoted in the report; one without them adds nothing", () => {
  const final_output = { video_url: "https://cdn.example/v.mp4", duration_seconds: 30, ai_generated: true as const, ai_disclosure: AI_DISCLOSURE_TEXT };
  const lined = payload(formatGetRun(run("succeeded", { skill: "make_faceless", final_output: { ...final_output, post_text: "Heat moves out.\nCool air stays." } })));
  expect(lined.post_text).toBe("Heat moves out.\nCool air stays.");
  expect(lined.display_markdown).toContain("> Heat moves out.\n> Cool air stays.");
  const bare = payload(formatGetRun(run("succeeded", { skill: "make_faceless", final_output })));
  expect(bare).not.toHaveProperty("post_text");
  expect(bare.display_markdown).not.toMatch(/^> |publish/m);
});

/** Mutant: drop `video` from the success answer, or invent one; the agent then cannot name 720p, or names a guess (#1188). */
it("a succeeded video carries its measured frame and names it in the report; an unmeasured one carries neither", () => {
  const final_output = { video_url: "https://cdn.example/v.mp4", duration_seconds: 7.36, ai_generated: true as const, ai_disclosure: AI_DISCLOSURE_TEXT };
  const measured = payload(formatGetRun(run("succeeded", { final_output, video: { width: 720, height: 1280 } })));
  expect(measured.video).toEqual({ width: 720, height: 1280 });
  expect(measured.display_markdown).toContain("| 7.4 s · 720p |");
  const unmeasured = payload(formatGetRun(run("succeeded", { final_output })));
  expect(unmeasured).not.toHaveProperty("video");
  expect(unmeasured.display_markdown).toContain("| 7.4 s |");
});

/** Mutant: the block dropped from the success branch, and an agent never sees the generated file. */
it("a succeeded generation carries its generation block; a run without one adds no key", () => {
  const generation = { kind: "image", model: "seedream-5.0-flash", url: "https://cdn.example/i.png", mime: "image/png",
    width: 1440, height: 2560, duration_s: null, reusable_until: new Date().toISOString() } as const;
  expect(payload(formatGetRun(run("succeeded", { skill: "generate_image", generation }))).generation).toEqual(generation);
  expect(payload(formatGetRun(run("succeeded")))).not.toHaveProperty("generation");
  const generated = payload(formatGetRun(run("succeeded", { skill: "generate_image", generation })));
  expect(generated).not.toHaveProperty("video_url");
  expect(generated).not.toHaveProperty("duration_seconds");
  expect(generated).toHaveProperty("url_check");
  expect(payload(formatGetRun(run("succeeded")))).toHaveProperty("video_url_check");
});

/** Mutant: the candidate block dropped from the success branch, and create_candidate over MCP never shows its preview. */
it("a succeeded shot candidate carries its candidate block and no video fields; a run without one adds no key", () => {
  const candidate = { source_run_id: "run_src1", root_run_id: "run_root1", shot_id: "shot_03", kind: "picture",
    operation_mode: null, take: 1, preview_url: "https://cdn.example/runs/run_c/candidate/unit.png?sig=1",
    usable_until: new Date().toISOString() } as const;
  const shown = payload(formatGetRun(run("succeeded", { skill: "edit_shot", candidate, final_output: null })));
  expect(shown.candidate).toEqual(candidate);
  expect(shown).not.toHaveProperty("video_url");
  expect(shown).toHaveProperty("url_check");
  expect(payload(formatGetRun(run("succeeded")))).not.toHaveProperty("candidate");
});

/** Parsed JSON from the single content block. */
function payload(res: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("formatGetRun — terminal shape", () => {
  it("a terminal success carries BOTH status:SUCCEEDED AND state:succeeded", () => {
    const out = payload(
      formatGetRun(
        run("succeeded", {
          final_output: {
            video_url: "https://cdn.example/v.mp4",
            duration_seconds: 7.36,
            // Disclosure fields are required by the schema; without them the
            // test would check a shape production never allows.
            ai_generated: true as const,
            ai_disclosure: "a sentence of this run alone",
          },
        }),
      ),
    );
    // Two separate assertions: the agent's instruction AND the actual state.
    expect(out.status).toBe("SUCCEEDED");
    expect(out.state).toBe("succeeded");
    expect(out.video_url).toBe("https://cdn.example/v.mp4");
    // clipwright#488: the statement of THIS run passes through; no constant holds this text.
    expect(out.ai_disclosure).toBe("a sentence of this run alone");
  });

  /** The URL is signed for GET, so `curl -I` gets 403 and looks dead; the */
  /** response says how to check it right where it hands the URL out. */
  it("the link comes with what to check it by", () => {
    const out = payload(
      formatGetRun(
        run("succeeded", {
          final_output: {
            video_url: "https://cdn.example/v.mp4",
            duration_seconds: 7.36,
            ai_generated: true as const,
            ai_disclosure: AI_DISCLOSURE_TEXT,
          },
        }),
      ),
    );
    expect(out.video_url_check).toBe(VIDEO_URL_CHECK);
    expect(out.video_url_check).toContain("HEAD returns 403");
    expect(out.video_url_check).toContain("curl -r 0-0");
  });

  it("a terminal failure carries BOTH status:FAILED AND state:failed", () => {
    const out = payload(formatGetRun(run("failed", { error: "boom" })));
    expect(out.status).toBe("FAILED");
    expect(out.state).toBe("failed");
    expect(out.error).toBe("boom");
  });

  it("non-terminal stage → IN_PROGRESS with the actual state", () => {
    const out = payload(formatGetRun(run("avatar")));
    expect(out.status).toBe("IN_PROGRESS");
    expect(out.state).toBe("avatar");
    expect(out.video_url).toBeNull();
  });

  /** Mutant: say "Video is NOT ready" for every run, and an agent waiting on a picture tells the user about a video (#1172). */
  it("an unfinished run names what it delivers: a video only for a video run", () => {
    // Pinned by hand, not read from PENDING_RESULTS: a skill filed under the wrong result would pass a test that derives it (Codex r1).
    const expected: Record<(typeof SKILLS)[number], [string, string]> = {
      make_ugc: ["video", "video_url"], make_faceless: ["video", "video_url"], revise_long_form: ["video", "video_url"],
      generate_image: ["image", "generation.url"], generate_video: ["clip", "generation.url"], edit_shot: ["shot candidate", "candidate"],
      create_actor: ["actor", "created_actor.actor_id"],
    };
    expect(Object.keys(PENDING_RESULTS).sort()).toEqual([...SKILLS].sort());
    for (const skill of SKILLS) {
      const out = payload(formatGetRun(run("queued", { skill })));
      const [noun, field] = expected[skill];
      expect(out.next_action).toMatch(new RegExp(`^The ${noun} is NOT ready\\.`));
      expect(out.next_action).toContain(`until you have ${field}.`);
      const video = noun === "video";
      expect(/video/i.test(out.next_action as string), skill).toBe(video);
      expect("video_url" in out, skill).toBe(video);
    }
    expect(payload(formatGetRun(run("queued", { skill: "analyze_something" }))).next_action).toMatch(/^The result is NOT ready\./);
  });

  it("an unknown TERMINAL status falls back to IN_PROGRESS (deliberate degradation)", () => {
    // "canceled" is not in TERMINAL_STATES → isTerminal=false → IN_PROGRESS branch.
    const out = payload(formatGetRun(run("canceled")));
    expect(out.status).toBe("IN_PROGRESS");
    expect(out.state).toBe("canceled");
  });
});

describe("formatGetRun — warnings in every branch", () => {
  // Discrepancies are never silent: MCP must show warnings as REST does.
  const W = ["subtitles are not rendered in prototype (stage-B)"];

  it("SUCCEEDED carries warnings", () => {
    const out = payload(
      formatGetRun(
        run("succeeded", {
          warnings: W,
          final_output: {
            video_url: "https://cdn.example/v.mp4",
            duration_seconds: 7.36,
            ai_generated: true as const,
            ai_disclosure: AI_DISCLOSURE_TEXT,
          },
        }),
      ),
    );
    expect(out.warnings).toEqual(W);
  });

  it("FAILED carries warnings", () => {
    const out = payload(formatGetRun(run("failed", { warnings: W, error: "boom" })));
    expect(out.warnings).toEqual(W);
  });

  it("IN_PROGRESS carries warnings", () => {
    const out = payload(formatGetRun(run("avatar", { warnings: W })));
    expect(out.warnings).toEqual(W);
  });
});

/** Money fields are ONE decision for two surfaces: names come from the run */
/** schema, not copied here and in REST separately. */
describe("formatGetRun — money is shown, not derived by subtraction", () => {
  const states = [
    { name: "IN_PROGRESS", read: run("avatar", { credits_reserved: 240, credits_charged: null, balance_after_credits: null }) },
    { name: "SUCCEEDED", read: run("succeeded", { credits_reserved: 240, credits_charged: 240, balance_after_credits: 4321 }) },
    { name: "FAILED", read: run("failed", { credits_reserved: 240, credits_charged: 0, balance_after_credits: 4561, error: "boom" }) },
  ];

  it.each(states)("$name carries every contract money field with the same value", ({ read }) => {
    // Mutant: drop `...runMoney(run)` from any branch and this fails.
    const out = payload(formatGetRun(read));

    expect(RUN_MONEY_FIELDS.length).toBeGreaterThan(0);
    for (const field of RUN_MONEY_FIELDS) {
      expect(out, `MCP lost ${field}`).toHaveProperty(field, read[field]);
    }
  });

  it("the registry names exactly the fields the run schema carries", () => {
    expect([...RUN_MONEY_FIELDS].sort()).toEqual(["balance_after_credits", "credits_charged", "credits_reserved"]);
  });
});
