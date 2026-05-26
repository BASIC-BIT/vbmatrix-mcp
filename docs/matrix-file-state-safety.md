# Matrix File State Safety

Matrix file-affecting commands can replace live Matrix state or write local state files. This document defines the safety contract for typed file tools and records the first implemented slice: `vbmatrix_preset_patch_file` for live-tested preset patch `.xml` load/save-as under configured roots.

## Scope

This policy applies to typed tools for:

- Preset patch files: `PresetPatch[n].Load`, `PresetPatch[n].Save`, and `PresetPatch[n].SaveAs`.
- Matrix project files: `Command.Load`, `Command.Save`, and related project-level commands if source-linked syntax is added.
- Matrix grid files: `Command.LoadGrid`, `Command.SaveGrid`, and related grid-level commands if source-linked syntax is added.

It does not turn file-affecting commands into generic script commands, arbitrary filesystem browsing, or broad import/export tools. Advanced users can still send exact file-affecting commands through `vbmatrix_raw_vban_text` when raw commands are not disabled; that escape hatch does not provide this policy's path validation.

Implemented now:

- `vbmatrix_get_file_state` reads `Command.Load=?;` and `Command.LoadGrid=?;`.
- `vbmatrix_preset_patch_file` supports `PresetPatch[n].Load="...";` and `PresetPatch[n].SaveAs="...";` only.

Still deferred:

- `PresetPatch[n].Save`.
- `Command.Save`, `Command.Load`, `Command.SaveGrid`, and `Command.LoadGrid` execution.
- Any project/grid path-based import/export surface.

## Path Roots

File tools must require an explicit configured root for each file kind they support. A caller-provided path is valid only when its resolved absolute path is inside at least one allowed root for that same kind.

Root rules:

- Roots must be configured by the operator, not guessed from common Windows folders. The current preset patch root variable is `VBMATRIX_MCP_PRESET_PATCH_ROOTS` with semicolon-separated absolute Windows paths.
- Relative paths, drive-relative paths, UNC paths, and paths outside configured roots must be rejected.
- Path traversal must be rejected by resolving the candidate path before comparison.
- The tool response should include the matched root and resolved path during dry-run so the operator can verify the target.

## Extension Allowlists

File tools must use per-kind extension allowlists. Extensions must be matched case-insensitively after path resolution.

Current policy:

- Preset patch files allow `.xml` only. The Matrix manual references `PresetPatch_01.xml`, and live Matrix 1.0.2.6 successfully wrote `AgentProof_PresetPatch_01.xml` through absolute-path `PresetPatch[1].SaveAs`.
- Project files should allow only documented Matrix project extensions after they are verified.
- Grid files should allow only documented Matrix grid extensions after they are verified.

Do not add a catch-all extension or allow extensionless files. If the Matrix UI accepts multiple formats, each format should be named in docs and tests before tool exposure.

## Dry-Run And Overwrite

File-affecting tools must dry-run by default. A dry-run response must show:

- The exact Matrix command that would be sent.
- The resolved path and matched root.
- The file kind and operation.
- Whether the operation may overwrite an existing file.
- The confirmation token required for execution. `vbmatrix_preset_patch_file` uses `MATRIX_PRESET_FILE_WRITE`.

Save and save-as operations must not overwrite by implication. `vbmatrix_preset_patch_file` requires `allowOverwrite=true` before saving over an existing path, and overwrite execution also requires the destructive gate. Load operations must not create or modify local files.

## Confirmations And Gates

Execution must require all relevant gates:

- The write gate, because file tools change Matrix state or local files.
- The destructive gate for preset patch loads, project/grid loads, reset-like loads, overwrite-capable saves, and any operation that can disrupt live routing or replace durable state.
- A command-specific confirmation token after the caller reviews the dry-run.

Confirmation tokens should be specific to the operation or command family, for example `MATRIX_PRESET_FILE_WRITE`, `MATRIX_FILE_LOAD`, `MATRIX_FILE_SAVE`, or `MATRIX_FILE_OVERWRITE`. Avoid generic booleans for broad file state operations.

## Operator Responsibilities

The MCP server can validate paths and require confirmations, but the operator remains responsible for:

- Choosing roots that contain only intended Matrix state files.
- Backing up projects, grids, and presets before load/save experiments.
- Reviewing dry-run commands and resolved paths before execution.
- Keeping MCP clients local and approval-gated when live Matrix writes are enabled.

## Implementation Status

The first implementation slice provides:

- A pure path-policy helper in `src/core/matrixFilePolicy.ts` with tests in `test/core/matrixFilePolicy.test.ts`.
- `vbmatrix_get_file_state` for read-only project/grid file-state queries.
- `vbmatrix_preset_patch_file` for dry-run-first `PresetPatch[n].Load` and `PresetPatch[n].SaveAs` against `.xml` paths under `VBMATRIX_MCP_PRESET_PATCH_ROOTS`.

Future work may add more typed file tools only after the command syntax, extensions, configured roots, dry-run output, overwrite behavior, and confirmation semantics are documented and tested.
