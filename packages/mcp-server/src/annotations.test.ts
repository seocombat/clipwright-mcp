import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ClipwrightClient } from "@clipwright/sdk";

import { createServer } from "./server.js";

/** Every tool needs a `title` and both hints; a tool's class follows its cost and consequences. */
const EXPECTED: Record<string, { readOnlyHint: boolean; destructiveHint: boolean }> = {
  make_ugc: { readOnlyHint: false, destructiveHint: false },
  create_actor: { readOnlyHint: false, destructiveHint: false },
  make_faceless: { readOnlyHint: false, destructiveHint: false },
  quote_faceless: { readOnlyHint: true, destructiveHint: false },
  upload_image: { readOnlyHint: false, destructiveHint: false },
  set_actor_defaults: { readOnlyHint: false, destructiveHint: false },
  delete_actor: { readOnlyHint: false, destructiveHint: true },
  get_run: { readOnlyHint: true, destructiveHint: false },
  quote_ugc: { readOnlyHint: true, destructiveHint: false },
  quote_actor: { readOnlyHint: true, destructiveHint: false },
  list_voices: { readOnlyHint: true, destructiveHint: false },
  list_actors: { readOnlyHint: true, destructiveHint: false },
  get_actor_defaults: { readOnlyHint: true, destructiveHint: false },
  get_account: { readOnlyHint: true, destructiveHint: false },
};

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
