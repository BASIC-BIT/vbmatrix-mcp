import { describe, expect, test, vi } from 'vitest';
import {
  runGetVoicemeeterLevels,
  runGetVoicemeeterStrip,
  runRawVoicemeeterRemoteApi,
  runSetVoicemeeterDevice,
  runSetVoicemeeterMacroButton,
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
      return Promise.resolve({
        ok: true,
        availability: 'available',
        running: true,
        type: 2,
        version: '3.1.1.1',
      });
    if (operation === 'get-parameters')
      return Promise.resolve({ ok: true, parameters: payload?.parameters ?? [] });
    if (operation === 'set-parameters')
      return Promise.resolve({ ok: true, parameters: payload?.parameters ?? [] });
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

  test('set device distinguishes accepted writes from observable state changes', async () => {
    const runOperation = vi.fn<FakeRunOperation>((operation, payload) => {
      if (operation === 'status') {
        return Promise.resolve({
          ok: true,
          availability: 'available',
          running: true,
          type: 2,
          version: '3.1.1.1',
        });
      }
      if (operation === 'set-parameters')
        return Promise.resolve({ ok: true, parameters: payload?.parameters ?? [] });
      if (operation === 'get-parameters') {
        return Promise.resolve({
          ok: true,
          parameters: [{ name: 'Strip[0].device.name', kind: 'string', result: 0, value: '' }],
        });
      }
      return Promise.resolve({ ok: true });
    });

    await expect(
      runSetVoicemeeterDevice(
        { target: 'strip', index: 0, driver: 'asio', deviceName: 'Example ASIO', confirm: true },
        runOperation
      )
    ).resolves.toMatchObject({
      ok: true,
      confirmation: {
        writeAccepted: true,
        stateQuery: 'Strip[0].device.name',
        stateObserved: true,
        observedBefore: '',
        observedAfter: '',
        stateChanged: false,
        matchesRequestedDeviceName: false,
      },
    });
  });

  test('set macro button labels trigger writes as acceptance-only pulses', async () => {
    const runOperation = vi.fn<FakeRunOperation>((operation, payload) => {
      if (operation === 'macro-status') return Promise.resolve({ ok: true, value: 0, result: 0, ...payload });
      if (operation === 'macro-set') return Promise.resolve({ ok: true, result: 0, ...payload });
      return Promise.resolve({ ok: true });
    });

    await expect(
      runSetVoicemeeterMacroButton({ index: 3, mode: 'trigger', value: true, confirm: true }, runOperation)
    ).resolves.toMatchObject({
      ok: true,
      confirmation: {
        writeAccepted: true,
        mode: 'trigger',
        modeNumber: 3,
        requestedValue: 1,
        stateObserved: true,
        observedBefore: 0,
        observedAfter: 0,
        stateChanged: false,
        matchesRequestedValue: null,
        statePersistence: 'trigger_pulse',
      },
    });
  });

  test('set macro button reports observable persistent state matches', async () => {
    let macroStatusCalls = 0;
    const runOperation = vi.fn<FakeRunOperation>((operation, payload) => {
      if (operation === 'macro-status') {
        const value = macroStatusCalls === 0 ? 0 : 1;
        macroStatusCalls += 1;
        return Promise.resolve({ ok: true, value, result: 0, ...payload });
      }
      if (operation === 'macro-set') return Promise.resolve({ ok: true, result: 0, ...payload });
      return Promise.resolve({ ok: true });
    });

    await expect(
      runSetVoicemeeterMacroButton({ index: 3, mode: 'stateOnly', value: true, confirm: true }, runOperation)
    ).resolves.toMatchObject({
      ok: true,
      confirmation: {
        writeAccepted: true,
        mode: 'stateOnly',
        modeNumber: 2,
        requestedValue: 1,
        stateObserved: true,
        observedBefore: 0,
        observedAfter: 1,
        stateChanged: true,
        matchesRequestedValue: true,
        statePersistence: 'queryable_status',
      },
    });
  });

  test('write and raw gates use inverse disable environment variables', async () => {
    const runOperation = fakeRunOperation();

    await expect(
      runSetVoicemeeterStripParameter({ index: 0, property: 'mute', value: true }, runOperation, {
        VOICEMEETER_MCP_DISABLE_WRITES: 'true',
      })
    ).rejects.toThrow(/DISABLE_WRITES/);
    await expect(
      runRawVoicemeeterRemoteApi({ operation: 'getFloat', parameter: 'Strip[0].gain' }, runOperation, {
        VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API: 'true',
      })
    ).rejects.toThrow(/DISABLE_RAW_REMOTE_API/);
    await expect(
      runRawVoicemeeterRemoteApi(
        { operation: 'setFloat', parameter: 'Strip[0].gain', value: 0 },
        runOperation,
        { VOICEMEETER_MCP_DISABLE_WRITES: 'true' }
      )
    ).rejects.toThrow(/DISABLE_WRITES/);
    await expect(
      runRawVoicemeeterRemoteApi({ operation: 'script', script: 'Strip[0].gain=0;' }, runOperation, {
        VOICEMEETER_MCP_DISABLE_WRITES: 'true',
      })
    ).rejects.toThrow(/DISABLE_WRITES/);
  });

  test('levels are bounded by detected edition channel limits', async () => {
    const runOperation = fakeRunOperation();

    await expect(
      runGetVoicemeeterLevels({ levelType: 'output', channels: [0, 39] }, runOperation)
    ).resolves.toMatchObject({
      ok: true,
      levelType: 3,
    });
    await expect(
      runGetVoicemeeterLevels({ levelType: 'output', channels: [40] }, runOperation)
    ).rejects.toThrow(/outside output limit/);
  });
});
