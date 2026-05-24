---
name: vbmatrix-troubleshooting
description: Diagnose VBMatrix MCP, VBAN-TEXT, and routing-state failures with safe escalation.
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

- Check `VBMATRIX_HOST`, `VBMATRIX_PORT`, and `VBMATRIX_STREAM`.
- Confirm VBAN service is on and the incoming TEXT stream is enabled in VBMatrix.
- Check firewall/network trust.

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
- If the control plane is healthy but audio is wrong, collect evidence and consider non-VBMatrix causes such as DAW, OBS, device, driver, or hardware routing.
