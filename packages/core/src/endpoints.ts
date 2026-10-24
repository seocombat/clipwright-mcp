/** API routes: the API contract test checks them against `app.routes`, and the quickstart */
/** prints the "what costs money" list from here. */
import { ASSET_BYTES_PATH, ASSET_ITEM_PATH, ASSETS_PATH } from "./assets.js";
import { ACTOR_DEFAULTS_PATH } from "./broll-policy.js";
import { GENERATION_MODELS_PATH } from "./generations.js";
import { TEMPLATE_SOUNDS_PATH } from "./templates/sounds.js";

export const PUBLIC_WORKFLOWS_PATH = "/v1/public/workflows";
export const PUBLIC_WORKFLOW_PATH = "/v1/public/workflows/:id";
export const WORKFLOW_PLANS_PATH = "/v1/workflow-plans";
export const WORKFLOW_PLAN_PATH = "/v1/workflow-plans/:id";
export const WORKFLOW_REVISIONS_PATH = "/v1/workflow-plans/:id/revisions";
export const WORKFLOW_APPROVE_PATH = "/v1/workflow-plans/:id/approve";
export const WORKFLOW_QUOTE_PATH = "/v1/workflow-plans/:id/quote";
export const WORKFLOW_RUN_PATH = "/v1/workflow-plans/:id/run";

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
  { method: "GET", path: "/v1/voices", billed: false, onQuickstart: true, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: TEMPLATE_SOUNDS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
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
  { method: "POST", path: "/v1/skills/make_ugc/run", billed: true, onQuickstart: true, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/public/skills", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/v1/actors", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "DELETE", path: "/v1/actors/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "GET", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "POST", path: "/v1/uploads/import", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads/intents", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: "/v1/uploads/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
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
  { method: "POST", path: WORKFLOW_REVISIONS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_APPROVE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: WORKFLOW_RUN_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: GENERATION_MODELS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_image/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_image/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_video/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/generate_video/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
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
