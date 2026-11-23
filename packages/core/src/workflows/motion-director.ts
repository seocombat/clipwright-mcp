export const DEVICE_GAP_S = 1.5;
export const PUNCH_LINE_WORDS = 4;
const ITEM_WORDS = 2;
const TURNS = new Set(['but', 'then', 'now', 'so', 'next', 'finally', 'however', 'instead']);

export type DirectorOwner = 'presenter' | 'picture' | 'clip' | 'card' | 'window';
export type DirectorDevice = 'pull_back' | 'stat' | 'sequence' | 'punch' | 'transition';
export type DirectorWord = { token: string; stop?: 'sentence' | 'clause'; question?: boolean };
export interface DirectorBeat {
    role?: string;
    owner?: DirectorOwner;
    from: number; to: number; start_s: number;
    reference?: { look: string; drawn: boolean };
}
export interface DirectorInput {
    words: readonly DirectorWord[];
    beats: readonly DirectorBeat[];
    word_s: number;
    draws: Partial<Record<DirectorOwner, { devices: readonly DirectorDevice[]; looks?: readonly string[] }>>;
    emphasis?: readonly { from: number; count: number }[];
    accepts?: (choice: DirectorChoice) => boolean;
    order?: (beat: number, owner: DirectorOwner, looks: readonly string[]) => readonly string[];
}
export interface DirectorChoice {
    beat: number; device: DirectorDevice; look: string;
    cuts: { from: number; count: number }[];
    at_s: number; reason: string;
}

const LOOK_NAMES: Partial<Record<string, string>> = { light_leak: 'a light leak', slide: 'a slide in', wipe: 'a wipe', zoom: 'a zoom', flash: 'a flash',
    punch: 'a cut in close' };
export const lookName = (look: string) => LOOK_NAMES[look] ?? look.replaceAll('_', ' ');

export function directBeats({ words, beats, word_s, draws, emphasis = [], accepts = () => true, order = (_, __, looks) => looks }: DirectorInput): DirectorChoice[] {
    const sentences: { from: number; to: number; question: boolean }[] = [];
    words.forEach((word, at) => {
        if (word.stop === 'sentence' || at === words.length - 1) sentences.push({ from: sentences.at(-1)?.to ?? 0, to: at + 1, question: word.question === true });
    });
    const worded = beats.flatMap((beat, at) => beat.from < beat.to ? [at] : []);
    const closing = sentences.findLast(sentence => sentence.question);
    const finale = closing && worded.slice(-2).some(at => beats[at]!.from <= closing.from && closing.from < beats[at]!.to) ? closing : undefined;
    const placed = new Map(beats.flatMap((beat, at) => beat.reference?.drawn ? [[at, beat.reference.look] as const] : []));
    const ours: number[] = [], choices: DirectorChoice[] = [];
    const timeOf = (beat: DirectorBeat, word: number) => beat.start_s + (word - beat.from) * word_s;
    const repeats = (look: string, at: number) => {
        const position = worded.indexOf(at);
        return [worded[position - 1], worded[position + 1]].some(next => next !== undefined && placed.get(next) === look);
    };

    worded.forEach((at, position) => {
        const beat = beats[at]!, can = beat.owner && draws[beat.owner];
        if (!can || beat.reference?.drawn) return;
        const inBeat = (from: number) => beat.from <= from && from < beat.to;
        const previous = position > 0 ? beats[worded[position - 1]!]! : undefined;
        const candidates: Omit<DirectorChoice, 'beat' | 'look' | 'at_s'>[] = [];
        const turn = previous && (beat.role && previous.role ? beat.role !== previous.role : TURNS.has(words[beat.from]!.token.toLowerCase()));
        const lost = beat.reference && !beat.reference.drawn ? beat.reference.look : undefined;
        const transition = { device: 'transition' as const, cuts: [{ from: beat.from, count: beat.to - beat.from }],
            reason: lost ? `the reference's ${lost} into it` : turn && beat.role && previous.role ? `a new part (${beat.role} after ${previous.role})` : 'a new part' };
        if (lost) candidates.push(transition);
        if (finale && inBeat(finale.from) && (beat.owner !== 'presenter' || finale.from - beat.from >= ITEM_WORDS)) {
            candidates.push({ device: 'pull_back', cuts: [{ from: beat.from, count: finale.from - beat.from }], reason: 'the closing question' });
        }
        const number = words.slice(beat.from, beat.to).findIndex(word => /^\d+(?:[.,]\d+)?$/.test(word.token));
        if (number >= 0) candidates.push({ device: 'stat', cuts: [{ from: beat.from + number, count: 1 }], reason: `the number ${words[beat.from + number]!.token}` });
        for (const sentence of sentences.filter(entry => inBeat(entry.from) && entry.to <= beat.to)) {
            const items = itemsOf(words, sentence);
            if (items.length >= 3 && items.every(item => item.count >= ITEM_WORDS)) {
                candidates.push({ device: 'sequence', cuts: items.filter((_, index) => index % 2 === 0), reason: `a list of ${items.length}` });
                break;
            }
        }
        const stressed = emphasis.find(entry => inBeat(entry.from));
        const line = sentences.find(entry => inBeat(entry.from) && entry.to <= beat.to && !entry.question && entry.to - entry.from <= PUNCH_LINE_WORDS);
        if (stressed) candidates.push({ device: 'punch', cuts: [stressed], reason: 'its stressed words' });
        else if (line) candidates.push({ device: 'punch', cuts: [{ from: line.from, count: line.to - line.from }], reason: 'a short line' });
        if (turn && !candidates.includes(transition)) candidates.push(transition);

        for (const candidate of candidates.filter(entry => can.devices.includes(entry.device))) {
            const at_s = timeOf(beat, candidate.device === 'pull_back' ? finale!.from : candidate.cuts[0]!.from);
            if (ours.some(other => Math.abs(other - at_s) < DEVICE_GAP_S)) continue;
            for (const look of candidate.device === 'transition' ? order(at, beat.owner!, rotate(can.looks ?? [], at)) : [candidate.device]) {
                if (repeats(look, at)) continue;
                const choice = { ...candidate, beat: at, look, at_s, reason: `beat ${at + 1}: ${candidate.reason}, so ${shownAs(candidate.device, look, beat.owner!)}` };
                if (!accepts(choice)) continue;
                choices.push(choice);
                ours.push(at_s);
                placed.set(at, look);
                return;
            }
        }
    });
    return choices;
}

function itemsOf(words: readonly DirectorWord[], sentence: { from: number; to: number }) {
    const items: { from: number; count: number }[] = [];
    let from = sentence.from;
    for (let at = sentence.from; at < sentence.to; at++) {
        if (words[at]!.stop || at === sentence.to - 1) { items.push({ from, count: at + 1 - from }); from = at + 1; }
    }
    if (items.length < 2) return [];
    const last = items.at(-1)!, joint = words.slice(last.from, last.from + last.count).findLastIndex(word => ['and', 'or'].includes(word.token.toLowerCase()));
    if (joint <= 0) return items;
    return [...items.slice(0, -1), { from: last.from, count: joint }, { from: last.from + joint, count: last.count - joint }];
}

const rotate = (looks: readonly string[], at: number) => looks.map((_, index) => looks[(at + index) % looks.length]!);

function shownAs(device: DirectorDevice, look: string, owner: DirectorOwner): string {
    switch (device) {
        case 'punch': return 'the presenter cuts in close on it';
        case 'sequence': return 'its items cut close and back in turn';
        case 'pull_back': return owner === 'presenter' ? 'the presenter is framed close, then pulls back as it is asked' : 'the picture zooms out as it is asked';
        case 'stat': return 'it counts up on a card below the face';
        case 'transition':
            if (look === 'slide') return 'the split slides in';
            if (look === 'punch') return 'the presenter cuts in close';
            return owner === 'presenter' ? `${lookName(look)} plays on the cut` : `the ${owner === 'card' ? 'card' : 'picture'} comes in with ${lookName(look)}`;
    }
}
