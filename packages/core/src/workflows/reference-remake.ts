import { z } from 'zod';
import { DEFAULT_ASPECT_RATIO } from '../aspect.js';
import { assetId } from '../asset-identity.js';
import { captionLanguageOf } from '../caption-language.js';
import { LONG_FORM_QUALIFICATION_MAX_DURATION_SEC } from '../long-form-profile.js';
import { CANVAS_FPS } from '../media-timebase.js';
import { estimateDurationSec, WORDS_PER_SECOND_MAX, WORDS_PER_SECOND_MIN } from '../pacing.js';
import { referenceAnalysisId } from '../reference-analysis.js';
import { actorIdScope } from '../account-actors.js';
import { referenceProfileInput, type REFERENCE_GESTURES, type ReferenceProfileInput as ReferenceProfile, type ReferenceShotSize } from '../reference-profile.js';
import type { LiveShotFraming } from '../live-shot-kinds.js';
import { narrationPaceFromVoice, PAUSE_TRIM_CEILING_S, pauseTrimFromVoice } from '../reference-voice.js';
import { AD_PAUSE_TRIM } from '../ad-pause-trim.js';
import { countActorShots, coverWordOf, lexicalTokens, planSemanticInserts, quoteOccurrences } from '../semantic-inserts.js';
import { negationIn, SHOT_BEAT_MAX_S, type GenerationShot } from '../generation-shot.js';
import { actorId, callStage, type CallStage, insertBox, isNarratedUgcInput, LIVE_SHOT_PRODUCT_PLACEMENTS, makeUgcInput, makeUgcInputShape, MAX_INSERTS, MAX_LIVE_SHOTS, MAX_NARRATED_ACTOR_SHOTS,
    MAX_PRESENTER_TAKES, MAX_SHOT_CAST, motionStyle, ugcCall, type UgcLiveShot, ugcLiveShotCastMember, ugcTemplate } from '../skills.js';
import { ugcMarkedComponentsRefusal } from '../presenter-takes.js';
import { CALL_PHONE_DEFAULTS, CALL_STAGE_SIDES } from '../ugc-call.js';
import { MAX_TEMPLATES, TEMPLATE_ENTER_FRAMES, TEMPLATE_KIND_IDS, TEMPLATE_KINDS, TEMPLATE_PLACEMENTS, templateFaceWarnings, templateMediaOf,
    templateTextRefusal } from '../templates/index.js';
import { MAX_SCENES, SCENE_TEXT_MAX_CHARS } from '../ugc-scenes.js';
import { MAX_FRAMING } from '../ugc-framing.js';
import { CAPTION_POSITION_VERTICAL, captionBandBox, captionEdgeAt } from '../caption-geometry.js';
import type { StagingElement, StagingRect } from '../reference-staging.js';
import { fitPlacedRect, place, plannedFace, presenterPlace, resolvePlace, sharedArea, type Place } from '../scene-place.js';
import { FACE_COVER_SHARE, faceZone, frameCanvasOf, LAYER_ENTERS, layerWordRange, MAX_ENTER_OFFSET_S, MAX_OVERLAYS, OVERLAY_POSITIONS, overlayRect, ownPixels,
    MAX_LAYOUT_WINDOWS, rectsOverlap, SPLIT_MEDIA_SHARE, type AnchoredItem, type LayerEnter, type LayerExit, type LayerRect, type OverlayPosition, type PresenterFraming } from '../ugc-layers.js';
import { isEnglishScript, measuredPaceOf, PACE_MATCH_SHARE, VOICE_PACE_RANGE, voicesNearestPace } from '../voice-pace.js';
import { BREAK_TAG_SOURCE, FIXED_PACE_MODELS, resolveTtsModel } from '../voices.js';
import type { CapabilityProfile } from '../contracts/v1/workflow-catalog.js';
import { WORKFLOW_ADDED_MAX } from '../contracts/v1/workflow-brief.js';
import { saveWorkflowPlan, workflowPlanDocument, type WorkflowPlanDocument } from '../contracts/v1/workflow-plan.js';
import { workflowId, workflowText, type WorkflowIssue } from '../contracts/v1/workflow-primitives.js';
import { queryWorkflowMethod } from './catalog.js';
import { MUSIC_BED_CREDITS, musicRequest } from '../music.js';
import { MAX_MOVES, ugcMove } from '../moves.js';
import { lookName } from './motion-director.js';
import { preferChosen, type RemakeChooser } from './remake-chooser.js';
import { beatCue, FLASH_SNAP_S, planMotion, type MotionAdded } from './remake-motion.js';

// The reference-remake compiler (#857 S2a): a profile and an accepted script become a complete plan whose native input is a make_ugc input.

/** The steps a product demo takes, then a still hold (#1307 S2): with the hold, at most four beats in one clip. */
export const DEMO_MAX_STEPS = 3;

const remakeFields = {
    plan_id: workflowId.optional(), base_version: saveWorkflowPlan.shape.base_version.optional(),
    review_notes: z.array(workflowText(2000)).max(50).optional(),
    reference_profile: referenceProfileInput.describe('The reference_profile analyze_reference returned, or one you wrote to the same schema.'),
    script: workflowText(10_000).describe('The accepted narration, copied into the plan unchanged.'),
    actor_id: actorId, voice: makeUgcInputShape.voice, voice_id: makeUgcInputShape.voice_id,
    assets: z.array(z.strictObject({ asset_id: assetId, media_type: z.enum(['image', 'video']),
        anchor: z.string().trim().min(1).max(2000).optional().describe('Words of the script, as written, it shows on: always placed there.') }))
        .max(60).default([])
        .describe('Your ready ast_* media. Without anchor each goes to the line its name matches, else in order (named in warnings). Nothing is generated.'),
    line_edits: z.array(z.strictObject({ quote: z.string().trim().min(1).max(2000).describe('Words of the script, as written.'),
        template: z.strictObject({ kind: z.enum(TEMPLATE_KIND_IDS), data: z.record(z.string(), z.unknown()), placement: z.enum(TEMPLATE_PLACEMENTS).optional() })
            .optional().describe('The graphic on these words, as a make_ugc template: kind, data, placement.') }))
        .max(60).refine(edits => edits.filter(edit => edit.template).length <= MAX_TEMPLATES,
            { message: `at most ${MAX_TEMPLATES} line edits carry a template, the most a run draws` }).optional()
        .describe('The user\'s shot notes: on these words the reference\'s graphics go, and the template shows, if given. Pass all of them on every compile.'),
    site: z.string().min(1).max(64).optional().describe('Your site, for an end card on the closing beat.'),
    audience: workflowText(2000).optional().describe('Who watches and whom they trust where, as shown to the user: for example a homeowner ' +
        'who trusts an electrician at the fuse box. Kept in the plan brief.'),
    message: workflowText(4000).optional(),
    call: z.strictObject({ lines: ugcCall.shape.lines, voices: ugcCall.shape.voices, phone: ugcCall.shape.phone }).optional()
        .describe('Your call for a reference beat where the presenter listens to a recorded call: the presenter listens, then freezes, while it plays. ' +
            'The reference\'s own words are never offered; without lines the presenter keeps talking there.'),
    add_moves: z.boolean().default(true).describe('false: only the reference\'s moves, none of ours.'),
    moves: z.array(ugcMove).min(1).max(MAX_MOVES).optional().describe('Your list_moves picks, as make_ugc moves; each replaces what the plan drew ' +
        'on its words, but a line edit\'s graphic wins. One not drawn is named in warnings[].'),
    edit_sounds: z.boolean().optional().describe('true: a sound on every cut, as make_ugc edit_sounds. Off unless you ask.'),
    music: musicRequest.optional().describe(`Music under the voice, as make_ugc music: ${MUSIC_BED_CREDITS} credits on the plan's quote. Off unless you ask.`),
    live_shots: z.boolean().optional().describe('Live shots of the actor, as make_ugc shots. Omitted: beats where the reference presenter gestures ' +
        'on screen; true: every beat where they speak or react on screen; false: none. Costs more than the usual take: each shot kind has its own ' +
        'presenter-second price in list_prices, shown on the plan\'s quote.'),
    motion_style: motionStyle.optional().describe('As make_ugc motion_style; spans sit on the script\'s words. Free.'),
    cast: z.array(ugcLiveShotCastMember).min(1).max(MAX_SHOT_CAST)
        .refine(cast => new Set(cast.map(person => person.asset_id)).size === cast.length, { message: 'each cast picture appears once' }).optional()
        .describe(`Up to ${MAX_SHOT_CAST} more people beside the actor in every acting live shot, as make_ugc shots cast: a picture, a role and ` +
            'what they do. Without an acting live shot the plan names it undrawn.'),
    pause_trim: makeUgcInputShape.pause_trim.describe('Narration pauses, as make_ugc pause_trim; it wins over the reference\'s pauses. ' +
        `Omitted: the reference presenter's measured pauses, else ${AD_PAUSE_TRIM.sentence_end_s} and ${AD_PAUSE_TRIM.comma_s}.`),
    product: z.strictObject({
        asset_id: assetId.describe('Your product image (ast_…), as make_ugc product_asset_id.'),
        placement: z.enum(LIVE_SHOT_PRODUCT_PLACEMENTS).default('hand').describe('hand: every acting live shot starts with it in the actor\'s hand; ' +
            'beside: standing within reach.'),
        name: z.string().trim().min(1).max(40).default('product').describe('What it is, as the shots name it: jar, bottle, drill.'),
        demo: z.array(z.strictObject({
            action: z.string().trim().min(1).max(300).describe('One step of using it, done once, as cause, contact and result: her fingertip dips ' +
                'into the jar once and lifts a dab of cream.'),
            end_state: z.string().trim().min(1).max(200).describe('What the frame shows when the step ends: a dab of cream sits on her fingertip.'),
        })).min(1).max(DEMO_MAX_STEPS).optional().describe('The reference\'s demo beats become one live shot of the actor using it, from a first ' +
            'frame with it in hand, in these steps, then a still hold. Describe what is visible.'),
    }).optional().describe('Your product in the actor\'s hand (or beside them) in every acting live shot.'),
};
const revisionPair = (value: { plan_id?: string | undefined; base_version?: number | undefined }, context: z.RefinementCtx) => {
    if ((value.plan_id === undefined) !== (value.base_version === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['plan_id'], message: 'plan_id and base_version must be supplied together' });
    }
};
/** What the compiler reads: the profile itself. */
export const planReferenceRemake = z.strictObject(remakeFields).superRefine(revisionPair);
/** What a client sends (#1172): the profile, or the analysis_id of an analysis the server reads it from. */
export const planReferenceRemakeRequest = z.strictObject({ ...remakeFields,
    reference_profile: remakeFields.reference_profile.optional(),
    analysis_id: referenceAnalysisId.optional().describe('The analysis_id of a succeeded full analyze_reference: the server reads its reference_profile. ' +
        'Pass it instead of reference_profile.'),
}).superRefine((value, context) => {
    revisionPair(value, context);
    if ((value.analysis_id === undefined) === (value.reference_profile === undefined)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['analysis_id'], message: 'pass exactly one of analysis_id or reference_profile' });
    }
});
export type PlanReferenceRemakeArgs = z.input<typeof planReferenceRemakeRequest>;
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
/** Beats that show the product: a card of their words does not stand in for it. */
const SHOWN_ROLES = new Set(['demo', 'before_after']);
/** The share of a reference's length without its presenter past which a faceless video is the closer remake. */
const FACELESS_SHARE = 0.8;
const GENERATE = 'pass a ready ast_* asset, or make one separately with generate_image or generate_video (its own quote), then compile again';
type Unmapped = ReferenceProfile['unmapped'][number];
type ReferenceGesture = (typeof REFERENCE_GESTURES)[number];
type Graphic = ReferenceProfile['beats'][number]['graphics'][number];
const TERMINAL_SCREEN = /\bterminal\b|\bcommand[- ]line\b|\bconsole\b|\bshell\b|\bcli\b/i;
const CHAT_SCREEN = /\bchat|\bmessag|\bconversation|\bprompt\b|\bassistant\b|\bdms?\b|\brepl(?:y|ies)\b/i;
const PHONE_SCREEN = /\b(?:smart)?phones?\b|\bmobile\b|\biphone\b|\bandroid\b|\breels?\b|\bfeed\b|\btiktok\b|\binstagram\b|\bshorts\b|\block ?screen\b/i;
/** The drawn kind an analyser device stands for (#1112, #1113): a terminal, a chat or a phone on a product screen, a collage of clips, a full-frame
 * kinetic title, arrows marking the subject. */
function drawnKindOf(graphic: Graphic): 'terminal' | 'chat_window' | 'phone_screen' | 'video_grid' | 'word_title' | 'pointer_chips' | undefined {
    if (graphic.source_kind === 'product_ui' || graphic.source_kind === 'screenshot') {
        return TERMINAL_SCREEN.test(graphic.label_hint) ? 'terminal' : CHAT_SCREEN.test(graphic.label_hint) ? 'chat_window'
            : PHONE_SCREEN.test(graphic.label_hint) ? 'phone_screen' : undefined;
    }
    if (graphic.device === 'collage') return 'video_grid';
    if (graphic.device === 'arrow' && (graphic.kind === 'unmapped' || graphic.kind === 'callout')) return 'pointer_chips';
    return graphic.device === 'text_effect' && graphic.position === 'full_screen' ? 'word_title' : undefined;
}
/** The saved plan keeps the reference's techniques, not its words: the remake copies no line of it, and the analysis keeps them already. */
const withoutWords = ({ transcript: _transcript, hook: _hook, ...profile }: ReferenceProfile) => profile;
/** `from_s`: the reference moment a picture cut inside its beat starts on (#1085). */
type Layer = { field: 'templates' | 'overlays' | 'inserts' | 'layout_windows' | 'framing' | 'caption_emphasis' | 'shots' | 'scenes'; beat: number; kind: string; item: unknown;
    from_s?: number };
/** What the actor does in a live shot for each gesture the reference presenter makes; `other` names nothing to draw. */
const GESTURE_ACTIONS: Record<ReferenceGesture, string | undefined> = { both_hands_to_viewer: 'reaches both hands toward the viewer',
    point_at_viewer: 'points at the viewer', point_at_element: 'points to the side of the frame', count_on_fingers: 'counts the points on their fingers',
    hold_object: 'holds an object up to the camera', open_palms: 'opens both palms toward the viewer', wave: 'waves at the viewer', shrug: 'shrugs',
    thumbs_up: 'gives a thumbs up', other: undefined };
const REACTION = 'reacts to the words with a warm smile and a nod';
/** The longest demo clip: the longest live shot take the run renders. Words past it are the presenter's usual take. */
export const DEMO_CLIP_MAX_S = 15;
type RemakeProduct = { asset_id: string; placement: (typeof LIVE_SHOT_PRODUCT_PLACEMENTS)[number]; name: string;
    demo?: { action: string; end_state: string }[] | undefined };
const heldAt = (product: RemakeProduct) => product.placement === 'hand' ? `in one hand at chest height, its label to the camera`
    : 'standing beside the presenter within reach, its label to the camera';
/** A gesture's action with the product named when the gesture holds something. */
const gestureAction = (kind: ReferenceGesture, product: RemakeProduct | undefined) =>
    kind === 'hold_object' && product ? `holds the ${product.name} up to the camera, its label toward the lens` : GESTURE_ACTIONS[kind];
/** The demo as one clip of `seconds` (#1307 S2): it opens on one product already where the shots hold it, each step once, then a still hold;
 *  every second is owned by a beat, so the clip has no seconds to repeat a step in. */
export function demoShot(product: RemakeProduct & { demo: { action: string; end_state: string }[] }, seconds: number): GenerationShot {
    const hold = product.placement === 'hand'
        ? { action: `The presenter holds the ${product.name} still at chest height, its label to the camera, and smiles`,
            end_state: `The presenter holds the ${product.name} at chest height, its label to the camera` }
        : { action: `The presenter rests both hands beside the ${product.name} and smiles at the camera`,
            end_state: `The ${product.name} stands beside the presenter, its label to the camera` };
    // The hold goes last whenever the clip has a second for it: without it the clip's last seconds repeat a step. Short of seconds, the steps
    // become one beat that does each in turn.
    const merged = { action: product.demo.map(step => step.action.replace(/[.!?]+$/, '')).join(', then '), end_state: product.demo.at(-1)!.end_state };
    const steps = seconds >= product.demo.length + 1 ? [...product.demo, hold] : seconds >= 2 ? [merged, hold] : [merged];
    const length = Math.max(steps.length, Math.min(seconds, steps.length * SHOT_BEAT_MAX_S)), base = Math.floor(length / steps.length);
    let from = 0;
    const beats = steps.map((step, at) => {
        const to = from + base + (at < length - base * steps.length ? 1 : 0), beat = { from_s: from, to_s: to, action: step.action, end_state: step.end_state };
        from = to;
        return beat;
    });
    return {
        framing: { size: 'medium' },
        subject: { label: 'the presenter', fixed: ['the face, hair and clothes of Image 1', `the ${product.name}'s shape, colours and printed label`],
            objects: [{ name: product.name, count: 1, at_start: heldAt(product) }] },
        start_state: product.placement === 'hand' ? `The presenter holds one ${product.name} in one hand at chest height, its label to the camera`
            : `One ${product.name} stands beside the presenter within reach, its label to the camera`,
        beats,
        camera: { move: 'static' },
        light: { key: 'the light of Image 1' },
        continuity: { persistent: [`exactly one ${product.name}`, 'the same place as Image 1'], end_state: beats.at(-1)!.end_state },
    };
}
const SHOT_SIZE_RANK: Readonly<Record<PresenterFraming, number>> = { close: 0, wide: 1, full: 2 };
/** An acting shot's first frame, wider than the take (#1175 S7): the beat's measured size when wider (medium and wide are the wide view), else */
/** wide on a close take, since an action needs the hands in frame; undefined keeps the take's view. */
function shotFramingOf(size: ReferenceShotSize | undefined, take: PresenterFraming): LiveShotFraming | undefined {
    const measured: PresenterFraming | undefined = size === 'full' ? 'full' : size === 'medium' || size === 'wide' ? 'wide' : size === 'close' ? 'close' : undefined;
    const wanted = measured ?? 'wide';
    return wanted !== 'close' && SHOT_SIZE_RANK[wanted] > SHOT_SIZE_RANK[take] ? wanted : undefined;
}
/** A layer sits under the captions when its top is at most this share of the height below them and its centre this share of the width off theirs. */
const UNDER_CAPTIONS = 0.03;
/** A full-frame picture or card the reference showed this long or less was flashed, not held (#1196). */
const FLASH_HOLD_S = 1.2;
/** With no caption box measured, a centred layer whose top lies this far below where top-anchored captions start: a line to a short block. */
const UNMEASURED_CAPTIONS_BELOW = [0.03, 0.15] as const;
/** The cuts a hook's live shot may take of ours, flash first: both are pictures only, so none adds a sound the customer did not ask for. */
const HOOK_SHOT_CUTS = ['flash', 'light_leak'] as const;
const ENTER_OF: Partial<Record<string, LayerEnter>> = { pop: 'pop', fade: 'fade', slide: 'slide', scale_up: 'scale_up', tilt_in: 'tilt_in' };
const EXIT_OF: Partial<Record<string, LayerExit>> = { cut: 'cut', fade: 'fade', slide: 'slide', pop: 'pop_out' };
const FRAME: LayerRect = { left: 0, top: 0, width: 1, height: 1 };
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
const median = (values: readonly number[]) => {
    const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

type ReferenceGraphic = ReferenceProfile['beats'][number]['graphics'][number];
/** What a scene draws for each device a scene can draw (#1107); footage, photos, 3D and effects need media or a look the format lacks. */
const SCENE_DEVICES: Partial<Record<NonNullable<ReferenceGraphic['device']>, string>> = { icon: 'a simple flat icon', emoji: 'a flat drawn icon in place of an emoji',
    sticker: 'a sticker-style badge', arrow: 'a hand-drawn arrow pointing at the subject', highlight: 'a pen stroke under the key words',
    text_effect: 'an animated word effect', chart: 'a simple animated chart', map: 'a simple stylised map with a pin', other: 'a simple motion graphic' };
/** Devices that carry the beat's words. */
const WORD_DEVICES = new Set(['sticker', 'highlight', 'text_effect']);
/** A quoted span in straight or typographic quotes, each closed by its own pair; an apostrophe inside a word opens none. */
const QUOTED = /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'(?![\p{L}\p{N}])|‘[^’]*’|“[^”]*”|„[^“”]*[“”]|«[^»]*»|‹[^›]*›/gu;
const COLOUR_WORDS =/#[0-9a-f]{3,8}\b|\b(red|orange|yellow|green|teal|cyan|blue|navy|indigo|purple|violet|lilac|lavender|magenta|pink|brown|beige|black|white|gr[ae]y|gold|silver|neon|pastel|dark|light|bright)\b/giu;
/** What the asset library says of a request's asset (#1170): the server reads it, a direct compile may pass none. */
/** `seconds`: a video asset's measured length, which caps the words its clip covers. */
export type ReferenceAssetFacts = ReadonlyMap<string, { name: string; role?: string; seconds?: number }>;
/** Name words that say nothing of the line a picture belongs on. */
const NAME_NOISE = new Set(['image', 'photo', 'picture', 'pic', 'shot', 'screenshot', 'video', 'clip', 'final', 'copy', 'new', 'the', 'and', 'with', 'for']);
/** One word, inflected or not: equal, a shared stem of four letters, or a three-letter word and a four-letter one that open alike (pay, paid). */
function sameStem(left: string, right: string): boolean {
    if (left === right) return true;
    const [short, long] = left.length <= right.length ? [left, right] : [right, left];
    let shared = 0;
    while (shared < short.length && short[shared] === long[shared]) shared++;
    return short.length >= 4 ? shared >= 4 : short.length === 3 && long.length === 4 && shared >= 2;
}
const nameWords = (name: string) => [...new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length >= 3 && !/^\p{N}+$/u.test(word) && !NAME_NOISE.has(word)))];
/** A drawn mark on something in the reference's own shot (#1172): a circle around it, an arrow at it. */
const MARKED = /\b(?:around|circling|encircling|circles|pointing (?:at|to)|points (?:at|to)|aimed at|marking)\s+((?:[\p{L}-]+\s*){1,4})/iu;
const MARK_PLACE = new Set(['the', 'a', 'an', 'left', 'right', 'top', 'bottom', 'upper', 'lower', 'middle', 'centre', 'center', 'first', 'second',
    'third', 'other', 'each', 'both', 'two', 'three', 'small', 'big', 'large', 'side']);
const MARK_STOP = new Set(['with', 'and', 'in', 'on', 'of', 'at', 'while', 'as', 'to', 'from', 'over', 'under', 'near']);
/** What our own shot always holds: the presenter. */
const PRESENTER_WORDS = ['presenter', 'person', 'man', 'woman', 'face', 'head', 'hand', 'hands', 'speaker', 'host', 'creator', 'actor'];
/** The object a reference graphic marks in its own shot, as the analyser wrote it, or undefined when it marks none. */
function markedObject(label: string): string[] | undefined {
    const found = MARKED.exec(label.replace(QUOTED, ' ').replace(COLOUR_WORDS, ' '));
    if (!found) return undefined;
    const words: string[] = [];
    for (const word of found[1]!.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)) { if (MARK_STOP.has(word)) break; words.push(word); }
    const object = words.filter(word => !MARK_PLACE.has(word));
    return object.length ? object : undefined;
}
/** The reference's own call for engagement on its closing beat: likes, follows, a comment. */
const ENGAGEMENT = /\b(?:like|likes|follow|subscribe|comment|share|save|favou?rite|bell|heart)/i;

/** The analysis's name for a graphic in its gap list: its device, else its own kind. */
export const sceneGapWhat = (graphic: ReferenceGraphic): string =>
    graphic.device && graphic.device !== 'other' ? graphic.device.replace(/_/g, ' ') : graphic.source_kind;

/** A scene's brief from the analyser's reading of a graphic, with the reference's quoted words and colours left out: the scene is ours.
 *  The beat's role closes it, so the scene's author can choose motion that serves the beat. */
export function sceneBriefOf(graphic: ReferenceGraphic, asked: boolean, site: string | undefined, words: string, role?: string): { brief: string; text?: string } | undefined {
    const label = graphic.label_hint.replace(QUOTED, ' ').replace(COLOUR_WORDS, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const device = graphic.device ?? 'other', what = SCENE_DEVICES[device];
    if (!what || (device === 'other' && !label && !asked)) return undefined;
    const changes = [...new Set(graphic.state_changes.map(entry => entry.change.replace(/_/g, ' ')).filter(change => change !== 'other'))];
    const brief = `${what}${label ? ` (${label})` : ''}, at the ${graphic.position.replace(/_/g, ' ')} of the frame${changes.length ? `; it ${changes.join(', then ')}` : ''}` +
        (role && role !== 'other' ? `; for the ${role.replace(/_/g, ' ')} beat` : '');
    const text = site && /\b(site|url|link|domain|website|web address)\b|\.(com|io|ai|app|co)\b/iu.test(graphic.label_hint) ? site
        : WORD_DEVICES.has(device) ? words.slice(0, SCENE_TEXT_MAX_CHARS) : undefined;
    return { brief: brief.replace(/[\p{Cc}]/gu, ' '), ...(text ? { text } : {}) };
}

/** The reference presenter's face while its graphics show (#973 S5): each element's box over its face-unit twin gives the face; freezes stand in. */
function referenceFaceOf(profile: ReferenceProfile): { face_height: number; face_centre: [number, number] } | undefined {
    const staging = profile.staging, { width, height } = profile.source;
    if (!staging) return undefined;
    const twins = staging.elements.flatMap(({ rect_hold: rect, rect_hold_face: twin }) => {
        if (!rect || !twin) return [];
        const unit = rect.height / twin.height;
        return [{ height: unit, x: rect.left - (twin.left * unit * height) / width, y: rect.top - twin.top * unit }];
    });
    const faces = twins.length ? twins : staging.freezes.map(({ face_box_start: box }) => ({ height: box.height, x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    if (!faces.length) return undefined;
    return { face_height: round(median(faces.map(face => face.height))), face_centre: [round(median(faces.map(face => face.x))), round(median(faces.map(face => face.y)))] };
}

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

/** `choose`: the server's chooser among looks the plan adds of its own (#1121); absent, the compiler keeps its own order.
 *  `facts`: the names and roles of the request's assets, which place an asset on the line it shows (#1170). */
export function compileReferenceRemake(input: unknown, capabilities: CapabilityProfile, planSpans: ReferenceSpanPlanner = proportionalSpans,
    choose?: RemakeChooser, facts?: ReferenceAssetFacts): ReferenceRemakeResult {
    const parsed = planReferenceRemake.safeParse(input);
    if (!parsed.success) return { kind: 'invalid', issues: parsed.error.issues.map(issue => ({ kind: 'invalid_request', path: issue.path.join('.'), message: issue.message })) };
    const request = parsed.data, { script } = request, profile = request.reference_profile;
    // The product's words reach a clip model, which draws what a sentence names: they describe what is visible (#1307 S2).
    const said = request.product ? [['product.name', request.product.name] as const, ...(request.product.demo ?? []).flatMap((step, at) =>
        [[`product.demo.${at}.action`, step.action] as const, [`product.demo.${at}.end_state`, step.end_state] as const]),
    // The cast acts in the demo clip beside its words.
    ...request.product.demo ? (request.cast ?? []).flatMap((person, at) => person.action ? [[`cast.${at}.action`, person.action] as const] : []) : []] : [];
    const negated = said.flatMap(([path, text]) => { const word = negationIn(text); return word === null ? [] : [{ path, word }]; });
    if (negated.length) return { kind: 'invalid', issues: negated.map(({ path, word }) => ({ kind: 'invalid_request', path,
        message: `"${word}" describes what is absent; describe what is visible instead (her fingertips are clean, the jar is closed)` })) };
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
                    : `Write "${chunk.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')}" as separate words, as "fast—really" becomes "fast — really"`),
            ];
            const fix = fixes.join('. ');
            return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: 'script', message: `${error instanceof Error ? error.message : 'Unsupported script'}. ` +
                `${fix}: the long-form path a reference remake runs on counts words this way.` }] };
        }
    }
    const templatesOff = executor?.field_dispositions.templates === 'rejected';
    // Scenes made for the run (#1107): the graphics they draw, by `beat:graphic`, leave the gap list and are recorded as scenes in the plan.
    const scenesOn = longForm && executor?.field_dispositions.scenes === 'implemented', scened = new Set<string>();
    // The reference's caption height, where the run draws caption_position (#884); otherwise the style's own place.
    const captionsPlaced = executor?.field_dispositions.caption_position === 'implemented';
    // A wide or full reference asks for that view where the field is honoured; graphics follow that face (#884 S5d). A personal actor asks too
    // (#1175 S7): one with the view renders it, one without renders close and admission's warnings[] say so.
    const framing: PresenterFraming = (profile.presenter_framing === 'wide' || profile.presenter_framing === 'full')
        && executor?.field_dispositions.presenter_framing === 'implemented' ? profile.presenter_framing : 'close';
    // Every library actor has a wide view; a personal one may not, so its graphics keep off the close face as well.
    const placeFramings: PresenterFraming[] = framing !== 'close' && actorIdScope(request.actor_id) !== 'clipwright' ? ['close', framing] : [framing];
    // Library mic views are wide only, so a close plan asks for none.
    const mic = framing === 'wide' && profile.presenter_mic === true && executor?.field_dispositions.presenter_mic === 'implemented';
    const notes: Unmapped[] = [];
    const note = (beat: number, what: string, substitute: string) => notes.push({ what: what.slice(0, 200), beat_index: beat, suggested_substitute: substitute.slice(0, 200) });
    // A mic the plan cannot ask for is named, never dropped silently (rule 3): mic views are waist-up only (#1175 S7 acceptance r1).
    if (!mic && profile.presenter_mic === true && executor?.field_dispositions.presenter_mic === 'implemented') {
        note(0, 'the reference presenter\'s handheld mic', `no mic: mic views are waist-up only, and this plan frames the presenter ${framing}`);
    }

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
    /** A word in capitals the closing words ask the viewer to write ("FİYAT"), with a tag of its words: the word before it to its clause's end. */
    const commentCall = (span: { start: number; end: number }, clauses: { start: number; end: number }[]) => {
        for (let at = span.start; at < span.end; at++) {
            const word = words[at]!, written = script.slice(word.from, word.to).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
            if (word.tag || !word.first || !word.last || written.length < 3 || !/^\p{Lu}+$/u.test(written)) continue;
            const clause = clauses.find(range => range.start <= at && at < range.end);
            const from = clause && at > clause.start ? at - 1 : at, text = clause && label(from, clause.end, 32), found = clause && quote(from, 4, clause.end);
            if (!clause || !text || !found) continue;
            return { word: written, text: text.charAt(0).toLocaleUpperCase(/[ıİşŞğĞ]/u.test(script) ? 'tr' : 'en') + text.slice(1), anchor: found.anchor,
                cover_words: clause.end - found.start };
        }
        return undefined;
    };
    /** The words of what our shots can show: the script, the assets' names and the presenter (#1172). */
    const shownWords = () => [...tokens.flatMap(token => token.split(/[^\p{L}\p{N}]+/u)),
        ...request.assets.flatMap(asset => nameWords(facts?.get(asset.asset_id)?.name ?? '')), ...PRESENTER_WORDS].filter(word => word.length >= 3);

    // Measured staging drawn as the reference drew it (#973 S5): a box under the captions, on the face or on the frame, its entry from our list.
    const canvas = frameCanvasOf(DEFAULT_ASPECT_RATIO), measuredFace = referenceFaceOf(profile);
    const presenterOk = longForm && executor?.field_dispositions.presenter_place === 'implemented';
    const presenter = measuredFace && presenterOk ? presenterPlace.safeParse(measuredFace).data : undefined;
    if (measuredFace && !presenter) {
        note(0, `the reference presenter's face, ${measuredFace.face_height} of the frame's height`, !longForm
            ? 'the actor\'s own framing: framing the presenter needs long-form qualification, not available right now'
            : presenterOk ? 'the actor\'s own framing: the face size is outside what the presenter can be framed to' : 'the actor\'s own framing');
    }
    const face = plannedFace(DEFAULT_ASPECT_RATIO, canvas, framing, presenter);
    /** Elements whose staging the plan draws or names on its own; the rest get the one note below. */
    const drawn = new Set<string>(), touched: number[] = [];
    const gaps = { entry: [] as number[], exit: [] as number[], styles: new Map<string, number[]>(), templates: [] as number[], inferred: [] as number[],
        fitted: [] as number[] };
    // A box never measured on the frames is an estimate, and a note says so (#930 S2).
    const sourceOf = (element: StagingElement) => element.rect_method?.startsWith('estimated') ? 'vision-pass' : 'measured';
    const elementOf = (beat: number, graphic: number) =>
        profile.staging?.elements.find(entry => entry.beat_index === beat && entry.graphic_index === graphic && entry.rect_hold);
    const captionsSeen = profile.captions.present && !profile.captions.hidden_under_graphics;
    const underCaptions = (rect: StagingRect): { gap?: number } | undefined => {
        const centre = rect.left + rect.width / 2, box = profile.captions.box;
        if (!captionsSeen) return undefined;
        if (box) {
            const gap = rect.top - box.top - box.height;
            return Math.abs(centre - box.left - box.width / 2) <= UNDER_CAPTIONS && gap >= -0.005 && gap <= UNDER_CAPTIONS ? { gap: round(Math.max(0, gap)) } : undefined;
        }
        // No box: caption lines are centred, and a top-anchored block starts at its position's height while a bottom-anchored one ends there.
        const at = CAPTION_POSITION_VERTICAL[profile.captions.position] / 100, topEdge = captionEdgeAt(at * 100) === 'top';
        const [low, high] = topEdge ? [at + UNMEASURED_CAPTIONS_BELOW[0], at + UNMEASURED_CAPTIONS_BELOW[1]] : [at - 0.005, at + UNDER_CAPTIONS];
        return Math.abs(centre - 0.5) <= UNDER_CAPTIONS && rect.top >= low && rect.top <= high ? {} : undefined;
    };
    /** The element's place on our presenter, or 'face' when it would cover our face; `own` is a template's own rect, which never stands by captions. */
    const stagedPlace = (element: StagingElement, own?: LayerRect): { place: Place; inferred: boolean } | 'face' | undefined => {
        const rect = element.rect_hold!, under = own ? undefined : underCaptions(rect);
        const parsed = place.safeParse(under ? { relative_to: 'captions', side: 'below', ...(under.gap === undefined ? {} : { gap: under.gap }), width: round(rect.width) }
            : element.rect_hold_face ? { relative_to: 'face', rect: element.rect_hold_face } : { relative_to: 'frame', rect });
        if (!parsed.success) return undefined;
        if (under) return { place: parsed.data, inferred: under.gap === undefined };
        const box = resolvePlace(parsed.data, { canvas, face }), shown = own ? fitPlacedRect(box, ownPixels(own, canvas), canvas) : box;
        if (sharedArea(shown, FRAME) < (shown.width * shown.height) / 2) return undefined;
        const onFace = sharedArea(shown, face);
        if (onFace > FACE_COVER_SHARE * face.width * face.height) return 'face';
        // The reference's own touch of its presenter's face is kept on purpose and said once in the plan, not on every render (#1049).
        if (onFace > 0) touched.push(element.beat_index);
        return { place: onFace > 0 ? { ...parsed.data, allow_face: true } : parsed.data, inferred: false };
    };
    /** Where a reference moment falls in its beat: the share of the beat's spoken words up to it, else of its seconds. */
    const shareAt = (beat: number, t: number) => {
        const source = profile.beats[beat]!, said = (profile.transcript ?? []).filter(word => word.start_s >= source.start_s && word.start_s < source.end_s);
        let at = 0;
        said.forEach((word, index) => { if (word.start_s <= t) at = index; });
        return { said, at, share: said.length ? (at + 0.5) / said.length : Math.min(1, Math.max(0, (t - source.start_s) / (source.end_s - source.start_s))) };
    };
    /** The word the reference showed it on, at the same share of our beat's words, and its measured lead or lag on that word. */
    const enterOf = (element: StagingElement, beat: number, span: { start: number; end: number }) => {
        const shown = element.entry?.first_visible_s;
        if (shown === undefined) return {};
        const { said, at, share } = shareAt(beat, shown);
        const found = quote(span.start + Math.min(span.end - span.start - 1, Math.floor(share * (span.end - span.start))), 2, span.end);
        if (!found) return {};
        const offset = said.length ? round(Math.min(MAX_ENTER_OFFSET_S, Math.max(-MAX_ENTER_OFFSET_S, shown - said[at]!.start_s)), 2) : 0;
        return { anchor: found.anchor, cover_words: span.end - found.start, ...(offset ? { enter_offset_s: offset } : {}) };
    };
    const motionOf = (element: StagingElement, beat: number) => {
        const style = element.entry?.style, leave = element.exit?.style, enter = style && ENTER_OF[style], exit = leave && EXIT_OF[leave];
        const unmapped = (what: string) => gaps.styles.set(what, [...gaps.styles.get(what) ?? [], beat]);
        if (!style || style === 'unknown') gaps.entry.push(beat); else if (!enter) unmapped(`${style} entries`);
        if (!leave || leave === 'unknown') gaps.exit.push(beat); else if (!exit) unmapped(`${leave} exits`);
        const duration = element.entry?.duration_s;
        return { ...(enter ? { enter, ...(duration ? { enter_duration_s: Math.min(1.5, Math.max(0.05, round(duration, 2))) } : {}) } : {}),
            ...(exit && exit !== 'cut' ? { exit } : {}) };
    };
    /** A split's or full-frame picture's measured entry and exit: a split enters as an overlay does, an insert cuts; the rest is named (rule 3). */
    const cutsOf = (element: StagingElement, beat: number, kind: string, enters: boolean) => {
        const style = element.entry?.style, leave = element.exit?.style, enter = enters && style ? ENTER_OF[style] : undefined;
        const moved = (value: string | undefined) => value !== undefined && value !== 'cut' && value !== 'unknown';
        const lost = [moved(style) && !enter ? `${style} entry` : '', moved(leave) ? `${leave} exit` : ''].filter(Boolean);
        if (lost.length) note(beat, `${kind}: its ${lost.join(' and ')} (reference staging)`, 'a cut');
        return enter ? { enter } : {};
    };
    /** The split's media side and share from the measured box (#1030): a band from the frame edge it touches, else from the side its centre is on. */
    const splitOf = (element: StagingElement, beat: number, kind: string) => {
        const rect = element.rect_hold!, bottom = rect.top + rect.height, edge = 0.05;
        const media_side = rect.top <= edge ? 'top' as const : bottom >= 1 - edge ? 'bottom' as const : rect.top + rect.height / 2 < 0.5 ? 'top' as const : 'bottom' as const;
        const share = rect.top <= edge ? bottom : bottom >= 1 - edge ? 1 - rect.top : rect.height;
        const media_share = round(Math.min(SPLIT_MEDIA_SHARE.max, Math.max(SPLIT_MEDIA_SHARE.min, share)));
        const off = [rect.top > edge && bottom < 1 - edge ? 'off the frame\'s top and bottom edges' : '', rect.width < 0.9 ? `${round(rect.width, 2)} of the frame's width` : '',
            media_share !== round(share) ? `${round(share, 2)} of the frame's height` : ''].filter(Boolean);
        if (off.length) note(beat, `${kind}: its ${sourceOf(element)} box, ${off.join(', ')}`, `a full-width band on the ${media_side}, ${media_share} of the height`);
        return { media_side, media_share, ...cutsOf(element, beat, kind, true) };
    };
    /** A product screen's split (#1161): the band on the side the reference showed it, half the frame's height, so a screenshot reads. */
    const screenSplitOf = (element: StagingElement | undefined, position: string, beat: number) => {
        const rect = element?.rect_hold, media_side = rect ? (rect.top + rect.height / 2 < 0.5 ? 'top' as const : 'bottom' as const)
            : position.startsWith('bottom') ? 'bottom' as const : 'top' as const;
        note(beat, `overlay_media ${rect ? `in its ${sourceOf(element!)} box` : `at ${position}`}`,
            `a split: your screen fills the ${media_side} half and the presenter the other, so the screen reads and the face stays clear`);
        return { layout: 'split' as const, media_side, media_share: SPLIT_MEDIA_SHARE.default, ...(element ? cutsOf(element, beat, 'overlay_media', true) : {}) };
    };
    /** A full-frame picture takes its measured box when the box is smaller than the frame (#1030) and fit auto: the run then places it by its own shape,
     *  in that box or the whole frame, scrolled or panned to show all of it (#1031, #1051 S2). */
    const insertFrameOf = (element: StagingElement | undefined, media: 'image' | 'video', beat: number, kind: string) => {
        const rect = element?.rect_hold, margin = 0.02;
        const inset = rect && (rect.left > margin || rect.top > margin || rect.left + rect.width < 1 - margin || rect.top + rect.height < 1 - margin);
        const box = inset ? insertBox.safeParse({ left: round(rect.left), top: round(rect.top), width: round(Math.min(rect.width, 1 - rect.left)),
            height: round(Math.min(rect.height, 1 - rect.top)) }).data : undefined;
        if (element) cutsOf(element, beat, kind, false);
        if (media === 'video') {
            if (inset) note(beat, `${kind}: its ${sourceOf(element!)} box, smaller than the frame`, 'the whole frame: a video insert fills it');
            return {};
        }
        if (inset && !box) note(beat, `${kind}: its ${sourceOf(element!)} box (outside what an insert's box takes)`, 'the whole frame');
        gaps.fitted.push(beat);
        return { fit: 'auto' as const, ...(box ? { box } : {}) };
    };

    /** A full-frame picture or card the reference only flashed covers the words its measured time takes at our pace, from the beat's first;
     *  the presenter or the next shot says the rest (#1196). */
    const flashed = (element: StagingElement | undefined, span: { start: number; end: number }) => {
        const shown = element?.entry?.first_visible_s, gone = element?.exit?.last_visible_s;
        if (shown === undefined || gone === undefined || gone - shown > FLASH_HOLD_S) return {};
        const found = quote(span.start, Math.max(1, Math.ceil((gone - shown) / (duration / words.length))), span.end);
        return found && found.end < span.end ? { anchor: found.anchor, cover_words: found.end - found.start } : {};
    };

    const spans = planSpans({ profile, words });
    const beatAt = (word: number) => Math.max(0, spans.findIndex(span => span !== null && word >= span.start && word < span.end));
    /** The first script words a quote of the request names, on the beat holding them. */
    const find = (text: string) => {
        const matches = quoteOccurrences(tokens, text);
        return matches[0] && { anchor: { quote: text, ...(matches.length > 1 ? { occurrence: 0 } : {}) }, start: matches[0].startWord,
            end: matches[0].endWord, beat: beatAt(matches[0].startWord) };
    };
    const missing = (path: string, text: string): ReferenceRemakeResult => ({ kind: 'invalid', issues: [{ kind: 'invalid_request', path,
        message: `"${text}" is not in the script: quote its words as written.` }] });
    type Asset = (typeof request.assets)[number];
    type Found = NonNullable<ReturnType<typeof find>>;
    // An asset pinned to its words always shows there (#1170): in the reference's picture place on that beat, else over the whole frame.
    const pins: (Found & { asset: Asset; at: number; used: boolean })[] = [];
    for (const [at, asset] of request.assets.entries()) {
        const found = asset.anchor === undefined ? undefined : find(asset.anchor);
        if (asset.anchor !== undefined && !found) return missing(`assets.${at}.anchor`, asset.anchor);
        if (found) pins.push({ ...found, asset, at, used: false });
    }
    // The user's shot notes (#1172): the reference's graphics on their words go, and their template shows there.
    const edits: (Found & { at: number; template?: NonNullable<NonNullable<typeof request.line_edits>[number]['template']> })[] = [];
    for (const [at, edit] of (request.line_edits ?? []).entries()) {
        const found = find(edit.quote);
        if (!found) return missing(`line_edits.${at}.quote`, edit.quote);
        edits.push({ ...found, at, ...(edit.template ? { template: edit.template } : {}) });
    }
    const editsOn = (span: { start: number; end: number }) => edits.filter(edit => edit.start < span.end && span.start < edit.end);
    const layers: Layer[] = [];
    /** Layers the request named itself: a run refusing one refuses the compile, never drops it (#1172). */
    const requested = new Map<Layer, string>();
    const pool = request.assets.filter(asset => asset.anchor === undefined), images = () => pool.filter(asset => asset.media_type === 'image').length;
    // An unpinned asset whose name says a beat's words waits for that beat (#1170): the beat matching most of its name, the earliest on a tie.
    // Only beats that take a picture count; a word every asset's name holds (the brand) says nothing.
    const slots = profile.beats.flatMap((beat, index) => spans[index] && !editsOn(spans[index]!).length && (beat.presenter_behaviour === 'absent'
        || beat.graphics.some(graphic => (drawnKindOf(graphic) ?? graphic.kind) in MEDIA_KINDS || graphic.source_kind === 'logo_card')) ? [index] : []);
    const namesOf = new Map(pool.flatMap(asset => { const fact = facts?.get(asset.asset_id); return fact ? [[asset, nameWords(fact.name)] as const] : []; }));
    const everywhere = namesOf.size > 1 ? [...namesOf.values()].reduce((common, own) => common.filter(word => own.includes(word))) : [];
    const lineOf = new Map<Asset, { beat: number; score: number }>();
    for (const [asset, own] of namesOf) {
        const telling = own.filter(word => !everywhere.includes(word));
        for (const beat of slots) {
            const said = words.slice(spans[beat]!.start, spans[beat]!.end).flatMap(word => word.tag ? [] : word.token.split(/[^\p{L}\p{N}]+/u))
                .filter(token => token.length >= 3);
            const score = telling.filter(word => said.some(token => sameStem(word, token))).length;
            if (score > (lineOf.get(asset)?.score ?? 0)) lineOf.set(asset, { beat, score });
        }
    }
    /** How each asset not pinned got its place, for the note that names every guessed place (#1170). */
    const guessed: { asset: Asset; beat: number; how: 'name' | 'order' }[] = [];
    /** Beats compiled to the end; a beat the presenter leaves with nothing of its own is compiled after the rest, so beat order says nothing here.
     *  A beat with a pinned asset counts from the start: the pin takes its picture place. */
    const served = new Set(pins.map(pin => pin.beat));
    /** The beat's own named asset first (a product photo on a beat that shows the product breaks a tie), else the first no other beat still waits for. */
    const usableFor = (image: boolean, beat: number) => pool.filter(asset => {
        const named = lineOf.get(asset)?.beat;
        return (!image || asset.media_type === 'image') && (named === undefined || named === beat || served.has(named));
    });
    const take = (image: boolean, beat: number, strict = true) => {
        const suits = (asset: Asset) => facts?.get(asset.asset_id)?.role === 'prop' && SHOWN_ROLES.has(profile.beats[beat]!.role) ? 1 : 0;
        const own = pool.filter(asset => (!image || asset.media_type === 'image') && lineOf.get(asset)?.beat === beat)
            .sort((left, right) => lineOf.get(right)!.score - lineOf.get(left)!.score || suits(right) - suits(left));
        const asset = own[0] ?? usableFor(image, beat)[0] ?? (strict ? undefined : pool.find(entry => !image || entry.media_type === 'image'));
        if (!asset) return undefined;
        pool.splice(pool.indexOf(asset), 1);
        guessed.push({ asset, beat, how: asset === own[0] ? 'name' : 'order' });
        return asset;
    };
    const pinOn = (beat: number, image: boolean) => pins.find(pin => !pin.used && pin.beat === beat && (!image || pin.asset.media_type === 'image'));
    /** The layer drawing a graphic the analyser could not name a kind for; it counts as drawn only if the layer survives to the plan. */
    const drawnDevices = new Map<Layer, Graphic>();
    const waiting: (() => void)[] = [];
    const anchored: { beat: number; anchor: { quote: string; occurrence?: number } }[] = [];
    /** Beats whose words keep the presenter in the frame: no full-frame layer and no window, so a framing may sit on them. */
    const onScreen: { beat: number; anchor: { quote: string; occurrence?: number }; cover_words: number }[] = [];
    const stressed: { from: number; count: number }[] = [];
    /** The closing beat a site's end card goes on: the last call to action with words of its own, else the last beat with words (#1161). */
    const worded = (at: number) => { const span = spans[at]; return Boolean(span && quote(span.start, 6, span.end)); };
    const cta = profile.beats.findLastIndex((beat, at) => beat.role === 'cta' && worded(at));
    const closing = cta >= 0 ? cta : profile.beats.findLastIndex((_beat, at) => worded(at));
    profile.beats.forEach((beat, index) => {
        const span = spans[index];
        const lead = span ? quote(span.start, 6, span.end) : undefined;
        if (!span || !lead) {
            note(index, 'this beat (the script has fewer sentence and clause breaks than the reference has beats)', 'its words join a neighbouring beat');
            served.add(index);
            return;
        }
        anchored.push({ beat: index, anchor: lead.anchor });
        const own = quote(span.start, 4, span.end)!, envelope = (kind: string) => ({ id: `ref-${index + 1}-${kind.replaceAll('_', '-')}`, kind,
            anchor: own.anchor, cover_words: span.end - own.start });
        const beatWords = own;
        const clauses = parts(span);
        const gapOf = (graphic: Graphic) => graphic.kind === 'unmapped' ? sceneGapWhat(graphic) : drawnKindOf(graphic) ?? graphic.kind;
        // A line the user edited shows what the edit says (#1172): the reference's graphics on the beat go, each named.
        const edited = editsOn(span);
        for (const graphic of edited.length ? beat.graphics : []) {
            if (graphic.kind !== 'particles') note(index, gapOf(graphic), `your line edit on "${edited[0]!.anchor.quote}"`);
        }
        // `hidden` also counts a template whose kind draws full-frame by default, as quote and compare do: captions are hidden under it too.
        let placed: string | undefined, layered = false, fullFrame = edited.some(edit => edit.template && (edit.template.placement
            ?? TEMPLATE_KINDS.find(entry => entry.kind === edit.template!.kind)?.placements[0]) === 'full'), windowed = false, hidden = fullFrame;
        // The reference's own call for likes or follows, on a closing beat whose words ask for a comment word of ours, becomes a tag of our words (#1172).
        const asked = beat.role === 'cta' && !edited.length ? commentCall(span, clauses) : undefined;
        const engaged = asked && !templatesOff ? beat.graphics.filter(graphic => ENGAGEMENT.test(graphic.label_hint) && !((drawnKindOf(graphic) ?? graphic.kind) in MEDIA_KINDS)) : [];
        if (asked && engaged.length) {
            for (const graphic of engaged) note(index, `${gapOf(graphic)} asking for the reference's own likes or follows`, `a tag with your comment word ${asked.word}`);
            layers.push({ field: 'templates', beat: index, kind: 'tag', item: { id: `ref-${index + 1}-tag`, kind: 'tag', anchor: asked.anchor,
                cover_words: asked.cover_words, data: { text: asked.text } } });
            placed = 'tag';
        }
        // Specific graphics first: a text card is what a beat falls back to.
        // A scene comes after the library's own kinds, a device a drawn kind shows among them (#1112), and before a text card (#1107).
        const rank = (graphic: Graphic) => {
            const kind = drawnKindOf(graphic) ?? graphic.kind;
            return TEXT_KINDS.has(graphic.kind) ? 2 : kind === 'unmapped' || kind === 'scene' ? 1 : 0;
        };
        for (const graphic of edited.length ? [] : beat.graphics.filter(entry => !engaged.includes(entry)).sort((left, right) => rank(left) - rank(right))) {
            const component = drawnKindOf(graphic), kind = component ?? graphic.kind;
            if (kind === 'particles') continue;
            // A graphic no kind draws becomes a scene made for the run where it can be drawn (#1107); the analyser's word on it then goes.
            if (kind === 'unmapped' || kind === 'scene') {
                const made = scenesOn ? sceneBriefOf(graphic, kind === 'scene', request.site, beatWords.anchor.quote, beat.role) : undefined;
                // A mark on something in the reference's shot (a circle around a device) is drawn only where our shot can hold that thing (#1172).
                const marked = made && !layered ? markedObject(graphic.label_hint) : undefined;
                if (marked && !marked.some(word => shownWords().some(token => sameStem(word, token)))) {
                    note(index, `${gapOf(graphic)} marking the ${marked.join(' ')} in the reference's shot`, 'not drawn: none of your shots or assets shows it');
                    continue;
                }
                if (!made) {
                    if (kind === 'scene') note(index, `a graphic made for this video (${scenesOn ? 'nothing to draw it from' : 'not available on this server'})`,
                        'the presenter speaks these words without it');
                    continue;
                }
                if (placed || layers.filter(layer => layer.field === 'scenes').length >= MAX_SCENES) {
                    if (kind === 'scene') note(index, `a graphic made for this video (${placed ? 'one graphic per beat' : `a run draws at most ${MAX_SCENES}`})`,
                        placed ? `the ${placed} on these words` : 'the presenter speaks these words without it');
                    continue;
                }
                const placement = beat.presenter_behaviour === 'absent' ? 'full' as const : 'over' as const;
                layers.push({ field: 'scenes', beat: index, kind: 'scene', item: { id: `ref-${index + 1}-scene`, anchor: beatWords.anchor,
                    cover_words: span.end - beatWords.start, placement, ...made } });
                scened.add(`${index}:${beat.graphics.indexOf(graphic)}`);
                placed = 'graphic made for this video'; fullFrame ||= placement === 'full';
                continue;
            }
            // A logo card is a brand picture: it shows as an overlay while an image is left in assets, else as the text card it maps to (#973 S5).
            const room = layers.filter(layer => layer.field === 'overlays').length < MAX_OVERLAYS;
            const wantsLogo = graphic.source_kind === 'logo_card' && longForm && !layered;
            const logo = wantsLogo && (usableFor(true, index).length > 0 || pinOn(index, true) !== undefined) && room;
            if (wantsLogo && !logo) {
                note(index, `logo_card (${!room ? `a run shows at most ${MAX_OVERLAYS} overlays` : images() ? 'the images left are named for other lines'
                    : 'no image left in assets'})`, 'a text card with its words');
            }
            if (kind in MEDIA_KINDS || logo) {
                const media = logo ? 'logo_card' : kind;
                if (layered) { note(index, `${kind} (one media layer per beat)`, 'the first one shows here'); continue; }
                // Where the reference's presenter is gone, its split or overlay picture fills the frame (#1060). On a beat that shows the product, the
                // product's screen takes half the frame as a split, so it reads and the face stays clear by layout, not by a corner (#1161).
                const screen = !logo && kind === 'overlay_media' && SHOWN_ROLES.has(beat.role) && beat.presenter_behaviour !== 'absent'
                    && layers.filter(layer => layer.field === 'layout_windows').length < MAX_LAYOUT_WINDOWS;
                const field = logo ? 'overlays' : beat.presenter_behaviour === 'absent' ? 'inserts' : screen ? 'layout_windows'
                    : MEDIA_KINDS[kind as keyof typeof MEDIA_KINDS];
                if (field === 'overlays' && !room) {
                    note(index, `${kind} (a run shows at most ${MAX_OVERLAYS} overlays)`, 'the presenter stays on screen on these words');
                    continue;
                }
                const pin = pinOn(index, logo);
                if (!pin && !usableFor(logo, index).length) {
                    note(index, `${kind} (${pool.length ? 'the assets left are named for other lines' : 'no image or video left in assets'})`, GENERATE);
                    continue;
                }
                if (!longForm) { note(index, `${kind} (media layers need long-form qualification, not available right now)`, 'the presenter stays on screen on these words'); continue; }
                if (pin) pin.used = true;
                const asset = pin?.asset ?? take(logo, index)!;
                const { kind: _kind, ...item } = { ...envelope(field === 'inserts' ? 'insert_media' : media), asset_id: asset.asset_id, media_type: asset.media_type };
                // A pinned asset keeps the reference's place on the beat and shows on its own words.
                const push = (value: Record<string, unknown>) => {
                    const { enter_offset_s: _offset, ...rest } = value, layer: Layer = { field, beat: index, kind: media,
                        item: pin ? { ...rest, anchor: pin.anchor, cover_words: pin.end - pin.start } : value };
                    layers.push(layer);
                    if (pin) requested.set(layer, `assets.${pin.at}.anchor`);
                };
                const element = field === 'overlays' ? elementOf(index, beat.graphics.indexOf(graphic)) : undefined, staged = element && stagedPlace(element);
                if (element && staged) drawn.add(element.id);
                layered = true;
                if (element && staged && staged !== 'face') {
                    if (staged.inferred) gaps.inferred.push(index);
                    push({ ...item, ...enterOf(element, index, span), ...motionOf(element, index), place: staged.place });
                    continue;
                }
                const position = graphic.position.replace(/^split_/, ''), wanted = (OVERLAY_POSITIONS as readonly string[]).includes(position) ? position as OverlayPosition : 'top_right';
                // Off the face: the reference place, else a corner on its side (right by default), a band last.
                const side = wanted.endsWith('left') ? 'left' : 'right', rank = (place: string) => place.endsWith(side) ? 0 : place.includes('_') ? 1 : 2;
                const clear = (place: OverlayPosition) => placeFramings.every(each =>
                    !rectsOverlap(overlayRect(place, frameCanvasOf(DEFAULT_ASPECT_RATIO)), faceZone(DEFAULT_ASPECT_RATIO, each)));
                const placed = clear(wanted) ? wanted : [...OVERLAY_POSITIONS].sort((left, right) => rank(left) - rank(right)).find(clear) ?? wanted;
                if (staged === 'face') note(index, `${media}: its ${sourceOf(element!)} place, over the presenter's face`, `${placed}, to keep the face clear`);
                else if (field === 'overlays' && placed !== position) note(index, `${media} at ${graphic.position}`, `${placed}, to keep the face clear`);
                const measured = field === 'overlays' ? undefined : elementOf(index, beat.graphics.indexOf(graphic));
                if (measured) drawn.add(measured.id);
                push(field === 'overlays' ? { ...item, position: placed }
                    : screen ? { ...item, ...screenSplitOf(measured, graphic.position, index) }
                    : field === 'layout_windows' ? { ...item, layout: 'split', ...(measured ? splitOf(measured, index, media) : {}) }
                    : { ...item, ...insertFrameOf(measured, asset.media_type, index, media), ...(field === 'inserts' ? flashed(measured, span) : {}) });
                layered = true; fullFrame ||= field === 'inserts'; windowed ||= field === 'layout_windows';
                continue;
            }
            if (templatesOff) { note(index, `${kind} (templates are not available right now)`, 'the presenter speaks these words without it'); continue; }
            if (placed) { note(index, `${kind} (one graphic per beat)`, `the ${placed} on these words`); continue; }
            const built = template(kind, graphic, span, clauses, beat.presenter_behaviour === 'absent');
            if ('missing' in built) { note(index, `${kind} (${built.missing})`, built.substitute); continue; }
            if (built.instead) note(index, `${kind} (${built.instead})`, `a ${built.kind} with the same words`);
            if ('first' in built && built.first) note(index, `${built.kind} timing`, built.first);
            if ((built.kind === 'phone_call' || built.kind === 'notification') && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(script)) {
                note(index, `${built.kind} card text stays English ("${built.kind === 'phone_call' ? 'Incoming call' : 'Messages'}")`, 'edit the plan to change it');
            }
            const item: { place?: Place; data: Record<string, unknown> } & Record<string, unknown> = { ...envelope(built.kind),
                ...(built.placement ? { placement: built.placement } : {}), data: built.data };
            // A measured box over the presenter takes the template whole, drawn as its kind draws with no place of its own (#973 S4, S5).
            const element = elementOf(index, beat.graphics.indexOf(graphic)), definition = TEMPLATE_KINDS.find(entry => entry.kind === built.kind);
            if ((built.placement ?? definition?.placements[0]) === 'full' && !definition?.quotes && !definition?.spreads) Object.assign(item, flashed(element, span));
            const { position: _place, ...unplaced } = built.data, own = definition?.data.safeParse(unplaced);
            const staged = element && own?.success && (built.placement ?? definition!.placements[0]) === 'over'
                ? stagedPlace(element, definition!.rect(own.data, DEFAULT_ASPECT_RATIO, undefined, framing)) : undefined;
            if (element && staged) drawn.add(element.id);
            if (staged) item.data = unplaced;
            if (staged === 'face') note(index, `${built.kind}: its ${sourceOf(element!)} place, over the presenter's face`, `the ${built.kind}'s default place, to keep the face clear`);
            else if (staged) { item.place = staged.place; gaps.templates.push(index); }
            // A reference place over the face gives way to the kind's default, which every kind keeps off it.
            if (!item.place && 'position' in built.data && placeFramings.some(each => templateFaceWarnings({ templates: [item], presenter_framing: each }).length)) {
                const { position: _position, ...data } = built.data;
                item.data = data;
                note(index, `${built.kind} at ${graphic.position}`, `the ${built.kind}'s default place, to keep the face clear`);
            }
            const layer: Layer = { field: 'templates', beat: index, kind: built.kind, item };
            layers.push(layer);
            if (component === built.kind && graphic.kind === 'unmapped') drawnDevices.set(layer, graphic);
            placed = built.kind; fullFrame ||= built.placement === 'full'; hidden ||= (built.placement ?? definition?.placements[0]) === 'full';
        }
        // A site asks for an end card on the closing beat even where the reference shows none (#1161); it takes the place of a text card there.
        if (request.site && index === closing && edited.length) note(index, 'an end card for your site', `your line edit on "${edited[0]!.anchor.quote}"`);
        else if (request.site && index === closing && !layers.some(layer => layer.kind === 'end_card')) {
            const text = layers.findIndex(layer => layer.beat === index && layer.field === 'templates' && TEXT_KINDS.has(layer.kind));
            const full = layers.filter(layer => layer.field === 'templates').length - (text < 0 ? 0 : 1) >= MAX_TEMPLATES;
            const built = templatesOff || (placed && text < 0) || full ? undefined
                : template('end_card', { kind: 'end_card', source_kind: 'end_card', position: 'center', state_changes: [], label_hint: '' }, span, clauses, false);
            if (built && 'data' in built && built.kind === 'end_card') {
                // A text card is the beat's only graphic (it ranks last), so what stays full-frame after it goes is an insert.
                if (text >= 0) {
                    layers.splice(text, 1);
                    fullFrame = layers.some(layer => layer.beat === index && layer.field === 'inserts'); hidden = false;
                }
                layers.push({ field: 'templates', beat: index, kind: 'end_card', item: { ...envelope('end_card'), data: built.data } });
                placed = 'end_card';
            } else {
                note(index, `an end card for your site (${templatesOff ? 'templates are not available right now' : full ? `a run shows at most ${MAX_TEMPLATES} templates`
                    : 'one graphic per beat'})`, placed ? `the ${placed} on these words` : 'the presenter speaks these words without it');
            }
        }
        // A beat the presenter leaves with nothing of its own on the frame waits for the media every graphic leaves over, else a title card (#1060).
        const waits = beat.presenter_behaviour === 'absent' && !fullFrame && !placed && !layered && !edited.length;
        const finish = () => {
            if (waits) {
                const pin = longForm ? pinOn(index, false) : undefined;
                if (pin) pin.used = true;
                const asset = pin?.asset ?? (longForm ? take(false, index) : undefined);
                const card = asset || templatesOff || SHOWN_ROLES.has(beat.role) || layers.filter(layer => layer.field === 'templates').length >= MAX_TEMPLATES ? undefined
                    : template('title_card', { kind: 'title_card', source_kind: 'title_card', position: 'full_screen', state_changes: [], label_hint: '' }, span, clauses, true);
                if (asset) {
                    const { kind: _kind, ...item } = { ...envelope('insert_media'), asset_id: asset.asset_id, media_type: asset.media_type,
                        ...(pin ? { anchor: pin.anchor, cover_words: pin.end - pin.start } : {}) };
                    const layer: Layer = { field: 'inserts', beat: index, kind: 'insert_media', item: { ...item, ...insertFrameOf(undefined, asset.media_type, index, 'insert_media') } };
                    layers.push(layer);
                    if (pin) requested.set(layer, `assets.${pin.at}.anchor`);
                    fullFrame = true;
                } else if (card && 'data' in card && card.placement === 'full') {
                    layers.push({ field: 'templates', beat: index, kind: card.kind, item: { ...envelope(card.kind), placement: 'full', data: card.data } });
                    fullFrame = hidden = true;
                }
            }
            // A pin still unplaced fills the frame on its words below.
            fullFrame ||= pins.some(pin => !pin.used && pin.beat === index);
            if (beat.presenter_behaviour === 'absent' && !fullFrame) {
                const over = placed ?? (layered ? 'logo_card' : undefined);
                note(index, 'the presenter leaving the frame', over ? `the presenter stays on screen behind the ${over}`
                    : edited.length ? `the presenter stays on screen, as your line edit on "${edited[0]!.anchor.quote}" leaves it`
                    : !longForm ? 'the presenter stays on screen: full-frame media needs long-form qualification, not available right now'
                    : 'the presenter stays on screen: pass one more ready ast_* image or video and compile again to show it full-frame here');
            }
            if (!fullFrame && !windowed) onScreen.push({ beat: index, anchor: own.anchor, cover_words: span.end - own.start });
            const emphasised = profile.captions.present && profile.captions.emphasis_style !== 'none' && (beat.role === 'hook' || beat.role === 'cta');
            // A full-frame layer covers the beat's every word, and captions are hidden under it (#1049).
            if (emphasised && (fullFrame || hidden)) note(index, 'caption emphasis on this beat (a full-frame insert or template covers its words, and captions are hidden there)', 'none here');
            else if (emphasised) {
                const sentence = clauses.find(range => words[range.end - 1]!.stop === 'sentence') ?? clauses[0]!;
                const key = quote(Math.max(sentence.start, sentence.end - 3), 3, sentence.end);
                const shared = layers.some(layer => layer.field === 'caption_emphasis' && (layer.item as { quote: string }).quote === key?.anchor.quote);
                if (key && !shared) layers.push({ field: 'caption_emphasis', beat: index, kind: 'caption emphasis', item: { quote: key.anchor.quote, look: profile.captions.emphasis_style } });
                if (key) stressed.push({ from: key.start, count: key.end - key.start });
            }
            served.add(index);
        };
        if (waits) waiting.push(finish); else finish();
    });
    // Each waiting beat goes in beat order, as if it had been compiled in place.
    if (waiting.length) {
        for (const finish of waiting) finish();
        layers.sort((left, right) => left.beat - right.beat);
        onScreen.sort((left, right) => left.beat - right.beat);
        stressed.sort((left, right) => left.from - right.from);
    }
    // A pin no picture place of the reference took fills the frame on its words; an edit's template shows on its own (#1170, #1172).
    for (const pin of pins.filter(entry => !entry.used)) {
        if (!longForm) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: `assets.${pin.at}.anchor`,
            message: 'A picture on a line needs long-form qualification, not available right now.' }] };
        const layer: Layer = { field: 'inserts', beat: pin.beat, kind: 'insert_media', item: { id: `asset-${pin.at + 1}-insert-media`, asset_id: pin.asset.asset_id,
            media_type: pin.asset.media_type, anchor: pin.anchor, cover_words: pin.end - pin.start, ...insertFrameOf(undefined, pin.asset.media_type, pin.beat, 'insert_media') } };
        layers.push(layer);
        requested.set(layer, `assets.${pin.at}.anchor`);
    }
    for (const edit of edits) {
        if (!edit.template) continue;
        if (templatesOff) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: `line_edits.${edit.at}.template`, message: 'Templates are not available right now.' }] };
        const item = { id: `edit-${edit.at + 1}-${edit.template.kind.replaceAll('_', '-')}`, kind: edit.template.kind, anchor: edit.anchor,
            cover_words: edit.end - edit.start, ...(edit.template.placement ? { placement: edit.template.placement } : {}), data: edit.template.data };
        const checked = ugcTemplate.safeParse(item);
        if (!checked.success) return { kind: 'invalid', issues: checked.error.issues.map(issue => ({ kind: 'invalid_request',
            path: ['line_edits', edit.at, 'template', ...issue.path].join('.'), message: issue.message })) };
        const layer: Layer = { field: 'templates', beat: edit.beat, kind: edit.template.kind, item };
        layers.push(layer);
        requested.set(layer, `line_edits.${edit.at}`);
    }
    if (requested.size) layers.sort((left, right) => left.beat - right.beat);
    // The reference's cuts and flashes inside a beat its presenter leaves cut our picture there too (#1085): to a spare one of its kind, else the
    // same picture at a new crop; a clip cuts only to a spare clip. Moments a flash's length apart are one cut, on the cut if they hold one.
    const moments = (profile.staging?.anchors ?? []).filter(entry => /^(cut|flash)#/.test(entry.id)).sort((left, right) => left.t_s - right.t_s);
    const uncut: number[] = [];
    for (const layer of layers.filter(entry => entry.field === 'inserts' && profile.beats[entry.beat]!.presenter_behaviour === 'absent' && !requested.has(entry))) {
        const beat = profile.beats[layer.beat]!, span = spans[layer.beat]!, item = layer.item as { id: string; media_type: string; cover_words: number };
        const cuts: number[] = [];
        let group: typeof moments = [];
        for (const moment of [...moments.filter(entry => entry.t_s - beat.start_s > FLASH_SNAP_S && beat.end_s - entry.t_s > FLASH_SNAP_S), undefined]) {
            if (moment && group.length && moment.t_s - group.at(-1)!.t_s <= FLASH_SNAP_S) { group.push(moment); continue; }
            if (group.length) cuts.push((group.find(entry => entry.id.startsWith('cut#')) ?? group[0]!).t_s);
            group = moment ? [moment] : [];
        }
        const pieces: Layer[] = [], length = span.end - span.start;
        let from = span.end - item.cover_words;
        for (const t of cuts) {
            const found = quote(span.start + Math.min(length - 1, Math.max(1, Math.round(shareAt(layer.beat, t).share * length))), 2, span.end);
            // The shot before the cut keeps only words before it in its anchor.
            const kept = found && found.start > from ? quote(from, Math.min(4, found.start - from), found.start) : undefined;
            if (!found || kept?.start !== from) continue;
            const spare = pool.findIndex(asset => asset.media_type === item.media_type);
            const full = layers.filter(entry => entry.field === 'inserts').length + pieces.length >= MAX_INSERTS;
            if (full || (spare < 0 && item.media_type !== 'image')) {
                if (!full) uncut.push(layer.beat);
                else note(layer.beat, `the cuts inside the shot on beat ${layer.beat + 1} (a run shows at most ${MAX_INSERTS} inserts)`, 'one shot there');
                break;
            }
            const before = pieces.at(-1) ?? layer, asset = spare < 0 ? undefined : pool.splice(spare, 1)[0]!;
            before.item = { ...before.item as object, anchor: kept.anchor, cover_words: found.start - from };
            pieces.push({ ...layer, from_s: t, item: { ...item, id: `${item.id}-${pieces.length + 2}`, anchor: found.anchor, cover_words: span.end - found.start,
                ...(asset ? { asset_id: asset.asset_id } : {}) } });
            from = found.start;
        }
        layers.splice(layers.indexOf(layer) + 1, 0, ...pieces);
    }
    if (uncut.length) {
        note(uncut[0]!, `the cuts inside the shots on beats ${[...new Set(uncut)].map(beat => beat + 1).join(', ')}`,
            'one shot there: pass one more ready ast_* media of its kind and compile again to cut to it');
    }

    function template(kind: string, graphic: ReferenceProfile['beats'][number]['graphics'][number], span: { start: number; end: number },
        clauses: { start: number; end: number }[], absent: boolean):
        { kind: string; data: Record<string, unknown>; placement?: 'full' | 'over'; instead?: string; first?: string } | { missing: string; substitute: string } {
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
        const rows = (limit: number, most: number, kind: string) => {
            const pieces = clauses.length >= 2 ? clauses : Array.from({ length: 3 }, (_, part) => ({
                start: span.start + Math.floor((part * (span.end - span.start)) / 3), end: span.start + Math.floor(((part + 1) * (span.end - span.start)) / 3) }));
            const pick = (ready: number, resolved = true) => {
                const first = Math.max(0, pieces.findIndex(piece => piece.end > ready));
                let after = span.start;
                return pieces.slice(first, first + most).flatMap(piece => {
                    // A row's quote names no word: the run takes its first match from the row before on, so the word chosen must be that match.
                    let at: ReturnType<typeof quote>;
                    for (let from = Math.max(piece.start, ready); from < piece.end && !at; from++) {
                        const found = quote(from, 2, piece.end);
                        if (!resolved) { at = found; break; }
                        if (found && quoteOccurrences(tokens, found.anchor.quote).find(match => match.startWord >= after)?.startWord === found.start) at = found;
                    }
                    const text = label(piece.start, piece.end, limit);
                    if (!text || !at) return [];
                    after = at.start + 1;
                    return [{ text, quote: at.anchor.quote }];
                });
            };
            // The first row is clicked once the kind is drawn, at the fastest pace a voice reads, with a word to spare (#1049); a phrase spoken
            // before then introduces the rows. Without two rows that way the rows are chosen as before, and the run moves a click itself and says so.
            const shownAt = (TEMPLATE_KINDS.find(entry => entry.kind === kind)?.beatsFrom ?? TEMPLATE_ENTER_FRAMES + 1) / CANVAS_FPS;
            const led = pick(span.start + Math.ceil(shownAt * WORDS_PER_SECOND_MAX) + 1), kept = led.length >= 2 ? led : pick(span.start);
            return kept.length >= 2 ? kept : pick(span.start, false);
        };
        const number = words.slice(span.start, span.end).find(word => !word.tag && /^\d+(?:[.,]\d+)?$/.test(word.token));
        // A screen of two parts (a prompt and its replies, a command and its status) takes the clauses, or a one-clause beat cut at its middle word.
        const middle = span.start + Math.floor((span.end - span.start) / 2);
        const halves = clauses.length >= 2 ? clauses : [{ start: span.start, end: middle }, { start: middle, end: span.end }];
        switch (kind) {
            case 'checklist': {
                const items = rows(24, 4, kind);
                if (items.length < 2) return { missing: 'fewer than two short phrases for its rows', substitute: 'the presenter speaks these words without it' };
                return { kind, data: { items: items.map(item => ({ label: item.text, on: false })), clicks: items.map((item, at) => ({ item: at, quote: item.quote })) } };
            }
            case 'progress': {
                const steps = rows(20, 5, kind);
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
                const at = spans.indexOf(span);
                return { kind, data: { before: { asset_id: take(true, at, false)!.asset_id }, after: { asset_id: take(true, at, false)!.asset_id },
                    reveal_at: reveal.anchor.quote } };
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
                const parts = (text: string) => lexicalTokens(text.replace(/[./_@:&+]+/gu, ' ')).filter(part => !['www', 'http', 'https'].includes(part));
                const site = parts(request.site ?? '');
                const named = (at: number) => site.length > 0 && words.slice(at, at + 2 * site.length).flatMap(word => parts(word.token))
                    .filter(token => token !== 'dot').slice(0, site.length).join(' ') === site.join(' ');
                const until = Array.from({ length: first.end - first.start }, (_, at) => first.start + at).find(named) ?? first.end;
                const cta = until > first.start ? label(first.start, until, 48)?.replace(/\s+(at|on|via|from|to)$/iu, '') || undefined : undefined;
                return request.site ? { kind, data: { site: request.site, ...(cta ? { cta } : {}) } } : textCard('no site: pass site');
            }
            case 'chat_window': {
                const prompt = label(halves[0]!.start, halves[0]!.end, 120);
                const replies = halves.slice(1, 4).flatMap(clause => { const title = label(clause.start, clause.end, 32); return title ? [{ title }] : []; });
                return prompt && replies.length ? { kind, placement: 'full' as const, data: { prompt, replies } }
                    : textCard('fewer than two short phrases for its prompt and a reply');
            }
            case 'terminal': {
                const command = label(halves[0]!.start, halves[0]!.end, 100), last = halves.at(-1)!;
                const status = halves.length > 1 ? label(last.start, last.end, 40) : undefined;
                return command && status ? { kind, placement: 'full' as const, data: { command, status } }
                    : textCard('fewer than two short phrases for its command and status');
            }
            case 'phone_screen': {
                // The reel plays on the phone, its phrases chips on the screen's side; a ready clip fills the screen, a gradient without one.
                // One phrase plays on its own, from the phone's first frame: a beat of one clause is not cut into single words.
                const whole = label(span.start, span.end, 24);
                const [first, ...more]: { text: string; quote?: string }[] = clauses.length >= 2 ? rows(24, 3, kind) : whole ? [{ text: whole }] : [];
                const clip = pool.find(asset => asset.media_type === 'video');
                if (!first) return textCard('no words short enough for the phone\'s states');
                if (clip) pool.splice(pool.indexOf(clip), 1);
                return { kind, placement: 'full' as const, data: { ...(clip ? { screen: { asset_id: clip.asset_id } } : {}),
                    states: [{ state: 'play', ...first }, ...more.map(row => ({ state: 'tag', ...row }))]
                        .map(({ quote, ...state }) => ({ ...state, ...(quote ? { at: quote } : {}) })) } };
            }
            case 'pointer_chips': {
                // Chips on the arrow's side point across the presenter's body, below the face; a measured box places them whole, as any template.
                const items = rows(20, 3, kind), side = /left/.test(graphic.position) ? 'left' : 'right';
                if (!items.length) return textCard('no words short enough for its chips');
                const target = (at: number) => ({ x: side === 'right' ? 36 + 7 * at : 64 - 7 * at, y: 60 + 10 * at });
                return { kind, data: { side, items: items.map((item, at) => ({ target: target(at), text: item.text, at: item.quote })) } };
            }
            case 'video_grid': {
                const videos = pool.filter(asset => asset.media_type === 'video');
                if (videos.length < 3) return { missing: 'needs three video clips in assets for its tiles', substitute: GENERATE };
                const cells = videos.slice(0, videos.length >= 4 ? 4 : 3), title = label(first.start, first.end, 40);
                for (const cell of cells) pool.splice(pool.indexOf(cell), 1);
                return { kind, placement: 'full' as const, data: { ...Object.fromEntries(cells.map((cell, at) => [`cell_${at + 1}`, { asset_id: cell.asset_id }])),
                    ...(title ? { title } : {}) } };
            }
            case 'word_title': {
                // The beat's words in turn, a word or two each, each on its own words as spoken.
                const entries: { text: string; at: string }[] = [];
                for (let at = span.start; at < span.end && entries.length < 8;) {
                    const found = quote(at, 2, span.end);
                    if (!found) break;
                    const text = label(found.start, found.end, 16) ?? label(found.start, found.start + 1, 16);
                    if (text) entries.push({ text, at: found.anchor.quote });
                    at = found.end;
                }
                // The first entry shows from the template's first frame (#1129): words before its own are said under it.
                const late = entries.length && quote(span.start, 2, span.end)?.anchor.quote !== entries[0]!.at;
                return entries.length ? { kind, placement: 'full' as const, data: { words: entries },
                    ...(late ? { first: `its first entry "${entries[0]!.text}" shows from the title's first frame, before its words are spoken` } : {}) }
                    : textCard('no words short enough for it');
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
    else if (listening >= 0 && !longForm) note(listening, 'the reference\'s call (a call needs long-form qualification, not available right now)', 'the presenter keeps talking');
    else if (listening >= 0 && !before) note(listening, 'the reference\'s call (no sentence end with words after it to open it on)', 'the presenter keeps talking');
    else if (listening >= 0 && before && request.call) {
        // The call's phone replaces the reference's, never a card the request named on the same beat (#1205).
        const asked = edits.find(edit => edit.template?.kind === 'phone_call' && editsOn(spans[listening]!).includes(edit));
        if (asked) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: `line_edits.${asked.at}`,
            message: 'The call brings its own phone on these words: drop this phone_call card or the call.' }] };
        const stage = callStageOf(profile, listening, note);
        call = { after: before.anchor, lines: request.call.lines, ...(request.call.voices ? { voices: request.call.voices } : {}),
            phone: { ...CALL_PHONE_DEFAULTS, ...request.call.phone }, ...(stage ? { stage } : {}) };
        for (const layer of layers.filter(layer => layer.beat === listening && layer.kind === 'phone_call')) layers.splice(layers.indexOf(layer), 1);
        // The call's own phone draws the staging, so the dropped card's word on it goes too.
        for (const entry of notes.filter(entry => entry.beat_index === listening && entry.what.startsWith('phone_call: its '))) notes.splice(notes.indexOf(entry), 1);
    }
    // Measured staging is drawn for overlays, templates over the presenter, splits, full-frame media and the call's phone: any other measured graphic
    // the plan places keeps its default place, and says so once per beat and kind (rule 3).
    const placed = new Set(layers.filter(layer => layer.field !== 'framing' && layer.field !== 'caption_emphasis').map(layer => layer.beat));
    const named = new Set<string>();
    for (const element of profile.staging?.elements ?? []) {
        const graphic = element.graphic_index === null ? undefined : profile.beats[element.beat_index]?.graphics[element.graphic_index];
        const key = `${element.beat_index}:${graphic?.kind}`;
        // A graphic the analysis could not name is the analysis's own gap, not a place the plan moved (#1060).
        const span = spans[element.beat_index];
        if (!graphic || graphic.kind === 'unmapped' || graphic.kind === 'particles' || !placed.has(element.beat_index) || named.has(key) || drawn.has(element.id)
            || (call && element.beat_index === listening && element.kind === 'phone_call') || (span && editsOn(span).length)) continue;
        named.add(key);
        note(element.beat_index, `${graphic.kind}: its ${sourceOf(element)} place and entry (reference staging)`,
            'its default place; measured staging is drawn for overlays, templates over the presenter, splits, full-frame media and the call\'s phone');
    }
    const beatsOf = (list: readonly number[]) => [...new Set(list)].map(beat => beat + 1).join(', ');
    if (gaps.entry.length) note(gaps.entry[0]!, `how the overlays on beats ${beatsOf(gaps.entry)} enter (reference staging did not measure it)`, 'a cut');
    if (gaps.exit.length) note(gaps.exit[0]!, `how the overlays on beats ${beatsOf(gaps.exit)} leave (reference staging did not measure it)`, 'a cut');
    for (const [what, list] of gaps.styles) {
        note(list[0]!, `${what} of the overlays on beats ${beatsOf(list)}`, what.endsWith('exits') ? 'a cut' : `a cut: overlays enter by ${LAYER_ENTERS.join(', ')}`);
    }
    if (gaps.fitted.length) {
        note(gaps.fitted[0]!, `the pictures on beats ${beatsOf(gaps.fitted)} filling their box`, 'each in the box or the frame, whichever cuts it ' +
            'less, scrolled or panned to show all of it; whole over a blurred copy only if too little would show, and warnings[] names it');
    }
    if (touched.length) note(touched[0]!, `the graphics on beats ${beatsOf(touched)} touching the presenter's face at its edge, as the reference's do`, 'kept where the reference has them');
    if (gaps.templates.length) note(gaps.templates[0]!, `the measured entry of the templates on beats ${beatsOf(gaps.templates)}`, 'each template\'s own entry');
    if (gaps.inferred.length) {
        note(gaps.inferred[0]!, `the reference's caption box, for the graphics on beats ${beatsOf(gaps.inferred)} (not measured)`,
            `placed under the captions: each sits centred just below where the reference's ${profile.captions.position} captions are`);
    }

    // Camera, transitions, flashes and edit sounds go to the layer that owns each beat (#1051 S1); what the plan adds is listed in brief.added.
    const motion = planMotion({ beats: profile.beats, flashes: profile.staging?.anchors.flatMap(entry => entry.id.startsWith('flash#') ? [entry.t_s] : []) ?? [],
        worded: spans.map(Boolean), layers, onScreen, longForm, addMoves: request.add_moves, ...(choose ? { choose } : {}),
        script: { words: words.map(word => ({ token: word.token, ...(word.stop ? { stop: word.stop } : {}),
            ...(word.stop === 'sentence' && /\?["'”’»)\]]*$/u.test(script.slice(word.from, word.to)) ? { question: true } : {}) })),
            spans, word_s: duration / words.length, emphasis: stressed, quote, cards: !templatesOff } });
    // A device the director adds goes whole, every layer of it, when the run refuses one, and its line in brief.added with it (#1051 S5).
    const moves = new Map<Layer, { keys: string[]; added: MotionAdded[] }>(), ours = new Map<Layer, Layer[]>();
    for (const { layer: index, set, added } of motion.patches) {
        const layer = layers[index]!;
        layer.item = { ...(layer.item as Record<string, unknown>), ...set };
        moves.set(layer, { keys: Object.keys(set), added });
    }
    layers.push(...motion.framing as Layer[]);
    const count = (field: Layer['field']) => layers.filter(layer => layer.field === field).length;
    for (const { layers: device, added } of motion.framed as { layers: Layer[]; added: MotionAdded }[]) {
        if (count('framing') + device.length > MAX_FRAMING) continue;
        layers.push(...device);
        for (const layer of device) ours.set(layer, device);
        moves.set(device[0]!, { keys: [], added: [added] });
    }
    for (const { beat, word, added } of motion.cards) {
        const span = spans[beat]!, found = quote(word, 4, span.end);
        const built = template('stat', { kind: 'stat', source_kind: 'stat', position: 'center', state_changes: [], label_hint: '' }, span, parts(span), false);
        const item = found && 'data' in built && built.kind === 'stat' && { id: `ref-${beat + 1}-stat`, kind: 'stat', anchor: found.anchor, cover_words: span.end - found.start,
            ...(built.placement ? { placement: built.placement } : {}), data: built.data };
        if (!item || count('templates') >= MAX_TEMPLATES) continue;
        const layer: Layer = { field: 'templates', beat, kind: 'stat', item };
        layers.push(layer);
        ours.set(layer, [layer]);
        moves.set(layer, { keys: [], added: [added] });
    }
    for (const entry of motion.notes) note(entry.beat, entry.what, entry.substitute);
    // Live shots, when asked (#1103): a beat whose presenter speaks or reacts on screen, with no full-frame layer or window on its words, is a shot of
    // our actor; the longest are kept, and a framing on a shot's words gives way to it.
    // On by default since #1175 S7, on the beats where the reference presenter moves: the gestures the analysis saw, each with its frames.
    const shotsOn = longForm && executor?.field_dispositions.shots === 'implemented';
    const shotsAsked = request.live_shots !== false;
    if (request.live_shots && !shotsOn) {
        note(0, 'live shots of the presenter', `the presenter's usual take: live shots ${longForm ? 'are not available on this server' : 'need long-form qualification'}`);
    }
    const rangeOf = (layer: Layer) => { const range = layerWordRange(tokens, layer.item as AnchoredItem); return typeof range === 'string' ? undefined : range; };
    const meets = (layer: Layer, start: number, end: number) => { const range = rangeOf(layer); return !!range && range.startWord < end && start < range.coverWord; };
    const covers = (layer: Layer) => layer.field === 'inserts' || layer.field === 'layout_windows' || ((layer.field === 'templates' || layer.field === 'scenes')
        && ((layer.item as { placement?: string }).placement ?? TEMPLATE_KINDS.find(entry => entry.kind === layer.kind)?.placements[0]) === 'full');
    const product = request.product;
    const holding = product ? { product: { placement: product.placement } } : {};
    // The reference's demo, with the product's steps given, is one clip of the actor using it (#1307 S2): adjacent demo beats join the first.
    const demoBeat = (index: number) => profile.beats[index]!.role === 'demo' && profile.beats[index]!.presenter_behaviour !== 'listening';
    const demoEnds = new Map<number, number>(), joined = new Map<number, number>();
    let lead: number | undefined;
    for (const { beat } of onScreen) {
        if (!demoBeat(beat)) { lead = undefined; continue; }
        if (lead !== undefined && spans[beat]!.start <= demoEnds.get(lead)!) {
            demoEnds.set(lead, Math.max(demoEnds.get(lead)!, spans[beat]!.end));
            joined.set(beat, lead);
        } else {
            lead = beat;
            demoEnds.set(beat, spans[beat]!.end);
        }
    }
    if (product && !product.demo && shotsOn && shotsAsked) {
        for (const beat of demoEnds.keys()) {
            const group = [beat, ...[...joined].filter(([, head]) => head === beat).map(([at]) => at)].map(at => at + 1).join(', ');
            note(beat, `the reference's demo of the product (beats ${group})`,
                `the presenter's usual take: pass product.demo, the steps of using your ${product.name}, to show it in the presenter's hands`);
        }
    }
    /** The words a demo clip covers: up to the longest clip at the slowest pace, cut at a clause end inside it; the presenter says the rest. */
    const clipEnd = (start: number, end: number) => {
        const most = Math.floor(DEMO_CLIP_MAX_S * WORDS_PER_SECOND_MIN + 1e-9);
        if (end - start <= most) return end;
        const stop = words.slice(start, start + most).findLastIndex(word => word.stop !== undefined);
        return start + (stop >= 0 ? stop + 1 : most);
    };
    const wanted = !shotsAsked || !shotsOn ? [] : onScreen.flatMap(({ beat: index }, at) => {
        const beat = profile.beats[index]!, span = spans[index]!;
        if (product?.demo && demoEnds.has(index)) {
            const end = clipEnd(span.start, demoEnds.get(index)!);
            if ((call && resumeAt! > span.start && resumeAt! < end) || layers.some(layer => covers(layer) && meets(layer, span.start, end))) return [];
            if (end < demoEnds.get(index)!) {
                note(index, `the demo's words past one clip (${DEMO_CLIP_MAX_S} s)`, `the presenter's usual take on the last ${demoEnds.get(index)! - end} words`);
            }
            const wider = shotFramingOf(beat.shot_size, framing), demo = { ...product, demo: product.demo };
            const shot: UgcLiveShot = { id: `ref-${index + 1}-shot`, kind: 'action', anchor: { startWord: span.start, endWord: end },
                action: demo.demo.map(step => step.action.replace(/[.!?]+$/u, '')).join(', then '), ...holding, ...wider ? { framing: wider } : {},
                ...request.cast ? { cast: request.cast } : {}, shot: demoShot(demo, Math.ceil(((end - span.start) * duration) / words.length)) };
            const last = Math.max(index, ...[...joined].filter(([, head]) => head === index).map(([at]) => at));
            return [{ beat: index, words: end - span.start, shot, demo: last }];
        }
        if (joined.has(index) && product?.demo) return [];
        if (beat.presenter_behaviour !== 'speaking' && beat.presenter_behaviour !== 'reacting') return [];
        if (request.live_shots === undefined && !beat.gestures?.length) return [];
        // Beats sharing one span of words take one shot, and a call never opens inside a shot's words.
        if (onScreen.slice(0, at).some(entry => spans[entry.beat]!.start === span.start) || (call && resumeAt! > span.start && resumeAt! < span.end)) return [];
        if (layers.some(layer => covers(layer) && meets(layer, span.start, span.end))) return [];
        const action = [...new Set([...beat.gestures ?? []].sort((a, b) => a.at_s - b.at_s).flatMap(entry => gestureAction(entry.kind, product) ?? []))].join(', then ');
        const acted = beat.presenter_behaviour === 'reacting' || !!action;
        const wider = shotFramingOf(beat.shot_size, framing);
        // The request's cast stands beside the actor in every acting shot (#1192): those shots share one setup, so one cast; so does the product.
        const shot: UgcLiveShot = { id: `ref-${index + 1}-shot`, anchor: { startWord: span.start, endWord: span.end },
            ...beat.presenter_behaviour === 'reacting' ? { kind: 'action' as const, action: action || REACTION }
                : action ? { kind: 'talking_action' as const, action } : { kind: 'talking' as const },
            ...acted && wider ? { framing: wider } : {}, ...acted && request.cast ? { cast: request.cast } : {}, ...acted ? holding : {} };
        return [{ beat: index, words: span.end - span.start, shot, demo: undefined as number | undefined }];
    });
    const kept = new Set([...wanted].sort((a, b) => b.words - a.words || a.beat - b.beat).slice(0, MAX_LIVE_SHOTS));
    /** Each demo clip's layer, with the last reference beat it shows. */
    const demos = new Map<Layer, number>();
    for (const entry of wanted) {
        const { beat, shot } = entry;
        if (!kept.has(entry)) {
            note(beat, `a live shot on this beat (a run draws at most ${MAX_LIVE_SHOTS}; the longest are kept)`, 'the presenter\'s usual take');
            continue;
        }
        const { startWord: start, endWord: end } = shot.anchor as { startWord: number; endWord: number };
        for (const layer of layers.filter(entry => entry.field === 'framing' && meets(entry, start, end))) {
            if (!layers.includes(layer)) continue;
            const device = ours.get(layer);
            for (const gone of device ?? [layer]) { layers.splice(layers.indexOf(gone), 1); moves.delete(gone); ours.delete(gone); }
            const item = layer.item as { size: string; transition?: string };
            if (!device) note(layer.beat, `the reference's cut to a ${item.size} framing${item.transition ? ` with a ${item.transition}` : ''}`, 'the live shot on these words');
        }
        const layer: Layer = { field: 'shots', beat, kind: `${shot.kind} shot`, item: shot };
        // A hook shot cuts to the presenter on a flash, ours unless add_moves is false (#1129); a chooser may pick another cut it draws (#1121).
        if (request.add_moves !== false && profile.beats[beat]!.role === 'hook' && end < words.length) {
            const cue = beatCue(profile.beats[beat]!);
            const [look] = preferChosen(HOOK_SHOT_CUTS, { slot: 'live_shot_transition', beat, role: 'hook', ...(cue ? { cue } : {}) }, choose);
            layer.item = { ...shot, transition: look };
            moves.set(layer, { keys: ['transition'], added: [{ beat_index: beat,
                what: `${lookName(look!)} on the cuts into and out of the hook's live shot (beat ${beat + 1})` }] });
        }
        if (entry.demo !== undefined) demos.set(layer, entry.demo);
        layers.push(layer);
    }
    const soundsOn = longForm && !['warned', 'rejected', 'stored'].includes(executor?.field_dispositions.edit_sounds ?? '');
    const cutToSound = () => layers.some(layer => ['inserts', 'layout_windows'].includes(layer.field)
        || (layer.field === 'framing' && (layer.item as { id: string }).id !== MARKER));
    const music = profile.beats.findIndex(beat => beat.sounds.some(sound => sound.kind === 'music'));
    const musicOn = executor?.field_dispositions.music === 'implemented';
    if (request.music !== undefined || music >= 0) {
        const what = music >= 0 ? 'the music bed' : 'music under the voice';
        // Without music on the server a reference's bed keeps its line word for word, so today's plans stay byte for byte.
        if (!musicOn) note(Math.max(music, 0), what, music >= 0 ? 'no music; Clipwright adds none yet' : 'no music: music is not available on this server');
        else if (request.music === undefined) note(music, what, `none unless you ask: compile again with music: "auto" or { mood } for music ` +
            `under the voice, ${MUSIC_BED_CREDITS} credits on its own quote line`);
    }
    const stylesOn = executor?.field_dispositions.motion_style === 'implemented';
    if (request.motion_style !== undefined && !stylesOn) note(0, 'the motion style you asked for', 'plain: motion styles are not available on this server');
    // The narration chases the presenter's measured pace through the voice's speed; a model without one leaves the voice as the lever.
    const speechModel = resolveTtsModel({ voice: request.voice, voice_id: request.voice_id, script });
    const pace = narrationPaceFromVoice(profile.voice), fixedPace = FIXED_PACE_MODELS.has(speechModel);
    if (pace.kind === 'unmeasured') note(0, `narration pace (${pace.reason})`, 'the voice speaks at its own pace');
    else if (fixedPace) {
        const named = measuredPaceOf(request.voice), gap = (wps: number) => Math.abs(wps - pace.target_wps);
        // Only voices nearer than the named one: the nearest of a gender can still be farther off.
        const nearer = (['female', 'male'] as const).map(gender => [gender, voicesNearestPace(pace.target_wps, gender, 2, named?.voice)
            .filter(entry => !named || gap(entry.words_per_second) < gap(named.words_per_second))] as const)
            .filter(([, voices]) => voices.length).map(([gender, voices]) => `${gender} ${voices.map(entry => `${entry.voice} ${entry.words_per_second}`).join(', ')}`);
        const own = named ? `${named.voice} speaks ${named.words_per_second}` : `English voices: ${VOICE_PACE_RANGE} words/s`;
        if (!named || gap(named.words_per_second) > PACE_MATCH_SHARE * pace.target_wps) {
            note(0, `narration pace ${pace.target_wps} words/s of the reference presenter`, isEnglishScript(script, language === 'en')
                ? `${speechModel} has no speed; ${own}. ${nearer.length ? `Nearer voices: ${nearer.join('; ')}` : 'No measured voice is nearer'}`
                : `${speechModel} has no speed: the voice keeps its own pace; voice paces are measured on English only`);
        }
    } else if (pace.clamped) {
        note(0, `narration pace ${pace.target_wps} words/s of the reference presenter (speed ${pace.wanted} wanted)`,
            `voice_pace ${pace.voice_pace}, the end of the speed range: the narration may run ${pace.wanted > pace.voice_pace ? 'slower' : 'faster'} than the reference`);
    }
    // Speed first, then pauses past the presenter's word-gap medians are cut; the request's own win, as a reference's gaps may be a song's (#1308).
    // A remake is an ad: without the reference's own pauses it takes the ad-style default (#1136).
    const pauseTrim = request.pause_trim === undefined ? pauseTrimFromVoice(profile.voice) : undefined;
    const pauseTargets = request.pause_trim ?? pauseTrim?.targets ?? { ...AD_PAUSE_TRIM };
    if (request.pause_trim === undefined && !pauseTrim?.targets) note(0, 'narration pauses (the reference presenter\'s pauses were not measured)',
        `pause_trim ${AD_PAUSE_TRIM.sentence_end_s} s after a sentence and ${AD_PAUSE_TRIM.comma_s} s after a comma, the default for an ad`);
    for (const { key, median_s } of pauseTrim?.capped ?? []) {
        note(0, `narration pauses ${key} ${Math.round(median_s * 100) / 100} s of the reference presenter`,
            `pause_trim ${key} ${PAUSE_TRIM_CEILING_S}, the longest target: these pauses may run shorter than the reference`);
    }

    const captionStyle = profile.captions.words_per_caption_max <= 2 ? 'tiktok' : profile.captions.words_per_caption_max <= 4 ? 'hormozi' : 'youtube';
    // The reference's caption height, unless the band would sit on our presenter's face there: then the nearest clear height, lower on a tie (#1049).
    const height = CAPTION_POSITION_VERTICAL, referenceAt = profile.captions.position;
    const onFace = (position: keyof typeof height) => sharedArea(captionBandBox(captionStyle, DEFAULT_ASPECT_RATIO, canvas, { vertical: height[position] }), face) > 0;
    // A graphic placed by the captions keeps the reference's relation to them, so the band stays and the plan names the face it covers.
    const byCaptions = layers.some(layer => (layer.item as { place?: Place }).place?.relative_to === 'captions');
    const captionPosition = byCaptions ? referenceAt : (Object.keys(height) as (keyof typeof height)[])
        .sort((a, b) => Math.abs(height[a] - height[referenceAt]) - Math.abs(height[b] - height[referenceAt]) || height[b] - height[a])
        .find(position => !onFace(position)) ?? referenceAt;
    if (captionsPlaced && profile.captions.present && onFace(referenceAt)) {
        note(0, `captions at the reference's ${referenceAt} height (there they would cover the presenter's face)`, captionPosition !== referenceAt
            ? `${captionPosition} captions, clear of the face` : byCaptions ? 'kept there: graphics stand by the captions' : 'kept there: no caption height is clear of the face');
    }
    // A clip shorter than its words would freeze on its last frame: it covers only the words it outlasts at the slowest pace, and the presenter
    // says the rest (#1198). A fit that leaves the run more presenter shots than it renders is undone first, below.
    const fitted = new Map<Layer, { item: unknown; line: string }>();
    for (const layer of layers.filter(entry => entry.field === 'inserts')) {
        const item = layer.item as AnchoredItem & { asset_id?: string; media_type?: string };
        const seconds = item.media_type === 'video' && item.asset_id ? facts?.get(item.asset_id)?.seconds : undefined;
        const range = seconds === undefined ? undefined : layerWordRange(tokens, item);
        if (seconds === undefined || range === undefined || typeof range === 'string') continue;
        const most = Math.floor(seconds * WORDS_PER_SECOND_MIN + 1e-9), short = range.coverWord - range.startWord > most
            ? quote(range.startWord, most, range.startWord + most) : undefined;
        if (!short) continue;
        fitted.set(layer, { item, line: `the clip on "${'quote' in item.anchor ? item.anchor.quote : short.anchor.quote}" covers its first ` +
            `${short.end - short.start} words, as long as it runs, so it never freezes; the presenter says the rest` });
        layer.item = { ...item, anchor: short.anchor, cover_words: short.end - short.start };
    }
    let native: Record<string, unknown> = {}, marked = false;
    // Every pass that does not break drops one layer or adds the one marker, so the loop ends.
    for (;;) {
        const field = (name: Layer['field']) => { const items = layers.filter(layer => layer.field === name).map(layer => layer.item); return items.length ? { [name]: items } : {}; };
        native = { script, actor_id: request.actor_id, ...(framing !== 'close' ? { presenter_framing: framing } : {}), ...(mic ? { presenter_mic: true } : {}),
            ...(request.voice ? { voice: request.voice } : {}), ...(request.voice_id ? { voice_id: request.voice_id } : {}),
            ...(pace.kind === 'paced' && !fixedPace ? { voice_pace: pace.voice_pace } : {}), pause_trim: pauseTargets,
            ...(profile.captions.present ? { captions: true, caption_style: captionStyle, ...(captionsPlaced ? { caption_position: captionPosition } : {}) } : {}),
            ...field('caption_emphasis'), ...field('templates'), ...field('scenes'), ...field('overlays'), ...field('inserts'), ...field('layout_windows'), ...field('framing'),
            ...(call ? { call } : {}), ...field('shots'),
            ...product && layers.some(layer => layer.field === 'shots' && (layer.item as UgcLiveShot).product) ? { product_asset_id: product.asset_id } : {} };
        // Cut sounds only when the client asks: on a remake they sounded too loud on every cut (#1076).
        if (request.edit_sounds === true && soundsOn && cutToSound()) native.edit_sounds = true;
        if (request.music !== undefined && musicOn) native.music = request.music;
        if (request.motion_style !== undefined && stylesOn) native.motion_style = request.motion_style;
        if (presenter && isNarratedUgcInput(native)) native.presenter_place = presenter;
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
            const device = ours.get(dropped);
            if (device) {
                for (const layer of device) { layers.splice(layers.indexOf(layer), 1); moves.delete(layer); ours.delete(layer); }
                continue;
            }
            // A move the run refuses goes before the layer does: the refused layer's own, else one on a layer the refusal names.
            // A refusal of a transition takes only the transition it names: the refused layer's own, or the cited layer's "whose …" (#1198 item 7).
            const passing = /would show (a hidden presenter frame|the presenter between)/.test(issue.message);
            const blamed = (layer: Layer): string[] => {
                const { keys } = moves.get(layer)!, id = (layer.item as { id: string }).id;
                if (!passing) return layer === dropped || issue.message.includes(`"${id}"`) ? keys : [];
                return keys.includes('transition') && (layer === dropped ? issue.message.includes(' has a ') : issue.message.includes(`"${id}", whose `))
                    ? ['transition'] : [];
            };
            const moved = [dropped, ...moves.keys()].find(layer => moves.has(layer) && blamed(layer).length > 0);
            if (moved) {
                const entry = moves.get(moved)!, keys = blamed(moved), item = { ...(moved.item as Record<string, unknown>) };
                for (const key of keys) delete item[key];
                moved.item = item;
                const left = entry.keys.filter(key => !keys.includes(key));
                if (left.length) moves.set(moved, { keys: left, added: entry.added.filter(line => line.key === undefined || left.includes(line.key)) });
                else moves.delete(moved);
                note(moved.beat, `${moved.kind}: its ${keys.map(key => key.replace('_', ' ')).join(' and ')} (${issue.message})`,
                    keys.map(key => key === 'transition' ? 'a cut' : 'a still picture').join(' and '));
                continue;
            }
            // A layer the request named stays: a reference layer the refusal also names goes instead, else the compile is refused (#1172).
            const cited = (layer: Layer) => issue.message.includes(`"${(layer.item as { id?: string }).id}"`);
            const instead = requested.has(dropped) ? layers.find(layer => layer !== dropped && !requested.has(layer) && cited(layer)) : dropped;
            if (!instead) return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: requested.get(dropped)!, message: issue.message }] };
            layers.splice(layers.indexOf(instead), 1);
            for (const layer of ours.get(instead) ?? []) if (layers.includes(layer)) layers.splice(layers.indexOf(layer), 1);
            note(instead.beat, `${instead.kind} (${issue.message})`, 'left out; edit the plan to place it');
            continue;
        }
        // The quote's actor-shot limit: the insert covering the fewest words goes first, a requested one only when no other is left.
        const inserts = layers.filter(layer => layer.field === 'inserts');
        const plan = inserts.length ? planSemanticInserts(script, inserts.map(layer => {
            const item = layer.item as { id: string; anchor: { quote: string; occurrence?: number }; cover_words?: number };
            return { insertId: item.id, mediaId: item.id, anchor: item.anchor, ...(item.cover_words === undefined ? {} : { coverWords: item.cover_words }) };
        })) : undefined;
        const shots = plan ? countActorShots(plan) : 1;
        if (plan && (shots === 0 || shots > MAX_NARRATED_ACTOR_SHOTS)) {
            const undo = [...fitted.keys()].filter(layer => layers.includes(layer)).at(-1);
            if (undo) {
                undo.item = fitted.get(undo)!.item;
                fitted.delete(undo);
                continue;
            }
            const layerOf = (entry: (typeof plan.inserts)[number]) => inserts.find(layer => (layer.item as { id: string }).id === entry.insertId)!;
            const candidates = plan.inserts.filter(entry => !requested.has(layerOf(entry)));
            if (!candidates.length) {
                return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: requested.get(layerOf(plan.inserts[0]!))!,
                    message: `the pictures on lines leave ${shots} presenter appearances; a run renders 1 to ${MAX_NARRATED_ACTOR_SHOTS}` }] };
            }
            const fewest = candidates.reduce((best, entry) => coverWordOf(entry) - entry.startWord < coverWordOf(best) - best.startWord ? entry : best);
            const dropped = layerOf(fewest);
            layers.splice(layers.indexOf(dropped), 1);
            note(dropped.beat, `${dropped.kind} (inserts leave ${shots} actor appearances; a run renders 1 to ${MAX_NARRATED_ACTOR_SHOTS})`, 'left out; the presenter speaks these words');
            continue;
        }
        // The quote's take budget (#1197), so the plan is never refused at quote: past it a live shot goes, the one on the fewest words first;
        // with no shot left, a picture the plan placed itself; with only the request's own pictures left, the compile is refused in the quote's words.
        const overBudget = ugcMarkedComponentsRefusal(checked.data, executor?.field_dispositions.visible_ai_label === 'implemented');
        if (overBudget) {
            const wordsOf = (layer: Layer) => { const range = rangeOf(layer); return range ? range.coverWord - range.startWord : 0; };
            const fewest = (candidates: Layer[]) => candidates.reduce((best, layer) => wordsOf(layer) < wordsOf(best) ? layer : best);
            const shotLayers = layers.filter(layer => layer.field === 'shots');
            if (shotLayers.length) {
                const shot = fewest(shotLayers);
                layers.splice(layers.indexOf(shot), 1);
                moves.delete(shot);
                note(shot.beat, `a live shot on this beat (with it the video makes more presenter takes than the ${MAX_PRESENTER_TAKES} one video ` +
                    'renders, or more than it holds beside your pictures; the shortest shots go first)', 'the presenter\'s usual take');
                continue;
            }
            const pictures = layers.filter(layer => ['inserts', 'overlays', 'layout_windows'].includes(layer.field)
                || (layer.field === 'templates' && templateMediaOf([layer.item as { id: string; kind: string; data: Record<string, unknown> }]).length > 0));
            const placed = pictures.filter(layer => !requested.has(layer));
            if (!placed.length) {
                return { kind: 'invalid', issues: [{ kind: 'invalid_request', path: pictures.map(layer => requested.get(layer)).find(Boolean) ?? 'assets',
                    message: overBudget }] };
            }
            const picture = fewest(placed);
            for (const gone of ours.get(picture) ?? [picture]) if (layers.includes(gone)) { layers.splice(layers.indexOf(gone), 1); moves.delete(gone); ours.delete(gone); }
            note(picture.beat, `${picture.kind} (${overBudget})`, 'left out; the presenter speaks these words');
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
    if (product && !native.product_asset_id) {
        note(0, `your product ${product.asset_id} in the presenter's ${product.placement === 'hand' ? 'hand' : 'shots'}`, `not shown: no live shot acts on this plan ` +
            `(${!shotsOn ? 'live shots are not available here' : request.live_shots === false ? 'live_shots is false' : 'no beat of the reference acts, and no product.demo'})`);
    } else if (product) {
        note(0, `your product in every talking second`, 'only in the live shots: the usual take shows the actor as the actor view does; an actor view ' +
            'holding it (create_actor holding) shows it throughout');
    }
    if (request.cast && !layers.some(layer => layer.field === 'shots' && (layer.item as UgcLiveShot).cast)) {
        note(0, `your cast (${request.cast.map(person => person.role).join(', ')})`, 'not drawn: the plan has no acting live shot, where the reference presenter gestures or reacts');
    }
    const sounded = [...new Set(motion.sounded)].map(beat => beat + 1).join(', ');
    if ((motion.sounded.length || request.edit_sounds === true) && !native.edit_sounds) {
        note(motion.sounded[0] ?? 0, motion.sounded.length ? `the whoosh and click sounds on beats ${sounded}` : 'edit_sounds, a sound on every cut',
            !soundsOn ? (request.edit_sounds !== true ? 'none' : longForm ? 'none: edit_sounds is not available on this server' : 'none: edit_sounds needs a long-form run')
                : !cutToSound() ? 'none: the plan has no insert, window or framing cut to sound them on'
                : 'none unless you ask: compile again with edit_sounds: true for a sound on every cut');
    }
    const added = [...layers.flatMap(layer => moves.get(layer)?.added ?? []).sort((a, b) => a.beat_index - b.beat_index).map(entry => entry.what),
        ...[...fitted].filter(([layer]) => layers.includes(layer)).map(([, fit]) => fit.line),
        ...native.edit_sounds ? [`a sound on every cut, as you asked${motion.sounded.length ? `; the reference has a whoosh or a click on beats ${sounded}` : ''}`] : [],
        ...native.music ? [`music under the voice, as you asked${music >= 0 ? '; the reference has a music bed' : ''}`] : [],
        ...native.shots ? [`live shots of the presenter on beats ${beatsOf(layers.filter(layer => layer.field === 'shots').map(layer => layer.beat))}, as you asked; ` +
            'each shot kind bills its own presenter-second price'] : [],
        ...[...demos].filter(([layer]) => layers.includes(layer)).map(([layer, last]) => `the demo on beats ${layer.beat + 1}${last > layer.beat ? `–${last + 1}` : ''}: ` +
            `one live shot of the presenter using your ${product!.name}, from a first frame with it ${product!.placement === 'hand' ? 'in hand' : 'beside them'}`)];
    // Every place the compiler chose for an unpinned asset is named (#1170): the line its name matches, else its order in assets.
    const shownBy = (asset: Asset) => layers.find(layer => JSON.stringify(layer.item).includes(`"${asset.asset_id}"`));
    for (const { asset, beat } of guessed.filter(entry => entry.how === 'name' && shownBy(entry.asset))) {
        const name = facts?.get(asset.asset_id)?.name, at = (shownBy(asset)!.item as { anchor?: { quote: string } }).anchor?.quote;
        note(beat, `an anchor for your ${asset.media_type} ${asset.asset_id}${name ? ` ("${name.slice(0, 60)}")` : ''}`,
            `shown${at ? ` on "${at}"` : ''}, the line its name matches; pass its anchor to place it elsewhere`);
    }
    // An asset whose line showed something else is told apart from one no line names.
    for (const named of [false, true]) {
        const byOrder = guessed.filter(entry => entry.how === 'order' && shownBy(entry.asset) && lineOf.has(entry.asset) === named);
        if (byOrder.length) {
            note(byOrder[0]!.beat, `a line for your assets ${byOrder.map(entry => entry.asset.asset_id).join(', ')}`, `placed in their order in assets, as ${named
                ? 'the line each one\'s name matches did not show it' : 'no line names them'}: pass each one's anchor with the words it shows`);
        }
    }
    const disclosed = notes.length;
    // A reference with almost no presenter is closer to a faceless video, and the cover over ours is still billed (#1060).
    const away = profile.beats.reduce((sum, beat) => sum + (beat.presenter_behaviour === 'absent' ? beat.end_frac - beat.start_frac : 0), 0);
    if (profile.format === 'faceless' || profile.format === 'broll' || away >= FACELESS_SHARE - 1e-9) {
        note(0, 'a video with no presenter on screen for most of its length', 'a presenter video that covers its presenter there, and a covered presenter ' +
            'is still billed; make_faceless makes narrated videos with no presenter');
    }
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
    // A device's layer the run schema dropped above leaves the device undrawn: its line and its analyser kind stay.
    const converted = new Map([...drawnDevices].filter(([layer]) => layers.includes(layer)).map(([layer, graphic]) => [graphic, layer.kind]));
    // Past the bound the compiler's own gaps come first, then one analyser entry for each beat whose undrawn graphic needs one (the schema refuses it bare).
    // A scene the run refused went with its layer, and its graphic stays a gap.
    for (const key of [...scened]) if (!layers.some(layer => layer.field === 'scenes' && `${layer.beat}` === key.split(':')[0])) scened.delete(key);
    const needsEntry = (beat: number) => profile.beats[beat]!.graphics.some((graphic, at) => (graphic.kind === 'particles' || graphic.kind === 'unmapped')
        && !converted.has(graphic) && !scened.has(`${beat}:${at}`));
    // A plan that plays the call drops the analyser's word that recorded audio is not played on its beat: the client would read both.
    const heard = call ? profile.unmapped.filter(entry => entry.beat_index !== listening || !/recorded/i.test(entry.what)) : profile.unmapped;
    // A device a drawn kind now shows, or a graphic drawn as a scene, takes its analyser line with it: one line for each, named as the analysis names it.
    const shown = [...converted.keys()].map(graphic => ({ beat: profile.beats.findIndex(beat => beat.graphics.includes(graphic)), what: sceneGapWhat(graphic) }))
        .concat([...scened].map(key => {
            const [beat, at] = key.split(':').map(Number) as [number, number];
            return { beat, what: sceneGapWhat(profile.beats[beat]!.graphics[at]!) };
        }));
    const analysed = heard.filter(entry => {
        const at = shown.findIndex(device => device.beat === entry.beat_index && device.what === entry.what);
        if (at >= 0) shown.splice(at, 1);
        return at < 0;
    });
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
            reference_profile: { ...withoutWords(profile), music: '', unmapped,
                beats: profile.beats.map((beat, index) => ({ ...beat, spoken_summary: '', graphics: beat.graphics.map((graphic, at) => ({ ...graphic, label_hint: '',
                    ...(converted.has(graphic) ? { kind: converted.get(graphic) } : scened.has(`${index}:${at}`) ? { kind: 'scene' as const } : {}) })) })) },
            ...(added.length ? { added: added.slice(0, WORKFLOW_ADDED_MAX) } : {}), ...(request.review_notes?.length ? { review_notes: request.review_notes } : {}) },
        beats, claims: [], assets: [] });
    return document.success ? { kind: 'compiled', document: document.data }
        : { kind: 'invalid', issues: document.error.issues.map(issue => ({ kind: 'invalid_plan', path: issue.path.join('.'), message: issue.message })) };
}
