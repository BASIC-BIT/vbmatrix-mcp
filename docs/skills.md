# Repo-Local Skills Catalog

This repository ships OpenCode skills under `.opencode/skills/` for workflows that need agent reasoning across MCP tools, operator intent, logs, and live audio state.

Use deterministic MCP tools for explicit facts and typed operations. Use skills for fuzzy or situational work such as deciding which route a DJ meant, choosing a safe checkpoint, or collecting evidence without disrupting a show.

## Available Skills

| Skill                      | Use when                                                                      | Key boundary                                                                |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `vbmatrix-setup`           | Installing and verifying VB-Audio Matrix and this MCP server.                 | Installer, reboot, firewall, and UAC decisions require operator approval.   |
| `vbmatrix-live-routing`    | Inspecting, applying, and cleaning up individual live routes.                 | Query before write; get operator approval before every live routing change. |
| `vbmatrix-audio-evidence`  | Capturing useful facts before debugging or changing live audio.               | Prefer read-only tools until the operator approves a specific change.       |
| `vbmatrix-dj-workflows`    | Handling DJ, streaming, or live-production requests with current point tools. | Treat musical intent as fuzzy; ask/check rather than inventing routes.      |
| `vbmatrix-troubleshooting` | Diagnosing MCP, VBAN-TEXT, and routing-state failures.                        | Do not restart the audio engine during live use without approval.           |
| `vb-audio-product-scout`   | Researching VB-Audio products, docs, and purchase/install implications.       | Installers, payments, donations, and license choices stay operator-driven.  |

## Selection Guide

- Start with `vbmatrix-setup` when VBAN-TEXT reachability or MCP registration is unproven.
- Start with `vbmatrix-audio-evidence` when the user reports a symptom but has not asked for a specific routing change.
- Start with `vbmatrix-live-routing` when the route endpoint, channel, gain, mute, or phase operation is explicit.
- Start with `vbmatrix-dj-workflows` when the user describes a live-production goal such as cue, monitor, stream, booth, transition, or emergency silence.
- Start with `vbmatrix-troubleshooting` when a tool call fails or VBMatrix returns unexpected state.
- Start with `vb-audio-product-scout` when deciding what VB-Audio component, manual, installer, or license path is relevant.

## Authoring Rules

- Keep skills short and action-oriented.
- Include current tool names exactly as exposed by MCP.
- Mark future-tool placeholders clearly instead of pretending the MVP can scan or preset an entire matrix.
- Require operator approval for live routing, destructive resets, installers/UAC, payments, and license decisions.
- Avoid deterministic fuzzy mappings such as turning arbitrary DJ language into hard-coded channel choices.
