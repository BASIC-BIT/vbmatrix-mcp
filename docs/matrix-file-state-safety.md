# Matrix File State Safety

Matrix file-affecting commands such as preset patch load/save, project load/save, and grid load/save are intentionally deferred until the server has a tested path policy and operator workflow. This document defines the safety contract future tools must satisfy before they can send any file-affecting VBAN-TEXT command.

## Scope

This policy applies to future typed tools for:

- Preset patch files: `PresetPatch[n].Load`, `PresetPatch[n].Save`, and `PresetPatch[n].SaveAs`.
- Matrix project files: `Command.Load`, `Command.Save`, and related project-level commands if source-linked syntax is added.
- Matrix grid files: `Command.LoadGrid`, `Command.SaveGrid`, and related grid-level commands if source-linked syntax is added.

It does not authorize raw VBAN-TEXT command execution, generic script commands, arbitrary filesystem browsing, or broad import/export tools.

## Path Roots

Future file tools must require an explicit configured root for each file kind they support. A caller-provided path is valid only when its resolved absolute path is inside at least one allowed root for that same kind.

Root rules:

- Roots must be configured by the operator, not guessed from common Windows folders.
- Relative paths, drive-relative paths, UNC paths, and paths outside configured roots must be rejected.
- Path traversal must be rejected by resolving the candidate path before comparison.
- The tool response should include the matched root and resolved path during dry-run so the operator can verify the target.

## Extension Allowlists

Future file tools must use per-kind extension allowlists. Extensions must be matched case-insensitively after path resolution.

Recommended initial policy:

- Preset patch files should allow only documented Matrix preset patch extensions after they are verified against official docs or live Matrix behavior.
- Project files should allow only documented Matrix project extensions after they are verified.
- Grid files should allow only documented Matrix grid extensions after they are verified.

Do not add a catch-all extension or allow extensionless files. If the Matrix UI accepts multiple formats, each format should be named in docs and tests before tool exposure.

## Dry-Run And Overwrite

File-affecting tools must dry-run by default. A dry-run response must show:

- The exact Matrix command that would be sent.
- The resolved path and matched root.
- The file kind and operation.
- Whether the operation may overwrite an existing file.
- The confirmation token required for execution.

Save and save-as operations must not overwrite by implication. If overwrite support is added, the schema must require an explicit overwrite field and a separate confirmation token for overwrite-capable execution. Load operations must not create or modify local files.

## Confirmations And Gates

Execution must require all relevant gates:

- The write gate, because file tools change Matrix state or local files.
- The destructive gate for project/grid loads, reset-like loads, overwrite-capable saves, and any operation that can disrupt live routing or replace durable state.
- A command-specific confirmation token after the caller reviews the dry-run.

Confirmation tokens should be specific to the operation, for example `MATRIX_FILE_LOAD`, `MATRIX_FILE_SAVE`, or `MATRIX_FILE_OVERWRITE`. Avoid generic booleans for broad file state operations.

## Operator Responsibilities

The MCP server can validate paths and require confirmations, but the operator remains responsible for:

- Choosing roots that contain only intended Matrix state files.
- Backing up projects, grids, and presets before load/save experiments.
- Reviewing dry-run commands and resolved paths before execution.
- Keeping MCP clients local and approval-gated when live Matrix writes are enabled.

## Implementation Status

The first implementation slice provides a pure path-policy helper in `src/core/matrixFilePolicy.ts` and tests in `test/core/matrixFilePolicy.test.ts`. It is not wired to any MCP tool and does not perform filesystem reads, writes, or Matrix commands.

Future work may add typed file tools only after the command syntax, extensions, configured roots, dry-run output, overwrite behavior, and confirmation semantics are documented and tested.
