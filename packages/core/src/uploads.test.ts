import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  UPLOAD_DAILY_CAP,
  UPLOAD_MAX_BYTES,
  UPLOAD_URL_TTL_SECONDS,
  UPLOAD_WINDOW_SECONDS,
  offeredUgcInputShape,
  sniffUploadMediaType,
  uploadExtension,
  uploadResponse,
} from "./index.js";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const VALID = {
  upload_id: `upl_${"a1".repeat(16)}`,
  url: "https://bucket.account.r2.cloudflarestorage.com/uploads/acc/abc.png?X-Amz-Signature=x",
  media_type: "image/png",
  bytes: 1_339_691,
  width: 1376,
  height: 768,
  expires_at: "2026-09-07T10:00:00.000Z",
};

describe("uploadResponse — the POST /v1/uploads response contract", () => {
  it("accepts a body with a signed https link and dimensions", () => {
    expect(uploadResponse.safeParse(VALID).success).toBe(true);
  });

  it("refuses http, zero dimensions and types other than PNG/JPEG", () => {
    expect(uploadResponse.safeParse({ ...VALID, url: "http://x.test/a.png" }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, width: 0 }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, media_type: "image/webp" }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, bytes: UPLOAD_MAX_BYTES + 1 }).success).toBe(false);
  });
});

describe("sniffUploadMediaType — type by bytes", () => {
  it("recognizes PNG and JPEG by signature and trusts nothing else", () => {
    expect(sniffUploadMediaType(PNG_HEAD)).toBe("image/png");
    expect(sniffUploadMediaType(JPEG_HEAD)).toBe("image/jpeg");
    expect(sniffUploadMediaType(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBeNull();
    expect(sniffUploadMediaType(new Uint8Array(0))).toBeNull();
  });

  it("the key extension follows the type", () => {
    expect(uploadExtension("image/png")).toBe("png");
    expect(uploadExtension("image/jpeg")).toBe("jpg");
  });
});

describe("caps and codes are declared by the contract", () => {
  it("the daily window, link lifetime and cap are the published numbers", () => {
    expect(UPLOAD_WINDOW_SECONDS).toBe(24 * 60 * 60);
    expect(UPLOAD_URL_TTL_SECONDS).toBe(24 * 60 * 60);
    expect(UPLOAD_DAILY_CAP).toBe(20);
  });

  it("the three upload refusal codes are in the code registry", () => {
    for (const code of ["unsupported_media_type", "invalid_image", "upload_cap_exceeded"]) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });

  it("the image / actor_gender / aspect_ratio / resolution / voice / voice_id fields are described for tools/list", () => {
    for (const field of ["image", "actor_gender", "aspect_ratio", "resolution", "voice", "voice_id"] as const) {
      expect(offeredUgcInputShape[field].description, field).toBeTruthy();
    }
    expect(offeredUgcInputShape.aspect_ratio.description).toContain("9:16 | 1:1 | 16:9");
    expect(offeredUgcInputShape.voice.description).toContain("owner_ru_clone");
  });
});
