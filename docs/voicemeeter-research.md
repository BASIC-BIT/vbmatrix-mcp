# Voicemeeter Research

Issue: [#11 Research Voicemeeter support and unified VB-Audio MCP scope](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/11)

## Summary

Voicemeeter support should not be implemented as a broad extension of the current Matrix command builders. Matrix and Voicemeeter share VB-Audio ownership and VBAN concepts, but their control models differ enough that product-specific adapters are required.

Recommended direction:

- Keep this repository named `vbmatrix-mcp` for the current Matrix-focused package until a second product backend exists.
- Extract a small shared VBAN packet layer only when a Voicemeeter feature directly needs it.
- Prototype Voicemeeter as a provider adapter behind explicit product-prefixed tools, or as a sibling package, before renaming to a unified VB-Audio MCP.
- Prefer the official Voicemeeter Remote API SDK for local Voicemeeter control. Treat VBAN-TEXT as a narrower remote/macro transport until its query semantics are verified against Voicemeeter.

Do not add broad `voicemeeter_*` tools yet. The next implementation step should be a narrow discovery/status spike with explicit edition detection and read-only parameters.

## Sources

- Official Voicemeeter Standard page: https://vb-audio.com/Voicemeeter/
- Official Voicemeeter Banana page: https://vb-audio.com/Voicemeeter/banana.htm
- Official Voicemeeter Potato page: https://vb-audio.com/Voicemeeter/potato.htm
- Official VBAN page: https://vb-audio.com/Voicemeeter/vban.htm
- Official MacroButtons page: https://vb-audio.com/Voicemeeter/macrobuttons.htm
- Official Voicemeeter user guides hub: https://voicemeeter.com/user-guides/
- VB-Audio forum post pointing users to the current Remote API SDK GitHub repository: https://forum.vb-audio.com/viewtopic.php?t=1992
- Official Voicemeeter SDK repository: https://github.com/vburel2018/Voicemeeter-SDK
- SDK README: https://raw.githubusercontent.com/vburel2018/Voicemeeter-SDK/main/README.md
- SDK header: https://raw.githubusercontent.com/vburel2018/Voicemeeter-SDK/main/VoicemeeterRemote.h
- Existing third-party Voicemeeter MCP prior art: https://github.com/rkzwei/voicemeeter-mcp-server

## Current Repo Baseline

The current implementation is Matrix-specific above the packet layer:

- `src/core/vbanText.ts` builds VBAN-TEXT packets and accepts Matrix query replies that arrive as VBAN service protocol `0x60` on stream `Request Reply`.
- `src/core/commands.ts` builds Matrix expressions such as `Slot(SUID).Info=?;` and `Point(SUID.IN[i],SUID.OUT[j]).dBGain=?;`.
- `src/tools/registerAllTools.ts` registers Matrix status, point, and system tools only.
- `docs/design.md` explicitly excludes raw command execution, full-matrix scans, preset patch editing, and VBAN service subscriptions from the MVP.

That separation is useful: `vbanText.ts` is the only likely reusable layer. The Matrix SUID/slot/point command model should remain product-specific.

## Voicemeeter Editions

Official product pages identify three main Voicemeeter variants relevant to MCP support.

| Edition              | Official I/O summary                                               | Buses                                                                        | VBAN implementation                                                                                                                                                         | Notes                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voicemeeter Standard | 3 inputs: 2 physical, 1 virtual. 3 outputs: 2 physical, 1 virtual. | 2 buses: A and B.                                                            | 4 audio input streams, 1 VBAN-MIDI input, 1 VBAN-TEXT input, 4 audio output streams, 1 VBAN-MIDI output, 1 VBAN-FRAME output.                                               | Smallest parameter surface. Official page also lists MIDI remoting for gain, mute, solo, and M.C.                                                                    |
| Voicemeeter Banana   | 5 inputs: 3 physical, 2 virtual. 5 outputs: 3 physical, 2 virtual. | 5 buses: A1, A2, A3, B1, B2.                                                 | 8 audio input streams, 1 VBAN-MIDI input, 1 VBAN-TEXT input, 8 audio output streams, 1 VBAN-MIDI output, 1 VBAN-FRAME output.                                               | Adds integrated recorder, more I/O, insert ASIO, full parametric EQ on buses, and broader strip/bus processing.                                                      |
| Voicemeeter Potato   | 8 inputs: 5 physical, 3 virtual. 8 outputs: 5 physical, 3 virtual. | Official page says 5x BUS, but names A1-A5 and B1-B3, which is 8 bus labels. | Same high-level VBAN stream counts as Banana: 8 audio input streams, 1 VBAN-MIDI input, 1 VBAN-TEXT input, 8 audio output streams, 1 VBAN-MIDI output, 1 VBAN-FRAME output. | Largest surface. Adds multi-layer behavior, internal reverb/delay, external FX send/return, detailed compressor/gate/denoiser/pitch controls, and B3/VAIO3 concepts. |

The official SDK header uses numeric Voicemeeter types and index layouts:

- `VBVMR_RunVoicemeeter` accepts `1 = Voicemeeter`, `2 = Voicemeeter Banana`, `3 = Voicemeeter Potato`, and `6 = Potato x64 bits`.
- `VBVMR_GetVoicemeeterType` returns `1 = Voicemeeter`, `2 = Voicemeeter Banana`, `3 = Potato`.
- Standard index layout: strips `0..2`, buses `0..1`.
- Banana index layout: strips `0..4`, buses `0..4`.
- Potato index layout: strips `0..7`, buses `0..7`.

## Control Paths

### Remote API SDK

The official SDK is the strongest candidate for local MCP control.

Evidence:

- The VB-Audio forum directs users looking for the Remote API SDK to `https://github.com/vburel2018/Voicemeeter-SDK`.
- The SDK README says the Remote API controls Voicemeeter parameters, processes audio inside Voicemeeter, receives MIDI messages from Voicemeeter MIDI mapping, and controls the MacroButtons application.
- The SDK README says the API is provided by standard Windows DLLs installed with Voicemeeter, with x86 and x64 variants.
- The SDK header exposes login/logout, app launch, type/version, parameter get/set, script set, level read, MIDI send/read, device enumeration, audio callbacks, and MacroButtons get/set status.

Important API concepts:

- Parameter names are string paths like `Strip[1].gain`, `Strip[0].mute`, `Bus[0].gain`, `Strip[1].name`, and `Bus[0].device.asio`.
- `VBVMR_SetParameters` can set several parameters in one script under 48 kB.
- `VBVMR_IsParametersDirty` is intended to be polled, typically every 10 or 20 ms, and must be called from one thread only.
- `VBVMR_GetLevel` reads real-time levels by type and channel; the SDK header documents edition-specific channel assignments.
- MacroButtons functions cover 80 logical buttons, dirty polling, status get, and status set.
- Audio callbacks are real-time and explicitly forbid waiting cycles, OS synchronization waits, display, disk, or communication work inside the callback. That makes them inappropriate for a first MCP implementation.

Risks:

- This is Windows DLL integration, not UDP. A TypeScript implementation would need a carefully maintained FFI/native boundary or a small helper process.
- The API allows generic parameter strings and scripts, which can become the same kind of raw command footgun this repo intentionally avoided for Matrix. Public MCP tools should expose typed operations first.
- The SDK states only 4 client applications can be connected to remote Voicemeeter.

### VBAN-TEXT

VBAN is shared across Matrix and Voicemeeter, but the safe reusable surface is currently only packet construction and stream dispatch.

Evidence:

- The official VBAN page says VBAN is UDP-based and can broadcast audio, serial, and text data.
- The Voicemeeter Standard page lists 1 VBAN-TEXT input stream.
- The Banana and Potato pages also list 1 VBAN-TEXT input stream.
- MacroButtons can send scripts by VBAN-TEXT and can be controlled by a VBAN-TEXT incoming stream.

Open questions:

- Matrix queries in this repo require handling VBAN service protocol `0x60` reply packets on stream `Request Reply`. The researched official Voicemeeter pages confirm VBAN-TEXT input streams, but they do not establish that Voicemeeter replies to `...?;` queries using the same Matrix service-reply behavior.
- Voicemeeter command grammar over VBAN-TEXT needs a source-linked parameter table or live verification before typed MCP tools rely on it.

Recommendation:

- Reuse `buildVbanTextPacket` only after the target stream, command grammar, and response behavior are verified for Voicemeeter.
- Do not expose raw VBAN-TEXT script execution by default.

### MacroButtons

MacroButtons is useful as a separate automation surface, not as the primary mixer-control API.

Evidence:

- The official MacroButtons page says MacroButtons can send scripts and commands to Voicemeeter or other applications.
- Buttons can be handled by mouse, keyboard, game pad, HID, VBAN-TEXT, MIDI events, or audio level from Voicemeeter.
- MacroButtons can send commands by direct instruction to Voicemeeter, MIDI message to MIDI device or VBAN, script sent by VBAN-TEXT, keyboard/mouse events, or executing a program.
- MacroButtons supports 80 buttons and has its own VBAN capabilities.
- The Remote API SDK exposes `VBVMR_MacroButton_*` functions for status read/write.

Recommendation:

- Treat MacroButtons as a user-configured automation endpoint. MCP tools could later inspect or trigger numbered buttons, but should not infer arbitrary user intent or generate broad macro scripts.

### VBAN Real-Time Packets

The SDK header also defines packed VBAN structures for Voicemeeter real-time state and parameter packets.

Relevant fields include Voicemeeter type, version, sample rate, input/output levels, strip and bus states, strip/bus gain arrays, and strip/bus labels.

Recommendation:

- Defer VBAN real-time packet support. It is promising for read-only monitoring, but it is a different packet model from this repo's Matrix query/reply flow and should be implemented only after the product/provider boundary is defined.

## Concept Mapping

| Current Matrix concept | Matrix meaning in this repo                                                                          | Voicemeeter equivalent                                                                                                                                                                                                | Compatibility assessment                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Slot                   | A Matrix SUID/device endpoint queried with `Slot(SUID).*`.                                           | No direct slot equivalent. Voicemeeter has strips, buses, devices, and virtual I/O.                                                                                                                                   | Product-specific. Do not generalize `Slot` into a unified API.                                             |
| Point                  | A Matrix route from `SUID.IN[channel]` to `SUID.OUT[channel]` with gain, mute, phase.                | Strip-to-bus routing flags such as `Strip[i].A1`, `Strip[i].B1`, plus strip/bus gain and mute.                                                                                                                        | Similar user intent, different model. Voicemeeter routing is not arbitrary point-to-point channel routing. |
| SUID                   | Matrix stable unit identifier used in command strings and write allowlists.                          | Voicemeeter uses numeric strip/bus indexes, labels, and device names.                                                                                                                                                 | Not reusable. Voicemeeter needs edition-aware index validation and optional label lookup.                  |
| Presets                | Matrix preset patch commands are deferred in MVP.                                                    | Voicemeeter supports presets in prior-art MCP and commonly uses settings files/scripts; SDK supports multi-parameter scripts.                                                                                         | Conceptually similar, implementation-specific. Keep out of first spike.                                    |
| Engine                 | Matrix exposes `Command.Engine`, `Command.Restart`, and master clock queries.                        | Voicemeeter has an audio engine and user guide content for restarting it; SDK exposes app launch/login/type/version, but researched API symbols do not show a direct `restart engine` function in the header excerpt. | Need source verification before implementing. Avoid assuming Matrix `Command.Restart` maps directly.       |
| VBAN streams           | Matrix control currently sends VBAN-TEXT to `Command1` and receives `Request Reply` service packets. | Voicemeeter editions expose audio, MIDI, TEXT, and FRAME VBAN streams. SDK defines VBAN real-time structures.                                                                                                         | Packet layer may be reusable, command/reply semantics are not yet proven.                                  |
| Levels/meters          | Not in Matrix MVP.                                                                                   | SDK exposes `VBVMR_GetLevel`; VBAN real-time packets include input/output levels.                                                                                                                                     | Voicemeeter-specific read-only monitoring opportunity.                                                     |
| Devices                | Matrix slot queries include device/status details.                                                   | SDK exposes input/output device enumeration and string device parameters.                                                                                                                                             | Similar use case, separate tool schema.                                                                    |

## Naming And Architecture Recommendation

### Keep `vbmatrix-mcp` For Now

Renaming now would imply a supported unified surface before one exists. The package name, README, tool names, environment variables, and safety policy are all Matrix-specific. Keep them stable until there is at least one shipped Voicemeeter provider.

### Prefer Provider Boundaries Over Shared Semantics

A future unified architecture should look like this conceptually:

```text
MCP tools
  -> product/provider registry
    -> matrix provider
      -> VBAN-TEXT transport
      -> Matrix command builders/parsers
    -> voicemeeter provider
      -> Remote API adapter and/or VBAN adapter
      -> Voicemeeter parameter validators
```

Only low-level protocol utilities should be shared at first:

- VBAN header/stream-name packet functions.
- Potential VBAN receive filters by protocol/stream.
- Common MCP response helpers and safety-gate patterns.

Do not force Matrix slots/points and Voicemeeter strips/buses into a single generic route abstraction. A unification layer can be added later at the agent prompt/tool-description level once both product-specific adapters are reliable.

### Tool Naming

Near term:

- Keep existing `vbmatrix_*` tools unchanged.
- If Voicemeeter is prototyped in this repo, use explicit `voicemeeter_*` tool names.
- Avoid product-neutral names like `vbaudio_set_route` until behavior is consistent across providers.

Long term:

- If both providers ship in one package, consider renaming repo/package to `vbaudio-mcp` or creating a monorepo with packages such as `@basicbit/vbmatrix-mcp`, `@basicbit/voicemeeter-mcp`, and optionally `@basicbit/vbaudio-mcp` as a combined server.
- If Voicemeeter support requires native dependencies, a sibling package may be cleaner than adding Windows-only FFI concerns to the Matrix package.

## Follow-Up Issues

This research supports expansion only through narrow, product-specific follow-up work. The implementation follow-ups are intentionally grouped into a small number of larger, agent-ready issues:

1. [#24 Spike read-only Voicemeeter Remote API discovery](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/24)
   Scope: choose a TypeScript FFI/helper-process strategy, call login, get type, get version, and logout. Return structured edition metadata only. Do not add generic parameter strings, scripts, write tools, MacroButtons mutation, audio callbacks, or raw VBAN command execution.

2. [#22 Research Voicemeeter VBAN-TEXT query and reply behavior](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/22)
   Scope: with operator approval and a local install, send a read-only parameter query over the configured VBAN-TEXT stream and document whether replies use normal TEXT, SERVICE `Request Reply`, no reply, or another mechanism. This must land before any typed Voicemeeter VBAN tools rely on query/reply behavior.

3. [#23 Design Voicemeeter provider capabilities and safety model](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/23)
   Scope: define Voicemeeter provider capabilities, edition-aware validators, future write safety gates, tool naming, label/device/level/preset/MacroButtons boundaries, and whether native DLL integration belongs in this package or a sibling `voicemeeter-mcp` package. Feed concrete requirements into [#16](https://github.com/BASIC-BIT/vbmatrix-mcp/issues/16).

These issues cover the earlier candidate scopes for typed parameter validators, sibling-package evaluation, level/meter monitoring design, preset boundaries, and MacroButtons boundaries without splitting them into tiny chores.

## Unresolved Questions

- Does Voicemeeter respond to VBAN-TEXT parameter queries, and if so on which stream/protocol?
- Which Remote API license constraints matter for bundling a TypeScript MCP package or helper binary?
- Should this project accept a Windows-only native dependency for Voicemeeter, or keep Matrix and Voicemeeter packages separate?
- How should safety gates map from Matrix SUID allowlists to Voicemeeter strip/bus/device allowlists?
- Should raw script/parameter tools exist at all, and if so should they be disabled by default and hidden behind explicit environment flags?
