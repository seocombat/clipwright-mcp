import { z } from "zod";

/** The `GET /v1/account` body. Three numbers (balance, debt, holds), all about the */
/** client's money. */

/** A credit grant. `source` is a string, not an enum: sources live in the database and grow, */
/** and the read contract must survive a new value in an installed client, like run stages. */
export const creditGrant = z.object({
  amount: z.number().int(),
  source: z.string(),
  /** `null` means the grant never expires. */
  expires_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type CreditGrant = z.infer<typeof creditGrant>;

/** Our reply to a support request or a send_feedback of this account. Only our text and ids: the request's own text */
/** is not repeated. `kind` is a string for the reason `source` is: kinds may grow. */
export const supportReply = z.object({
  /** The `feedback_id` send_feedback returned, or the id of a request sent from the dashboard. */
  request_id: z.string(),
  run_id: z.string().nullable(),
  /** The feedback kind; `null` for a request sent from the dashboard. */
  kind: z.string().nullable(),
  reply: z.string(),
  replied_at: z.string().datetime(),
});
export type SupportReply = z.infer<typeof supportReply>;

export const account = z.object({
  account_id: z.string(),
  balance_credits: z.number().int().nonnegative(),
  debt_credits: z.number().int().nonnegative(),
  holds_credits: z.number().int().nonnegative(),
  /** UNEXPIRED only: an expired grant is not in the balance and does not mislead in the list. */
  grants: z.array(creditGrant).default([]),
  /** Up to 10 replies, newest first. Defaults to empty, so a client older than the server reads the body unchanged. */
  support_replies: z.array(supportReply).default([]),
  /** Free trend searches left this month (#1398) and when they renew; absent from a server older than them. */
  free_trend_searches_left: z.number().int().nonnegative().optional(),
  free_trend_searches_reset_at: z.string().datetime().optional(),
});
export type Account = z.infer<typeof account>;
