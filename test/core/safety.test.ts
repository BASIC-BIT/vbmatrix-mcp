import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { assertDestructiveAllowed, assertPointWriteAllowed } from '../../src/core/safety.js';

const target = {
  inputSuid: 'VASIO8',
  inputChannel: 1,
  outputSuid: 'VASIO8',
  outputChannel: 1,
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
});
