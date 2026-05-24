# Improvement Log Workflow

Use this lightweight workflow to make meaningful changes discoverable without adding process overhead.

## Where Updates Go

- User-facing releases and notable shipped behavior belong in `CHANGELOG.md`.
- Maintainer-facing workflow, safety, tooling, and documentation changes can be summarized in PR descriptions.
- Durable repeated lessons should become a short doc update or skill update, not a long chat transcript.

## When To Add A Changelog Entry

Add an `Unreleased` entry to `CHANGELOG.md` when a change affects users, package consumers, MCP clients, live-audio safety, tool behavior, configuration defaults, or documented workflows.

Docs-only maintenance can skip the changelog when the PR description is enough, unless the doc changes a safety boundary or operator workflow.

## Entry Shape

Use concise bullets grouped under `## Unreleased`:

```markdown
## Unreleased

- Added `vbmatrix_example_tool` for explicit route inspection.
- Documented the live-audio approval boundary for snapshot restore.
```

Move entries under a version heading when cutting a release.

## Agent Handoff Notes

For meaningful PRs, include these in the PR description:

- What changed and why.
- Checks run, including `npm run check` or the narrower reason it was skipped.
- Any live-audio actions intentionally not performed.
- Follow-up issues for deferred tooling, docs, or verification.

Keep the log factual. Do not include secrets, local device names unless already part of documented examples, or assumptions about an operator's live routing that were not verified.
