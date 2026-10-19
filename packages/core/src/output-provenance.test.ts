import { describe, expect, it } from "vitest";
import {
  createOutputProvenancePolicy,
  matchesPublicOutputMarker,
  outputProvenancePolicySchema,
  readStoredOutputProvenance,
} from "./index.js";

const payload = "1011011110011000111111000000011111011111011100000110110110111";
const snapshot = {
  policy_version: "clipwright-output-marking-v2",
  watermark_profile: "trustmark-python-0.9.2-q-bch5-strength1",
  video_watermark_profile: "trustmark-python-0.9.2-p-bch5-strength1",
  video_detector: "p2-temporal-presence-v1",
  video_quality_contract: "p2-psnr35-human-reviewed-v1",
  c2pa_version: "0.28.2",
  public_payload: payload,
  visible_ai_label: true,
};

describe("internal output provenance policy", () => {
  it("refuses old, mixed and missing P2 bindings instead of upgrading required policy", () => {
    for (const change of [{ policy_version: "clipwright-output-marking-v1" }, { video_detector: undefined },
      { video_quality_contract: undefined }, { video_detector: "exact-codeword-repetition-v1" }, { video_quality_contract: "p1" }]) {
      expect(outputProvenancePolicySchema.safeParse({ ...snapshot, ...change }).success).toBe(false);
    }
    expect(() => readStoredOutputProvenance({ output_provenance_version: "clipwright-output-marking-v1", output_provenance: snapshot })).toThrow();
  });
  it("defaults presenter video to visible disclosure and permits a visible-only opt-out", () => {
    expect(createOutputProvenancePolicy("make_ugc")).toEqual(snapshot);
    expect(createOutputProvenancePolicy("make_ugc", false)).toEqual({ ...snapshot, visible_ai_label: false });
    expect(createOutputProvenancePolicy("make_ugc", true)).toEqual(snapshot);
  });

  it.each(["make_faceless", "edit_shot", "create_actor"])("keeps %s out of presenter labeling", skill => {
    expect(createOutputProvenancePolicy(skill)).toEqual({ ...snapshot, visible_ai_label: false });
    expect(createOutputProvenancePolicy(skill, false).visible_ai_label).toBe(false);
    expect(() => createOutputProvenancePolicy(skill, true)).toThrow();
  });

  it.each(["make_long_form", "quote_ugc", "toString", "", null, 1])("rejects unknown skill %s", skill => {
    expect(() => createOutputProvenancePolicy(skill)).toThrow();
  });

  it.each([null, "false", "true", 0, 1, {}, []])("does not coerce label preference %s", value => {
    expect(() => createOutputProvenancePolicy("make_ugc", value)).toThrow();
  });

  it.each([
    { policy_version: "future" }, { watermark_profile: "other-model" },
    { video_watermark_profile: "trustmark-python-0.9.2-q-bch5-strength1" },
    { c2pa_version: "0.28.3" }, { public_payload: payload.slice(1) },
    { visible_ai_label: "false" }, { owner_id: "forged" },
  ])("rejects an unsupported or forged stored policy %j", change => {
    expect(() => readStoredOutputProvenance({ output_provenance_version: snapshot.policy_version, output_provenance: { ...snapshot, ...change } })).toThrow();
  });

  it("detaches and freezes snapshots from both factory and raw storage", () => {
    const source = { ...snapshot };
    const parsed = readStoredOutputProvenance({ output_provenance_version: snapshot.policy_version, output_provenance: source });
    source.visible_ai_label = false;
    expect(parsed).toEqual(snapshot);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(createOutputProvenancePolicy("make_ugc"))).toBe(true);
    expect(Object.isFrozen(outputProvenancePolicySchema.parse(snapshot))).toBe(true);
    expect(() => Object.assign(parsed!, { visible_ai_label: false })).toThrow();
  });

  it("requires an explicit pinned video profile even for image-only admission", () => {
    const { video_watermark_profile: _omitted, ...incomplete } = snapshot;
    expect(() => outputProvenancePolicySchema.parse(incomplete)).toThrow();
    expect(createOutputProvenancePolicy("create_actor")).toMatchObject({ video_watermark_profile: snapshot.video_watermark_profile });
  });

  it.each([null, "legacy"])("reads the known legacy pair %s / SQL NULL", version => {
    expect(readStoredOutputProvenance({ output_provenance_version: version, output_provenance: null })).toBeNull();
  });

  it.each([
    {}, { output_provenance_version: null }, { output_provenance: null },
    { output_provenance_version: undefined, output_provenance: null },
    { output_provenance_version: null, output_provenance: undefined },
    Object.create({ output_provenance_version: null, output_provenance: null }),
    { output_provenance_version: null, output_provenance: snapshot },
    { output_provenance_version: "legacy", output_provenance: snapshot },
    { output_provenance_version: "future", output_provenance: snapshot },
    { output_provenance_version: "future", output_provenance: null },
    { output_provenance_version: snapshot.policy_version, output_provenance: null },
    { output_provenance_version: snapshot.policy_version, output_provenance: undefined },
    ...[false, {}, [], "legacy"].map(policy => ({ output_provenance_version: snapshot.policy_version, output_provenance: policy })),
  ])("rejects omitted projections and invalid version/policy pairs %j", row => {
    expect(() => readStoredOutputProvenance(row)).toThrow();
  });

  it.each([null, undefined, 0, "row", []])("rejects non-object stored rows %s", row => {
    expect(() => readStoredOutputProvenance(row)).toThrow();
  });
});

describe("public output marker native-tuple predicate", () => {
  it("matches the complete ECC-decoded public namespace", () => {
    expect(matchesPublicOutputMarker([payload, true, 1])).toBe(true);
  });

  it.each([
    ["0011011110011000111111000000011111011111011100000110110110111", true, 1],
    ["0100100001100111000000111111100000100000100011111001001001000", true, 1],
    [payload, false, 1], [payload, true, 3],
    [`${payload}00000000000000`, true, 3],
    ["010100010101011110000111100111111101100000111010110100101000010000001001001", true, 3],
    ["", false, -1],
    [payload.slice(1), true, 1], [`0${payload}`, true, 1], [`${payload}0`, true, 1],
  ])("does not verify a complete different native tuple %j", (decoded, present, schema) => {
    expect(matchesPublicOutputMarker([decoded, present, schema])).toBe(false);
  });

  it.each([
    null, undefined, {}, [], [payload, true], [payload, true, 1, "extra"],
    [payload, 1, 1], [payload, "true", 1], [payload, true, "1"],
    [payload, true, true], [payload, true, 1.5], [payload, true, Number.NaN],
    [101, true, 1], [null, false, -1], ["nonbinary", true, 1],
    { decoded: payload, present: true, schema: 1 },
  ])("reports malformed decoder output as an error rather than a negative %j", tuple => {
    expect(() => matchesPublicOutputMarker(tuple)).toThrow();
  });
});
