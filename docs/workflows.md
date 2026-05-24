# Applied Audio Workflows

These recipes use the current MCP tool surface only:

- `vbmatrix_ping`
- `vbmatrix_vban_diagnostics`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info`
- `vbmatrix_get_point`
- `vbmatrix_capture_snapshot`
- `vbmatrix_diff_snapshots`
- `vbmatrix_restore_snapshot`
- `vbmatrix_set_point_gain`
- `vbmatrix_set_point_mute`
- `vbmatrix_set_point_phase`
- `vbmatrix_restart_engine`

The MVP has no broad matrix scan, preset, route group, undo stack, metering, or device-selection tools. Snapshot tools only capture explicit selected slots and points. Recipes that would benefit from broader tools are marked as future-tool placeholders.

## Safe Route Inspection

Use this when the user asks what a route is doing or before any live change.

1. Confirm the exact endpoint IDs before querying.

- Required: input SUID, input channel, output SUID, output channel.
- If the request is fuzzy, ask the operator to identify the input and output instead of guessing from names like cue, booth, stream, or main.

2. Check control-plane health.

```text
vbmatrix_ping
vbmatrix_vban_diagnostics
vbmatrix_get_engine
vbmatrix_get_master
```

3. Check slot state for both SUIDs.

```text
vbmatrix_get_slot_info({ "suid": "VASIO8" })
vbmatrix_get_slot_info({ "suid": "VAIO1" })
```

4. Query the exact point.

```text
vbmatrix_get_point({
  "inputSuid": "VASIO8",
  "inputChannel": 1,
  "outputSuid": "VAIO1",
  "outputChannel": 1
})
```

5. Report the route state in operator terms.

- `gainDb`: route gain; `-inf` means removed/silent for gain writes.
- `muted`: route mute state.
- `phaseReversed`: polarity inversion state.
- Include engine/master/slot anomalies before recommending writes.

## Route Apply And Cleanup

Use this when the operator approves a specific point change.

1. Collect the target and desired value.

- Gain changes need an explicit dB value or `-inf` cleanup/removal request.
- Mute and phase changes need explicit boolean intent.
- Confirm that the operator accepts a live audio change.

2. Query pre-state with `vbmatrix_get_point`.

3. Apply exactly one small write.

```text
vbmatrix_set_point_gain({
  "inputSuid": "VASIO8",
  "inputChannel": 1,
  "outputSuid": "VAIO1",
  "outputChannel": 1,
  "gainDb": -3
})

vbmatrix_set_point_mute({
  "inputSuid": "VASIO8",
  "inputChannel": 1,
  "outputSuid": "VAIO1",
  "outputChannel": 1,
  "muted": true
})

vbmatrix_set_point_phase({
  "inputSuid": "VASIO8",
  "inputChannel": 1,
  "outputSuid": "VAIO1",
  "outputChannel": 1,
  "phaseReversed": false
})
```

4. Read and report the tool response.

- Current write tools are expected to include pre-state and post-state when available.
- If post-state is missing or timed out, say the write was sent but verification failed.

5. Cleanup pattern.

- To silence one route temporarily, prefer `vbmatrix_set_point_mute` if the operator wants an easy restore.
- To remove one route point, use `vbmatrix_set_point_gain` with `gainDb: "-inf"` only after approval.
- Do not use broad reset, raw command, or inferred multi-point cleanup; those commands are intentionally not exposed.

## Emergency Mute Caveats

The current MCP can mute one known point. It cannot safely infer every path feeding a speaker, stream, cue bus, or physical output.

Use this flow for emergency requests:

1. Ask for the exact route or output path if it is not already known.
2. If the exact point is known, query it with `vbmatrix_get_point`.
3. Ask for operator confirmation unless the operator already gave a direct emergency instruction for that exact point.
4. Call `vbmatrix_set_point_mute` for that point.
5. Verify and report whether the post-state confirms mute.

Caveats:

- Do not claim a whole speaker, headphones bus, stream mix, or room is muted unless every relevant route has been explicitly checked.
- Do not restart the audio engine as an emergency mute unless the operator explicitly approves the disruption.
- Hardware knobs, external mixers, DAW routing, and application audio paths may still pass audio outside VBMatrix.

Future-tool placeholder: a dedicated `mute_output` or route-group tool could make whole-output emergency handling deterministic after it can enumerate and verify all contributing points.

## Before-Show Verification

Use this before a stream, DJ set, recording, or live show.

1. Establish MCP and engine health.

```text
vbmatrix_ping
vbmatrix_get_engine
vbmatrix_get_master
```

2. Ask the operator for the show-critical route list.

- Example fields: purpose, input SUID/channel, output SUID/channel, expected `gainDb`, expected `muted`, expected `phaseReversed`.
- Keep this as an operator-provided checklist until route inventory tools exist.

3. For each listed route:

- Run `vbmatrix_get_slot_info` for new SUIDs as they appear.
- Run `vbmatrix_get_point` for the exact point.
- Compare actual state to the operator's expected state.

4. Report only facts and mismatches.

- Good: `Deck A to stream L is unmuted at -3 dB; expected -3 dB.`
- Good: `Cue to headphones R is muted; expected unmuted. Approval needed before changing.`
- Bad: `Everything is show-ready` if only a partial route list was checked.

Future-tool placeholder: a versioned show checklist or preset verifier could store known-good route expectations once the repo has a fixture format and validation model.

## Live-Show Rollback Snapshot

Use this before an approved live-show change that may need rollback.

1. Build an explicit route list with the operator.

- Include only known show-critical points and slot SUIDs.
- Do not infer endpoints from labels such as main, booth, stream, or cue.

2. Capture a targeted snapshot.

```text
vbmatrix_capture_snapshot({
  "slots": ["VASIO8", "VAIO1"],
  "points": [
    {
      "inputSuid": "VASIO8",
      "inputChannel": 1,
      "outputSuid": "VAIO1",
      "outputChannel": 1
    }
  ],
  "writeToFile": true
})
```

3. Keep the returned `artifactPath` in the session notes and perform the approved route changes.

4. If rollback is needed, plan first.

```text
vbmatrix_restore_snapshot({
  "snapshotFile": ".vbmatrix-snapshots/vbmatrix-snapshot-example.json",
  "dryRun": true
})
```

5. Review every planned command. Execute only after operator approval.

```text
vbmatrix_restore_snapshot({
  "snapshotFile": ".vbmatrix-snapshots/vbmatrix-snapshot-example.json",
  "dryRun": false,
  "confirmRestore": "RESTORE_SNAPSHOT",
  "confirmBroadRestore": true
})
```

Rollback limits:

- Snapshot restore only restores selected point `dBGain`, `mute`, and `phase`.
- Slot fields, labels, and preset metadata are informational and non-restorable in this MCP version.
- A snapshot is not a whole-system undo unless the route list covered every relevant point.

## Emergency Cleanup With Snapshot Guardrails

Use this when a live routing experiment needs cleanup but there is no safe broad reset tool.

1. Stop adding new writes and identify the exact points changed.
2. If a pre-change snapshot exists, run `vbmatrix_diff_snapshots` against a fresh capture of the same points.
3. Use `vbmatrix_restore_snapshot` with `dryRun: true` to generate a cleanup plan.
4. If the operator approves, execute the restore with the explicit confirmations.
5. If no snapshot exists, clean up one explicit point at a time with primitive setters after querying each pre-state.

Do not use engine restart, raw VBAN commands, or broad reset/remove commands as cleanup shortcuts unless the operator explicitly accepts the disruption outside this MCP tool surface.

## Live Audio Evidence Workflow

Use this when diagnosing a problem during or after a live session.

1. Capture the user's symptom in plain language.

- What was heard or missing?
- Which endpoint was affected?
- When did it start?
- Is the system live right now?

2. Gather read-only facts first.

```text
vbmatrix_ping
vbmatrix_get_engine
vbmatrix_get_master
vbmatrix_get_slot_info({ "suid": "VASIO8" })
vbmatrix_get_point({
  "inputSuid": "VASIO8",
  "inputChannel": 1,
  "outputSuid": "VAIO1",
  "outputChannel": 1
})
```

3. Separate observed facts from hypotheses.

- Fact: `muted` returned `true`.
- Hypothesis: `This may explain silence on that route.`

4. If a change is needed, move to the route apply flow and ask for approval.

5. Record unresolved gaps.

- Missing exact endpoint IDs.
- Missing metering or audio-device state.
- Possible non-VBMatrix causes such as DAW, OBS, driver, or hardware routing.
