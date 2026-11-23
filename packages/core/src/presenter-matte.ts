import type { PartsLine } from "./parts-pricing.js";

const CUTOUT_LABELS = { cover_story: "cover story, presenter in front", backdrop: "backdrop, presenter in front" } as const;
export const CUTOUT_TEMPLATE_KINDS = Object.keys(CUTOUT_LABELS) as readonly (keyof typeof CUTOUT_LABELS)[];

const cutoutKindOf = (item: unknown) => (typeof item === "object" && item !== null
  ? CUTOUT_TEMPLATE_KINDS.find(kind => kind === (item as { kind?: unknown }).kind) : undefined);

export function needsPresenterCutout(templates: unknown): boolean {
  return Array.isArray(templates) && templates.some(item => cutoutKindOf(item) !== undefined);
}

export function cutoutTemplateLines(templates: unknown): PartsLine[] {
  const kinds = Array.isArray(templates) ? templates.map(cutoutKindOf) : [];
  return CUTOUT_TEMPLATE_KINDS.flatMap(kind => {
    const count = kinds.filter(entry => entry === kind).length;
    return count ? [{ label: CUTOUT_LABELS[kind], unit: "template" as const, quantity: count, unit_credits: 0, credits: 0 }] : [];
  });
}

export function pictureCutoutMissingWarning(id: string, photo = true): string {
  return `template "${id}" was drawn without the subject of its picture cut out: ` +
    (photo ? "the picture shows as a photo inside the template" : "the template shows without the picture");
}

export function presenterCutoutMissingWarning(id: string, photo = true): string {
  return `template "${id}" was drawn without the presenter cut out: ` +
    (photo ? "the presenter shows as a photo inside the template" : "the template shows without the presenter");
}
