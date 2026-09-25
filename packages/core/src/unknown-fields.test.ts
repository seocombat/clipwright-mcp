import { describe, expect, it } from "vitest";
import {
  ACCEPTED_UGC_FIELDS,
  API_ERROR_CODES,
  makeUgcInputShape,
  unknownFieldBody,
  unknownFields,
} from "./index.js";

describe("unknown keys in make_ugc input", () => {
  it("finds keys outside the contract and suggests a field by normalized name", () => {
    expect(
      unknownFields({ script: "hi", aspectRatio: "16:9", "tts-model": "eleven_v3", aspect: "16:9" }),
    ).toEqual([
      { field: "aspectRatio", suggestion: "aspect_ratio" },
      { field: "tts-model", suggestion: "tts_model" },
      { field: "aspect", suggestion: undefined },
    ]);
  });

  it("contract fields, rejected ones included, are not unknown", () => {
    const everyContractField = Object.fromEntries(Object.keys(makeUgcInputShape).map((key) => [key, "x"]));
    expect(unknownFields(everyContractField)).toEqual([]);
  });

  it("a non-object has nothing to list: the schema refuses the shape", () => {
    expect(unknownFields(null)).toEqual([]);
    expect(unknownFields([1])).toEqual([]);
    expect(unknownFields("script")).toEqual([]);
  });

  it("the accepted-field list does not name rejected fields", () => {
    expect(ACCEPTED_UGC_FIELDS).toContain("aspect_ratio");
    expect(ACCEPTED_UGC_FIELDS).not.toContain("webhook_url");
  });

  it("the refusal body names the key, the suggestion, no charge and the accepted fields", () => {
    const body = unknownFieldBody([{ field: "aspectRatio", suggestion: "aspect_ratio" }], ["script", "aspect_ratio"]);
    expect(body.error.code).toBe("unknown_field");
    expect(body.error.fields).toEqual(["aspectRatio"]);
    expect(body.error.message).toContain('unknown field "aspectRatio" (did you mean "aspect_ratio"?)');
    expect(body.error.message).toContain("Nothing was charged");
    expect(body.error.message).toContain("Accepted fields: script, aspect_ratio.");
  });

  it("an empty key name is also an unknown key, and the body builds without throwing", () => {
    const hits = unknownFields({ script: "hi", "": 1 });
    expect(hits).toEqual([{ field: "", suggestion: undefined }]);
    const body = unknownFieldBody(hits, ["script"]);
    expect(body.error.fields).toEqual([""]);
    expect(body.error.message).toContain('unknown field ""');
  });

  it("the code is in the refusal registry", () => {
    expect(API_ERROR_CODES).toContain("unknown_field");
  });
});
