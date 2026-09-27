# Clipwright clients

Open-source clients for [Clipwright](https://clipwright.io): an API that turns a
script into a short video of an actor speaking it, or a script or a short brief
into a faceless video without an on-camera presenter: narration over an opening
animated clip and image scenes, ending with the narration (select 30–90 seconds;
it runs 25 seconds or more and up to 5 seconds past the selection). Your agent quotes the price for free,
starts the render, and gets a video URL back. Clipwright returns the
file; it does not publish anywhere.

| Package | What it is |
|---|---|
| [`@clipwright/mcp-server`](https://www.npmjs.com/package/@clipwright/mcp-server) | MCP server over stdio for Claude Code, Claude Desktop, Cursor, Cline and any other MCP host |
| [`@clipwright/cli`](https://www.npmjs.com/package/@clipwright/cli) | command-line client (`clipwright`, `clipwright-cli`) |
| [`@clipwright/sdk`](https://www.npmjs.com/package/@clipwright/sdk) | TypeScript client |
| [`@clipwright/core`](https://www.npmjs.com/package/@clipwright/core) | shared request and response schemas (zod) |

## MCP server in one line

```bash
claude mcp add clipwright -e CLIPWRIGHT_API_KEY=cw_... -- npx -y -p @clipwright/mcp-server clipwright-mcp
```

Put your own key from [app.clipwright.io/api-keys](https://app.clipwright.io/api-keys)
in place of `cw_...`. It needs Node.js 20 or newer. Other hosts, the tool list and
the environment variables: [`packages/mcp-server/README.md`](packages/mcp-server/README.md).

Quotes, voices, actors and the balance are free. Renders spend credits, and an
account opened by signing up starts with none: buy a pack at
[clipwright.io/pricing](https://clipwright.io/pricing) before the first render.

## Build from source

```bash
pnpm install
pnpm -r build
```

This repository mirrors the client packages of the Clipwright monorepo; each
release is synced here from there. Documentation: [clipwright.io/docs](https://clipwright.io/docs).
Privacy: [clipwright.io/privacy](https://clipwright.io/privacy).

MIT License — see [LICENSE](LICENSE).
