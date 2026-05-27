---
name: Bug report
about: Report a VBMatrix MCP problem
labels: bug
---

## Summary

## Environment

- OS:
- Node version:
- Package version or commit:
- MCP client:
- VB-Audio Matrix version:
- Voicemeeter edition/version, if relevant:
- Relevant configured ports/streams: `VBMATRIX_PORT`, `VBMATRIX_STREAM`, `VOICEMEETER_VBAN_PORT`, `VOICEMEETER_VBAN_STREAM`

## Diagnostics

```text
npm run doctor
```

If VB-Audio Matrix is running and VBAN-TEXT is configured:

```text
npm run doctor -- --vban
```

If this is a Matrix VBAN timeout or packet issue and you intentionally ran deeper read-only diagnostics:

```text
npm run diagnostics:vban
```

For Voicemeeter issues, paste the structured response from the relevant read-only tool first, usually `voicemeeter_get_status` or `voicemeeter_get_capabilities`. For Voicemeeter VBAN-TEXT timeout or packet issues, include `voicemeeter_vban_diagnostics` only if you intentionally ran that read-only UDP probe.

## Expected Behavior

## Actual Behavior

## Reproduction Steps

## Safety Notes

Did any command change Matrix routes, slots, devices, or engine state?

Did any command change Voicemeeter devices, strip/bus parameters, MacroButtons, or raw VBAN-TEXT state?

Redact private stream keys, remote endpoints, personal routing maps, local file paths that reveal private projects, and raw scripts unrelated to the bug.
