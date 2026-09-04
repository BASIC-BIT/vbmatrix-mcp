import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

describe('saved Matrix settings configuration', () => {
  test('reads distinct saved-settings roots and byte limit', () => {
    const first = path.resolve('D:/Matrix/One');
    const second = path.resolve('D:/Matrix/Two');
    const config = loadConfig({
      VBMATRIX_MCP_SAVED_SETTINGS_ROOTS: `${first}; ${second};${first}`,
      VBMATRIX_MCP_SAVED_SETTINGS_MAX_BYTES: '4096',
    });

    expect(config.matrixFiles?.savedSettingsRoots).toEqual([first, second]);
    expect(config.matrixFiles?.savedSettingsMaxBytes).toBe(4_096);
  });

  test('uses a bounded default and rejects invalid byte limits', () => {
    expect(loadConfig({}).matrixFiles?.savedSettingsMaxBytes).toBe(8 * 1024 * 1024);
    expect(() => loadConfig({ VBMATRIX_MCP_SAVED_SETTINGS_MAX_BYTES: '1023' })).toThrow(/1024/);
    expect(() => loadConfig({ VBMATRIX_MCP_SAVED_SETTINGS_MAX_BYTES: '67108865' })).toThrow(/67108864/);
  });
});
