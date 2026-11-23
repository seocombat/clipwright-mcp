import { z } from "zod";

export const maxCreditsField = z.number().int().nonnegative().optional().describe(
  "The most credits this call may cost: the run is never charged more, even when its measured cost comes out higher. When the " +
  "run's reserve is above it, the call is refused with max_credits_exceeded before anything is reserved or started, and nothing is " +
  "charged; at or above it, the call runs as usual.");
