import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 3000;
const MAX_HELPER_OUTPUT_BYTES = 64 * 1024;

export type VoicemeeterHelperOperation =
  | 'status'
  | 'devices'
  | 'get-parameters'
  | 'set-parameters'
  | 'get-levels'
  | 'raw-script'
  | 'macro-status'
  | 'macro-set';

export type VoicemeeterAvailability =
  | 'available'
  | 'not_running'
  | 'missing_install'
  | 'helper_not_configured'
  | 'helper_failed'
  | 'unsupported_platform'
  | 'unknown';

export interface VoicemeeterEditionMetadata {
  type: number;
  name: 'standard' | 'banana' | 'potato' | 'unknown';
  strips: number;
  buses: number;
}

export interface VoicemeeterHelperCommand {
  command: string;
  args: readonly string[];
  timeoutMs: number;
}

export interface VoicemeeterStatus {
  ok: boolean;
  availability: VoicemeeterAvailability;
  running: boolean;
  helper: {
    configured: boolean;
    command?: string;
    exitCode?: number | null;
    signal?: string | null;
  };
  edition?: VoicemeeterEditionMetadata;
  version?: string;
  error?: string;
  raw?: Record<string, unknown>;
}

export interface VoicemeeterHelperResponse {
  ok?: unknown;
  availability?: unknown;
  running?: unknown;
  type?: unknown;
  version?: unknown;
  error?: unknown;
}

export type RunVoicemeeterHelper = (command: VoicemeeterHelperCommand) => Promise<VoicemeeterStatus>;
export type RunVoicemeeterOperationHelper = (command: VoicemeeterHelperCommand) => Promise<Record<string, unknown>>;

export function voicemeeterEditionMetadata(type: number): VoicemeeterEditionMetadata {
  if (type === 1) return { type, name: 'standard', strips: 3, buses: 2 };
  if (type === 2) return { type, name: 'banana', strips: 5, buses: 5 };
  if (type === 3) return { type, name: 'potato', strips: 8, buses: 8 };
  return { type, name: 'unknown', strips: 0, buses: 0 };
}

export function voicemeeterHelperCommandFromEnv(
  env: Record<string, string | undefined> = process.env
): VoicemeeterHelperCommand | undefined {
  const command = env.VOICEMEETER_HELPER_COMMAND?.trim();
  if (!command) return undefined;

  const args = env.VOICEMEETER_HELPER_ARGS ? parseHelperArgs(env.VOICEMEETER_HELPER_ARGS) : [];
  const timeoutMs = parsePositiveInteger(env.VOICEMEETER_HELPER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  return { command, args, timeoutMs };
}

export function bundledVoicemeeterHelperCommand(
  operation: VoicemeeterHelperOperation = 'status',
  payload: Record<string, unknown> = {},
  env: Record<string, string | undefined> = process.env
): VoicemeeterHelperCommand | undefined {
  if (parseBoolean(env.VOICEMEETER_MCP_DISABLE_BUNDLED_HELPER, false)) return undefined;

  const scriptPath = bundledVoicemeeterHelperPath();
  if (!scriptPath) return undefined;

  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Operation', operation];
  if (Object.keys(payload).length > 0) args.push('-PayloadBase64', encodePayload(payload));
  const powershellCommand = env.VOICEMEETER_HELPER_POWERSHELL_COMMAND?.trim();
  return {
    command: powershellCommand && powershellCommand.length > 0 ? powershellCommand : 'powershell.exe',
    args,
    timeoutMs: parsePositiveInteger(env.VOICEMEETER_HELPER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

export function voicemeeterOperationCommand(
  operation: VoicemeeterHelperOperation,
  payload: Record<string, unknown> = {},
  env: Record<string, string | undefined> = process.env
): VoicemeeterHelperCommand | undefined {
  const envCommand = voicemeeterHelperCommandFromEnv(env);
  if (envCommand) {
    const args = [...envCommand.args, '--operation', operation];
    if (Object.keys(payload).length > 0) args.push('--payload-base64', encodePayload(payload));
    return { ...envCommand, args };
  }
  return bundledVoicemeeterHelperCommand(operation, payload, env);
}

export async function getVoicemeeterStatus(
  command?: VoicemeeterHelperCommand,
  runHelper: RunVoicemeeterHelper = runVoicemeeterHelper,
  platform: typeof process.platform = process.platform,
  env: Record<string, string | undefined> = process.env
): Promise<VoicemeeterStatus> {
  const envHelperConfigured = Boolean(env.VOICEMEETER_HELPER_COMMAND?.trim());
  if (platform !== 'win32') {
    return {
      ok: false,
      availability: 'unsupported_platform',
      running: false,
      helper: {
        configured: command !== undefined || envHelperConfigured,
        ...(command ? { command: command.command } : {}),
      },
      error: 'Voicemeeter Remote API discovery is Windows-only.',
    };
  }

  let resolvedCommand = command;
  if (!resolvedCommand) {
    try {
      resolvedCommand = voicemeeterHelperCommandFromEnv(env);
    } catch (err) {
      return {
        ok: false,
        availability: 'helper_failed',
        running: false,
        helper: { configured: envHelperConfigured },
        error: err instanceof Error ? err.message : 'Voicemeeter helper environment is invalid.',
      };
    }
  }

  if (!resolvedCommand && platform === process.platform) {
    try {
      resolvedCommand = bundledVoicemeeterHelperCommand('status', {}, env);
    } catch (err) {
      return {
        ok: false,
        availability: 'helper_failed',
        running: false,
        helper: { configured: envHelperConfigured },
        error: err instanceof Error ? err.message : 'Voicemeeter bundled helper environment is invalid.',
      };
    }
  }

  if (!resolvedCommand) {
    return {
      ok: false,
      availability: 'helper_not_configured',
      running: false,
      helper: { configured: false },
      error:
        'Set VOICEMEETER_HELPER_COMMAND to a read-only helper executable to enable Voicemeeter discovery.',
    };
  }

  return runHelper(resolvedCommand);
}

export async function runVoicemeeterOperation(
  operation: VoicemeeterHelperOperation,
  payload: Record<string, unknown> = {},
  command?: VoicemeeterHelperCommand,
  runHelper: RunVoicemeeterOperationHelper = runVoicemeeterOperationHelper,
  platform: typeof process.platform = process.platform,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  if (platform !== 'win32') {
    return {
      ok: false,
      availability: 'unsupported_platform',
      running: false,
      error: 'Voicemeeter Remote API operations are Windows-only.',
    };
  }

  const resolvedCommand = command ?? voicemeeterOperationCommand(operation, payload, env);
  if (!resolvedCommand) {
    return {
      ok: false,
      availability: 'helper_not_configured',
      running: false,
      error: 'No Voicemeeter helper is configured or bundled helper is unavailable.',
    };
  }

  return runHelper(resolvedCommand);
}

export async function runVoicemeeterOperationHelper(command: VoicemeeterHelperCommand): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const child = spawn(command.command, command.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let timeout: ReturnType<typeof setTimeout>;
    const failHelper = (error: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      resolve({ ok: false, availability: 'helper_failed', running: false, error });
    };

    timeout = setTimeout(() => {
      failHelper(`Voicemeeter helper timed out after ${command.timeoutMs}ms.`);
    }, command.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_HELPER_OUTPUT_BYTES) {
        failHelper(`Voicemeeter helper stdout exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`);
        return;
      }
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBytes += Buffer.byteLength(chunk, 'utf8');
      if (stderrBytes <= MAX_HELPER_OUTPUT_BYTES) stderr += chunk;
      process.stderr.write(chunk);
      if (stderrBytes > MAX_HELPER_OUTPUT_BYTES) {
        failHelper(`Voicemeeter helper stderr exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`);
      }
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, availability: 'helper_failed', running: false, error: err.message });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitCode !== 0) {
        resolve({
          ok: false,
          availability: classifyHelperFailure(stderr),
          running: false,
          helper: { configured: true, command: command.command, exitCode, signal },
          error: stderr.trim() || `Voicemeeter helper exited with code ${exitCode ?? 'unknown'}.`,
        });
        return;
      }

      const text = stdout.trim();
      if (!text) {
        resolve({
          ok: false,
          availability: 'helper_failed',
          running: false,
          helper: { configured: true, command: command.command, exitCode, signal },
          error: 'Voicemeeter helper returned no JSON on stdout.',
        });
        return;
      }

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        resolve({ ...parsed, helper: { configured: true, command: command.command, exitCode, signal } });
      } catch (err) {
        resolve({
          ok: false,
          availability: 'helper_failed',
          running: false,
          helper: { configured: true, command: command.command, exitCode, signal },
          error: err instanceof Error ? err.message : 'Voicemeeter helper returned invalid JSON.',
        });
      }
    });
  });
}

export async function runVoicemeeterHelper(command: VoicemeeterHelperCommand): Promise<VoicemeeterStatus> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const child = spawn(command.command, command.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let timeout: ReturnType<typeof setTimeout>;
    const failHelper = (error: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      resolve({
        ok: false,
        availability: 'helper_failed',
        running: false,
        helper: { configured: true, command: command.command },
        error,
      });
    };

    timeout = setTimeout(() => {
      failHelper(`Voicemeeter helper timed out after ${command.timeoutMs}ms.`);
    }, command.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_HELPER_OUTPUT_BYTES) {
        failHelper(`Voicemeeter helper stdout exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`);
        return;
      }
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBytes += Buffer.byteLength(chunk, 'utf8');
      if (stderrBytes <= MAX_HELPER_OUTPUT_BYTES) stderr += chunk;
      process.stderr.write(chunk);
      if (stderrBytes > MAX_HELPER_OUTPUT_BYTES) {
        failHelper(`Voicemeeter helper stderr exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`);
      }
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        availability: 'helper_failed',
        running: false,
        helper: { configured: true, command: command.command },
        error: err.message,
      });
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitCode !== 0) {
        resolve({
          ok: false,
          availability: classifyHelperFailure(stderr),
          running: false,
          helper: { configured: true, command: command.command, exitCode, signal },
          error: stderr.trim() || `Voicemeeter helper exited with code ${exitCode ?? 'unknown'}.`,
        });
        return;
      }
      resolve(parseVoicemeeterHelperResponse(stdout, command.command, exitCode, signal));
    });
  });
}

export function parseVoicemeeterHelperResponse(
  stdout: string,
  command: string,
  exitCode: number | null,
  signal: string | null
): VoicemeeterStatus {
  const text = stdout.trim();
  if (!text) {
    return {
      ok: false,
      availability: 'helper_failed',
      running: false,
      helper: { configured: true, command, exitCode, signal },
      error: 'Voicemeeter helper returned no JSON on stdout.',
    };
  }

  let parsed: VoicemeeterHelperResponse;
  try {
    parsed = JSON.parse(text) as VoicemeeterHelperResponse;
  } catch (err) {
    return {
      ok: false,
      availability: 'helper_failed',
      running: false,
      helper: { configured: true, command, exitCode, signal },
      error: err instanceof Error ? err.message : 'Voicemeeter helper returned invalid JSON.',
    };
  }

  const availability = parseAvailability(parsed.availability, parsed.running);
  const running = typeof parsed.running === 'boolean' ? parsed.running : availability === 'available';
  const type = typeof parsed.type === 'number' ? parsed.type : undefined;
  return {
    ok: parsed.ok === true && availability === 'available',
    availability,
    running,
    helper: { configured: true, command, exitCode, signal },
    ...(type === undefined ? {} : { edition: voicemeeterEditionMetadata(type) }),
    ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
    ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
    raw: parsed as Record<string, unknown>,
  };
}

function parseHelperArgs(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('VOICEMEETER_HELPER_ARGS must be a JSON array of strings.');
  }
  return parsed;
}

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function bundledVoicemeeterHelperPath(): string | undefined {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '..', '..', 'helpers', 'voicemeeter-remote-helper.ps1'),
    path.resolve(currentDir, '..', '..', '..', 'helpers', 'voicemeeter-remote-helper.ps1'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('Boolean environment values must be true or false');
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAvailability(availability: unknown, running: unknown): VoicemeeterAvailability {
  if (
    availability === 'available' ||
    availability === 'not_running' ||
    availability === 'missing_install' ||
    availability === 'helper_failed' ||
    availability === 'unsupported_platform' ||
    availability === 'unknown'
  ) {
    return availability;
  }
  if (running === true) return 'available';
  if (running === false) return 'not_running';
  return 'unknown';
}

function classifyHelperFailure(stderr: string): VoicemeeterAvailability {
  const normalized = stderr.toLowerCase();
  if (normalized.includes('missing') || normalized.includes('not installed') || normalized.includes('dll')) {
    return 'missing_install';
  }
  if (normalized.includes('not running') || normalized.includes('login')) return 'not_running';
  return 'helper_failed';
}
