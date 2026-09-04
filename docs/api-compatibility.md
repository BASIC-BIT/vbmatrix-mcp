# API Compatibility Policy

This project is pre-1.0, but MCP clients and automation can still depend on a stable tool surface. Changes should preserve explicit typed operations, predictable response shapes, and the safety gates documented in `docs/safety.md`.

## Stable Surfaces

Treat these as compatibility-sensitive:

- MCP tool names, because clients invoke them directly.
- Tool input schema field names, types, enum/literal values, defaults, and required confirmation fields.
- Structured response field names that identify targets, SUIDs, channels, planned commands, before/after query results, safety decisions, diagnostics, and snapshot artifact paths.
- `SafetyError.code` values and timeout diagnostic classifications documented in `docs/error-taxonomy.md`.
- Package entry points and npm scripts used by CI or documented workflows.

Human-readable descriptions and error messages may change to become clearer. Clients should not parse prose when a structured field or stable code exists.

## Additive Changes

Additive changes are preferred and normally compatible:

- Adding a new tool for a new explicit operation.
- Adding an optional input field with a safe default.
- Adding a new response field while preserving existing fields.
- Adding a new enum value only when callers that do not use it keep their existing behavior.
- Adding stricter validation for values that were never valid Matrix/VBAN inputs.

The Windows Core Audio provider follows the additive-provider rule with the `windows_audio_*` prefix. Its tools remain registered on non-Windows systems and return a structured unsupported-platform result so MCP discovery does not vary by host operating system.

## Breaking Changes

These require a changelog entry and a deliberate versioning decision:

- Renaming or removing a tool.
- Renaming, removing, or changing the type of an input field or required confirmation literal.
- Changing a default that can expand writes, destructive behavior, network scope, or snapshot file access.
- Removing response fields that clients can use for follow-up tool calls or safety review.
- Replacing stable safety or diagnostic codes with different names.
- Changing the default availability of `vbmatrix_raw_vban_text` or adding any new write surface without the safety model in `docs/safety.md`.

When a breaking change is unavoidable, prefer adding a replacement tool first, documenting migration notes, and keeping the old tool until the next intentional breaking release.

## Security Checks

Default `npm run check` stays deterministic and offline-friendly. Dependency auditing is available as an explicit opt-in step with `npm run security:audit`; it may contact the npm registry and should not be added to default CI unless the repository explicitly accepts network-dependent checks.

Dependabot watches npm dependencies and GitHub Actions weekly. Dependency PRs should still pass normal CI and should not change runtime safety defaults without an explicit compatibility review.
