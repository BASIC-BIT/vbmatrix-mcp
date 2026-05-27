# Voicemeeter Capability Map

Issue: [#40 Voicemeeter provider v2](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/40)

## Summary

The useful Voicemeeter path is Remote API first. Direct VBAN-TEXT query replies were not observed in the #22 live smoke, so typed tools must not depend on Matrix-style `...?;` VBAN-TEXT replies.

The current provider is valuable for explicit local control-room tasks: inspect status, devices, strips, buses, levels, and MacroButtons; make narrow strip/bus changes; and perform operator-confirmed device or MacroButton changes. It is not a fuzzy audio assistant by itself. Claude or another MCP client should interpret intent, ask for missing endpoints, then call explicit tools.

## Tool Map

| Tool                              | Transport         | Safety class                   | Evidence                   | Notes                                                                                                                     |
| --------------------------------- | ----------------- | ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `voicemeeter_get_capabilities`    | MCP metadata      | Read-only                      | Unit tests, docs           | Lists supported provider capability groups.                                                                               |
| `voicemeeter_get_status`          | Remote API helper | Read-only                      | Unit tests, bundled helper | Reports Windows/helper/install/running/type/version states.                                                               |
| `voicemeeter_get_devices`         | Remote API helper | Read-only                      | Unit tests                 | Enumerates input/output devices through helper process.                                                                   |
| `voicemeeter_get_strip`           | Remote API helper | Read-only                      | Unit tests                 | Edition-validates strip index and explicit properties.                                                                    |
| `voicemeeter_get_bus`             | Remote API helper | Read-only                      | Unit tests                 | Edition-validates bus index and explicit properties.                                                                      |
| `voicemeeter_get_levels`          | Remote API helper | Read-only, bounded             | Unit tests                 | Caller supplies explicit level type and channels. No background polling.                                                  |
| `voicemeeter_get_macro_button`    | Remote API helper | Read-only                      | Unit tests                 | Reads explicit MacroButton index and mode.                                                                                |
| `voicemeeter_set_strip_parameter` | Remote API helper | Typed write                    | Unit tests                 | Write gate, edition/index/property validation, pre-state and post-state.                                                  |
| `voicemeeter_set_bus_parameter`   | Remote API helper | Typed write                    | Unit tests                 | Write gate, edition/index/property validation, pre-state and post-state.                                                  |
| `voicemeeter_set_device`          | Remote API helper | Destructive/operator confirmed | Unit tests                 | Requires `confirm: true`, write gate, destructive gate, and reports API acceptance separately from observed device state. |
| `voicemeeter_set_macro_button`    | Remote API helper | Destructive/operator confirmed | Unit tests                 | Requires `confirm: true`, write gate, destructive gate, and reports trigger pulses as acceptance-only when appropriate.   |
| `voicemeeter_raw_remote_api`      | Remote API helper | Raw escape hatch               | Unit tests                 | Exact parameter/script path. Prefer typed tools. Disabled with `VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API=true`.             |
| `voicemeeter_vban_diagnostics`    | VBAN-TEXT UDP     | Read-only network probe        | Unit tests, live #22 smoke | Sends fixed `Strip[0].Gain=?;`. Disabled with `VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT=true`.                               |
| `voicemeeter_raw_vban_text`       | VBAN-TEXT UDP     | Raw escape hatch               | Unit tests                 | Exact command only. Prefer typed tools. Disabled with `VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT=true`.                       |

## Edition Boundaries

The helper maps Voicemeeter type values to supported edition counts:

| Edition  | Type | Strips | Buses | Notes                                     |
| -------- | ---- | ------ | ----- | ----------------------------------------- |
| Standard | `1`  | 3      | 2     | Smallest route surface.                   |
| Banana   | `2`  | 5      | 5     | Current local live smoke edition for #22. |
| Potato   | `3`  | 8      | 8     | Largest supported strip/bus surface.      |

Unknown type values fail closed for typed strip/bus operations.

## Valuable Next Work

- Add a grouped Voicemeeter workflow only when the requested operation can be expressed as explicit strip/bus/device/MacroButton targets with previewable writes.
- Good candidates: explicit strip route flag changes, explicit mute/gain bundles, and setup audits that only read status/devices/strips/buses/levels.
- Keep grouped workflows dry-run or preview-first before writes, and include pre-state/post-state evidence where Remote API reads support it.

## Not Necessary Now

- Do not add deterministic natural-language mappings such as "mic", "stream", "headphones", or "make this sound better". The MCP layer should expose facts and explicit controls; the agent should interpret fuzzy intent and ask for missing targets.
- Do not build typed reads on direct VBAN-TEXT `...?;` replies. The live smoke proved VBAN service reachability but observed no direct TEXT query reply.
- Do not add background meter subscriptions until there is a bounded, opt-in product design. Explicit `voicemeeter_get_levels` calls are enough for current operations.
- Do not promote raw Remote API or raw VBAN-TEXT into normal workflows. They are escape hatches for expert/operator use.
