import { describe, expect, it } from 'vitest';
import { directBeats, type DirectorBeat, type DirectorInput, type DirectorOwner, type DirectorWord } from './motion-director.js';

// #1051 S5: the director's meanings (punch, list, closing question, number, new part) and its taste rules, beat by beat.

const WORD_S = 0.4;
const DRAWS: DirectorInput['draws'] = { presenter: { devices: ['pull_back', 'stat', 'sequence', 'punch', 'transition'], looks: ['light_leak', 'punch'] },
    picture: { devices: ['pull_back', 'transition'], looks: ['wipe', 'light_leak', 'zoom'] }, card: { devices: ['transition'], looks: ['wipe', 'zoom', 'flash'] },
    window: { devices: ['transition'], looks: ['slide'] } };
type Line = [text: string, owner: DirectorOwner | undefined, role?: string, reference?: DirectorBeat['reference']];
/** Beats from their lines: words split on spaces, each beat's first word spoken WORD_S seconds per word after the start. */
function direct(lines: Line[], extra: Partial<DirectorInput> = {}) {
    const words: DirectorWord[] = [], beats: DirectorBeat[] = [];
    for (const [text, owner, role, reference] of lines) {
        const from = words.length;
        for (const chunk of text ? text.split(/\s+/) : []) {
            words.push({ token: chunk.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''), ...(/[.!?]$/.test(chunk) ? { stop: 'sentence' as const }
                : /[,;:]$/.test(chunk) ? { stop: 'clause' as const } : {}), ...(chunk.endsWith('?') ? { question: true } : {}) });
        }
        beats.push({ from, to: words.length, start_s: from * (extra.word_s ?? WORD_S), ...(owner ? { owner } : {}), ...(role ? { role } : {}),
            ...(reference ? { reference } : {}) });
    }
    return directBeats({ words, beats, word_s: WORD_S, draws: DRAWS, ...extra });
}
const brief = (choices: ReturnType<typeof direct>) => choices.map(choice => `${choice.beat}:${choice.device}:${choice.look}`);
const PLAIN = 'This is a longer opening sentence about the product today.';

describe('what each beat says (#1051 S5)', () => {
    /** Mutants: drop the short-line test or let a picture take a punch, and a punch line goes plain or a still picture "cuts in close". */
    it('cuts in close on a short line or stressed words, and only on the presenter', () => {
        expect(brief(direct([[PLAIN, 'presenter'], ['I tried Clipwright.', 'presenter']]))).toEqual(['1:punch:punch']);
        expect(direct([[PLAIN, 'presenter'], ['I tried Clipwright.', 'presenter']])[0]!.cuts).toEqual([{ from: 10, count: 3 }]);
        expect(direct([[PLAIN, 'presenter'], ['I tried Clipwright.', 'picture']])).toEqual([]);
        const stressed = direct([[PLAIN, 'presenter'], ['It made every single client video for me.', 'presenter']], { emphasis: [{ from: 15, count: 3 }] });
        expect(stressed.map(choice => [choice.device, choice.cuts])).toEqual([['punch', [{ from: 15, count: 3 }]]]);
        expect(stressed[0]!.reason).toBe('beat 2: its stressed words, so the presenter cuts in close on it');
    });
    /** Mutants: cut every item, or take one-word items, and a list jitters or every item cuts. */
    it('gives a list of three or more items a cut on every other item', () => {
        const [choice] = direct([[PLAIN, 'presenter'], ['I still choose the presenter, the voice and the hook.', 'presenter']]);
        expect([choice!.device, choice!.cuts]).toEqual(['sequence', [{ from: 10, count: 5 }, { from: 17, count: 3 }]]);
        expect(direct([[PLAIN, 'presenter'], ['It breaks the reel into beats, inserts and timing today.', 'presenter']])).toEqual([]);
    });
    /** Mutants: take the first question, or forget the lead-in, and the pull-back lands mid-video or with no close frame to pull back from. */
    it('pulls back on the closing question, from a close frame on its lead-in', () => {
        const lines: Line[] = [['Do you edit by hand every single day?', 'presenter'], [PLAIN, 'presenter'], ['So here it is. Want one like this?', 'presenter']];
        const [choice] = direct(lines);
        expect([choice!.beat, choice!.device, choice!.cuts, choice!.at_s]).toEqual([2, 'pull_back', [{ from: 18, count: 4 }], 22 * WORD_S]);
        expect(brief(direct([[PLAIN, 'presenter'], ['Want one like this?', 'picture']]))).toEqual(['1:pull_back:pull_back']);
        // No lead-in on the presenter: the beat falls through to its next meaning, a short line.
        expect(brief(direct([[PLAIN, 'presenter'], ['Here. Want one?', 'presenter']]))).toEqual(['1:punch:punch']);
    });
    it('counts a number up on a card', () => {
        const [choice] = direct([[PLAIN, 'presenter'], ['It took me 30 hours every single week.', 'presenter']]);
        expect([choice!.device, choice!.cuts, choice!.reason]).toEqual(['stat', [{ from: 13, count: 1 }], 'beat 2: the number 30, so it counts up on a card below the face']);
    });
    /** Mutants: compare roles the wrong way, or start the rotation at 0, and every new part wipes or no new part is marked. */
    it('marks a new part with the owner\'s look, by role or, without roles, by its opening word', () => {
        expect(brief(direct([[PLAIN, 'presenter', 'hook'], [PLAIN, 'picture', 'problem'], [PLAIN, 'card', 'solution'], [PLAIN, 'window', 'proof']])))
            .toEqual(['1:transition:light_leak', '2:transition:flash', '3:transition:slide']);
        expect(brief(direct([[PLAIN, 'picture', 'demo'], [PLAIN, 'picture', 'demo']]))).toEqual([]);
        expect(brief(direct([[PLAIN, 'picture'], [`But ${PLAIN}`, 'picture'], [PLAIN, 'picture']]))).toEqual(['1:transition:light_leak']);
        expect(direct([[PLAIN, 'presenter', 'hook'], [PLAIN, 'picture', 'problem']])[0]!.reason).toBe('beat 2: a new part (problem after hook), so the picture comes in with a light leak');
    });
});

describe('taste (#1051 S5)', () => {
    it('chooses the same devices for the same beats', () => {
        const lines: Line[] = [[PLAIN, 'presenter', 'hook'], ['Then I tried Clipwright.', 'presenter', 'solution'], [PLAIN, 'picture', 'demo'], [PLAIN, 'card', 'cta']];
        expect(JSON.stringify(direct(lines))).toBe(JSON.stringify(direct(lines)));
    });
    /** Mutant: check only the beat before, and our light leak lands against the reference's light leak right after it. */
    it('never repeats a look back to back, the reference\'s own included', () => {
        expect(brief(direct([[PLAIN, 'presenter', 'hook'], [PLAIN, 'picture', 'problem'], [PLAIN, 'picture', 'solution'], [PLAIN, 'picture', 'demo']])))
            .toEqual(['1:transition:light_leak', '2:transition:zoom', '3:transition:wipe']);
        const before = direct([[PLAIN, 'presenter', 'hook'], [PLAIN, 'picture', 'problem'], [PLAIN, 'picture', 'demo', { look: 'light_leak', drawn: true }]]);
        expect(brief(before)).toEqual(['1:transition:zoom']);
        // A beat left without words sits between no two cuts: the neighbours are the worded beats either side of it.
        const across = direct([[PLAIN, 'presenter', 'hook'], [PLAIN, 'picture', 'problem'], ['', 'picture', 'demo'], [PLAIN, 'picture', 'demo', { look: 'light_leak', drawn: true }]]);
        expect(brief(across)).toEqual(['1:transition:zoom']);
        expect(brief(direct([[PLAIN, 'window', 'hook'], [PLAIN, 'window', 'problem'], [PLAIN, 'window', 'proof']]))).toEqual(['1:transition:slide']);
    });
    /** Mutant: drop the gap, and two devices of ours land under 1.5 s apart. */
    it('keeps devices of ours at least 1.5 s apart', () => {
        const choices = direct([['Short one here.', 'presenter', 'hook'], ['And then this.', 'presenter', 'problem'], ['Then that one.', 'presenter', 'solution'],
            [PLAIN, 'picture', 'demo']]);
        const times = choices.map(choice => choice.at_s);
        expect(times.slice(1).every((time, index) => time - times[index]! >= 1.5)).toBe(true);
        // 1.4 s after our punch is too close for the next device; 1.6 s is not.
        const pair: Line[] = [['I tried it now.', 'presenter', 'hook'], ['I tried it again.', 'presenter', 'problem']];
        expect(brief(direct(pair, { word_s: 0.35 }))).toEqual(['0:punch:punch']);
        expect(brief(direct(pair, { word_s: 0.4 }))).toEqual(['0:punch:punch', '1:transition:light_leak']);
        expect(brief(choices)).toEqual(['0:punch:punch', '2:punch:punch']);
    });
    /** Mutant: let the director move a drawn reference beat, and it overwrites the reference's own device. */
    it('leaves the reference\'s beats alone and stands in for a transition nothing draws', () => {
        expect(direct([[PLAIN, 'presenter', 'hook'], ['Then I tried Clipwright.', 'presenter', 'solution', { look: 'punch', drawn: true }]])).toEqual([]);
        const [choice] = direct([[PLAIN, 'window', 'hook'], ['Then I tried Clipwright.', 'presenter', 'hook', { look: 'wipe', drawn: false }]]);
        expect([choice!.device, choice!.look, choice!.reason]).toEqual(['transition', 'punch',
            'beat 2: the reference\'s wipe into it, so the presenter cuts in close']);
        // The stand-in comes before every other meaning, a number included.
        expect(brief(direct([[PLAIN, 'window', 'hook'], ['It took 30 hours.', 'presenter', 'hook', { look: 'wipe', drawn: false }]]))).toEqual(['1:transition:punch']);
    });
    it('moves nothing where no owner is named, and takes the next meaning the skill accepts', () => {
        expect(direct([[PLAIN, 'presenter', 'hook'], ['Then I tried Clipwright.', undefined, 'solution']])).toEqual([]);
        expect(brief(direct([[PLAIN, 'presenter', 'hook'], ['Then I tried Clipwright.', 'presenter', 'solution']], { accepts: choice => choice.look !== 'punch' })))
            .toEqual(['1:transition:light_leak']);
    });
});

describe('faceless scenes take the same director (#1067)', () => {
    /** A make_faceless video is scenes of pictures with no roles and one look: a turn word marks a new part, and one look never repeats back to back. */
    it('marks the scenes that open a new part, one look apart', () => {
        const draws: DirectorInput['draws'] = { picture: { devices: ['pull_back', 'transition'], looks: ['light_leak'] } };
        const scenes: Line[] = [[PLAIN, 'picture'], [`But ${PLAIN}`, 'picture'], [`Then ${PLAIN}`, 'picture'], [`Now ${PLAIN}`, 'picture'], ['Ready to try it?', 'picture']];
        expect(brief(direct(scenes, { draws }))).toEqual(['1:transition:light_leak', '3:transition:light_leak', '4:pull_back:pull_back']);
    });
});
