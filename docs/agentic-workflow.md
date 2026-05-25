# Agentic Maintainer Workflow

This repo should be easy for agents to improve without turning VB-Audio Matrix into an unsafe automation target. Keep the loop small: read the relevant docs, make the smallest useful change, verify it, and leave a clear trail for the next maintainer.

## North Star

- Expose explicit VBMatrix facts and typed operations through MCP tools.
- Keep fuzzy intent, live-show judgment, and operator tradeoffs in the agent/operator layer.
- Prefer read-only evidence before writes, and query-before-write for every route change.
- Treat live audio as operator-in-the-loop, even when local MCP write gates are enabled.

## Issue Kickoff

Before changing files for an issue:

1. Check `git status --short --branch` and confirm the intended branch/worktree.
2. Read the issue, `README.md`, `AGENTS.md`, and any relevant docs under `docs/`.
3. For tool or safety changes, read `docs/safety.md`, `docs/architecture.md`, and `docs/design.md`.
4. For live-audio behavior, read `docs/workflows.md`, `docs/live-audio-verification.md`, and the relevant skill in `.opencode/skills/`.
5. Avoid live-audio writes, engine restarts, installer actions, device changes, and destructive resets unless the operator explicitly approves the action in the current session.

## PR Readiness

Before opening or updating a PR:

- Run `npm run check` after code changes.
- Run `npm run format:check` or inspect Markdown manually after docs-only changes.
- Run `npm run build` before `npm run package:smoke` when package metadata, bin entries, release docs, or packaged docs change.
- Run `npm run pack:check` when package metadata or packaged docs change.
- Add or update tests for command construction, parsing, safety gates, snapshots, or write behavior.
- Keep stdout clean for MCP protocol messages; diagnostics belong on stderr.
- Link the PR to its issue and summarize operator-facing safety implications.

## Review-Recycle Loop

When review feedback arrives:

1. Read each cited file, diff, or thread before deciding whether the comment is valid.
2. Classify feedback as valid, invalid, or unclear.
3. Apply valid fixes in the smallest coherent commit.
4. Reply with rationale for rejected comments or ask one blocking question for unclear feedback.
5. Re-run the relevant checks before pushing another update.

Do not auto-apply reviewer suggestions that widen write scope, add raw VBAN command execution, or change live-audio behavior without re-checking repo safety docs and operator approval requirements.

## What Belongs Where

- Tools: explicit facts, typed operations, bounded dry-runs, validation, and query-before-write mechanics.
- Docs: architecture, safety model, maintainer workflow, public usage, and durable decisions that humans need to review.
- Skills: repeatable operator workflows that require judgment across tools, logs, symptoms, and live audio constraints.
- Tests: deterministic coverage for protocol construction, parsing, safety gates, and regression-prone behavior.
- Issues: task scope, acceptance criteria, unresolved questions, and follow-up work that is not ready to encode.

Avoid hard-coded natural-language routing heuristics. If a user asks for a fuzzy audio goal, let the agent reason with explicit facts and ask for missing endpoints instead of teaching deterministic code to guess.
