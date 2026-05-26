import { describe, expect, test, vi } from 'vitest';
import type { VbMatrixConfig } from '../../src/config/index.js';
import type { VbMatrixClient } from '../../src/core/client.js';
import {
  PresetPatchFileSchema,
  runMatrixFileState,
  runPresetPatchFileOperation,
} from '../../src/tools/matrixFiles.js';

const presetRoot = 'D:\\__vbmatrix_mcp_test_root__\\PresetPatch';
const presetFile = `${presetRoot}\\Scene.xml`;

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
  rawCommands: { disabled: false },
  matrixFiles: {
    presetPatchRoots: [presetRoot],
    projectRoots: [],
    gridRoots: [],
  },
};

function fakeClient(overrides: Partial<VbMatrixConfig> = {}) {
  const clientConfig: VbMatrixConfig = { ...config, ...overrides };
  const query = vi.fn<(command: string) => Promise<string>>((command) => {
    if (command === 'Command.Load=?;') return Promise.resolve('C:\\Users\\tester\\AppData\\Roaming\\VBAudioMatrix_Default.xml');
    if (command === 'Command.LoadGrid=?;') return Promise.resolve('""');
    throw new Error(`Unexpected query: ${command}`);
  });
  const send = vi.fn<(command: string) => Promise<void>>().mockResolvedValue(undefined);
  const client = { config: clientConfig, query, send } as unknown as VbMatrixClient;
  return { client, query, send };
}

describe('Matrix file tools', () => {
  test('reads current Matrix project and grid file state', async () => {
    const { client } = fakeClient();

    await expect(runMatrixFileState(client)).resolves.toMatchObject({
      ok: true,
      project: 'C:\\Users\\tester\\AppData\\Roaming\\VBAudioMatrix_Default.xml',
      grid: '""',
    });
  });

  test('defaults preset patch file operations to dry-run', () => {
    expect(PresetPatchFileSchema.parse({ index: 1, operation: 'saveAs', filePath: presetFile })).toMatchObject({
      index: 1,
      operation: 'saveAs',
      filePath: presetFile,
      allowOverwrite: false,
      dryRun: true,
    });
  });

  test('dry-runs preset patch SaveAs with path policy details and no send', async () => {
    const { client, send } = fakeClient();

    const result = await runPresetPatchFileOperation(
      { index: 1, operation: 'saveAs', filePath: presetFile, allowOverwrite: false, dryRun: true },
      client
    );

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      plan: {
        index: 1,
        operation: 'saveAs',
        destructive: false,
        command: `PresetPatch[1].SaveAs="${presetFile}";`,
        path: {
          resolvedPath: presetFile,
          matchedRoot: presetRoot,
          extension: '.xml',
        },
        existsBefore: false,
        requiredConfirmation: 'MATRIX_PRESET_FILE_WRITE',
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  test('executes preset patch SaveAs only with confirmation', async () => {
    const { client, send } = fakeClient();

    await expect(
      runPresetPatchFileOperation(
        { index: 1, operation: 'saveAs', filePath: presetFile, allowOverwrite: false, dryRun: false },
        client
      )
    ).rejects.toThrow(/MATRIX_PRESET_FILE_WRITE/);
    expect(send).not.toHaveBeenCalled();

    await expect(
      runPresetPatchFileOperation(
        {
          index: 1,
          operation: 'saveAs',
          filePath: presetFile,
          allowOverwrite: false,
          dryRun: false,
          confirmOperation: 'MATRIX_PRESET_FILE_WRITE',
        },
        client
      )
    ).resolves.toMatchObject({ ok: true, dryRun: false });
    expect(send).toHaveBeenCalledWith(`PresetPatch[1].SaveAs="${presetFile}";`);
  });

  test('requires an operator-configured preset patch root', async () => {
    const { client, query, send } = fakeClient({ matrixFiles: { presetPatchRoots: [], projectRoots: [], gridRoots: [] } });

    await expect(
      runPresetPatchFileOperation({ index: 1, operation: 'saveAs', filePath: presetFile, dryRun: true }, client)
    ).rejects.toThrow(/No allowed Matrix file roots/);
    expect(query).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
