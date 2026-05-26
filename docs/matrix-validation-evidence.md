# Matrix Validation Evidence Matrix

This matrix records what has been proven by live use, deterministic tests, sourced documentation, or explicit deferral. It complements `docs/matrix-command-coverage.md`, which tracks typed command coverage.

Evidence levels:

- `Live-tested`: exercised against VB-Audio Matrix with an operator-approved setup or harness.
- `Mocked-tested`: covered by deterministic unit/integration tests without contacting Matrix.
- `Docs-only`: implemented or documented from sourced Matrix command docs, but not yet proven live in this repo.
- `Deferred`: intentionally not exposed or not validated until scope, safety, or product behavior is designed.

Safety notes:

- High-volume scans remain opt-in and bounded; no full-matrix scan is implied by this document.
- No raw/free-form VBAN command execution is exposed for validation.
- Live validation should use fixed read-only diagnostics first, then explicit dry-run/confirmation workflows for writes.
- Keep stdout reserved for MCP protocol; scripts that produce operator artifacts must not be treated as server stdout behavior.

## Evidence By Command Family

| Command family                                                                                  | Current evidence                       | Representative files                                                                                                      | Notes / next validation                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Command.Version=?;` ping and diagnostics                                                       | Live-tested + mocked-tested            | `README.md`, `scripts/vban-diagnostics-scenarios.ts`, `test/core/vbanText.test.ts`, `test/core/vbanTextTransport.test.ts` | Fixed read-only diagnostic command. Configured-stream success is live-tested; wrong-stream and wrong-port negative probes are deterministic mocked/script coverage until artifacts are recorded. |
| VBAN SERVICE `Request Reply` packet acceptance                                                  | Live-tested + mocked-tested            | `src/core/vbanText.ts`, `test/core/vbanText.test.ts`, `test/core/vbanTextTransport.test.ts`, `docs/research.md`           | Matrix query replies were live-observed as service replies on `Request Reply`; mocked tests keep the receive filter deterministic.                                                               |
| Matrix `Err` service replies                                                                    | Mocked-tested                          | `test/core/vbanTextTransport.test.ts`, `docs/error-taxonomy.md`                                                           | Transport returns `Err` payloads to callers instead of treating them as malformed packets. Tool-specific semantic handling remains a follow-up.                                                  |
| Timeout classification: no packets / wrong stream / unsupported protocol / malformed packets    | Mocked-tested                          | `src/core/vbanText.ts`, `test/core/vbanText.test.ts`, `test/core/vbanTextTransport.test.ts`, `docs/error-taxonomy.md`     | Wrong port usually appears as indeterminate `no_packets_observed`; wrong streams are only deterministic when any observable non-matching packets arrive.                                         |
| `Command.Engine=?;`, `Command.Master=?;`                                                        | Live-tested + mocked-tested            | `src/tools/status.ts`, `src/core/commands.ts`, `docs/matrix-command-coverage.md`                                          | Live read-only MCP calls against Matrix 1.0.2.6 returned running engine/master clock state.                                                                                                      |
| `Slot(...).Info/Online/RunningStatus/Master/Device=?;`                                          | Live-tested + mocked-tested            | `src/tools/status.ts`, `src/core/commands.ts`, `docs/matrix-command-coverage.md`                                          | Live read-only MCP calls against Matrix 1.0.2.6 returned slot info/online state. Matrix can return `Err`, `-`, or a device-kind qualified key such as `Slot(ASIO128).Device.ASIO` for `Slot(...).Device=?;`; these are surfaced as observations. |
| Slot lifecycle/device writes                                                                    | Live-tested                            | `src/tools/slots.ts`, `src/core/commands.ts`, `test/core/commands.test.ts`, `docs/matrix-command-coverage.md`             | Live MCP stdio execution covered `Online=0/1`, `Master=0/1`, `Reset`, `Device.ASIO="..."`, and `Device=""` on explicit slots with destructive gates enabled. Device cleanup required retrying transient slot queries and relaunching Matrix to restore `Command.Master` to `CLOCK`; parser coverage now includes the live-observed device-kind response key. |
| Bounded slot/channel inspection across explicit candidate slots                                  | Live-tested + mocked-tested            | `src/tools/observability.ts`, `src/core/observability.ts`, `test/core/observability.test.ts`, `test/tools/observability.test.ts` | `vbmatrix_inspect_slots` was live-tested through MCP stdio against explicit Matrix slots/channels. It stayed bounded and surfaced Matrix `Err` label/property values without treating them as transport failures. |
| Bounded route inspection across explicit points, slots, labels, engine, and master               | Live-tested + mocked-tested            | `src/tools/observability.ts`, `src/core/observability.ts`, `test/core/observability.test.ts`, `test/tools/observability.test.ts` | `vbmatrix_inspect_routes` was live-tested through MCP stdio against explicit route points, including disconnected and `Err` point states.                                                        |
| Single `Point(...)` gain/mute/phase query and write                                             | Live-tested + mocked-tested            | `docs/research.md`, `docs/live-audio-verification.md`, `scripts/live-audio-verify.ts`, `test/core/commands.test.ts`       | Live MCP stdio execution set `VAIO1.IN[1] -> VAIO1.OUT[1]` gain to `-100`, mute to `1`, phase to `1`, then removed the point back to `-inf/0/0`. Broader point combinations remain command-builder/test coverage until separately captured. |
| Point ranges and zones                                                                          | Live-tested + typed implementation     | `src/tools/points.ts`, `src/tools/zones.ts`, `docs/matrix-command-coverage.md`                                            | Live MCP stdio execution covered 1x1 point-range mute, phase, remove, and prior gain writes with snapshot restore. Zone execution covered gain, mute, phase, reset, copy, store, and add on an explicit 1x1 zone; aggregate range/zone state queries remain unverified and should not become implicit high-volume scans. |
| Input/output labels and channel route reset                                                     | Partial live-tested + typed implementation | `src/tools/channels.ts`, `docs/matrix-command-coverage.md`, `docs/research.md`                                            | Live MCP stdio execution set and removed one input channel label and reset one output channel route with snapshot restore. Range label removal remains typed but not live-tested in this pass. Non-empty range assignment is intentionally deferred. |
| Preset patch status and scene operations                                                        | Live-tested + typed implementation     | `src/tools/presetPatches.ts`, `docs/matrix-command-coverage.md`, `docs/research.md`                                       | Live MCP stdio read, dry-run, and live execution covered preset patch 1 name, comment, gain, mute, phase, update, resetZone, apply, recall, copy, paste, and delete. File-affecting load/save/save-as remains deferred pending path safety design. |
| Snapshot capture/diff/restore                                                                   | Live-tested + mocked-tested            | `src/core/snapshots.ts`, `src/tools/snapshots.ts`, `test/core/snapshots.test.ts`, `test/tools/snapshots.test.ts`          | Live MCP stdio snapshot capture, same-snapshot diff, restore dry-run, and restore execution passed on an explicit point. Restore execution remains operator-approved only.                       |
| Safe route workflow                                                                             | Live-tested + mocked-tested            | `src/core/safeRouting.ts`, `src/tools/safeRouting.ts`, `test/tools/safeRouting.test.ts`                                   | Live MCP stdio execution covered `auditionRoute`, `emergencyMute`, and `cleanupRoutes` on explicit points; snapshot restore returned tested routes to pre-state.                                 |
| Fixed engine restart                                                                            | Live-tested + typed implementation     | `src/tools/system.ts`, `src/core/commands.ts`, `docs/matrix-command-coverage.md`                                          | Live MCP stdio execution of `Command.Restart;` succeeded with destructive tools enabled, then `vbmatrix_get_engine` and `vbmatrix_ping` succeeded afterward.                                     |
| Raw/free-form VBAN-TEXT commands                                                                | Deferred                               | `docs/matrix-command-coverage.md`, `AGENTS.md`                                                                            | Not exposed; validation must use typed commands/tools.                                                                                                                                           |
| Full-matrix scans, meter streaming, VBAN service/config writes, additional broad system actions | Deferred                               | `docs/matrix-command-coverage.md`                                                                                         | Fixed `vbmatrix_restart_engine` exists behind destructive gates; any additional broad/system action requires bounded scope, safety design, and source-linked command behavior.                   |

## Live Evidence Capture Template

Use this template in PR descriptions, issue comments, or private operator notes. Do not commit local logs, screenshots, WAVs, device names, or machine-specific configs unless they are sanitized examples.

```markdown
### Matrix validation evidence

- Date / Matrix version:
- Operator / environment: local, redacted
- Tool or script:
- Command family:
- Scenario: configured stream | wrong stream | wrong port | dry-run | live write with approval
- Expected result:
- Observed result:
- Evidence level change: docs-only -> live-tested, mocked-tested retained, or deferred
- Artifacts: path or private location, sanitized if committed
- Follow-ups:
```

## Maintenance

- Update this file when command families gain live evidence, new mocked diagnostics coverage, or explicit deferrals.
- Keep this file aligned with `docs/matrix-command-coverage.md` and `docs/error-taxonomy.md`.
- Prefer adding narrow deterministic tests for packet/timeout behavior before adding new live validation steps.
