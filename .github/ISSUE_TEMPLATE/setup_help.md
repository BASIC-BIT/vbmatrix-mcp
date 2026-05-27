---
name: Setup help
about: Get help configuring VBMatrix MCP or an MCP client
labels: setup
---

## Goal

## Environment

- OS:
- Node version:
- Install method: source checkout or npm package
- MCP client:
- VB-Audio Matrix host/port/stream:
- Voicemeeter helper or VBAN settings, if relevant:
- Safety flags you intentionally set, e.g. write/destructive/raw disable variables:

## Doctor Output

```text
npm run doctor
```

## VBAN Diagnostics

Only include this if you intentionally ran a read-only VBAN probe:

```text
npm run doctor -- --vban
```

For Voicemeeter VBAN-TEXT setup, paste the structured `voicemeeter_vban_diagnostics` response only if you intentionally ran that read-only UDP probe.

## Client Configuration

Paste the relevant MCP server entry with secrets removed.

## Safe Redaction

Remove private stream keys, remote endpoints, personal routing maps, and local file paths that reveal private projects. Keep tool names, sanitized environment variable names/values, and structured error JSON when possible.
