import { describe, expect, test } from 'vitest';
import {
  createMatrixSnapshot,
  diffMatrixSnapshots,
  matrixSnapshotSummary,
  planSnapshotRestore,
} from '../../src/core/snapshots.js';

const targetA = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 2,
};

const targetB = {
  inputSuid: 'VASIO8',
  inputChannel: 2,
  outputSuid: 'ASIO128',
  outputChannel: 2,
};

describe('Matrix snapshots', () => {
  test('creates explicit targeted snapshots with documented omissions', () => {
    const snapshot = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:00.000Z',
      metadata: { version: 'VB-Audio Matrix 1.0.2.6' },
      slots: [
        {
          suid: 'VASIO8',
          info: 'Virtual ASIO',
          online: '1',
          runningStatus: '1',
          master: '0',
          device: 'Example',
        },
      ],
      points: [{ target: targetA, state: { dBGain: '-6', mute: '0', phase: '0' } }],
    });

    expect(matrixSnapshotSummary(snapshot)).toEqual({
      schemaVersion: 1,
      capturedAt: '2026-05-24T00:00:00.000Z',
      slotCount: 1,
      pointCount: 1,
      omittedKinds: ['labels', 'presetMetadata'],
    });
  });

  test('diffs slot metadata and point state', () => {
    const before = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:00.000Z',
      slots: [
        { suid: 'VASIO8', info: 'old', online: '1', runningStatus: '1', master: '0', device: 'A' },
      ],
      points: [{ target: targetA, state: { dBGain: '-6', mute: '0', phase: '0' } }],
    });
    const after = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:01.000Z',
      slots: [
        { suid: 'VASIO8', info: 'new', online: '1', runningStatus: '1', master: '0', device: 'A' },
      ],
      points: [{ target: targetA, state: { dBGain: '-3', mute: '1', phase: '0' } }],
    });

    const diff = diffMatrixSnapshots(before, after);

    expect(diff.slots.changed).toEqual([
      { suid: 'VASIO8', before: before.slots[0], after: after.slots[0], changedProperties: ['info'] },
    ]);
    expect(diff.points.changed).toEqual([
      {
        target: targetA,
        before: { dBGain: '-6', mute: '0', phase: '0' },
        after: { dBGain: '-3', mute: '1', phase: '0' },
        changedProperties: ['dBGain', 'mute'],
      },
    ]);
  });

  test('plans point restore commands from current state to desired snapshot state', () => {
    const desired = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:00.000Z',
      slots: [],
      points: [
        { target: targetA, state: { dBGain: '-6', mute: '0', phase: '1' } },
        { target: targetB, state: { dBGain: '-inf', mute: '1', phase: '0' } },
      ],
    });
    const current = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:01:00.000Z',
      slots: [],
      points: [
        { target: targetA, state: { dBGain: '0', mute: '0', phase: '0' } },
        { target: targetB, state: { dBGain: '-12', mute: '1', phase: '0' } },
      ],
    });

    const plan = planSnapshotRestore({ desired, current });

    expect(plan.summary).toEqual({
      pointCount: 2,
      changedPointCount: 2,
      commandCount: 3,
      properties: ['dBGain', 'mute', 'phase'],
      broad: true,
      nonRestorable: ['slots are metadata-only', 'labels omitted', 'preset metadata omitted'],
    });
    expect(plan.steps.map((step) => step.command)).toEqual([
      'Point(VASIO8.IN[1],ASIO128.OUT[2]).dBGain=-6;',
      'Point(VASIO8.IN[1],ASIO128.OUT[2]).Phase=1;',
      'Point(VASIO8.IN[2],ASIO128.OUT[2]).Remove;',
    ]);
  });

  test('rejects non-binary mute and phase values in snapshots', () => {
    expect(() =>
      createMatrixSnapshot({
        slots: [],
        points: [{ target: targetA, state: { dBGain: '-6', mute: 'maybe', phase: '0' } }],
      })
    ).toThrow(/mute must be 0 or 1/);
  });
});
