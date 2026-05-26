import { describe, expect, test, vi } from 'vitest';
import type { VbMatrixConfig } from '../../src/config/index.js';
import type { VbMatrixClient } from '../../src/core/client.js';
import { runRawVbanText } from '../../src/tools/rawVbanText.js';
import { RawVbanTextSchema } from '../../src/tools/schemas.js';

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
};

function fakeClient(overrides: Partial<VbMatrixConfig['rawCommands']> = {}) {
  const send = vi.fn<(command: string) => Promise<void>>().mockResolvedValue(undefined);
  const query = vi.fn<(command: string) => Promise<string>>().mockResolvedValue('Command.Version = "VB-Audio Matrix";');
  return {
    client: { config: { ...config, rawCommands: { ...config.rawCommands, ...overrides } }, send, query } as unknown as VbMatrixClient,
    send,
    query,
  };
}

describe('raw VBAN-TEXT tool runner', () => {
  test('validates the exact raw command input shape', () => {
    expect(RawVbanTextSchema.parse({ command: 'Command.Version=?;' })).toEqual({ command: 'Command.Version=?;' });
    expect(() => RawVbanTextSchema.parse({ command: '' })).toThrow();
  });

  test('waits for responses by default for query-looking commands', async () => {
    const { client, query, send } = fakeClient();

    await expect(runRawVbanText({ command: 'Command.Version=?;' }, client)).resolves.toMatchObject({
      ok: true,
      command: 'Command.Version=?;',
      waitForResponse: true,
      response: 'Command.Version = "VB-Audio Matrix";',
      rawPolicy: { disableRawCommands: false, preferTypedTools: true },
    });
    expect(query).toHaveBeenCalledWith('Command.Version=?;');
    expect(send).not.toHaveBeenCalled();
  });

  test('sends non-query commands without waiting by default', async () => {
    const { client, query, send } = fakeClient();

    await expect(runRawVbanText({ command: 'Command.Restart;' }, client)).resolves.toMatchObject({
      ok: true,
      command: 'Command.Restart;',
      waitForResponse: false,
      response: null,
    });
    expect(send).toHaveBeenCalledWith('Command.Restart;');
    expect(query).not.toHaveBeenCalled();
  });

  test('is disabled by the inverse raw command environment policy', async () => {
    const { client, send, query } = fakeClient({ disabled: true });

    await expect(runRawVbanText({ command: 'Command.Version=?;' }, client)).rejects.toThrow(/DISABLE_RAW_COMMANDS/);
    expect(send).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
