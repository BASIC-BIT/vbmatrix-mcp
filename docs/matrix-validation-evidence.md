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
| `Command.Engine=?;`, `Command.Master=?;`                                                        | Docs-only + typed implementation       | `src/tools/status.ts`, `src/core/commands.ts`, `docs/matrix-command-coverage.md`                                          | Read-only typed queries exist. Add live evidence from operator diagnostics before marking live-tested.                                                                                           |
| `Slot(...).Info/Online/RunningStatus/Master/Device=?;`                                          | Docs-only + typed implementation       | `src/tools/status.ts`, `src/core/commands.ts`, `docs/matrix-command-coverage.md`                                          | Read-only typed slot queries exist. Live validation should record only non-sensitive SUIDs/device strings or redact local device names.                                                          |
| Bounded slot/channel inspection across explicit candidate slots                                  | Mocked-tested + typed implementation   | `src/tools/observability.ts`, `src/core/observability.ts`, `test/core/observability.test.ts`                              | `vbmatrix_inspect_slots` composes existing read-only slot and label queries for explicit slots/channels only; add operator evidence before marking live-tested.                                  |
| Bounded route inspection across explicit points, slots, labels, engine, and master               | Mocked-tested + typed implementation   | `src/tools/observability.ts`, `src/core/observability.ts`, `test/core/observability.test.ts`                              | `vbmatrix_inspect_routes` composes existing read-only queries for explicit route points only; add operator evidence before marking the composed workflow live-tested.                             |
| Single `Point(...)` gain/mute/phase query and write                                             | Specific live evidence + mocked-tested | `docs/research.md`, `docs/live-audio-verification.md`, `scripts/live-audio-verify.ts`, `test/core/commands.test.ts`       | Live evidence covers a specific `VAIO1.IN[1] -> VAIO1.OUT[1]` workflow plus `-inf`/`Remove` behavior. Broader point combinations remain command-builder/test coverage until separately captured. |
| Point ranges and zones                                                                          | Docs-only + typed implementation       | `src/tools/points.ts`, `src/tools/zones.ts`, `docs/matrix-command-coverage.md`                                            | Dry-run-first typed builders exist. Aggregate range/zone state queries remain unverified and should not become implicit high-volume scans.                                                       |
| Input/output labels and channel route reset                                                     | Docs-only + typed implementation       | `src/tools/channels.ts`, `docs/matrix-command-coverage.md`, `docs/research.md`                                            | Single/range label query/removal and destructive route reset are typed. Non-empty range assignment is intentionally deferred.                                                                    |
| Preset patch status and scene operations                                                        | Docs-only + typed implementation       | `src/tools/presetPatches.ts`, `docs/matrix-command-coverage.md`, `docs/research.md`                                       | Read status before scene operations. File-affecting load/save/save-as remains deferred pending path safety design.                                                                               |
| Snapshot capture/diff/restore                                                                   | Mocked-tested                          | `src/core/snapshots.ts`, `src/tools/snapshots.ts`, `test/core/snapshots.test.ts`, `test/tools/snapshots.test.ts`          | Targeted snapshots only. Labels and preset metadata are documented omissions; restore supports selected point state only.                                                                        |
| Safe route workflow                                                                             | Mocked-tested                          | `src/core/safeRouting.ts`, `src/tools/safeRouting.ts`, `test/tools/safeRouting.test.ts`                                   | Explicit point targets only, dry-run by default, returns rollback commands. Live validation should be operator-approved and artifact-backed.                                                     |
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
