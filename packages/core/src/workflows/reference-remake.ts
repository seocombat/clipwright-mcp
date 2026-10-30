import { z } from 'zod';
import { actorIdScope } from '../account-actors.js';
import { DEFAULT_ASPECT_RATIO } from '../aspect.js';
import { assetId } from '../asset-identity.js';
import { captionLanguageOf } from '../caption-language.js';
import { LONG_FORM_QUALIFICATION_MAX_DURATION_SEC } from '../long-form-profile.js';
import { estimateDurationSec } from '../pacing.js';
import { referenceProfile, type ReferenceProfile } from '../reference-profile.js';
import { narrationPaceFromVoice, PAUSE_TRIM_CEILING_S, pauseTrimFromVoice } from '../reference-voice.js';
import { countActorShots, coverWordOf, lexicalTokens, planSemanticInserts, quoteOccurrences } from '../semantic-inserts.js';
import { actorId, callStage, type CallStage, isNarratedUgcInput, makeUgcInput, makeUgcInputShape, MAX_NARRATED_ACTOR_SHOTS, ugcCall } from '../skills.js';
import { CALL_PHONE_DEFAULTS, CALL_STAGE_SIDES } from '../ugc-call.js';
import { templateFaceWarnings, templateMediaOf, templateTextRefusal } from '../templates/index.js';
import { faceZone, frameCanvasOf, OVERLAY_POSITIONS, overlayRect, rectsOverlap, type OverlayPosition, type PresenterFraming } from '../ugc-layers.js';
import { isEnglishScript, measuredPaceOf, PACE_MATCH_SHARE, VOICE_PACE_RANGE, voicesNearestPace } from '../voice-pace.js';
import { BREAK_TAG_SOURCE, FIXED_PACE_MODELS, resolveTtsModel } from '../voices.js';
import type { CapabilityProfile } from '../contracts/v1/workflow-catalog.js';
import { workflowPlanDocument, type WorkflowPlanDocument } from '../contracts/v1/workflow-plan.js';
import { workflowText, type WorkflowIssue } from '../contracts/v1/workflow-primitives.js';
import { queryWorkflowMethod } from './catalog.js';

// The reference-remake compiler (#857 S2a): a profile and an accepted script become a complete plan whose native input is a make_ugc input.

export const planReferenceRemake = z.strictObject({
    reference_profile: referenceProfile.describe('The reference_profile analyze_reference returned, or one you wrote to the same schema.'),
    script: workflowText(10_000).describe('The accepted narration, copied into the plan unchanged.'),
    actor_id: actorId, voice: makeUgcInputShape.voice, voice_id: makeUgcInputShape.voice_id,
    assets: z.array(z.strictObject({ asset_id: assetId, media_type: z.enum(['image', 'video']) })).max(12).default([])
        .describe('Your ready ast_* media, used in order by graphics that need it: a compare takes two images. Nothing is generated.'),
    site: z.string().min(1).max(32).optional().describe('Your site, for an end card on the closing beat.'),
    audience: workflowText(2000).optional(), message: workflowText(4000).optional(),
    call: z.strictObject({ lines: ugcCall.shape.lines, voices: ugcCall.shape.voices, phone: ugcCall.shape.phone }).optional()
        .describe('Your call for a reference beat where the presenter listens to a recorded call: the presenter listens, then freezes, while it plays. ' +
            'The reference\'s own words are never offered; without lines the presenter keeps talking there.'),
});
export type PlanReferenceRemakeArgs = z.input<typeof planReferenceRemake>;
export type ReferenceRemakeResult = { kind: 'compiled'; document: WorkflowPlanDocument } | { kind: 'invalid'; issues: WorkflowIssue[] };

/** A script word as make_ugc counts it, with the whitespace chunk it sits in. */
export type ReferenceScriptWord = { token: string; from: number; to: number; tag: boolean; first: boolean; last: boolean; stop?: 'sentence' | 'clause' };
export type ReferenceSpan = { start: number; end: number } | null;
/** One span of words per profile beat, in order, or null for a beat left without words: the seam a model-backed planner fills later. */
export type ReferenceSpanPlanner = (input: { profile: ReferenceProfile; words: readonly ReferenceScriptWord[] }) => ReferenceSpan[];

const CLAUSE_COST = 6;
const TEXT_KINDS = new Set(['title_card', 'tag']);
const MEDIA_KINDS = { overlay_media: 'overlays', insert_media: 'inserts', layout_split: 'layout_windows' } as const;
const MARKER = 'ref-long-form';
const GENERATE = 'pass a ready ast_* asset, or make one separately with generate_image or generate_video (its own quote), then compile again';
type Unmapped = ReferenceProfile['unmapped'][number];
type Layer = { field: 'templates' | 'overlays' | 'inserts' | 'layout_windows' | 'framing' | 'caption_emphasis'; beat: number; kind: string; item: unknown };

export function referenceScriptWords(script: string): ReferenceScriptWord[] {
    const tags = [...script.matchAll(new RegExp(BREAK_TAG_SOURCE, 'g'))].map(match => [match.index, match.index + match[0].length] as const);
    const words: ReferenceScriptWord[] = [];
    for (const chunk of script.matchAll(/\S+/gu)) {
        const from = chunk.index, to = from + chunk[0].length, tokens = lexicalTokens(chunk[0]), end = chunk[0].replace(/["'”’»)\]]+$/u, '');
        const tag = tags.some(([start, stop]) => from < stop && start < to);
        if (tokens.length === 0) {
            if (/^[—–-]+$/u.test(chunk[0]) && words.length > 0) words.at(-1)!.stop ??= 'clause';
            continue;
        }
        const stop = tag ? undefined : /[.!?…]$/u.test(end) ? 'sentence' as const : /[,;:]$/u.test(end) ? 'clause' as const : undefined;
        tokens.forEach((token, index) => {
            words.push({ token, from, to, tag, first: index === 0, last: index === tokens.length - 1,
                ...(stop && index === tokens.length - 1 ? { stop } : {}) });
        });
    }
    return words;
}

/** Beats share the words by their share of the reference, cut at the nearest sentence end, or clause end at a cost. With fewer sentence ends than
 * beats, neighbours of one role share a span first, latest first as a close stacks its CTA beats; then the shortest inner beats give up their words. */
export const proportionalSpans: ReferenceSpanPlanner = ({ profile, words }) => {
    const length = (group: number[]) => group.reduce((sum, index) => sum + profile.beats[index]!.end_frac - profile.beats[index]!.start_frac, 0);
    const breaks = words.flatMap((word, index) => word.stop && index + 1 < words.length ? [{ at: index + 1, cost: word.stop === 'sentence' ? 0 : CLAUSE_COST }] : []);
    const sentences = breaks.filter(cut => cut.cost === 0);
    let kept = profile.beats.map((_, index) => [index]);
    const short = kept.length - 1 > sentences.length;
    for (let at = kept.length - 2; at >= 0 && kept.length - 1 > sentences.length; at--) {
        if (profile.beats[kept[at]![0]!]!.role === profile.beats[kept[at + 1]![0]!]!.role) kept.splice(at, 2, [...kept[at]!, ...kept[at + 1]!]);
    }
    const cuts = short && kept.length - 1 <= sentences.length ? sentences : breaks;
    while (kept.length - 1 > cuts.length) {
        const inner = kept.length > 2 ? kept.slice(1, -1) : kept.slice(1);
        const shortest = inner.reduce((best, group) => length(group) < length(best) ? group : best);
        kept = kept.filter(group => group !== shortest);
    }
    const total = kept.reduce((sum, group) => sum + length(group), 0);
    const spans: ReferenceSpan[] = profile.beats.map(() => null);
    let start = 0, share = 0;
    kept.forEach((group, position) => {
        if (position === kept.length - 1) { for (const beat of group) spans[beat] = { start, end: words.length }; return; }
        share += length(group);
        const target = (words.length * share) / total, needed = kept.length - 2 - position;
        const options = cuts.filter((cut, index) => cut.at > start && cuts.length - index - 1 >= needed);
        const best = options.reduce((left, right) => Math.abs(right.at - target) + right.cost < Math.abs(left.at - target) + left.cost ? right : left);
        for (const beat of group) spans[beat] = { start, end: best.at };
        start = best.at;
    });
    return spans;
};

/** The call phone's place and rise from the reference's staging (#914 D1e): its measured rect and face-relative twin, a rise anchored on the call's
 *  freeze, behind the presenter. Each part the composition cannot draw, or the staging did not measure, keeps the call scene's default and is named;
 *  a profile without staging leaves the call as it was. */
function callStageOf(profile: ReferenceProfile, listening: number, note: (beat: number, what: string, substitute: string) => void): CallStage | undefined {
    const staging = profile.staging, beat = profile.beats[listening]!;
    if (!staging) return undefined;
    const inBeat = (t: number | undefined) => t !== undefined && t >= beat.start_s && t < beat.end_s;
    const element = staging.elements.find(entry => entry.kind === 'phone_call' && (entry.beat_index === listening || inBeat(entry.entry?.settled_s)));
    const unmeasured = (what: string, substitute: string) => note(listening, `the call phone's ${what} (reference staging did not measure it)`, `${substitute}: default used`);
    if (!element?.rect_hold) { unmeasured('place', 'the reference call scene\'s place'); return undefined; }
    const freeze = staging.freezes.findIndex(entry => inBeat(entry.start_s));
    const entry = element.entry, anchor = entry?.anchors?.find(ref => ref.id === `freeze_start#${freeze + 1}`);
    const enter = entry?.style === 'slide' && (CALL_STAGE_SIDES as readonly string[]).includes(entry.from ?? '') && entry.displacement && entry.duration_s !== undefined && anchor
        ? { from: entry.from as (typeof CALL_STAGE_SIDES)[number], displacement: entry.displacement, duration_s: entry.duration_s,
            anchor: { id: 'freeze_start#1' as const, offset_s: anchor.offset_s } } : undefined;
    if (!entry?.style || entry.style === 'unknown') unmeasured('entry', 'the call scene\'s rise, 3.96 s before the freeze');
    else if (!anchor) note(listening, 'the call phone\'s entry (it is not anchored on the call\'s freeze)', 'the call scene\'s rise, 3.96 s before the freeze');
    else if (!enter) note(listening, `the call phone's ${entry.style} entry (side: ${entry.from ?? 'none'})`, 'the call scene\'s rise from below: the phone draws no other entry');
    const layer = element.layer?.value;
    if (layer === undefined || layer === 'unknown') unmeasured('layer', 'behind the presenter');
    else if (layer !== 'behind_presenter') note(listening, `the call phone ${layer.replaceAll('_', ' ')}`, 'behind the presenter, as the call scene draws it');
    const stage = callStage.safeParse({ rect: element.rect_hold, ...(element.rect_hold_face ? { rect_face: element.rect_hold_face } : {}), ...(enter ? { enter } : {}),
        layer: 'behind_presenter' });
    if (!stage.success) note(listening, `the call phone's measured staging (${stage.error.issues[0]?.message ?? 'out of bounds'})`, 'the reference call scene\'s place and rise');
    return stage.success ? stage.data : undefined;
}

export function compileReferenceRemake(input: unknown, capabilities: CapabilityProfile, planSpans: ReferenceSpanPlanner = proportionalSpans): ReferenceRemakeResult {
    const parsed = planReferenceRemake.safeParse(input);
    if (!parsed.success) return { kind: 'invalid', issues: parsed.error.issues.map(issue => ({ kind: 'invalid_request', path: issue.path.join('.'), message: issue.message })) };
    const request = parsed.data, { script } = request, profile = request.reference_profile;
    const words = referenceScriptWords(script), tokens = lexicalTokens(script), language = captionLanguageOf(script);
    if (words.length === 0) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script', message: 'The script has no words to place beats on.' }] };
    // The quote's own length estimate and limit, so a compiled plan is never refused there as too long.
    const duration = estimateDurationSec(script, resolveTtsModel({ voice: request.voice, voice_id: request.voice_id, script }));
    if (duration > LONG_FORM_QUALIFICATION_MAX_DURATION_SEC) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script',
        message: `The script runs about ${duration} s, longer than the ${LONG_FORM_QUALIFICATION_MAX_DURATION_SEC} s a reference remake renders: shorten it.` }] };
    const method = queryWorkflowMethod('reference-remake', capabilities)!.descriptor;
    const executor = capabilities.executors.find(item => item.skill === 'make_ugc');
    const longForm = executor?.features.includes('long_form') === true && !['warned', 'rejected', 'stored'].includes(executor.field_dispositions.long_form ?? '');
    if (longForm) {
        try { planSemanticInserts(script, []); }
        catch (error) {
            // The chunk test mirrors planSemanticInserts, with break tags taken out so each fault gets its own advice.
            const unsupported = (chunk: string) => { const n = lexicalTokens(chunk).length; return n > 1 || (n === 0 && !/^\p{P}+$/u.test(chunk)); };
            const bad = [...new Set(script.replace(new RegExp(BREAK_TAG_SOURCE, 'g'), ' ').match(/\S+/gu)?.filter(unsupported) ?? [])].slice(0, 3);
            const fixes = [
                ...new RegExp(BREAK_TAG_SOURCE).test(script) ? ['Remove the break tags; commas and full stops set the pauses'] : [],
                ...bad.map(chunk => lexicalTokens(chunk).length === 0
                    ? `Write "${chunk}" as a word or remove it, as "$" becomes "dollars"`
                    : `Write "${chunk.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')}" as separate words, as "24/7" becomes "twenty-four seven" or "around the clock"`),
            ];
            const fix = fixes.join('. ');
            return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script', message: `${error instanceof Error ? error.message : 'Unsupported script'}. ` +
                `${fix}: the long-form path a reference remake runs on counts words this way.` }] };
        }
    }
    const templatesOff = executor?.field_dispositions.templates === 'rejected';
    // The reference's caption height, where the deployment draws caption_position (#884); otherwise the style's own place.
    const captionsPlaced = executor?.field_dispositions.caption_position === 'implemented';
    // A wide reference asks for the wide view where it can render: honoured field, a library actor (personal ones have no wide view); graphics follow that face (#884 S5d).
    const framing: PresenterFraming = profile.presenter_framing === 'wide' && executor?.field_dispositions.presenter_framing === 'implemented'
        && actorIdScope(request.actor_id) === 'clipwright' ? 'wide' : 'close';
    // Library mic views are wide only, so a close plan asks for none.
    const mic = framing === 'wide' && profile.presenter_mic === true && executor?.field_dispositions.presenter_mic === 'implemented';
    const notes: Unmapped[] = [];
    const note = (beat: number, what: string, substitute: string) => notes.push({ what: what.slice(0, 200), beat_index: beat, suggested_substitute: substitute.slice(0, 200) });

    const quote = (from: number, limit: number, end: number) => {
        let start = from;
        while (start < end && (words[start]!.tag || !words[start]!.first)) start++;
        let stop = start;
        for (let index = start; index < Math.min(end, start + limit) && !words[index]!.tag; index++) if (words[index]!.last) stop = index + 1;
        if (stop <= start) return undefined;
        const text = script.slice(words[start]!.from, words[stop - 1]!.to).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        const matches = quoteOccurrences(tokens, text), occurrence = matches.findIndex(match => match.startWord === start);
        if (occurrence < 0) return undefined;
        return { anchor: { quote: text, ...(matches.length > 1 ? { occurrence } : {}) }, start, end: stop };
    };
    const label = (from: number, end: number, limit: number) => {
        const chunks = [...new Set(words.slice(from, end).filter(word => !word.tag).map(word => script.slice(word.from, word.to)))];
        let fitted: string | undefined;
        for (let count = 1; count <= chunks.length; count++) {
            const text = chunks.slice(0, count).join(' ').replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '')
                .replace(/^(and|or|but|so|и|а|но)\s+/iu, '').replace(/\s+(and|or|but|the|a|an|to|in|of|и|а|но|в)$/iu, '');
            if (text && templateTextRefusal(text, limit, language) === undefined) fitted = text; else if (fitted) break;
        }
        return fitted;
    };
    const parts = (span: { start: number; end: number }) => {
        const ranges: { start: number; end: number }[] = [];
        let start = span.start;
        for (let index = span.start; index < span.end; index++) {
            if (words[index]!.stop || index === span.end - 1) { ranges.push({ start, end: index + 1 }); start = index + 1; }
        }
        return ranges.filter(range => words.slice(range.start, range.end).some(word => !word.tag));
    };
    const wordAt = (span: { start: number; end: number }, share: number) =>
        quote(Math.min(span.end - 1, span.start + Math.max(1, Math.floor(share * (span.end - span.start)))), 2, span.end);

    const spans = planSpans({ profile, words });
    const layers: Layer[] = [];
    const pool = [...request.assets], images = () => pool.filter(asset => asset.media_type === 'image').length;
    const take = (image = false) => {
        const at = pool.findIndex(asset => !image || asset.media_type === 'image');
        return at < 0 ? undefined : pool.splice(at, 1)[0]!;
    };
    const anchored: { beat: number; anchor: { quote: string; occurrence?: number } }[] = [];
    /** Beats whose words keep the presenter in the frame: no full-frame layer and no window, so a framing may sit on them. */
    const onScreen: { beat: number; anchor: { quote: string; occurrence?: number }; cover_words: number }[] = [];
    profile.beats.forEach((beat, index) => {
        const span = spans[index];
        const lead = span ? quote(span.start, 6, span.end) : undefined;
        if (!span || !lead) {
            note(index, 'this beat (the script has fewer sentence and clause breaks than the reference has beats)', 'its words join a neighbouring beat');
            return;
        }
        anchored.push({ beat: index, anchor: lead.anchor });
        const own = quote(span.start, 4, span.end)!, envelope = (kind: string) => ({ id: `ref-${index + 1}-${kind.replaceAll('_', '-')}`, kind,
            anchor: own.anchor, cover_words: span.end - own.start });
        const clauses = parts(span);
        let placed: string | undefined, layered = false, fullFrame = false, windowed = false;
        // Specific graphics first: a text card is what a beat falls back to.
        for (const graphic of [...beat.graphics].sort((left, right) => Number(TEXT_KINDS.has(left.kind)) - Number(TEXT_KINDS.has(right.kind)))) {
            const kind = graphic.kind;
            if (kind === 'particles' || kind === 'unmapped') continue;
            if (kind in MEDIA_KINDS) {
                if (layered) { note(index, `${kind} (one media layer per beat)`, 'the first one shows here'); continue; }
                if (pool.length === 0) { note(index, `${kind} (no image or video left in assets)`, GENERATE); continue; }
                if (!longForm) { note(index, `${kind} (media layers need long-form qualification on this deployment)`, 'the presenter stays on screen on these words'); continue; }
                const asset = take()!, field = MEDIA_KINDS[kind as keyof typeof MEDIA_KINDS], base = { ...envelope(kind), asset_id: asset.asset_id, media_type: asset.media_type };
                const { kind: _kind, ...item } = base;
                const position = graphic.position.replace(/^split_/, ''), wanted = (OVERLAY_POSITIONS as readonly string[]).includes(position) ? position as OverlayPosition : 'top_right';
                // Off the face: the reference place, else a corner on its side (right by default), a band last.
                const side = wanted.endsWith('left') ? 'left' : 'right', rank = (place: string) => place.endsWith(side) ? 0 : place.includes('_') ? 1 : 2;
                const clear = (place: OverlayPosition) => !rectsOverlap(overlayRect(place, frameCanvasOf(DEFAULT_ASPECT_RATIO)), faceZone(DEFAULT_ASPECT_RATIO, framing));
                const placed = clear(wanted) ? wanted : [...OVERLAY_POSITIONS].sort((left, right) => rank(left) - rank(right)).find(clear) ?? wanted;
                if (field === 'overlays' && placed !== position) note(index, `${kind} at ${graphic.position}`, `${placed}, to keep the face clear`);
                layers.push({ field, beat: index, kind, item: field === 'overlays' ? { ...item, position: placed }
                    : field === 'layout_windows' ? { ...item, layout: 'split' } : item });
                layered = true; fullFrame ||= field === 'inserts'; windowed ||= field === 'layout_windows';
                continue;
            }
            if (templatesOff) { note(index, `${kind} (templates are disabled on this deployment)`, 'the presenter speaks these words without it'); continue; }
            if (placed) { note(index, `${kind} (one graphic per beat)`, `the ${placed} on these words`); continue; }
            const built = template(kind, graphic, span, clauses, beat.presenter_behaviour === 'absent');
            if ('missing' in built) { note(index, `${kind} (${built.missing})`, built.substitute); continue; }
            if (built.instead) note(index, `${kind} (${built.instead})`, `a ${built.kind} with the same words`);
            if ((built.kind === 'phone_call' || built.kind === 'notification') && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(script)) {
                note(index, `${built.kind} card text stays English ("${built.kind === 'phone_call' ? 'Incoming call' : 'Messages'}")`, 'edit the plan to change it');
            }
            const item = { ...envelope(built.kind), ...(built.placement ? { placement: built.placement } : {}), data: built.data };
            // A reference place over the face gives way to the kind's default, which every kind keeps off it.
            if ('position' in built.data && templateFaceWarnings({ templates: [item], presenter_framing: framing }).length) {
                const { position: _position, ...data } = built.data;
                item.data = data;
                note(index, `${built.kind} at ${graphic.position}`, `the ${built.kind}'s default place, to keep the face clear`);
            }
            layers.push({ field: 'templates', beat: index, kind: built.kind, item });
            placed = built.kind; fullFrame ||= built.placement === 'full';
        }
        if (beat.presenter_behaviour === 'absent' && !fullFrame) note(index, 'the presenter leaving the frame', 'the presenter stays on screen; a full-frame insert or template would hide them');
        if (!fullFrame && !windowed) onScreen.push({ beat: index, anchor: own.anchor, cover_words: span.end - own.start });
        if (profile.captions.present && profile.captions.emphasis_style !== 'none' && (beat.role === 'hook' || beat.role === 'cta')) {
            const sentence = clauses.find(range => words[range.end - 1]!.stop === 'sentence') ?? clauses[0]!;
            const key = quote(Math.max(sentence.start, sentence.end - 3), 3, sentence.end);
            const shared = layers.some(layer => layer.field === 'caption_emphasis' && (layer.item as { quote: string }).quote === key?.anchor.quote);
            if (key && !shared) layers.push({ field: 'caption_emphasis', beat: index, kind: 'caption emphasis', item: { quote: key.anchor.quote, look: profile.captions.emphasis_style } });
        }
    });

    function template(kind: string, graphic: ReferenceProfile['beats'][number]['graphics'][number], span: { start: number; end: number },
        clauses: { start: number; end: number }[], absent: boolean):
        { kind: string; data: Record<string, unknown>; placement?: 'full' | 'over'; instead?: string } | { missing: string; substitute: string } {
        const first = clauses[0]!, fullScreen = graphic.position === 'full_screen';
        const textCard = (instead?: string) => {
            if (absent || fullScreen) {
                const title = label(first.start, first.end, 48);
                if (title) return { kind: 'title_card', data: { title }, placement: 'full' as const, ...(instead ? { instead } : {}) };
            }
            const text = label(first.start, first.end, 32);
            const position = /top/.test(graphic.position) ? 'top' : /bottom/.test(graphic.position) ? 'bottom' : graphic.position === 'center' ? 'center' : undefined;
            return text ? { kind: 'tag', data: { text, ...(position ? { position } : {}) }, ...(instead ? { instead } : {}) }
                : { missing: 'no words short enough for a label', substitute: 'the presenter speaks these words without it' };
        };
        const rows = (limit: number, most: number) => {
            const pieces = clauses.length >= 2 ? clauses : Array.from({ length: 3 }, (_, part) => ({
                start: span.start + Math.floor((part * (span.end - span.start)) / 3), end: span.start + Math.floor(((part + 1) * (span.end - span.start)) / 3) }));
            return pieces.slice(0, most).flatMap(piece => {
                const text = label(piece.start, piece.end, limit), at = quote(piece.start, 2, piece.end);
                return text && at ? [{ text, quote: at.anchor.quote }] : [];
            });
        };
        const number = words.slice(span.start, span.end).find(word => !word.tag && /^\d+(?:[.,]\d+)?$/.test(word.token));
        switch (kind) {
            case 'checklist': {
                const items = rows(24, 4);
                if (items.length < 2) return { missing: 'fewer than two short phrases for its rows', substitute: 'the presenter speaks these words without it' };
                return { kind, data: { items: items.map(item => ({ label: item.text, on: false })), clicks: items.map((item, at) => ({ item: at, quote: item.quote })) } };
            }
            case 'progress': {
                const steps = rows(20, 5);
                if (steps.length < 2) return { missing: 'fewer than two short phrases for its steps', substitute: 'the presenter speaks these words without it' };
                return { kind, data: { steps: steps.map(step => step.text), advance_at: steps.map(step => step.quote) } };
            }
            case 'phone_call': {
                const answer = wordAt(span, 0.3);
                return answer ? { kind, data: { caller: 'Incoming call', answer_at: answer.anchor.quote } } : textCard('no word to answer the call on');
            }
            case 'compare': {
                if (images() < 2) return { missing: 'needs two images in assets for its before and after', substitute: GENERATE };
                const reveal = wordAt(span, Math.min(0.8, Math.max(0.2, graphic.state_changes[0]?.at_frac ?? 0.5)));
                if (!reveal) return textCard('no word to reveal on');
                return { kind, data: { before: { asset_id: take(true)!.asset_id }, after: { asset_id: take(true)!.asset_id }, reveal_at: reveal.anchor.quote } };
            }
            case 'notification': {
                const title = label(first.start, first.end, 32), body = label(span.start, span.end, 80);
                return title && body ? { kind, data: { app: 'Messages', title, body } } : textCard('no words short enough for it');
            }
            case 'stat': {
                if (!number) return textCard('no number in these words');
                const value = Math.round(Number(number.token.replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.')) * 100) / 100;
                const chunk = script.slice(number.from, number.to), after = words.indexOf(number) + 1;
                const statLabel = after < span.end ? label(after, span.end, 32) : undefined;
                return { kind, placement: fullScreen ? 'full' : 'over', data: { value: Math.min(value, 999_999_999), ...(/[$€£]/.exec(chunk) ? { prefix: /[$€£]/.exec(chunk)![0] } : {}),
                    ...(chunk.includes('%') ? { suffix: '%' } : {}), ...(statLabel ? { label: statLabel } : {}) } };
            }
            case 'rating': {
                const stars = number ? Number(number.token.replace(',', '.')) : NaN;
                return stars >= 1 && stars <= 5 && Number.isInteger(stars * 2) ? { kind, data: { stars } } : textCard('no star count from 1 to 5 in these words');
            }
            case 'quote': {
                const text = label(first.start, first.end, 120);
                return text ? { kind, data: { text } } : textCard();
            }
            case 'end_card': {
                // The card prints the site itself: the label stops before it, spoken ("x dot io") or written, and drops the preposition left over.
                const site = lexicalTokens(request.site ?? '').filter(part => !['www', 'http', 'https'].includes(part));
                const named = (at: number) => site.length > 0 && words.slice(at, at + 2 * site.length).map(word => word.token).filter(token => token !== 'dot')
                    .slice(0, site.length).join(' ') === site.join(' ');
                const until = Array.from({ length: first.end - first.start }, (_, at) => first.start + at).find(named) ?? first.end;
                const cta = until > first.start ? label(first.start, until, 48)?.replace(/\s+(at|on|via|from|to)$/iu, '') || undefined : undefined;
                return request.site ? { kind, data: { site: request.site, ...(cta ? { cta } : {}) } } : textCard('no site: pass site');
            }
            case 'title_card': return fullScreen || absent ? textCard() : textCard('a band over the presenter, not a full frame');
            case 'tag': return textCard();
            default: return { missing: `it needs ${kind === 'callout' ? 'a point on screen to mark' : 'a name and a role'}`, substitute: 'the presenter speaks these words without it' };
        }
    }

    // A beat where the presenter listens to recorded audio is the reference's call (S5, D9): the client's lines open after the last quote before it,
    // and the call brings its own in-call phone over the gap, so the reference's phone graphic goes.
    const listening = profile.beats.findIndex(beat => beat.presenter_behaviour === 'listening' && beat.sounds.some(sound => sound.kind === 'recorded_audio'));
    // The call opens on the sentence end nearest the beat's start, never inside a sentence (#924: reel B's opened after "That's why these days").
    const beatStart = listening >= 0 ? spans[listening]?.start : undefined;
    const resumeAt = beatStart === undefined ? undefined : words.flatMap((word, index) => word.stop === 'sentence' && index + 1 < words.length ? [index + 1] : [])
        .reduce<number | undefined>((best, at) => best === undefined || Math.abs(at - beatStart) < Math.abs(best - beatStart) ? at : best, undefined);
    const reach = Math.min(4, resumeAt ?? 0);
    const before = resumeAt === undefined || resumeAt >= words.length ? undefined
        : Array.from({ length: reach }, (_, back) => quote(resumeAt - reach + back, reach - back, resumeAt)).find(found => found?.end === resumeAt);
    let call: Record<string, unknown> | undefined;
    if (listening >= 0 && !request.call) note(listening, 'the reference\'s call needs your lines', 'the presenter keeps talking');
    else if (listening >= 0 && !longForm) note(listening, 'the reference\'s call (a call needs long-form qualification on this deployment)', 'the presenter keeps talking');
    else if (listening >= 0 && !before) note(listening, 'the reference\'s call (no sentence end with words after it to open it on)', 'the presenter keeps talking');
    else if (listening >= 0 && before && request.call) {
        const stage = callStageOf(profile, listening, note);
        call = { after: before.anchor, lines: request.call.lines, ...(request.call.voices ? { voices: request.call.voices } : {}),
            phone: { ...CALL_PHONE_DEFAULTS, ...request.call.phone }, ...(stage ? { stage } : {}) };
        for (const layer of layers.filter(layer => layer.beat === listening && layer.kind === 'phone_call')) layers.splice(layers.indexOf(layer), 1);
    }
    // Measured staging the composition draws only for the call's phone: any other measured graphic the plan places keeps its default place, and says
    // so once per beat and kind (rule 3).
    const placed = new Set(layers.filter(layer => layer.field !== 'framing' && layer.field !== 'caption_emphasis').map(layer => layer.beat));
    const named = new Set<string>();
    for (const element of profile.staging?.elements ?? []) {
        const graphic = element.graphic_index === null ? undefined : profile.beats[element.beat_index]?.graphics[element.graphic_index];
        const key = `${element.beat_index}:${graphic?.kind}`;
        if (!graphic || !placed.has(element.beat_index) || named.has(key) || (call && element.beat_index === listening && element.kind === 'phone_call')) continue;
        named.add(key);
        note(element.beat_index, `${graphic.kind}: its measured place and entry (reference staging)`, 'its default place; measured staging is drawn for the call\'s phone only');
    }

    const aggregate = (values: (string | undefined)[], keep: (value: string) => boolean, what: (value: string, beats: string) => string, substitute: string) => {
        for (const value of new Set(values.filter((entry): entry is string => entry !== undefined && keep(entry)))) {
            const at = values.flatMap((entry, index) => entry === value ? [index] : []);
            note(at[0]!, what(value, at.map(index => index + 1).join(', ')), substitute);
        }
    };
    // A punch_in beat cuts close, the next on-screen beat back to medium; a flash into a speaking beat swaps the size, so each cut moves the face
    // FRAMING_SCALE's 18% (S2, #924). A punch on a beat that gave up its words goes to the next on-screen beat.
    const cutClose = new Set<number>(), flashed = new Set<number>();
    let close = false, previous = -1;
    for (const { beat: at, anchor, cover_words } of longForm ? onScreen : []) {
        const carried = profile.beats.slice(previous + 1, at).flatMap((skipped, index) => !spans[previous + 1 + index] && skipped.camera === 'punch_in'
            ? [previous + 1 + index] : []);
        const beat = profile.beats[at]!, punch = beat.camera === 'punch_in' || carried.length > 0;
        const flash = beat.transition_in === 'flash' && beat.presenter_behaviour === 'speaking';
        if (punch || flash || close) {
            layers.push({ field: 'framing', beat: at, kind: 'framing', item: { id: `ref-${at + 1}-framing`, anchor, cover_words,
                size: punch || (flash && !close) ? 'close' : 'medium', ...(flash ? { transition: 'flash' } : {}) } });
            if (punch) for (const index of [at, ...carried]) cutClose.add(index);
            if (flash) flashed.add(at);
        }
        close = punch || (flash && !close);
        previous = at;
    }
    aggregate(profile.beats.map((beat, at) => flashed.has(at) ? undefined : beat.transition_in), value => !['none', 'cut'].includes(value),
        (value, beats) => `${value} transitions into beats ${beats}`, 'cuts');
    aggregate(profile.beats.map((beat, at) => cutClose.has(at) ? undefined : beat.camera), value => value !== 'static',
        (value, beats) => `${value} camera on beats ${beats}`, 'a static frame');
    const music = profile.beats.findIndex(beat => beat.sounds.some(sound => sound.kind === 'music'));
    if (music >= 0) note(music, 'the music bed', 'no music; Clipwright adds none yet');
    // The narration chases the presenter's measured pace through the voice's speed (owner, 25.10); a model without one leaves the voice as the lever (#890).
    const speechModel = resolveTtsModel({ voice: request.voice, voice_id: request.voice_id, script });
    const pace = narrationPaceFromVoice(profile.voice), fixedPace = FIXED_PACE_MODELS.has(speechModel);
    if (pace.kind === 'unmeasured') note(0, `narration pace (${pace.reason})`, 'the voice speaks at its own pace');
    else if (fixedPace) {
        const named = measuredPaceOf(request.voice), gap = (wps: number) => Math.abs(wps - pace.target_wps);
        // Only voices nearer than the named one: the nearest of a gender can still be farther off.
        const nearer = (['female', 'male'] as const).map(gender => [gender, voicesNearestPace(pace.target_wps, gender, 2, named?.voice)
            .filter(entry => !named || gap(entry.words_per_second) < gap(named.words_per_second))] as const)
            .filter(([, voices]) => voices.length).map(([gender, voices]) => `${gender} ${voices.map(entry => `${entry.voice} ${entry.words_per_second}`).join(', ')}`);
        const own = named ? `${named.voice} speaks ${named.words_per_second}` : `English voices speak ${VOICE_PACE_RANGE} words/s`;
        if (!named || gap(named.words_per_second) > PACE_MATCH_SHARE * pace.target_wps) {
            note(0, `narration pace ${pace.target_wps} words/s of the reference presenter`, isEnglishScript(script, language === 'en')
                ? `${speechModel} has no speed; ${own}. ${nearer.length ? `Nearer voices: ${nearer.join('; ')}` : 'No measured voice is nearer'}`
                : `${speechModel} has no speed: the voice keeps its own pace; voice paces are measured on English only`);
        }
    } else if (pace.clamped) {
        note(0, `narration pace ${pace.target_wps} words/s of the reference presenter (speed ${pace.wanted} wanted)`,
            `voice_pace ${pace.voice_pace}, the end of the speed range: the narration may run ${pace.wanted > pace.voice_pace ? 'slower' : 'faster'} than the reference`);
    }
    // Speed first, then the residual: pauses longer than the presenter's word-gap medians are cut in silence only (owner, 25.10).
    const pauseTrim = pauseTrimFromVoice(profile.voice), pauseTargets = pauseTrim?.targets;
    if (!pauseTargets) note(0, 'narration pauses (the reference presenter\'s pauses were not measured)', 'pauses stay as the voice speaks them');
    for (const { key, median_s } of pauseTrim?.capped ?? []) {
        note(0, `narration pauses ${key} ${Math.round(median_s * 100) / 100} s of the reference presenter`,
            `pause_trim ${key} ${PAUSE_TRIM_CEILING_S}, the longest target: these pauses may run shorter than the reference`);
    }

    let native: Record<string, unknown> = {}, marked = false;
    // Every pass that does not break drops one layer or adds the one marker, so the loop ends.
    for (;;) {
        const field = (name: Layer['field']) => { const items = layers.filter(layer => layer.field === name).map(layer => layer.item); return items.length ? { [name]: items } : {}; };
        native = { script, actor_id: request.actor_id, ...(framing === 'wide' ? { presenter_framing: framing } : {}), ...(mic ? { presenter_mic: true } : {}),
            ...(request.voice ? { voice: request.voice } : {}), ...(request.voice_id ? { voice_id: request.voice_id } : {}),
            ...(pace.kind === 'paced' && !fixedPace ? { voice_pace: pace.voice_pace } : {}), ...(pauseTargets ? { pause_trim: pauseTargets } : {}),
            ...(profile.captions.present ? { captions: true, caption_style: profile.captions.words_per_caption_max <= 2 ? 'tiktok' : profile.captions.words_per_caption_max <= 4 ? 'hormozi' : 'youtube',
                ...(captionsPlaced ? { caption_position: profile.captions.position } : {}) } : {}),
            ...field('caption_emphasis'), ...field('templates'), ...field('overlays'), ...field('inserts'), ...field('layout_windows'), ...field('framing'),
            ...(call ? { call } : {}) };
        // The quote refuses customer media without this policy; the note below discloses it (rule 3).
        if (['overlays', 'inserts', 'layout_windows'].some(name => native[name]) || templateMediaOf(native.templates as Parameters<typeof templateMediaOf>[0]).length) {
            native.broll_policy = 'anyone';
        }
        const checked = makeUgcInput.safeParse(native);
        // A call the run refuses goes, and the presenter keeps talking there.
        const refusedCall = checked.error?.issues.find(entry => entry.path[0] === 'call');
        if (refusedCall && call) {
            call = undefined;
            note(listening, `the reference's call (${refusedCall.message})`, 'the presenter keeps talking');
            continue;
        }
        if (!checked.success) {
            const issue = checked.error.issues.find(entry => typeof entry.path[1] === 'number' && layers.some(layer => layer.field === entry.path[0]));
            if (!issue) return { kind: 'invalid', issues: checked.error.issues.map(entry => ({ kind: 'invalid_request', path: entry.path.join('.'), message: entry.message })) };
            const dropped = layers.filter(layer => layer.field === issue.path[0])[issue.path[1] as number]!;
            layers.splice(layers.indexOf(dropped), 1);
            note(dropped.beat, `${dropped.kind} (${issue.message})`, 'left out; edit the plan to place it');
            continue;
        }
        // The quote's actor-shot limit: the insert covering the fewest words goes first.
        const inserts = layers.filter(layer => layer.field === 'inserts');
        const plan = inserts.length ? planSemanticInserts(script, inserts.map(layer => {
            const item = layer.item as { id: string; anchor: { quote: string; occurrence?: number }; cover_words?: number };
            return { insertId: item.id, mediaId: item.id, anchor: item.anchor, ...(item.cover_words === undefined ? {} : { coverWords: item.cover_words }) };
        })) : undefined;
        const shots = plan ? countActorShots(plan) : 1;
        if (plan && (shots === 0 || shots > MAX_NARRATED_ACTOR_SHOTS)) {
            const fewest = plan.inserts.reduce((best, entry) => coverWordOf(entry) - entry.startWord < coverWordOf(best) - best.startWord ? entry : best);
            const dropped = inserts.find(layer => (layer.item as { id: string }).id === fewest.insertId)!;
            layers.splice(layers.indexOf(dropped), 1);
            note(dropped.beat, `${dropped.kind} (inserts leave ${shots} actor appearances; a run renders 1 to ${MAX_NARRATED_ACTOR_SHOTS})`, 'left out; the presenter speaks these words');
            continue;
        }
        // A remake bills on the long-form tariff: with nothing else narrated, a medium framing (scale 1) over the whole script makes it so.
        const lead = longForm && !marked && !isNarratedUgcInput(native) ? quote(0, 6, words.length) : undefined;
        if (lead) {
            marked = true;
            layers.push({ field: 'framing', beat: 0, kind: 'framing', item: { id: MARKER, anchor: lead.anchor, cover_words: words.length - lead.start, size: 'medium' } });
            continue;
        }
        break;
    }
    const disclosed = notes.length;
    if (layers.some(layer => (layer.item as { id?: string }).id === MARKER)) {
        note(0, 'the single-take path that bills every second as presenter time', 'the long-form path: one presenter take billed by the seconds it fills');
    }
    if (native.broll_policy === 'anyone') {
        const media = layers.find(layer => ['overlays', 'inserts', 'layout_windows'].includes(layer.field)
            || (layer.field === 'templates' && templateMediaOf([layer.item as { id: string; kind: string; data: Record<string, unknown> }]).length > 0));
        note(media?.beat ?? 0, 'a check that your media shows no people', 'your media is shown as you supplied it (broll_policy=anyone)');
    }
    // Billing and media terms go first, so the 40-entry cap below never cuts them (rule 3).
    notes.unshift(...notes.splice(disclosed));

    let beats: WorkflowPlanDocument['beats'] = [];
    try {
        planSemanticInserts(script, []);
        beats = anchored.map(({ beat, anchor }) => ({ id: `beat-${beat + 1}`, role: profile.beats[beat]!.role, anchor, required: false }));
    } catch {
        note(0, 'advisory beat anchors (the script holds a tag that plan beats cannot count words through)', 'the plan keeps no beats; the graphics still sit on their words');
    }
    // Past the bound the compiler's own gaps come first, then one analyser entry for each beat whose undrawn graphic needs one (the schema refuses it bare).
    const needsEntry = (beat: number) => profile.beats[beat]!.graphics.some(graphic => graphic.kind === 'particles' || graphic.kind === 'unmapped');
    // A plan that plays the call drops the analyser's word that recorded audio is not played on its beat: the client would read both.
    const analysed = call ? profile.unmapped.filter(entry => entry.beat_index !== listening || !/recorded/i.test(entry.what)) : profile.unmapped;
    const unmapped = ((): Unmapped[] => {
        if (analysed.length + notes.length <= 40) return [...analysed, ...notes];
        const kept = notes.slice(0, 39), rest = analysed;
        const covered = new Set(kept.map(entry => entry.beat_index));
        for (const entry of rest) if (kept.length < 39 && needsEntry(entry.beat_index) && !covered.has(entry.beat_index)) { kept.push(entry); covered.add(entry.beat_index); }
        for (const entry of rest) if (kept.length < 39 && !kept.includes(entry)) kept.push(entry);
        return [...kept, { what: `${analysed.length + notes.length - kept.length} more items`, beat_index: 0,
            suggested_substitute: 'fewer graphics in the reference, or edit the plan' }];
    })();
    const firstSentence = parts({ start: 0, end: words.length })[0]!;
    const document = workflowPlanDocument.safeParse({ v: 1,
        method: { method_id: method.id, version: method.version, content_digest: method.content_digest, capability_digest: capabilities.content_digest },
        brief: { audience: request.audience ?? 'Viewers of short ads in the style of the reference',
            message: request.message ?? script.slice(words[firstSentence.start]!.from, words[firstSentence.end - 1]!.to),
            script, native: { skill: 'make_ugc', input: native },
            reference_profile: { ...profile, music: '', unmapped,
                beats: profile.beats.map(beat => ({ ...beat, spoken_summary: '', graphics: beat.graphics.map(graphic => ({ ...graphic, label_hint: '' })) })) } },
        beats, claims: [], assets: [] });
    return document.success ? { kind: 'compiled', document: document.data }
        : { kind: 'invalid', issues: document.error.issues.map(issue => ({ kind: 'invalid_plan', path: issue.path.join('.'), message: issue.message })) };
}
