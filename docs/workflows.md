# Applied Audio Workflows

These recipes use the current MCP tool surface only:

- `vbmatrix_ping`
- `vbmatrix_vban_diagnostics`
- `vbmatrix_inspect_routes`
- `vbmatrix_inspect_slots`
- `vbmatrix_get_engine`
- `vbmatrix_get_master`
- `vbmatrix_get_slot_info`
- `vbmatrix_get_point`
- `vbmatrix_get_channel_label`
- `vbmatrix_get_preset_patch`
- `vbmatrix_get_file_state`
- `vbmatrix_capture_snapshot`
- `vbmatrix_diff_snapshots`
- `vbmatrix_restore_snapshot`
- `vbmatrix_safe_route_workflow`
- `vbmatrix_set_point_gain`
- `vbmatrix_set_point_mute`
- `vbmatrix_set_point_phase`
- `vbmatrix_apply_point_range`
- `vbmatrix_apply_zone`
- `vbmatrix_set_slot_online`
- `vbmatrix_set_slot_master`
- `vbmatrix_set_slot_device`
- `vbmatrix_remove_slot_device`
- `vbmatrix_set_channel_label`
- `vbmatrix_remove_channel_label`
- `vbmatrix_reset_channel_routes`
- `vbmatrix_preset_patch`
- `vbmatrix_preset_patch_file`
- `vbmatrix_restart_engine`

The MCP has no broad matrix scan, undo stack, metering subscription, or fuzzy device-selection workflow. `vbmatrix_inspect_slots` inspects only explicit candidate slots and selected channels, and `vbmatrix_inspect_routes` inspects only explicit selected points. Both are capped. Snapshot tools only capture explicit selected slots and points. Preset patch tools operate on explicit numeric patch indexes and dry-run by default. Slot device tools require exact device names plus confirmation. `vbmatrix_safe_route_workflow` groups a few explicit point operations with snapshot/rollback guardrails; it does not infer DJ intent, output groups, speakers, cue buses, or show-critical routes. Recipes that would benefit from broader tools are marked as future-tool placeholders.

## Tool Selection

Use primitives when making one known low-level read or write and the caller already has a rollback plan. Use `vbmatrix_safe_route_workflow` when the operator wants one of the supported explicit point workflows with dry-run, snapshot, planned commands, and rollback commands in one response. Use skills or playbooks, not deterministic code, when the request contains fuzzy roles such as deck, cue, booth, stream, main, monitor, or all outputs without exact SUID/channel points.

Live audio validation was intentionally skipped for the safe routing workflow implementation. To validate audio later, first agree on safe test routes with the operator, then use `npm run verify:live-audio` after building and setting `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO` with `--run`; otherwise keep the harness in dry-run mode.

## Safe Routing Workflow Tool

Use this for the three supported safe-core operations when every point target is explicit.

Supported operations:

- `auditionRoute`: snapshots one explicit point, plans or sets finite `gainDb`, `muted`, and `phaseReversed`, and returns rollback commands.
- `cleanupRoutes`: snapshots explicit points, plans or removes only those points, and returns rollback commands.
- `emergencyMute`: snapshots explicit points, plans or sets `Mute=1` only for those points, and returns rollback commands.

Dry-run is the default. Execution requires `dryRun: false` and `confirmApply: "SAFE_ROUTE_APPLY"` after reviewing the returned plan and rollback data.

Example audition preview:

```text
vbmatrix_safe_route_workflow({
  "operation": "auditionRoute",
  "target": {
    "inputSuid": "VASIO8",
    "inputChannel": 1,
    "outputSuid": "ASIO128",
    "outputChannel": 126
  },
  "gainDb": -6,
  "muted": false,
  "phaseReversed": false
})
```

Example cleanup execution after preview:

```text
vbmatrix_safe_route_workflow({
  "operation": "cleanupRoutes",
  "points": [
    {
      "inputSuid": "VASIO8",
      "inputChannel": 1,
      "outputSuid": "ASIO128",
      "outputChannel": 126
    }
  ],
  "dryRun": false,
  "confirmApply": "SAFE_ROUTE_APPLY"
})
```

Deferred workflows:

- Output-wide mute remains deferred because the server cannot enumerate and verify all contributing points for a physical or logical output.
- DJ deck/cue/booth routing remains in skills/playbooks until the operator supplies exact SUID/channel points.
- Live audio verification remains operator-approved and external to this workflow because route safety depends on the local rig and test signal.

## Safe Route Inspection

Use this when the user asks what a route is doing or before any live change.

1. Confirm the exact endpoint IDs before querying.

- Required: input SUID, input channel, output SUID, output channel.
- If the request is fuzzy, ask the operator to identify the input and output instead of guessing from names like cue, booth, stream, or main.

If the operator only has candidate slots or channel labels, inspect those explicit candidates first:

```text
vbmatrix_inspect_slots({
  "slots": [
    { "suid": "VASIO8", "inputChannels": [1, 2] },
    { "suid": "VAIO1", "outputChannels": [1, 2] }
  ]
})
```

2. Inspect the explicit candidate route in one bounded read-only call.

```text
vbmatrix_inspect_routes({
  "points": [
    {
      "inputSuid": "VASIO8",
      "inputChannel": 1,
      "outputSuid": "VAIO1",
      "outputChannel": 1
    }
  ]
})
```

3. If the inspect call reports transport or packet problems, fall back to connection diagnostics.

```text
vbmatrix_ping
vbmatrix_vban_diagnostics
```

4. Query one primitive directly only when you need to isolate a specific field.

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
- Matrix `Err` values in otherwise successful query observations mean Matrix answered the typed query but the specific property or point was unavailable; ask the operator to verify the SUID/channel in the UI instead of treating it as a transport failure.

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

## Preset Patch Scene Change

Use this when the operator has already prepared a Matrix preset patch and wants to inspect or apply it as a scene.

1. Confirm the exact 1-based preset patch index. Do not infer indexes from labels such as intro, break, stream, or DJ.
2. Read patch state with `vbmatrix_get_preset_patch({ "index": 1 })` and report name, comment, gain, apply/mute/phase counts, zone count, and point count.
3. Capture a targeted point snapshot first if the operator needs MCP rollback for known critical routes.
4. Dry-run the scene action, for example `vbmatrix_preset_patch({ "index": 1, "operation": "apply" })`.
5. Execute only after operator approval with `dryRun: false` and `confirmOperation: "PRESET_PATCH_WRITE"`.
6. Report the exact command and before/after preset patch state. If post-state query fails, report that the write was sent but verification failed.

Preset patch XML load and save-as are available through `vbmatrix_preset_patch_file` when the path is under an allowed root and the operator approves execution. Project/grid load/save and implicit overwrite workflows remain outside this recipe until their file safety model is proven.

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
- Slot fields, labels, and preset metadata are informational and non-restorable in snapshot restore.
- A snapshot is not a whole-system undo unless the route list covered every relevant point.

## Emergency Cleanup With Snapshot Guardrails

Use this when a live routing experiment needs cleanup but there is no safe broad reset tool.

1. Stop adding new writes and identify the exact points changed.
2. If a pre-change snapshot exists, run `vbmatrix_diff_snapshots` against a fresh capture of the same points.
3. Use `vbmatrix_restore_snapshot` with `dryRun: true` to generate a cleanup plan.
4. If the operator approves, execute the restore with the explicit confirmations.
5. If no snapshot exists, clean up one explicit point at a time with primitive setters after querying each pre-state.

Do not use engine restart, raw VBAN commands, or broad reset/remove commands as cleanup shortcuts unless the operator explicitly accepts the disruption outside this MCP tool surface.

## Zone Apply With Dry-Run

Use this when the operator has provided exact Matrix zone corners and a concrete zone operation.

1. Capture the exact `startInputSuid`, `startInputChannel`, `startOutputSuid`, `startOutputChannel`, `endInputSuid`, `endInputChannel`, `endOutputSuid`, and `endOutputChannel`.
2. Dry-run `vbmatrix_apply_zone` and inspect the returned `command`.
3. Confirm that the operator accepts the zone scope and that no aggregate before/after state query is available.
4. Execute only with `dryRun: false` and `confirmApply: true` after approval.

```text
vbmatrix_apply_zone({
  "startInputSuid": "VASIO8",
  "startInputChannel": 1,
  "startOutputSuid": "ASIO128",
  "startOutputChannel": 125,
  "endInputSuid": "VASIO8",
  "endInputChannel": 2,
  "endOutputSuid": "ASIO128",
  "endOutputChannel": 126,
  "operation": "gain",
  "gainDb": -6,
  "dryRun": true
})
```

Zone reset and `gainDb: "-inf"` build `Zone(...).Reset;`; execute them only when the destructive gate is enabled and the operator explicitly approves route removal.

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
