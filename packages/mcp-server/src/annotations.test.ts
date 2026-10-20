import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ClipwrightClient } from "@clipwright/sdk";

import { createServer } from "./server.js";

/** Every tool needs a `title` and both hints; a tool's class follows its cost and consequences. */
const EXPECTED: Record<string, { readOnlyHint: boolean; destructiveHint: boolean }> = {
  list_workflows: { readOnlyHint: true, destructiveHint: false },
  get_workflow: { readOnlyHint: true, destructiveHint: false },
  prepare_workflow_plan: { readOnlyHint: false, destructiveHint: false },
  get_workflow_plan: { readOnlyHint: true, destructiveHint: false },
  approve_workflow_plan: { readOnlyHint: false, destructiveHint: false },
  quote_workflow_plan: { readOnlyHint: true, destructiveHint: false },
  run_workflow_plan: { readOnlyHint: false, destructiveHint: false },
  make_ugc: { readOnlyHint: false, destructiveHint: false },
  create_actor: { readOnlyHint: false, destructiveHint: false },
  make_faceless: { readOnlyHint: false, destructiveHint: false },
  quote_faceless: { readOnlyHint: true, destructiveHint: false },
  upload_image: { readOnlyHint: false, destructiveHint: false },
  create_upload: { readOnlyHint: false, destructiveHint: false },
  get_upload: { readOnlyHint: true, destructiveHint: false },
  create_asset: { readOnlyHint: false, destructiveHint: false },
  list_assets: { readOnlyHint: true, destructiveHint: false },
  get_asset: { readOnlyHint: true, destructiveHint: false },
  update_asset: { readOnlyHint: false, destructiveHint: false },
  delete_asset: { readOnlyHint: false, destructiveHint: true },
  set_actor_defaults: { readOnlyHint: false, destructiveHint: false },
  delete_actor: { readOnlyHint: false, destructiveHint: true },
  get_run: { readOnlyHint: true, destructiveHint: false },
  get_run_shots: { readOnlyHint: true, destructiveHint: false },
  quote_revision: { readOnlyHint: true, destructiveHint: false },
  revise_run: { readOnlyHint: false, destructiveHint: false },
  quote_candidate: { readOnlyHint: true, destructiveHint: false },
  create_candidate: { readOnlyHint: false, destructiveHint: false },
  list_generation_models: { readOnlyHint: true, destructiveHint: false },
  quote_image: { readOnlyHint: true, destructiveHint: false },
  generate_image: { readOnlyHint: false, destructiveHint: false },
  quote_video: { readOnlyHint: true, destructiveHint: false },
  generate_video: { readOnlyHint: false, destructiveHint: false },
  quote_ugc: { readOnlyHint: true, destructiveHint: false },
  quote_actor: { readOnlyHint: true, destructiveHint: false },
  list_voices: { readOnlyHint: true, destructiveHint: false },
  list_actors: { readOnlyHint: true, destructiveHint: false },
  get_actor_defaults: { readOnlyHint: true, destructiveHint: false },
  get_account: { readOnlyHint: true, destructiveHint: false },
};

/** Mutants: the retry field unnamed, a resend described as a new paid run, or a discarded candidate described as free. */
it("the create_candidate description says an identical request returns the same run, names take, and says a delivered candidate is charged kept or discarded", async () => {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    const create = tools.find((tool) => tool.name === "create_candidate");
    expect(create?.description).toContain("An identical request returns the same run it started before");
    expect(create?.description).toContain("pass take 2");
    expect(Object.keys(create?.inputSchema.properties ?? {})).toContain("take");
    expect(create?.description).toContain("A delivered candidate is charged its one unit whether it is kept or discarded");
    expect(create?.description).toContain("one that fails is charged nothing");
    expect(create?.description).toContain("Call quote_candidate first and show the user the price.");
  } finally {
    await client.close();
    await server.close();
  }
});

/** Mutants: a price unit unnamed, a failure described as charged, the rights confirmation or the retry field dropped. */
it("the generation tools name their price unit, a free failure, rights_confirmed, attempt and the closed state", async () => {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    const described = (name: string) => tools.find((tool) => tool.name === name);
    expect(described("list_generation_models")?.description).toContain("credits per image, or per second of a clip");
    expect(described("generate_image")?.description).toContain("credits per image");
    expect(described("generate_video")?.description).toContain("unit_credits per second of duration_s");
    for (const name of ["quote_image", "generate_image", "quote_video", "generate_video"]) {
      const tool = described(name);
      expect(tool?.description, name).toContain("A generation that fails is charged nothing, even when the vendor was already paid.");
      expect(tool?.description, name).toContain("rights_confirmed: true");
      expect(tool?.description, name).toContain("An identical request returns the same run it started before");
      expect(tool?.description, name).toContain("generations_disabled");
    }
    for (const name of ["generate_image", "generate_video"]) {
      expect(Object.keys(described(name)?.inputSchema.properties ?? {}), name).toContain("attempt");
      expect(described(name)?.description, name).toContain(`Call ${name.replace("generate", "quote")} first and show the user the price.`);
    }
  } finally {
    await client.close();
    await server.close();
  }
});

/** Mutants: the retry field unnamed, or a resend described as a new paid run. */
it("the revise_run description says an identical request returns the same run and names attempt", async () => {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    const revise = tools.find((tool) => tool.name === "revise_run");
    expect(revise?.description).toContain("An identical request returns the same run it started before");
    expect(revise?.description).toContain("pass attempt 2");
    expect(Object.keys(revise?.inputSchema.properties ?? {})).toContain("attempt");
    expect(revise?.description).toContain("Call quote_revision first and show the user the price.");
  } finally {
    await client.close();
    await server.close();
  }
});

it("every tool in tools/list carries a title and correct readOnlyHint/destructiveHint", async () => {
  const server = createServer(new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid" }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const tool of tools) {
      expect(tool.title, tool.name).toMatch(/\S/);
      expect(
        { readOnlyHint: tool.annotations?.readOnlyHint, destructiveHint: tool.annotations?.destructiveHint },
        tool.name,
      ).toEqual(EXPECTED[tool.name]);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
