# Installing the Clipwright MCP server

1. The user needs a Clipwright API key (`cw_...`). They issue it themselves at
   https://app.clipwright.io/api-keys after signing up at https://clipwright.io.
   Ask the user for the key; never invent one.
2. Node.js 20 or newer must be on the PATH (`node --version`).
3. Add the server to the MCP settings file (for Cline, `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "clipwright": {
      "command": "npx",
      "args": ["-y", "-p", "@clipwright/mcp-server", "clipwright-mcp"],
      "env": {
        "CLIPWRIGHT_API_KEY": "cw_..."
      }
    }
  }
}
```

4. Check the install by calling `get_account`: it is free and returns the balance.

Rendering spends credits, and an account opened by signing up starts with none.
Before `make_ugc` or `create_actor`, call `quote_ugc` or `quote_actor` and show
the user the price. `CLIPWRIGHT_CLIENT_ID` is optional; set it only where the
home directory is shared, cloned or read-only (containers, CI).
