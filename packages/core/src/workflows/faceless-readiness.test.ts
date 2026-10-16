import { expect, it } from "vitest";
import { queryWorkflowMethod, validateWorkflowPlan, workflowPlanDocument, type CapabilityProfile } from "./index.js";

const capabilities: CapabilityProfile = { v: 1, content_digest: "a".repeat(64), executors: [{
  skill: "make_faceless", configured: true, qualified: true, enabled: true, profiles: ["faceless-native-v1"],
  features: ["exact_script", "voice", "word_anchors", "scene_images"], formats: [{ aspect_ratio: "9:16", resolution: "1080p" }],
  field_dispositions: {},
}] };

it.each([false, true])("validates faceless narration and anchors on the worker's lexical clock (assets: %s)", withAssets => {
  const descriptor = queryWorkflowMethod("faceless-explainer", capabilities)!.descriptor;
  const script = `Hello—Mira costs 12.50. ${descriptor.example.brief.script}`;
  const document = workflowPlanDocument.parse({ v: 1,
    method: { method_id: descriptor.id, version: descriptor.version, content_digest: descriptor.content_digest, capability_digest: capabilities.content_digest },
    brief: { ...descriptor.example.brief, script, native: { skill: "make_faceless", input: { input_mode: "script", script, duration_seconds: 30 } } },
    beats: [{ ...descriptor.example.beats[0], anchor: { startWord: 0, endWord: 2 } }, ...descriptor.example.beats.slice(1)],
    claims: [], assets: withAssets ? [{ instance_id: "mira", asset_id: `upl_${"1".repeat(32)}`, content_digest: "b".repeat(64),
      provenance: "owner_supplied", rights: "owner_authorized", purpose: "illustration", anchor: { quote: "Hello Mira" } }] : [],
  });
  expect(validateWorkflowPlan(document, capabilities)).toEqual({ ready: true, issues: [], warnings: [] });
});

it.each(["absent", "warned", "stored", "rejected", "implemented"])("requires a measured protected placement executor, disposition %s", disposition => {
  const snapshot = structuredClone(capabilities), executor = snapshot.executors[0]!;
  if (disposition !== "absent") {
    executor.features.push("protected_product_area");
    executor.field_dispositions.protected_product_area = disposition as "warned" | "stored" | "rejected" | "implemented";
  }
  const descriptor = queryWorkflowMethod("product-image-story", snapshot)!.descriptor;
  const document = workflowPlanDocument.parse({ v: 1,
    method: { method_id: descriptor.id, version: descriptor.version, content_digest: descriptor.content_digest, capability_digest: snapshot.content_digest },
    brief: descriptor.example.brief, beats: descriptor.example.beats, claims: [],
    assets: [{ instance_id: "original", asset_id: `upl_${"1".repeat(32)}`, content_digest: "b".repeat(64),
      provenance: "owner_supplied", rights: "owner_authorized", purpose: "product_proof", anchor: { quote: "ceramic mug" },
      protected_area: { x: .45, y: .45, width: .05, height: .05 } }],
  });
  const result = validateWorkflowPlan(document, snapshot);
  expect(result.issues.filter(issue => issue.kind === "placement_preflight_required")).toHaveLength(disposition === "implemented" ? 0 : 1);
  expect(result.ready).toBe(disposition === "implemented");
});
