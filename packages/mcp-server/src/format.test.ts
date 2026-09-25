import { describe, expect, it } from "vitest";

import { AI_DISCLOSURE_TEXT, RUN_MONEY_FIELDS, VIDEO_URL_CHECK, type RunRead } from "@clipwright/core";

import { formatGetRun } from "./format.js";

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
            ai_disclosure: AI_DISCLOSURE_TEXT,
          },
        }),
      ),
    );
    // Two separate assertions: the agent's instruction AND the actual state.
    expect(out.status).toBe("SUCCEEDED");
    expect(out.state).toBe("succeeded");
    expect(out.video_url).toBe("https://cdn.example/v.mp4");
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
    { name: "IN_PROGRESS", read: run("avatar", { credits_reserved: 240, credits_charged: null }) },
    { name: "SUCCEEDED", read: run("succeeded", { credits_reserved: 240, credits_charged: 240 }) },
    { name: "FAILED", read: run("failed", { credits_reserved: 240, credits_charged: 0, error: "boom" }) },
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
    expect([...RUN_MONEY_FIELDS].sort()).toEqual(["credits_charged", "credits_reserved"]);
  });
});
