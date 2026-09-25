import { describe, expect, it } from "vitest";

import {
  damagedCharCount,
  damagedTextPaths,
  REPLACEMENT_CHAR,
} from "./script-integrity.js";

/** A real defect: cp1251 decoded as UTF-8. Each Cyrillic byte becomes one replacement */
/** character, while Latin letters and punctuation survive. */
const CORRUPTED = "������! ��� Clipwright.";

describe("damagedTextPaths", () => {
  it("a clean input gives no paths", () => {
    expect(damagedTextPaths({ script: "Привет! Это законный текст.", look: "natural" })).toEqual(
      [],
    );
  });

  it("damage in script is named by its path", () => {
    expect(damagedTextPaths({ script: CORRUPTED })).toEqual(["script"]);
  });

  it("damage inside an array is named with its index", () => {
    const input = {
      segments: [{ script: "чисто" }, { script: "тоже чисто" }, { script: CORRUPTED }],
    };
    expect(damagedTextPaths(input)).toEqual(["segments.2.script"]);
  });

  it("several damaged leaves are all returned, sorted", () => {
    const input = { script: CORRUPTED, segments: [{ script: CORRUPTED }] };
    expect(damagedTextPaths(input)).toEqual(["script", "segments.0.script"]);
  });

  it("there is NO FIELD LIST: a new text field is checked automatically", () => {
    // `caption_text` does not exist in the schema today. A guard listing fields would
    // miss it; a guard walking the input does not.
    expect(damagedTextPaths({ caption_text: CORRUPTED })).toEqual(["caption_text"]);
  });

  it("non-string leaves are ignored", () => {
    expect(damagedTextPaths({ n: 1, ok: true, nothing: null, missing: undefined })).toEqual([]);
  });

  it("a bare string input gives an empty path", () => {
    expect(damagedTextPaths(CORRUPTED)).toEqual([""]);
  });
});

describe("legitimate text is NOT counted as damage", () => {
  const legitimate: ReadonlyArray<readonly [string, string]> = [
    ["emoji", "Смотри, что получилось 🎬🔥 — за одну минуту."],
    ["Chinese", "这是一个测试脚本，用于验证语音合成。"],
    ["Arabic", "هذا نص تجريبي للتحقق من تركيب الكلام."],
    ["mixed Latin and Cyrillic", "Clipwright собирает ролик за минуту."],
    ["stress marks U+0301", "За́мок стои́т на горе́, а замо́к висит на двери́."],
    ["digits and punctuation only", "15, 3; 8 — 2,4?"],
  ];

  it.each(legitimate)("%s passes", (_name, script) => {
    expect(damagedTextPaths({ script })).toEqual([]);
  });
});

describe("damagedCharCount", () => {
  it("counts characters across all leaves together", () => {
    const input = { script: `a${REPLACEMENT_CHAR}b`, segments: [{ script: REPLACEMENT_CHAR }] };
    expect(damagedCharCount(input)).toBe(2);
  });

  it("zero on a clean input", () => {
    expect(damagedCharCount({ script: "чисто" })).toBe(0);
  });

  it("the real defect: nine characters in place of nine Russian letters", () => {
    expect(damagedCharCount({ script: CORRUPTED })).toBe(9);
  });
});
