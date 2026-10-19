import { expect, it } from "vitest";
import { makeUgcInput, makeUgcInputShape } from "./skills.js";
import { z } from "zod";
import { contractFlagsFromEnv, rejectedFields, resolveDispositions } from "./contract-dispositions.js";

it.each([true, false])("retains explicit visible_ai_label=%s in the shared request", value => {
  expect(makeUgcInput.parse({ script: "Hello there", visible_ai_label: value })).toHaveProperty("visible_ai_label", value);
});
it("keeps absence distinct from explicit opt-out without rewriting request hashes", () => {
  expect(makeUgcInput.parse({ script: "Hello there" })).not.toHaveProperty("visible_ai_label");
});
it.each([null, "false", 0, {}, []])("refuses nonboolean visible label input %#", value => {
  expect(makeUgcInput.safeParse({ script: "Hello there", visible_ai_label: value }).success).toBe(false);
});
it("publishes a boolean with an explicit machine-marking-independent explanation", () => {
  const schema = z.toJSONSchema(z.object(makeUgcInputShape));
  expect(schema.properties?.visible_ai_label).toMatchObject({ type: "boolean" });
  const label = schema.properties?.visible_ai_label;
  expect(label && typeof label === "object" ? label.description : undefined).toContain("does not disable");
  expect(schema.required ?? []).not.toContain("visible_ai_label");
});

it.each([true, false])("refuses explicit visible_ai_label=%s while output marking is closed", value => {
  const table = resolveDispositions({ remoteFetch: false, compose: false });
  expect(table.visible_ai_label.kind).toBe("rejected");
  expect(rejectedFields({ visible_ai_label: value })).toEqual([
    { field: "visible_ai_label", message: expect.stringContaining("output marking is disabled") },
  ]);
});
it("opens the label option only with explicit output marking activation", () => {
  const flags = contractFlagsFromEnv({ CLIPWRIGHT_OUTPUT_MARKING: "1" });
  expect(flags.outputMarking).toBe(true);
  expect(resolveDispositions(flags).visible_ai_label.kind).toBe("implemented");
  for (const value of [undefined, "0", "true", "", "2"]) {
    expect(resolveDispositions(contractFlagsFromEnv({ CLIPWRIGHT_OUTPUT_MARKING: value })).visible_ai_label.kind).toBe("rejected");
  }
});
