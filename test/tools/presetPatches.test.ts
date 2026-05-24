import { describe, expect, test, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VbMatrixConfig } from '../../src/config/index.js';
import type { PresetPatchState } from '../../src/core/commands.js';
import type { VbMatrixClient } from '../../src/core/client.js';
import { registerPresetPatchTools, writePresetPatch } from '../../src/tools/presetPatches.js';
import { PresetPatchOperationSchema } from '../../src/tools/schemas.js';

interface ToolResult {
  structuredContent?: Record<string, unknown>;
}
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const config: VbMatrixConfig = {
  host: '127.0.0.1',
  port: 6980,
  streamName: 'Command1',
  timeoutMs: 2000,
  logLevel: 'error',
  writes: {
    allow: true,
    allowAllSuids: true,
    allowedSuids: [],
    allowDestructive: true,
  },
};

const before: PresetPatchState = {
  name: 'Cue A',
  comment: 'before',
  apply: '0 / 2',
  mute: '0 / 2',
  phase: '0 / 2',
  gain: '0.0',
  zone: '1',
  point: '2',
};

describe('preset patch tools', () => {
  test('schema requires operation-specific values', () => {
    const parsed = PresetPatchOperationSchema.parse({ index: 1, operation: 'gain', gainDb: -3 });
    expect(parsed).toMatchObject({ index: 1, operation: 'gain', gainDb: -3, dryRun: true });
    expect(() => PresetPatchOperationSchema.parse({ index: 0, operation: 'apply' })).toThrow();
    expect(() => PresetPatchOperationSchema.parse({ index: 1, operation: 'load' })).toThrow();
    expect(() => PresetPatchOperationSchema.parse({ index: 1, operation: 'gain', gainDb: -101 })).toThrow();
  });

  test('dry-runs grouped preset patch commands without sending writes', async () => {
    const handlers = new Map<string, ToolHandler>();
    const server = {
      registerTool(name: string, _config: unknown, handler: ToolHandler): void {
        handlers.set(name, handler);
      },
    } as unknown as McpServer;

    registerPresetPatchTools(server);
    const presetPatch = handlers.get('vbmatrix_preset_patch');
    if (presetPatch === undefined) throw new Error('vbmatrix_preset_patch handler was not registered');

    const result = await presetPatch({ index: 1, operation: 'apply' });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      dryRun: true,
      index: 1,
      operation: 'apply',
      destructive: true,
      command: 'PresetPatch[1].Apply;',
    });
  });

  test('returns partial-success state when the post-write query fails', async () => {
    const queryPresetPatchState = vi
      .fn<() => Promise<PresetPatchState>>()
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error('No response for query: PresetPatch[1].Name=?;'));
    const send = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = { config, queryPresetPatchState, send } as unknown as VbMatrixClient;

    await expect(writePresetPatch(1, 'apply', 'PresetPatch[1].Apply;', client)).resolves.toMatchObject({
      ok: false,
      partial: true,
      commandSent: true,
      index: 1,
      operation: 'apply',
      command: 'PresetPatch[1].Apply;',
      before,
      afterError: 'No response for query: PresetPatch[1].Name=?;',
    });
    expect(send).toHaveBeenCalledWith('PresetPatch[1].Apply;');
  });
});
