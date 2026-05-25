import { describe, expect, test } from 'vitest';
import {
  MAX_ROUTE_INSPECTION_POINTS,
  MAX_SLOT_INSPECTION_SLOTS,
  MAX_SLOT_LABEL_CHANNELS_PER_SIDE,
  MAX_SLOT_LABEL_QUERIES,
  createRouteInspectionPlan,
  createSlotInspectionPlan,
  pointTargetKey,
  summarizePointState,
  validateRouteInspectionTargets,
  validateSlotInspectionTargets,
} from '../../src/core/observability.js';

const route = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 126,
};

describe('Matrix route observability helpers', () => {
  test('builds a bounded route inspection query plan', () => {
    const plan = createRouteInspectionPlan([route]);

    expect(plan).toMatchObject({
      maxPoints: MAX_ROUTE_INSPECTION_POINTS,
      pointCount: 1,
      uniqueSlotSuids: ['VASIO8', 'ASIO128'],
      systemQueries: {
        engine: 'Command.Engine=?;',
        master: 'Command.Master=?;',
      },
      slotQueries: {
        VASIO8: {
          info: 'Slot(VASIO8).Info=?;',
          online: 'Slot(VASIO8).Online=?;',
          runningStatus: 'Slot(VASIO8).RunningStatus=?;',
          master: 'Slot(VASIO8).Master=?;',
          device: 'Slot(VASIO8).Device=?;',
        },
      },
    });
    expect(plan.routes[0]).toMatchObject({
      key: 'VASIO8.IN[1]->ASIO128.OUT[126]',
      pointQueries: {
        dBGain: 'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=?;',
        mute: 'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=?;',
        phase: 'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=?;',
      },
      labelQueries: {
        input: 'Input(VASIO8.IN[1]).Name=?;',
        output: 'Output(ASIO128.OUT[126]).Name=?;',
      },
    });
  });

  test('rejects broad, empty, duplicate, and invalid route inspection scopes', () => {
    expect(() => validateRouteInspectionTargets([])).toThrow(/At least one route point/);
    expect(() => validateRouteInspectionTargets([route, route])).toThrow(/Duplicate route inspection target/);
    expect(() =>
      validateRouteInspectionTargets(
        Array.from({ length: MAX_ROUTE_INSPECTION_POINTS + 1 }, (_, index) => ({ ...route, outputChannel: index + 1 }))
      )
    ).toThrow(/capped/);
    expect(() => validateRouteInspectionTargets([{ ...route, inputSuid: 'bad;Command.Restart' }])).toThrow(/Invalid SUID/);
  });

  test('summarizes route state in operator-facing terms', () => {
    expect(summarizePointState({ dBGain: '-6.0', mute: '0', phase: '0' })).toEqual({
      connected: true,
      muted: false,
      phaseReversed: false,
      gainDb: '-6.0',
      attention: [],
    });
    expect(summarizePointState({ dBGain: '-inf', mute: '1', phase: '1' })).toEqual({
      connected: false,
      muted: true,
      phaseReversed: true,
      gainDb: '-inf',
      attention: [
        'Point appears disconnected or silent by gain state',
        'Point is muted',
        'Point phase is reversed',
      ],
    });
  });

  test('uses stable point keys for route correlation', () => {
    expect(pointTargetKey(route)).toBe('VASIO8.IN[1]->ASIO128.OUT[126]');
  });

  test('builds a bounded slot inspection query plan', () => {
    const plan = createSlotInspectionPlan([
      { suid: 'VASIO8', inputChannels: [1, 2], outputChannels: [] },
      { suid: 'ASIO128', inputChannels: [], outputChannels: [125, 126] },
    ]);

    expect(plan).toMatchObject({
      maxSlots: MAX_SLOT_INSPECTION_SLOTS,
      maxLabelChannelsPerSide: MAX_SLOT_LABEL_CHANNELS_PER_SIDE,
      maxLabelQueries: MAX_SLOT_LABEL_QUERIES,
      slotCount: 2,
      labelQueryCount: 4,
      slots: [
        {
          suid: 'VASIO8',
          slotQueries: {
            info: 'Slot(VASIO8).Info=?;',
            online: 'Slot(VASIO8).Online=?;',
            runningStatus: 'Slot(VASIO8).RunningStatus=?;',
            master: 'Slot(VASIO8).Master=?;',
            device: 'Slot(VASIO8).Device=?;',
          },
          labelQueries: {
            input: [
              { channel: 1, command: 'Input(VASIO8.IN[1]).Name=?;' },
              { channel: 2, command: 'Input(VASIO8.IN[2]).Name=?;' },
            ],
            output: [],
          },
        },
        {
          suid: 'ASIO128',
          labelQueries: {
            input: [],
            output: [
              { channel: 125, command: 'Output(ASIO128.OUT[125]).Name=?;' },
              { channel: 126, command: 'Output(ASIO128.OUT[126]).Name=?;' },
            ],
          },
        },
      ],
    });
  });

  test('rejects broad, duplicate, and invalid slot inspection scopes', () => {
    expect(() => validateSlotInspectionTargets([])).toThrow(/At least one slot/);
    expect(() =>
      validateSlotInspectionTargets(Array.from({ length: MAX_SLOT_INSPECTION_SLOTS + 1 }, (_, index) => ({
        suid: `VAIO${index}`,
        inputChannels: [],
        outputChannels: [],
      })))
    ).toThrow(/capped/);
    expect(() =>
      validateSlotInspectionTargets([
        { suid: 'VAIO1', inputChannels: [], outputChannels: [] },
        { suid: 'VAIO1', inputChannels: [1], outputChannels: [] },
      ])
    ).toThrow(/Duplicate slot inspection target/);
    expect(() =>
      validateSlotInspectionTargets([{ suid: 'VAIO1', inputChannels: [1, 1], outputChannels: [] }])
    ).toThrow(/Duplicate VAIO1 input channel/);
    expect(() =>
      validateSlotInspectionTargets([
        {
          suid: 'VAIO1',
          inputChannels: Array.from({ length: MAX_SLOT_LABEL_CHANNELS_PER_SIDE + 1 }, (_, index) => index + 1),
          outputChannels: [],
        },
      ])
    ).toThrow(/channels per slot side/);
    expect(() => validateSlotInspectionTargets([{ suid: 'bad;Command.Restart', inputChannels: [], outputChannels: [] }])).toThrow(
      /Invalid SUID/
    );
  });
});
