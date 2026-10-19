import { expect, it } from "vitest";
import type { AssetBinding } from "../contracts/v1/workflow-evidence.js";
import { selectWorkflowProductReferences, workflowProductReferenceWarnings } from "./product-references.js";

const asset = (seed: string, patch: Partial<AssetBinding> = {}): AssetBinding => ({
  instance_id: `view-${seed}`, asset_id: `upl_${seed.repeat(32)}`, content_digest: seed.repeat(64),
  anchor: { startWord: 20, endWord: 23 }, provenance: "owner_supplied", rights: "owner_authorized", purpose: "product_proof", ...patch,
});
it("selects the first two distinct eligible originals without changing accepted order or placements", () => {
  const assets = [asset("a", { purpose: "illustration" }), asset("b"), asset("b", { instance_id: "repeat" }),
    asset("c", { provenance: "verified_capture", rights: "licensed" }), asset("d")];
  const before = structuredClone(assets);
  expect(selectWorkflowProductReferences("product-image-story", assets)).toEqual([assets[1], assets[3]]);
  expect(assets).toEqual(before);
});
it.each(["faceless-explainer", "ugc-product-intro", "future-method"])("keeps %s outside product conditioning", method => {
  expect(selectWorkflowProductReferences(method, [asset("a")])).toEqual([]);
  expect(workflowProductReferenceWarnings(method, [asset("a")])).toEqual([]);
});
it("does not turn illustrations, unresolved rights or UI evidence into product identity", () => {
  const assets = [asset("a", { provenance: "generated_illustration" }), asset("b", { rights: "unresolved" }),
    asset("c", { purpose: "ui_proof" }), asset("d")];
  expect(selectWorkflowProductReferences("product-image-story", assets)).toEqual([assets[3]]);
});
it.each([1, 2, 3])("discloses the bounded reference selection and illustration limits before purchase (%s originals)", count => {
  const assets = [asset("a"), asset("b"), asset("c")].slice(0, count);
  const warning = workflowProductReferenceWarnings("product-image-story", assets).join(" ");
  expect(warning).toContain(`${Math.min(count, 2)} original product-photo`);
  expect(warning).toContain("first two distinct"); expect(warning).toContain("accepted asset order");
  expect(warning).toContain("primary shape"); expect(warning).toContain("may differ");
  if (count > 2) expect(warning).toContain("additional originals remain in their bound placements");
});
