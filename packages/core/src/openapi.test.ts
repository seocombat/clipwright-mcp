import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { compileErrors, validate } from "@readme/openapi-parser";
import type { OpenAPIV3_1 } from "openapi-types";
import { describe, expect, it } from "vitest";
import { API_ENDPOINTS, endpointLabel } from "./endpoints.js";
import { z } from "zod";
import { buildOpenApiDocument, errorEnvelope, type NamedSchema, OPENAPI_ROUTES, openApiOperationPath, publicOpenApiRoutes } from "./openapi.js";
import { PUBLIC_API_BASE_URL } from "./public-endpoints.js";

const document = buildOpenApiDocument() as unknown as OpenAPIV3_1.Document;
const SUCCESS = ["200", "201", "202", "204"];

describe("the OpenAPI marking of the route registry", () => {
  it("marks every registry route public or excluded, and names no route the registry lacks", () => {
    expect(Object.keys(OPENAPI_ROUTES).sort()).toEqual(API_ENDPOINTS.map(endpointLabel).sort());
  });

  it("gives every excluded route a reason and keeps it out of the document", () => {
    const excluded = API_ENDPOINTS.filter((endpoint) => OPENAPI_ROUTES[endpointLabel(endpoint)]?.exposure === "excluded");
    expect(excluded.map(endpointLabel).sort()).toEqual(["GET /", "GET /internal/portfolio-metrics", "GET /robots.txt",
      "GET /v1/film-drafts/{id}", "GET /v1/film-guide", "GET /v1/film-kit", "GET /v1/film-runs/{id}", "GET /v1/public/actor-previews/{actor_id}/{version}/{file}", "POST /v1/film-drafts",
      "POST /v1/film-drafts/{id}/check", "POST /v1/film-drafts/{id}/files", "POST /v1/film-heroes", "POST /v1/film-heroes/quote", "POST /v1/film-renders", "POST /v1/film-renders/quote", "POST /v1/film-stills", "POST /v1/film-stills/quote",
      "POST /v1/film-voices", "POST /v1/film-voices/quote"]);
    for (const endpoint of excluded) {
      const route = OPENAPI_ROUTES[endpointLabel(endpoint)];
      expect(route?.exposure === "excluded" && route.reason.length > 20).toBe(true);
      expect(document.paths?.[openApiOperationPath(endpoint.path)]?.[endpoint.method.toLowerCase() as "get"]).toBeUndefined();
    }
  });

  it("puts every public route in the document with a response schema for each success status", () => {
    for (const { endpoint, route } of publicOpenApiRoutes()) {
      const operation = document.paths?.[openApiOperationPath(endpoint.path)]?.[endpoint.method.toLowerCase() as "get"];
      expect(operation, endpointLabel(endpoint)).toBeDefined();
      const statuses = Object.keys(operation!.responses ?? {}).filter((status) => SUCCESS.includes(status));
      expect(statuses.sort(), endpointLabel(endpoint)).toEqual(Object.keys(route.responses).sort());
      for (const status of statuses) {
        const response = operation!.responses![status] as OpenAPIV3_1.ResponseObject;
        if (status === "204") expect(response.content, endpointLabel(endpoint)).toBeUndefined();
        else expect(response.content?.["application/json"]?.schema, `${endpointLabel(endpoint)} ${status}`).toBeDefined();
      }
    }
  });

  it("declares a JSON request body on every route the registry marks as reading one", () => {
    // Mutant (Codex r2): drop `body` from one JSON route and its operation would publish no request body.
    const reading = publicOpenApiRoutes().filter(({ endpoint }) => endpoint.jsonBody);
    expect(reading.length).toBeGreaterThan(10);
    for (const { endpoint } of reading) {
      const operation = document.paths?.[openApiOperationPath(endpoint.path)]?.[endpoint.method.toLowerCase() as "post"];
      const body = operation?.requestBody as OpenAPIV3_1.RequestBodyObject | undefined;
      expect(body?.content?.["application/json"]?.schema, endpointLabel(endpoint)).toBeDefined();
    }
  });

  it("asks a billed route for Idempotency-Key and a keyed route for the key", () => {
    for (const { endpoint, route } of publicOpenApiRoutes()) {
      const operation = document.paths![openApiOperationPath(endpoint.path)]![endpoint.method.toLowerCase() as "get"]!;
      const header = (operation.parameters ?? []).find((parameter) => "name" in parameter && parameter.name === "Idempotency-Key") as
        | OpenAPIV3_1.ParameterObject | undefined;
      // A billed route names why it needs no key, or it requires one (#927: an analysis is one per asset).
      if (endpoint.billed) expect(header?.required ?? route.billedWithoutKey, endpointLabel(endpoint)).toBeTruthy();
      if (route.billedWithoutKey !== undefined) expect(header, endpointLabel(endpoint)).toBeUndefined();
      expect(operation.security, endpointLabel(endpoint)).toEqual(route.anonymous ? [] : [{ apiKey: [] }]);
    }
  });

  /** Mutant (#1036): the run read loses its query, and a client reading the document polls with sleeps. */
  it("declares the run read's wait_seconds query, capped at 50", () => {
    const parameters = (document.paths!["/v1/runs/{id}"]!.get!.parameters ?? []) as OpenAPIV3_1.ParameterObject[];
    expect(parameters.find((parameter) => parameter.name === "wait_seconds")).toMatchObject({
      in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 50 } });
  });

  it("describes every refusal with the shared error envelope", () => {
    for (const { endpoint } of publicOpenApiRoutes()) {
      const operation = document.paths![openApiOperationPath(endpoint.path)]![endpoint.method.toLowerCase() as "get"]!;
      expect(operation.responses?.default, endpointLabel(endpoint)).toEqual({ $ref: "#/components/responses/Error" });
    }
  });
});

describe("the OpenAPI document", () => {
  it("passes an external OpenAPI 3.1 validator", async () => {
    const result = await validate(structuredClone(document) as OpenAPIV3_1.Document);
    expect(result.valid ? "" : compileErrors(result)).toBe("");
    expect(result.specification).toBe("OpenAPI");
  });

  it("names the public server, the cw_ key scheme and the package version", () => {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    expect(document.openapi).toBe("3.1.1");
    expect(document.info.version).toBe(version);
    expect(document.servers).toEqual([{ url: PUBLIC_API_BASE_URL }]);
    expect(document.components?.securitySchemes?.apiKey).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("refers only to components it declares", () => {
    const refs = JSON.stringify(document).match(/"\$ref":"[^"]+"/g) ?? [];
    for (const ref of new Set(refs)) {
      const [, kind, name] = /"#\/components\/(\w+)\/([^"]+)"/.exec(ref) ?? [];
      expect(kind && name ? (document.components as Record<string, Record<string, unknown>>)[kind]?.[name] : undefined, ref).toBeDefined();
    }
  });

  it("is the same document on every build", () => {
    expect(buildOpenApiDocument()).toEqual(document);
  });

  it("publishes every schema exactly as zod converts it, apart from the $defs and Warnings references", () => {
    // Codex r3: a publishing step that drops `required` makes the document wider than the API, and no traffic shows it.
    const schemas = (document.components?.schemas ?? {}) as Record<string, unknown>;
    const uses = new Map<string, { schema: z.ZodType; io: Set<"input" | "output"> }>();
    const use = (entry: NamedSchema, io: "input" | "output") => {
      const known = uses.get(entry.name) ?? { schema: entry.schema, io: new Set<"input" | "output">() };
      known.io.add(io);
      uses.set(entry.name, known);
    };
    use({ name: "ErrorEnvelope", schema: errorEnvelope }, "output");
    for (const { route } of publicOpenApiRoutes()) {
      if (route.body !== undefined && "schema" in route.body) use(route.body, "input");
      for (const entry of Object.values(route.responses)) if (entry) use(entry as NamedSchema, "output");
    }
    // Undo the two rewrites the builder is allowed to make, then the rest must be untouched.
    const undo = (node: unknown, name: string): unknown => {
      if (Array.isArray(node)) return node.map((item) => undo(item, name));
      if (node === null || typeof node !== "object") return node;
      const { $ref, ...rest } = node as Record<string, unknown>;
      if ($ref === "#/components/schemas/Warnings") return { type: "array", items: { type: "string" }, ...undo(rest, name) as object };
      const back = typeof $ref === "string" && $ref.startsWith(`#/components/schemas/${name}.`) ? `#/$defs/${$ref.slice(`#/components/schemas/${name}.`.length)}` : $ref;
      return Object.fromEntries(Object.entries({ ...(back === undefined ? {} : { $ref: back }), ...rest }).map(([key, value]) => [key, undo(value, name)]));
    };
    expect(uses.size).toBeGreaterThan(20);
    for (const [name, { schema, io }] of uses) {
      const matches = [...io].some((side) => {
        const { $schema: _s, $defs, ...fresh } = z.toJSONSchema(schema, { io: side, unrepresentable: "any" }) as Record<string, unknown>;
        const defs = ($defs ?? {}) as Record<string, unknown>;
        return isDeepStrictEqual(undo(schemas[name], name), fresh) &&
          Object.entries(defs).every(([def, value]) => isDeepStrictEqual(undo(schemas[`${name}.${def}`], name), value));
      });
      expect(matches, `${name} differs from zod's own conversion`).toBe(true);
    }
  });

  it("keeps the speech vendor and the internal cabinet out of its prose", () => {
    const prose: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node === null || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if ((key === "description" || key === "summary") && typeof value === "string") prose.push(value);
        else walk(value);
      }
    };
    walk(document);
    expect(prose.filter((text) => /elevenlabs|cabinet/i.test(text))).toEqual([]);
  });
});
