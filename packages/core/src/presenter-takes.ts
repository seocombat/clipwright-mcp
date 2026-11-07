import { WORDS_PER_SECOND_MIN } from "./pacing.js";
import { countActorShots, coverWordOf, planSemanticInserts, type SemanticInsertInstruction } from "./semantic-inserts.js";
import { isNarratedUgcInput, MAX_PRESENTER_TAKES, type MakeUgcInput } from "./skills.js";
import { templateMediaOf } from "./templates/index.js";
import { presenterTakeCount } from "./ugc-interview.js";

/** The most items one labelled video names as its sources (#1192). */
export const UGC_MARKED_COMPONENTS_MAX = 32;
/** A live shot's take lasts at most 14 s; at the slowest pace that many words. */
const SHOT_PIECE_WORDS = 14 * WORDS_PER_SECOND_MIN;

type Anchored = { id: string; anchor: { startWord: number; endWord: number } | { quote: string; occurrence?: number | undefined };
  cover_words?: number | undefined };
const instruction = (item: Anchored, mediaId: string): SemanticInsertInstruction => ({ insertId: item.id, mediaId,
  anchor: "startWord" in item.anchor ? item.anchor : { quote: item.anchor.quote, ...(item.anchor.occurrence === undefined ? {} : { occurrence: item.anchor.occurrence }) },
  ...(item.cover_words === undefined ? {} : { coverWords: item.cover_words }) });

const shotPieces = (anchor: { startWord: number; endWord: number; coverWord?: number | undefined }) =>
  Math.max(1, Math.ceil((coverWordOf(anchor) - anchor.startWord) / SHOT_PIECE_WORDS));

/** The presenter takes a narrated run renders at most: each stretch between inserts and live shots, each shot in its pieces, */
/** and a call's listener with the take its hold splits. A shot's cast is in the shot's own take. */
function narratedTakes(script: string, input: MakeUgcInput): number {
  const inserts = (input.inserts ?? []).map(insert => instruction(insert, "insert"));
  const shots = (input.shots ?? []).map(shot => instruction(shot, "shot"));
  const call = input.call === undefined ? 0 : 2;
  if (input.interview !== undefined || input.presenter_gaze !== undefined) {
    // The gaze's own takes, then each shot in its pieces and the two pieces it may split off a take around it.
    const pieces = shots.length ? planSemanticInserts(script, shots).inserts.reduce((sum, anchor) => sum + shotPieces(anchor) + 2, 0) : 0;
    return presenterTakeCount(script, input) + pieces + call;
  }
  let plan: ReturnType<typeof planSemanticInserts>;
  try { plan = planSemanticInserts(script, [...inserts, ...shots]); }
  catch {
    const alone = shots.length ? planSemanticInserts(script, shots).inserts.reduce((sum, anchor) => sum + shotPieces(anchor) + 2, 0) : 0;
    return countActorShots(planSemanticInserts(script, inserts)) + alone + call;
  }
  const pieces = plan.inserts.filter(anchor => anchor.mediaId === "shot").reduce((sum, anchor) => sum + shotPieces(anchor), 0);
  return countActorShots(plan) + pieces + call;
}

/** What a make_ugc run's labelled video names (#1192): your pictures and videos it shows, and the presenter takes it may render. */
export function ugcMarkedComponents(input: MakeUgcInput): { originals: number; takes: number } {
  const originals = (input.image ? 1 : 0) + (input.segments ?? []).filter(segment => segment.kind === "media").length + (input.inserts ?? []).length +
    (input.overlays ?? []).length + (input.layout_windows ?? []).length + templateMediaOf(input.templates).length;
  if (input.segments) return { originals, takes: input.segments.filter(segment => segment.kind === "actor").length };
  if (!isNarratedUgcInput(input) || typeof input.script !== "string") return { originals, takes: 1 };
  return { originals, takes: narratedTakes(input.script, input) };
}

/** The refusal of a narrated run with more takes than a video renders or, labelled, more than it names beside your pictures; null when it fits. */
export function ugcMarkedComponentsRefusal(input: MakeUgcInput, marked: boolean): string | null {
  const { originals, takes } = ugcMarkedComponents(input);
  if (takes > MAX_PRESENTER_TAKES) {
    return `this video makes up to ${takes} presenter takes, more than the ${MAX_PRESENTER_TAKES} one video renders; ` +
      "a live shot in the middle of speech makes up to three: use fewer live shots or inserts";
  }
  if (!marked || originals + 2 * takes <= UGC_MARKED_COMPONENTS_MAX) return null;
  const room = Math.max(0, UGC_MARKED_COMPONENTS_MAX - 2 * takes);
  return `this video has ${originals} of your pictures and videos and up to ${takes} presenter takes, more than one video holds: ` +
    `with ${takes} takes it holds at most ${room} pictures and videos; use fewer inserts, overlays, windows, template pictures or live shots`;
}
