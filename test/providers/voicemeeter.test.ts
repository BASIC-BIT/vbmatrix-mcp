import { describe, expect, test, vi } from 'vitest';
import { productProviders } from '../../src/providers/index.js';
import {
  getVoicemeeterStatus,
  parseVoicemeeterHelperResponse,
  runVoicemeeterHelper,
  voicemeeterEditionMetadata,
  type VoicemeeterHelperCommand,
} from '../../src/providers/voicemeeterHelper.js';
import {
  voicemeeterCapabilitiesPayload,
  voicemeeterProviderMetadata,
} from '../../src/providers/voicemeeterMetadata.js';

describe('Voicemeeter product provider metadata', () => {
  test('registers a separate Voicemeeter provider namespace', () => {
    expect(productProviders[1]).toMatchObject({
      id: 'voicemeeter',
      displayName: 'VB-Audio Voicemeeter',
      toolPrefix: 'voicemeeter',
      transport: 'remote-api-helper-process',
    });
    expect(voicemeeterProviderMetadata.capabilities).toContain('readOnlyHelperBoundary');
  });

  test('documents the read-only out-of-process helper boundary', () => {
    expect(voicemeeterCapabilitiesPayload()).toMatchObject({
      ok: true,
      helperBoundary: {
        nativeDllsLoadedInMcpProcess: false,
        configuredBy: [
          'VOICEMEETER_HELPER_COMMAND',
          'VOICEMEETER_HELPER_ARGS',
          'VOICEMEETER_HELPER_TIMEOUT_MS',
        ],
      },
      compatibility: {
        matrixToolPrefixStable: true,
      },
    });
  });
});

describe('Voicemeeter helper discovery', () => {
  const command: VoicemeeterHelperCommand = { command: 'helper.exe', args: [], timeoutMs: 1000 };

  test('reports unavailable when no helper is configured on Windows', async () => {
    await expect(getVoicemeeterStatus(undefined, undefined, 'win32', {})).resolves.toMatchObject({
      ok: false,
      availability: 'helper_not_configured',
      running: false,
      helper: { configured: false },
    });
  });

  test('reports unsupported platforms before helper configuration advice', async () => {
    await expect(getVoicemeeterStatus(undefined, undefined, 'linux', {})).resolves.toMatchObject({
      ok: false,
      availability: 'unsupported_platform',
      running: false,
      helper: { configured: false },
    });
  });

  test('returns malformed helper args as a structured unavailable state', async () => {
    await expect(
      getVoicemeeterStatus(undefined, undefined, 'win32', {
        VOICEMEETER_HELPER_COMMAND: 'helper.exe',
        VOICEMEETER_HELPER_ARGS: '--json',
      })
    ).resolves.toMatchObject({
      ok: false,
      availability: 'helper_failed',
      running: false,
      helper: { configured: true },
    });
  });

  test('preserves helper failure as a structured unavailable state', async () => {
    const runHelper = vi.fn().mockResolvedValue({
      ok: false,
      availability: 'missing_install',
      running: false,
      helper: { configured: true, command: command.command },
      error: 'Voicemeeter Remote DLL not found.',
    });

    await expect(getVoicemeeterStatus(command, runHelper, 'win32')).resolves.toMatchObject({
      ok: false,
      availability: 'missing_install',
      running: false,
      error: 'Voicemeeter Remote DLL not found.',
    });
  });

  test('classifies missing helper executable as helper failure', async () => {
    const status = await runVoicemeeterHelper({
      command: '__vbmatrix_missing_helper_executable__',
      args: [],
      timeoutMs: 1000,
    });

    expect(status).toMatchObject({
      ok: false,
      availability: 'helper_failed',
      running: false,
    });
  });

  test('caps helper stdout before parsing', async () => {
    const status = await runVoicemeeterHelper({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(70000)); setTimeout(() => {}, 5000);'],
      timeoutMs: 1000,
    });

    expect(status).toMatchObject({
      ok: false,
      availability: 'helper_failed',
      running: false,
      error: 'Voicemeeter helper stdout exceeded 65536 bytes.',
    });
  });

  test('maps a mock helper success to edition metadata', () => {
    const status = parseVoicemeeterHelperResponse(
      JSON.stringify({ ok: true, availability: 'available', running: true, type: 2, version: '3.1.1.1' }),
      command.command,
      0,
      null
    );

    expect(status).toMatchObject({
      ok: true,
      availability: 'available',
      running: true,
      version: '3.1.1.1',
      edition: { type: 2, name: 'banana', strips: 5, buses: 5 },
    });
  });

  test('reports not-running helper responses without throwing', () => {
    expect(
      parseVoicemeeterHelperResponse(
        JSON.stringify({ ok: false, availability: 'not_running', running: false, error: 'Login failed.' }),
        command.command,
        0,
        null
      )
    ).toMatchObject({
      ok: false,
      availability: 'not_running',
      running: false,
      error: 'Login failed.',
    });
  });

  test('preserves explicit unknown helper availability', () => {
    expect(
      parseVoicemeeterHelperResponse(
        JSON.stringify({ ok: false, availability: 'unknown', running: false, error: 'Indeterminate state.' }),
        command.command,
        0,
        null
      )
    ).toMatchObject({
      ok: false,
      availability: 'unknown',
      running: false,
      error: 'Indeterminate state.',
    });
  });

  test('keeps unknown SDK type explicit', () => {
    expect(voicemeeterEditionMetadata(99)).toEqual({ type: 99, name: 'unknown', strips: 0, buses: 0 });
  });
});
