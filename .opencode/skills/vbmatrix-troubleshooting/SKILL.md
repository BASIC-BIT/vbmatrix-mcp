---
name: vbmatrix-troubleshooting
description: Diagnose VB-Audio MCP Matrix VBAN-TEXT and routing-state failures with safe escalation.
compatibility: opencode
metadata:
  audience: users
  domain: audio
---

## Goal

Find the smallest likely cause of an MCP or VBMatrix control failure without disrupting live audio.

## Quick Path

1. Classify the failure.

- MCP tools missing.
- `vbmatrix_ping` timeout.
- Slot or point query error.
- Write blocked by safety gate.
- Write sent but post-state missing.
- Audio symptom despite normal control-plane state.

2. For tools missing:

- Rebuild with `npm run build`.
- Confirm the MCP client points at `dist/bin/cli.js`.
- Restart the MCP client.

3. For ping timeout:

- Run `vbmatrix_vban_diagnostics` if the MCP harness can see tools.
- Check `VBMATRIX_HOST`, `VBMATRIX_PORT`, and `VBMATRIX_STREAM`.
- Confirm VBAN service is on and the incoming TEXT stream is enabled in VBMatrix.
- Keep the command stream as `Command1` unless `VBMATRIX_STREAM` intentionally matches a different enabled incoming TEXT stream.
- Remember Matrix replies to queries on VBAN service protocol `0x60` stream `Request Reply`; `Request Reply` is not the command stream name.
- Check firewall/network trust.

Diagnostic interpretation:

- `no_packets_observed`: no UDP packets arrived before timeout. Treat this as indeterminate; likely causes include wrong host/port, VBAN service off, incoming TEXT stream disabled, firewall/network block, Matrix not running, or Matrix receiving the query without sending an observable reply.
- `text_stream_mismatch` or `service_stream_mismatch`: VBAN traffic arrived, but not on the expected command stream or Matrix `Request Reply` stream.
- `unsupported_protocol`, `too_short`, `bad_magic`, or `text_non_utf8`: UDP/VBAN traffic arrived, but it was not a Matrix query reply packet this server can parse.

4. For target errors:

- Re-check SUID spelling and 1-based channel numbers.
- Run `vbmatrix_get_slot_info` before querying points on that SUID.

5. For blocked writes:

- Inspect `VBMATRIX_MCP_ALLOW_WRITES`, `VBMATRIX_MCP_ALLOW_ALL_SUIDS`, `VBMATRIX_MCP_ALLOWED_SUIDS`, and `VBMATRIX_MCP_ALLOW_DESTRUCTIVE`.
- Do not bypass gates unless the operator intends that deployment policy.

## Escalation Boundaries

- Ask before `vbmatrix_restart_engine`; it can disrupt live audio.
- Ask before installers, driver changes, firewall changes, UAC, or reboot.
- Do not use raw VBAN commands; raw command execution is intentionally not exposed.
- Do not automate VBAN service/stream configuration writes unless a future source-linked Matrix command surface is documented; use the VBMatrix UI with an operator in the loop.
- If the control plane is healthy but audio is wrong, collect evidence and consider non-VBMatrix causes such as DAW, OBS, device, driver, or hardware routing.
