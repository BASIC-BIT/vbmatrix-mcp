import { describe, expect, test } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMatrixSnapshot } from '../../src/core/snapshots.js';
import { registerSnapshotTools, validateSnapshotCaptureRetrievable } from '../../src/tools/snapshots.js';

interface ToolResult {
  structuredContent?: Record<string, unknown>;
}
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

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

  test('diff snapshots tool omits inline diff details by default', async () => {
    const handlers = new Map<string, ToolHandler>();
    const server = {
      registerTool(name: string, _config: unknown, handler: ToolHandler): void {
        handlers.set(name, handler);
      },
    } as unknown as McpServer;
    const before = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:00.000Z',
      slots: [],
      points: [
        {
          target: { inputSuid: 'VASIO8', inputChannel: 1, outputSuid: 'ASIO128', outputChannel: 2 },
          state: { dBGain: '-6', mute: '0', phase: '0' },
        },
      ],
    });
    const after = createMatrixSnapshot({
      capturedAt: '2026-05-24T00:00:01.000Z',
      slots: [],
      points: [
        {
          target: { inputSuid: 'VASIO8', inputChannel: 1, outputSuid: 'ASIO128', outputChannel: 2 },
          state: { dBGain: '-3', mute: '0', phase: '0' },
        },
      ],
    });

    registerSnapshotTools(server);
    const diffSnapshots = handlers.get('vbmatrix_diff_snapshots');
    if (diffSnapshots === undefined) throw new Error('vbmatrix_diff_snapshots handler was not registered');

    const result = await diffSnapshots({ before: { snapshot: before }, after: { snapshot: after } });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      summary: {
        pointChanges: { added: 0, removed: 0, changed: 1 },
        totalChanges: 1,
      },
      inlineOmitted: true,
      inlineOmittedReason: 'Diff details omitted by default; set includeDiff=true for capped inline details.',
    });
    expect(result.structuredContent).not.toHaveProperty('diff');
    expect(result.structuredContent).not.toHaveProperty('omittedEntries');
  });
});
