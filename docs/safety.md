# Safety Model

VBMatrix can route live audio. The server exposes useful write tools by default and assumes the user's MCP harness is responsible for approval policy. Deployments that need a narrower server-side policy can opt out with environment variables.

## Gates

Write gates:

- `VBMATRIX_MCP_ALLOW_WRITES=false` disables point, zone, channel label/reset, preset patch execution, preset patch file execution, snapshot restore execution, and slot writes.
- `VBMATRIX_MCP_ALLOW_ALL_SUIDS=true` allows all SUIDs by default.
- Set `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false` and list SUIDs in `VBMATRIX_MCP_ALLOWED_SUIDS` for a server-side allowlist.
- Channels must be integers in the supported 1-based Matrix/Coconut channel range.

Destructive gate:

- `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` disables `vbmatrix_restart_engine`, `vbmatrix_reset_channel_routes`, zone reset, disruptive preset patch operations, preset patch file loads/overwrites, slot reset, slot device assignment/removal, and any future destructive/system tools.

Raw command gate:

- `VBMATRIX_MCP_DISABLE_RAW_COMMANDS=true` disables `vbmatrix_raw_vban_text`.
- Raw VBAN-TEXT is a power-user escape hatch and is available by default. Prefer typed tools where possible because raw commands do not get typed Matrix validation, SUID allowlists, dry-runs, or query-before-write safety beyond the command's own response behavior.

Voicemeeter gates:

- `VOICEMEETER_MCP_DISABLE_WRITES=true` disables typed `voicemeeter_set_strip_parameter` and `voicemeeter_set_bus_parameter` writes.
- `VOICEMEETER_MCP_DISABLE_DESTRUCTIVE=true` disables `voicemeeter_set_device` and `voicemeeter_set_macro_button`.
- `VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API=true` disables `voicemeeter_raw_remote_api`.
- `VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT=true` disables `voicemeeter_vban_diagnostics` and `voicemeeter_raw_vban_text`.
- Voicemeeter tools use an external helper process. The MCP server does not load Voicemeeter Remote API DLLs in-process.
- The bundled helper is enabled by default on Windows and can be disabled with `VOICEMEETER_MCP_DISABLE_BUNDLED_HELPER=true`.
- `voicemeeter_raw_remote_api` is a power-user escape hatch for exact Remote API parameter paths or scripts. Prefer typed `voicemeeter_*` tools where possible.
- `voicemeeter_vban_diagnostics` and `voicemeeter_raw_vban_text` send Voicemeeter VBAN-TEXT packets over `VOICEMEETER_VBAN_HOST`, `VOICEMEETER_VBAN_PORT`, and `VOICEMEETER_VBAN_STREAM`. They are available by default, separate from Matrix's `VBMATRIX_*` connection, and should not be treated as typed validation.
- `voicemeeter_set_device` and `voicemeeter_set_macro_button` report Remote API acceptance separately from immediate observable state. Do not claim a device or MacroButton state changed unless the `confirmation` block shows the relevant post-state evidence; MacroButton trigger mode may legitimately pulse and then read back as `0`.

Slot device assignment/removal and slot reset also require `confirm=true` in the tool input. These tools are operator-in-the-loop actions because they can interrupt live audio devices even though they target one slot.

Broad point range and zone tools also require command-level confirmation when executing. `vbmatrix_apply_point_range` and `vbmatrix_apply_zone` dry-run by default and require `confirmApply=true` with `dryRun=false` before sending a command. `vbmatrix_remove_point` requires `confirmRemove=true` for single-point removal. Zone reset and `gainDb: "-inf"` also require the destructive gate because they build `Zone(...).Reset;`.

Preset patch scene operations also dry-run by default. `vbmatrix_preset_patch` requires `confirmOperation="PRESET_PATCH_WRITE"` with `dryRun=false` before sending any preset patch write. Apply, recall, copy, paste, delete, resetZone, and update also require the destructive gate because they can affect live scene state or stored patch contents.

Preset patch file operations are separate from scene operations. `vbmatrix_preset_patch_file` supports live-tested `PresetPatch[n].Load` and `PresetPatch[n].SaveAs` for `.xml` files under `VBMATRIX_MCP_PRESET_PATCH_ROOTS`. It dry-runs by default, rejects paths outside configured roots, rejects implicit overwrite, and requires `confirmOperation="MATRIX_PRESET_FILE_WRITE"` with `dryRun=false`. Loads and overwrite-capable saves also require the destructive gate.

## Commands intentionally not exposed

Do not expose these as normal typed tools; use `vbmatrix_raw_vban_text` only when the operator intentionally needs an advanced escape hatch:

- `Command.Shutdown`
- `Command.Reset`
- `Command.ResetGrid`
- `PresetPatch[n].Save`, `Command.Save`, `Command.Load`, `Command.SaveGrid`, and `Command.LoadGrid` until file path safety and live behavior are proven. Use `vbmatrix_preset_patch_file` for typed `PresetPatch[n].Load` and `PresetPatch[n].SaveAs`.
- broad `Zone(...).Reset` without dry-run, confirmation, write gate, and destructive gate
- broad slot-wide `Input(...).Reset` or `Output(...).Reset` beyond explicit channel/range targets
- raw free-form VBAN-TEXT command execution as a typed/validated substitute for explicit tools

Slot-level `Slot(SUID).Reset` is exposed only as `vbmatrix_reset_slot`, with a SUID allowlist check, the destructive gate, explicit confirmation, and before/after slot-state queries.

## Query-before-write

Point, preset patch, channel label, and slot write tools should query the affected target before and after sending a command. If a query times out, the write should still report that fact explicitly rather than hiding it. Zone tools report a query caveat instead because aggregate zone status query syntax is not documented.

Grouped operation and workflow tools should preserve query-before-write for each affected target. If a future batch tool supports partial application, that behavior must be explicit in the input schema and response; fail-closed all-or-nothing behavior is the default.

Snapshot restore preserves query-before-write by capturing the current selected point state before planning commands. Execution then re-queries each point after its command is sent.

## Preview and dry-run

Any future tool that can affect multiple targets, multiple properties, output buses, destructive/system state, or reset/remove behavior should provide a dry-run or preview mode before execution. Preview responses should show planned commands, target summaries, safety gate decisions, and validation failures without sending write VBAN-TEXT packets.

Primitive single-target setters do not need a separate preview mode when they already expose exact typed inputs and query-before-write responses.

`vbmatrix_restore_snapshot` dry-runs by default. To execute, callers must set `dryRun: false` and `confirmRestore: "RESTORE_SNAPSHOT"`. Plans that affect multiple points or commands additionally require `confirmBroadRestore: true` after reviewing the plan.

## Snapshot artifacts

Large snapshots are stored under `.vbmatrix-snapshots/`, which is gitignored. Snapshot file inputs are restricted to that directory so diff/restore tools do not become arbitrary local file readers.

## Matrix file state

`vbmatrix_get_file_state` reads current Matrix project/grid file state with `Command.Load=?;` and `Command.LoadGrid=?;`.

`vbmatrix_preset_patch_file` is the first typed file-affecting slice. It is limited to live-tested `PresetPatch[n].Load` and `PresetPatch[n].SaveAs` with `.xml` paths under operator-configured roots. Project/grid load/save and `PresetPatch[n].Save` remain deferred until source-linked syntax, live behavior, path/extension rules, and confirmation semantics are proven. Raw VBAN-TEXT can still send file-affecting Matrix commands when not disabled; callers are responsible for exact command semantics and path consequences.

`vbmatrix_inspect_saved_settings` and `vbmatrix_diff_saved_settings` are offline read-only tools. They require `VBMATRIX_MCP_SAVED_SETTINGS_ROOTS`, accept only regular `.xml` files whose canonical paths remain inside those roots, reject UNC paths and XML document types, and enforce `VBMATRIX_MCP_SAVED_SETTINGS_MAX_BYTES` plus parser/output caps. A saved file can differ from the running engine, so these tools return explicit saved-file provenance and must not be described as live Matrix inspection.

## Network trust

The VBMatrix manual says TEXT command streams can receive messages from anywhere. Use this server on trusted local networks only, keep MCP local over stdio, and use OS/firewall controls for VBAN UDP exposure.

## Future live testing

Live tests must be opt-in and must require a gitignored fixture with safe SUIDs/channels. They should never infer safe channels from defaults.

`scripts/live-audio-verify.ts` is the manual live audio harness. It never writes Matrix routes unless both `--run` and `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO` are provided, and it restores the queried point state in a `finally` block where possible.

See `docs/error-taxonomy.md` for the stable safety error codes and VBAN timeout classifications exposed by diagnostics.
