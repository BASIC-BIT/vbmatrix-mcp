import { setPointGainCommand, setPointMuteCommand, setPointPhaseCommand, type PointState, type PointTarget } from './commands.js';

export const LIVE_VERIFY_CONFIRMATION = 'I_UNDERSTAND_THIS_CHANGES_AUDIO';

export interface LiveAudioVerifyConfig {
  target: PointTarget;
  baselineWav: string;
  mutedWav: string;
  gainWav: string;
  phaseNormalWav: string;
  phaseInvertedWav: string;
  gainDb: number;
  channel?: number;
  muteDropDb?: number;
  gainToleranceDb?: number;
  phaseCorrelationMax?: number;
  settleMs?: number;
}

export interface VerificationCheck {
  name: string;
  pass: boolean;
  expected: string;
  actual: number;
}

export interface VerificationMeasurements {
  baselineRmsDbfs: number;
  mutedRmsDbfs: number;
  gainRmsDbfs: number;
  phaseCorrelation: number;
}

export interface VerificationResult {
  ok: boolean;
  checks: VerificationCheck[];
}

export function assertLiveRunAllowed(run: boolean, env: Record<string, string | undefined> = process.env): void {
  if (!run) return;
  if (env.VBMATRIX_LIVE_VERIFY !== LIVE_VERIFY_CONFIRMATION) {
    throw new Error(`Live verification writes require VBMATRIX_LIVE_VERIFY=${LIVE_VERIFY_CONFIRMATION}`);
  }
}

export function buildLiveAudioVerificationCommands(config: LiveAudioVerifyConfig): string[] {
  return [
    setPointGainCommand(config.target, 0),
    setPointMuteCommand(config.target, false),
    setPointPhaseCommand(config.target, false),
    setPointMuteCommand(config.target, true),
    setPointMuteCommand(config.target, false),
    setPointGainCommand(config.target, config.gainDb),
    setPointGainCommand(config.target, 0),
    setPointPhaseCommand(config.target, true),
    setPointPhaseCommand(config.target, false),
  ];
}

export function restorePointCommands(target: PointTarget, state: PointState): string[] {
  const commands: string[] = [];
  if (state.dBGain === '-inf') return [setPointGainCommand(target, '-inf')];
  commands.push(setPointGainCommand(target, Number(state.dBGain)));
  commands.push(setPointMuteCommand(target, state.mute === '1'));
  commands.push(setPointPhaseCommand(target, state.phase === '1'));
  return commands;
}

export function evaluateVerification(
  config: LiveAudioVerifyConfig,
  measurements: VerificationMeasurements
): VerificationResult {
  const muteDropDb = config.muteDropDb ?? 35;
  const gainToleranceDb = config.gainToleranceDb ?? 1.5;
  const phaseCorrelationMax = config.phaseCorrelationMax ?? -0.8;
  const gainDelta = measurements.gainRmsDbfs - measurements.baselineRmsDbfs;
  const muteDelta = measurements.mutedRmsDbfs - measurements.baselineRmsDbfs;

  const checks: VerificationCheck[] = [
    {
      name: 'mute attenuates audio',
      pass: muteDelta <= -muteDropDb,
      expected: `muted RMS at least ${muteDropDb} dB below baseline`,
      actual: muteDelta,
    },
    {
      name: 'gain changes level',
      pass: Math.abs(gainDelta - config.gainDb) <= gainToleranceDb,
      expected: `gain delta within ${gainToleranceDb} dB of ${config.gainDb} dB`,
      actual: gainDelta,
    },
    {
      name: 'phase inversion is measurable',
      pass: measurements.phaseCorrelation <= phaseCorrelationMax,
      expected: `phase-normal and phase-inverted correlation <= ${phaseCorrelationMax}`,
      actual: measurements.phaseCorrelation,
    },
  ];

  return { ok: checks.every((check) => check.pass), checks };
}
