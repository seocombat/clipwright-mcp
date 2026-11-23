import type { AspectRatio, Resolution } from "./skills.js";

export type AudioSource =
  | { kind: "url"; url: string }
  | { kind: "bytes"; data: Uint8Array; mimeType: string };

export type ImageSource = { kind: "url"; url: string };

export interface AvatarClipRequest {
  runId: string;
  idempotencyScope?: string;
  audio: AudioSource;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  image?: ImageSource;
  model?: "avatar6_turbo";
}

export interface AvatarClipResult {
  videoUrl: string;
  durationSec: number;
  providerJobId: string;
  provider: string;
}

export interface AvatarJobHandle {
  providerJobId: string;
  provider: string;
}

export interface BackendCapabilities {
  resolutions: readonly Resolution[];
  aspectRatios: readonly AspectRatio[];
  maxAudioSec: number | null;
}

export interface RenderBackend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;

  createAvatarJob(req: AvatarClipRequest): Promise<AvatarJobHandle>;

  pollAvatarJob(handle: AvatarJobHandle, options?: { deadlineMs: number }): Promise<AvatarClipResult>;

  classifyRefusal(error: unknown): "account_standing" | "vendor" | "unknown";
}

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
