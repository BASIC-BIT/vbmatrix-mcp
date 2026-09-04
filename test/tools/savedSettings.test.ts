import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { VbMatrixConfig } from '../../src/config/index.js';
import {
  DiffSavedSettingsSchema,
  InspectSavedSettingsSchema,
  runDiffSavedSettings,
  runInspectSavedSettings,
} from '../../src/tools/savedSettings.js';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'saved-settings'
);
const beforeFilePath = path.join(fixtureRoot, 'before.xml');
const afterFilePath = path.join(fixtureRoot, 'after.xml');

const config: VbMatrixConfig = {
  host: '127.0.0.1',
  port: 6980,
  streamName: 'Command1',
  timeoutMs: 2_000,
  logLevel: 'error',
  writes: { allow: false, allowAllSuids: false, allowedSuids: [], allowDestructive: false },
  rawCommands: { disabled: true },
  matrixFiles: {
    presetPatchRoots: [],
    projectRoots: [],
    gridRoots: [],
    savedSettingsRoots: [fixtureRoot],
    savedSettingsMaxBytes: 8 * 1024 * 1024,
  },
};

describe('saved Matrix settings tools', () => {
  test('applies bounded, read-only inspection defaults', () => {
    expect(InspectSavedSettingsSchema.parse({ filePath: beforeFilePath })).toMatchObject({
      onlineOnly: false,
      includeMuted: true,
      maxSlots: 200,
      maxRoutes: 200,
    });
  });

  test('filters saved routes and reports persisted-state provenance', async () => {
    const input = InspectSavedSettingsSchema.parse({
      filePath: beforeFilePath,
      slotKind: 'vaio',
      onlineOnly: true,
      inputSuid: 'vaio1',
      includeMuted: false,
      maxSlots: 1,
      maxRoutes: 1,
    });
    await expect(runInspectSavedSettings(input, config)).resolves.toMatchObject({
      ok: true,
      stateSource: 'saved-settings-file',
      liveState: false,
      summary: { slotCount: 5, routeCount: 3 },
      slots: { matchedCount: 1, returnedCount: 1, truncated: false, items: [{ suid: 'VAIO1' }] },
      routes: { matchedCount: 1, returnedCount: 1, truncated: false, items: [{ inputSuid: 'VAIO1' }] },
    });
    const result = await runInspectSavedSettings(input, config);
    expect((result.slots as { items: Record<string, unknown>[] }).items[0]).not.toHaveProperty('attributes');
    expect((result.routes as { items: Record<string, unknown>[] }).items[0]).not.toHaveProperty('attributes');
  });

  test('caps inspection output without changing full-file summary counts', async () => {
    const input = InspectSavedSettingsSchema.parse({ filePath: beforeFilePath, maxSlots: 1, maxRoutes: 1 });
    await expect(runInspectSavedSettings(input, config)).resolves.toMatchObject({
      summary: { slotCount: 5, routeCount: 3 },
      slots: { matchedCount: 5, returnedCount: 1, truncated: true },
      routes: { matchedCount: 3, returnedCount: 1, truncated: true },
    });
  });

  test('diffs two configured saved files and applies per-section output caps', async () => {
    const input = DiffSavedSettingsSchema.parse({ beforeFilePath, afterFilePath, maxItems: 1 });
    await expect(runDiffSavedSettings(input, config)).resolves.toMatchObject({
      ok: true,
      stateSource: 'saved-settings-file',
      liveState: false,
      routes: {
        added: { count: 1, truncated: false },
        removed: { count: 1, truncated: false },
        changed: { count: 1, truncated: false },
      },
      slots: {
        added: { count: 1, truncated: false },
        removed: { count: 1, truncated: false },
        changed: { count: 1, truncated: false },
      },
      truncated: false,
    });
  });

  test('fails closed when no saved-settings root is configured', async () => {
    const input = InspectSavedSettingsSchema.parse({ filePath: beforeFilePath });
    await expect(
      runInspectSavedSettings(input, {
        ...config,
        matrixFiles: { presetPatchRoots: [], projectRoots: [], gridRoots: [], savedSettingsRoots: [] },
      })
    ).rejects.toMatchObject({ code: 'saved_settings_roots_not_configured' });
  });
});
