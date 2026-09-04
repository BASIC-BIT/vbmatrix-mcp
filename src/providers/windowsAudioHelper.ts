import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_HELPER_OUTPUT_BYTES = 512 * 1024;
const MAX_HELPER_INPUT_BYTES = 64 * 1024;

export type WindowsAudioHelperOperation = 'status' | 'endpoints' | 'defaults';

export type WindowsAudioAvailability =
  | 'available'
  | 'partial'
  | 'unsupported_platform'
  | 'helper_not_configured'
  | 'helper_failed';

export interface WindowsAudioHelperCommand {
  command: string;
  args: readonly string[];
  timeoutMs: number;
  kind: 'bundled' | 'custom';
  request: WindowsAudioHelperRequest;
}

export interface WindowsAudioHelperRequest {
  protocolVersion: 1;
  requestId: string;
  operation: WindowsAudioHelperOperation;
  payload: Record<string, unknown>;
}

export type RunWindowsAudioHelper = (command: WindowsAudioHelperCommand) => Promise<Record<string, unknown>>;

function parseHelperArgs(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('WINDOWS_AUDIO_HELPER_ARGS must be a JSON array of strings.');
  }
  return parsed;
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

function helperRequest(
  operation: WindowsAudioHelperOperation,
  payload: Record<string, unknown>
): WindowsAudioHelperRequest {
  return { protocolVersion: 1, requestId: randomUUID(), operation, payload };
}

function bundledWindowsAudioHelperPath(): string | undefined {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '..', '..', 'helpers', 'windows-audio-helper.ps1'),
    path.resolve(currentDir, '..', '..', '..', 'helpers', 'windows-audio-helper.ps1'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export function customWindowsAudioHelperCommand(
  operation: WindowsAudioHelperOperation,
  payload: Record<string, unknown> = {},
  env: Record<string, string | undefined> = process.env
): WindowsAudioHelperCommand | undefined {
  const command = env.WINDOWS_AUDIO_HELPER_COMMAND?.trim();
  if (!command) return undefined;
  return {
    command,
    args: env.WINDOWS_AUDIO_HELPER_ARGS ? parseHelperArgs(env.WINDOWS_AUDIO_HELPER_ARGS) : [],
    timeoutMs: parsePositiveInteger(env.WINDOWS_AUDIO_HELPER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    kind: 'custom',
    request: helperRequest(operation, payload),
  };
}

export function bundledWindowsAudioHelperCommand(
  operation: WindowsAudioHelperOperation,
  payload: Record<string, unknown> = {},
  env: Record<string, string | undefined> = process.env
): WindowsAudioHelperCommand | undefined {
  if (parseBoolean(env.WINDOWS_AUDIO_MCP_DISABLE_BUNDLED_HELPER, false)) return undefined;
  const scriptPath = bundledWindowsAudioHelperPath();
  if (!scriptPath) return undefined;
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
  const powershellCommand = env.WINDOWS_AUDIO_HELPER_POWERSHELL_COMMAND?.trim();
  return {
    command: powershellCommand && powershellCommand.length > 0 ? powershellCommand : 'powershell.exe',
    args,
    timeoutMs: parsePositiveInteger(env.WINDOWS_AUDIO_HELPER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    kind: 'bundled',
    request: helperRequest(operation, payload),
  };
}

export function windowsAudioOperationCommand(
  operation: WindowsAudioHelperOperation,
  payload: Record<string, unknown> = {},
  env: Record<string, string | undefined> = process.env
): WindowsAudioHelperCommand | undefined {
  const custom = customWindowsAudioHelperCommand(operation, payload, env);
  if (custom) return custom;
  return bundledWindowsAudioHelperCommand(operation, payload, env);
}

function helperMetadata(
  command: WindowsAudioHelperCommand,
  exitCode?: number | null,
  signal?: string | null
) {
  return {
    configured: true,
    kind: command.kind,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(signal === undefined ? {} : { signal }),
  };
}

function helperFailure(
  command: WindowsAudioHelperCommand,
  code: string,
  error: string,
  exitCode?: number | null,
  signal?: string | null
): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId: command.request.requestId,
    ok: false,
    availability: 'helper_failed' satisfies WindowsAudioAvailability,
    code,
    error,
    helper: helperMetadata(command, exitCode, signal),
  };
}

function parseHelperResponse(
  stdout: string,
  command: WindowsAudioHelperCommand,
  exitCode: number | null,
  signal: string | null
): Record<string, unknown> {
  const text = stdout.trim();
  if (!text) {
    return helperFailure(
      command,
      'windows_audio_helper_empty_output',
      'Windows audio helper returned no JSON on stdout.',
      exitCode,
      signal
    );
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return helperFailure(
        command,
        'windows_audio_helper_invalid_json',
        'Windows audio helper response must be a JSON object.',
        exitCode,
        signal
      );
    }
    const response = parsed as Record<string, unknown>;
    if (
      response.protocolVersion !== command.request.protocolVersion ||
      response.requestId !== command.request.requestId
    ) {
      return helperFailure(
        command,
        'windows_audio_helper_response_mismatch',
        'Windows audio helper response did not match the request protocol version and request ID.',
        exitCode,
        signal
      );
    }
    return {
      ...response,
      helper: helperMetadata(command, exitCode, signal),
    };
  } catch {
    return helperFailure(
      command,
      'windows_audio_helper_invalid_json',
      'Windows audio helper returned invalid JSON.',
      exitCode,
      signal
    );
  }
}

export async function runWindowsAudioHelper(
  command: WindowsAudioHelperCommand
): Promise<Record<string, unknown>> {
  const requestLine = `${JSON.stringify(command.request)}\n`;
  if (Buffer.byteLength(requestLine, 'utf8') > MAX_HELPER_INPUT_BYTES) {
    return helperFailure(
      command,
      'windows_audio_helper_input_too_large',
      `Windows audio helper request exceeded ${MAX_HELPER_INPUT_BYTES} bytes.`
    );
  }
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(command.command, command.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    return helperFailure(
      command,
      'windows_audio_helper_unavailable',
      `Unable to start Windows audio helper: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const fail = (code: string, error: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      resolve(helperFailure(command, code, error));
    };

    timeout = setTimeout(() => {
      fail('windows_audio_helper_timeout', `Windows audio helper timed out after ${command.timeoutMs}ms.`);
    }, command.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk, 'utf8');
      if (stdoutBytes > MAX_HELPER_OUTPUT_BYTES) {
        fail(
          'windows_audio_helper_output_too_large',
          `Windows audio helper stdout exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`
        );
        return;
      }
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBytes += Buffer.byteLength(chunk, 'utf8');
      if (stderrBytes <= MAX_HELPER_OUTPUT_BYTES) stderr += chunk;
      if (stderrBytes > MAX_HELPER_OUTPUT_BYTES) {
        fail(
          'windows_audio_helper_output_too_large',
          `Windows audio helper stderr exceeded ${MAX_HELPER_OUTPUT_BYTES} bytes.`
        );
      }
    });
    child.on('error', (error) => {
      fail('windows_audio_helper_unavailable', `Unable to start Windows audio helper: ${error.message}`);
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitCode !== 0) {
        resolve(
          helperFailure(
            command,
            'windows_audio_helper_exit',
            stderr.trim() || `Windows audio helper exited with code ${exitCode ?? 'unknown'}.`,
            exitCode,
            signal
          )
        );
        return;
      }
      resolve(parseHelperResponse(stdout, command, exitCode, signal));
    });
    child.stdin?.on('error', (error) => {
      fail('windows_audio_helper_stdin_failed', `Unable to send Windows audio request: ${error.message}`);
    });
    child.stdin?.end(requestLine, 'utf8');
  });
}

export async function runWindowsAudioOperation(
  operation: WindowsAudioHelperOperation,
  payload: Record<string, unknown> = {},
  command?: WindowsAudioHelperCommand,
  runHelper: RunWindowsAudioHelper = runWindowsAudioHelper,
  platform: typeof process.platform = process.platform,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  if (platform !== 'win32') {
    return {
      ok: false,
      availability: 'unsupported_platform' satisfies WindowsAudioAvailability,
      code: 'windows_audio_unsupported_platform',
      error: 'Windows Core Audio inspection is available only on Windows.',
      helper: { configured: Boolean(command ?? env.WINDOWS_AUDIO_HELPER_COMMAND?.trim()) },
    };
  }

  let resolvedCommand: WindowsAudioHelperCommand | undefined;
  try {
    resolvedCommand = command ?? windowsAudioOperationCommand(operation, payload, env);
  } catch (error) {
    return {
      ok: false,
      availability: 'helper_failed' satisfies WindowsAudioAvailability,
      code: 'windows_audio_helper_configuration_invalid',
      error: error instanceof Error ? error.message : 'Windows audio helper configuration is invalid.',
      helper: { configured: Boolean(command ?? env.WINDOWS_AUDIO_HELPER_COMMAND?.trim()) },
    };
  }

  if (!resolvedCommand) {
    return {
      ok: false,
      availability: 'helper_not_configured' satisfies WindowsAudioAvailability,
      code: 'windows_audio_helper_not_configured',
      error: 'No Windows audio helper is configured or the bundled helper is disabled.',
      helper: { configured: false },
    };
  }
  return runHelper(resolvedCommand);
}
