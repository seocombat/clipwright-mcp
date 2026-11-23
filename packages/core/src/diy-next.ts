import { z } from "zod";


export const diyNext = z.strictObject({
  action: z.string().describe("The tool to call next"),
  method: z.enum(["GET", "POST"]),
  path: z.string().describe("Its REST route"),
  body: z.record(z.string(), z.unknown()).describe("The tool's arguments, ready to send"),
  add: z.array(z.string()).describe("The fields you write or change before the call; empty when the body is complete"),
  note: z.string(),
});
export type DiyNext = z.infer<typeof diyNext>;

export const diyBlocked = z.strictObject({
  reason: z.string().describe("Why the ad cannot move on yet"),
  unblock: z.string().describe("What unblocks it"),
});
export type DiyBlocked = z.infer<typeof diyBlocked>;
