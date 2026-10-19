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
  uploadList,
  uploadListRead,
  uploadResponse,
} from "./index.js";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const VALID = {
  upload_id: `upl_${"a1".repeat(16)}`,
  content_digest: "b".repeat(64),
  url: "https://bucket.account.r2.cloudflarestorage.com/uploads/acc/abc.png?X-Amz-Signature=x",
  media_type: "image/png",
  bytes: 1_339_691,
  width: 1376,
  height: 768,
  expires_at: "2026-09-07T10:00:00.000Z",
};

describe("uploadResponse — the POST /v1/uploads response contract", () => {
  it("accepts a body with a signed https link and dimensions", () => {
    expect(uploadResponse.parse(VALID)).toEqual(VALID);
  });

  it.each([undefined, null, 1, "invalid", "A".repeat(64), "a".repeat(63)])("refuses an absent or malformed source digest: %j", content_digest => {
    expect(uploadResponse.safeParse({ ...VALID, content_digest }).success).toBe(false);
    expect(uploadListRead.safeParse({ uploads: [{ ...VALID, content_digest,
      created_at: VALID.expires_at, usable_until: VALID.expires_at }], contract_version: "v" }).success).toBe(false);
  });

  it("refuses http, zero dimensions and types other than PNG/JPEG", () => {
    expect(uploadResponse.safeParse({ ...VALID, url: "http://x.test/a.png" }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, width: 0 }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, media_type: "image/webp" }).success).toBe(false);
    expect(uploadResponse.safeParse({ ...VALID, bytes: UPLOAD_MAX_BYTES + 1 }).success).toBe(false);
  });
});

describe("uploadList and uploadListRead — the GET /v1/uploads contract", () => {
  const ITEM = { ...VALID, created_at: "2026-10-16T10:00:00.000Z", usable_until: "2026-11-15T08:00:00.000Z" };
  const LATER = { ...ITEM, bytes: UPLOAD_MAX_BYTES + 1, media_type: "image/avif", thumbnail: "https://x.test/t.png" };

  it("the server's schema is closed: a size over the cap, another type or an extra key is refused", () => {
    expect(uploadList.safeParse({ uploads: [ITEM], contract_version: "v" }).success).toBe(true);
    for (const item of [{ ...ITEM, bytes: UPLOAD_MAX_BYTES + 1 }, { ...ITEM, media_type: "image/avif" }, { ...ITEM, extra: 1 }]) {
      expect(uploadList.safeParse({ uploads: [item], contract_version: "v" }).success).toBe(false);
    }
  });

  it("installed clients read a later server: a larger cap, a new type and new keys pass and are kept", () => {
    const read = uploadListRead.parse({ uploads: [LATER], contract_version: "v", next: null });
    expect(read.uploads[0]).toEqual(LATER);
    expect(read).toHaveProperty("next", null);
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
