# AGENTS

This repo uses linting, typechecking, and tests to validate changes.

## Local Operator Context

- If `AGENTS.local.md` exists in this repo, read it before live QA, smoke tests, or destructive/audio-affecting validation.
- `AGENTS.local.md` is gitignored and may contain private operator approvals, local device assumptions, or machine-specific test policy. Do not commit it.

## OpenCode MCP Testing

- `opencode.json` registers this repo as a local `vb-audio` MCP using `node dist/bin/cli.js`; run `npm run build` before restarting OpenCode after code changes.
- The committed OpenCode config is intentionally read-only/safe by default: Matrix writes, destructive actions, raw VBAN-TEXT, Voicemeeter writes, destructive actions, raw Remote API, and raw Voicemeeter VBAN-TEXT are disabled.
- For live write/routing validation, use an explicit operator checkpoint and a local override rather than broadening the committed default config.

Guidance for coding agents:

- After significant code changes, run `npm run check`.
- If you need just one step, use `npm run lint`, `npm run typecheck`, or `npm test`.
- After making a change, run at least one relevant targeted test and confirm it passes before reporting back.
- For issue kickoff, PR readiness, and review-recycle guidance, read `docs/agentic-workflow.md`.
- For meaningful user-facing or maintainer-facing changes, follow `docs/improvement-log.md`.
- Keep stdout reserved for MCP protocol; log diagnostics to stderr only.
- Raw VBAN-TEXT is exposed only through `vbmatrix_raw_vban_text` and `voicemeeter_raw_vban_text`; prefer typed tools where possible and document any new raw-command policy change.
- Read tools may query any configured host, but write tools must pass the write gate and SUID allowlist.
- Query-before-write is the default pattern for routing changes so tool responses can show pre-state and post-state.
- Avoid fuzzy language interpretation in code. MCP tools should expose explicit provider facts and typed operations; the agent decides intent.

## Tool ergonomics goals

- Prefer small, single-purpose tools over broad magic commands.
- Return structured JSON with enough IDs/SUIDs/channels for follow-up calls.
- Keep high-volume scans bounded and opt-in.
- Fail closed with actionable errors when safety settings block a write.

## Safety defaults

- `VBMATRIX_MCP_ALLOW_WRITES` defaults to `true`.
- `VBMATRIX_MCP_ALLOW_ALL_SUIDS` defaults to `true`; set it to `false` with `VBMATRIX_MCP_ALLOWED_SUIDS` for a narrower deployment.
- `VBMATRIX_MCP_ALLOW_DESTRUCTIVE` defaults to `true`; set it to `false` to block engine restart and future destructive/system tools.
- `VBMATRIX_MCP_DISABLE_RAW_COMMANDS` defaults to `false`; set it to `true` to disable the raw VBAN-TEXT escape hatch.
- `VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT` defaults to `false`; set it to `true` to disable Voicemeeter VBAN-TEXT diagnostics and the raw escape hatch.
