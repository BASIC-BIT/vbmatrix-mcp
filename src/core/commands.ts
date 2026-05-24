export const MIN_GAIN_DB = -100;
export const MAX_GAIN_DB = 24;
export const MIN_MATRIX_CHANNEL = 1;
export const MAX_MATRIX_CHANNEL = 3112;
export type MatrixGain = number | '-inf';

const SUID_PATTERN = /^[A-Za-z0-9_.-]+$/;

export interface PointTarget {
  inputSuid: string;
  inputChannel: number;
  outputSuid: string;
  outputChannel: number;
}

export interface ChannelRange {
  start: number;
  end: number;
}

export interface PointRangeTarget {
  inputSuid: string;
  inputChannels: ChannelRange;
  outputSuid: string;
  outputChannels: ChannelRange;
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
  if (!Number.isInteger(channel) || channel < MIN_MATRIX_CHANNEL || channel > MAX_MATRIX_CHANNEL) {
    throw new Error(`Channel must be an integer from ${MIN_MATRIX_CHANNEL} to ${MAX_MATRIX_CHANNEL}`);
  }
}

export function validatePointTargetSyntax(target: PointTarget): void {
  validateSuidSyntax(target.inputSuid);
  validateSuidSyntax(target.outputSuid);
  validateChannelIndex(target.inputChannel);
  validateChannelIndex(target.outputChannel);
}

export function validateChannelRange(range: ChannelRange): void {
  validateChannelIndex(range.start);
  validateChannelIndex(range.end);
  if (range.start > range.end) {
    throw new Error(`Channel range start must be less than or equal to end: ${range.start}..${range.end}`);
  }
}

export function validatePointRangeTargetSyntax(target: PointRangeTarget): void {
  validateSuidSyntax(target.inputSuid);
  validateSuidSyntax(target.outputSuid);
  validateChannelRange(target.inputChannels);
  validateChannelRange(target.outputChannels);
}

export function validateGain(gainDb: MatrixGain): void {
  if (gainDb === '-inf') return;
  if (!Number.isFinite(gainDb) || gainDb < MIN_GAIN_DB || gainDb > MAX_GAIN_DB) {
    throw new Error(`Gain must be from ${MIN_GAIN_DB} dB to +${MAX_GAIN_DB} dB`);
  }
}

export function pointExpression(target: PointTarget): string {
  validatePointTargetSyntax(target);
  return `Point(${target.inputSuid}.IN[${target.inputChannel}],${target.outputSuid}.OUT[${target.outputChannel}])`;
}

export function channelRangeExpression(range: ChannelRange): string {
  validateChannelRange(range);
  return range.start === range.end ? `${range.start}` : `${range.start}..${range.end}`;
}

export function pointRangeExpression(target: PointRangeTarget): string {
  validatePointRangeTargetSyntax(target);
  return `Point(${target.inputSuid}.IN[${channelRangeExpression(target.inputChannels)}],${target.outputSuid}.OUT[${channelRangeExpression(target.outputChannels)}])`;
}

export function pointPropertyQuery(target: PointTarget, property: 'dBGain' | 'Mute' | 'Phase'): string {
  return `${pointExpression(target)}.${property}=?;`;
}

export function setPointGainCommand(target: PointTarget, gainDb: MatrixGain): string {
  validateGain(gainDb);
  if (gainDb === '-inf') return `${pointExpression(target)}.Remove;`;
  return `${pointExpression(target)}.dBGain=${gainDb};`;
}

export function removePointCommand(target: PointTarget): string {
  return `${pointExpression(target)}.Remove;`;
}

export function setPointMuteCommand(target: PointTarget, muted: boolean): string {
  return `${pointExpression(target)}.Mute=${muted ? 1 : 0};`;
}

export function setPointPhaseCommand(target: PointTarget, phaseReversed: boolean): string {
  return `${pointExpression(target)}.Phase=${phaseReversed ? 1 : 0};`;
}

export function setPointRangeGainCommand(target: PointRangeTarget, gainDb: MatrixGain): string {
  validateGain(gainDb);
  if (gainDb === '-inf') return removePointRangeCommand(target);
  return `${pointRangeExpression(target)}.dBGain=${gainDb};`;
}

export function setPointRangeMuteCommand(target: PointRangeTarget, muted: boolean): string {
  return `${pointRangeExpression(target)}.Mute=${muted ? 1 : 0};`;
}

export function setPointRangePhaseCommand(target: PointRangeTarget, phaseReversed: boolean): string {
  return `${pointRangeExpression(target)}.Phase=${phaseReversed ? 1 : 0};`;
}

export function removePointRangeCommand(target: PointRangeTarget): string {
  return `${pointRangeExpression(target)}.Remove;`;
}

export function pointRangeSize(target: PointRangeTarget): number {
  validatePointRangeTargetSyntax(target);
  return (target.inputChannels.end - target.inputChannels.start + 1) *
    (target.outputChannels.end - target.outputChannels.start + 1);
}

export function slotPropertyQuery(suid: string, property: 'Info' | 'Online' | 'RunningStatus' | 'Device' | 'Master'): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).${property}=?;`;
}

export function commandPropertyQuery(property: 'Version' | 'Engine' | 'Master'): string {
  return `Command.${property}=?;`;
}

export function restartEngineCommand(): string {
  return 'Command.Restart;';
}

export function parseResponseValue(response: string): string {
  const trimmed = response.trim();
  const match = /^.+?=\s*(.*?)\s*;?$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function normalizeResponseKey(key: string): string {
  return key.replace(/\s+/g, '');
}

export function parseQueryResponseValue(queryCommand: string, response: string): string {
  const expectedMatch = /^(.+?)\s*=\s*\?\s*;?$/.exec(queryCommand.trim());
  if (!expectedMatch) throw new Error(`Command is not a query: ${queryCommand}`);

  const responseMatch = /^(.+?)\s*=\s*(.*?)\s*;?$/.exec(response.trim());
  if (!responseMatch) throw new Error(`Response does not contain a query value: ${response.trim()}`);

  const expectedKey = normalizeResponseKey(expectedMatch[1]);
  const actualKey = normalizeResponseKey(responseMatch[1]);
  if (actualKey !== expectedKey) {
    throw new Error(`Response key mismatch: expected ${expectedMatch[1].trim()}, got ${responseMatch[1].trim()}`);
  }

  return responseMatch[2].trim();
}
