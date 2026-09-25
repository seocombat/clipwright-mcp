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

export const account = z.object({
  account_id: z.string(),
  balance_credits: z.number().int().nonnegative(),
  debt_credits: z.number().int().nonnegative(),
  holds_credits: z.number().int().nonnegative(),
  /** UNEXPIRED only: an expired grant is not in the balance and does not mislead in the list. */
  grants: z.array(creditGrant).default([]),
});
export type Account = z.infer<typeof account>;
