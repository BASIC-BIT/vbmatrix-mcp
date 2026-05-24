import { describe, expect, test } from 'vitest';
import { validateSnapshotCaptureRetrievable } from '../../src/tools/snapshots.js';

describe('snapshot tool guardrails', () => {
  test('rejects small captures that omit both inline snapshot and artifact output', () => {
    expect(() =>
      validateSnapshotCaptureRetrievable({ includeSnapshot: false, writeToFile: false, entryCount: 1 })
    ).toThrow(/requires writeToFile=true/);
  });

  test('allows omitted inline snapshot when an artifact is requested or forced by size', () => {
    expect(() =>
      validateSnapshotCaptureRetrievable({ includeSnapshot: false, writeToFile: true, entryCount: 1 })
    ).not.toThrow();
    expect(() =>
      validateSnapshotCaptureRetrievable({ includeSnapshot: false, writeToFile: false, entryCount: 21 })
    ).not.toThrow();
  });
});
