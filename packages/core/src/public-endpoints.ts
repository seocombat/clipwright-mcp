export const PUBLIC_API_BASE_URL = "https://api.clipwright.io";

export const PUBLIC_APP_BASE_URL = "https://app.clipwright.io";

export const PUBLIC_SITE_BASE_URL = "https://clipwright.io";

export const PUBLIC_MCP_URL = "https://mcp.clipwright.io/mcp";

export const MCP_SERVER_TITLE = "Clipwright.io";
export const MCP_SERVER_ICONS = [
  { src: `${PUBLIC_SITE_BASE_URL}/brand/clipwright-512.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${PUBLIC_SITE_BASE_URL}/brand/clipwright-400.png`, mimeType: "image/png", sizes: ["400x400"] },
] as const;

export const CLI_PACKAGE = "@clipwright/cli";
export const CLI_BIN = "clipwright";
export const MCP_PACKAGE = "@clipwright/mcp-server";
export const SDK_PACKAGE = "@clipwright/sdk";

export const NODE_MIN_MAJOR = 20;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function apiBaseUrlFromEnv(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`CLIPWRIGHT_API_URL is not a URL: ${raw}`);
  }

  if (url.protocol === "https:") return raw;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return raw;

  throw new Error(
    `CLIPWRIGHT_API_URL must be https (loopback may be http), got ${url.protocol}//${url.hostname}. ` +
      "The api key travels in the Authorization header of every request to it.",
  );
}
