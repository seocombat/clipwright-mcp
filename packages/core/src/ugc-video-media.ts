import { WORDS_PER_SECOND_MIN } from "./pacing.js";
import { lexicalTokens } from "./semantic-inserts.js";
import type { MakeUgcInput, PinnedInsertAsset } from "./skills.js";
import { layerWordRange } from "./ugc-layers.js";

// Video media in inserts, overlays and layout windows of a long-form `make_ugc` run (#778 S2c): muted, held on its last frame when short.

/** Codecs Remotion's OffthreadVideo decodes with its bundled FFmpeg, locally and on Lambda; asset ingest takes the same two. */
export const MEDIA_VIDEO_CODECS = ["h264", "hevc"] as const;
const HDR_TRANSFERS: Record<string, string> = { smpte2084: "PQ", "arib-std-b67": "HLG" };

export interface VideoSourceFacts {
  codec?: string | null | undefined;
  pixFmt?: string | null | undefined;
  colorTransfer?: string | null | undefined;
}

/** Why a video source cannot be drawn, or `null`. A fact that is not known is not refused here; the worker measures it. */
export function videoMediaRefusal(facts: VideoSourceFacts): string | null {
  if (facts.codec && !(MEDIA_VIDEO_CODECS as readonly string[]).includes(facts.codec)) {
    return `is ${facts.codec} video: video media takes H.264 or HEVC; re-encode it as H.264`;
  }
  const depth = facts.pixFmt ? /(9|1[0-6])(le|be)$/.exec(facts.pixFmt)?.[1] : undefined;
  if (depth) return `is ${depth}-bit video (${facts.pixFmt}): video media takes 8-bit video; re-encode it as 8-bit H.264 (yuv420p)`;
  const hdr = facts.colorTransfer ? HDR_TRANSFERS[facts.colorTransfer] : undefined;
  if (hdr) return `is HDR video (${hdr}, transfer ${facts.colorTransfer}): video media takes SDR video; re-encode it as SDR BT.709`;
  return null;
}

const LISTS = [["inserts", "insert"], ["overlays", "overlay"], ["layout_windows", "layout window"]] as const;

/** The quote's warning for a pinned video asset the narration may outlast; the slow speech edge gives the longest its words can take. */
export function videoHoldWarnings(input: Pick<MakeUgcInput, "script" | "inserts" | "overlays" | "layout_windows">,
  pinned: readonly PinnedInsertAsset[] | undefined): string[] {
  if (!pinned?.length || typeof input.script !== "string") return [];
  const tokens = lexicalTokens(input.script);
  return LISTS.flatMap(([list, noun]) => (input[list] ?? []).flatMap((item, index) => {
    const asset = pinned.find(one => one.insert_id === item.id);
    if (item.media_type !== "video" || asset?.kind !== "video" || !asset.duration_frames || !asset.fps) return [];
    const range = layerWordRange(tokens, item);
    if (typeof range === "string") return [];
    const words = range.coverWord - range.startWord, clipSec = asset.duration_frames / asset.fps, longestSec = words / WORDS_PER_SECOND_MIN;
    return clipSec < longestSec ? [`${list}[${index}] ${noun} ${item.id}: its video asset runs ${clipSec.toFixed(1)} s, and the ${words} words ` +
      `it covers can take up to ${longestSec.toFixed(1)} s; if the narration outlasts the clip, its last frame holds to the end`] : [];
  }));
}
