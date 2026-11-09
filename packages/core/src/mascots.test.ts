import { describe, expect, it } from "vitest";

import { assetListQuery, asset } from "./assets.js";
import { brandKitInput } from "./design.js";
import { facelessStoredInput, makeFacelessInput, quoteFacelessInput } from "./faceless-public.js";
import { MASCOT_POSES, mascotPoses, pinnedMascot } from "./mascots.js";

/** #1257: a mascot is an explainer's finished hero; the request, the quote, the stored pin and the answers that name it. */

const id = `ast_${"f".repeat(32)}`, sha = "a".repeat(64);
const script = "Open the app. Click save. Check the result.";
const explainer = { input_mode: "script", script, duration_seconds: 60, format: "explainer" } as const;
const pose = { key: `assets/acc/${id}/poses/neutral.png`, bytes: 10, sha256: sha, width: 400, height: 500 };

describe("mascot_id on make_faceless", () => {
  // Mutants: accept it on any format; accept it beside a character the run would draw; price the poses of a run that reuses one.
  it("is taken by an explainer script, and refused without the format, beside a character and on a brief", () => {
    expect(makeFacelessInput.safeParse({ ...explainer, mascot_id: id }).success).toBe(true);
    const refused = (input: object) => { const parsed = makeFacelessInput.safeParse(input); return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`); };
    expect(refused({ input_mode: "script", script, duration_seconds: 60, mascot_id: id })).toEqual(["mascot_id: mascot_id needs format explainer: the mascot is its hero"]);
    expect(refused({ ...explainer, mascot_id: id, character_details: "A robot" })).toEqual(["character_details: mascot_id is the hero already made; omit character_details"]);
    expect(refused({ input_mode: "brief", brief: "A lighthouse", duration_seconds: 60, format: "explainer", mascot_id: id }).length).toBeGreaterThan(0);
    expect(refused({ ...explainer, mascot_id: "ast_nope" })).not.toEqual([]);
  });

  it("quotes no pose pictures for a mascot and the nine for a character it would draw", () => {
    const reusing = quoteFacelessInput(makeFacelessInput.parse({ ...explainer, mascot_id: id })), drawing = quoteFacelessInput(makeFacelessInput.parse({ ...explainer, character_details: "A robot" }));
    expect([reusing.posePictures, drawing.posePictures]).toEqual([0, 9]);
    expect(drawing.totalCredits - reusing.totalCredits).toBe(9 * 7);
  });

  it("is pinned in a stored input with the poses admission read, and a public request cannot carry the pin", () => {
    const pinned = { asset_id: id, poses: { neutral: pose } };
    expect(facelessStoredInput.safeParse({ ...explainer, mascot_id: id, mascot: pinned }).success).toBe(true);
    expect(makeFacelessInput.safeParse({ ...explainer, mascot_id: id, mascot: pinned }).success).toBe(false);
    expect(pinnedMascot.safeParse({ asset_id: id, poses: { up: pose } }).success).toBe(false);
  });

  // #1304. Mutants: refuse the mouth's line colour, or take any string, and a mascot saved with its drawn mouth erased cannot be pinned.
  it("pins a pose whose mouth carries its line colour as #RRGGBB, and refuses any other form", () => {
    const withInk = (ink: string) => mascotPoses.safeParse({ neutral: { ...pose, mouth: { x: 0.5, y: 0.6, w: 0.2, ink } } }).success;
    expect([withInk("#0A4644"), withInk("#0a4644"), withInk("#0A464400"), withInk("teal")]).toEqual([true, false, false, false]);
    expect(mascotPoses.safeParse({ neutral: { ...pose, mouth: { x: 0.5, y: 0.6, w: 0.2 } } }).success).toBe(true);
  });
});

describe("a mascot in answers and requests", () => {
  it("holds its neutral pose always, and names the poses it holds on the asset answer", () => {
    expect(mascotPoses.safeParse({ neutral: pose, up: pose }).success).toBe(true);
    expect(mascotPoses.safeParse({ up: pose }).success).toBe(false);
    expect(mascotPoses.safeParse({ neutral: pose, sulk: pose }).success).toBe(false);
    const base = { asset_id: id, state: "ready", kind: "image", role: "character", name: "Robot", media_type: "image/png", bytes: 10, width: 400, height: 500,
      duration_frames: null, fps: null, codec: null, pix_fmt: null, content_digest: sha, source_type: "generation", analysis_only: false,
      url: "https://r2.example/x", expires_at: "2026-11-09T00:00:00.000Z", created_at: "2026-11-09T00:00:00.000Z", updated_at: "2026-11-09T00:00:00.000Z" };
    expect(asset.parse({ ...base, mascot: { poses: ["neutral", "up"], character: null } }).mascot?.poses).toEqual(["neutral", "up"]);
    expect(asset.parse(base).mascot).toBeUndefined();
  });

  it("filters the asset list by mascot true only, and lets a brand kit name a mascot beside or instead of its design and voice", () => {
    expect(assetListQuery.safeParse({ mascot: "true" }).success).toBe(true);
    expect(assetListQuery.safeParse({ mascot: "false" }).success).toBe(false);
    expect(brandKitInput.safeParse({ mascot_id: id }).success).toBe(true);
    expect(brandKitInput.safeParse({ mascot_id: null }).success).toBe(true);
    expect(brandKitInput.safeParse({}).success).toBe(false);
  });

  it("keeps the mascot's pose list equal to the composition's nine", () => {
    expect([...MASCOT_POSES].sort()).toEqual(["celebrate", "neutral", "palm", "point", "shrug", "surprise", "think", "up", "wink"]);
  });
});
