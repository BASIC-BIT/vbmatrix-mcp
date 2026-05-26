# Changelog

## Unreleased

- Added live-tested `vbmatrix_inspect_routes` and `vbmatrix_inspect_slots` for bounded route, slot, label, and engine/master inspection before live changes.
- Added default-available `vbmatrix_raw_vban_text` as an advanced power-user escape hatch, with `VBMATRIX_MCP_DISABLE_RAW_COMMANDS=true` for deployments that want to hide it.
- Added `vbmatrix_get_file_state` and live-tested `vbmatrix_preset_patch_file` for dry-run-first preset patch `.xml` load/save-as under `VBMATRIX_MCP_PRESET_PATCH_ROOTS`.
- Added bundled helper-backed `voicemeeter_*` tools for status, devices, strips, buses, levels, typed writes, MacroButtons, and raw Remote API access with inverse disable gates.
- Clarified `voicemeeter_set_device` and `voicemeeter_set_macro_button` responses so Remote API acceptance is reported separately from immediately observable post-state changes.
- Added live Matrix validation evidence for remaining point range, zone, channel reset, preset patch, slot lifecycle/device, and destructive cleanup tool paths.
- Fixed Matrix slot device parsing when `Slot(...).Device=?;` replies with a device-kind qualified key such as `Slot(ASIO128).Device.ASIO`.
- Added a manual read-only release dry-run workflow that builds, checks, package-smokes, packs a local tarball, and uploads inspection artifacts without publishing.
- Added CI package smoke verification for dry-run package contents and CLI bin metadata.
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
