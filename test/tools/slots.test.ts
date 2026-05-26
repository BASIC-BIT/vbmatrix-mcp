import { describe, expect, test, vi } from 'vitest';
import type { VbMatrixConfig } from '../../src/config/index.js';
import type { SlotState } from '../../src/core/commands.js';
import type { VbMatrixClient } from '../../src/core/client.js';
import { writeSlot } from '../../src/tools/slots.js';

const config: VbMatrixConfig = {
  host: '127.0.0.1',
  port: 6980,
  streamName: 'Command1',
  timeoutMs: 2000,
  logLevel: 'error',
  writes: {
    allow: true,
    allowAllSuids: false,
    allowedSuids: ['VAIO1'],
    allowDestructive: true,
  },
  rawCommands: { disabled: false },
};

const before: SlotState = {
  info: 'Virtual ASIO',
  online: '1',
  runningStatus: '1',
  master: '0',
  device: 'Example Device',
};

describe('slot write helper', () => {
  test('returns partial-success state when the post-write query fails', async () => {
    const querySlotState = vi
      .fn<() => Promise<SlotState>>()
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error('No response for query: Slot(VAIO1).Info=?;'));
    const send = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = { config, querySlotState, send } as unknown as VbMatrixClient;

    await expect(writeSlot('VAIO1', 'Slot(VAIO1).Reset;', client)).resolves.toEqual({
      ok: false,
      partial: true,
      commandSent: true,
      suid: 'VAIO1',
      command: 'Slot(VAIO1).Reset;',
      before,
      afterError: 'No response for query: Slot(VAIO1).Info=?;',
      safety: {
        allowWrites: true,
        allowAllSuids: false,
        allowedSuids: ['VAIO1'],
        allowDestructive: true,
      },
    });
    expect(send).toHaveBeenCalledWith('Slot(VAIO1).Reset;');
  });

  test('preserves pre-write query failures as no command sent', async () => {
    const querySlotState = vi.fn<() => Promise<SlotState>>().mockRejectedValue(new Error('pre-write failed'));
    const send = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const client = { config, querySlotState, send } as unknown as VbMatrixClient;

    await expect(writeSlot('VAIO1', 'Slot(VAIO1).Reset;', client)).rejects.toThrow('pre-write failed');
    expect(send).not.toHaveBeenCalled();
  });
});
