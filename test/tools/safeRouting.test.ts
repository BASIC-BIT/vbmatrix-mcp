import { describe, expect, test, vi } from 'vitest';
import type { VbMatrixConfig } from '../../src/config/index.js';
import type { PointState, PointTarget } from '../../src/core/commands.js';
import type { VbMatrixClient } from '../../src/core/client.js';
import { runSafeRouteWorkflow } from '../../src/tools/safeRouting.js';
import { SafeRouteWorkflowSchema } from '../../src/tools/schemas.js';

const target: PointTarget = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'ASIO128',
  outputChannel: 126,
};

const config: VbMatrixConfig = {
  host: '127.0.0.1',
  port: 6980,
  streamName: 'Command1',
  timeoutMs: 2000,
  logLevel: 'error',
  writes: {
    allow: true,
    allowAllSuids: true,
    allowedSuids: [],
    allowDestructive: true,
  },
};

function fakeClient(states: PointState[], overrides: Partial<VbMatrixConfig['writes']> = {}) {
  const queryPointState = vi.fn<(target: PointTarget) => Promise<PointState>>();
  for (const state of states) queryPointState.mockResolvedValueOnce(state);
  const send = vi.fn<(command: string) => Promise<void>>().mockResolvedValue(undefined);
  return {
    client: {
      config: { ...config, writes: { ...config.writes, ...overrides } },
      queryPointState,
      send,
    } as unknown as VbMatrixClient,
    queryPointState,
    send,
  };
}

describe('safe routing workflow tool runner', () => {
  test('schema dry-runs by default', () => {
    expect(SafeRouteWorkflowSchema.parse({ operation: 'emergencyMute', points: [target] })).toMatchObject({
      dryRun: true,
    });
  });

  test('dry-run snapshots and plans without sending writes', async () => {
    const { client, queryPointState, send } = fakeClient([{ dBGain: '-12', mute: '0', phase: '1' }]);

    await expect(
      runSafeRouteWorkflow({ operation: 'emergencyMute', points: [target], dryRun: true }, client)
    ).resolves.toMatchObject({
      ok: true,
      dryRun: true,
      plan: { commands: ['Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;'] },
      beforeSnapshot: { points: [{ target, state: { dBGain: '-12', mute: '0', phase: '1' } }] },
      rollback: {
        commands: [
          'Point(VASIO8.IN[1],ASIO128.OUT[126]).dBGain=-12;',
          'Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=0;',
          'Point(VASIO8.IN[1],ASIO128.OUT[126]).Phase=1;',
        ],
      },
    });
    expect(queryPointState).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  test('execution requires confirmation before sending commands', async () => {
    const { client, send } = fakeClient([{ dBGain: '0', mute: '0', phase: '0' }]);

    await expect(
      runSafeRouteWorkflow({ operation: 'cleanupRoutes', points: [target], dryRun: false }, client)
    ).rejects.toThrow(/SAFE_ROUTE_APPLY/);
    expect(send).not.toHaveBeenCalled();
  });

  test('confirmed execution sends commands and snapshots after state', async () => {
    const { client, queryPointState, send } = fakeClient([
      { dBGain: '0', mute: '0', phase: '0' },
      { dBGain: '0', mute: '1', phase: '0' },
    ]);

    await expect(
      runSafeRouteWorkflow(
        { operation: 'emergencyMute', points: [target], dryRun: false, confirmApply: 'SAFE_ROUTE_APPLY' },
        client
      )
    ).resolves.toMatchObject({
      ok: true,
      dryRun: false,
      afterSnapshot: { points: [{ target, state: { dBGain: '0', mute: '1', phase: '0' } }] },
    });
    expect(send).toHaveBeenCalledWith('Point(VASIO8.IN[1],ASIO128.OUT[126]).Mute=1;');
    expect(queryPointState).toHaveBeenCalledTimes(2);
  });

  test('execution fails closed when write safety blocks a target', async () => {
    const { client, send } = fakeClient([{ dBGain: '0', mute: '0', phase: '0' }], { allow: false });

    await expect(
      runSafeRouteWorkflow(
        { operation: 'emergencyMute', points: [target], dryRun: false, confirmApply: 'SAFE_ROUTE_APPLY' },
        client
      )
    ).rejects.toThrow(/ALLOW_WRITES=true/);
    expect(send).not.toHaveBeenCalled();
  });
});
