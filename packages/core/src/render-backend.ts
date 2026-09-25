import type { AspectRatio, Resolution } from "./skills.js";
import type { VendorRefusalClass } from "./vendor-response.js";

// Vendor-neutral avatar render contract. Vendor details (auth headers, endpoints, vendor
// vocabulary) live only in adapters; no type here is borrowed from a vendor response.

/** Audio source. An uploaded asset is a vendor detail and does not leak out. */
export type AudioSource =
  | { kind: "url"; url: string }
  | { kind: "bytes"; data: Uint8Array; mimeType: string };

/** Actor appearance source: the user's PUBLIC URL and nothing else. A one-variant union */
/** pins that a vendor identifier never becomes a second variant. */
export type ImageSource = { kind: "url"; url: string };

/** Request to render one clip. Appearance arrives only as a user's public URL; vendor */
/** identifiers stay in the adapter, which resolves the default actor when `image` is unset. */
export interface AvatarClipRequest {
  /** Our run_id. The adapter passes the SCOPE (`idempotencyScope ?? runId`) to vendor */
  /** idempotency, not `runId` unconditionally. */
  runId: string;
  /** Vendor idempotency scope, `runId` when unset. A segmented clip makes several paid */
  /** creates per run; a shared key would make the vendor return the first clip for all. */
  idempotencyScope?: string;
  audio: AudioSource;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  /** Unset: the adapter resolves the default actor. */
  image?: ImageSource;
}

export interface AvatarClipResult {
  /** The vendor URL. TEMPORARY and unfit for clients (a signed, expiring link): the pipeline */
  /** copies the file to our storage and returns our URL. */
  videoUrl: string;
  durationSec: number;
  /** The vendor's job id: without it the vendor cannot investigate an incident. */
  providerJobId: string;
  provider: string;
}

/** Handle of a vendor render job, bridging the PAID `createAvatarJob` and the free */
/** `pollAvatarJob`. Must survive a JSON round-trip: primitives only, times as ISO strings. */
export interface AvatarJobHandle {
  /** The vendor's job id. */
  providerJobId: string;
  /** The backend that created the job, so the same adapter polls it. */
  provider: string;
}

/** Backend capabilities: vendors differ in details that break the gate. A mismatch must */
/** never be silently substituted; unhonored parameters go to `warnings[]`. */
export interface BackendCapabilities {
  resolutions: readonly Resolution[];
  aspectRatios: readonly AspectRatio[];
  /** Maximum length of one audio, seconds. null: the vendor does not document it. */
  maxAudioSec: number | null;
}

export interface RenderBackend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;

  /** Creates the vendor job: PAID and once, apart from the free, resumable poll. Keys vendor */
  /** idempotency on the scope; `retryable` describes the error, and a paid create is never retried. */
  createAvatarJob(req: AvatarClipRequest): Promise<AvatarJobHandle>;

  /** Waits for a terminal state; free and idempotent. Fail-closed: only an explicit success */
  /** with a non-empty video URL succeeds, and a deadline bounds the wait. */
  pollAvatarJob(handle: AvatarJobHandle, options?: { deadlineMs: number }): Promise<AvatarClipResult>;

  /** Whose fault a refusal is: our account at the vendor or the vendor's trouble. REQUIRED, */
  /** so a new vendor does not compile without it. */
  classifyRefusal(error: unknown): VendorRefusalClass;
}

/** Reads the `retryable` flag the contract above requires, next to where it is required. */
/** Strictly `=== true`: near money, anything short of an explicit yes is not retried. */
export function isRetryableVendorError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { retryable?: unknown }).retryable === true
  );
}

/** Fits a request to the backend's capabilities; every mismatch is a warning, and the */
/** resolution is never lowered silently. */
export function negotiateCapabilities(
  req: Pick<AvatarClipRequest, "resolution" | "aspectRatio">,
  caps: BackendCapabilities,
  backendName: string,
): { resolution: Resolution; aspectRatio: AspectRatio; warnings: string[] } {
  const warnings: string[] = [];

  let resolution = req.resolution;
  if (!caps.resolutions.includes(resolution)) {
    const fallback = caps.resolutions.at(-1);
    if (!fallback) {
      throw new Error(`backend ${backendName} declares no supported resolutions`);
    }
    warnings.push(
      `resolution ${resolution} is not supported by ${backendName}; rendered at ${fallback}`,
    );
    resolution = fallback;
  }

  let aspectRatio = req.aspectRatio;
  if (!caps.aspectRatios.includes(aspectRatio)) {
    const fallback = caps.aspectRatios[0];
    if (!fallback) {
      throw new Error(`backend ${backendName} declares no supported aspect ratios`);
    }
    warnings.push(
      `aspect_ratio ${aspectRatio} is not supported by ${backendName}; rendered at ${fallback}`,
    );
    aspectRatio = fallback;
  }

  return { resolution, aspectRatio, warnings };
}
