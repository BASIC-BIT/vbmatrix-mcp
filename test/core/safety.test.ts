import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import {
  assertChannelResetAllowed,
  assertChannelWriteAllowed,
  assertDestructiveAllowed,
  assertPointWriteAllowed,
  assertSlotDestructiveAllowed,
  assertSlotWriteAllowed,
  assertZoneResetAllowed,
  assertZoneWriteAllowed,
} from '../../src/core/safety.js';

const target = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'VASIO8',
  outputChannel: 1,
};

const channelTarget = {
  kind: 'input' as const,
  suid: 'VASIO8',
  channel: 1,
};

const zoneTarget = {
  startInputSuid: 'VASIO8',
  startInputChannel: 1,
  startOutputSuid: 'ASIO128',
  startOutputChannel: 1,
  endInputSuid: 'VASIO8',
  endInputChannel: 2,
  endOutputSuid: 'ASIO128',
  endOutputChannel: 2,
};

describe('safety gates', () => {
  test('allows point writes by default', () => {
    const config = loadConfig({});
    expect(() => assertPointWriteAllowed(config, target)).not.toThrow();
  });

  test('blocks point writes when writes are disabled', () => {
    const config = loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'false' });
    expect(() => assertPointWriteAllowed(config, target)).toThrow(/ALLOW_WRITES/);
  });

  test('blocks non-allowlisted SUIDs when all-SUID writes are disabled', () => {
    const config = loadConfig({
      VBMATRIX_MCP_ALLOW_WRITES: 'true',
      VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'false',
      VBMATRIX_MCP_ALLOWED_SUIDS: 'VAIO1',
    });
    expect(() => assertPointWriteAllowed(config, target)).toThrow(/not in VBMATRIX_MCP_ALLOWED_SUIDS/);
  });

  test('allows point writes when all-SUID writes are disabled but SUID allowlist matches', () => {
    const config = loadConfig({
      VBMATRIX_MCP_ALLOW_WRITES: 'true',
      VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'false',
      VBMATRIX_MCP_ALLOWED_SUIDS: 'VASIO8',
    });
    expect(() => assertPointWriteAllowed(config, target)).not.toThrow();
  });

  test('allows destructive tools by default but supports opt-out', () => {
    expect(() => assertDestructiveAllowed(loadConfig({}))).not.toThrow();
    expect(() => assertDestructiveAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'false' }))).toThrow(
      /ALLOW_DESTRUCTIVE/
    );
  });

  test('applies write and SUID gates to slot writes', () => {
    expect(() => assertSlotWriteAllowed(loadConfig({}), 'VAIO1')).not.toThrow();
    expect(() => assertSlotWriteAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'false' }), 'VAIO1')).toThrow(
      /ALLOW_WRITES/
    );
    expect(() =>
      assertSlotWriteAllowed(
        loadConfig({
          VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'false',
          VBMATRIX_MCP_ALLOWED_SUIDS: 'VASIO8',
        }),
        'VAIO1'
      )
    ).toThrow(/not in VBMATRIX_MCP_ALLOWED_SUIDS/);
  });

  test('requires destructive slot confirmation and destructive gate', () => {
    expect(() => assertSlotDestructiveAllowed(loadConfig({}), 'VAIO1', true)).not.toThrow();
    expect(() => assertSlotDestructiveAllowed(loadConfig({}), 'VAIO1', false)).toThrow(/confirm=true/);
    expect(() =>
      assertSlotDestructiveAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'false' }), 'VAIO1', true)
    ).toThrow(/ALLOW_DESTRUCTIVE/);
  });

  test('applies write and destructive gates to channel resets', () => {
    expect(() => assertChannelWriteAllowed(loadConfig({}), channelTarget)).not.toThrow();
    expect(() => assertChannelResetAllowed(loadConfig({}), channelTarget)).not.toThrow();
    expect(() => assertChannelResetAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'false' }), channelTarget)).toThrow(
      /ALLOW_WRITES/
    );
    expect(() =>
      assertChannelResetAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'false' }), channelTarget)
    ).toThrow(/ALLOW_DESTRUCTIVE/);
  });

  test('applies write, SUID, and destructive gates to zone operations', () => {
    expect(() => assertZoneWriteAllowed(loadConfig({}), zoneTarget)).not.toThrow();
    expect(() => assertZoneResetAllowed(loadConfig({}), zoneTarget)).not.toThrow();
    expect(() => assertZoneWriteAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'false' }), zoneTarget)).toThrow(
      /ALLOW_WRITES/
    );
    expect(() =>
      assertZoneWriteAllowed(
        loadConfig({
          VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'false',
          VBMATRIX_MCP_ALLOWED_SUIDS: 'VASIO8',
        }),
        zoneTarget
      )
    ).toThrow(/not in VBMATRIX_MCP_ALLOWED_SUIDS/);
    expect(() => assertZoneResetAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'false' }), zoneTarget)).toThrow(
      /ALLOW_DESTRUCTIVE/
    );
  });
});
