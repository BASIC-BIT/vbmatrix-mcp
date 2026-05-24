# AGENTS

This repo uses linting, typechecking, and tests to validate changes.

Guidance for coding agents:

- After significant code changes, run `npm run check`.
- If you need just one step, use `npm run lint`, `npm run typecheck`, or `npm test`.
- After making a change, run at least one relevant targeted test and confirm it passes before reporting back.
- Keep stdout reserved for MCP protocol; log diagnostics to stderr only.
- Do not add raw VBAN command execution unless it is disabled by default and separately approved.
- Read tools may query any configured host, but write tools must pass the write gate and SUID allowlist.
- Query-before-write is the default pattern for routing changes so tool responses can show pre-state and post-state.
- Avoid fuzzy language interpretation in code. MCP tools should expose explicit VBMatrix facts and typed operations; the agent decides intent.

## Tool ergonomics goals

- Prefer small, single-purpose tools over broad magic commands.
- Return structured JSON with enough IDs/SUIDs/channels for follow-up calls.
- Keep high-volume scans bounded and opt-in.
- Fail closed with actionable errors when safety settings block a write.

## Safety defaults

- `VBMATRIX_MCP_ALLOW_WRITES` defaults to `true`.
- `VBMATRIX_MCP_ALLOW_ALL_SUIDS` defaults to `true`; set it to `false` with `VBMATRIX_MCP_ALLOWED_SUIDS` for a narrower deployment.
- `VBMATRIX_MCP_ALLOW_DESTRUCTIVE` defaults to `true`; set it to `false` to block engine restart and future destructive/system tools.
