import { z } from "zod";

export const creditGrant = z.object({
  amount: z.number().int(),
  source: z.string(),
  expires_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type CreditGrant = z.infer<typeof creditGrant>;

export const supportReply = z.object({
  request_id: z.string(),
  run_id: z.string().nullable(),
  kind: z.string().nullable(),
  reply: z.string(),
  replied_at: z.string().datetime(),
});
export type SupportReply = z.infer<typeof supportReply>;

export const accountPlan = z.object({
  id: z.string(),
  interval: z.enum(["month", "year"]),
  renews_at: z.string().datetime().nullable(),
  cancel_at_period_end: z.boolean(),
});
export type AccountPlan = z.infer<typeof accountPlan>;

export const account = z.object({
  account_id: z.string(),
  balance_credits: z.number().int().nonnegative(),
  plan_credits: z.number().int().nonnegative().optional(),
  pack_credits: z.number().int().nonnegative().optional(),
  plan: accountPlan.nullable().optional(),
  debt_credits: z.number().int().nonnegative(),
  holds_credits: z.number().int().nonnegative(),
  grants: z.array(creditGrant).default([]),
  support_replies: z.array(supportReply).default([]),
  free_trend_searches_left: z.number().int().nonnegative().optional(),
  free_trend_searches_reset_at: z.string().datetime().optional(),
  warnings: z.array(z.string()).optional(),
});
export type Account = z.infer<typeof account>;
