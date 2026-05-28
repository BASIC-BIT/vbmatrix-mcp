import { describe, expect, test } from 'vitest';
import { buildDoctorReport, type DoctorInputs } from '../../src/core/doctor.js';

function baseInputs(overrides: Partial<DoctorInputs> = {}): DoctorInputs {
  return {
    nodeVersion: 'v24.15.0',
    packageJson: {
      name: '@basicbit/vb-audio-mcp',
      version: '0.1.0',
      mcpName: 'io.github.BASIC-BIT/vb-audio-mcp',
      bin: {
        'vb-audio-mcp': 'dist/bin/cli.js',
        'vb-audio-mcp-doctor': 'dist/scripts/doctor.js',
      },
      engines: { node: '>=24.15.0' },
    },
    serverJson: {
      name: 'io.github.BASIC-BIT/vb-audio-mcp',
      version: '0.1.0',
      packages: [{ identifier: '@basicbit/vb-audio-mcp', version: '0.1.0' }],
    },
    buildArtifacts: { serverEntry: true, cliEntry: true, doctorEntry: true },
    env: {},
    vbanRequested: false,
    ...overrides,
  };
}

describe('doctor report', () => {
  test('passes static checks and skips VBAN by default', () => {
    const report = buildDoctorReport(baseInputs());
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ['node.version', 'pass'],
      ['build.artifacts', 'pass'],
      ['metadata.discovery', 'pass'],
      ['config.env', 'warn'],
      ['vban.mode', 'skip'],
    ]);
  });

  test('fails on old Node or missing build output', () => {
    const report = buildDoctorReport(
      baseInputs({
        nodeVersion: 'v22.0.0',
        buildArtifacts: { serverEntry: true, cliEntry: false, doctorEntry: false },
      })
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'node.version')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'build.artifacts')?.details).toEqual({
      missing: ['cliEntry', 'doctorEntry'],
    });
  });

  test('fails when package and server discovery metadata diverge', () => {
    const report = buildDoctorReport(
      baseInputs({
        serverJson: {
          name: 'wrong',
          version: '0.1.0',
          packages: [{ identifier: 'wrong', version: '0.1.0' }],
        },
      })
    );
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'metadata.discovery')?.message).toContain(
      'server.json name'
    );
  });

  test('reports invalid environment values', () => {
    const report = buildDoctorReport(baseInputs({ env: { VBMATRIX_PORT: 'not-a-port' } }));
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'config.env')?.message).toContain('VBMATRIX_PORT');
  });
});
