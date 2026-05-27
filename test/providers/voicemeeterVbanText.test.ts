import { describe, expect, test, vi } from 'vitest';
import type { VoicemeeterVbanTextConfig } from '../../src/config/index.js';
import {
  VBAN_REQUEST_REPLY_STREAM,
  VbanTextTimeoutError,
  type SendVbanTextOptions,
} from '../../src/core/vbanText.js';
import { runRawVoicemeeterVbanText } from '../../src/providers/voicemeeterVbanText.js';

const config: VoicemeeterVbanTextConfig = {
  host: '127.0.0.1',
  port: 6982,
  streamName: 'Command1',
  timeoutMs: 2000,
  rawVbanText: { disabled: false },
};

function fakeSender(response: string | null = null) {
  return vi
    .fn<(command: string, options: SendVbanTextOptions) => Promise<string | null>>()
    .mockResolvedValue(response);
}

describe('Voicemeeter raw VBAN-TEXT runner', () => {
  test('waits for responses by default for query-looking commands', async () => {
    const sendCommand = fakeSender('Strip[0].Gain = 0;');

    await expect(
      runRawVoicemeeterVbanText({ command: 'Strip[0].Gain=?;' }, config, sendCommand)
    ).resolves.toMatchObject({
      ok: true,
      command: 'Strip[0].Gain=?;',
      waitForResponse: true,
      response: 'Strip[0].Gain = 0;',
      timedOut: false,
      rawPolicy: {
        disableRawVbanText: false,
        preferTypedTools: true,
        queryReplyBehavior: 'unverified_for_voicemeeter',
      },
      connection: {
        host: '127.0.0.1',
        port: 6982,
        streamName: 'Command1',
        timeoutMs: 2000,
      },
    });
    expect(sendCommand).toHaveBeenCalledWith('Strip[0].Gain=?;', {
      host: '127.0.0.1',
      port: 6982,
      streamName: 'Command1',
      timeoutMs: 2000,
      waitForResponse: true,
    });
  });

  test('sends non-query commands without waiting by default', async () => {
    const sendCommand = fakeSender(null);

    await expect(
      runRawVoicemeeterVbanText({ command: 'Strip[0].Gain=0;' }, config, sendCommand)
    ).resolves.toMatchObject({
      ok: true,
      command: 'Strip[0].Gain=0;',
      waitForResponse: false,
      response: null,
      timedOut: false,
    });
    expect(sendCommand).toHaveBeenCalledWith(
      'Strip[0].Gain=0;',
      expect.objectContaining({ waitForResponse: false })
    );
  });

  test('reports null responses distinctly when waiting for a reply', async () => {
    const sendCommand = fakeSender(null);

    await expect(
      runRawVoicemeeterVbanText({ command: 'Strip[0].Gain=?;' }, config, sendCommand)
    ).resolves.toMatchObject({
      ok: false,
      command: 'Strip[0].Gain=?;',
      waitForResponse: true,
      response: null,
      timedOut: true,
    });
  });

  test('returns timeout diagnostics from the VBAN-TEXT transport', async () => {
    const timeout = new VbanTextTimeoutError('Strip[0].Gain=?;', {
      command: 'Strip[0].Gain=?;',
      connection: {
        host: '127.0.0.1',
        port: 6982,
        streamName: 'Command1',
        timeoutMs: 2000,
        responseStreamName: VBAN_REQUEST_REPLY_STREAM,
      },
      sent: true,
      receivedPackets: 0,
      ignoredPackets: [],
      likelySetupStages: [],
    });
    const sendCommand = vi
      .fn<(command: string, options: SendVbanTextOptions) => Promise<string | null>>()
      .mockRejectedValue(timeout);

    const result = await runRawVoicemeeterVbanText({ command: 'Strip[0].Gain=?;' }, config, sendCommand);

    expect(result).toMatchObject({
      ok: false,
      command: 'Strip[0].Gain=?;',
      waitForResponse: true,
      response: null,
      timedOut: true,
      diagnostics: {
        command: 'Strip[0].Gain=?;',
        sent: true,
        receivedPackets: 0,
      },
    });
    if (typeof result.error !== 'string') throw new Error('expected timeout error');
    expect(result.error).toContain('Timed out waiting for Voicemeeter VBAN-TEXT response');
    expect(result.error).toContain("incoming TEXT stream 'Command1'");
    expect(result.error).not.toContain('Matrix');
  });

  test('is disabled by inverse raw VBAN-TEXT policy', async () => {
    const sendCommand = fakeSender(null);

    await expect(
      runRawVoicemeeterVbanText(
        { command: 'Strip[0].Gain=?;' },
        { ...config, rawVbanText: { disabled: true } },
        sendCommand
      )
    ).rejects.toThrow(/DISABLE_RAW_VBAN_TEXT/);
    expect(sendCommand).not.toHaveBeenCalled();
  });
});
