# Architecture Overview

VBMatrix MCP is organized around explicit, testable layers. The MCP layer should not know packet bytes, and the VBAN layer should not know MCP concepts.

## Entry point

- `src/index.ts` creates the MCP server, registers tools, and connects stdio transport.
- `bin/cli.ts` is the package executable wrapper.

## Configuration (`src/config/`)

- Reads environment variables once and normalizes booleans, numbers, stream names, host, and safety gates.
- Defaults to accessible write/destructive tools while still allowing deployments to opt out or narrow writes by SUID.

## VBAN/VBMatrix core (`src/core/`)

- `vbanText.ts` builds and sends VBAN-TEXT packets.
- `commands.ts` builds VBMatrix command strings and parses simple query responses.
- `client.ts` exposes `query`, `send`, and `queryPointState` methods.
- `safety.ts` enforces write gates, destructive gates, SUID allowlists, identifier validation, and channel bounds.

## Tool registration (`src/tools/`)

- `registerAllTools.ts` is the single wiring point.
- `status.ts` contains read-only status and slot tools.
- `points.ts` contains routing point read/write tools.
- `system.ts` contains destructive/system operations, currently only engine restart.

## Infra + utils

- `src/infra/logger.ts` logs to stderr only.
- `src/utils/toolResponses.ts` formats MCP tool responses with text and structured JSON.
- `src/utils/toolAnnotations.ts` centralizes MCP read/write/destructive annotations.

## Tests

- `test/core` focuses on deterministic command strings, packet generation, parsing, and safety behavior.
- Live VBMatrix tests are intentionally not included yet. Add opt-in live tests later with a gitignored fixture describing safe SUID/channel ranges.
