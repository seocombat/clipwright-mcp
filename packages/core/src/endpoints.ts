import { ACTOR_PREVIEW_PATH } from "./actors.js";
import { ASSET_BYTES_PATH, ASSET_ITEM_PATH, ASSETS_PATH } from "./assets.js";
import { ACTOR_DEFAULTS_PATH } from "./broll-policy.js";
import { BRAND_EXTRACT_PATH, BRAND_KIT_PATH } from "./design.js";
import { BRAND_STYLE_PROPOSE_PATH, BRAND_STYLES_PATH } from "./brand-styles.js";
import { CREATOR_PROFILE_PATH, CREATOR_PROFILE_QUOTE_PATH, CREATOR_PROFILES_PATH } from "./creator-profile.js";
import { TREND_SEARCH_PATH, TREND_SEARCH_QUOTE_PATH, TREND_SEARCHES_PATH } from "./trend-search.js";
import { TREND_NICHES_PATH } from "./trend-niches.js";
import { FEEDBACK_PATH } from "./feedback.js";
import { FILM_DRAFT_CHECK_PATH, FILM_DRAFT_FILES_PATH, FILM_DRAFT_PATH, FILM_DRAFTS_PATH } from "./film-drafts.js";
import { FILM_GUIDE_PATH, FILM_KIT_PATH } from "./film-guide.js";
import { CUT_PREVIEWS_PATH, CUT_PREVIEWS_QUOTE_PATH, FILM_CUT_CHECK_PATH, FILM_CUTS_PATH, FILM_CUTS_QUOTE_PATH } from "./film-cut.js";
import { CUT_PATH, CUTS_PATH } from "./cuts.js";
import { AD_GUIDE_PATH } from "./ad-guide.js";
import { AD_PATH, ADS_PATH } from "./ads.js";
import { FILM_EDITS_PATH, FILM_EDITS_QUOTE_PATH, FILM_HEROES_PATH, FILM_HEROES_QUOTE_PATH, FILM_RENDERS_PATH, FILM_RENDERS_QUOTE_PATH, FILM_RUN_PATH, FILM_STILLS_PATH, FILM_STILLS_QUOTE_PATH, FILM_VOICES_PATH,
  FILM_VOICES_QUOTE_PATH, TAKE_CHECKS_PATH, TAKE_CHECKS_QUOTE_PATH, TAKE_FRAMES_PATH, TAKE_FRAMES_QUOTE_PATH } from "./own-agent-runs.js";
import { GENERATION_MODELS_PATH } from "./generations.js";
import { UPSCALE_QUOTE_PATH, UPSCALE_RUN_PATH } from "./upscale.js";
import { PRICES_PATH } from "./prices.js";
import { REFERENCE_ANALYSES_PATH, REFERENCE_ANALYSIS_PATH, REFERENCE_ANALYSIS_QUOTE_PATH } from "./reference-analysis.js";
import { RUN_MEDIA_PATH } from "./run-media.js";
import { TEMPLATE_SOUNDS_PATH } from "./templates/sounds.js";
import { MOVES_PATH } from "./moves.js";

export const PUBLIC_WORKFLOWS_PATH = "/v1/public/workflows";
export const PUBLIC_WORKFLOW_PATH = "/v1/public/workflows/:id";
export const WORKFLOW_PLANS_PATH = "/v1/workflow-plans";
export const WORKFLOW_PLAN_PATH = "/v1/workflow-plans/:id";
export const WORKFLOW_REFERENCE_REMAKE_PATH = "/v1/workflow-plans/reference-remake";
export const WORKFLOW_REVISIONS_PATH = "/v1/workflow-plans/:id/revisions";
export const WORKFLOW_APPROVE_PATH = "/v1/workflow-plans/:id/approve";
export const WORKFLOW_QUOTE_PATH = "/v1/workflow-plans/:id/quote";
export const WORKFLOW_RUN_PATH = "/v1/workflow-plans/:id/run";
export const OPENAPI_PATH = "/openapi.json";

export interface ApiEndpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  billed: boolean;
  onQuickstart: boolean;
  jsonBody: boolean;
  cabinet: boolean;
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
  { method: "POST", path: BRAND_STYLE_PROPOSE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: BRAND_STYLES_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/quote", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/skills/create_actor/run", billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "GET", path: "/v1/uploads", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: false },
  { method: "POST", path: "/v1/uploads/import", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads/intents", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/uploads/pages", billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: "/v1/public/upload-pages/:token", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: false },
  { method: "GET", path: "/v1/uploads/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "DELETE", path: "/v1/uploads/:id", billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
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
  { method: "POST", path: UPSCALE_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: UPSCALE_RUN_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: REFERENCE_ANALYSIS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: REFERENCE_ANALYSES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "GET", path: REFERENCE_ANALYSIS_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: true, mcp: true },
  { method: "POST", path: CREATOR_PROFILE_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CREATOR_PROFILES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: CREATOR_PROFILE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "DELETE", path: CREATOR_PROFILE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: TREND_SEARCH_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: TREND_SEARCHES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "GET", path: TREND_SEARCH_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: TREND_NICHES_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: TREND_NICHES_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: true, mcp: true },
  { method: "POST", path: FEEDBACK_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_DRAFTS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_DRAFT_FILES_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_DRAFT_CHECK_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: FILM_DRAFT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: FILM_STILLS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_STILLS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_VOICES_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_VOICES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_RENDERS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_RENDERS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_HEROES_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_HEROES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_EDITS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_EDITS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: TAKE_FRAMES_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: TAKE_FRAMES_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: TAKE_CHECKS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: TAKE_CHECKS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: FILM_RUN_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: FILM_CUT_CHECK_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_CUTS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: FILM_CUTS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CUT_PREVIEWS_QUOTE_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CUT_PREVIEWS_PATH, billed: true, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CUTS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: CUT_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: CUT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: FILM_GUIDE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: FILM_KIT_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "GET", path: AD_GUIDE_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
  { method: "POST", path: ADS_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "POST", path: AD_PATH, billed: false, onQuickstart: false, jsonBody: true, cabinet: false, mcp: true },
  { method: "GET", path: AD_PATH, billed: false, onQuickstart: false, jsonBody: false, cabinet: false, mcp: true },
];

export function endpointLabel(endpoint: ApiEndpoint): string {
  return `${endpoint.method} ${endpoint.path.replace(/:(\w+)/g, "{$1}")}`;
}

export function matchEndpoint(method: string, path: string): ApiEndpoint | null {
  const segments = path.split("/");
  return API_ENDPOINTS.find((endpoint) => {
    const pattern = endpoint.path.split("/");
    return endpoint.method === method && pattern.length === segments.length &&
      pattern.every((part, index) => (part.startsWith(":") ? /^[A-Za-z0-9_-]+$/.test(segments[index]!) : part === segments[index]));
  }) ?? null;
}

export const QUICKSTART_ENDPOINTS: readonly ApiEndpoint[] = API_ENDPOINTS.filter(
  (endpoint) => endpoint.onQuickstart,
);
