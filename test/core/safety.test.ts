import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import {
  assertChannelResetAllowed,
  assertChannelWriteAllowed,
  assertDestructiveAllowed,
  assertPointWriteAllowed,
  assertPresetPatchDestructiveAllowed,
  assertPresetPatchWriteAllowed,
  assertRawVbanTextAllowed,
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
  test('rejects invalid safety env booleans before enabling write gates', () => {
    expect(() => loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'maybe' })).toThrow(
      /VBMATRIX_MCP_ALLOW_WRITES must be a boolean value/
    );
    expect(() => loadConfig({ VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'maybe' })).toThrow(
      /VBMATRIX_MCP_ALLOW_ALL_SUIDS must be a boolean value/
    );
    expect(() => loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'maybe' })).toThrow(
      /VBMATRIX_MCP_ALLOW_DESTRUCTIVE must be a boolean value/
    );
    expect(() => loadConfig({ VBMATRIX_MCP_DISABLE_RAW_COMMANDS: 'maybe' })).toThrow(
      /VBMATRIX_MCP_DISABLE_RAW_COMMANDS must be a boolean value/
    );
  });

  test('trims and deduplicates the SUID allowlist used for write gates', () => {
    const config = loadConfig({
      VBMATRIX_MCP_ALLOW_ALL_SUIDS: 'false',
      VBMATRIX_MCP_ALLOWED_SUIDS: ' VASIO8, VAIO1, VASIO8, , ',
    });

    expect(config.writes.allowedSuids).toEqual(['VASIO8', 'VAIO1']);
    expect(() => assertPointWriteAllowed(config, target)).not.toThrow();
  });

  test('trims and deduplicates Matrix file roots from semicolon-separated env values', () => {
    const config = loadConfig({
      VBMATRIX_MCP_PRESET_PATCH_ROOTS: ' C:\\PresetPatch ; D:\\Scenes ; C:\\PresetPatch ; ',
    });

    expect(config.matrixFiles?.presetPatchRoots).toEqual(['C:\\PresetPatch', 'D:\\Scenes']);
  });

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

  test('allows raw VBAN-TEXT by default but supports opt-out', () => {
    expect(() => assertRawVbanTextAllowed(loadConfig({}))).not.toThrow();
    expect(() => assertRawVbanTextAllowed(loadConfig({ VBMATRIX_MCP_DISABLE_RAW_COMMANDS: 'true' }))).toThrow(
      /DISABLE_RAW_COMMANDS/
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

  test('applies write and destructive gates to preset patch operations', () => {
    expect(() => assertPresetPatchWriteAllowed(loadConfig({}), 1)).not.toThrow();
    expect(() => assertPresetPatchDestructiveAllowed(loadConfig({}), 1)).not.toThrow();
    expect(() => assertPresetPatchWriteAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_WRITES: 'false' }), 1)).toThrow(
      /ALLOW_WRITES/
    );
    expect(() =>
      assertPresetPatchDestructiveAllowed(loadConfig({ VBMATRIX_MCP_ALLOW_DESTRUCTIVE: 'false' }), 1)
    ).toThrow(/ALLOW_DESTRUCTIVE/);
    expect(() => assertPresetPatchWriteAllowed(loadConfig({}), 0)).toThrow(/1-based/);
  });
});
