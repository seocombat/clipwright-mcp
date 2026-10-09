# Runs the published @clipwright/mcp-server over stdio: docker run -i -e CLIPWRIGHT_API_KEY=cw_... <image>
# The version is filled in by the sync from packages/mcp-server/package.json.
FROM node:24-slim

ARG MCP_SERVER_VERSION=0.26.0
RUN npm install -g "@clipwright/mcp-server@${MCP_SERVER_VERSION}" && npm cache clean --force

USER node
ENTRYPOINT ["clipwright-mcp"]
