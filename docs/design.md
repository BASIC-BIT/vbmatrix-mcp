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
```

Implementation note: command builders intentionally avoid spaces inside `Point(...)` because public helper code reports VBAN-TEXT is sensitive to spaces after commas.

## Tool design

Read tools are small and direct:

- `vbmatrix_ping` returns version and connection metadata.
- `vbmatrix_get_engine` queries engine state.
- `vbmatrix_get_master` queries master clock state.
- `vbmatrix_get_slot_info` returns slot properties.
- `vbmatrix_get_point` returns gain, mute, and phase for one point.

Write tools are explicit and available by default. They can be narrowed with environment settings when server-side policy is useful:

- `vbmatrix_set_point_gain` validates gain range and target policy.
- `vbmatrix_set_point_mute` validates target policy.
- `vbmatrix_set_point_phase` validates target policy.
- `vbmatrix_restart_engine` respects the destructive-action opt-out gate.

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
