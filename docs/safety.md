# Safety Model

VBMatrix can route live audio. The server exposes useful write tools by default and assumes the user's MCP harness is responsible for approval policy. Deployments that need a narrower server-side policy can opt out with environment variables.

## Gates

Write gates:

- `VBMATRIX_MCP_ALLOW_WRITES=false` disables point, channel label/reset, snapshot restore execution, and slot writes.
- `VBMATRIX_MCP_ALLOW_ALL_SUIDS=true` allows all SUIDs by default.
- Set `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false` and list SUIDs in `VBMATRIX_MCP_ALLOWED_SUIDS` for a server-side allowlist.
- Channels must be integers in the supported 1-based Matrix/Coconut channel range.

Destructive gate:

- `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` disables `vbmatrix_restart_engine`, `vbmatrix_reset_channel_routes`, slot reset, slot device assignment/removal, and any future destructive/system tools.

Slot device assignment/removal and slot reset also require `confirm=true` in the tool input. These tools are operator-in-the-loop actions because they can interrupt live audio devices even though they target one slot.

Broad point range tools also require command-level confirmation when executing. `vbmatrix_apply_point_range` dry-runs by default and requires `confirmApply=true` with `dryRun=false` before it sends a range command. `vbmatrix_remove_point` requires `confirmRemove=true` for single-point removal.

## Commands intentionally not exposed

Do not expose these as normal tools:

- `Command.Shutdown`
- `Command.Reset`
- `Command.ResetGrid`
- broad `Zone(...).Reset`
- unverified `Zone(...)` gain/mute/phase/copy/preset commands
- broad slot-wide `Input(...).Reset` or `Output(...).Reset` beyond explicit channel/range targets
- raw free-form VBAN-TEXT command execution

Slot-level `Slot(SUID).Reset` is exposed only as `vbmatrix_reset_slot`, with a SUID allowlist check, the destructive gate, explicit confirmation, and before/after slot-state queries.

## Query-before-write

Point, channel label, and slot write tools should query the affected target before and after sending a command. If a query times out, the write should still report that fact explicitly rather than hiding it.

Grouped operation and workflow tools should preserve query-before-write for each affected target. If a future batch tool supports partial application, that behavior must be explicit in the input schema and response; fail-closed all-or-nothing behavior is the default.

Snapshot restore preserves query-before-write by capturing the current selected point state before planning commands. Execution then re-queries each point after its command is sent.

## Preview and dry-run

Any future tool that can affect multiple targets, multiple properties, output buses, destructive/system state, or reset/remove behavior should provide a dry-run or preview mode before execution. Preview responses should show planned commands, target summaries, safety gate decisions, and validation failures without sending write VBAN-TEXT packets.

Primitive single-target setters do not need a separate preview mode when they already expose exact typed inputs and query-before-write responses.

`vbmatrix_restore_snapshot` dry-runs by default. To execute, callers must set `dryRun: false` and `confirmRestore: "RESTORE_SNAPSHOT"`. Plans that affect multiple points or commands additionally require `confirmBroadRestore: true` after reviewing the plan.

## Snapshot artifacts

Large snapshots are stored under `.vbmatrix-snapshots/`, which is gitignored. Snapshot file inputs are restricted to that directory so diff/restore tools do not become arbitrary local file readers.

## Network trust

The VBMatrix manual says TEXT command streams can receive messages from anywhere. Use this server on trusted local networks only, keep MCP local over stdio, and use OS/firewall controls for VBAN UDP exposure.

## Future live testing

Live tests must be opt-in and must require a gitignored fixture with safe SUIDs/channels. They should never infer safe channels from defaults.

`scripts/live-audio-verify.ts` is the manual live audio harness. It never writes Matrix routes unless both `--run` and `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO` are provided, and it restores the queried point state in a `finally` block where possible.
