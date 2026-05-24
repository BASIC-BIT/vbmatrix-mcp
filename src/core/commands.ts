export const MIN_GAIN_DB = -100;
export const MAX_GAIN_DB = 24;
export const MAX_MATRIX_CHANNEL_INDEX = 679;

const SUID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface PointTarget {
  inputSuid: string;
  inputChannel: number;
  outputSuid: string;
  outputChannel: number;
}

export interface PointState {
  dBGain: string;
  mute: string;
  phase: string;
}

export function validateSuidSyntax(suid: string): void {
  if (!SUID_PATTERN.test(suid)) {
    throw new Error(`Invalid SUID: ${suid}`);
  }
}

export function validateChannelIndex(channel: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > MAX_MATRIX_CHANNEL_INDEX) {
    throw new Error(`Channel index must be an integer from 0 to ${MAX_MATRIX_CHANNEL_INDEX}`);
  }
}

export function validatePointTargetSyntax(target: PointTarget): void {
  validateSuidSyntax(target.inputSuid);
  validateSuidSyntax(target.outputSuid);
  validateChannelIndex(target.inputChannel);
  validateChannelIndex(target.outputChannel);
}

export function validateGain(gainDb: number): void {
  if (!Number.isFinite(gainDb) || gainDb < MIN_GAIN_DB || gainDb > MAX_GAIN_DB) {
    throw new Error(`Gain must be from ${MIN_GAIN_DB} dB to +${MAX_GAIN_DB} dB`);
  }
}

export function pointExpression(target: PointTarget): string {
  validatePointTargetSyntax(target);
  return `Point(${target.inputSuid}.IN[${target.inputChannel}],${target.outputSuid}.OUT[${target.outputChannel}])`;
}

export function pointPropertyQuery(target: PointTarget, property: 'dBGain' | 'Mute' | 'Phase'): string {
  return `${pointExpression(target)}.${property}=?;`;
}

export function setPointGainCommand(target: PointTarget, gainDb: number): string {
  validateGain(gainDb);
  return `${pointExpression(target)}.dBGain=${gainDb};`;
}

export function setPointMuteCommand(target: PointTarget, muted: boolean): string {
  return `${pointExpression(target)}.Mute=${muted ? 1 : 0};`;
}

export function setPointPhaseCommand(target: PointTarget, phaseReversed: boolean): string {
  return `${pointExpression(target)}.Phase=${phaseReversed ? 1 : 0};`;
}

export function slotPropertyQuery(suid: string, property: 'Info' | 'Online' | 'RunningStatus' | 'Device' | 'Master'): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).${property}=?;`;
}

export function commandPropertyQuery(property: 'Version' | 'Engine' | 'Master'): string {
  return `Command.${property}=?;`;
}

export function restartEngineCommand(): string {
  return 'Command.Restart=1;';
}

export function parseResponseValue(response: string): string {
  const trimmed = response.trim();
  const match = /^.+?=\s*(.*?)\s*;?$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}
