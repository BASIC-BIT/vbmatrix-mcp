# Troubleshooting And Support

Use this checklist before filing a setup or runtime issue. Keep logs and examples sanitized; do not include private stream keys, local routing secrets, or device serials unless they are already public test fixtures.

## First Checks

Run the non-network diagnostics first:

```bash
npm run doctor
```

If Matrix is running and its VBAN-TEXT command stream is intentionally enabled, run one read-only Matrix query:

```bash
npm run doctor -- --vban
```

For deeper Matrix packet evidence, run:

```bash
npm run diagnostics:vban
```

That script sends fixed read-only Matrix version probes only. It does not expose arbitrary VBAN command execution.

## Matrix Timeouts

Matrix query replies should arrive as VBAN service packets on stream `Request Reply`. The configured `VBMATRIX_STREAM` is the incoming TEXT command stream, normally `Command1`; do not set it to `Request Reply`.

If diagnostics report `no_packets_observed`, treat the result as indeterminate. UDP cannot prove whether the cause is a disabled VBAN service, wrong host or port, firewall policy, disabled incoming TEXT stream, Matrix not running, or Matrix receiving the command without emitting an observable reply.

## Voicemeeter Helper Issues

Most `voicemeeter_*` tools use the local Remote API helper, not VBAN-TEXT. Start with:

```text
voicemeeter_get_status
voicemeeter_get_capabilities
```

Useful facts to include in support requests:

- Windows version.
- Voicemeeter edition and version, if known.
- Whether Voicemeeter is currently running.
- Whether `VOICEMEETER_REMOTE_DLL` is set or auto-detected.
- Any custom `VOICEMEETER_HELPER_COMMAND` and sanitized args.
- The structured tool response, not screenshots of private routing unless needed.

The MCP server does not load Voicemeeter DLLs in-process. Helper stderr is diagnostic-only; stdout is reserved for one helper JSON response.

## Voicemeeter Write Confirmation

Device changes and MacroButtons writes can disrupt live audio or trigger user-configured actions. Verify them only with an operator-approved disposable fixture:

- Capture pre-state with `voicemeeter_get_devices`, `voicemeeter_get_strip`, `voicemeeter_get_bus`, or `voicemeeter_get_macro_button` before writing.
- Use a known reversible strip/bus target and a device assignment the operator is willing to restore manually if needed.
- Use a known inert MacroButton for `stateOnly` checks; do not trigger production buttons or buttons that launch programs, send keys, or change live routing.
- Treat `confirmation.writeAccepted` as Remote API acceptance only. Claim durable state changed only when the returned observed state matches the expected post-state.
- Expect MacroButtons trigger mode to behave like a pulse: the Remote API can accept the write while immediate state reads settle back to `0`.
- Restore or manually verify the original device/MacroButton state after the smoke.

## Voicemeeter VBAN-TEXT

Start with `voicemeeter_vban_diagnostics` when collecting query/reply evidence. It sends only the fixed read-only `Strip[0].Gain=?;` probe. `voicemeeter_raw_vban_text` is an exact-command power-user escape hatch. Prefer typed `voicemeeter_*` tools where possible.

Keep Matrix and Voicemeeter on separate VBAN UDP base ports when both applications are open. The repo defaults are:

- Matrix: `VBMATRIX_PORT=6980`.
- Voicemeeter raw VBAN-TEXT: `VOICEMEETER_VBAN_PORT=6982`.

Voicemeeter VBAN-TEXT query replies are not a supported typed-read dependency. A read-only query that returns `timedOut: true` means no accepted reply was observed within the configured timeout; it does not prove the command syntax is unsupported unless Voicemeeter was running, VBAN was enabled, the incoming TEXT stream name and port were verified, and packet evidence was captured.

## Safe Support Data

Include:

- Tool name and exact structured input, with private paths redacted if needed.
- Structured JSON response from the MCP tool.
- `npm run doctor` output.
- `npm run doctor -- --vban` or `npm run diagnostics:vban` output only if you intentionally ran read-only Matrix probes.
- Relevant environment variable names and sanitized values.

Do not include:

- Private stream keys, remote endpoints, or personal routing maps.
- Raw audio logs that expose callers, clients, or private sessions.
- Broad raw VBAN-TEXT scripts unless the issue is specifically about raw command handling.
