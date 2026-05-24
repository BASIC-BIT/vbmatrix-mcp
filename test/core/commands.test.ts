import { describe, expect, test } from 'vitest';
import {
  commandPropertyQuery,
  pointRangeExpression,
  parseResponseValue,
  pointExpression,
  pointPropertyQuery,
  parseQueryResponseValue,
  removePointCommand,
  removePointRangeCommand,
  restartEngineCommand,
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  setPointRangeGainCommand,
  setPointRangeMuteCommand,
  setPointRangePhaseCommand,
  slotPropertyQuery,
  validateChannelIndex,
  validateChannelRange,
  validateGain,
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
    expect(commandPropertyQuery('Version')).toBe('Command.Version=?;');
    expect(restartEngineCommand()).toBe('Command.Restart;');
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

  test('verifies query response keys', () => {
    expect(parseQueryResponseValue('Command.Version=?;', 'Command.Version = VB-Audio Matrix 1.0.2.6;')).toBe(
      'VB-Audio Matrix 1.0.2.6'
    );
    expect(() => parseQueryResponseValue('Command.Version=?;', 'Command.Engine = 1;')).toThrow(/Response key mismatch/);
  });
});
