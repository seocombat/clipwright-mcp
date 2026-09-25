/** API routes: the API contract test checks them against `app.routes`, and the quickstart */
/** prints the "what costs money" list from here. */
import { ACTOR_DEFAULTS_PATH } from "./broll-policy.js";

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
}

export const API_ENDPOINTS: readonly ApiEndpoint[] = [
  { method: "GET", path: "/health", billed: false, onQuickstart: true, jsonBody: false },
  { method: "GET", path: "/v1/voices", billed: false, onQuickstart: true, jsonBody: false },
  { method: "GET", path: "/v1/account", billed: false, onQuickstart: true, jsonBody: false },
  { method: "POST", path: "/v1/skills/make_ugc/quote", billed: false, onQuickstart: true, jsonBody: true },
  { method: "GET", path: "/v1/runs/:id", billed: false, onQuickstart: true, jsonBody: false },
  { method: "POST", path: "/v1/skills/make_ugc/run", billed: true, onQuickstart: true, jsonBody: true },
  { method: "GET", path: "/v1/public/skills", billed: false, onQuickstart: false, jsonBody: false },
  { method: "GET", path: "/v1/actors", billed: false, onQuickstart: false, jsonBody: false },
  { method: "DELETE", path: "/v1/actors/:id", billed: false, onQuickstart: false, jsonBody: false },
  { method: "GET", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: false },
  { method: "POST", path: ACTOR_DEFAULTS_PATH, billed: false, onQuickstart: false, jsonBody: true },
  { method: "POST", path: "/v1/skills/create_actor/quote", billed: false, onQuickstart: false, jsonBody: true },
  { method: "POST", path: "/v1/skills/create_actor/run", billed: true, onQuickstart: false, jsonBody: true },
  { method: "POST", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false },
  { method: "GET", path: "/internal/portfolio-metrics", billed: false, onQuickstart: false, jsonBody: false },
];

/** `GET /v1/runs/{id}`: the human notation, with the parameter in curly braces. */
export function endpointLabel(endpoint: ApiEndpoint): string {
  return `${endpoint.method} ${endpoint.path.replace(/:(\w+)/g, "{$1}")}`;
}

export const QUICKSTART_ENDPOINTS: readonly ApiEndpoint[] = API_ENDPOINTS.filter(
  (endpoint) => endpoint.onQuickstart,
);
