import { z } from "zod";

import { runId } from "./runs.js";

/** Feedback from an agent (#941): a missing capability or a confusing answer, filed instead of rephrasing and giving up. */
/** Free; it lands in the same queue a person's support request does, under the key's account. */

export const FEEDBACK_PATH = "/v1/feedback";

export const FEEDBACK_KINDS = ["missing_capability", "confusing", "wrong_result", "slow"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_TEXT_MAX_CHARS = 2000;
/** New feedback per account per hour; a resend of the same feedback answers the first one and is not counted. */
export const FEEDBACK_PER_HOUR = 20;
export const FEEDBACK_WINDOW_SECONDS = 3600;
/** How long the same kind, text and run answer the feedback already filed instead of filing it again. */
export const FEEDBACK_REPLAY_WINDOW_SECONDS = 24 * 3600;

export const feedbackRequest = z.strictObject({
  kind: z.enum(FEEDBACK_KINDS).describe(
    "missing_capability: no tool does what the user asked; confusing: an answer or description was unclear; " +
    "wrong_result: a result is not what was asked; slow: something took far longer than it said."),
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX_CHARS)
    .describe("What the user wanted, what you tried and what came back, in plain words."),
  run_id: runId.optional().describe("The run it is about, if any."),
});
export type FeedbackRequest = z.infer<typeof feedbackRequest>;

export const feedbackResponse = z.object({
  feedback_id: z.uuid(),
  received: z.literal(true),
});
export type FeedbackResponse = z.infer<typeof feedbackResponse>;

export const SEND_FEEDBACK_DESCRIPTION =
  "Tell Clipwright what is missing or wrong. Call it when no tool does what the user asked (kind missing_capability), " +
  "or when an answer was confusing (confusing), wrong (wrong_result) or far too slow (slow), instead of rephrasing the " +
  "request and giving up. Say what the user wanted, what you tried and what came back; pass run_id when it is about a run. " +
  "We read every one. Free, spends nothing. Sending the same kind, text and run again within 24 hours answers the same " +
  `feedback_id. ${FEEDBACK_PER_HOUR} per hour per account.`;
