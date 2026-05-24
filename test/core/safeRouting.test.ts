import { describe, expect, test } from 'vitest';
import { createMatrixSnapshot } from '../../src/core/snapshots.js';
import { planSafeRouteWorkflow, rollbackFromSnapshot } from '../../src/core/safeRouting.js';

const target = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 126,
};

const targetB = {
  inputSuid: 'VASIO8',
  inputChannel: 2,
  outputSuid: 'ASIO128',
  outputChannel: 127,
};

describe('safe routing workflow planning', () => {
  test('plans explicit audition route gain, mute, and phase commands', () => {
    expect(
      planSafeRouteWorkflow({
        operation: 'auditionRoute',
        target,
        gainDb: -6,
        muted: false,
        phaseReversed: false,
      })
    ).toMatchObject({
      operation: 'auditionRoute',
      targets: [target],
      commands: [
        'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-6;',
        'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
        'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=0;',
      ],
    });
  });

  test('plans cleanup and emergency mute for explicit points only', () => {
    expect(planSafeRouteWorkflow({ operation: 'cleanupRoutes', points: [target, targetB] }).commands).toEqual(
      ['Point(VASIO8.IN[1],ASIO128.OUT[126]).Remove;', 'Point(VASIO8.IN[2],ASIO128.OUT[127]).Remove;']
    );

    expect(planSafeRouteWorkflow({ operation: 'emergencyMute', points: [target, targetB] }).commands).toEqual(
      ['Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;', 'Point(VASIO8.IN[2],ASIO128.OUT[127]).Mute=1;']
    );
  });

  test('rejects dynamic or unsafe audition inputs', () => {
    expect(() => planSafeRouteWorkflow({ operation: 'cleanupRoutes', points: [] })).toThrow(/explicit point/);
    expect(() =>
      planSafeRouteWorkflow({
        operation: 'auditionRoute',
        target,
        gainDb: '-inf',
        muted: false,
        phaseReversed: false,
      })
    ).toThrow(/finite/);
  });

  test('builds rollback commands from a targeted snapshot', () => {
    const snapshot = createMatrixSnapshot({
      metadata: {},
      slots: [],
      points: [
        { target, state: { dBGain: '-12', mute: '0', phase: '1' } },
        { target: targetB, state: { dBGain: '-inf', mute: '1', phase: '0' } },
      ],
    });

    expect(rollbackFromSnapshot(snapshot).commands).toEqual([
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-12;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
      'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=1;',
      'Point(VASIO8.IN[2],ASIO128.OUT[127]).Remove;',
    ]);
  });
});
