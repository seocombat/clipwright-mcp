import { FAILED_STATE, isTerminal, type RunRead } from "@clipwright/core";
import type { ClipwrightApiError, RunEditRead, RunShotsRead, VoiceCatalogEntry } from "@clipwright/sdk";

/** Pure formatter for `clipwright runs <id>`. Terminality comes from core, so an */
/** unknown server stage (e.g. `"publishing"`) prints as is and does not crash. */
export function formatRun(run: RunRead): string {
  const lines: string[] = [];
  if (isTerminal(run.state)) {
    const outcome = run.state === FAILED_STATE ? "FAILED" : "SUCCEEDED";
    lines.push(`run ${run.run_id}: ${outcome} (state: ${run.state})`);
  } else {
    lines.push(`run ${run.run_id}: state: ${run.state}`);
  }
  if (run.final_output?.video_url) {
    lines.push(`video_url: ${run.final_output.video_url}`);
    lines.push(`ai_disclosure: ${run.final_output.ai_disclosure}`);
  }
  if (run.warnings.length > 0) {
    lines.push(`warnings: ${run.warnings.join(", ")}`);
  }
  if (run.error) {
    lines.push(`error: ${run.error}`);
  }
  return lines.join("\n");
}

// A shot's description can be a paragraph; its line shows the start.
const SHOT_DESCRIPTION_WIDTH = 80;

/** Pure formatter for `clipwright shots <run>`. Every name is printed as the server sent it, */
/** and a run with no plan is an answer like any other, not an error. */
export function formatRunShots(view: RunShotsRead): string {
  const { editable } = view;
  // The date is how long the media are stored, which is not a promise of how long an edit is taken.
  const kept = editable.media_available_until === null ? "" : `; media kept until ${editable.media_available_until}`;
  // A reason is printed whenever the server gave one, for a run that can be edited too.
  const editableLine =
    `editable: ${editable.state === "editable" ? "yes" : `no (${editable.state})`}` +
    `${editable.reason === null ? "" : `: ${editable.reason}`}${kept}`;
  if (!view.planned) {
    return [`run ${view.run_id}: line ${view.line}, no shots to show`, editableLine].join("\n");
  }

  const { fps } = view.timebase;
  const seconds = (frames: number): string => (frames / fps).toFixed(2);
  const count = view.tracks.reduce((sum, track) => sum + track.shots.length, 0);
  const lines = [
    `run ${view.run_id}: line ${view.line}, ${count} ${count === 1 ? "shot" : "shots"}, ` +
      `${view.duration_frames} frames at ${fps} fps (${seconds(view.duration_frames)} s), ` +
      `${view.frame.width}x${view.frame.height} (${view.frame.aspect_ratio})`,
    editableLine,
    `paid edits: ${view.paid_edits.enabled ? "yes" : "no"}` +
      (view.paid_edits.reason === null ? "" : ` (${view.paid_edits.reason})`),
  ];
  if (view.withheld.length > 0) lines.push(`withheld: ${view.withheld.join(", ")}`);
  // A null field is named, never skipped: withheld by the server, or simply not there.
  const absent = (field: string): string => (view.withheld.includes(field) ? "withheld" : "none");
  for (const track of view.tracks) {
    lines.push(`track ${track.id}:`);
    for (const shot of track.shots) {
      const description =
        shot.description === null
          ? `(description: ${absent("description")})`
          : shot.description.length > SHOT_DESCRIPTION_WIDTH
            ? `${shot.description.slice(0, SHOT_DESCRIPTION_WIDTH - 1)}…`
            : shot.description;
      lines.push(
        `  ${shot.id}  frames ${shot.start_frame}-${shot.end_frame} ` +
          `(${seconds(shot.start_frame)}-${seconds(shot.end_frame)} s)  ${shot.kind}  ${description}`,
      );
      lines.push(`    preview: ${shot.preview_url ?? absent("source_media")}`);
    }
  }
  return lines.join("\n");
}

/** What `edit-show` and `edit-save` say about a draft beside its JSON: one line, then one per issue. */
export function formatDraftNotes(draft: RunEditRead): string[] {
  const head =
    draft.version === 0
      ? `draft of ${draft.run_id}: version 0, nothing is stored; this document changes nothing`
      : `draft of ${draft.run_id}: version ${draft.version}` +
        (draft.updated_at === null ? "" : `, saved ${draft.updated_at}`);
  return [
    head,
    ...draft.issues.map((issue) => {
      const shot = issue.shot_id === undefined ? "" : ` shot ${issue.shot_id}`;
      const span =
        issue.from_frame === undefined || issue.to_frame === undefined
          ? ""
          : ` frames ${issue.from_frame}-${issue.to_frame}`;
      return `issue: ${issue.code}${shot}${span}: ${issue.message}`;
    }),
  ];
}

/** An API refusal for a human, built from the same `report()` the agent sees so */
/** CLI and MCP cannot drift. No stack trace: it answers nothing about what to do. */
export function formatApiError(error: ClipwrightApiError): string {
  const report = error.report();
  const lines = [`error: ${report.message}`, `code: ${report.code} (HTTP ${error.status})`];
  if (report.next_action) lines.push(report.next_action);
  return lines.join("\n");
}

/** A schema refusal for a human instead of a raw `ZodError` stack. Matched by */
/** name, not `instanceof`: two zod copies in one install would break `instanceof`. */
export function formatSchemaError(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== "ZodError") return undefined;
  const issues = (error as { issues?: { path?: unknown[]; message?: string }[] }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;

  const lines = issues.map((issue) => {
    const where = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "input";
    return `  ${where}: ${issue.message ?? "invalid"}`;
  });
  return ["error: the request was rejected before it was sent", ...lines].join("\n");
}

// A catalog description can be a paragraph; the list line shows its start.
const VOICE_DESCRIPTION_WIDTH = 100;

/** Pure formatter for `clipwright voices`. */
export function formatVoices(voices: VoiceCatalogEntry[]): string {
  return voices
    .map((v) => {
      // A model's own voice has no language: its line names the model that naming it selects.
      // A voice of another skill than `make` says so: `make` refuses it.
      const skill = v.skill === undefined || v.skill === "make_ugc" ? undefined : `for ${v.skill}`;
      const labels = [v.language ?? (v.kind === "model_voice" ? v.model : undefined), v.gender, v.age, v.use_case, skill]
        .filter(Boolean)
        .join(", ");
      const description =
        v.description.length > VOICE_DESCRIPTION_WIDTH
          ? `${v.description.slice(0, VOICE_DESCRIPTION_WIDTH - 1)}…`
          : v.description;
      const head = labels ? `${v.name} (${labels}): ${description}` : `${v.name}: ${description}`;
      return v.preview_url === undefined ? head : `${head}\n  sample: ${v.preview_url}`;
    })
    .join("\n");
}
