import { describe, expect, test, vi } from 'vitest';
import {
  runGetVoicemeeterLevels,
  runGetVoicemeeterStrip,
  runRawVoicemeeterRemoteApi,
  runSetVoicemeeterStripParameter,
} from '../../src/providers/voicemeeterControls.js';
import type { VoicemeeterHelperOperation } from '../../src/providers/voicemeeterHelper.js';

type FakeRunOperation = (
  operation: VoicemeeterHelperOperation,
  payload?: Record<string, unknown>
) => Promise<Record<string, unknown>>;

function fakeRunOperation() {
  return vi.fn<FakeRunOperation>((operation, payload) => {
    if (operation === 'status')
      return Promise.resolve({ ok: true, availability: 'available', running: true, type: 2, version: '3.1.1.1' });
    if (operation === 'get-parameters') return Promise.resolve({ ok: true, parameters: payload?.parameters ?? [] });
    if (operation === 'set-parameters') return Promise.resolve({ ok: true, parameters: payload?.parameters ?? [] });
    if (operation === 'get-levels') return Promise.resolve({ ok: true, ...payload, levels: [] });
    if (operation === 'raw-script') return Promise.resolve({ ok: true, result: 0 });
    return Promise.resolve({ ok: true });
  });
}

describe('Voicemeeter control tool runners', () => {
  test('builds edition-aware strip read parameters', async () => {
    const runOperation = fakeRunOperation();

    await expect(runGetVoicemeeterStrip({ index: 3, properties: [] }, runOperation)).resolves.toMatchObject({
      ok: true,
      target: { kind: 'strip', index: 3 },
      edition: { name: 'banana', strips: 5, buses: 5 },
    });
    expect(runOperation.mock.calls.at(-1)?.[0]).toBe('get-parameters');
    const payload = runOperation.mock.calls.at(-1)?.[1];
    expect(payload?.parameters).toEqual(
      expect.arrayContaining([
        { name: 'Strip[3].gain', kind: 'float' },
        { name: 'Strip[3].A3', kind: 'float' },
        { name: 'Strip[3].B2', kind: 'float' },
        { name: 'Strip[3].name', kind: 'string' },
      ])
    );
  });

  test('rejects strip routes outside the detected edition', async () => {
    const runOperation = fakeRunOperation();

    await expect(runGetVoicemeeterStrip({ index: 0, properties: ['A5'] }, runOperation)).rejects.toThrow(
      /not valid/
    );
  });

  test('set strip parameter queries before and after writing', async () => {
    const runOperation = fakeRunOperation();

    await expect(
      runSetVoicemeeterStripParameter({ index: 0, property: 'mute', value: true }, runOperation)
    ).resolves.toMatchObject({ ok: true, parameter: { name: 'Strip[0].mute', kind: 'float' } });
    expect(runOperation.mock.calls.map((call) => call[0])).toEqual([
      'status',
      'get-parameters',
      'set-parameters',
      'get-parameters',
    ]);
    expect(runOperation.mock.calls[2][1]).toMatchObject({
      parameters: [{ name: 'Strip[0].mute', kind: 'float', value: 1 }],
    });
  });

  test('write and raw gates use inverse disable environment variables', async () => {
    const runOperation = fakeRunOperation();

    await expect(
      runSetVoicemeeterStripParameter(
        { index: 0, property: 'mute', value: true },
        runOperation,
        { VOICEMEETER_MCP_DISABLE_WRITES: 'true' }
      )
    ).rejects.toThrow(/DISABLE_WRITES/);
    await expect(
      runRawVoicemeeterRemoteApi(
        { operation: 'getFloat', parameter: 'Strip[0].gain' },
        runOperation,
        { VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API: 'true' }
      )
    ).rejects.toThrow(/DISABLE_RAW_REMOTE_API/);
  });

  test('levels are bounded by detected edition channel limits', async () => {
    const runOperation = fakeRunOperation();

    await expect(runGetVoicemeeterLevels({ levelType: 'output', channels: [0, 39] }, runOperation)).resolves.toMatchObject({
      ok: true,
      levelType: 3,
    });
    await expect(runGetVoicemeeterLevels({ levelType: 'output', channels: [40] }, runOperation)).rejects.toThrow(
      /outside output limit/
    );
  });
});
