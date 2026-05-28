# Architecture Overview

VB-Audio MCP is organized around explicit, testable layers. The MCP layer should not know packet bytes, and the VBAN layer should not know MCP concepts.

## Entry point

- `src/index.ts` creates the MCP server, registers tools, and connects stdio transport.
- `bin/cli.ts` is the package executable wrapper.

## Configuration (`src/config/`)

- Reads environment variables once and normalizes booleans, numbers, stream names, host, and safety gates.
- Defaults to accessible write/destructive tools while still allowing deployments to opt out or narrow writes by SUID.

## VBAN/VBMatrix core (`src/core/`)

- `vbanText.ts` builds and sends VBAN-TEXT packets. Query requests are sent on the configured command stream, but Matrix answers with a `Request Reply` service packet (`0x60` protocol byte).
- `commands.ts` builds VBMatrix command strings and parses simple query responses.
- `client.ts` exposes `query`, `send`, and `queryPointState` methods.
- `safety.ts` enforces write gates, destructive gates, SUID allowlists, identifier validation, and channel bounds.
- `snapshots.ts` defines the targeted snapshot format, pure diff logic, and point-restore planning.

## Tool registration (`src/tools/`)

- `registerAllTools.ts` is the public wiring point and delegates to registered product providers.
- `src/providers/` defines product-specific provider boundaries. Matrix and Voicemeeter are registered separately so Voicemeeter helper logic does not mix into Matrix tools.
- `status.ts` contains read-only status and slot tools.
- `points.ts` contains routing point read/write tools.
- `zones.ts` contains dry-run-first typed Matrix zone operations.
- `snapshots.ts` contains targeted snapshot capture, diff, and guarded restore tools.
- `system.ts` contains destructive/system operations, currently only engine restart.
- `matrixFiles.ts` contains read-only Matrix file-state queries and guarded preset patch `.xml` load/save-as tools.
- `src/providers/voicemeeter*.ts` contains Voicemeeter provider metadata, helper-process orchestration, raw Voicemeeter VBAN-TEXT handling, and `voicemeeter_*` tool runners.
- New Matrix primitive tools should live beside the VBMatrix concept they expose and should register through the Matrix provider path without changing existing tool names.
- Future grouped-operation tools should use shared command builders, schemas, and safety helpers from the primitive layer instead of introducing a second command syntax path.
- Workflow automation should usually live in `.opencode/skills/` or docs unless it has deterministic typed inputs, bounded effects, and a preview path suitable for an MCP tool.

## Infra + utils

- `src/infra/logger.ts` logs to stderr only.
- `src/utils/toolResponses.ts` formats MCP tool responses with text and structured JSON.
- `src/utils/toolAnnotations.ts` centralizes MCP read/write/destructive annotations.

## Tests

- `test/core` focuses on deterministic command strings, packet generation, parsing, and safety behavior.
- `docs/error-taxonomy.md` records the compatibility boundary for timeout classifications, Matrix `Err` replies, and safety error codes.
- Live VBMatrix/audio tests are intentionally not part of CI. `scripts/live-audio-verify.ts` is a manual, gated harness backed by deterministic WAV measurement helpers in `src/core/audioMeasurement.ts` and planning/evaluation helpers in `src/core/liveAudioVerification.ts`.

## Setup automation

- `.opencode/skills/vbmatrix-setup/SKILL.md` is the repo-local setup playbook for agents.
- `scripts/vban-smoke.ts` provides a direct VBAN-TEXT smoke test outside MCP harnesses.
- `scripts/live-audio-verify.ts` can prove route changes affected captured WAV audio when an operator explicitly opts in.
