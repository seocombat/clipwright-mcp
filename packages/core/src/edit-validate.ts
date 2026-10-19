import { aspectDistance } from "./aspect.js";
import { isExactFit } from "./canvas-fit.js";
import type { EditDocument, EditShot } from "./edit-document.js";
import { SHOT_OPERATION_MODES, type ShotOperationMode } from "./edit-operations.js";
import type { EditRules, ShotKind } from "./edit-rules.js";
import type { PlannedRunShots, ViewShot } from "./edit-shots.js";
import { MAX_INSERTS } from "./skills.js";

/** In the order issues are reported. */
export const EDIT_ISSUE_CODES = [
  "source_mismatch", "timebase_mismatch", "duration_mismatch", "duplicate_shot_id", "span_out_of_range", "kind_changed",
  "shot_added_not_allowed", "too_short", "too_long", "action_not_allowed", "not_movable", "not_resizable", "overlap",
  "tracks_overlap", "uncovered", "first_shot_fixed", "foreign_source_asset", "kind_asset_mismatch", "candidate_for_other_shot",
  "unknown_asset", "upload_shape_refused", "duplicate_picture_asset", "too_many_generated", "footage_exceeded",
  "presenter_out_of_sync", "presenter_outside_recording",
] as const;
export type EditIssueCode = (typeof EDIT_ISSUE_CODES)[number];

/** What the caller measured about the assets a document names: kept candidates by run id, uploads by upload id. */
export type EditFacts = {
  candidates: Record<string, { shot_id: string; kind: "picture" | "clip"; media_frames: number | null }>;
  uploads: Record<string, { width: number; height: number }>;
};
export type EditIssue = { code: EditIssueCode; shot_id?: string; from_frame?: number; to_frame?: number; message: string };
export type EditSummary = {
  /** Source shots whose start_frame, end_frame or media_offset_frames changed. */
  retimed: string[];
  /** Source shot ids absent from the document. */
  deleted: string[];
  /** Document shot ids that are not source shot ids. */
  added: string[];
  replaced: { shot_id: string; from: "candidate" | "upload" | "source" }[];
  /** Facts only: pricing decides what each entry costs. */
  generated: { shot_id: string; kind: ShotKind; mode: ShotOperationMode }[];
  /** Any list above is non-empty. */
  changed: boolean;
};

type Span = { start: number; end: number };
type Framed = { start_frame: number; end_frame: number };
const spanOf = (shot: Framed): Span => ({ start: shot.start_frame, end: shot.end_frame });
const framesOf = (shot: Framed) => shot.end_frame - shot.start_frame;
const overlapOf = (a: Framed, b: Framed): Span => ({ start: Math.max(a.start_frame, b.start_frame), end: Math.min(a.end_frame, b.end_frame) });
const overlaps = (a: Framed, b: Framed) => a.start_frame < b.end_frame && b.start_frame < a.end_frame;

/** Sorted, merged union; empty and inverted spans drop out. */
function union(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans.filter(s => s.end > s.start).sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}
/** Frames two unions share. */
function sharedFrames(a: Span[], b: Span[]): number {
  let frames = 0;
  for (const x of a) for (const y of b) frames += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  return frames;
}

const sourceShots = (shots: Pick<PlannedRunShots, "tracks">) => new Map(shots.tracks.flatMap(track => track.shots).map(shot => [shot.id, shot]));
const own = <T>(record: Record<string, T>, key: string): T | undefined => Object.hasOwn(record, key) ? record[key] : undefined;
const offsetOf = (shot: EditShot, source: ViewShot | undefined) => shot.media_offset_frames ?? source?.media_offset_frames ?? 0;
const retimed = (shot: EditShot, source: ViewShot) => shot.start_frame !== source.start_frame ||
  shot.end_frame !== source.end_frame || offsetOf(shot, source) !== (source.media_offset_frames ?? 0);

/** Whether a visual shot reaches presenter frames its source span did not; `was` is the presenter shot's source. */
function newlyCovers(shot: Framed, from: Framed | undefined, presenter: Framed, was: (Framed & { track: string }) | undefined): boolean {
  if (!overlaps(shot, presenter)) return false;
  if (!from) return true;
  // A presenter shot the source lacks, or holds on another track, is refused on its own.
  if (!was || was.track !== "presenter") return false;
  if (!overlaps(from, was)) return true;
  const now = overlapOf(shot, presenter), before = overlapOf(from, was);
  return now.start < before.start || now.end > before.end;
}

/** The stretches of each presenter shot that no visual shot covers. */
function visiblePieces(presenter: (Framed & { id: string })[], visual: Framed[]): { id: string; start: number; end: number }[] {
  const covered = union(visual.map(spanOf));
  return presenter.flatMap(shot => {
    const pieces: { id: string; start: number; end: number }[] = [];
    let at = shot.start_frame;
    for (const span of covered) {
      if (span.end <= at || span.start >= shot.end_frame) continue;
      if (span.start > at) pieces.push({ id: shot.id, start: at, end: span.start });
      at = Math.max(at, span.end);
    }
    if (at < shot.end_frame) pieces.push({ id: shot.id, start: at, end: shot.end_frame });
    return pieces;
  });
}

/** The one check that reads the output's shape, and only its ratio. */
function uploadShapeIssue(frame: { width: number; height: number }, upload: { width: number; height: number },
  rule: NonNullable<EditRules["upload_aspect"]>): string | null {
  if ("mode" in rule) {
    return isExactFit(upload, frame, rule.epsilon) ? null
      : `the upload is ${upload.width}×${upload.height}; a picture here must have the output's shape exactly, ${frame.width}×${frame.height}`;
  }
  const distance = aspectDistance(upload.width / upload.height, frame.width / frame.height);
  return distance <= rule.max_distance ? null
    : `the upload is ${upload.width}×${upload.height}, ${Math.round(distance * 100)}% away from the output's shape; ` +
      `at most ${Math.round(rule.max_distance * 100)}% is accepted`;
}

/** Presenter frames no visual shot covers. */
export function presenterVisibleFrames(shots: Pick<PlannedRunShots, "tracks">): number {
  const all = shots.tracks.flatMap(track => track.shots);
  const presenter = union(all.filter(shot => shot.track === "presenter").map(spanOf));
  const visual = union(all.filter(shot => shot.track === "visual").map(spanOf));
  return presenter.reduce((sum, span) => sum + span.end - span.start, 0) - sharedFrames(presenter, visual);
}

export function diffEditDocument(document: EditDocument, shots: PlannedRunShots): EditSummary {
  const source = sourceShots(shots);
  const present = new Set(document.shots.map(shot => shot.id));
  const summary: EditSummary = { retimed: [], deleted: [...source.keys()].filter(id => !present.has(id)), added: [],
    replaced: [], generated: [], changed: false };
  for (const shot of document.shots) {
    const from = source.get(shot.id);
    if (!from) summary.added.push(shot.id);
    else if (retimed(shot, from)) summary.retimed.push(shot.id);
    if (shot.asset.from === "candidate" || shot.asset.from === "upload") summary.replaced.push({ shot_id: shot.id, from: shot.asset.from });
    if (shot.asset.from === "source" && shot.asset.shot_id !== shot.id) summary.replaced.push({ shot_id: shot.id, from: "source" });
    if (shot.asset.from === "generate") summary.generated.push({ shot_id: shot.id, kind: shot.kind, mode: shot.asset.operation.mode });
  }
  summary.changed = [summary.retimed, summary.deleted, summary.added, summary.replaced, summary.generated].some(list => list.length > 0);
  return summary;
}

/** Checks a document against the view it edits. Every issue is collected; the rules come from the view. */
export function validateEditDocument(document: EditDocument, shots: PlannedRunShots, facts: EditFacts):
  { ok: true; summary: EditSummary } | { ok: false; issues: EditIssue[] } {
  const issues: EditIssue[] = [];
  const add = (code: EditIssueCode, message: string, where: Pick<EditIssue, "shot_id" | "from_frame" | "to_frame"> = {}) => {
    issues.push({ code, ...where, message });
  };
  const rules = shots.rules, duration = shots.duration_frames;
  const source = sourceShots(shots);
  const laid = document.shots.filter(shot => shot.end_frame > shot.start_frame);
  const presenterShots = laid.filter(shot => shot.track === "presenter");
  const visualShots = laid.filter(shot => shot.track === "visual");
  const presenterTime = union(presenterShots.map(spanOf));

  if (document.source_run_id !== shots.run_id) add("source_mismatch", `the document edits ${document.source_run_id}, the run is ${shots.run_id}`);
  if (document.timebase.fps !== shots.timebase.fps) add("timebase_mismatch", `the run is ${shots.timebase.fps} fps, the document says ${document.timebase.fps}`);
  if (document.duration_frames !== duration) add("duration_mismatch", `the run is ${duration} frames long, the document says ${document.duration_frames}`);

  const ids = new Set<string>(), repeated = new Set<string>();
  for (const shot of document.shots) (ids.has(shot.id) ? repeated : ids).add(shot.id);
  for (const id of repeated) add("duplicate_shot_id", "two shots share this id", { shot_id: id });

  const sourcePresenter = [...source.values()].filter(shot => shot.track === "presenter");
  const overSource = (shot: ViewShot) => shot.track === "visual" && sourcePresenter.some(presenter => overlaps(presenter, shot));
  const overNow = (shot: EditShot) => shot.track === "visual" && presenterShots.some(presenter => overlaps(presenter, shot));
  // Shots the source already shows over the presenter count first, so a chain of revisions keeps the cap.
  let overPresenter = document.shots.filter(shot => { const from = source.get(shot.id); return from && overSource(from) && overNow(shot); }).length;
  // Id stems of the source's own tiling: a new shot named like one would read as that shot in a later record.
  const stem = (id: string) => id.replace(/\d+$/, "");
  const tiling = new Set([...source.values()].filter(shot => shot.track === "presenter" || !overSource(shot)).map(shot => stem(shot.id)));

  const pictureAssets = new Set<string>();
  let generated = 0;
  for (const shot of document.shots) {
    const from = source.get(shot.id), at = { shot_id: shot.id }, frames = framesOf(shot), asset = shot.asset;
    const rule = rules.kinds[shot.kind];
    const denied: string[] = [], mismatched: string[] = [];

    if (shot.end_frame <= shot.start_frame || shot.end_frame > duration) add("span_out_of_range", `a shot must end after it starts and by frame ${duration}`, at);
    if (from && (shot.kind !== from.kind || shot.track !== from.track)) add("kind_changed", `this shot is a ${from.kind} on the ${from.track} track`, at);
    if (!from && (rules.add_visual === "never" || shot.track !== "visual" ||
        !presenterTime.some(span => span.start <= shot.start_frame && shot.end_frame <= span.end))) {
      add("shot_added_not_allowed", rules.add_visual === "never" ? "this timeline takes no new shots"
        : "a new shot must be a visual shot lying wholly inside presenter time", at);
    } else if (!from && /\d$/.test(shot.id) && tiling.has(stem(shot.id))) {
      add("shot_added_not_allowed", `a new shot may not take an id shaped like the run's own shots, as ${shot.id} does`, at);
    } else if (overNow(shot) && !(from && overSource(from)) && ++overPresenter > MAX_INSERTS) {
      add("shot_added_not_allowed", `at most ${MAX_INSERTS} shots lie over the presenter`, at);
    }
    if (!rule) add("too_short", "this kind is not allowed here", at);
    else if (frames < rule.min_frames) add("too_short", `a ${shot.kind} lasts at least ${rule.min_frames} frames, this one ${frames}`, at);
    else if (frames > rule.max_frames) add("too_long", `a ${shot.kind} lasts at most ${rule.max_frames} frames, this one ${frames}`, at);
    else if (rules.cover_min_frames !== null && frames < rules.cover_min_frames && shot.track === "visual" && (!from || retimed(shot, from)) &&
      presenterShots.some(presenter => overlaps(presenter, shot))) {
      add("too_short", `a shot over the presenter lasts at least ${rules.cover_min_frames} frames, this one ${frames}`, at);
    }

    if (from) {
      const offered = new Set<string>(from.operations);
      if (asset.from === "generate" && !offered.has(asset.operation.mode)) denied.push(`${asset.operation.mode} is not offered for this shot`);
      if (asset.from === "upload" && !offered.has("upload")) denied.push("this shot takes no upload");
      if (asset.from === "candidate" && !SHOT_OPERATION_MODES.some(mode => offered.has(mode))) denied.push("this shot takes no generated candidate");
      if (retimed(shot, from) && !offered.has("retime")) denied.push("this shot may not be retimed");
      if (shot.start_frame !== from.start_frame && rule && !rule.movable) add("not_movable", `a ${shot.kind} keeps its start frame, ${from.start_frame}`, at);
      if (frames !== framesOf(from) && rule && !rule.resizable) add("not_resizable", `a ${shot.kind} keeps its length, ${framesOf(from)} frames`, at);
    }
    if (shot.track === "visual") {
      const uncoverable = presenterShots.find(presenter => newlyCovers(shot, from, presenter, source.get(presenter.id)) &&
        !source.get(presenter.id)?.operations.includes("cover"));
      if (uncoverable) denied.push(`presenter shot ${uncoverable.id} may not be covered`);
    }
    if (denied.length) add("action_not_allowed", denied.join("; "), at);

    let footage: number | null = null;
    if (asset.from === "source") {
      const named = source.get(asset.shot_id);
      if (!named) add("unknown_asset", `the run has no shot ${asset.shot_id}`, at);
      else if (asset.shot_id !== shot.id && !rules.reuse_source_asset) add("foreign_source_asset", `shot ${asset.shot_id}'s media may not be reused here`, at);
      else if (asset.shot_id !== shot.id && (named.track !== "visual" || named.kind !== shot.kind)) {
        mismatched.push(`shot ${asset.shot_id} holds a ${named.kind} on the ${named.track} track, this shot a ${shot.kind}`);
      }
      footage = named?.media_frames ?? null;
    } else if (asset.from === "candidate") {
      const fact = own(facts.candidates, asset.run_id);
      if (!fact) add("unknown_asset", `${asset.run_id} is not a candidate of this run`, at);
      else {
        if (fact.shot_id !== shot.id) add("candidate_for_other_shot", `${asset.run_id} was made for shot ${fact.shot_id}`, at);
        if (fact.kind !== shot.kind) mismatched.push(`the candidate is a ${fact.kind}, the shot a ${shot.kind}`);
        footage = fact.media_frames;
      }
    } else if (asset.from === "upload") {
      const fact = own(facts.uploads, asset.upload_id);
      if (!fact) add("unknown_asset", `${asset.upload_id} is not an upload of this account`, at);
      const refusal = fact && rules.upload_aspect ? uploadShapeIssue(shots.frame, fact, rules.upload_aspect) : null;
      if (refusal) add("upload_shape_refused", refusal, at);
      if (shot.kind !== "picture") mismatched.push("only a picture takes an upload");
    } else {
      generated++;
      if (asset.operation.mode === "animate" && shot.kind !== "clip") mismatched.push("only a clip is animated");
      if (!from && asset.operation.mode !== "new_picture") mismatched.push(`a new shot has nothing to ${asset.operation.mode}`);
    }
    if ((shot.track === "presenter" || shot.kind === "presenter") && asset.from !== "source") mismatched.push("a presenter shot keeps its own recording");
    if (mismatched.length) add("kind_asset_mismatch", mismatched.join("; "), at);

    if (rules.picture_assets_unique && shot.kind === "picture" && asset.from !== "generate") {
      const key = `${asset.from}:${asset.from === "source" ? asset.shot_id : asset.from === "candidate" ? asset.run_id : asset.upload_id}`;
      if (pictureAssets.has(key)) add("duplicate_picture_asset", "another picture already shows this image", at);
      pictureAssets.add(key);
    }

    const offset = offsetOf(shot, from);
    if (shot.kind === "clip" && footage !== null && offset + frames > footage) {
      add("footage_exceeded", `the clip has ${footage} frames of footage, the shot asks for ${offset + frames}`, at);
    }
    if (shot.track === "presenter" && from) {
      const synced = (from.media_offset_frames ?? 0) + (shot.start_frame - from.start_frame);
      if (offset !== synced) add("presenter_out_of_sync", `at this start the recording plays from frame ${synced}, not ${offset}`, at);
      if (from.media_frames !== null && offset + frames > from.media_frames) {
        add("presenter_outside_recording", `the recording has ${from.media_frames} frames, the shot asks for ${offset + frames}`, at);
      }
    }
  }

  for (const [id, shot] of source) {
    if (!ids.has(id) && !shot.operations.includes("delete")) add("action_not_allowed", "this shot may not be deleted", { shot_id: id });
  }

  for (const track of [visualShots, presenterShots]) {
    let reach: EditShot | undefined;
    for (const shot of [...track].sort((a, b) => a.start_frame - b.start_frame)) {
      if (reach && shot.start_frame < reach.end_frame) {
        const shared = overlapOf(reach, shot);
        add("overlap", `overlaps shot ${reach.id}`, { shot_id: shot.id, from_frame: shared.start, to_frame: shared.end });
      }
      if (!reach || shot.end_frame > reach.end_frame) reach = shot;
    }
  }
  // The presenter shows for at least the cover minimum or not at all (Q23); a stretch the source already shows stays.
  if (rules.cover_min_frames !== null) {
    const all = [...source.values()];
    const shown = new Set(visiblePieces(all.filter(shot => shot.track === "presenter"), all.filter(shot => shot.track === "visual"))
      .map(piece => `${piece.start}:${piece.end}`));
    for (const piece of visiblePieces(presenterShots, visualShots)) {
      if (piece.end - piece.start < rules.cover_min_frames && !shown.has(`${piece.start}:${piece.end}`)) {
        add("too_short", `presenter shot ${piece.id} shows for ${piece.end - piece.start} frames between pictures; ` +
          `it shows for at least ${rules.cover_min_frames} or not at all`, { shot_id: piece.id, from_frame: piece.start, to_frame: piece.end });
      }
    }
  }
  if (!rules.visual_covers_presenter) {
    for (const visual of visualShots) for (const presenter of presenterShots.filter(shot => overlaps(visual, shot))) {
      const shared = overlapOf(visual, presenter);
      add("tracks_overlap", `covers presenter shot ${presenter.id}`, { shot_id: visual.id, from_frame: shared.start, to_frame: shared.end });
    }
  }

  const covering = rules.output_coverage === "visual" ? visualShots : [...visualShots, ...presenterShots];
  let covered = 0;
  for (const span of [...union(covering.map(spanOf)), { start: duration, end: duration }]) {
    if (span.start > covered && covered < duration) {
      add("uncovered", "no shot is on screen here", { from_frame: covered, to_frame: Math.min(span.start, duration) });
    }
    covered = Math.max(covered, span.end);
  }

  if (rules.first_visual_kind !== null) {
    const earliest = <T extends Framed & { track: string }>(list: T[]) => list.filter(shot => shot.track === "visual")
      .reduce<T | undefined>((first, shot) => !first || shot.start_frame < first.start_frame ? shot : first, undefined);
    const was = earliest([...source.values()]), now = earliest(document.shots), subject = was ?? now;
    if (subject && (now?.id !== was?.id || now?.kind !== rules.first_visual_kind)) {
      add("first_shot_fixed", `the video opens with its own ${rules.first_visual_kind}`, { shot_id: subject.id });
    }
  }
  if (generated > rules.max_generated_per_revision) {
    add("too_many_generated", `a revision generates at most ${rules.max_generated_per_revision} shots, this one asks for ${generated}`);
  }

  if (!issues.length) return { ok: true, summary: diffEditDocument(document, shots) };
  const order = (issue: EditIssue) => EDIT_ISSUE_CODES.indexOf(issue.code);
  const idOf = (issue: EditIssue) => issue.shot_id ?? "";
  issues.sort((a, b) => order(a) - order(b) || (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0));
  return { ok: false, issues };
}
