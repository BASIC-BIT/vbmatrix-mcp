#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { commandPropertyQuery, parseQueryResponseValue } from '../src/core/commands.js';
import { VbMatrixClient } from '../src/core/client.js';
import {
  buildDoctorReport,
  type DoctorCheck,
  type DoctorPackageMetadata,
  type DoctorServerMetadata,
} from '../src/core/doctor.js';
import { VbanTextTimeoutError } from '../src/core/vbanText.js';

interface DoctorArgs {
  json: boolean;
  vban: boolean;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function findProjectRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 4; depth += 1) {
    if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'server.json')))
      return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not find project root from ${start}`);
}

function parseArgs(argv: string[]): DoctorArgs {
  return {
    json: argv.includes('--json'),
    vban: argv.includes('--vban') || process.env.VBMATRIX_DOCTOR_VBAN === '1',
  };
}

async function runVbanCheck(): Promise<DoctorCheck> {
  const config = loadConfig();
  const client = new VbMatrixClient(config);
  const command = commandPropertyQuery('Version');
  try {
    const result = await client.queryWithDiagnostics(command);
    return {
      id: 'vban.query',
      status: 'pass',
      message: `VBAN read-only version query succeeded: ${parseQueryResponseValue(command, result.response ?? '')}`,
      details: { command, diagnostics: result.diagnostics },
    };
  } catch (err) {
    return {
      id: 'vban.query',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      details: err instanceof VbanTextTimeoutError ? { diagnostics: err.diagnostics } : undefined,
    };
  }
}

function printText(checks: DoctorCheck[]): void {
  for (const check of checks) {
    console.log(`[${check.status.toUpperCase()}] ${check.id}: ${check.message}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = findProjectRoot(import.meta.dirname);
  const report = buildDoctorReport({
    nodeVersion: process.version,
    packageJson: readJson<DoctorPackageMetadata>(resolve(root, 'package.json')),
    serverJson: readJson<DoctorServerMetadata>(resolve(root, 'server.json')),
    buildArtifacts: {
      serverEntry: existsSync(resolve(root, 'dist/src/index.js')),
      cliEntry: existsSync(resolve(root, 'dist/bin/cli.js')),
      doctorEntry: existsSync(resolve(root, 'dist/scripts/doctor.js')),
    },
    env: process.env,
    vbanRequested: args.vban,
  });

  if (args.vban) {
    report.checks.push(await runVbanCheck());
  }
  report.ok = report.checks.every((check) => check.status !== 'fail');

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report.checks);
  }

  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
