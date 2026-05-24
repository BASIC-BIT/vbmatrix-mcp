# Live Audio Verification

`npm run verify:live-audio` is an opt-in manual harness for proving a Matrix point changed real audio. It is not part of CI and dry-runs by default.

## Safety Gates

The harness writes Matrix routes only when both conditions are true:

- The command includes `--run`.
- `VBMATRIX_LIVE_VERIFY=I_UNDERSTAND_THIS_CHANGES_AUDIO` is set in the environment.

Without both gates, the script only validates config, prints the planned commands, and measures WAV files if they already exist.

During a live run, the script queries the target point before changes and restores gain, mute, and phase in a `finally` block where possible.

## Local Config

Copy `live-audio-verify.example.json` to `live-audio-verify.local.json` and replace the target with operator-approved SUIDs/channels. The local config and `live-audio-artifacts/` are gitignored.

Example dry-run:

```bash
npm run verify:live-audio
```

Example live run after operator approval:

```bash
$env:VBMATRIX_LIVE_VERIFY = "I_UNDERSTAND_THIS_CHANGES_AUDIO"
npm run verify:live-audio -- --run
```

## Evidence Files

The harness expects WAV captures for these states:

- `baselineWav`: target at `0 dB`, unmuted, normal phase.
- `mutedWav`: same route muted.
- `gainWav`: same route unmuted with `gainDb` applied.
- `phaseNormalWav`: normal phase reference.
- `phaseInvertedWav`: phase-inverted capture.

The script measures RMS level and phase correlation, then emits PASS/FAIL checks as JSON.

## Artifact Policy

Do not commit local WAVs, private device names, logs, screenshots, or machine-specific configs. Keep captures under `live-audio-artifacts/` and keep local endpoint details in `*.local.json` files.
