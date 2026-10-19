import type { AssetBinding } from "../contracts/v1/workflow-evidence.js";

export const PRODUCT_PHOTO_REFERENCE_LIMIT = 2;

function eligibleOriginal(asset: AssetBinding): boolean {
  return asset.purpose === "product_proof" && (asset.provenance === "owner_supplied" || asset.provenance === "verified_capture") &&
    (asset.rights === "owner_authorized" || asset.rights === "licensed");
}

export function selectWorkflowProductReferences(methodId: string, assets: readonly AssetBinding[]): readonly AssetBinding[] {
  if (methodId !== "product-image-story") return [];
  const seen = new Set<string>(); const selected: AssetBinding[] = [];
  for (const asset of assets) {
    if (!eligibleOriginal(asset) || seen.has(asset.content_digest)) continue;
    seen.add(asset.content_digest); selected.push(asset);
    if (selected.length === PRODUCT_PHOTO_REFERENCE_LIMIT) break;
  }
  return selected;
}

export function workflowProductReferenceWarnings(methodId: string, assets: readonly AssetBinding[]): string[] {
  if (methodId !== "product-image-story") return [];
  const selected = selectWorkflowProductReferences(methodId, assets);
  if (!selected.length) return [];
  const distinct = new Set(assets.filter(eligibleOriginal).map(asset => asset.content_digest)).size;
  return [`Generated product scenes use ${selected.length} original product-photo reference(s), chosen from the first two distinct ` +
    "eligible originals in accepted asset order. The first is the primary shape anchor; generated illustrations may differ from the originals. " +
    (distinct > selected.length ? "All additional originals remain in their bound placements." : "All supplied originals keep their bound placements.")];
}
