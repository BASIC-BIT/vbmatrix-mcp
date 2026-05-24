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

export interface PointState {
  dBGain: string;
  mute: string;
  phase: string;
}

export interface SlotState {
  info: string;
  online: string;
  runningStatus: string;
  master: string;
  device: string;
}

export type SlotDeviceKind = 'ASIO' | 'MME' | 'KS' | 'WDM';

const SLOT_DEVICE_KINDS = ['ASIO', 'MME', 'KS', 'WDM'] as const;

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

export function pointPropertyQuery(target: PointTarget, property: 'dBGain' | 'Mute' | 'Phase'): string {
  return `${pointExpression(target)}.${property}=?;`;
}

export function setPointGainCommand(target: PointTarget, gainDb: MatrixGain): string {
  validateGain(gainDb);
  if (gainDb === '-inf') return `${pointExpression(target)}.Remove;`;
  return `${pointExpression(target)}.dBGain=${gainDb};`;
}

export function setPointMuteCommand(target: PointTarget, muted: boolean): string {
  return `${pointExpression(target)}.Mute=${muted ? 1 : 0};`;
}

export function setPointPhaseCommand(target: PointTarget, phaseReversed: boolean): string {
  return `${pointExpression(target)}.Phase=${phaseReversed ? 1 : 0};`;
}

export function slotPropertyQuery(
  suid: string,
  property: 'Info' | 'Online' | 'RunningStatus' | 'Device' | 'Master'
): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).${property}=?;`;
}

export function setSlotOnlineCommand(suid: string, online: boolean): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).Online=${online ? 1 : 0};`;
}

export function setSlotMasterCommand(suid: string, master: boolean): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).Master=${master ? 1 : 0};`;
}

export function resetSlotCommand(suid: string): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).Reset;`;
}

export function quoteDeviceName(deviceName: string): string {
  if (deviceName.length === 0) throw new Error('Device name must not be empty');
  if (/[;\r\n"]/.test(deviceName)) {
    throw new Error('Device name must not contain semicolons, newlines, or double quotes');
  }
  return `"${deviceName}"`;
}

export function validateSlotDeviceKind(kind: string): asserts kind is SlotDeviceKind {
  if (!SLOT_DEVICE_KINDS.includes(kind as SlotDeviceKind)) {
    throw new Error(`Device kind must be one of: ${SLOT_DEVICE_KINDS.join(', ')}`);
  }
}

export function setSlotDeviceCommand(suid: string, kind: SlotDeviceKind, deviceName: string): string {
  validateSuidSyntax(suid);
  validateSlotDeviceKind(kind);
  return `Slot(${suid}).Device.${kind}=${quoteDeviceName(deviceName)};`;
}

export function removeSlotDeviceCommand(suid: string): string {
  validateSuidSyntax(suid);
  return `Slot(${suid}).Device="";`;
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
    throw new Error(
      `Response key mismatch: expected ${expectedMatch[1].trim()}, got ${responseMatch[1].trim()}`
    );
  }

  return responseMatch[2].trim();
}
