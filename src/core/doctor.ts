import { loadConfig } from '../config/index.js';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorPackageMetadata {
  name?: string;
  version?: string;
  mcpName?: string;
  bin?: Record<string, string>;
  engines?: { node?: string };
}

export interface DoctorServerMetadata {
  name?: string;
  version?: string;
  packages?: { identifier?: string; version?: string }[];
}

export interface BuildArtifacts {
  serverEntry: boolean;
  cliEntry: boolean;
  doctorEntry: boolean;
}

export interface DoctorInputs {
  nodeVersion: string;
  packageJson: DoctorPackageMetadata;
  serverJson: DoctorServerMetadata;
  buildArtifacts: BuildArtifacts;
  env: Record<string, string | undefined>;
  vbanRequested: boolean;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

const DEFAULT_NODE_RANGE = '>=24.15.0';
const MCP_SERVER_NAME = 'io.github.BASIC-BIT/vbmatrix-mcp';

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(version: string, minimum: [number, number, number]): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  for (let i = 0; i < minimum.length; i += 1) {
    if (parsed[i] > minimum[i]) return true;
    if (parsed[i] < minimum[i]) return false;
  }
  return true;
}

function checkNodeVersion(nodeVersion: string, range = DEFAULT_NODE_RANGE): DoctorCheck {
  const minimum = parseVersion(range.replace(/^>=/, ''));
  if (!minimum) {
    return {
      id: 'node.version',
      status: 'warn',
      message: `Could not parse package Node engine range ${range}`,
    };
  }
  if (isAtLeast(nodeVersion, minimum)) {
    return { id: 'node.version', status: 'pass', message: `Node ${nodeVersion} satisfies ${range}` };
  }
  return { id: 'node.version', status: 'fail', message: `Node ${nodeVersion} does not satisfy ${range}` };
}

function checkBuildArtifacts(buildArtifacts: BuildArtifacts): DoctorCheck {
  const missing = Object.entries(buildArtifacts)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  if (missing.length === 0) {
    return {
      id: 'build.artifacts',
      status: 'pass',
      message: 'Build output exists for server, CLI, and doctor',
    };
  }
  return {
    id: 'build.artifacts',
    status: 'fail',
    message: `Missing build output: ${missing.join(', ')}. Run npm run build.`,
    details: { missing },
  };
}

function checkPackageMetadata(
  packageJson: DoctorPackageMetadata,
  serverJson: DoctorServerMetadata
): DoctorCheck {
  const serverPackage = serverJson.packages?.[0];
  const problems = [
    packageJson.mcpName === MCP_SERVER_NAME ? undefined : `package mcpName should be ${MCP_SERVER_NAME}`,
    serverJson.name === MCP_SERVER_NAME ? undefined : `server.json name should be ${MCP_SERVER_NAME}`,
    serverPackage?.identifier === packageJson.name
      ? undefined
      : 'server.json package identifier must match package name',
    serverJson.version === packageJson.version ? undefined : 'server.json version must match package version',
    serverPackage?.version === packageJson.version
      ? undefined
      : 'server.json package version must match package version',
    packageJson.bin?.['vbmatrix-mcp'] ? undefined : 'package bin must expose vbmatrix-mcp',
    packageJson.bin?.['vbmatrix-mcp-doctor'] ? undefined : 'package bin must expose vbmatrix-mcp-doctor',
  ].filter((problem): problem is string => Boolean(problem));

  if (problems.length === 0) {
    return {
      id: 'metadata.discovery',
      status: 'pass',
      message: 'package.json and server.json discovery metadata match',
    };
  }
  return { id: 'metadata.discovery', status: 'fail', message: problems.join('; '), details: { problems } };
}

function checkConfig(env: Record<string, string | undefined>): DoctorCheck {
  try {
    const config = loadConfig(env);
    const warnings = [
      config.streamName === 'Request Reply'
        ? 'VBMATRIX_STREAM should be the incoming command stream, not Matrix reply stream Request Reply'
        : undefined,
      !config.writes.allowAllSuids && config.writes.allowedSuids.length === 0
        ? 'VBMATRIX_MCP_ALLOW_ALL_SUIDS=false requires VBMATRIX_MCP_ALLOWED_SUIDS before writes can succeed'
        : undefined,
      config.writes.allow && config.writes.allowDestructive
        ? 'Writes and destructive tools are enabled; ensure the MCP client has approval controls'
        : undefined,
    ].filter((warning): warning is string => Boolean(warning));

    if (warnings.length > 0) {
      return {
        id: 'config.env',
        status: 'warn',
        message: warnings.join('; '),
        details: { connection: config },
      };
    }
    return {
      id: 'config.env',
      status: 'pass',
      message: 'Configuration environment parses successfully',
      details: { connection: config },
    };
  } catch (err) {
    return { id: 'config.env', status: 'fail', message: err instanceof Error ? err.message : String(err) };
  }
}

function checkVbanMode(vbanRequested: boolean): DoctorCheck {
  if (vbanRequested) {
    return {
      id: 'vban.mode',
      status: 'pass',
      message: 'VBAN query requested; doctor will run a read-only version query',
    };
  }
  return {
    id: 'vban.mode',
    status: 'skip',
    message: 'VBAN query skipped. Pass --vban or set VBMATRIX_DOCTOR_VBAN=1 to probe Matrix.',
  };
}

export function buildDoctorReport(inputs: DoctorInputs): DoctorReport {
  const checks = [
    checkNodeVersion(inputs.nodeVersion, inputs.packageJson.engines?.node),
    checkBuildArtifacts(inputs.buildArtifacts),
    checkPackageMetadata(inputs.packageJson, inputs.serverJson),
    checkConfig(inputs.env),
    checkVbanMode(inputs.vbanRequested),
  ];
  return { ok: checks.every((check) => check.status !== 'fail'), checks };
}
