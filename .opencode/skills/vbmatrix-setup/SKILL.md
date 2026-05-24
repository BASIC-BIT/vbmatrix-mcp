---
name: vbmatrix-setup
description: Set up VB-Audio Matrix and verify VBMatrix MCP over VBAN-TEXT.
compatibility: opencode
metadata:
  audience: users
  domain: audio
---

## Goal

Bring a Windows machine from "I want VBMatrix MCP" to a verified `vbmatrix_ping` without hiding the parts that need desktop/admin/operator approval.

## What Can Be Automated

Good coding-agent tasks:

- Clone/build this repo.
- Add local MCP config for OpenCode or another harness.
- Run `npm run smoke:vban` to verify VBAN-TEXT reachability.
- Run `npm run verify:live-audio` in dry-run/measurement mode after an operator provides a local fixture.
- Run MCP tool discovery and call `vbmatrix_ping` or `vbmatrix_vban_diagnostics` once the harness is configured.
- Edit environment variables for host, port, stream name, or opt-out safety gates.

Operator or desktop-automation tasks:

- Install VB-Audio Matrix drivers.
- Reboot after driver install/update/uninstall.
- Approve Windows firewall prompts.
- Turn on VBAN service and incoming TEXT command stream in the VBMatrix UI.

Desktop automation may do some UI clicks if a Windows UI Automation MCP is configured, but keep an operator in the loop for installer, reboot, UAC, and live audio routing decisions.

## Quick Path

1. Install and launch VB-Audio Matrix

- Official page: https://vb-audio.com/Matrix/
- Reboot if the installer asks. The virtual audio driver needs it.
- Approve the firewall prompt for VBAN on trusted networks if you want remote/local UDP control.

2. Configure VBAN-TEXT in VBMatrix

- Open the VBAN configuration dialog in VBMatrix.
- Turn VBAN service `ON`.
- Enable an incoming TEXT/Command stream.
- Use stream name `Command1` unless you plan to set `VBMATRIX_STREAM`.
- Keep the default VBAN UDP port `6980` unless you plan to set `VBMATRIX_PORT`.
- Expect query responses on Matrix's `Request Reply` service stream. Do not name the incoming command stream `Request Reply`.

3. Build this repo

```bash
npm install
npm run build
```

4. Direct protocol smoke test

```bash
npm run smoke:vban
```

Expected: JSON with `ok: true` and a `version` value.

If it fails, the smoke output includes packet diagnostics when available. The common healthy shape is command stream `Command1` and response stream `Request Reply`.

If VBMatrix is on another host:

```bash
$env:VBMATRIX_HOST = "192.168.1.50"
npm run smoke:vban
```

5. Configure MCP harness

OpenCode local config example:

```jsonc
{
  "mcp": {
    "vbmatrix": {
      "type": "local",
      "command": ["node", "D:/bench/vbmatrix-mcp/dist/bin/cli.js"],
      "enabled": true,
      "environment": {
        "VBMATRIX_HOST": "127.0.0.1"
      }
    }
  },
  "permission": {
    "vbmatrix_*": "ask"
  }
}
```

Then restart the harness and ask it to call `vbmatrix_ping`. If that times out, call `vbmatrix_vban_diagnostics` for read-only packet classification and setup hints.

6. Verify harness approval policy

- For OpenCode, confirm the config includes `"permission": { "vbmatrix_*": "ask" }` if you want approval prompts.
- For other harnesses, confirm their tool approval policy before leaving write/destructive tools enabled.
- If approval behavior is unclear, set `VBMATRIX_MCP_ALLOW_WRITES=false` and `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` in the MCP server env until it is confirmed.

## Opt-Out Server-Side Policy

This MCP exposes write/destructive tools by default so the harness can own approval policy.

Use these only when you want additional server-side limits:

- `VBMATRIX_MCP_ALLOW_WRITES=false`: read-only mode.
- `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false`: block engine restart and future destructive/system tools.
- `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`: require `VBMATRIX_MCP_ALLOWED_SUIDS` for point writes.
- `VBMATRIX_MCP_ALLOWED_SUIDS=VASIO8,VAIO1`: allowlisted SUIDs when all-SUID writes are off.

## Troubleshooting

- `Timed out waiting for VBAN-TEXT response`: VBAN service or incoming TEXT stream is off, stream name mismatch, firewall block, wrong host, or wrong port. Run `vbmatrix_vban_diagnostics` before changing Matrix settings.
- `Request Reply` gotcha: Matrix query replies arrive as VBAN service protocol `0x60` on stream `Request Reply`; the configured command stream should normally remain `Command1`.
- `VBAN stream name must be 16 bytes or fewer`: shorten `VBMATRIX_STREAM`.
- `Property = Err`: syntax is valid enough to reach VBMatrix, but the target point/slot/property likely does not exist.
- `Response key mismatch`: a response arrived, but it did not match the queried property; check for other VBAN-TEXT traffic on the same stream.
- No MCP tools visible: rebuild with `npm run build`, confirm harness config path points to `dist/bin/cli.js`, then restart the harness.

## Automation Boundary

Do not silently run installers or change live routing on behalf of the user. Ask for operator approval before:

- Installing/updating VB-Audio Matrix.
- Restarting the VBMatrix audio engine during live use.
- Applying broad routing changes.
- Modifying devices or slots outside the user's stated target.
- Running `npm run verify:live-audio -- --run`; it changes a target route and requires `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO`.
