// A seam for the remake's own moves (#1121): where the compiler may draw one of several looks, a chooser the server injects may name the one
// that fits the beat. Neutral by design: the compiler only offers looks it already draws and keeps its own order when the chooser is silent.

/** What kind of look is being chosen: a picture's or clip's cut, a card's cut, a cut on the presenter, a live shot's cut. */
export type RemakeChoiceSlot = 'insert_transition' | 'full_frame_transition' | 'presenter_cut' | 'live_shot_transition';
export interface RemakeChoice {
    slot: RemakeChoiceSlot;
    /** Looks the compiler can draw here, in its own order of preference. */
    options: readonly string[];
    beat: number;
    /** The reference beat's role, as the analysis names it. */
    role?: string;
    /** The reference's own device on the beat (its transition or camera move), when the analysis names one. */
    cue?: string;
}
/** Names one of the options, or nothing to keep the compiler's order. */
export type RemakeChooser = (choice: RemakeChoice) => string | undefined;

/** The options with the chooser's pick first; a silent chooser, or a pick outside the options, leaves them as they are. */
export function preferChosen(options: readonly string[], choice: Omit<RemakeChoice, 'options'>, chooser: RemakeChooser | undefined): readonly string[] {
    if (!chooser || options.length < 2) return options;
    const pick = chooser({ ...choice, options });
    return pick !== undefined && options.includes(pick) ? [pick, ...options.filter(option => option !== pick)] : options;
}
