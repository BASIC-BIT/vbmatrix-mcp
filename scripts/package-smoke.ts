#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PackageJson {
  bin?: Record<string, string>;
  files?: string[];
  main?: string;
  name?: string;
  version?: string;
}

interface NpmPackFile {
  path: string;
}

interface NpmPackResult {
  files?: NpmPackFile[];
  name?: string;
  version?: string;
}

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as PackageJson;

function fail(message: string): never {
  console.error(`[package-smoke] ${message}`);
  process.exit(1);
}

function expectFile(path: string): void {
  if (!existsSync(resolve(root, path))) fail(`Missing expected build artifact: ${path}`);
}

function expectPackageFile(paths: Set<string>, path: string): void {
  if (!paths.has(path)) fail(`npm pack dry-run omitted ${path}`);
}

if (packageJson.main !== 'dist/src/index.js') fail('package main must point at dist/src/index.js');
if (packageJson.bin?.['vbmatrix-mcp'] !== 'dist/bin/cli.js')
  fail('vbmatrix-mcp bin must point at dist/bin/cli.js');
if (packageJson.bin?.['vbmatrix-mcp-doctor'] !== 'dist/scripts/doctor.js') {
  fail('vbmatrix-mcp-doctor bin must point at dist/scripts/doctor.js');
}

expectFile('dist/src/index.js');
expectFile('dist/bin/cli.js');
expectFile('dist/scripts/doctor.js');

const cliEntry = readFileSync(resolve(root, 'dist/bin/cli.js'), 'utf8');
if (!cliEntry.startsWith('#!/usr/bin/env node')) fail('dist/bin/cli.js must keep its node shebang');
if (!/import ['"]\.\.\/src\/index\.js['"];/.test(cliEntry))
  fail('dist/bin/cli.js must import the MCP server entry point');

const npmExecPath = process.env.npm_execpath;
const packJson = npmExecPath
  ? execFileSync(process.execPath, [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
  : execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
let packResults: NpmPackResult[];
try {
  packResults = JSON.parse(packJson) as NpmPackResult[];
} catch {
  fail(`npm pack --dry-run --json produced non-JSON output:\n${packJson}`);
}
const packResult = packResults[0];
if (!packResult) fail('npm pack dry-run returned no package metadata');
if (packResult.name !== packageJson.name || packResult.version !== packageJson.version) {
  fail('npm pack dry-run metadata does not match package.json name/version');
}

const packedPaths = new Set((packResult.files ?? []).map((file) => file.path));
for (const path of [
  'dist/src/index.js',
  'dist/bin/cli.js',
  'dist/scripts/doctor.js',
  'README.md',
  'CHANGELOG.md',
  'server.json',
  'docs/release.md',
  'docs/client-config.md',
]) {
  expectPackageFile(packedPaths, path);
}

console.error(
  `[package-smoke] ${packageJson.name}@${packageJson.version} package dry-run includes required entries`
);
