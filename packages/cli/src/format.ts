import { FAILED_STATE, isTerminal } from "@clipwright/core";
import type { WorkflowRunRead } from '@clipwright/core/workflows';
import type { ClipwrightApiError, RunEditRead, RunShotsRead, VoiceCatalogEntry } from "@clipwright/sdk";

export function formatRun(run: WorkflowRunRead): string {
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
    if (run.final_output.post_text) lines.push("post_text:", ...run.final_output.post_text.split("\n").map(line => `  ${line}`));
  }
  if (run.warnings.length > 0) {
    lines.push(`warnings: ${run.warnings.join(", ")}`);
  }
  if (run.error) {
    lines.push(`error: ${run.error}`);
  }
  if (run.workflow !== undefined) lines.push(`workflow: ${JSON.stringify(run.workflow)}`);
  return lines.join("\n");
}

const SHOT_DESCRIPTION_WIDTH = 80;

export function formatRunShots(view: RunShotsRead): string {
  const { editable } = view;
  const kept = editable.media_available_until === null ? "" : `; media kept until ${editable.media_available_until}`;
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

export function formatApiError(error: ClipwrightApiError): string {
  const report = error.report();
  const lines = [`error: ${report.message}`, `code: ${report.code} (HTTP ${error.status})`];
  if (report.warnings !== undefined) {
    for (const issue of report.issues ?? []) if ('kind' in issue) lines.push(`issue: ${issue.kind} at ${issue.path || 'input'}: ${issue.message}`);
    for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  }
  if (report.next_action) lines.push(report.next_action);
  return lines.join("\n");
}

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

const VOICE_DESCRIPTION_WIDTH = 100;

export function formatVoices(voices: VoiceCatalogEntry[]): string {
  return voices
    .map((v) => {
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
