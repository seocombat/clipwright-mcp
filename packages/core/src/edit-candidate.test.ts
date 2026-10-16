import { describe, expect, it } from "vitest";

import {
  CANDIDATE_CHARGE_TEXT, candidateQuote, candidateQuoteRead, candidateRequest, runCandidates, runCandidatesRead, storedCandidateInput,
} from "./edit-candidate.js";
import { run } from "./runs.js";

const request = { shot_id: "beat-2", operation: { mode: "retake" }, take: 1 };
const member = { source_run_id: "run_src", root_run_id: "run_root", shot_id: "beat-2", kind: "picture", operation_mode: "retake", take: 1,
  preview_url: null, usable_until: null };

describe("candidateRequest", () => {
  it("takes a shot, one operation and a positive whole take, and nothing else", () => {
    expect(candidateRequest.parse(request)).toEqual(request);
    for (const body of [{ ...request, take: 0 }, { ...request, take: 1.5 }, { ...request, take: Number.MAX_SAFE_INTEGER + 1 },
      { shot_id: "beat-2", operation: { mode: "retake" } }, { ...request, extra: 1 }, { ...request, operation: { mode: "dance" } },
      { ...request, operation: { mode: "retake", description: "x" } }, { ...request, shot_id: "../beat" }]) {
      expect(candidateRequest.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

describe("the candidate contracts", () => {
  it("a quote is strict, names the family, and prices at least one credit", () => {
    const quote = { source_run_id: "run_src", root_run_id: "run_root", shot_id: "beat-1", kind: "clip", operation_mode: "new_picture",
      unit: "clip_with_new_picture", credits: 160, usable_until: "2026-11-01T00:00:00.000Z", warnings: [], contract_version: "v" };
    expect(candidateQuote.parse(quote)).toEqual(quote);
    for (const broken of [{ ...quote, extra: 1 }, { ...quote, credits: 0 }, { ...quote, unit: "kept_clip" }, { ...quote, kind: "presenter" }]) {
      expect(candidateQuote.safeParse(broken).success, JSON.stringify(broken)).toBe(false);
    }
  });

  it("the stored input is the request plus what admission resolved, strict at both levels", () => {
    const stored = { source_run_id: "run_src", ...request,
      resolved_candidate: { root_run_id: "run_root", shot_kind: "picture", unit: "picture", credits: 10 } };
    expect(storedCandidateInput.parse(stored)).toEqual(stored);
    expect(storedCandidateInput.safeParse({ ...stored, extra: 1 }).success).toBe(false);
    expect(storedCandidateInput.safeParse({ ...stored, resolved_candidate: { ...stored.resolved_candidate, extra: 1 } }).success).toBe(false);
    expect(storedCandidateInput.safeParse({ redacted: true }).success).toBe(false);
  });

  it("a run carries the candidate member, and a redacted one keeps its family with a null mode and take", () => {
    const base = { run_id: "run_cand", skill: "edit_shot", state: "queued", credits_reserved: 10, credits_charged: null, error: null,
      final_output: null, created_at: "2026-10-15T00:00:00.000Z", finished_at: null };
    expect(run.parse({ ...base, candidate: member }).candidate).toEqual(member);
    expect(run.parse({ ...base, candidate: { ...member, operation_mode: null, take: null } }).candidate?.take).toBeNull();
    expect(run.safeParse({ ...base, candidate: { ...member, kind: "presenter" } }).success).toBe(false);
  });

  it("the list is strict and every candidate carries its run's state and money", () => {
    const listed = { ...member, run_id: "run_cand", state: "succeeded", credits_reserved: 10, credits_charged: 10,
      created_at: "2026-10-15T00:00:00.000Z", finished_at: "2026-10-15T00:01:00.000Z" };
    const body = { run_id: "run_src", root_run_id: "run_root", candidates: [listed], contract_version: "v" };
    expect(runCandidates.parse(body)).toEqual(body);
    expect(runCandidates.safeParse({ ...body, extra: 1 }).success).toBe(false);
    const { credits_charged: _dropped, ...withoutCharge } = listed;
    expect(runCandidates.safeParse({ ...body, candidates: [withoutCharge] }).success).toBe(false);
  });
});

describe("the read projections installed clients parse", () => {
  const quote = { source_run_id: "run_src", root_run_id: "run_root", shot_id: "beat-1", kind: "picture", operation_mode: "retake",
    unit: "picture", credits: 10, usable_until: "2026-11-01T00:00:00.000Z", warnings: [], contract_version: "v" };
  const listed = { ...member, run_id: "run_cand", state: "succeeded", credits_reserved: 10, credits_charged: 10,
    created_at: "2026-10-15T00:00:00.000Z", finished_at: "2026-10-15T00:01:00.000Z" };

  /** Mutant: read with the closed schema, and a kind, mode, unit, state or key a newer server adds breaks every installed client. */
  it("a quote with an unknown kind, mode, unit and key parses and keeps the key", () => {
    const later = { ...quote, kind: "sound", operation_mode: "restyle", unit: "voice", note: "kept" };
    expect(candidateQuote.safeParse(later).success).toBe(false);
    expect(candidateQuoteRead.parse(later)).toEqual(later);
    for (const broken of [{ ...quote, credits: 0 }, { ...quote, root_run_id: "root" }, { ...quote, unit: "" }]) {
      expect(candidateQuoteRead.safeParse(broken).success, JSON.stringify(broken)).toBe(false);
    }
  });

  it("a list with an unknown kind, mode, state and keys parses and keeps the keys", () => {
    const body = { run_id: "run_src", root_run_id: "run_root", contract_version: "v", next: "kept",
      candidates: [{ ...listed, kind: "sound", operation_mode: "restyle", state: "held", extra: 1 }, { ...listed, operation_mode: null }] };
    expect(runCandidates.safeParse(body).success).toBe(false);
    expect(runCandidatesRead.parse(body)).toEqual(body);
    expect(runCandidatesRead.safeParse({ ...body, candidates: [{ ...listed, credits_reserved: -1 }] }).success).toBe(false);
  });

  it("the charge sentence names kept and discarded, and promises nothing back", () => {
    expect(CANDIDATE_CHARGE_TEXT).toContain("whether it is kept or discarded");
    expect(CANDIDATE_CHARGE_TEXT).toContain("one that fails is charged nothing");
    expect(CANDIDATE_CHARGE_TEXT).not.toMatch(/refund|money back|free retr/i);
  });
});
