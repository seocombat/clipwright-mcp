import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// A tripwire by substring, not a proof: the behavioural guard is the "rules decide, not the line" case of edit-validate.test.ts.
it('the source text of `edit-validate.ts` contains no `.line`, exactly one `.frame` (the argument passed to the upload-shape check), and none of `1080`, `1920`, `"9:16"`, `"16:9"`, `faceless`', () => {
  const source = readFileSync(new URL("./edit-validate.ts", import.meta.url), "utf8");
  const count = (needle: string) => source.split(needle).length - 1;
  expect(source.length).toBeGreaterThan(1000);
  expect(count(".line")).toBe(0);
  expect(count(".frame")).toBe(1);
  expect(count("uploadShapeIssue(shots.frame,")).toBe(1);
  for (const needle of ["1080", "1920", '"9:16"', '"16:9"', "faceless"]) expect(count(needle), needle).toBe(0);
});
