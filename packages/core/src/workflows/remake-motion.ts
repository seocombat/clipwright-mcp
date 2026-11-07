import type { ReferenceProfileInput as ReferenceProfile } from '../reference-profile.js';
import { TEMPLATE_KINDS } from '../templates/index.js';
import { directBeats, lookName, type DirectorBeat, type DirectorChoice, type DirectorInput, type DirectorOwner, type DirectorWord } from './motion-director.js';
import { preferChosen, type RemakeChoiceSlot, type RemakeChooser } from './remake-chooser.js';

// The remake's motion (#1051 S1): the reference's camera, transitions, flashes and edit sounds routed to the layer that owns each beat,
// and a slow zoom on every still picture unless the plan asks for the reference's moves only. Pure: the compiler merges the result.

/** A still picture's zoom; 0.15 reads as still on a phone frame (#1051 E0). */
export const PICTURE_ZOOM = 0.25;
/** A flash this close to a beat's start lands on that beat's cut. */
export const FLASH_SNAP_S = 0.3;

type Anchor = { quote: string; occurrence?: number };
/** `from_s`: a picture cut inside its beat at this reference moment (#1085). */
export type MotionLayer = { field: string; beat: number; kind: string; item: unknown; from_s?: number };
/** `key`: the layer field a patch's line is about, so a refusal of that field alone takes its line with it (#1198 item 7). */
export type MotionAdded = { beat_index: number; what: string; key?: string };
export type MotionPatch = { layer: number; set: { transition?: string; image_motion?: { direction: 'in' | 'out'; amount: number }; enter?: 'slide' };
    added: MotionAdded[] };
type Quote = (from: number, limit: number, end: number) => { anchor: Anchor; start: number; end: number } | undefined;
export interface MotionInput {
    beats: readonly (Pick<ReferenceProfile['beats'][number], 'camera' | 'transition_in' | 'sounds' | 'presenter_behaviour' | 'start_s'>
        & Partial<Pick<ReferenceProfile['beats'][number], 'role' | 'transition_device' | 'camera_device'>>)[];
    /** The server's chooser among the looks a beat can take (#1121); absent, the director's own rotation stands. */
    choose?: RemakeChooser;
    /** The reference's flash moments, in seconds. */
    flashes: readonly number[];
    /** Whether each beat kept words of the script. */
    worded: readonly boolean[];
    layers: readonly MotionLayer[];
    /** Beats whose words keep the presenter in the frame, with the words a framing takes there. */
    onScreen: readonly { beat: number; anchor: Anchor; cover_words: number }[];
    longForm: boolean;
    /** Our own moves where the reference has none: a slow zoom on each still picture, and the director's devices. */
    addMoves: boolean;
    /** The script as the director reads it (#1051 S5): its words, each beat's words and the seconds a word takes; absent, it adds nothing. */
    script?: { words: readonly DirectorWord[]; spans: readonly ({ start: number; end: number } | null)[]; word_s: number;
        emphasis: NonNullable<DirectorInput['emphasis']>; quote: Quote; cards: boolean };
}
export interface MotionPlan {
    framing: MotionLayer[];
    /** The director's presenter cuts, each device's framing with its line in brief.added. */
    framed: { layers: MotionLayer[]; added: MotionAdded }[];
    /** Stat cards the director asks for, on the word of their number. */
    cards: { beat: number; word: number; added: MotionAdded }[];
    patches: MotionPatch[];
    /** Beats the reference sounds with a whoosh or a click. */
    sounded: number[];
    notes: { beat: number; what: string; substitute: string }[];
}

const INSERT_OF: Partial<Record<string, string>> = { wipe: 'wipe', zoom: 'zoom', flash: 'light_leak' };
const TEMPLATE_OF: Partial<Record<string, string>> = { wipe: 'wipe', zoom: 'zoom', flash: 'flash' };
const beatsOf = (list: Iterable<number>) => [...new Set(list)].map(beat => beat + 1).join(', ');

/** The reference's own device on a beat, for a chooser: its named transition or camera move, else the plain ones it shows. */
export const beatCue = (beat: MotionInput['beats'][number]): string | undefined => beat.transition_device
    ?? (['none', 'cut', 'other'].includes(beat.transition_in) ? undefined : beat.transition_in) ?? beat.camera_device
    ?? (['static', 'other'].includes(beat.camera) ? undefined : beat.camera);
/** The chooser's slot for what fills a beat: a picture or clip cuts as an insert, a card as a full frame, the presenter by framing; a window has
 *  only its slide, so nothing to choose. */
export const REMAKE_SLOT_OF: Readonly<Partial<Record<DirectorOwner, RemakeChoiceSlot>>> = { picture: 'insert_transition', clip: 'insert_transition',
    card: 'full_frame_transition', presenter: 'presenter_cut' };

export function planMotion({ beats, flashes, worded, layers, onScreen, longForm, addMoves, script, choose }: MotionInput): MotionPlan {
    const notes: MotionPlan['notes'] = [];
    const note = (beat: number, what: string, substitute: string) => notes.push({ beat, what, substitute });
    const item = (index: number) => layers[index]!.item as { media_type?: string; kind?: string; placement?: string };
    /** The insert or full-frame template that fills a beat, or its last piece when the picture cuts inside the beat. */
    const ownerOf = (beat: number, last = false) => {
        const fills = (layer: MotionLayer) => layer.beat === beat && (layer.field === 'inserts' || (layer.field === 'templates'
            && ((layer.item as { placement?: string }).placement ?? TEMPLATE_KINDS.find(kind => kind.kind === layer.kind)?.placements[0]) === 'full'));
        const index = last ? layers.findLastIndex(fills) : layers.findIndex(fills);
        return index < 0 ? undefined : { index, insert: layers[index]!.field === 'inserts', image: item(index).media_type === 'image' };
    };
    const transitions = new Map<number, string>(), zooms = new Map<number, 'in' | 'out'>(), added = new Map<number, MotionAdded[]>();
    const add = (index: number, what: string) => added.set(index, [...added.get(index) ?? [], { beat_index: layers[index]!.beat, what }]);
    const shown = new Set(onScreen.map(entry => entry.beat));

    // A transition into a beat goes to the full frame that starts it, or to the one before that cuts back to the presenter.
    const routedIn = new Set<number>();
    beats.forEach((beat, at) => {
        const value = beat.transition_in, owner = ownerOf(at);
        if (owner && (owner.insert ? INSERT_OF : TEMPLATE_OF)[value]) {
            if (!transitions.has(owner.index)) transitions.set(owner.index, (owner.insert ? INSERT_OF : TEMPLATE_OF)[value]!);
            routedIn.add(at);
            return;
        }
        const before = at > 0 && shown.has(at) && value !== 'flash' && INSERT_OF[value] ? ownerOf(at - 1, true) : undefined;
        if (before?.insert && !transitions.has(before.index)) {
            transitions.set(before.index, value);
            add(before.index, `beat ${at}: the picture also comes in with the ${value} it leaves on`);
            routedIn.add(at);
        }
    });

    // A flash on a beat's cut goes to that cut; one inside a full frame goes to its cuts; on the presenter the framing draws it.
    const flashEdges = new Set<number>(), lost: number[] = [], inShot = { insert: [] as number[], template: [] as number[] };
    for (const t of flashes) {
        const inside = Math.max(0, beats.findLastIndex(beat => beat.start_s <= t));
        const edge = inside + 1 < beats.length && beats[inside + 1]!.start_s - t <= FLASH_SNAP_S ? inside + 1
            : t - beats[inside]!.start_s <= FLASH_SNAP_S ? inside : undefined;
        // A flash by a cut the picture makes inside its beat lands on that cut (#1085).
        const piece = edge === undefined ? layers.findIndex(layer => layer.beat === inside && layer.from_s !== undefined && Math.abs(layer.from_s - t) <= FLASH_SNAP_S) : -1;
        const at = edge ?? inside, owner = piece >= 0 ? { index: piece, insert: true, image: item(piece).media_type === 'image' } : ownerOf(at);
        if (edge !== undefined && beats[edge]!.transition_in === 'flash') continue;
        if (owner) {
            const look = owner.insert ? 'light_leak' : 'flash', current = transitions.get(owner.index);
            if (current === undefined) transitions.set(owner.index, look);
            if (current !== undefined && current !== look) note(at, `the flash on beat ${at + 1}`, `the ${current} the reference uses there`);
            else if (edge === undefined && piece < 0) inShot[owner.insert ? 'insert' : 'template'].push(at);
            continue;
        }
        if (edge !== undefined && shown.has(edge)) flashEdges.add(edge); else lost.push(at);
    }
    if (inShot.insert.length) note(inShot.insert[0]!, `the flashes inside the shots on beats ${beatsOf(inShot.insert)}`, 'a light leak on each picture\'s cuts');
    if (inShot.template.length) note(inShot.template[0]!, `the flashes inside the cards on beats ${beatsOf(inShot.template)}`, 'a flash on each card\'s cuts');

    // A punch_in beat cuts close, the next on-screen beat back to medium; a flash into a speaking beat swaps the size, so each cut moves the face
    // FRAMING_SCALE's 18% (S2, #924). A punch on a beat that gave up its words goes to the next on-screen beat.
    const framing: MotionLayer[] = [], cutClose = new Set<number>(), flashed = new Set<number>();
    let close = false, previous = -1;
    for (const { beat: at, anchor, cover_words } of longForm ? onScreen : []) {
        const carried = beats.slice(previous + 1, at).flatMap((skipped, index) => !worded[previous + 1 + index] && skipped.camera === 'punch_in'
            ? [previous + 1 + index] : []);
        const beat = beats[at]!, punch = beat.camera === 'punch_in' || carried.length > 0;
        const flash = (beat.transition_in === 'flash' || flashEdges.has(at)) && beat.presenter_behaviour === 'speaking';
        if (punch || flash || close) {
            framing.push({ field: 'framing', beat: at, kind: 'framing', item: { id: `ref-${at + 1}-framing`, anchor, cover_words,
                size: punch || (flash && !close) ? 'close' : 'medium', ...(flash ? { transition: 'flash' } : {}) } });
            if (punch) for (const index of [at, ...carried]) cutClose.add(index);
            if (flash) flashed.add(at);
        }
        close = punch || (flash && !close);
        previous = at;
    }
    lost.push(...[...flashEdges].filter(at => !flashed.has(at)));

    // The camera on a full-frame picture moves the picture; every other still picture zooms too, in and out by turns, unless asked not to.
    const moved = new Set<number>(), zoomNotes = new Map<number, string>();
    /** A piece that cuts inside its beat to the picture before it. */
    const recrop = (index: number) => layers[index]!.from_s !== undefined && item(index).media_type === 'image'
        && (layers[index - 1]?.item as { asset_id?: string } | undefined)?.asset_id === (layers[index]!.item as { asset_id?: string }).asset_id;
    beats.forEach((beat, at) => {
        const owner = cutClose.has(at) ? undefined : ownerOf(at);
        if (!owner?.image || (beat.camera !== 'punch_in' && beat.camera !== 'zoom_out')) return;
        zooms.set(owner.index, beat.camera === 'punch_in' ? 'in' : 'out');
        moved.add(at);
    });
    if (addMoves) {
        let last: 'in' | 'out' | undefined;
        layers.forEach((layer, index) => {
            if (layer.field !== 'inserts' || item(index).media_type !== 'image' || recrop(index)) return;
            const own = zooms.get(index), direction = own ?? (last === 'in' ? 'out' : 'in');
            if (!own) { zooms.set(index, direction); zoomNotes.set(index, `beat ${layer.beat + 1}: the picture zooms ${direction} slowly, unless its shape scrolls or pans it`); }
            last = direction;
        });
    }

    // Our own devices on the beats the reference leaves plain (#1051 S5); a transition of ours that stands in for a lost one is named there.
    const cards: MotionPlan['cards'] = [], framed: MotionPlan['framed'] = [], enters = new Map<number, 'slide'>();
    const standIn = new Map<number, string>(), cameraStandIn = new Map<number, string>();
    if (addMoves && longForm && script) direct(script);
    // The same picture after the cut starts the zoom before it again, or one from closer, so the frame jumps to a new crop there (#1085).
    layers.forEach((_, index) => { if (recrop(index)) zooms.set(index, zooms.get(index - 1) ?? 'out'); });
    function direct({ words, spans, word_s, emphasis, quote, cards: carded }: NonNullable<MotionInput['script']>) {
        const sized = new Set(framing.map(layer => layer.beat));
        const windowOf = (at: number) => layers.findIndex(layer => layer.beat === at && layer.field === 'layout_windows');
        const ownerAt = (at: number): DirectorOwner | undefined => {
            const owner = ownerOf(at), visible = layers.filter(layer => layer.beat === at && layer.field !== 'caption_emphasis');
            if (owner) return owner.insert ? (owner.image ? 'picture' : 'clip') : 'card';
            if (windowOf(at) >= 0) return visible.length === 1 ? 'window' : undefined;
            // A size change under a graphic over the presenter could carry the face under it, so such a beat takes nothing of ours.
            return shown.has(at) && visible.length === 0 && !sized.has(at) ? 'presenter' : undefined;
        };
        const drawnLook = (at: number): string | undefined => {
            const owner = ownerOf(at) ?? (routedIn.has(at) ? ownerOf(at - 1) : undefined), window = windowOf(at);
            if (flashed.has(at)) return 'light_leak';
            if (cutClose.has(at)) return 'punch';
            if (sized.has(at)) return 'cut';
            if (owner && transitions.has(owner.index)) return transitions.get(owner.index);
            if (window >= 0 && (layers[window]!.item as { enter?: string }).enter) return (layers[window]!.item as { enter: string }).enter;
            return moved.has(at) ? 'camera' : undefined;
        };
        const directed: DirectorBeat[] = beats.map((beat, at) => {
            const span = spans[at], look = drawnLook(at), lost = !['none', 'cut', 'flash'].includes(beat.transition_in) && !routedIn.has(at), owner = ownerAt(at);
            return { ...(beat.role ? { role: beat.role } : {}), from: span?.start ?? 0, to: span?.end ?? 0, start_s: (span?.start ?? 0) * word_s,
                ...(owner ? { owner } : {}),
                ...(look ? { reference: { look, drawn: true } } : lost ? { reference: { look: beat.transition_in, drawn: false } } : {}) };
        });
        const apply = new Map<DirectorChoice, () => void>();
        const frame = (choice: DirectorChoice, size: 'close' | 'medium', transition?: 'flash') => {
            const parts = choice.cuts.map((cut, index) => {
                const found = quote(cut.from, 6, cut.from + cut.count);
                return found && { field: 'framing', beat: choice.beat, kind: 'framing', item: { id: `ref-${choice.beat + 1}-${choice.device.replace('_', '-')}${
                    choice.cuts.length > 1 ? `-${index + 1}` : ''}`, anchor: found.anchor, cover_words: cut.from + cut.count - found.start, size,
                    ...(transition ? { transition } : {}) } };
            });
            if (parts.some(part => !part)) return false;
            apply.set(choice, () => framed.push({ layers: parts as MotionLayer[], added: { beat_index: choice.beat, what: choice.reason } }));
            return true;
        };
        const accepts = (choice: DirectorChoice) => {
            const owner = ownerOf(choice.beat), what = { beat_index: choice.beat, what: choice.reason };
            if (directed[choice.beat]!.owner === 'presenter') {
                if (choice.device === 'stat') { apply.set(choice, () => cards.push({ beat: choice.beat, word: choice.cuts[0]!.from, added: what })); return carded; }
                return choice.look === 'light_leak' ? frame(choice, 'medium', 'flash') : frame(choice, 'close');
            }
            const index = owner?.index ?? windowOf(choice.beat);
            if (choice.device === 'pull_back') apply.set(choice, () => { zooms.set(index, 'out'); zoomNotes.set(index, choice.reason); });
            else if (owner) apply.set(choice, () => { transitions.set(index, choice.look); add(index, choice.reason); });
            else apply.set(choice, () => { enters.set(index, 'slide'); add(index, choice.reason); });
            return true;
        };
        const draws: DirectorInput['draws'] = { presenter: { devices: ['pull_back', 'stat', 'sequence', 'punch', 'transition'], looks: ['light_leak', 'punch'] },
            picture: { devices: ['pull_back', 'transition'], looks: ['wipe', 'light_leak', 'zoom'] }, clip: { devices: ['transition'], looks: ['wipe', 'light_leak', 'zoom'] },
            card: { devices: ['transition'], looks: ['wipe', 'zoom', 'flash'] }, window: { devices: ['transition'], looks: ['slide'] } };
        const order = (at: number, owner: DirectorOwner, looks: readonly string[]) => {
            const slot = REMAKE_SLOT_OF[owner], beat = beats[at]!, cue = beatCue(beat);
            return slot ? preferChosen(looks, { slot, beat: at, ...(beat.role ? { role: beat.role } : {}), ...(cue ? { cue } : {}) }, choose) : looks;
        };
        for (const choice of directBeats({ words, beats: directed, word_s, draws, emphasis, accepts, order })) {
            apply.get(choice)!();
            if (choice.device === 'transition' && directed[choice.beat]!.reference?.drawn === false) standIn.set(choice.beat, `ours instead: ${lookName(choice.look)}`);
            if (choice.device === 'pull_back' || choice.device === 'punch') cameraStandIn.set(choice.beat, choice.device === 'punch' ? 'a cut in close' : 'a pull-back');
        }
    }

    const aggregate = (values: (string | undefined)[], what: (value: string, beats: string) => string, substitute: (at: number) => string) => {
        const groups = new Map<string, number[]>();
        values.forEach((value, at) => { if (value !== undefined) groups.set(`${value}\n${substitute(at)}`, [...groups.get(`${value}\n${substitute(at)}`) ?? [], at]); });
        for (const [key, at] of groups) { const [value, instead] = key.split('\n') as [string, string]; note(at[0]!, what(value, beatsOf(at)), instead); }
    };
    aggregate(beats.map((beat, at) => flashed.has(at) || routedIn.has(at) || ['none', 'cut'].includes(beat.transition_in) ? undefined : beat.transition_in),
        (value, list) => `${value} transitions into beats ${list}`, at => standIn.get(at) ?? 'cuts');
    aggregate(beats.map((beat, at) => cutClose.has(at) || moved.has(at) || beat.camera === 'static' ? undefined : beat.camera),
        (value, list) => `${value} camera on beats ${list}`, at => {
            const owner = ownerOf(at);
            return cameraStandIn.get(at) ?? (owner && zooms.has(owner.index) ? 'a slow zoom on the picture' : 'a static frame');
        });
    if (lost.length) note(lost[0]!, `the flashes on beats ${beatsOf(lost)}`, 'cuts');

    const patches: MotionPatch[] = [...new Set([...transitions.keys(), ...zooms.keys(), ...enters.keys()])].sort((a, b) => a - b).map(index => ({ layer: index,
        set: { ...(transitions.has(index) ? { transition: transitions.get(index)! } : {}),
            ...(zooms.has(index) ? { image_motion: { direction: zooms.get(index)!, amount: PICTURE_ZOOM } } : {}), ...(enters.has(index) ? { enter: 'slide' as const } : {}) },
        added: [...(added.get(index) ?? []).map(entry => ({ ...entry, key: transitions.has(index) ? 'transition' : 'enter' })),
            ...zoomNotes.has(index) ? [{ beat_index: layers[index]!.beat, what: zoomNotes.get(index)!, key: 'image_motion' }] : []] }));
    const sounded = beats.flatMap((beat, at) => beat.sounds.some(sound => sound.kind === 'whoosh' || sound.kind === 'click') ? [at] : []);
    return { framing, framed, cards, patches, sounded, notes };
}
