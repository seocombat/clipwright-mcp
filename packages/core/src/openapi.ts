import { createRequire } from "node:module";
import { z } from "zod";
import { createActorInput, createActorQuote, personalActorId } from "./account-actors.js";
import { account } from "./account.js";
import { actorsResponse } from "./actors.js";
import {
  asset, assetId, ASSET_PUT_MEDIA_TYPES, assetBytesQuery, assetList, assetListQuery, createAssetRequest, pendingAsset, updateAssetRequest,
} from "./assets.js";
import { actorDefaults, actorDefaultsInput } from "./broll-policy.js";
import { offeredUgcInput } from "./contract-dispositions.js";
import { workflowCatalogResponse, workflowMethodResponse } from "./contracts/v1/workflow-catalog.js";
import { launchWorkflow, workflowLaunchResponse, workflowQuoteBinding } from "./contracts/v1/workflow-execution.js";
import { approveWorkflowPlan, createWorkflowPlan, saveWorkflowPlan, workflowPlanRead } from "./contracts/v1/workflow-plan.js";
import { workflowId, workflowMethodId } from "./contracts/v1/workflow-primitives.js";
import { workflowRun } from "./contracts/v1/workflow-run-read.js";
import { candidateQuote, candidateRequest, runCandidates } from "./edit-candidate.js";
import { runEdit, saveRunEdit } from "./edit-document.js";
import { revisionQuote, revisionRequest } from "./edit-revision.js";
import { runShots } from "./edit-shots.js";
import { ENDPOINT_NOTES } from "./endpoint-notes.js";
import { API_ERROR_CODES } from "./errors.js";
import { API_ENDPOINTS, type ApiEndpoint, endpointLabel } from "./endpoints.js";
import { facelessQuoteResponse } from "./faceless-public.js";
import { feedbackRequest, feedbackResponse } from "./feedback.js";
import { generateImageRequest, generateVideoRequest, generationModels, generationQuote } from "./generations.js";
import { pricesResponse } from "./prices.js";
import { PUBLIC_API_BASE_URL, PUBLIC_APP_BASE_URL } from "./public-endpoints.js";
import { healthResponse, publicSkillsResponse } from "./public-responses.js";
import { analysisQuoteResponse, analyzeReferenceRequest, referenceAnalysis, referenceAnalysisId } from "./reference-analysis.js";
import { runId } from "./runs.js";
import { quoteResponse } from "./skills.js";
import { templateSoundsList } from "./templates/sounds.js";
import {
  UPLOAD_MEDIA_TYPES, uploadId, uploadImportRequest, uploadIntentRequest, uploadIntentResponse, uploadItemResponse, uploadList, uploadResponse,
} from "./uploads.js";
import { serverFacelessInput } from "./voice-admission.js";
import { serverVoicesQuery } from "./voice-listing.js";
import { voicesResponse } from "./voices.js";
import { planReferenceRemake } from "./workflows/reference-remake.js";

/** `/openapi.json`: every registry route is marked public or excluded, and a */
/** public route names its request and response schemas; API tests parse their real responses with them. */

type SuccessStatus = 200 | 201 | 202 | 204;
export interface NamedSchema { readonly name: string; readonly schema: z.ZodType }
const named = (name: string, schema: z.ZodType): NamedSchema => ({ name, schema });

export interface PublicRoute {
  readonly exposure: "public";
  readonly operationId: string;
  readonly tag: OpenApiTag;
  /** Answers without a key, before the auth and rate-limit middleware. */
  readonly anonymous?: true;
  readonly body?: NamedSchema | { readonly mediaTypes: readonly string[] };
  readonly query?: z.ZodObject;
  /** One schema per path parameter, the core id schema the handlers check; API tests prove no accepted id falls outside it. */
  readonly params?: Readonly<Record<string, z.ZodType>>;
  /** The route takes `Idempotency-Key` without requiring it; a billed route requires it unless it names `billedWithoutKey`. */
  readonly optionalIdempotencyKey?: true;
  /** Why a billed route needs no key: what makes a resend answer the first call instead of charging again. */
  readonly billedWithoutKey?: string;
  /** `null`: no body. A public route without a success response does not compile. */
  readonly responses: Readonly<Partial<Record<SuccessStatus, NamedSchema | null>>> & ({ 200: unknown } | { 201: unknown } | { 202: unknown } | { 204: unknown });
}
export interface ExcludedRoute { readonly exposure: "excluded"; readonly reason: string }
export type OpenApiRoute = PublicRoute | ExcludedRoute;

const TAGS = {
  Service: "The API host itself.",
  Skills: "Quote and start runs. A quote charges nothing; a run holds credits and answers at once.",
  Runs: "One namespace for every run: state, shots, drafts, revisions and shot candidates.",
  Workflows: "Workflow methods and account plans compiled into native runs.",
  Uploads: "Pictures you send for a run, kept for a limited time.",
  Assets: "Pictures and clips kept on the account until you delete them.",
  Actors: "Actors saved on the account and their defaults.",
  Catalogs: "Voices, template sounds, generation models, skills and prices.",
  "Reference analysis": "A reference video read into a profile a remake plan takes.",
  Account: "Balance, debt and holds.",
  Feedback: "What is missing, confusing, wrong or slow; we read every one.",
} as const;
export type OpenApiTag = keyof typeof TAGS;

/** The shared refusal: `code` is a registered one, typed refusals add their own fields. */
export const errorEnvelope = z.object({
  error: z.looseObject({ code: z.enum(API_ERROR_CODES as [string, ...string[]]), message: z.string().min(1) }),
});

const Run = named("Run", workflowRun);
// Strict: the API refuses a key outside the offered fields (`unknown_field`) before the schema runs.
const MakeUgcInput = named("MakeUgcInput", offeredUgcInput.strict());
const RAW_UPLOAD = { mediaTypes: UPLOAD_MEDIA_TYPES };
const AssetItem = named("AssetItem", z.union([asset, pendingAsset]));
const RUN = { id: runId };
const ACTOR = { id: personalActorId };
const ASSET = { id: assetId };
const PLAN = { id: workflowId };
const openApiDocumentShape = z.looseObject({ openapi: z.string(), info: z.looseObject({}), paths: z.record(z.string(), z.unknown()) });

/** Keyed by `endpointLabel`; the test proves the keys are exactly the registry's. */
export const OPENAPI_ROUTES: Readonly<Record<string, OpenApiRoute>> = {
  "POST /v1/skills/make_faceless/quote": { exposure: "public", operationId: "quoteMakeFaceless", tag: "Skills",
    body: named("MakeFacelessInput", serverFacelessInput), responses: { 200: named("FacelessQuote", facelessQuoteResponse) } },
  "POST /v1/skills/make_faceless/run": { exposure: "public", operationId: "runMakeFaceless", tag: "Skills",
    body: named("MakeFacelessInput", serverFacelessInput), responses: { 202: Run, 200: Run } },
  "GET /health": { exposure: "public", operationId: "getHealth", tag: "Service", anonymous: true,
    responses: { 200: named("Health", healthResponse) } },
  "GET /": { exposure: "excluded", reason: "The host root names the human docs for crawlers; it is not an operation a client calls." },
  "GET /robots.txt": { exposure: "excluded", reason: "A plain-text crawler directive for the API host, not part of the client contract." },
  "GET /openapi.json": { exposure: "public", operationId: "getOpenApiDocument", tag: "Service", anonymous: true,
    responses: { 200: named("OpenApiDocument", openApiDocumentShape) } },
  "GET /v1/voices": { exposure: "public", operationId: "listVoices", tag: "Catalogs", query: serverVoicesQuery as unknown as z.ZodObject,
    responses: { 200: named("Voices", voicesResponse) } },
  "GET /v1/template-sounds": { exposure: "public", operationId: "listTemplateSounds", tag: "Catalogs",
    responses: { 200: named("TemplateSounds", templateSoundsList) } },
  "GET /v1/account": { exposure: "public", operationId: "getAccount", tag: "Account", responses: { 200: named("Account", account) } },
  "POST /v1/skills/make_ugc/quote": { exposure: "public", operationId: "quoteMakeUgc", tag: "Skills",
    body: MakeUgcInput, responses: { 200: named("UgcQuote", quoteResponse) } },
  "GET /v1/runs/{id}": { exposure: "public", operationId: "getRun", tag: "Runs", params: RUN, responses: { 200: Run } },
  "GET /v1/runs/{id}/shots": { exposure: "public", operationId: "getRunShots", tag: "Runs", params: RUN,
    responses: { 200: named("RunShots", runShots) } },
  "GET /v1/runs/{id}/edit": { exposure: "public", operationId: "getRunEdit", tag: "Runs", params: RUN, responses: { 200: named("RunEdit", runEdit) } },
  "POST /v1/runs/{id}/edit": { exposure: "public", operationId: "saveRunEdit", tag: "Runs", params: RUN,
    body: named("SaveRunEdit", saveRunEdit), responses: { 200: named("RunEdit", runEdit) } },
  "POST /v1/runs/{id}/revisions/quote": { exposure: "public", operationId: "quoteRevision", tag: "Runs", params: RUN,
    body: named("RevisionRequest", revisionRequest), responses: { 200: named("RevisionQuote", revisionQuote) } },
  "POST /v1/runs/{id}/revisions": { exposure: "public", operationId: "startRevision", tag: "Runs", params: RUN,
    body: named("RevisionRequest", revisionRequest), responses: { 202: Run, 200: Run } },
  "POST /v1/runs/{id}/candidates/quote": { exposure: "public", operationId: "quoteCandidate", tag: "Runs", params: RUN,
    body: named("CandidateRequest", candidateRequest), responses: { 200: named("CandidateQuote", candidateQuote) } },
  "POST /v1/runs/{id}/candidates": { exposure: "public", operationId: "createCandidate", tag: "Runs", params: RUN,
    body: named("CandidateRequest", candidateRequest), responses: { 202: Run, 200: Run } },
  "GET /v1/runs/{id}/candidates": { exposure: "public", operationId: "listCandidates", tag: "Runs", params: RUN,
    responses: { 200: named("RunCandidates", runCandidates) } },
  "POST /v1/skills/make_ugc/run": { exposure: "public", operationId: "runMakeUgc", tag: "Skills",
    body: MakeUgcInput, responses: { 202: Run, 200: Run } },
  "GET /v1/public/skills": { exposure: "public", operationId: "listPublicSkills", tag: "Catalogs", anonymous: true,
    responses: { 200: named("PublicSkills", publicSkillsResponse) } },
  "GET /v1/public/prices": { exposure: "public", operationId: "listPrices", tag: "Catalogs", anonymous: true,
    responses: { 200: named("Prices", pricesResponse) } },
  "GET /v1/actors": { exposure: "public", operationId: "listActors", tag: "Actors", responses: { 200: named("Actors", actorsResponse) } },
  "DELETE /v1/actors/{id}": { exposure: "public", operationId: "deleteActor", tag: "Actors", params: ACTOR, responses: { 204: null } },
  "GET /v1/actors/{id}/defaults": { exposure: "public", operationId: "getActorDefaults", tag: "Actors", params: ACTOR,
    responses: { 200: named("ActorDefaults", actorDefaults) } },
  "POST /v1/actors/{id}/defaults": { exposure: "public", operationId: "setActorDefaults", tag: "Actors", params: ACTOR,
    body: named("ActorDefaultsInput", actorDefaultsInput), responses: { 200: named("ActorDefaults", actorDefaults) } },
  "POST /v1/skills/create_actor/quote": { exposure: "public", operationId: "quoteCreateActor", tag: "Skills",
    body: named("CreateActorInput", createActorInput), responses: { 200: named("CreateActorQuote", createActorQuote) } },
  "POST /v1/skills/create_actor/run": { exposure: "public", operationId: "runCreateActor", tag: "Skills",
    body: named("CreateActorInput", createActorInput), responses: { 202: Run, 200: Run } },
  "POST /v1/uploads": { exposure: "public", operationId: "uploadImage", tag: "Uploads", body: RAW_UPLOAD,
    responses: { 201: named("Upload", uploadResponse) } },
  "GET /v1/uploads": { exposure: "public", operationId: "listUploads", tag: "Uploads", responses: { 200: named("Uploads", uploadList) } },
  "POST /v1/uploads/import": { exposure: "public", operationId: "importUpload", tag: "Uploads", optionalIdempotencyKey: true,
    body: named("UploadImportRequest", uploadImportRequest), responses: { 201: named("Upload", uploadResponse), 200: named("Upload", uploadResponse) } },
  "POST /v1/uploads/intents": { exposure: "public", operationId: "createUploadIntent", tag: "Uploads", optionalIdempotencyKey: true,
    body: named("UploadIntentRequest", uploadIntentRequest),
    responses: { 201: named("UploadIntent", uploadIntentResponse), 200: named("UploadIntent", uploadIntentResponse) } },
  "GET /v1/uploads/{id}": { exposure: "public", operationId: "getUpload", tag: "Uploads", params: { id: uploadId },
    responses: { 200: named("UploadItem", uploadItemResponse) } },
  "POST /v1/assets": { exposure: "public", operationId: "createAsset", tag: "Assets", optionalIdempotencyKey: true,
    body: named("CreateAssetRequest", createAssetRequest), responses: { 201: AssetItem, 202: AssetItem, 200: AssetItem } },
  "POST /v1/assets/bytes": { exposure: "public", operationId: "createAssetFromBytes", tag: "Assets", optionalIdempotencyKey: true,
    body: { mediaTypes: ASSET_PUT_MEDIA_TYPES }, query: assetBytesQuery, responses: { 201: AssetItem, 202: AssetItem, 200: AssetItem } },
  "GET /v1/assets": { exposure: "public", operationId: "listAssets", tag: "Assets", query: assetListQuery,
    responses: { 200: named("Assets", assetList) } },
  "GET /v1/assets/{id}": { exposure: "public", operationId: "getAsset", tag: "Assets", params: ASSET, responses: { 200: AssetItem } },
  "POST /v1/assets/{id}": { exposure: "public", operationId: "updateAsset", tag: "Assets", params: ASSET,
    body: named("UpdateAssetRequest", updateAssetRequest), responses: { 200: named("Asset", asset) } },
  "DELETE /v1/assets/{id}": { exposure: "public", operationId: "deleteAsset", tag: "Assets", params: ASSET, responses: { 204: null } },
  "GET /internal/portfolio-metrics": { exposure: "excluded",
    reason: "Internal funnel aggregates behind their own secret, outside the client contract (docs/03-api.md section 12)." },
  "GET /v1/public/workflows": { exposure: "public", operationId: "listWorkflows", tag: "Workflows", anonymous: true,
    responses: { 200: named("WorkflowCatalog", workflowCatalogResponse) } },
  "GET /v1/public/workflows/{id}": { exposure: "public", operationId: "getWorkflow", tag: "Workflows", anonymous: true, params: { id: workflowMethodId },
    responses: { 200: named("WorkflowMethod", workflowMethodResponse) } },
  "POST /v1/workflow-plans": { exposure: "public", operationId: "createWorkflowPlan", tag: "Workflows",
    body: named("CreateWorkflowPlan", createWorkflowPlan), responses: { 201: named("WorkflowPlan", workflowPlanRead) } },
  "GET /v1/workflow-plans/{id}": { exposure: "public", operationId: "getWorkflowPlan", tag: "Workflows", params: PLAN,
    responses: { 200: named("WorkflowPlan", workflowPlanRead) } },
  "POST /v1/workflow-plans/reference-remake": { exposure: "public", operationId: "planReferenceRemake", tag: "Workflows",
    body: named("PlanReferenceRemake", planReferenceRemake), responses: { 201: named("WorkflowPlan", workflowPlanRead) } },
  "POST /v1/workflow-plans/{id}/revisions": { exposure: "public", operationId: "saveWorkflowPlan", tag: "Workflows", params: PLAN,
    body: named("SaveWorkflowPlan", saveWorkflowPlan), responses: { 200: named("WorkflowPlan", workflowPlanRead) } },
  "POST /v1/workflow-plans/{id}/approve": { exposure: "public", operationId: "approveWorkflowPlan", tag: "Workflows", params: PLAN,
    body: named("ApproveWorkflowPlan", approveWorkflowPlan), responses: { 200: named("WorkflowPlan", workflowPlanRead) } },
  "POST /v1/workflow-plans/{id}/quote": { exposure: "public", operationId: "quoteWorkflowPlan", tag: "Workflows", params: PLAN,
    responses: { 200: named("WorkflowQuote", workflowQuoteBinding) } },
  "POST /v1/workflow-plans/{id}/run": { exposure: "public", operationId: "runWorkflowPlan", tag: "Workflows", params: PLAN,
    body: named("LaunchWorkflow", launchWorkflow),
    responses: { 202: named("WorkflowLaunch", workflowLaunchResponse), 200: named("WorkflowLaunch", workflowLaunchResponse) } },
  "GET /v1/generations/models": { exposure: "public", operationId: "listGenerationModels", tag: "Catalogs",
    responses: { 200: named("GenerationModels", generationModels) } },
  "POST /v1/skills/generate_image/quote": { exposure: "public", operationId: "quoteImage", tag: "Skills",
    body: named("GenerateImageRequest", generateImageRequest), responses: { 200: named("GenerationQuote", generationQuote) } },
  "POST /v1/skills/generate_image/run": { exposure: "public", operationId: "generateImage", tag: "Skills",
    body: named("GenerateImageRequest", generateImageRequest), responses: { 202: Run, 200: Run } },
  "POST /v1/skills/generate_video/quote": { exposure: "public", operationId: "quoteVideo", tag: "Skills",
    body: named("GenerateVideoRequest", generateVideoRequest), responses: { 200: named("GenerationQuote", generationQuote) } },
  "POST /v1/skills/generate_video/run": { exposure: "public", operationId: "generateVideo", tag: "Skills",
    body: named("GenerateVideoRequest", generateVideoRequest), responses: { 202: Run, 200: Run } },
  "POST /v1/reference-analyses/quote": { exposure: "public", operationId: "quoteAnalysis", tag: "Reference analysis",
    body: named("AnalyzeReferenceRequest", analyzeReferenceRequest), responses: { 200: named("AnalysisQuote", analysisQuoteResponse) } },
  "POST /v1/reference-analyses": { exposure: "public", operationId: "analyzeReference", tag: "Reference analysis",
    billedWithoutKey: "one live analysis per asset: a resend answers the same analysis, and only a succeeded one is charged",
    body: named("AnalyzeReferenceRequest", analyzeReferenceRequest),
    responses: { 202: named("ReferenceAnalysis", referenceAnalysis), 200: named("ReferenceAnalysis", referenceAnalysis) } },
  "GET /v1/reference-analyses/{id}": { exposure: "public", operationId: "getReferenceAnalysis", tag: "Reference analysis", params: { id: referenceAnalysisId },
    responses: { 200: named("ReferenceAnalysis", referenceAnalysis) } },
  "POST /v1/feedback": { exposure: "public", operationId: "sendFeedback", tag: "Feedback",
    body: named("FeedbackRequest", feedbackRequest),
    responses: { 201: named("Feedback", feedbackResponse), 200: named("Feedback", feedbackResponse) } },
};

function routeOf(endpoint: ApiEndpoint): OpenApiRoute {
  const route = OPENAPI_ROUTES[endpointLabel(endpoint)];
  if (route === undefined) throw new Error(`no OpenAPI marking for ${endpointLabel(endpoint)}`);
  return route;
}

/** Registry order, public rows only. */
export function publicOpenApiRoutes(): { endpoint: ApiEndpoint; route: PublicRoute }[] {
  return API_ENDPOINTS.flatMap((endpoint) => {
    const route = routeOf(endpoint);
    return route.exposure === "public" ? [{ endpoint, route }] : [];
  });
}

/** `:id` in Hono notation is `{id}` in OpenAPI. */
export const openApiOperationPath = (path: string): string => path.replace(/:(\w+)/g, "{$1}");

/** The declared body of a success status: a schema, `null` for no body, `undefined` when undeclared. */
export function openApiResponse(endpoint: ApiEndpoint, status: number): NamedSchema | null | undefined {
  const route = routeOf(endpoint);
  if (route.exposure !== "public") return undefined;
  return (route.responses as Partial<Record<number, NamedSchema | null>>)[status];
}

type Json = Record<string, unknown>;
const SCHEMA_REF = "#/components/schemas/";
const WARNINGS = { type: "array", items: { type: "string" } };

/** zod's local `$defs` would resolve against the document root, so they become components of their own. */
function toComponent(entry: NamedSchema, io: "input" | "output", schemas: Json): void {
  const json = z.toJSONSchema(entry.schema, { io, unrepresentable: "any" }) as Json;
  const defs = (json.$defs ?? {}) as Json;
  delete json.$schema;
  delete json.$defs;
  const rewrite = (node: unknown, key?: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => rewrite(item));
    if (node === null || typeof node !== "object") return node;
    const object = node as Json;
    if (typeof object.$ref === "string" && object.$ref.startsWith("#/$defs/")) {
      return { ...object, $ref: `${SCHEMA_REF}${entry.name}.${object.$ref.slice("#/$defs/".length)}` };
    }
    // Rule 3: an unmet parameter is a warning, never silence; the shared component says so once.
    if (key === "warnings" && object.type === "array" && JSON.stringify(object.items) === JSON.stringify(WARNINGS.items)) {
      const { type: _type, items: _items, ...rest } = object;
      return { $ref: `${SCHEMA_REF}Warnings`, ...rest };
    }
    if (object.properties !== null && typeof object.properties === "object") {
      const properties = Object.fromEntries(Object.entries(object.properties as Json).map(([name, value]) => [name, rewrite(value, name)]));
      return Object.fromEntries(Object.entries(object).map(([name, value]) => [name, name === "properties" ? properties : rewrite(value)]));
    }
    return Object.fromEntries(Object.entries(object).map(([name, value]) => [name, rewrite(value)]));
  };
  schemas[entry.name] = rewrite(json);
  for (const [name, def] of Object.entries(defs)) schemas[`${entry.name}.${name}`] = rewrite(def);
}

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

/** Routes whose 200 replays an earlier answer and whose fresh answer has another status. */
const SUCCESS_REPLAY = new Set(Object.entries(OPENAPI_ROUTES).flatMap(([label, route]) =>
  route.exposure === "public" && 200 in route.responses && (201 in route.responses || 202 in route.responses) ? [label] : []));

/** Pure: the same document from the same code, so the API builds it once and serves it from memory. */
export function buildOpenApiDocument() {
  const schemas: Json = {
    Warnings: { ...WARNINGS, description: "What the request named and the API did not honour; it is never dropped silently." },
  };
  const seen = new Map<string, z.ZodType>();
  const ref = (entry: NamedSchema, io: "input" | "output"): Json => {
    const known = seen.get(entry.name);
    if (known !== undefined && known !== entry.schema) throw new Error(`two schemas share the component name ${entry.name}`);
    if (known === undefined) {
      seen.set(entry.name, entry.schema);
      toComponent(entry, io, schemas);
    }
    return { $ref: `${SCHEMA_REF}${entry.name}` };
  };
  ref(named("ErrorEnvelope", errorEnvelope), "output");

  const paths: Record<string, Record<string, Json>> = {};
  for (const { endpoint, route } of publicOpenApiRoutes()) {
    const label = endpointLabel(endpoint);
    const note = ENDPOINT_NOTES[label];
    if (note === undefined) throw new Error(`no note for ${label}`);
    const pathNames = [...endpoint.path.matchAll(/:(\w+)/g)].map(([, name]) => name!);
    if (JSON.stringify(pathNames) !== JSON.stringify(Object.keys(route.params ?? {}))) {
      throw new Error(`${label} names path parameters [${pathNames.join(", ")}], its marking [${Object.keys(route.params ?? {}).join(", ")}]`);
    }
    const parameters: Json[] = pathNames.map((name) => {
      const { $schema: _schema, ...schema } = z.toJSONSchema(route.params![name]!, { io: "input", unrepresentable: "any" }) as Json;
      return { name, in: "path", required: true, schema };
    });
    if (route.query !== undefined) {
      const query = z.toJSONSchema(route.query, { io: "input", unrepresentable: "any" }) as { properties?: Json; required?: string[] };
      for (const [name, schema] of Object.entries(query.properties ?? {})) {
        const { description, ...rest } = schema as Json;
        parameters.push({ name, in: "query", required: query.required?.includes(name) ?? false, schema: rest,
          ...(typeof description === "string" && { description }) });
      }
    }
    if ((endpoint.billed && route.billedWithoutKey === undefined) || route.optionalIdempotencyKey) {
      parameters.push({ name: "Idempotency-Key", in: "header", required: endpoint.billed, schema: { type: "string", minLength: 1 },
        description: endpoint.billed
          ? "Required: a resend with the same key and body returns the first run instead of charging again."
          : "Optional: a resend with the same key and body returns the first answer." });
    }
    const responses: Json = {};
    for (const [status, entry] of Object.entries(route.responses) as [string, NamedSchema | null][]) {
      responses[status] = entry === null
        ? { description: "No content." }
        : { description: status === "200" && SUCCESS_REPLAY.has(label) ? "The earlier answer to the same request." : "Success.",
          content: { "application/json": { schema: ref(entry, "output") } } };
    }
    if (!route.anonymous) {
      responses["401"] = { $ref: "#/components/responses/Unauthorized" };
      responses["429"] = { $ref: "#/components/responses/RateLimited" };
    }
    responses.default = { $ref: "#/components/responses/Error" };
    const body = route.body === undefined ? undefined : "mediaTypes" in route.body
      ? { required: true, content: Object.fromEntries(route.body.mediaTypes.map((type) => [type, {}])) }
      : { required: true, content: { "application/json": { schema: ref(route.body, "input") } } };
    const item = paths[openApiOperationPath(endpoint.path)] ?? {};
    paths[openApiOperationPath(endpoint.path)] = item;
    item[endpoint.method.toLowerCase()] = {
      operationId: route.operationId,
      tags: [route.tag],
      summary: note.split(/(?<=\.)\s/)[0],
      description: note,
      security: route.anonymous ? [] : [{ apiKey: [] }],
      ...(parameters.length > 0 && { parameters }),
      ...(body !== undefined && { requestBody: body }),
      responses,
    };
  }

  const envelope = { "application/json": { schema: { $ref: `${SCHEMA_REF}ErrorEnvelope` } } };
  return {
    openapi: "3.1.1",
    info: {
      title: "Clipwright API",
      version: PACKAGE_VERSION,
      summary: "Agent-native video generation: UGC, faceless and long-form presenter videos.",
      description: "Quotes are free; a run holds credits and answers at once, and GET /v1/runs/{id} reports every run. "
        + "Parameters the API does not honour come back in warnings[], never silently. "
        + "Every refusal is one envelope, { error: { code, message } }, with typed fields for the codes that carry numbers.",
      contact: { name: "Clipwright", url: "https://clipwright.io/docs" },
    },
    servers: [{ url: PUBLIC_API_BASE_URL }],
    security: [{ apiKey: [] }],
    tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", bearerFormat: "cw_*",
          description: `A key starting with cw_, issued at ${PUBLIC_APP_BASE_URL}/api-keys and shown once.` },
      },
      responses: {
        Error: { description: "A refusal in the shared error envelope.", content: envelope },
        Unauthorized: { description: "The key is missing, malformed or revoked; nothing was charged.", content: envelope },
        RateLimited: { description: "Too many requests for the account's bucket; retry after Retry-After seconds.", content: envelope,
          headers: { "Retry-After": { schema: { type: "integer", minimum: 0 }, description: "Seconds until a retry can succeed." } } },
      },
      schemas,
    },
  };
}
export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;
