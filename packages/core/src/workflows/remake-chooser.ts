export type RemakeChoiceSlot = 'insert_transition' | 'full_frame_transition' | 'presenter_cut' | 'live_shot_transition';
export interface RemakeChoice {
    slot: RemakeChoiceSlot;
    options: readonly string[];
    beat: number;
    role?: string;
    cue?: string;
}
export type RemakeChooser = (choice: RemakeChoice) => string | undefined;

export function preferChosen(options: readonly string[], choice: Omit<RemakeChoice, 'options'>, chooser: RemakeChooser | undefined): readonly string[] {
    if (!chooser || options.length < 2) return options;
    const pick = chooser({ ...choice, options });
    return pick !== undefined && options.includes(pick) ? [pick, ...options.filter(option => option !== pick)] : options;
}
