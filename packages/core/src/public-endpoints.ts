/** Public product addresses, one constant for everyone: the client and the landing page */
/** must name the same address. */

/** Our own domain; the platform-generated address still answers and is not retired. */
export const PUBLIC_API_BASE_URL = "https://api.clipwright.io";

/** The dashboard; paths are appended to it. NOT `APP_ORIGIN`, which comes from the environment. */
export const PUBLIC_APP_BASE_URL = "https://app.clipwright.io";

/** npm packages the product is called through. The landing page, `--help` and docs print */
/** these names, so they are contract, not page copy. */
export const CLI_PACKAGE = "@clipwright/cli";
export const CLI_BIN = "clipwright";
export const MCP_PACKAGE = "@clipwright/mcp-server";
export const SDK_PACKAGE = "@clipwright/sdk";

/** Node major from the client packages' `engines`; the quickstart names it. */
export const NODE_MIN_MAJOR = 20;

/** Loopback names are the only ones allowed `http:`: a local API goes nowhere, and */
/** requiring a certificate there would forbid development. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** API address FROM THE ENVIRONMENT, `https:` only: `Authorization: Bearer cw_…` goes there. */
/** An embedder's programmatic `baseUrl` is left alone; the code's author chooses it. */
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
