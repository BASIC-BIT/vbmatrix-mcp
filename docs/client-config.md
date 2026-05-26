# MCP Client Configuration

VBMatrix MCP is a local stdio server. Keep `stdout` reserved for MCP protocol traffic and send human diagnostics through `npm run doctor`, `npm run smoke:vban`, or MCP tool responses instead of server logs.

Run these checks before wiring a client:

```bash
npm install
npm run build
npm run doctor
```

Use `npm run doctor -- --vban` only after VB-Audio Matrix is running and VBAN-TEXT is configured. It sends one read-only `Command.Version` query.

When a setup failure needs more evidence, run `npm run diagnostics:vban`. It sends the same fixed read-only query through the configured command stream, an intentionally wrong stream, and an intentionally wrong UDP port so the resulting JSON can show which failures are observable and which zero-packet timeouts remain indeterminate.

## Package Command

After npm publication, prefer package execution so clients do not depend on a source checkout path:

```json
{
  "command": "npx",
  "args": ["-y", "--package", "@basicbit/vbmatrix-mcp", "vbmatrix-mcp"]
}
```

For source checkouts, use the built CLI path:

```json
{
  "command": "node",
  "args": ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"]
}
```

## Environment

Common environment values:

```json
{
  "VBMATRIX_HOST": "127.0.0.1",
  "VBMATRIX_PORT": "6980",
  "VBMATRIX_STREAM": "Command1",
  "VBMATRIX_MCP_ALLOW_WRITES": "false",
  "VBMATRIX_MCP_ALLOW_DESTRUCTIVE": "false",
  "VBMATRIX_MCP_DISABLE_RAW_COMMANDS": "true",
  "VOICEMEETER_MCP_DISABLE_WRITES": "true",
  "VOICEMEETER_MCP_DISABLE_DESTRUCTIVE": "true",
  "VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API": "true",
  "VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT": "true"
}
```

Set writes, destructive tools, or raw escape hatches to enabled only when the client provides approval controls and the operator understands the Matrix routes, Matrix files, or Voicemeeter parameters being changed.

Matrix and Voicemeeter must not share a VBAN UDP port when both applications are open. Matrix defaults to `VBMATRIX_PORT=6980`. Raw Voicemeeter VBAN-TEXT uses separate `VOICEMEETER_VBAN_*` settings and defaults to `VOICEMEETER_VBAN_PORT=6982`; helper-backed `voicemeeter_*` tools other than `voicemeeter_raw_vban_text` do not use UDP.

## OpenCode

```json
{
  "mcp": {
    "vbmatrix": {
      "type": "local",
      "command": ["node", "D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "enabled": true,
      "environment": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "false",
        "VBMATRIX_MCP_ALLOW_DESTRUCTIVE": "false",
        "VOICEMEETER_MCP_DISABLE_WRITES": "true",
        "VOICEMEETER_MCP_DISABLE_DESTRUCTIVE": "true",
        "VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API": "true",
        "VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT": "true"
      }
    }
  },
  "permission": {
    "vbmatrix_*": "ask",
    "voicemeeter_*": "ask"
  }
}
```

## Claude Desktop

```json
{
  "mcpServers": {
    "vbmatrix": {
      "command": "node",
      "args": ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "env": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "false",
        "VBMATRIX_MCP_ALLOW_DESTRUCTIVE": "false"
      }
    }
  }
}
```

## Cursor

Use Cursor's MCP server configuration with the same `mcpServers` shape:

```json
{
  "mcpServers": {
    "vbmatrix": {
      "command": "node",
      "args": ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "env": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

## VS Code

For VS Code MCP-capable extensions that accept a local stdio server, use the extension's MCP server JSON with this command and environment:

```json
{
  "servers": {
    "vbmatrix": {
      "type": "stdio",
      "command": "node",
      "args": ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "env": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

## Codex CLI

Use a local stdio MCP entry and keep writes disabled until your Codex session requires them:

```toml
[mcp_servers.vbmatrix]
command = "node"
args = ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"]
env = { VBMATRIX_HOST = "127.0.0.1", VBMATRIX_MCP_ALLOW_WRITES = "false", VBMATRIX_MCP_ALLOW_DESTRUCTIVE = "false" }
```

## Copilot Coding Agent

Copilot coding agent cannot control a user's local VB-Audio Matrix unless the repository or environment explicitly provisions this local MCP server. Use the docs and skills in this repo for implementation guidance, and keep live VBAN validation as an operator-run step:

```bash
npm run doctor
npm run doctor -- --vban
```

Do not grant hosted agents access to a live Matrix instance unless the operator has intentionally provided a network path and safe write gates.

## First Tool Calls

After client discovery succeeds, start with read-only tools:

```text
vbmatrix_ping
vbmatrix_vban_diagnostics
vbmatrix_inspect_routes
vbmatrix_inspect_slots
vbmatrix_get_engine
voicemeeter_get_status
```

Use `vbmatrix_vban_diagnostics` before changing Matrix settings when query tools time out.
