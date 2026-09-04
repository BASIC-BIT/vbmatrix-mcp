export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface VbMatrixConfig {
  host: string;
  port: number;
  streamName: string;
  timeoutMs: number;
  logLevel: LogLevel;
  writes: {
    allow: boolean;
    allowAllSuids: boolean;
    allowedSuids: string[];
    allowDestructive: boolean;
  };
  rawCommands: {
    disabled: boolean;
  };
  matrixFiles?: {
    presetPatchRoots: string[];
    projectRoots: string[];
    gridRoots: string[];
    savedSettingsRoots?: string[];
    savedSettingsMaxBytes?: number;
  };
}

export interface VoicemeeterVbanTextConfig {
  host: string;
  port: number;
  streamName: string;
  timeoutMs: number;
  rawVbanText: {
    disabled: boolean;
  };
}

type Env = Record<string, string | undefined>;

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6980;
const DEFAULT_VOICEMEETER_VBAN_PORT = 6982;
const DEFAULT_STREAM_NAME = 'Command1';
const DEFAULT_TIMEOUT_MS = 2000;

function readString(env: Env, key: string, defaultValue: string): string {
  const value = env[key]?.trim();
  if (!value) return defaultValue;
  return value;
}

function readInteger(
  env: Env,
  key: string,
  defaultValue: number,
  options: { min: number; max: number }
): number {
  const raw = env[key]?.trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    throw new Error(`${key} must be an integer from ${options.min} to ${options.max}`);
  }
  return value;
}

function readBoolean(env: Env, key: string, defaultValue: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${key} must be a boolean value`);
}

function readLogLevel(env: Env): LogLevel {
  const raw = readString(env, 'VBMATRIX_MCP_LOG_LEVEL', 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  throw new Error('VBMATRIX_MCP_LOG_LEVEL must be debug, info, warn, or error');
}

function readSuidList(env: Env): string[] {
  const raw = env.VBMATRIX_MCP_ALLOWED_SUIDS?.trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ];
}

function readPathList(env: Env, key: string): string[] {
  const raw = env[key]?.trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ];
}

export function loadConfig(env: Env = process.env): VbMatrixConfig {
  return {
    host: readString(env, 'VBMATRIX_HOST', DEFAULT_HOST),
    port: readInteger(env, 'VBMATRIX_PORT', DEFAULT_PORT, { min: 1, max: 65535 }),
    streamName: readString(env, 'VBMATRIX_STREAM', DEFAULT_STREAM_NAME),
    timeoutMs: readInteger(env, 'VBMATRIX_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, { min: 100, max: 30000 }),
    logLevel: readLogLevel(env),
    writes: {
      allow: readBoolean(env, 'VBMATRIX_MCP_ALLOW_WRITES', true),
      allowAllSuids: readBoolean(env, 'VBMATRIX_MCP_ALLOW_ALL_SUIDS', true),
      allowedSuids: readSuidList(env),
      allowDestructive: readBoolean(env, 'VBMATRIX_MCP_ALLOW_DESTRUCTIVE', true),
    },
    rawCommands: {
      disabled: readBoolean(env, 'VBMATRIX_MCP_DISABLE_RAW_COMMANDS', false),
    },
    matrixFiles: {
      presetPatchRoots: readPathList(env, 'VBMATRIX_MCP_PRESET_PATCH_ROOTS'),
      projectRoots: readPathList(env, 'VBMATRIX_MCP_PROJECT_ROOTS'),
      gridRoots: readPathList(env, 'VBMATRIX_MCP_GRID_ROOTS'),
      savedSettingsRoots: readPathList(env, 'VBMATRIX_MCP_SAVED_SETTINGS_ROOTS'),
      savedSettingsMaxBytes: readInteger(env, 'VBMATRIX_MCP_SAVED_SETTINGS_MAX_BYTES', 8 * 1024 * 1024, {
        min: 1_024,
        max: 64 * 1024 * 1024,
      }),
    },
  };
}

export function getConfig(): VbMatrixConfig {
  return loadConfig();
}

export function loadVoicemeeterVbanTextConfig(env: Env = process.env): VoicemeeterVbanTextConfig {
  return {
    host: readString(env, 'VOICEMEETER_VBAN_HOST', DEFAULT_HOST),
    port: readInteger(env, 'VOICEMEETER_VBAN_PORT', DEFAULT_VOICEMEETER_VBAN_PORT, { min: 1, max: 65535 }),
    streamName: readString(env, 'VOICEMEETER_VBAN_STREAM', DEFAULT_STREAM_NAME),
    timeoutMs: readInteger(env, 'VOICEMEETER_VBAN_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, { min: 100, max: 30000 }),
    rawVbanText: {
      disabled: readBoolean(env, 'VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT', false),
    },
  };
}
