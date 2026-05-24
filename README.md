# VBMatrix MCP

Local [Model Context Protocol](https://modelcontextprotocol.io/) tools for controlling and inspecting [VB-Audio Matrix](https://vb-audio.com/Matrix/) through VBAN-TEXT.

This project is an early design + scaffold. It is unofficial and is not affiliated with VB-Audio Software.

## Scope

VBMatrix MCP runs locally through stdio and sends VBAN-TEXT packets to a configured VBMatrix host, normally `127.0.0.1:6980` with stream name `Command1`.

MVP goals:

- Query VBMatrix version, engine, master, and slot status.
- Query a routing point's gain, mute, and phase state.
- Mutate a routing point's gain, mute, or phase only when writes and SUIDs are explicitly allowed.
- Keep destructive actions disabled unless explicitly enabled.

## Install From Source

Requirements:

- Node.js 24.15.0 or newer.
- VB-Audio Matrix with VBAN service and the TEXT command stream enabled.
- An MCP client that can run local stdio servers.

```bash
npm install
npm run build
```

Run locally during development:

```bash
npm run dev
```

## MCP Client Config

### OpenCode

```json
{
  "mcp": {
    "vbmatrix": {
      "type": "local",
      "command": ["node", "D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "enabled": true,
      "environment": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "true"
      }
    }
  },
  "permission": {
    "vbmatrix_*": "ask"
  }
}
```

### Claude Desktop, Cursor, Kiro, Roo, Windsurf

```json
{
  "mcpServers": {
    "vbmatrix": {
      "command": "node",
      "args": ["D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "env": {
        "VBMATRIX_HOST": "127.0.0.1",
        "VBMATRIX_MCP_ALLOW_WRITES": "true"
      }
    }
  }
}
```

## Configuration

| Variable | Default | Use |
| --- | --- | --- |
| `VBMATRIX_HOST` | `127.0.0.1` | VBMatrix host/IP. |
| `VBMATRIX_PORT` | `6980` | VBAN UDP port. |
| `VBMATRIX_STREAM` | `Command1` | VBAN-TEXT stream name. |
| `VBMATRIX_TIMEOUT_MS` | `2000` | Query response timeout. |
| `VBMATRIX_MCP_ALLOW_WRITES` | `true` | Enable point write tools. Set to `false` for read-only mode. |
| `VBMATRIX_MCP_ALLOWED_SUIDS` | empty | Comma-separated SUID allowlist for writes when `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`, e.g. `VASIO8,VAIO1`. |
| `VBMATRIX_MCP_ALLOW_ALL_SUIDS` | `true` | Allow writes to all SUIDs when writes are enabled. |
| `VBMATRIX_MCP_ALLOW_DESTRUCTIVE` | `true` | Allow destructive/system actions such as engine restart. Set to `false` to block them. |
| `VBMATRIX_MCP_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |

## Tools

Read tools:

- `vbmatrix_ping`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info`
- `vbmatrix_get_point`

Write tools:

- `vbmatrix_set_point_gain`
- `vbmatrix_set_point_mute`
- `vbmatrix_set_point_phase`
- `vbmatrix_restart_engine`

Write tools are available by default so the user's MCP harness can decide what should be called. Set `VBMATRIX_MCP_ALLOW_WRITES=false`, `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`, or `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` for narrower deployments.

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run check
```

See `docs/architecture.md`, `docs/design.md`, and `docs/safety.md` for the initial design.
