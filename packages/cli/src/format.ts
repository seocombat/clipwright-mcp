import { FAILED_STATE, isTerminal, type RunRead } from "@clipwright/core";
import type { ClipwrightApiError, VoiceCatalogEntry } from "@clipwright/sdk";

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
