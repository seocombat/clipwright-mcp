import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ClipwrightClient } from "@clipwright/sdk";

const readFile = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  readFile.mockImplementation(actual.readFile);
  return { ...actual, readFile };
});

const { createServer, REMOTE_UPLOAD_REFUSAL } = await import("./server.js");

/** A remote server reads no file of the machine it runs on, whatever path a caller names. */

async function connected(fileAccess: "local" | "refuse") {
  const sdk = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid", clientId: "file-access" });
  const upload = vi.spyOn(sdk, "uploadImage");
  const server = createServer(sdk, { fileAccess });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "file-access-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, upload, close: async () => { await client.close(); await server.close(); } };
}

afterEach(() => readFile.mockClear());

describe("upload_image and the file access of the server", () => {
  it("refuse: a path is answered with a tool error naming the https image, and no file is read", async () => {
    const { client, upload, close } = await connected("refuse");
    try {
      const result = await client.callTool({ name: "upload_image", arguments: { path: "/etc/hostname" } });
      expect(result.isError).toBe(true);
      const text = JSON.stringify(result.content);
      expect(REMOTE_UPLOAD_REFUSAL).toContain("public https URL");
      expect(text).toContain("cannot read files on your machine");
      expect(text).toContain("public https URL");
      expect(readFile).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  // Mutant: the guard inverted or dropped would read the path here as well as above.
  it("local: the same call reads the named file, as the stdio server always did", async () => {
    const { client, close } = await connected("local");
    try {
      await client.callTool({ name: "upload_image", arguments: { path: "/etc/hostname" } });
      expect(readFile).toHaveBeenCalledWith("/etc/hostname");
    } finally {
      await close();
    }
  });

  it("the default is the stdio server's local access", async () => {
    const sdk = new ClipwrightClient({ apiKey: "cw_test", baseUrl: "http://unused.invalid", clientId: "file-access" });
    const server = createServer(sdk);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "file-access-test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      await client.callTool({ name: "upload_image", arguments: { path: "/etc/hostname" } });
      expect(readFile).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
