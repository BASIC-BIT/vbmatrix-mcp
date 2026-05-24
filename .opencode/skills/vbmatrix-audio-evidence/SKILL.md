---
name: vbmatrix-audio-evidence
description: Collect read-only VBMatrix facts before diagnosing or changing live audio routing.
compatibility: opencode
metadata:
  audience: users
  domain: audio
---

## Goal

Build evidence before changing audio. Keep facts, hypotheses, and operator decisions separate.

## Quick Path

1. Capture the symptom.

- What is silent, doubled, distorted, delayed, or routed wrong?
- Which source, output, stream, recording, or headphones path is involved?
- Is audio live for an audience right now?

2. Use read-only tools first.

- `vbmatrix_ping`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info` for named SUIDs.
- `vbmatrix_get_point` for named points.

3. Summarize facts.

- Include exact SUIDs, channels, gain, mute, phase, and slot health.
- Say when data is missing or a query timed out.

4. Offer the smallest next action.

- Ask for exact endpoint IDs if missing.
- Ask for operator approval before a write.
- Move to `vbmatrix-live-routing` when the change is explicit.

## Evidence Rules

- Do not claim whole-system state from one point query.
- Do not infer route names from musical language.
- Do not restart the engine as a diagnostic step during live use without approval.
- Do not run installers, UAC prompts, or desktop automation without an operator checkpoint.

## Useful Output Shape

- `Observed`: read-only facts from tools.
- `Likely meaning`: cautious interpretation.
- `Risk`: what could change live audio.
- `Needs operator`: exact approvals or missing endpoint IDs.
