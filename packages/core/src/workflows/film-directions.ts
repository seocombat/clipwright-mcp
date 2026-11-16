import type { WorkflowPlanDocument } from '../contracts/v1/workflow-plan.js';
import type { WorkflowIssue } from '../contracts/v1/workflow-primitives.js';
import type { MethodDescriptor } from '../contracts/v1/workflow-catalog.js';
import { EXPLAINER_MAX_PRODUCT_PICTURES } from '../faceless-public.js';
import { resolveFacelessCustomerAnchors } from '../faceless-customer-anchors.js';
import { missingKitGlyphs, type FilmDirections, type FilmMoment } from '../film-directions.js';
import { workflowMethodVersion } from './catalog.js';

/** A method whose executor refuses to deliver a film that misses a required beat's visual (#1461). */
export const enforcesVisualBeats = (method: MethodDescriptor): boolean => method.binding.kind === 'native' && method.binding.visual_beats === 'enforced';

/** What the plan's pinned method requires of its film; none for a method that does not enforce its beats. */
export function workflowFilmDirections(document: WorkflowPlanDocument): FilmDirections | undefined {
    const method = workflowMethodVersion(document.method.method_id, document.method.version);
    if (!method || !enforcesVisualBeats(method)) return undefined;
    const captures = method.id === 'website-proof-demo';
    const moments: FilmMoment[] = captures ? [] : document.beats.flatMap(beat => beat.required && 'quote' in beat.anchor
        ? [{ id: beat.id, kind: beat.role === 'end_card' ? 'hold' as const : 'text' as const, quote: beat.anchor.quote,
            ...(beat.anchor.occurrence === undefined ? {} : { occurrence: beat.anchor.occurrence }) }] : []);
    return { method: method.id as FilmDirections['method'], moments, captures };
}

/** Why a plan of an enforcing method cannot be launched as planned: anchors, glyphs and captures, before any approval. */
export function filmDirectionIssues(method: MethodDescriptor, document: WorkflowPlanDocument): WorkflowIssue[] {
    if (!enforcesVisualBeats(method)) return [];
    const issues: WorkflowIssue[] = [];
    const add = (kind: string, path: string, message: string) => issues.push({ kind, path, message });
    const native = document.brief.native;
    if (native?.skill === 'make_faceless' && native.input.format !== 'explainer') add('film_format_required', 'brief.native.input.format', 'This method runs as format explainer.');
    for (const beat of document.beats.filter(item => item.required)) {
        if (!('quote' in beat.anchor)) { add('invalid_anchor', `beats.${beat.id}.anchor`, 'A required beat of this method names its words with a quote anchor.'); continue; }
        const glyphs = method.id === 'kinetic-launch' ? missingKitGlyphs(beat.anchor.quote) : [];
        if (glyphs.length) add('glyph_unsupported', `beats.${beat.id}.anchor.quote`, `The film fonts cannot draw ${glyphs.map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}.`);
    }
    if (method.id !== 'website-proof-demo') return issues;
    if (document.assets.length > EXPLAINER_MAX_PRODUCT_PICTURES) add('too_many_captures', 'assets', `This method shows at most ${EXPLAINER_MAX_PRODUCT_PICTURES} captures.`);
    for (const asset of document.assets) if (asset.purpose !== 'ui_proof') add('capture_required', `assets.${asset.instance_id}.purpose`, 'Each asset of this method is a ui_proof capture.');
    const script = document.brief.script;
    if (script === undefined) return issues;
    let shown: { first: number; end: number }[];
    try { shown = resolveFacelessCustomerAnchors(script, document.assets.map(asset => ({ image_url: asset.asset_id, anchor: asset.anchor }))); }
    catch { return issues; }
    for (const beat of document.beats.filter(item => item.required)) {
        let span: { first: number; end: number };
        try { span = resolveFacelessCustomerAnchors(script, [{ image_url: beat.id, anchor: beat.anchor }])[0]!; }
        catch { continue; }
        if (!shown.some(range => range.first < span.end && span.first < range.end)) {
            add('beat_without_capture', `beats.${beat.id}`, 'A required beat of this method needs a capture asset on its words.');
        }
    }
    return issues;
}
