# Windows Audio Provider

The `windows_audio_*` provider exposes bounded, read-only Windows Core Audio facts through an isolated helper process. It complements Matrix and Voicemeeter; it does not reinterpret Windows endpoints as Matrix slots or claim that the operating-system graph is the Matrix grid.

## Current Tools

- `windows_audio_get_capabilities` reports the provider boundary and platform semantics without launching the helper.
- `windows_audio_get_endpoints` enumerates render and/or capture endpoints. It returns active endpoints by default and can opt into inactive records, a case-insensitive name filter, and a caller-selected cap from 1 through 200.
- `windows_audio_get_defaults` resolves render and capture defaults for the console, multimedia, and communications roles.

Endpoint records can include the stable endpoint ID, data flow, device state, friendly and interface names, policy GUID, interface path, default roles, and the current shared-mode mix format. Individual mix-format activation failures remain local endpoint facts instead of failing the entire inventory.

The underlying Windows APIs are `IMMDeviceEnumerator::EnumAudioEndpoints`, `IMMDeviceEnumerator::GetDefaultAudioEndpoint`, `IMMDevice`, `IPropertyStore`, and `IAudioClient::GetMixFormat`. See the Microsoft documentation for [endpoint enumeration](https://learn.microsoft.com/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immdeviceenumerator-enumaudioendpoints), [default endpoint roles](https://learn.microsoft.com/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immdeviceenumerator-getdefaultaudioendpoint), and [mix formats](https://learn.microsoft.com/windows/win32/api/audioclient/nf-audioclient-iaudioclient-getmixformat).

## Helper Contract

The MCP server never loads Core Audio COM interfaces in-process. For each call it launches one helper process, sends exactly one newline-terminated JSON request on stdin, reads one JSON object from stdout, and then lets the process exit.

Request envelope:

```json
{
  "protocolVersion": 1,
  "requestId": "generated-request-id",
  "operation": "endpoints",
  "payload": {
    "flow": "all",
    "includeInactive": false,
    "nameFilter": "",
    "maxEndpoints": 80
  }
}
```

Every helper response must echo `protocolVersion` and `requestId`. The server rejects mismatches, non-object JSON, empty output, oversized input/output, duplicate endpoint identities, inconsistent counts, and responses that fail the typed operation schema. A hard timeout kills the one-request helper process, which is also the cancellation boundary.

The bundled helper accepts only `status`, `endpoints`, and `defaults`. It does not accept arbitrary script text, registry paths, COM interface names, or method names. A custom helper can be configured for development or recovery, but it must implement the same contract.

## Implementation Decision

The first packaged implementation is a PowerShell-hosted, narrowly scoped C# helper:

- It works with the repository's existing Windows helper packaging model.
- It keeps COM lifetime and marshalling failures outside the MCP server process.
- It does not require Python, a .NET SDK, a native Node addon, ABI-specific prebuilds, or end-user C/C++ build tools.
- The C# source is inspectable in the npm package and is compiled by Windows PowerShell `Add-Type` for each isolated request.

Alternatives remain possible behind `WINDOWS_AUDIO_HELPER_COMMAND`. A Python default would add a runtime and package-management prerequisite. Direct Node FFI/native addons would add Node ABI and installation risk. A precompiled .NET helper could improve cold start later, but would add a binary build, signing, and release pipeline that this initial read-only slice does not justify.

## Availability And Partial Results

The tools stay registered on all platforms for stable MCP discovery. On non-Windows hosts they return `availability: "unsupported_platform"`; the server continues running. Missing/disabled helpers, invalid configuration, process launch failure, timeout, output limits, invalid JSON, request mismatches, and helper contract violations use distinct error codes.

The helper enumerates current-user Core Audio state without elevation. A role can legitimately have no available default endpoint. An inactive endpoint does not expose a usable mix format. These are represented as facts rather than whole-request crashes.

## Privacy

Endpoint IDs, policy GUIDs, interface paths, and device names can reveal machine-specific details. Tool responses return them because they are necessary stable identifiers for later exact operations, but support reports should redact them. The helper never logs endpoint inventory to stdout or stderr, and fixtures/tests use synthetic values only.

## Safety

This provider currently has no write operations and no raw escape hatch. It cannot:

- change default devices or Windows roles;
- enable, disable, or remove endpoints;
- change session or endpoint volume/mute;
- edit persisted per-application routing;
- invoke arbitrary PowerShell, COM calls, or registry operations.

Future Windows writes require a separate design and review with exact IDs, dry-run plans, hash-bound apply, pre-state/post-state, rollback guidance, a dedicated opt-in gate, and bounded audit evidence.

## Validation Evidence

| Capability                                        | Evidence                            | Notes                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider metadata and cross-platform availability | Unit-tested                         | Stable `windows_audio_*` namespace; unsupported platforms return structured results.                                                                                       |
| JSON-stdio request/response matching              | Unit-tested + Windows live-tested   | Tests cover matching and mismatched request IDs, invalid JSON, oversized output, invalid config, and process errors.                                                       |
| Endpoint inventory and caps                       | Mocked-tested + Windows live-tested | Live read enumerated active endpoints, honored a three-item cap, and returned plausible channel/sample-rate/bit-depth mix formats. No endpoint names or IDs are committed. |
| Six flow/role defaults                            | Mocked-tested + Windows live-tested | Live read returned render/capture rows for console, multimedia, and communications.                                                                                        |
| Package contents                                  | Package-smoke tested                | The bundled helper and this document are required package entries.                                                                                                         |
| Endpoint/default writes                           | Not implemented                     | Deliberately outside this read-only slice.                                                                                                                                 |
| Sessions, app routes, ASIO, and spatial audio     | Deferred                            | Planned as additional read-only operations after this provider boundary is reviewed.                                                                                       |
