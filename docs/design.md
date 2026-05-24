# Initial Design

## Product boundary

This MCP server exposes explicit VBMatrix controls. It should not interpret fuzzy user intent in deterministic code. The agent/LLM decides what the user wants; the server provides small reliable tools, validation, and structured results.

## Transport

VBMatrix control uses VBAN-TEXT over UDP.

Packet basics:

- Magic bytes: `VBAN`.
- First header byte after magic: `0x52`, which is TEXT subprotocol plus the 256000 serial-rate index used by known working implementations.
- UTF-8 format byte: `0x10`.
- Stream name: 16-byte null-padded string, default `Command1`.
- Frame counter: 32-bit little-endian.
- Payload: UTF-8 VBMatrix command string.

## Command model

Core read commands:

```text
Command.Version=?;
Command.Engine=?;
Command.Master=?;
Slot(VASIO8).Info=?;
Slot(VASIO8).Online=?;
Slot(VASIO8).RunningStatus=?;
Point(VASIO8.IN[1],VASIO8.OUT[1]).dBGain=?;
Point(VASIO8.IN[1],VASIO8.OUT[1]).Mute=?;
Point(VASIO8.IN[1],VASIO8.OUT[1]).Phase=?;
```

Core write commands:

```text
Point(VASIO8.IN[1],VASIO8.OUT[1]).dBGain=-6;
Point(VASIO8.IN[1],VASIO8.OUT[1]).Mute=1;
Point(VASIO8.IN[1],VASIO8.OUT[1]).Phase=0;
Command.Restart;
```

Implementation notes:

- Command builders intentionally avoid spaces inside `Point(...)` because public helper code reports VBAN-TEXT is sensitive to spaces after commas.
- Point channel numbers are validated as 1-based, up to the largest documented Coconut matrix size. Slot-specific channel counts should be discovered before broad edits.

## Tool surface taxonomy

The public MCP tool surface is layered so later PRs can add capability without turning the server into a fuzzy command interpreter.

### Layer 1: primitives

Primitive tools expose one explicit VBMatrix fact or one explicit VBMatrix command family. They are the default choice for new functionality.

Conventions:

- Name reads as `vbmatrix_get_<noun>` or another small verb that describes the exact query.
- Name writes as `vbmatrix_set_<noun>_<property>` when they assign one property on one target.
- Accept typed identifiers, channel numbers, booleans, enums, and bounded numbers. Do not accept natural-language instructions.
- Return structured JSON with the exact command string when a command is sent.
- Use MCP annotations that match the operation: read-only, write, or destructive.
- Keep scans bounded and opt-in; do not make broad discovery part of a primitive unless the tool name says so.

Current primitives:

Read tools are small and direct:

- `vbmatrix_ping` returns version and connection metadata.
- `vbmatrix_get_engine` queries engine state.
- `vbmatrix_get_master` queries master clock state.
- `vbmatrix_get_slot_info` returns slot properties.
- `vbmatrix_get_point` returns gain, mute, and phase for one point.
- `vbmatrix_capture_snapshot` captures explicit selected slot metadata and point state.
- `vbmatrix_diff_snapshots` compares two explicit Matrix snapshots.

Write tools are explicit and available by default. They can be narrowed with environment settings when server-side policy is useful:

- `vbmatrix_set_point_gain` validates gain range and target policy.
- `vbmatrix_set_point_mute` validates target policy.
- `vbmatrix_set_point_phase` validates target policy.
- `vbmatrix_restore_snapshot` restores selected point properties from a snapshot; it dry-runs by default and requires explicit confirmation before writes.
- `vbmatrix_restart_engine` respects the destructive-action opt-out gate.

## Snapshot format

Snapshots are deterministic JSON objects with `schemaVersion: 1` and explicit scope. They do not infer endpoints from names or labels.

Included data:

- `metadata`: optional Matrix version, engine, and master values when those queries succeed.
- `scope.slots`: selected slot SUIDs.
- `scope.points`: selected point targets.
- `slots`: selected slot `Info`, `Online`, `RunningStatus`, `Master`, and `Device` values.
- `points`: selected point `dBGain`, `mute`, and `phase` values.
- `omissions`: currently records labels and preset metadata as unsupported by typed queries.

Snapshot tools intentionally avoid full-matrix dumps by default. Large captures are written to `.vbmatrix-snapshots/` and responses return a summary plus artifact path instead of dumping the full object into chat.

Restore planning uses only selected point state. Slot metadata, labels, and preset metadata are non-restorable until typed write/query commands exist for them.

### Layer 2: grouped operations

Grouped operation tools coordinate several primitive operations for one explicit task, such as setting multiple properties on one point or applying a small caller-supplied set of routing changes.

Conventions:

- Name grouped operations as `vbmatrix_apply_<noun>` or `vbmatrix_update_<noun>` only when they perform more than one primitive action.
- Inputs must be explicit lists, targets, and values. Avoid intent-shaped fields such as `goal`, `preset description`, or `make it work`.
- Provide `dryRun` or `preview` before sending commands when the grouped operation can affect more than one target, more than one property, or an output bus.
- Preview responses should include planned commands, target summaries, safety decisions, and validation errors, without sending VBAN-TEXT write commands.
- Execution responses should include per-step results, the commands sent, and enough `before`/`after` state for an agent or user to audit the change.
- Preserve query-before-write for each affected target unless a future design explicitly documents why a target cannot be queried.
- If any step is blocked by safety policy, fail closed by default rather than partially applying a batch. Partial-apply behavior must be opt-in and visible in the schema.

Grouped operations should be added only after the underlying primitive tools and command builders exist. They should call shared command/safety helpers, not synthesize ad hoc command strings.

### Layer 3: workflows

Workflow tools encode a named operational procedure across several grouped operations or system concepts, such as a guided sound-check, safe matrix snapshot, or recovery routine.

Conventions:

- Prefer an OpenCode skill, README playbook, or external runbook when the workflow requires human judgment, fuzzy intent, UI inspection, or environment-specific choices.
- Add a workflow MCP tool only when the procedure has stable deterministic inputs, bounded effects, inspectable preview output, and clear rollback or stopping points.
- Name workflow tools with a concrete verb and domain object, for example `vbmatrix_prepare_<workflow>` or `vbmatrix_verify_<workflow>`. Do not use broad names such as `vbmatrix_fix_audio`.
- Include a dry-run/preview path for any workflow that can write, restart, remove, reset, or fan out across multiple targets.
- Keep workflow tools sparse. The agent should compose primitives and grouped operations when the steps are situational.

### When not to add a tool

Do not add a deterministic MCP tool when the missing behavior is primarily interpretation of ambiguous user language. In those cases, expose smaller facts or validations for the agent to use, then let the agent decide which primitive or grouped operation to call.

## Response shape

Write responses should include:

- `ok`: boolean.
- `command`: exact command sent.
- `target`: SUID/channel target.
- `before`: queried pre-state when available.
- `after`: queried post-state when available.
- `safety`: relevant safety gates that allowed or blocked execution.

## Not in MVP

- Raw free-form command execution.
- Full-matrix scans by default.
- Preset patch editing.
- `Remove`, `Reset`, `ResetGrid`, or `Shutdown` tools.
- VBAN SERVICE subscriptions or meter streaming.
