# Changelog

## Unreleased

- Added a Matrix provider boundary and `vbmatrix_get_capabilities` read tool for future product adapters.
- Added fixed read-only `npm run diagnostics:vban` scenarios for VBAN setup troubleshooting.
- Added deterministic mocked UDP coverage for VBAN negative packet and timeout scenarios, plus error taxonomy compatibility notes.
- Added `vbmatrix_safe_route_workflow` for explicit point audition, cleanup, and emergency mute dry-runs with snapshot rollback data.
- Documented the Voicemeeter read-only discovery, VBAN-TEXT smoke-test plan, and provider safety design boundaries.

## 0.1.0

- Set the initial package identity to `@basicbit/vbmatrix-mcp` with MCP discovery name `io.github.BASIC-BIT/vbmatrix-mcp`.
- Added safe `doctor` diagnostics for Node version, build output, discovery metadata, environment parsing, and optional read-only VBAN probing.
- Added expanded MCP client onboarding examples and release checklist documentation.
- Added lightweight agentic maintainer and improvement-log workflows for safe VBMatrix MCP changes.

## 0.0.0

- Initial design scaffold for VBMatrix MCP.
