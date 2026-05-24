import { describe, expect, test } from 'vitest';
import {
  assertLiveRunAllowed,
  buildLiveAudioVerificationCommands,
  evaluateVerification,
  LIVE_VERIFY_CONFIRMATION,
  restorePointCommands,
  type LiveAudioVerifyConfig,
} from '../../src/core/liveAudioVerification.js';

const config: LiveAudioVerifyConfig = {
  target: { inputSuid: 'VASIO8', inputChannel: 1, outputSuid: 'ASIO128', outputChannel: 126 },
  baselineWav: 'live-audio-artifacts/baseline.wav',
  mutedWav: 'live-audio-artifacts/muted.wav',
  gainWav: 'live-audio-artifacts/gain.wav',
  phaseNormalWav: 'live-audio-artifacts/phase-normal.wav',
  phaseInvertedWav: 'live-audio-artifacts/phase-inverted.wav',
  gainDb: -12,
};

describe('live audio verification planning', () => {
  test('requires both run mode and confirmation env before live writes', () => {
    expect(() => assertLiveRunAllowed(false, {})).not.toThrow();
    expect(() => assertLiveRunAllowed(true, {})).toThrow(/VBMATRIX_LIVE_VERIFY/);
    expect(() => assertLiveRunAllowed(true, { VBMATRIX_LIVE_VERIFY: LIVE_VERIFY_CONFIRMATION })).not.toThrow();
  });

  test('builds explicit Matrix commands and restore commands', () => {
    expect(buildLiveAudioVerificationCommands(config)).toEqual([
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-12;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=1;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=0;',
    ]);
    expect(restorePointCommands(config.target, { dBGain: '-inf', mute: '0', phase: '1' })).toEqual([
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Remove;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=1;',
    ]);
  });

  test('evaluates deterministic PASS and FAIL measurements', () => {
    const pass = evaluateVerification(config, {
      baselineRmsDbfs: -10,
      mutedRmsDbfs: -60,
      gainRmsDbfs: -22.2,
      phaseCorrelation: -0.99,
    });
    const fail = evaluateVerification(config, {
      baselineRmsDbfs: -10,
      mutedRmsDbfs: -20,
      gainRmsDbfs: -10,
      phaseCorrelation: 0.99,
    });

    expect(pass.ok).toBe(true);
    expect(pass.checks.every((check) => check.pass)).toBe(true);
    expect(fail.ok).toBe(false);
    expect(fail.checks.every((check) => !check.pass)).toBe(true);
  });
});
