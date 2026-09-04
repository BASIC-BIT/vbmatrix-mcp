import { describe, expect, test, vi } from 'vitest';
import { productProviders } from '../../src/providers/index.js';
import {
  runWindowsAudioDefaults,
  runWindowsAudioEndpoints,
  WindowsAudioEndpointsSchema,
} from '../../src/providers/windowsAudio.js';
import {
  bundledWindowsAudioHelperCommand,
  runWindowsAudioHelper,
  runWindowsAudioOperation,
  windowsAudioOperationCommand,
  type WindowsAudioHelperCommand,
} from '../../src/providers/windowsAudioHelper.js';
import {
  windowsAudioCapabilitiesPayload,
  windowsAudioProviderMetadata,
} from '../../src/providers/windowsAudioMetadata.js';

function endpoint(id: string, dataFlow: 'render' | 'capture' = 'render') {
  return {
    id,
    dataFlow,
    state: 'active',
    stateValue: 1,
    friendlyName: `Example ${dataFlow}`,
    deviceDescription: 'Sanitized audio endpoint',
    interfaceFriendlyName: 'Sanitized interface',
    policyGuid: '{00000000-0000-0000-0000-000000000000}',
    interfacePath: `SWD\\MMDEVAPI\\${id}`,
    defaultRoles: ['console', 'multimedia', 'communications'],
    mixFormat: {
      available: true,
      channels: 2,
      sampleRateHz: 48_000,
      bitsPerSample: 32,
      blockAlign: 8,
      averageBytesPerSecond: 384_000,
      formatTag: 65_534,
    },
  };
}

function helperCommand(requestId = 'test-request', args: string[] = []): WindowsAudioHelperCommand {
  return {
    command: process.execPath,
    args,
    timeoutMs: 1_000,
    kind: 'custom',
    request: { protocolVersion: 1, requestId, operation: 'status', payload: {} },
  };
}

describe('Windows Audio product provider', () => {
  test('registers a distinct provider namespace and documents its boundary', () => {
    expect(productProviders[2]).toMatchObject({
      id: 'windows-audio',
      displayName: 'Windows Core Audio',
      toolPrefix: 'windows_audio',
      transport: 'helper-process',
    });
    expect(windowsAudioProviderMetadata.capabilities).toContain('endpointInventory');
    expect(windowsAudioCapabilitiesPayload('linux')).toMatchObject({
      ok: true,
      runtimeAvailability: { platform: 'linux', platformSupported: false, helperProbed: false },
      helperBoundary: { nativeApisLoadedInMcpProcess: false, arbitraryCommandsAccepted: false },
      safety: { readOnly: true, changesDefaultDevices: false, changesAudioRouting: false },
    });
  });

  test('builds bundled and custom JSON-stdio helper commands', () => {
    const bundled = bundledWindowsAudioHelperCommand('endpoints', { maxEndpoints: 2 }, {});
    expect(bundled).toMatchObject({ command: 'powershell.exe', kind: 'bundled' });
    expect(bundled?.args).toContain('-File');
    expect(bundled?.args).not.toContain('-Operation');
    expect(bundled?.request).toMatchObject({
      protocolVersion: 1,
      operation: 'endpoints',
      payload: { maxEndpoints: 2 },
    });

    const custom = windowsAudioOperationCommand(
      'defaults',
      {},
      {
        WINDOWS_AUDIO_HELPER_COMMAND: 'helper.exe',
        WINDOWS_AUDIO_HELPER_ARGS: '["--json"]',
      }
    );
    expect(custom).toMatchObject({
      command: 'helper.exe',
      args: ['--json'],
      kind: 'custom',
      request: { protocolVersion: 1, operation: 'defaults', payload: {} },
    });
  });

  test('returns structured platform and configuration failures', async () => {
    await expect(
      runWindowsAudioOperation('status', {}, undefined, undefined, 'linux', {})
    ).resolves.toMatchObject({
      ok: false,
      availability: 'unsupported_platform',
      code: 'windows_audio_unsupported_platform',
    });
    await expect(
      runWindowsAudioOperation('status', {}, undefined, undefined, 'win32', {
        WINDOWS_AUDIO_HELPER_COMMAND: 'helper.exe',
        WINDOWS_AUDIO_HELPER_ARGS: 'not-json',
      })
    ).resolves.toMatchObject({
      ok: false,
      availability: 'helper_failed',
      code: 'windows_audio_helper_configuration_invalid',
    });
  });

  test('round-trips one matching JSON request and response over stdio', async () => {
    const script =
      "let input='';process.stdin.on('data',(chunk)=>input+=chunk);process.stdin.on('end',()=>{const request=JSON.parse(input);process.stdout.write(JSON.stringify({protocolVersion:1,requestId:request.requestId,ok:true,availability:'available'}));});";
    await expect(
      runWindowsAudioHelper(helperCommand('matching-request', ['-e', script]))
    ).resolves.toMatchObject({
      protocolVersion: 1,
      requestId: 'matching-request',
      ok: true,
      availability: 'available',
      helper: { configured: true, kind: 'custom', exitCode: 0 },
    });
  });

  test('rejects mismatched IDs, invalid JSON, and oversized helper output', async () => {
    await expect(
      runWindowsAudioHelper(
        helperCommand('expected-request', [
          '-e',
          'process.stdin.resume();process.stdout.write(JSON.stringify({protocolVersion:1,requestId:"other-request",ok:true}));',
        ])
      )
    ).resolves.toMatchObject({ code: 'windows_audio_helper_response_mismatch' });
    await expect(
      runWindowsAudioHelper(
        helperCommand('invalid-json', ['-e', 'process.stdin.resume();process.stdout.write("not-json");'])
      )
    ).resolves.toMatchObject({ code: 'windows_audio_helper_invalid_json' });
    await expect(
      runWindowsAudioHelper(
        helperCommand('oversized-output', [
          '-e',
          'process.stdin.resume();process.stdout.write("x".repeat(600000));setTimeout(()=>{},5000);',
        ])
      )
    ).resolves.toMatchObject({
      code: 'windows_audio_helper_output_too_large',
      availability: 'helper_failed',
    });
  });

  test('rejects oversized input and cancels a timed-out helper process', async () => {
    const oversized = helperCommand('oversized-input');
    oversized.request.payload = { text: 'x'.repeat(70_000) };
    await expect(runWindowsAudioHelper(oversized)).resolves.toMatchObject({
      code: 'windows_audio_helper_input_too_large',
      availability: 'helper_failed',
    });

    const timedOut = helperCommand('timed-out', ['-e', 'process.stdin.resume();setTimeout(()=>{},5000);']);
    timedOut.timeoutMs = 25;
    await expect(runWindowsAudioHelper(timedOut)).resolves.toMatchObject({
      code: 'windows_audio_helper_timeout',
      availability: 'helper_failed',
    });
  });

  test('applies endpoint defaults and a second server-side cap', async () => {
    expect(WindowsAudioEndpointsSchema.parse({})).toEqual({
      flow: 'all',
      includeInactive: false,
      nameFilter: '',
      maxEndpoints: 80,
    });
    const runOperation = vi.fn().mockResolvedValue({
      schemaVersion: 'windows_audio.endpoints.v1',
      ok: true,
      availability: 'available',
      platform: 'windows',
      flow: 'all',
      includeInactive: false,
      nameFilter: '',
      matchedCount: 2,
      returnedCount: 2,
      truncated: false,
      endpoints: [endpoint('render-one'), endpoint('capture-one', 'capture')],
      helper: { configured: true, kind: 'custom' },
    });
    const result = await runWindowsAudioEndpoints(
      WindowsAudioEndpointsSchema.parse({ maxEndpoints: 1 }),
      runOperation
    );
    expect(result).toMatchObject({
      ok: true,
      stateSource: 'windows-core-audio',
      liveState: true,
      matchedCount: 2,
      returnedCount: 1,
      truncated: true,
      endpoints: [{ id: 'render-one' }],
      helper: { configured: true, kind: 'custom' },
    });
  });

  test('rejects inconsistent, mismatched, or duplicate successful endpoint contracts', async () => {
    const response = {
      schemaVersion: 'windows_audio.endpoints.v1',
      ok: true,
      availability: 'available',
      platform: 'windows',
      flow: 'render',
      includeInactive: false,
      nameFilter: '',
      matchedCount: 2,
      returnedCount: 2,
      truncated: false,
      endpoints: [endpoint('duplicate'), endpoint('duplicate')],
    };
    const runOperation = vi.fn().mockResolvedValue(response);
    await expect(
      runWindowsAudioEndpoints(WindowsAudioEndpointsSchema.parse({ flow: 'render' }), runOperation)
    ).resolves.toMatchObject({
      ok: false,
      code: 'windows_audio_helper_contract_invalid',
    });

    response.endpoints = [endpoint('one'), endpoint('two')];
    response.flow = 'capture';
    await expect(
      runWindowsAudioEndpoints(WindowsAudioEndpointsSchema.parse({ flow: 'render' }), runOperation)
    ).resolves.toMatchObject({
      ok: false,
      code: 'windows_audio_helper_contract_invalid',
    });
  });

  test('normalizes six-role default observations and preserves unavailable roles', async () => {
    const runOperation = vi.fn().mockResolvedValue({
      schemaVersion: 'windows_audio.defaults.v1',
      ok: true,
      availability: 'available',
      platform: 'windows',
      defaults: [
        { dataFlow: 'render', role: 'console', available: true, endpoint: endpoint('render-one') },
        {
          dataFlow: 'render',
          role: 'multimedia',
          available: true,
          endpoint: endpoint('render-two'),
        },
        {
          dataFlow: 'render',
          role: 'communications',
          available: true,
          endpoint: endpoint('render-three'),
        },
        { dataFlow: 'capture', role: 'console', available: false, hresult: '0x80070490' },
        { dataFlow: 'capture', role: 'multimedia', available: false, hresult: '0x80070490' },
        {
          dataFlow: 'capture',
          role: 'communications',
          available: false,
          hresult: '0x80070490',
        },
      ],
      helper: { configured: true, kind: 'custom' },
    });
    await expect(runWindowsAudioDefaults(runOperation)).resolves.toMatchObject({
      ok: true,
      stateSource: 'windows-core-audio',
      liveState: true,
      defaults: [
        { dataFlow: 'render', role: 'console', available: true },
        { dataFlow: 'render', role: 'multimedia', available: true },
        { dataFlow: 'render', role: 'communications', available: true },
        { dataFlow: 'capture', role: 'console', available: false },
        { dataFlow: 'capture', role: 'multimedia', available: false },
        { dataFlow: 'capture', role: 'communications', available: false },
      ],
    });
  });

  test('rejects incomplete or internally inconsistent default contracts', async () => {
    const incomplete = vi.fn().mockResolvedValue({
      schemaVersion: 'windows_audio.defaults.v1',
      ok: true,
      availability: 'available',
      platform: 'windows',
      defaults: [{ dataFlow: 'render', role: 'console', available: false }],
      helper: { configured: true, kind: 'custom' },
    });
    await expect(runWindowsAudioDefaults(incomplete)).resolves.toMatchObject({
      ok: false,
      code: 'windows_audio_helper_contract_invalid',
      helper: { configured: true, kind: 'custom' },
    });
  });

  test('preserves helper failures without claiming live state', async () => {
    const runOperation = vi.fn().mockResolvedValue({
      ok: false,
      availability: 'helper_failed',
      code: 'windows_audio_core_audio_failed',
    });
    await expect(runWindowsAudioDefaults(runOperation)).resolves.toEqual({
      ok: false,
      availability: 'helper_failed',
      code: 'windows_audio_core_audio_failed',
    });
  });
});
