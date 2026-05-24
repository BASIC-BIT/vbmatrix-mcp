---
name: vbmatrix-dj-workflows
description: Apply VBMatrix MCP safely to DJ, stream, cue, monitor, and live-production workflows.
compatibility: opencode
metadata:
  audience: users
  domain: audio
---

## Goal

Translate DJ and live-production requests into safe MCP actions without hard-coding fuzzy intent.

## Use When

- The user mentions cue, booth, headphones, stream, deck, mic, monitor, recording, or before-show checks.
- The user describes a live-production goal instead of exact SUID/channel endpoints.

## Workflow

1. Identify whether the request is fuzzy or explicit.

- Explicit: contains source SUID/channel and destination SUID/channel.
- Fuzzy: contains role words like cue, booth, deck, stream, main, monitor, or audience.

2. For fuzzy requests, ask for endpoint IDs or an operator-provided route checklist.

- Do not invent channel mappings from names.
- Do not persist assumed DJ layout rules in code or docs.

3. For before-show verification, use `docs/workflows.md#before-show-verification`.

4. For one approved point change, switch to `vbmatrix-live-routing`.

5. For symptoms or uncertainty, switch to `vbmatrix-audio-evidence`.

## Current Recipes

- Inspect one deck-to-stream, mic-to-stream, cue-to-headphones, or booth route when exact endpoints are supplied.
- Temporarily mute one known point after operator approval.
- Remove one known point with `gainDb: "-inf"` after operator approval.
- Check show-critical routes from an operator-provided list.

## Future-Tool Placeholders

- Route-group mute for a named output.
- Full matrix scan or bounded route inventory.
- Saved show preset verification.
- Meter-aware evidence capture.

Until those exist, keep workflow claims limited to the exact points queried.
