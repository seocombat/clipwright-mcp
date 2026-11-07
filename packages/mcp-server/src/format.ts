import { FAILED_STATE, isTerminal, RUN_WAIT_MAX_SECONDS, runMoney, VIDEO_URL_CHECK, type Skill } from "@clipwright/core";
import type { WorkflowRunRead, WorkflowLaunchRead } from '@clipwright/core/workflows';
import { ClipwrightApiError } from "@clipwright/sdk";

import { RUN_DISPLAY_HINT, terminalRunMarkdown } from "./run-display.js";

/** The longest a `get_run` holds its answer; the API holds it (#1036). */
export { RUN_WAIT_MAX_SECONDS };
/** When an agent that cannot hold the read reads an unfinished run again. */
export const RUN_RETRY_AFTER_SECONDS = 5;

/** MCP tool response: content blocks. The index signature matches the SDK's */
/** `CallToolResult`; without it the handler does not type-check. */
export interface McpToolResponse {
  [x: string]: unknown;
  content: { type: "text"; text: string }[];
}

/** An API refusal expanded for the agent: `retryable`, `next_action` and numbers */
/** as fields. Local errors rethrow, since they carry no server answer. */
export function formatFailure(error: unknown): McpToolResponse {
  if (!(error instanceof ClipwrightApiError)) throw error;
  return {
    content: [{ type: "text", text: JSON.stringify(error.report()) }],
    isError: true,
  };
}

/** Tool body with API refusals expanded for the agent; shared by every tool so */
/** no tool can forget the `try`. */
export async function withFailureReport(
  body: () => Promise<McpToolResponse>,
): Promise<McpToolResponse> {
  try {
    return await body();
  } catch (error) {
    return formatFailure(error);
  }
}

/** What each run kind delivers and where a succeeded read names it: a picture's run is never "the video". */
export const PENDING_RESULTS: Readonly<Record<Skill, { noun: string; field: string }>> = {
  make_ugc: { noun: "video", field: "video_url" },
  make_faceless: { noun: "video", field: "video_url" },
  revise_long_form: { noun: "video", field: "video_url" },
  generate_image: { noun: "image", field: "generation.url" },
  generate_video: { noun: "clip", field: "generation.url" },
  edit_shot: { noun: "shot candidate", field: "candidate" },
  create_actor: { noun: "actor", field: "created_actor.actor_id" },
};

/** Pure `get_run` formatter. Terminal answers carry both `status` and `state`; */
/** an unknown terminal state falls into IN_PROGRESS by design. */
export function formatGetRun(run: WorkflowRunRead, receipt?: WorkflowLaunchRead['receipt']): McpToolResponse {
  const workflow = { ...(run.workflow === undefined ? {} : { workflow: run.workflow }), ...(receipt ? { receipt } : {}) };
  if (isTerminal(run.state)) {
    // Outcome by core's named constant, not an array index that reordering
    // could silently invert.
    if (run.state === FAILED_STATE) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "FAILED",
              ...workflow,
              run_id: run.run_id,
              state: run.state,
              ...runMoney(run),
              // Warnings are never silent: every get_run branch carries them.
              warnings: run.warnings,
              error: run.error,
              display_markdown: terminalRunMarkdown(run),
              display_hint: RUN_DISPLAY_HINT,
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "SUCCEEDED",
            ...workflow,
            run_id: run.run_id,
            state: run.state,
            ...runMoney(run),
            // A generation or a shot candidate delivers through its own block; the video fields would only mislead.
            ...(run.generation === undefined && run.candidate === undefined ? {
              video_url: run.final_output?.video_url ?? null,
              video_url_check: VIDEO_URL_CHECK,
              duration_seconds: run.final_output?.duration_seconds ?? null,
            } : { url_check: VIDEO_URL_CHECK }),
            ...(run.final_output?.ai_disclosure === undefined ? {} : { ai_disclosure: run.final_output.ai_disclosure }),
            ...(run.final_output?.long_form_billing === undefined ? {} : { long_form_billing: run.final_output.long_form_billing }),
            ...(run.final_output?.parts_billing === undefined ? {} : { parts_billing: run.final_output.parts_billing }),
            ...(run.final_output?.speech_timing_gaps === undefined ? {} : { speech_timing_gaps: run.final_output.speech_timing_gaps }),
            ...(run.generation === undefined ? {} : { generation: run.generation }),
            ...(run.candidate === undefined ? {} : { candidate: run.candidate }),
            // A succeeded create_actor names the actor_id an agent passes to make_ugc (#778).
            ...(run.created_actor === undefined ? {} : { created_actor: run.created_actor }),
            warnings: run.warnings,
            display_markdown: terminalRunMarkdown(run),
            display_hint: RUN_DISPLAY_HINT,
          }),
        },
      ],
    };
  }
  // Non-terminal (or unknown terminal) state: the same imperative format for every run, naming what this run delivers (#1172).
  const pending = PENDING_RESULTS[run.skill as Skill] ?? { noun: "result", field: "a succeeded state" };
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "IN_PROGRESS",
          ...workflow,
          run_id: run.run_id,
          state: run.state,
          ...runMoney(run),
          ...(pending.field === "video_url" ? { video_url: null } : {}),
          warnings: run.warnings,
          next_action:
            `The ${pending.noun} is NOT ready. Call get_run with poll.arguments (run_id=` +
            run.run_id +
            `, wait_seconds=${RUN_WAIT_MAX_SECONDS}): it waits up to ${RUN_WAIT_MAX_SECONDS} s for the run to end. Repeat until state is 'succeeded' or 'failed'. ` +
            `Do NOT tell the user the ${pending.noun} is done until you have ${pending.field}.`,
          poll: { tool: "get_run", arguments: { run_id: run.run_id, wait_seconds: RUN_WAIT_MAX_SECONDS }, retry_after_seconds: RUN_RETRY_AFTER_SECONDS },
        }),
      },
    ],
  };
}
