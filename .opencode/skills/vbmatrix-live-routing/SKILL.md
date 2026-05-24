---
name: vbmatrix-live-routing
description: Inspect, apply, and clean up explicit VBMatrix live routes with operator checkpoints.
compatibility: opencode
metadata:
  audience: users
  domain: audio
---

## Goal

Safely handle one explicit VBMatrix route at a time during live audio work.

## Use When

- The user gives source SUID/channel and destination SUID/channel.
- The user wants a point gain, mute, or phase change.
- The user asks to clean up a known route.

## Quick Path

1. Confirm target details.

- Source SUID and 1-based channel.
- Destination SUID and 1-based channel.
- Desired gain, mute, or phase value.

2. Read health and state.

- `vbmatrix_ping`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info` for each SUID.
- `vbmatrix_get_point` for the exact point.

3. Ask for operator approval before any live write.

- State the exact point and value.
- Mention that audio may change immediately.

4. Apply one write.

- `vbmatrix_set_point_gain`
- `vbmatrix_set_point_mute`
- `vbmatrix_set_point_phase`

5. Report pre-state, command result, post-state, and any verification gap.

## Cleanup

- Prefer mute for temporary silence when the operator wants easy restore.
- Use `gainDb: "-inf"` only when the operator approves removing the point.
- Do not infer multi-route cleanup from names like main, cue, stream, or booth.

## Stop Conditions

- Endpoint identity is unclear.
- Slot or point queries fail in a way that makes the target ambiguous.
- The operator has not approved a live write.
- The requested action needs broad reset, raw command execution, or preset recall; those are not current MCP tools.
