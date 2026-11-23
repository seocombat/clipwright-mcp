import { FAILED_STATE, isTerminal, RUN_WAIT_MAX_SECONDS, runMoney, VIDEO_URL_CHECK, type Skill } from "@clipwright/core";
import type { WorkflowRunRead, WorkflowLaunchRead } from '@clipwright/core/workflows';
import { ClipwrightApiError } from "@clipwright/sdk";

import { RUN_DISPLAY_HINT, terminalRunMarkdown } from "./run-display.js";

export { RUN_WAIT_MAX_SECONDS };
export const RUN_RETRY_AFTER_SECONDS = 5;

export interface McpToolResponse {
  [x: string]: unknown;
  content: { type: "text"; text: string }[];
}

export function formatFailure(error: unknown): McpToolResponse {
  if (!(error instanceof ClipwrightApiError)) throw error;
  return {
    content: [{ type: "text", text: JSON.stringify(error.report()) }],
    isError: true,
  };
}

export async function withFailureReport(
  body: () => Promise<McpToolResponse>,
): Promise<McpToolResponse> {
  try {
    return await body();
  } catch (error) {
    return formatFailure(error);
  }
}

export function failedRepeatNote(response: McpToolResponse, attempt: number | undefined): McpToolResponse {
  const [block, ...rest] = response.content;
  if (!block) return response;
  const body = JSON.parse(block.text) as Record<string, unknown>;
  const repeat = `These arguments already started this run, and it failed. To make the video again, call make_ugc with the same arguments and ` +
    `attempt ${(attempt ?? 1) + 1}: that starts a new run, charged as its quote says.`;
  const display = typeof body.display_markdown === "string" ? { display_markdown: `${body.display_markdown}\n\n${repeat}` } : {};
  return { ...response, content: [{ type: "text", text: JSON.stringify({ ...body, repeat, ...display }) }, ...rest] };
}

export const PENDING_RESULTS: Readonly<Record<Skill, { noun: string; field: string }>> = {
  make_ugc: { noun: "video", field: "video_url" },
  make_faceless: { noun: "video", field: "video_url" },
  revise_long_form: { noun: "video", field: "video_url" },
  generate_image: { noun: "image", field: "generation.url" },
  generate_video: { noun: "clip", field: "generation.url" },
  edit_shot: { noun: "shot candidate", field: "candidate" },
  create_actor: { noun: "actor", field: "created_actor.actor_id" },
};

export function formatGetRun(run: WorkflowRunRead, receipt?: WorkflowLaunchRead['receipt']): McpToolResponse {
  const workflow = { ...(run.workflow === undefined ? {} : { workflow: run.workflow }), ...(receipt ? { receipt } : {}) };
  if (isTerminal(run.state)) {
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
            ...(run.generation === undefined && run.candidate === undefined ? {
              video_url: run.final_output?.video_url ?? null,
              video_url_check: VIDEO_URL_CHECK,
              duration_seconds: run.final_output?.duration_seconds ?? null,
            } : { url_check: VIDEO_URL_CHECK }),
            ...(run.video === undefined ? {} : { video: run.video }),
            ...(run.final_output?.ai_disclosure === undefined ? {} : { ai_disclosure: run.final_output.ai_disclosure }),
            ...(run.final_output?.long_form_billing === undefined ? {} : { long_form_billing: run.final_output.long_form_billing }),
            ...(run.final_output?.parts_billing === undefined ? {} : { parts_billing: run.final_output.parts_billing }),
            ...(run.final_output?.speech_timing_gaps === undefined ? {} : { speech_timing_gaps: run.final_output.speech_timing_gaps }),
            ...(run.final_output?.post_text === undefined ? {} : { post_text: run.final_output.post_text }),
            ...(run.generation === undefined ? {} : { generation: run.generation }),
            ...(run.candidate === undefined ? {} : { candidate: run.candidate }),
            ...(run.created_actor === undefined ? {} : { created_actor: run.created_actor }),
            warnings: run.warnings,
            display_markdown: terminalRunMarkdown(run),
            display_hint: RUN_DISPLAY_HINT,
          }),
        },
      ],
    };
  }
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
