import { FAILED_STATE, isTerminal, runMoney, VIDEO_URL_CHECK, type RunRead } from "@clipwright/core";
import { ClipwrightApiError } from "@clipwright/sdk";

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

/** Pure `get_run` formatter. Terminal answers carry both `status` and `state`; */
/** an unknown terminal state falls into IN_PROGRESS by design. */
export function formatGetRun(run: RunRead): McpToolResponse {
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
              run_id: run.run_id,
              state: run.state,
              ...runMoney(run),
              // Warnings are never silent: every get_run branch carries them.
              warnings: run.warnings,
              error: run.error,
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
            run_id: run.run_id,
            state: run.state,
            ...runMoney(run),
            video_url: run.final_output?.video_url ?? null,
            video_url_check: VIDEO_URL_CHECK,
            duration_seconds: run.final_output?.duration_seconds ?? null,
            ...(run.final_output?.long_form_billing === undefined ? {} : { long_form_billing: run.final_output.long_form_billing }),
            ...(run.final_output?.speech_timing_gaps === undefined ? {} : { speech_timing_gaps: run.final_output.speech_timing_gaps }),
            warnings: run.warnings,
          }),
        },
      ],
    };
  }
  // Non-terminal (or unknown terminal) state: the same imperative format as make_ugc.
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "IN_PROGRESS",
          run_id: run.run_id,
          state: run.state,
          ...runMoney(run),
          video_url: null,
          warnings: run.warnings,
          next_action:
            "Video is NOT ready. Call get_run with run_id=" +
            run.run_id +
            " again in ~5 seconds. Repeat until state is 'succeeded' or 'failed'. Do NOT tell " +
            "the user the video is done until you have a video_url.",
        }),
      },
    ],
  };
}
