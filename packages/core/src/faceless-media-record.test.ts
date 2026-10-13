import { describe, expect, it } from "vitest";
import * as coreBarrel from "./index.js";
import { facelessMediaRecord, storedObject, type FacelessMediaRecord, type StoredObject } from "./faceless-media-record.js";

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const stored = (kind: StoredObject["kind"], seed: string, bytes: number): StoredObject => ({
  kind, key: `runs/run_record/faceless/media/${sha(seed)}.${kind === "image" ? "png" : kind === "video" ? "mp4" : "wav"}`,
  sha256: sha(seed), bytes,
  width: kind === "audio" ? null : kind === "video" ? 1088 : 1024, height: kind === "audio" ? null : kind === "video" ? 1920 : 1536,
  duration_sec: kind === "image" ? null : kind === "video" ? 5.04 : 31.36,
});

/** A run with no customer reference and no customer picture: the lead picture is the style of the later ones. */
function generatedRecord(): FacelessMediaRecord {
  const still = stored("image", "a", 2101);
  return {
    v: 1,
    shots: [
      { id: "beat-0", source: "generated", motion: null, media: stored("video", "b", 880_001) },
      { id: "beat-2", source: "generated", motion: "PAN_DOWN", media: stored("image", "c", 2303) },
      { id: "beat-1", source: "generated", motion: "PAN_UP", media: stored("image", "d", 2404) },
    ],
    opener_still: still,
    references: [{ ...still, role: "style", from: "lead_picture" }],
    narration: stored("audio", "e", 1_505_324),
    settings: { captions: true, character_reference: false, character_details: null, image_model: "flare-edit-medium",
      voice: null, lambda_site_sha256: sha("f") },
  };
}
/** A run with the customer's two references: both come from the customer, the character first. */
function referencedRecord(): FacelessMediaRecord {
  return { ...generatedRecord(),
    references: [{ ...stored("image", "1", 3101), role: "character", from: "customer" }, { ...stored("image", "2", 3202), role: "style", from: "customer" }],
    settings: { captions: false, character_reference: true, character_details: "Mira: a black bob haircut and a red scarf.",
      image_model: "gpt-image-2", voice: "warm_narrator", lambda_site_sha256: sha("9") } };
}
/** A run with a customer picture in its second shot. */
function customerPictureRecord(): FacelessMediaRecord {
  const record = generatedRecord();
  record.shots[1] = { id: "beat-2", source: "customer", motion: "PAN_DOWN", media: stored("image", "7", 77_000) };
  return record;
}

type Loose = Record<string, unknown> & { shots: Record<string, unknown>[]; references: Record<string, unknown>[];
  opener_still: Record<string, unknown>; narration: Record<string, unknown>; settings: Record<string, unknown> };
function altered(change: (record: Loose) => void, base: () => FacelessMediaRecord = referencedRecord): unknown {
  const record = structuredClone(base()) as unknown as Loose;
  change(record);
  return record;
}
const refused = (value: unknown) => facelessMediaRecord.safeParse(value).success === false;

describe("the media record of a faceless run", () => {
  it.each([["with customer references", referencedRecord], ["without a customer reference", generatedRecord],
    ["with a customer picture", customerPictureRecord]] as const)("accepts the record of a run %s and returns it unchanged", (_name, build) => {
    expect(facelessMediaRecord.parse(build())).toEqual(build());
  });

  it("the three accepted records differ where the runs differ", () => {
    expect(referencedRecord().references.map(ref => [ref.role, ref.from])).toEqual([["character", "customer"], ["style", "customer"]]);
    const generated = generatedRecord();
    expect(generated.references).toEqual([{ ...generated.opener_still, role: "style", from: "lead_picture" }]);
    expect(generated.shots[0]!.media.sha256).not.toBe(generated.opener_still.sha256);
    expect(customerPictureRecord().shots.map(shot => shot.source)).toEqual(["generated", "customer", "generated"]);
  });

  it.each([
    ["at the top level", (record: Loose) => { record.createdAtMs = 1; }],
    ["in a shot", (record: Loose) => { record.shots[1]!.mediaType = "image"; }],
    ["in a shot's stored object", (record: Loose) => { (record.shots[2]!.media as Record<string, unknown>).url = "https://example.com/a.png"; }],
    ["in the opening still", (record: Loose) => { record.opener_still.expiresAtMs = 1; }],
    ["in the narration", (record: Loose) => { record.narration.durationSec = 31.36; }],
    ["in a reference", (record: Loose) => { record.references[1]!.referenceRole = "style"; }],
    ["in settings", (record: Loose) => { record.settings.voice_speed = 1.09; }],
  ])("refuses an unknown key %s", (_where, change) => {
    expect(refused(altered(() => undefined))).toBe(false);
    expect(refused(altered(change))).toBe(true);
  });

  it("refuses a version it does not know, and a record without one", () => {
    expect(refused(altered(record => { record.v = 2; }))).toBe(true);
    expect(refused(altered(record => { record.v = "1"; }))).toBe(true);
    expect(refused(altered(record => { delete record.v; }))).toBe(true);
  });

  it.each([
    ["a shot source outside the two", (record: Loose) => { record.shots[0]!.source = "upload"; }],
    ["a motion outside the two", (record: Loose) => { record.shots[1]!.motion = "ZOOM_IN"; }],
    ["a shot without `motion`", (record: Loose) => { delete record.shots[0]!.motion; }],
    ["a shot id the edit document cannot name", (record: Loose) => { record.shots[2]!.id = "beat 1"; }],
    ["a reference role outside the two", (record: Loose) => { record.references[0]!.role = "pose"; }],
    ["a reference origin outside the two", (record: Loose) => { record.references[1]!.from = "library"; }],
    ["a reference without its origin", (record: Loose) => { delete record.references[0]!.from; }],
    ["a record without the opening still", (record: Loose) => { delete (record as Record<string, unknown>).opener_still; }],
    ["a record without the narration", (record: Loose) => { delete (record as Record<string, unknown>).narration; }],
    ["captions that are not a boolean", (record: Loose) => { record.settings.captions = "true"; }],
    ["a character reference that is not a boolean", (record: Loose) => { record.settings.character_reference = "https://example.com/c.png"; }],
    ["settings without `character_details`", (record: Loose) => { delete record.settings.character_details; }],
    ["settings without `voice`", (record: Loose) => { delete record.settings.voice; }],
    ["settings without the image model", (record: Loose) => { delete record.settings.image_model; }],
    ["settings without the site hash", (record: Loose) => { delete record.settings.lambda_site_sha256; }],
  ])("refuses %s", (_what, change) => {
    expect(refused(altered(change))).toBe(true);
  });

  it("takes `null` for the two settings a run may leave out, and for a shot that does not move", () => {
    const record = altered(value => { value.settings.character_details = null; value.settings.voice = null; value.shots[1]!.motion = null; });
    expect(facelessMediaRecord.parse(record)).toEqual(record);
  });
});

describe("a stored object", () => {
  const picture = () => stored("image", "a", 2101);
  it("is a picture, a clip or a sound with its key, hash and measures", () => {
    for (const object of [picture(), stored("video", "b", 880_001), stored("audio", "e", 1_505_324)]) expect(storedObject.parse(object)).toEqual(object);
  });
  it.each([
    ["a kind outside the three", { kind: "text" }],
    ["an empty key", { key: "" }],
    ["a hash that is not 64 lowercase hex digits", { sha256: sha("A") }],
    ["a short hash", { sha256: sha("a").slice(1) }],
    ["no bytes", { bytes: 0 }],
    ["a fractional byte count", { bytes: 10.5 }],
    ["a zero width", { width: 0 }],
    ["a zero height", { height: 0 }],
    ["a zero duration", { duration_sec: 0 }],
    ["a signed URL", { url: "https://example.com/a.png?X-Amz-Signature=1" }],
    ["an expiry", { expiresAtMs: 1_790_000_000_000 }],
  ])("refuses %s", (_what, change) => {
    expect(storedObject.safeParse({ ...picture(), ...change }).success).toBe(false);
  });
  it.each(["width", "height", "duration_sec"] as const)("needs `%s` named, even when it is null", key => {
    const { [key]: _dropped, ...rest } = stored("video", "b", 880_001);
    expect(storedObject.safeParse(rest).success).toBe(false);
    expect(storedObject.safeParse({ ...rest, [key]: null }).success).toBe(true);
  });
});

type Path = Array<string | number>;
type Leaf = { holds: "string" | "number" | "boolean" | readonly unknown[]; nullable?: true };
const text: Leaf = { holds: "string" }, count: Leaf = { holds: "number" }, flag: Leaf = { holds: "boolean" };
const oneOf = (...values: unknown[]): Leaf => ({ holds: values }), orNull = (leaf: Leaf): Leaf => ({ ...leaf, nullable: true });
const under = (place: string, leaves: Record<string, Leaf>) => Object.entries(leaves).map(([key, leaf]) => [`${place}.${key}`, leaf] as const);
const OBJECT = { kind: oneOf("image", "video", "audio"), key: text, sha256: text, bytes: count, width: orNull(count), height: orNull(count),
  duration_sec: orNull(count) };
/** The record's shape written out by hand, a second witness beside the schema: every leaf by its place, and what it holds. */
const SHAPE = new Map<string, Leaf>([
  ["v", oneOf(1)],
  ["shots.[].id", text], ["shots.[].source", oneOf("generated", "customer")], ["shots.[].motion", orNull(oneOf("PAN_UP", "PAN_DOWN"))],
  ...under("shots.[].media", OBJECT), ...under("opener_still", OBJECT),
  ...under("references.[]", { ...OBJECT, role: oneOf("style", "character"), from: oneOf("customer", "lead_picture") }),
  ...under("narration", OBJECT),
  ...under("settings", { captions: flag, character_reference: flag, character_details: orNull(text), image_model: text, voice: orNull(text),
    lambda_site_sha256: text }),
]);
const placeOf = (path: Path) => path.map(step => typeof step === "number" ? "[]" : step).join(".");

/** Every object, list and leaf of a value, each by its path. */
function parts(value: unknown, path: Path = [], found = { objects: [] as Path[], lists: [] as Path[], leaves: [] as Path[] }) {
  if (Array.isArray(value)) { found.lists.push(path); for (const [index, item] of value.entries()) parts(item, [...path, index], found); }
  else if (value !== null && typeof value === "object") {
    found.objects.push(path);
    for (const [key, item] of Object.entries(value)) parts(item, [...path, key], found);
  } else found.leaves.push(path);
  return found;
}
/** The leaves the schema itself names, read from its public shape. A node this walk does not know stops it, an optional key among them. */
function schemaLeaves(schema: unknown, place: string[] = []): string[] {
  const node = schema as { def: { type: string }; shape: Record<string, unknown>; element: unknown; unwrap: () => unknown };
  switch (node.def.type) {
    case "object": return Object.entries(node.shape).flatMap(([key, item]) => schemaLeaves(item, [...place, key]));
    case "array": return schemaLeaves(node.element, [...place, "[]"]);
    case "nullable": return schemaLeaves(node.unwrap(), place);
    case "string": case "number": case "boolean": case "literal": case "enum": return [place.join(".")];
    default: throw new Error(`the walk does not know a ${node.def.type} node at ${place.join(".")}`);
  }
}
/** The fully populated record with one place of it changed; an empty path is the record itself. */
function changedAt(path: Path, change: (holder: Record<string | number, unknown>, key: string | number) => void): unknown {
  const root: Record<string | number, unknown> = { record: structuredClone(referencedRecord()) };
  let holder = root, key: string | number = "record";
  for (const step of path) { holder = holder[key] as Record<string | number, unknown>; key = step; }
  change(holder, key);
  return root.record;
}
const put = (path: Path, value: unknown) => changedAt(path, (holder, key) => { holder[key] = value; });
const valueAt = (path: Path) => path.reduce<unknown>((value, step) => (value as Record<string | number, unknown>)[step], referencedRecord());
const shown = (path: Path, value?: unknown) => `${path.join(".") || "(the record)"}${value === undefined ? "" : ` = ${JSON.stringify(value) ?? String(value)}`}`;

describe("the shape of the media record, walked from one fully populated record", () => {
  const { objects, lists, leaves } = parts(referencedRecord());
  const stored = objects.filter(path => "sha256" in (valueAt(path) as object));

  it("the walk reaches every leaf the schema names, and the schema names the leaves written out here and no other", () => {
    const named = [...SHAPE.keys()].sort();
    expect(named).toHaveLength(40);
    expect(schemaLeaves(facelessMediaRecord).sort()).toEqual(named);
    expect([...new Set(leaves.map(placeOf))].sort()).toEqual(named);
    // Three shots, two references, the still, the narration and the settings: a smaller walk would be a thinner record.
    expect([leaves.length, objects.length, lists.length, stored.length]).toEqual([69, 12, 2, 7]);
    expect(refused(referencedRecord())).toBe(false);
  });

  it("needs every key of every object: without any one of them the record is refused", () => {
    const keys = objects.flatMap(path => Object.keys(valueAt(path) as object).map(key => [...path, key]));
    expect(keys).toHaveLength(77);
    expect(keys.filter(path => !refused(changedAt(path, (holder, key) => { delete holder[key]; }))).map(path => shown(path))).toEqual([]);
    // `undefined` is no value either: a key that is there and holds nothing is as absent as a key that is not.
    expect(keys.filter(path => !refused(put(path, undefined))).map(path => shown(path))).toEqual([]);
  });

  it("refuses a key it does not know in every object", () => {
    expect(objects.filter(path => !refused(put([...path, "extra"], 1))).map(path => shown(path))).toEqual([]);
  });

  it("refuses a value of another type in every leaf, and takes null only where the leaf may be null", () => {
    // Two of each JSON scalar, so a leaf that takes one value of a type still meets another, and the two containers.
    const samples: unknown[] = ["text", "1", 7, 1, true, false, null, {}, []];
    const fits = (leaf: Leaf, value: unknown) => (leaf.nullable === true && value === null) ||
      (typeof leaf.holds === "string" ? typeof value === leaf.holds : leaf.holds.includes(value));
    const taken: string[] = [], nulls: string[] = [];
    let tried = 0;
    for (const path of leaves) {
      const leaf = SHAPE.get(placeOf(path));
      if (!leaf) throw new Error(`no leaf is written out for ${placeOf(path)}`);
      for (const value of samples.filter(sample => !fits(leaf, sample))) { tried++; if (!refused(put(path, value))) taken.push(shown(path, value)); }
      if (leaf.nullable && refused(put(path, null))) nulls.push(shown(path));
    }
    expect(taken).toEqual([]);
    expect(nulls).toEqual([]);
    // 69 leaves; each refuses at least the six samples of the other scalar types and the containers.
    expect(tried).toBeGreaterThanOrEqual(69 * 6);
    expect(leaves.filter(path => SHAPE.get(placeOf(path))!.nullable)).toHaveLength(3 + 7 * 3 + 2);
  });

  it("refuses another type where an object or a list stands", () => {
    const wrong = (path: Path, values: unknown[]) => values.filter(value => !refused(put(path, value))).map(value => shown(path, value));
    expect(objects.flatMap(path => wrong(path, [null, "text", 7, true, []]))).toEqual([]);
    expect(lists.flatMap(path => wrong(path, [null, "text", 7, true, {}]))).toEqual([]);
  });

  const hex = "0123456789abcdef".repeat(4), MAX = Number.MAX_SAFE_INTEGER;
  const sizes: Array<[unknown, boolean]> = [[1, true], [MAX, true], [0, false], [-1, false], [1.5, false], [MAX + 1, false],
    [Number.NaN, false], [Number.POSITIVE_INFINITY, false]];
  it.each<[string, Array<[unknown, boolean]>]>([
    ["kind", [["image", true], ["video", true], ["audio", true], ["text", false], ["IMAGE", false]]],
    ["key", [["k", true], ["k".repeat(1024), true], ["", false], ["k".repeat(1025), false]]],
    ["sha256", [[hex, true], [hex.slice(1), false], [`${hex}a`, false], [hex.toUpperCase(), false], [`g${hex.slice(1)}`, false],
      [`${hex.slice(1)}g`, false], [`${hex}\n`, false]]],
    ["bytes", sizes], ["width", sizes], ["height", sizes],
    ["duration_sec", [[0.04, true], [1, true], [0, false], [-0.04, false], [-1, false], [Number.NaN, false], [Number.POSITIVE_INFINITY, false]]],
  ])("holds `%s` of every stored object to its bound, a value on each side", (key, cases) => {
    expect(stored).toHaveLength(7);
    const off = stored.flatMap(path => cases.filter(([value, accepted]) => refused(put([...path, key], value)) === accepted)
      .map(([value]) => shown([...path, key], value)));
    expect(off).toEqual([]);
  });

  it.each<[string, Path[], Array<[unknown, boolean]>]>([
    ["the version", [["v"]], [[1, true], [2, false], [0, false], ["1", false]]],
    ["a shot id", [0, 1, 2].map(shot => ["shots", shot, "id"]), [["a", true], ["A_b-9", true], ["a".repeat(64), true], ["a".repeat(65), false],
      ["", false], ["_a", false], ["-a", false], ["beat 1", false], ["a\n", false]]],
    ["a shot source", [0, 1, 2].map(shot => ["shots", shot, "source"]), [["generated", true], ["customer", true], ["upload", false], ["", false]]],
    ["a shot motion", [0, 1, 2].map(shot => ["shots", shot, "motion"]), [["PAN_UP", true], ["PAN_DOWN", true], [null, true], ["ZOOM_IN", false],
      ["pan_up", false]]],
    ["a reference role", [0, 1].map(reference => ["references", reference, "role"]), [["style", true], ["character", true], ["pose", false]]],
    ["a reference origin", [0, 1].map(reference => ["references", reference, "from"]), [["customer", true], ["lead_picture", true], ["library", false]]],
    // §3.10 writes these four as plain strings and the two lists without a least length: no bound is stated, so none is held.
    ["a plain string of the settings", ["character_details", "image_model", "voice", "lambda_site_sha256"].map(key => ["settings", key]), [["", true], ["x".repeat(5000), true]]],
    ["the two lists", [["shots"], ["references"]], [[[], true]]],
  ])("holds %s to its values, one on each side where a side exists", (_what, paths, cases) => {
    for (const path of paths) expect(valueAt(path), shown(path)).toBeDefined();
    const off = paths.flatMap(path => cases.filter(([value, accepted]) => refused(put(path, value)) === accepted).map(([value]) => shown(path, value)));
    expect(off).toEqual([]);
  });

  it("returns what it accepts unchanged, whatever legal value a leaf holds", () => {
    for (const record of [put(["shots", 1, "motion"], null), put(["narration", "duration_sec"], 0.04), put(["opener_still", "bytes"], MAX),
      put(["settings", "voice"], null), put(["references"], [])]) expect(facelessMediaRecord.parse(record)).toEqual(record);
  });
});

it("the core barrel exports the record's two schemas", () => {
  expect(coreBarrel.facelessMediaRecord).toBe(facelessMediaRecord);
  expect(coreBarrel.storedObject).toBe(storedObject);
});
