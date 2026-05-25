import { describe, expect, test, vi } from 'vitest';
import type { VbMatrixClient } from '../../src/core/client.js';
import { inspectRoutes, inspectSlots } from '../../src/tools/observability.js';
import { InspectRoutesSchema, InspectSlotsSchema } from '../../src/tools/schemas.js';

function fakeClient(values: Record<string, string>, failures: string[] = []) {
  const queryValue = vi.fn<(command: string) => Promise<string>>((command) => {
    if (failures.includes(command)) return Promise.reject(new Error(`No response for query: ${command}`));
    const value = values[command];
    if (value === undefined) return Promise.reject(new Error(`Unexpected query: ${command}`));
    return Promise.resolve(value);
  });
  return { client: { queryValue } as unknown as VbMatrixClient, queryValue };
}

describe('Matrix observability tool runners', () => {
  test('inspectRoutes returns route summaries and selected context', async () => {
    const { client, queryValue } = fakeClient({
      'Command.Engine=?;': '1',
      'Command.Master=?;': 'VAIO1',
      'Slot(VASIO8).Info=?;': 'Virtual ASIO input',
      'Slot(VASIO8).Online=?;': '1',
      'Slot(VASIO8).RunningStatus=?;': '1',
      'Slot(VASIO8).Master=?;': '0',
      'Slot(VASIO8).Device=?;': 'Example Input',
      'Slot(VAIO1).Info=?;': 'Virtual output',
      'Slot(VAIO1).Online=?;': '1',
      'Slot(VAIO1).RunningStatus=?;': '1',
      'Slot(VAIO1).Master=?;': '1',
      'Slot(VAIO1).Device=?;': 'Example Output',
      'Point(VASIO8.IN[1],VAIO1.OUT[1]).dBGain=?;': '-6.0',
      'Point(VASIO8.IN[1],VAIO1.OUT[1]).Mute=?;': '0',
      'Point(VASIO8.IN[1],VAIO1.OUT[1]).Phase=?;': '0',
      'Input(VASIO8.IN[1]).Name=?;': 'Mic',
      'Output(VAIO1.OUT[1]).Name=?;': 'Monitor',
    });

    const result = await inspectRoutes(
      InspectRoutesSchema.parse({
        points: [{ inputSuid: 'VASIO8', inputChannel: 1, outputSuid: 'VAIO1', outputChannel: 1 }],
      }),
      client
    );

    expect(result).toMatchObject({
      ok: true,
      scope: { highVolumeScan: false, pointCount: 1, includeSystem: true, includeSlots: true, includeLabels: true },
      routes: [
        {
          key: 'VASIO8.IN[1]->VAIO1.OUT[1]',
          point: {
            ok: true,
            state: { dBGain: '-6.0', mute: '0', phase: '0' },
            summary: { connected: true, muted: false, phaseReversed: false, gainDb: '-6.0', attention: [] },
          },
          labels: {
            input: { ok: true, value: 'Mic' },
            output: { ok: true, value: 'Monitor' },
          },
        },
      ],
    });
    expect(queryValue).toHaveBeenCalledWith('Point(VASIO8.IN[1],VAIO1.OUT[1]).dBGain=?;');
  });

  test('inspectSlots preserves partial label failures as observations', async () => {
    const failingLabel = 'Output(VAIO1.OUT[2]).Name=?;';
    const { client } = fakeClient(
      {
        'Slot(VAIO1).Info=?;': 'Virtual output',
        'Slot(VAIO1).Online=?;': '1',
        'Slot(VAIO1).RunningStatus=?;': '1',
        'Slot(VAIO1).Master=?;': '1',
        'Slot(VAIO1).Device=?;': 'Example Output',
        'Output(VAIO1.OUT[1]).Name=?;': 'Monitor L',
      },
      [failingLabel]
    );

    const result = await inspectSlots(
      InspectSlotsSchema.parse({ slots: [{ suid: 'VAIO1', outputChannels: [1, 2] }] }),
      client
    );

    expect(result).toMatchObject({
      ok: false,
      scope: { highVolumeScan: false, slotCount: 1, labelQueryCount: 2 },
      slots: [
        {
          suid: 'VAIO1',
          slotState: { info: { ok: true, value: 'Virtual output' } },
          labels: {
            output: [
              { channel: 1, observation: { ok: true, value: 'Monitor L' } },
              { channel: 2, observation: { ok: false, command: failingLabel } },
            ],
          },
        },
      ],
    });
  });
});
