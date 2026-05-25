# VBMatrix MCP

Local [Model Context Protocol](https://modelcontextprotocol.io/) tools for controlling and inspecting [VB-Audio Matrix](https://vb-audio.com/Matrix/) through VBAN-TEXT.

This project is an early design + scaffold. It is unofficial and is not affiliated with VB-Audio Software.

## Scope

VBMatrix MCP runs locally through stdio and sends VBAN-TEXT packets to a configured VBMatrix host, normally `127.0.0.1:6980` with stream name `Command1`.

MVP goals:

- Query VBMatrix version, engine, master, and slot status.
- Diagnose VBAN-TEXT reachability, command stream setup, and Matrix `Request Reply` packets.
- Query a routing point's gain, mute, and phase state.
- Query, set, and remove input/output channel labels.
- Mutate a routing point's gain, mute, or phase by default, with server-side opt-out available.
- Mutate explicit point ranges with dry-run/confirmation safeguards.
- Mutate documented Matrix zones with dry-run/confirmation safeguards.
- Expose channel route resets and engine restart by default, with server-side opt-out available.
- Capture, diff, and plan/restore targeted Matrix snapshots for explicit slots and points.
- Run a minimal safe routing workflow for explicit point audition, cleanup, and emergency mute with dry-run and rollback data.

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

Direct VBAN-TEXT smoke test after VBMatrix is configured:

```bash
npm run smoke:vban
```

Run fixed read-only diagnostics scenarios for the configured stream, an intentionally wrong stream, and an intentionally wrong UDP port:

```bash
npm run diagnostics:vban
```

The scenario script always sends `Command.Version=?;` and does not expose raw VBAN command execution.

Safe local packaging and configuration diagnostics:

```bash
npm run doctor
```

`npm run doctor` checks Node, build output, package discovery metadata, and environment parsing without contacting Matrix. Add `-- --vban` only when you want it to send a read-only `Command.Version` query.

Matrix query replies are expected as VBAN SERVICE packets on stream `Request Reply`. The configured `VBMATRIX_STREAM` names the incoming TEXT command stream, normally `Command1`; do not change it to `Request Reply`.

`vbmatrix_vban_diagnostics` reports observed packet reasons such as wrong stream, unsupported protocol, or malformed packet data. If no UDP packets arrive before timeout, it reports `no_packets_observed` as indeterminate because UDP cannot reliably prove whether the cause is no listener, no command-stream reply, disabled stream, firewall/network block, wrong host/port, or Matrix not running.

See `docs/error-taxonomy.md` for compatibility notes on timeout classifications, Matrix `Err` replies, safety errors, and protocol-safe diagnostics.

Manual live audio verification harness:

```bash
npm run verify:live-audio
```

The live harness dry-runs by default. It only changes Matrix routes when `--run` is passed and `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO` is set. See `docs/live-audio-verification.md`.

## MCP Client Config

See `docs/client-config.md` for OpenCode, Claude Desktop, Cursor, VS Code, Codex CLI, and Copilot coding agent examples. Clients differ in approval policy; if your harness does not prompt before tool calls, set `VBMATRIX_MCP_ALLOW_WRITES=false` or `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` until approval controls are configured.

## Configuration

| Variable                         | Default     | Use                                                                                                       |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `VBMATRIX_HOST`                  | `127.0.0.1` | VBMatrix host/IP.                                                                                         |
| `VBMATRIX_PORT`                  | `6980`      | VBAN UDP port.                                                                                            |
| `VBMATRIX_STREAM`                | `Command1`  | VBAN-TEXT stream name.                                                                                    |
| `VBMATRIX_TIMEOUT_MS`            | `2000`      | Query response timeout.                                                                                   |
| `VBMATRIX_MCP_ALLOW_WRITES`      | `true`      | Enable point write tools. Set to `false` for read-only mode.                                              |
| `VBMATRIX_MCP_ALLOWED_SUIDS`     | empty       | Comma-separated SUID allowlist for writes when `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`, e.g. `VASIO8,VAIO1`. |
| `VBMATRIX_MCP_ALLOW_ALL_SUIDS`   | `true`      | Allow writes to all SUIDs when writes are enabled.                                                        |
| `VBMATRIX_MCP_ALLOW_DESTRUCTIVE` | `true`      | Allow destructive/system actions such as engine restart. Set to `false` to block them.                    |
| `VBMATRIX_MCP_LOG_LEVEL`         | `info`      | `debug`, `info`, `warn`, or `error`.                                                                      |

## Tools

The tool surface is intentionally layered:

- Primitive tools expose one explicit VBMatrix fact or one explicit command family.
- Grouped operation tools should coordinate several primitives for one explicit, typed task and include preview/dry-run support before broad writes.
- Workflow tools should be rare; prefer skills or playbooks when the task needs human judgment or fuzzy intent interpretation.

See `docs/matrix-command-coverage.md` for the source-linked Matrix command coverage registry, including implemented, partial, deferred, unsafe/destructive/file-affecting, and unknown command families.

Current primitive read tools:

- `vbmatrix_get_capabilities`
- `vbmatrix_ping`
- `vbmatrix_vban_diagnostics`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info`
- `vbmatrix_get_point`
- `vbmatrix_get_channel_label`
- `vbmatrix_get_preset_patch`
- `vbmatrix_capture_snapshot`
- `vbmatrix_diff_snapshots`

Current primitive write/destructive tools:

- `vbmatrix_set_point_gain` (`gainDb: "-inf"` removes the point.)
- `vbmatrix_set_point_mute`
- `vbmatrix_set_point_phase`
- `vbmatrix_remove_point`
- `vbmatrix_apply_point_range` (dry-runs by default; supports `gain`, `mute`, `phase`, and `remove`.)
- `vbmatrix_apply_zone` (dry-runs by default; supports `gain`, `mute`, `phase`, `reset`, `copy`, `store`, and `add`.)
- `vbmatrix_set_slot_online`
- `vbmatrix_set_slot_master`
- `vbmatrix_reset_slot` (`confirm: true` required; destructive gate)
- `vbmatrix_set_slot_device` (`kind: "ASIO" | "MME" | "KS" | "WDM"`, exact `deviceName`, `confirm: true` required; destructive gate)
- `vbmatrix_remove_slot_device` (`confirm: true` required; destructive gate)
- `vbmatrix_set_channel_label`
- `vbmatrix_remove_channel_label`
- `vbmatrix_reset_channel_routes` (requires `confirm: "RESET_CHANNEL_ROUTES"`)
- `vbmatrix_preset_patch` (dry-runs by default; supports documented preset patch apply, recall, copy, paste, delete, gain, mute, phase, resetZone, update, name, and comment operations.)
- `vbmatrix_restore_snapshot` (dry-run by default; execution requires `confirmRestore: "RESTORE_SNAPSHOT"`, and broad plans require `confirmBroadRestore: true`.)
- `vbmatrix_restart_engine`

Current grouped workflow tools:

- `vbmatrix_safe_route_workflow` supports only explicit point targets and three deterministic operations: `auditionRoute`, `cleanupRoutes`, and `emergencyMute`. It snapshots selected points, dry-runs by default, returns exact planned commands plus rollback commands, and executes only with `confirmApply: "SAFE_ROUTE_APPLY"`.

Write tools are available by default so the user's MCP harness can decide what should be called. Set `VBMATRIX_MCP_ALLOW_WRITES=false`, `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`, or `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` for narrower deployments. Slot reset and device changes should be operator-in-the-loop actions; use `vbmatrix_get_slot_info` first to copy current device strings and verify before/after state.

Future tools should keep natural-language interpretation in the agent layer. MCP schemas should use explicit SUIDs, channels, enum-like values, booleans, and bounded numbers instead of free-form routing goals.

## Preset Patch Scene Recipes

Read one preset patch before acting on it:

```json
{
  "index": 1
}
```

Preview applying a preset patch without changing live audio:

```json
{
  "index": 1,
  "operation": "apply"
}
```

Execute only after reviewing the dry-run command and confirming the target patch is disposable or intended for the live scene:

```json
{
  "index": 1,
  "operation": "apply",
  "dryRun": false,
  "confirmOperation": "PRESET_PATCH_WRITE"
}
```

`vbmatrix_apply_zone` uses the documented `Zone(SUID.IN[n], SUID.OUT[j]: SUID.IN[k], SUID.OUT[l])` VBAN-TEXT grammar from VB-Audio's forum. It dry-runs by default, requires `confirmApply: true` when `dryRun: false`, and reports that zone aggregate before/after state queries are not documented.

Preset patch writes query patch state before and after when Matrix replies to the documented status requests. Use `vbmatrix_capture_snapshot` before broad scene changes when you need a point-level rollback artifact. Preset patch load/save/save-as are deferred until file path safety is designed.

## Label And Reset Recipes

Read one input label:

```json
{
  "kind": "input",
  "suid": "VASIO8",
  "channel": 1
}
```

Set one output label:

```json
{
  "kind": "output",
  "suid": "ASIO128",
  "channel": 126,
  "label": "Control Room"
}
```

Remove labels from a documented Matrix channel range:

```json
{
  "kind": "input",
  "suid": "VASIO8",
  "startChannel": 1,
  "endChannel": 8
}
```

Reset all routes for one output channel:

```json
{
  "kind": "output",
  "suid": "ASIO128",
  "channel": 126,
  "confirm": "RESET_CHANNEL_ROUTES"
}
```

Range label setting is intentionally not exposed yet. The current Matrix manual documents range label queries and range label removal with an empty `Name`, but not assigning one non-empty label across a range.

Dry-run a zone mute across a documented Matrix rectangle:

```json
{
  "startInputSuid": "VASIO8",
  "startInputChannel": 1,
  "startOutputSuid": "ASIO128",
  "startOutputChannel": 125,
  "endInputSuid": "VASIO8",
  "endInputChannel": 2,
  "endOutputSuid": "ASIO128",
  "endOutputChannel": 126,
  "operation": "mute",
  "muted": true,
  "dryRun": true
}
```

Review the returned `command` before execution. Zone `reset` and `gainDb: "-inf"` build `Zone(...).Reset;` and require the destructive gate when executed.

Snapshot tools are targeted, not full-matrix scans. A snapshot contains selected slot metadata and selected point gain/mute/phase state; labels are listed as omissions until supported by typed snapshot capture. Preset patch metadata is available through `vbmatrix_get_preset_patch` but is not yet embedded in snapshots. Large snapshots are written to `.vbmatrix-snapshots/` and omitted from inline MCP responses by default.

Safe routing workflow preview for one explicit emergency mute:

```json
{
  "operation": "emergencyMute",
  "points": [
    {
      "inputSuid": "VASIO8",
      "inputChannel": 1,
      "outputSuid": "ASIO128",
      "outputChannel": 126
    }
  ]
}
```

Execute only after reviewing the returned snapshot and rollback commands:

```json
{
  "operation": "emergencyMute",
  "points": [
    {
      "inputSuid": "VASIO8",
      "inputChannel": 1,
      "outputSuid": "ASIO128",
      "outputChannel": 126
    }
  ],
  "dryRun": false,
  "confirmApply": "SAFE_ROUTE_APPLY"
}
```

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run check
npm run pack:check
```

See `docs/architecture.md`, `docs/client-config.md`, `docs/design.md`, `docs/safety.md`, `docs/live-audio-verification.md`, `docs/release.md`, `docs/skills.md`, `docs/workflows.md`, `docs/agentic-workflow.md`, and `docs/improvement-log.md` for design, client onboarding, verification, release, applied workflows, and lightweight maintainer loops.

Repo-local OpenCode skills:

- Catalog: `docs/skills.md`
- Skills: `.opencode/skills/*/SKILL.md`
