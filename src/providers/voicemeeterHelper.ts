import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 3000;
const MAX_HELPER_OUTPUT_BYTES = 64 * 1024;

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
