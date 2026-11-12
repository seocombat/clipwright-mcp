import type { PartsLine } from "./parts-pricing.js";

// Templates that stand the presenter in front of their own picture (#1428): the presenter is cut out of the take over the template's words.

/** The switch on the server; off, a template that needs the cut-out is refused before any money. */
export function isPresenterMatteEnabled(env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): boolean {
  return env.CLIPWRIGHT_PRESENTER_MATTE === "1";
}

/** The kinds drawn with the presenter cut out in front of them, each with its quote line's words. */
const CUTOUT_LABELS = { cover_story: "cover story, presenter in front", backdrop: "backdrop, presenter in front" } as const;
export const CUTOUT_TEMPLATE_KINDS = Object.keys(CUTOUT_LABELS) as readonly (keyof typeof CUTOUT_LABELS)[];

export const PRESENTER_MATTE_DISABLED_MESSAGE = "cover_story and backdrop are not available right now; use another template kind";

const cutoutKindOf = (item: unknown) => (typeof item === "object" && item !== null
  ? CUTOUT_TEMPLATE_KINDS.find(kind => kind === (item as { kind?: unknown }).kind) : undefined);

/** Whether any of the templates stands the presenter in front of it. */
export function needsPresenterCutout(templates: unknown): boolean {
  return Array.isArray(templates) && templates.some(item => cutoutKindOf(item) !== undefined);
}

/** The quote's lines for these templates, one per kind: listed so the user sees them, at no charge. */
export function cutoutTemplateLines(templates: unknown): PartsLine[] {
  const kinds = Array.isArray(templates) ? templates.map(cutoutKindOf) : [];
  return CUTOUT_TEMPLATE_KINDS.flatMap(kind => {
    const count = kinds.filter(entry => entry === kind).length;
    return count ? [{ label: CUTOUT_LABELS[kind], unit: "template" as const, quantity: count, unit_credits: 0, credits: 0 }] : [];
  });
}

/** The run's line when the presenter could not be cut out: the template is drawn, with the take as a photo in it or without it, and the run says so. */
export function presenterCutoutMissingWarning(id: string, photo = true): string {
  return `template "${id}" was drawn without the presenter cut out: ` +
    (photo ? "the presenter shows as a photo inside the template" : "the template shows without the presenter");
}
