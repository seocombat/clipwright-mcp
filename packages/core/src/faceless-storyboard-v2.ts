import { z } from "zod";
import { parseStoryboardProposal } from "./faceless-storyboard.js";

const nonblank = z.string().trim().min(1);
const index = z.number().int().nonnegative();
const sha256 = z.string().regex(/^[0-9a-fA-F]{64}$/);
const phase = z.enum(["setup", "development", "climax", "resolution"]);
const phaseOrder = { setup: 0, development: 1, climax: 2, resolution: 3 } as const;

const proposal = z.strictObject({
  version: z.literal("faceless_storyboard_61_v2"),
  premise: nonblank,
  script: nonblank,
  provenance: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixture") }),
    z.strictObject({ kind: z.literal("model"), model: nonblank, promptSha256: sha256, responseSha256: sha256 }),
  ]),
  beats: z.array(z.strictObject({
    id: nonblank, wordStart: index, wordEnd: index,
    reason: z.enum(["action", "place", "reveal", "emphasis"]),
    mediaType: z.enum(["video", "image"]), visualPrompt: nonblank, phase,
  })).min(2),
  captionPhrases: z.array(z.strictObject({ wordStart: index, wordEnd: index, accentWord: index })).min(1),
});

export type StoryboardV2Proposal = z.infer<typeof proposal>;

export function parseStoryboardV2(input: unknown): StoryboardV2Proposal {
  const parsed = proposal.parse(input);
  const { beats, version: _version, ...v1Fields } = parsed;
  parseStoryboardProposal({
    ...v1Fields,
    version: "faceless_storyboard_61_v1",
    beats: beats.map(({ phase: _phase, ...beat }) => beat),
  });
  if (parsed.provenance.kind === "model") {
    const wordCount = parsed.script.normalize("NFKC").match(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu)?.length ?? 0;
    if (wordCount < 155 || wordCount > 165) throw new Error("model storyboard requires 155–165 spoken words");
  }
  for (let i = 1; i < beats.length; i++) {
    if (phaseOrder[beats[i]!.phase] < phaseOrder[beats[i - 1]!.phase]) {
      throw new Error("storyboard phases must be ordered");
    }
  }
  return parsed;
}
