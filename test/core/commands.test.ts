import { describe, expect, test } from 'vitest';
import {
  channelExpression,
  channelLabelQuery,
  channelRangeExpression,
  commandPropertyQuery,
  pointRangeExpression,
  parseResponseValue,
  pointExpression,
  pointPropertyQuery,
  parseQueryResponseValue,
  removePointCommand,
  removePointRangeCommand,
  quoteDeviceName,
  removeChannelLabelCommand,
  removeSlotDeviceCommand,
  restartEngineCommand,
  resetSlotCommand,
  resetChannelCommand,
  setChannelLabelCommand,
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  setPointRangeGainCommand,
  setPointRangeMuteCommand,
  setPointRangePhaseCommand,
  setSlotDeviceCommand,
  setSlotMasterCommand,
  setSlotOnlineCommand,
  slotPropertyQuery,
  validateChannelIndex,
  validateChannelRange,
  validateGain,
  validateLabel,
  validateSlotDeviceKind,
} from '../../src/core/commands.js';

const target = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 126,
};

const rangeTarget = {
  inputSuid: 'VASIO8',
  inputChannels: { start: 1, end: 2 },
  outputSuid: 'ASIO128',
  outputChannels: { start: 125, end: 126 },
};

describe('VBMatrix command builders', () => {
  test('builds point expressions without comma spaces', () => {
    expect(pointExpression(target)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126])');
  });

  test('builds point queries and writes', () => {
    expect(pointPropertyQuery(target, 'dBGain')).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=?;');
    expect(setPointGainCommand(target, -6)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-6;');
    expect(setPointGainCommand(target, '-inf')).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Remove;');
    expect(removePointCommand(target)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Remove;');
    expect(setPointMuteCommand(target, true)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;');
    expect(setPointPhaseCommand(target, false)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=0;');
  });

  test('builds point range writes', () => {
    expect(pointRangeExpression(rangeTarget)).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126])');
    expect(setPointRangeGainCommand(rangeTarget, -3)).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126]).dBGain=-3;');
    expect(setPointRangeGainCommand(rangeTarget, '-inf')).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126]).Remove;');
    expect(setPointRangeMuteCommand(rangeTarget, true)).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126]).Mute=1;');
    expect(setPointRangePhaseCommand(rangeTarget, false)).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126]).Phase=0;');
    expect(removePointRangeCommand(rangeTarget)).toBe('Point(VASIO8.IN[1..2],ASIO128.OUT[125..126]).Remove;');
  });

  test('builds single-channel range writes without range dots', () => {
    expect(
      pointRangeExpression({
        inputSuid: 'VASIO8',
        inputChannels: { start: 1, end: 1 },
        outputSuid: 'ASIO128',
        outputChannels: { start: 126, end: 126 },
      })
    ).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126])');
  });

  test('builds slot and command queries', () => {
    expect(slotPropertyQuery('VASIO8', 'Info')).toBe('Slot(VASIO8).Info=?;');
    expect(slotPropertyQuery('WIN1.IN', 'Info')).toBe('Slot(WIN1.IN).Info=?;');
    expect(setSlotOnlineCommand('VAIO1', true)).toBe('Slot(VAIO1).Online=1;');
    expect(setSlotOnlineCommand('VAIO1', false)).toBe('Slot(VAIO1).Online=0;');
    expect(setSlotMasterCommand('VAIO1', true)).toBe('Slot(VAIO1).Master=1;');
    expect(resetSlotCommand('VAIO1')).toBe('Slot(VAIO1).Reset;');
    expect(commandPropertyQuery('Version')).toBe('Command.Version=?;');
    expect(restartEngineCommand()).toBe('Command.Restart;');
  });

  test('builds safely quoted slot device commands', () => {
    expect(quoteDeviceName('Focusrite USB ASIO')).toBe('"Focusrite USB ASIO"');
    expect(setSlotDeviceCommand('VAIO1', 'ASIO', 'Focusrite USB ASIO')).toBe(
      'Slot(VAIO1).Device.ASIO="Focusrite USB ASIO";'
    );
    expect(setSlotDeviceCommand('VAIO1', 'MME', 'CABLE Input (VB-Audio Virtual Cable)')).toBe(
      'Slot(VAIO1).Device.MME="CABLE Input (VB-Audio Virtual Cable)";'
    );
    expect(setSlotDeviceCommand('VAIO1', 'KS', 'Speakers (Example)')).toBe(
      'Slot(VAIO1).Device.KS="Speakers (Example)";'
    );
    expect(setSlotDeviceCommand('VAIO1', 'WDM', 'Headphones (Example)')).toBe(
      'Slot(VAIO1).Device.WDM="Headphones (Example)";'
    );
    expect(removeSlotDeviceCommand('VAIO1')).toBe('Slot(VAIO1).Device="";');
  });

  test('rejects unsafe slot device names', () => {
    expect(() => quoteDeviceName('')).toThrow(/must not be empty/);
    expect(() => quoteDeviceName('Device"Name')).toThrow(/must not contain/);
    expect(() => quoteDeviceName('Device;Command.Restart')).toThrow(/must not contain/);
    expect(() => quoteDeviceName('Device\nCommand.Restart')).toThrow(/must not contain/);
    expect(() => setSlotDeviceCommand('VAIO1;Command.Restart', 'ASIO', 'Device')).toThrow(/Invalid SUID/);
    expect(() => validateSlotDeviceKind('RAW')).toThrow(/Device kind must be/);
  });

  test('builds input and output label commands', () => {
    expect(channelExpression({ kind: 'input', suid: 'VASIO8', channel: 1 })).toBe('Input(VASIO8.IN[1])');
    expect(channelExpression({ kind: 'output', suid: 'ASIO128', channel: 126 })).toBe('Output(ASIO128.OUT[126])');
    expect(channelLabelQuery({ kind: 'input', suid: 'VASIO8', channel: 1 })).toBe('Input(VASIO8.IN[1]).Name=?;');
    expect(setChannelLabelCommand({ kind: 'output', suid: 'ASIO128', channel: 126 }, 'Control Room')).toBe(
      'Output(ASIO128.OUT[126]).Name="Control Room";'
    );
    expect(setChannelLabelCommand({ kind: 'input', suid: 'VASIO8', channel: 1 }, 'Quote " and slash \\')).toBe(
      'Input(VASIO8.IN[1]).Name="Quote \\" and slash \\\\";'
    );
    expect(removeChannelLabelCommand({ kind: 'input', suid: 'VASIO8', channel: 1 })).toBe(
      'Input(VASIO8.IN[1]).Name="";'
    );
  });

  test('builds documented input and output range commands', () => {
    expect(channelRangeExpression({ kind: 'input', suid: 'VASIO8', startChannel: 1, endChannel: 8 })).toBe(
      'Input(VASIO8.IN[1..8])'
    );
    expect(channelLabelQuery({ kind: 'output', suid: 'ASIO128', startChannel: 125, endChannel: 128 })).toBe(
      'Output(ASIO128.OUT[125..128]).Name=?;'
    );
    expect(removeChannelLabelCommand({ kind: 'output', suid: 'ASIO128', startChannel: 125, endChannel: 128 })).toBe(
      'Output(ASIO128.OUT[125..128]).Name="";'
    );
    expect(resetChannelCommand({ kind: 'input', suid: 'VASIO8', startChannel: 1, endChannel: 8 })).toBe(
      'Input(VASIO8.IN[1..8]).Reset;'
    );
  });

  test('parses query response values', () => {
    expect(parseResponseValue('Command.Version = VB-Audio Matrix 1.0.2.6;')).toBe('VB-Audio Matrix 1.0.2.6');
    expect(parseResponseValue('Point(VASIO8.IN[1],VASIO8.OUT[1]).dBGain = -inf;')).toBe('-inf');
    expect(parseResponseValue('TIMEOUT')).toBe('TIMEOUT');
  });

  test('rejects gain outside Matrix range', () => {
    expect(() => validateGain(-101)).toThrow(/Gain must be/);
    expect(() => validateGain(25)).toThrow(/Gain must be/);
    expect(() => validateGain('-inf')).not.toThrow();
  });

  test('uses documented one-based channel numbers', () => {
    expect(() => validateChannelIndex(0)).toThrow(/Channel must be/);
    expect(() => validateChannelIndex(1)).not.toThrow();
    expect(() => validateChannelIndex(680)).not.toThrow();
    expect(() => validateChannelIndex(3112)).not.toThrow();
    expect(() => validateChannelRange({ start: 2, end: 1 })).toThrow(/start must be less than or equal to end/);
    expect(() => validateChannelRange({ start: 1, end: 2 })).not.toThrow();
  });

  test('rejects invalid ranges and label injection', () => {
    expect(() => validateChannelRange(8, 1)).toThrow(/endChannel/);
    expect(() => validateLabel('bad;Command.Reset')).toThrow(/semicolons/);
    expect(() => validateLabel('bad\nlabel')).toThrow(/newlines/);
  });

  test('verifies query response keys', () => {
    expect(parseQueryResponseValue('Command.Version=?;', 'Command.Version = VB-Audio Matrix 1.0.2.6;')).toBe(
      'VB-Audio Matrix 1.0.2.6'
    );
    expect(() => parseQueryResponseValue('Command.Version=?;', 'Command.Engine = 1;')).toThrow(
      /Response key mismatch/
    );
  });
});
