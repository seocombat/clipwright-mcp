export const YOUTUBE_HOSTS: ReadonlySet<string> = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
  "www.youtu.be"]);
const EMBED_HOSTS: ReadonlySet<string> = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SITE_HOSTS: ReadonlySet<string> = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const SHORT_HOSTS: ReadonlySet<string> = new Set(["youtu.be", "www.youtu.be"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ID_PATH = "([A-Za-z0-9_-]{11})\\/?$";

export type YoutubeLink = { kind: "video"; id: string } | { kind: "refused" } | { kind: "other" };

export function youtubeLink(url: URL): YoutubeLink {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host) && !EMBED_HOSTS.has(host)) return { kind: "other" };
  const plain = url.protocol === "https:" && url.username === "" && url.password === "" && (url.port === "" || url.port === "443");
  const path = url.pathname;
  const id = !plain ? null
    : SHORT_HOSTS.has(host) ? new RegExp(`^\\/${ID_PATH}`).exec(path)?.[1]
    : EMBED_HOSTS.has(host) ? new RegExp(`^\\/embed\\/${ID_PATH}`).exec(path)?.[1]
    : !SITE_HOSTS.has(host) ? null
    : /^\/watch\/?$/.test(path) ? url.searchParams.get("v")
    : new RegExp(`^\\/(?:shorts|embed)\\/${ID_PATH}`).exec(path)?.[1];
  return id && VIDEO_ID.test(id) ? { kind: "video", id } : { kind: "refused" };
}

export const youtubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
