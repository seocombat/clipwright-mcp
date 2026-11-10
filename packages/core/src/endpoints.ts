/** API routes: the API contract test checks them against `app.routes`, and the quickstart */
/** prints the "what costs money" list from here. */
import { ACTOR_PREVIEW_PATH } from "./actors.js";
import { ASSET_BYTES_PATH, ASSET_ITEM_PATH, ASSETS_PATH } from "./assets.js";
import { ACTOR_DEFAULTS_PATH } from "./broll-policy.js";
import { BRAND_EXTRACT_PATH, BRAND_KIT_PATH } from "./design.js";
import { CREATOR_PROFILE_PATH, CREATOR_PROFILE_QUOTE_PATH, CREATOR_PROFILES_PATH } from "./creator-profile.js";
import { TREND_SEARCH_PATH, TREND_SEARCH_QUOTE_PATH, TREND_SEARCHES_PATH } from "./trend-search.js";
import { FEEDBACK_PATH } from "./feedback.js";
import { FILM_DRAFT_FILES_PATH, FILM_DRAFT_PATH, FILM_DRAFTS_PATH } from "./film-drafts.js";
import { FILM_GUIDE_PATH, FILM_KIT_PATH } from "./film-guide.js";
import { FILM_HEROES_PATH, FILM_HEROES_QUOTE_PATH, FILM_RENDERS_PATH, FILM_RENDERS_QUOTE_PATH, FILM_RUN_PATH, FILM_STILLS_PATH, FILM_STILLS_QUOTE_PATH, FILM_VOICES_PATH,
  FILM_VOICES_QUOTE_PATH } from "./own-agent-runs.js";
import { GENERATION_MODELS_PATH } from "./generations.js";
import { PRICES_PATH } from "./prices.js";
import { REFERENCE_ANALYSES_PATH, REFERENCE_ANALYSIS_PATH, REFERENCE_ANALYSIS_QUOTE_PATH } from "./reference-analysis.js";
import { RUN_MEDIA_PATH } from "./run-media.js";
import { TEMPLATE_SOUNDS_PATH } from "./templates/sounds.js";
import { MOVES_PATH } from "./moves.js";

export const PUBLIC_WORKFLOWS_PATH = "/v1/public/workflows";
export const PUBLIC_WORKFLOW_PATH = "/v1/public/workflows/:id";
export const WORKFLOW_PLANS_PATH = "/v1/workflow-plans";
export const WORKFLOW_PLAN_PATH = "/v1/workflow-plans/:id";
/** A reference remake compiled into a new plan (#857): free, it starts nothing. */
export const WORKFLOW_REFERENCE_REMAKE_PATH = "/v1/workflow-plans/reference-remake";
export const WORKFLOW_REVISIONS_PATH = "/v1/workflow-plans/:id/revisions";
export const WORKFLOW_APPROVE_PATH = "/v1/workflow-plans/:id/approve";
export const WORKFLOW_QUOTE_PATH = "/v1/workflow-plans/:id/quote";
export const WORKFLOW_RUN_PATH = "/v1/workflow-plans/:id/run";
/** The OpenAPI 3.1 document, built from this registry and served without a key. */
export const OPENAPI_PATH = "/openapi.json";

export interface ApiEndpoint {
  method: "GET" | "POST" | "DELETE";
  /** The path in Hono notation: a parameter is `:id`. */
  path: string;
  /** Whether the call may charge credits. */
  billed: boolean;
  /** Whether the quickstart names it. */
  onQuickstart: boolean;
  /** Whether the route parses the body as JSON. `POST /v1/uploads` takes bytes. */
  jsonBody: boolean;
  /** Whether the cabinet may call it on a user's behalf. */
  cabinet: boolean;
  /** Whether the remote MCP server may call it with its `cwm_` assertion: a route a remote tool reaches. */
  mcp: boolean;
}

export const API_ENDPOINTS: readonly ApiEndpoint[] = [
  { method: "POST", path: "/v1/skills/make_faceless/quote", billed: false, onQuickstart: true, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/make_faceless/run", billed: true, onQuickstart: true, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/health", billed: false, onQuickstart: true, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/robots.txt", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: OPENAPI_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/v1/voices", billed: false, onQuickstart: true, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: TEMPLATE_SOUNDS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: MOVES_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/account", billed: false, onQuickstart: true, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/make_ugc/quote", billed: false, onQuickstart: true, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/runs/:id", billed: false, onQuickstart: true, jsonBody: false, cabinet: true, mcp: true },
  { method: "GET", path: "/v1/runs/:id/shots", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "GET", path: "/v1/runs/:id/edit", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "POST", path: "/v1/runs/:id/edit", billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: false },
  { method: "POST", path: "/v1/runs/:id/revisions/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: "/v1/runs/:id/revisions", billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: "/v1/runs/:id/candidates/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: "/v1/runs/:id/candidates", billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "GET", path: "/v1/runs/:id/candidates", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "DELETE", path: RUN_MEDIA_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "POST", path: "/v1/skills/make_ugc/run", billed: true, onQuickstart: true, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/public/skills", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: PRICES_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/v1/actors", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: ACTOR_PREVIEW_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "DELETE", path: "/v1/actors/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: BRAND_KIT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "POST", path: BRAND_KIT_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: BRAND_EXTRACT_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "GET", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "POST", path: "/v1/uploads/import", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads/intents", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/uploads/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "DELETE", path: "/v1/uploads/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  // Account assets (clipwright#724 F2). The bytes row stands before `:id`: `matchEndpoint` takes the first row that fits.
  { method: "POST", path: ASSETS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: ASSET_BYTES_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "GET", path: ASSETS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "GET", path: ASSET_ITEM_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "POST", path: ASSET_ITEM_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "DELETE", path: ASSET_ITEM_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "GET", path: "/internal/portfolio-metrics", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: PUBLIC_WORKFLOWS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: PUBLIC_WORKFLOW_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "POST", path: WORKFLOW_PLANS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: WORKFLOW_PLAN_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "POST", path: WORKFLOW_REFERENCE_REMAKE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_REVISIONS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_APPROVE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_RUN_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: GENERATION_MODELS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_image/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_image/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_video/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_video/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  // Reference analysis (reference-to-video S1c): paid since #927; its own hourly cap stands in the handler too. The Trends page uses it (#917).
  { method: "POST", path: REFERENCE_ANALYSIS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: REFERENCE_ANALYSES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "GET", path: REFERENCE_ANALYSIS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  // Creator profile (#999): paid, with its own hourly cap in the handler; the quote row stands before `:id`.
  { method: "POST", path: CREATOR_PROFILE_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CREATOR_PROFILES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: CREATOR_PROFILE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "DELETE", path: CREATOR_PROFILE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  // Topic search (#921): paid, with its own hourly cap in the handler; the quote row stands before `:id`. The Trends page quotes and starts (#917).
  { method: "POST", path: TREND_SEARCH_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: TREND_SEARCHES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "GET", path: TREND_SEARCH_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  // Feedback from an agent (#941): free, with its own hourly cap in the handler.
  { method: "POST", path: FEEDBACK_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  // Film drafts of the «own agent» mode (#1291 F2): free, behind CLIPWRIGHT_OWN_AGENT; the files row stands before `:id`'s own.
  { method: "POST", path: FILM_DRAFTS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_DRAFT_FILES_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: FILM_DRAFT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  // Its paid runs (#1337): stills, voice and render, each quoted first; one read of what a run delivered.
  { method: "POST", path: FILM_STILLS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_STILLS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_VOICES_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_VOICES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_RENDERS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_RENDERS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  // A hero saved as a mascot (#1356), quoted first like the rest.
  { method: "POST", path: FILM_HEROES_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_HEROES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: FILM_RUN_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  // The mode's guide and scene kit, read-only (#1356).
  { method: "GET", path: FILM_GUIDE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: FILM_KIT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
];

/** `GET /v1/runs/{id}`: the human notation, with the parameter in curly braces. */
export function endpointLabel(endpoint: ApiEndpoint): string {
  return `${endpoint.method} ${endpoint.path.replace(/:(\w+)/g, "{$1}")}`;
}

/** The row a request falls on, or `null`. Exact on purpose: the method as HTTP spells it (upper case) and the pathname alone,
 *  so a path with a query string matches no row; a caller that binds the query (the cabinet assertion) splits it off first. */
export function matchEndpoint(method: string, path: string): ApiEndpoint | null {
  const segments = path.split("/");
  return API_ENDPOINTS.find((endpoint) => {
    const pattern = endpoint.path.split("/");
    return endpoint.method === method && pattern.length === segments.length &&
      // A parameter is one plain identifier: a dot segment or a percent escape would name another path to a router.
      pattern.every((part, index) => (part.startsWith(":") ? /^[A-Za-z0-9_-]+$/.test(segments[index]!) : part === segments[index]));
  }) ?? null;
}

export const QUICKSTART_ENDPOINTS: readonly ApiEndpoint[] = API_ENDPOINTS.filter(
  (endpoint) => endpoint.onQuickstart,
);
