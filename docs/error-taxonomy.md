# Error Taxonomy And Compatibility Notes

This project keeps MCP stdout reserved for protocol traffic. Diagnostics, scripts, and tests must not treat human-readable stdout logging as acceptable server behavior; operational messages belong on stderr or in structured MCP tool responses.

## Transport and VBAN setup

- `VbanTextTimeoutError` means a query was sent but no accepted Matrix reply arrived before `VBMATRIX_TIMEOUT_MS`.
- `no_packets_observed` is indeterminate. It matches wrong host, wrong UDP port, firewall or network blocks, disabled VBAN service, disabled incoming TEXT stream, Matrix not running, and cases where Matrix receives the command but emits no observable reply.
- `wrong_stream_observed` means UDP packets arrived, but only on a stream other than the configured command stream or Matrix `Request Reply` stream.
- `unsupported_protocol_observed` means VBAN packets arrived, but they were not TEXT or SERVICE packets accepted by this MCP server.
- `malformed_packet_observed` means UDP/VBAN-like packets arrived but were too short, had bad `VBAN` magic, or used a non-UTF-8 TEXT format.
- Matrix query replies are accepted from SERVICE packets on `Request Reply`; the configured `VBMATRIX_STREAM` remains the incoming TEXT command stream and should not be set to `Request Reply`.

## Matrix replies

- Matrix `Err` values are protocol-level replies, not VBAN packet parse failures. Callers should classify `Err` in the context of the original query or tool, then return an actionable tool error or partial-success state.
- Query-before-write tools should preserve pre-state and post-state failures separately. A write may have succeeded even when the post-write query times out or returns an unexpected value.

## Safety errors

- `SafetyError` carries a stable `code` and `details` object for server-side gates.
- `writes_disabled` means `VBMATRIX_MCP_ALLOW_WRITES=false` blocked a write-capable tool.
- `suid_not_allowed` means `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false` and the target SUID was absent from `VBMATRIX_MCP_ALLOWED_SUIDS`.
- `destructive_disabled` means `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` blocked a destructive or system-affecting operation.
- `confirmation_required` means the operation also needs an explicit confirmation field, such as slot reset/device changes with `confirm=true`.

## Compatibility boundary

- Error strings may change as messages become more actionable. Prefer stable `SafetyError.code`, timeout diagnostic classifications, and structured tool payload fields over matching prose.
- Write tools are available by default so the MCP harness can enforce operator approval. Hardened deployments should set `VBMATRIX_MCP_ALLOW_WRITES=false`, `VBMATRIX_MCP_ALLOW_ALL_SUIDS=false`, or `VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false` as appropriate.
- See `docs/api-compatibility.md` for the broader tool name, input schema, response shape, and breaking-change policy.
