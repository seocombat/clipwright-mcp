/** A picture as an MCP image block (#1372): a passing network failure is tried again, and a picture that never loads is null, so the
 *  answer around it still goes out. */

export type ImageBlock = { type: "image"; data: string; mimeType: string };

/** Tries per picture, each bounded, and one deadline for all of them, inside an agent's usual 60 s tool timeout. */
export const IMAGE_FETCH_TRIES = 3, IMAGE_TRY_TIMEOUT_MS = 5_000, IMAGE_BUDGET_MS = 10_000;

/** The type read from the bytes; `fallback` when they are none of PNG, JPEG or WebP. */
function mimeOf(bytes: Uint8Array, fallback: string): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") return "image/webp";
  return fallback;
}

/** A 4xx is final (an expired or refused link does not heal); a thrown fetch, a 429 or a 5xx is tried again until the tries or `deadline` end. */
export async function fetchImage(url: string, o: { fetchImpl?: typeof fetch; mimeType?: string; deadline?: number; maxBytes?: number } = {}):
  Promise<ImageBlock | null> {
  const fetchImpl = o.fetchImpl ?? fetch, deadline = o.deadline ?? Date.now() + IMAGE_BUDGET_MS;
  for (let attempt = 0; attempt < IMAGE_FETCH_TRIES; attempt += 1) {
    const left = deadline - Date.now();
    if (left <= 0) return null;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(IMAGE_TRY_TIMEOUT_MS, left)) });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (o.maxBytes !== undefined && bytes.byteLength > o.maxBytes) return null;
        return { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: mimeOf(bytes, o.mimeType ?? "image/png") };
      }
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // A dropped connection or a timeout: the next try.
    }
  }
  return null;
}
