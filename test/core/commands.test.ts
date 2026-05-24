import { describe, expect, test } from 'vitest';
import {
  commandPropertyQuery,
  parseResponseValue,
  pointExpression,
  pointPropertyQuery,
  restartEngineCommand,
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  slotPropertyQuery,
  validateGain,
} from '../../src/core/commands.js';

const target = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 126,
};

describe('VBMatrix command builders', () => {
  test('builds point expressions without comma spaces', () => {
    expect(pointExpression(target)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126])');
  });

  test('builds point queries and writes', () => {
    expect(pointPropertyQuery(target, 'dBGain')).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=?;');
    expect(setPointGainCommand(target, -6)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-6;');
    expect(setPointMuteCommand(target, true)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;');
    expect(setPointPhaseCommand(target, false)).toBe('Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=0;');
  });

  test('builds slot and command queries', () => {
    expect(slotPropertyQuery('VASIO8', 'Info')).toBe('Slot(VASIO8).Info=?;');
    expect(commandPropertyQuery('Version')).toBe('Command.Version=?;');
    expect(restartEngineCommand()).toBe('Command.Restart=1;');
  });

  test('parses query response values', () => {
    expect(parseResponseValue('Command.Version = VB-Audio Matrix 1.0.2.6;')).toBe('VB-Audio Matrix 1.0.2.6');
    expect(parseResponseValue('Point(VASIO8.IN[1],VASIO8.OUT[1]).dBGain = -inf;')).toBe('-inf');
    expect(parseResponseValue('TIMEOUT')).toBe('TIMEOUT');
  });

  test('rejects gain outside Matrix range', () => {
    expect(() => validateGain(-101)).toThrow(/Gain must be/);
    expect(() => validateGain(25)).toThrow(/Gain must be/);
  });
});
