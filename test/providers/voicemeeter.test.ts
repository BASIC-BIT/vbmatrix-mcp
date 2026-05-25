import { describe, expect, test, vi } from 'vitest';
import { productProviders } from '../../src/providers/index.js';
import {
  getVoicemeeterStatus,
  parseVoicemeeterHelperResponse,
  voicemeeterEditionMetadata,
  type VoicemeeterHelperCommand,
} from '../../src/providers/voicemeeterHelper.js';
import { voicemeeterCapabilitiesPayload, voicemeeterProviderMetadata } from '../../src/providers/voicemeeterMetadata.js';

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
        configuredBy: ['VOICEMEETER_HELPER_COMMAND', 'VOICEMEETER_HELPER_ARGS'],
      },
      compatibility: {
        matrixToolPrefixStable: true,
      },
    });
  });
});

describe('Voicemeeter helper discovery', () => {
  const command: VoicemeeterHelperCommand = { command: 'helper.exe', args: [], timeoutMs: 1000 };

  test('reports unavailable when no helper is configured', async () => {
    await expect(getVoicemeeterStatus(undefined)).resolves.toMatchObject({
      ok: false,
      availability: 'helper_not_configured',
      running: false,
      helper: { configured: false },
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

    await expect(getVoicemeeterStatus(command, runHelper)).resolves.toMatchObject({
      ok: false,
      availability: 'missing_install',
      running: false,
      error: 'Voicemeeter Remote DLL not found.',
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

  test('keeps unknown SDK type explicit', () => {
    expect(voicemeeterEditionMetadata(99)).toEqual({ type: 99, name: 'unknown', strips: 0, buses: 0 });
  });
});
