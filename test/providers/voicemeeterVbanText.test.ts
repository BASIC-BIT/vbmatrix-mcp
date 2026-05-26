import { describe, expect, test, vi } from 'vitest';
import type { VoicemeeterVbanTextConfig } from '../../src/config/index.js';
import type { SendVbanTextOptions } from '../../src/core/vbanText.js';
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
    });
    expect(sendCommand).toHaveBeenCalledWith(
      'Strip[0].Gain=0;',
      expect.objectContaining({ waitForResponse: false })
    );
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
