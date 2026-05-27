import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadVoicemeeterVbanTextConfig, type VoicemeeterVbanTextConfig } from '../config/index.js';
import { assertVoicemeeterRawVbanTextAllowed } from '../core/safety.js';
import {
  sendVbanTextCommand,
  sendVbanTextCommandWithDiagnostics,
  VbanTextTimeoutError,
  type SendVbanTextDiagnosticsResult,
  type SendVbanTextOptions,
} from '../core/vbanText.js';
import { destructiveToolAnnotations, readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';

const VOICEMEETER_VBAN_DIAGNOSTIC_QUERY = 'Strip[0].Gain=?;';

const RawVoicemeeterVbanTextSchema = z.object({
  command: z
    .string()
    .min(1)
    .max(48 * 1024)
    .describe(
      'Exact Voicemeeter VBAN-TEXT command to send. Prefer typed voicemeeter_* tools when one exists.'
    ),
  waitForResponse: z
    .boolean()
    .optional()
    .describe(
      'When omitted, commands whose last non-whitespace character is ? are treated as queries and wait for a reply; all others fire-and-forget. Set explicitly to override the heuristic, e.g. for multi-statement commands or labels containing ?.'
    ),
});

type SendVbanText = (command: string, options: SendVbanTextOptions) => Promise<string | null>;
type SendVbanTextWithDiagnostics = (
  command: string,
  options: SendVbanTextOptions
) => Promise<SendVbanTextDiagnosticsResult>;

function shouldWaitForResponse(command: string): boolean {
  return /\?\s*;?\s*$/.test(command);
}

function rawPolicyDetails(config: VoicemeeterVbanTextConfig): Record<string, unknown> {
  return {
    disableRawVbanText: config.rawVbanText.disabled,
    preferTypedTools: true,
    queryReplyBehavior: 'unverified_for_voicemeeter',
  };
}

function connectionDetails(config: VoicemeeterVbanTextConfig): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    streamName: config.streamName,
    timeoutMs: config.timeoutMs,
  };
}

function voicemeeterTimeoutMessage(command: string, config: VoicemeeterVbanTextConfig): string {
  return `Timed out waiting for Voicemeeter VBAN-TEXT response to ${command}. Check Voicemeeter VBAN service, incoming TEXT stream '${config.streamName}', UDP ${config.host}:${config.port}, and whether this Voicemeeter edition replies to VBAN-TEXT queries.`;
}

function voicemeeterDiagnosticOptions(config: VoicemeeterVbanTextConfig): SendVbanTextOptions {
  return {
    host: config.host,
    port: config.port,
    streamName: config.streamName,
    timeoutMs: config.timeoutMs,
    waitForResponse: true,
    replyProductName: 'Voicemeeter',
  };
}

export async function runVoicemeeterVbanDiagnostics(
  config: VoicemeeterVbanTextConfig = loadVoicemeeterVbanTextConfig(),
  sendCommand: SendVbanTextWithDiagnostics = sendVbanTextCommandWithDiagnostics
): Promise<Record<string, unknown>> {
  assertVoicemeeterRawVbanTextAllowed(config);

  try {
    const result = await sendCommand(VOICEMEETER_VBAN_DIAGNOSTIC_QUERY, voicemeeterDiagnosticOptions(config));
    return {
      ok: true,
      command: VOICEMEETER_VBAN_DIAGNOSTIC_QUERY,
      response: result.response?.trim() ?? null,
      timedOut: false,
      queryReplyBehavior: 'unverified_for_voicemeeter',
      diagnostics: result.diagnostics,
      connection: connectionDetails(config),
    };
  } catch (err) {
    if (err instanceof VbanTextTimeoutError) {
      return {
        ok: false,
        command: VOICEMEETER_VBAN_DIAGNOSTIC_QUERY,
        response: null,
        timedOut: true,
        error: voicemeeterTimeoutMessage(VOICEMEETER_VBAN_DIAGNOSTIC_QUERY, config),
        queryReplyBehavior: 'unverified_for_voicemeeter',
        diagnostics: err.diagnostics,
        connection: connectionDetails(config),
        likelyFixes: [
          'Confirm Voicemeeter is running and VBAN service is ON.',
          `Confirm the incoming TEXT command stream is enabled and named '${config.streamName}'.`,
          `Confirm UDP host/port ${config.host}:${config.port} is reachable and not blocked by firewall policy.`,
          "Capture whether replies arrive as TEXT on the command stream, SERVICE on 'Request Reply', another stream/protocol, or no packets.",
        ],
      };
    }

    throw err;
  }
}

export async function runRawVoicemeeterVbanText(
  input: { command: string; waitForResponse?: boolean },
  config: VoicemeeterVbanTextConfig = loadVoicemeeterVbanTextConfig(),
  sendCommand: SendVbanText = sendVbanTextCommand
): Promise<Record<string, unknown>> {
  assertVoicemeeterRawVbanTextAllowed(config);

  const waitForResponse = input.waitForResponse ?? shouldWaitForResponse(input.command);
  const options = {
    host: config.host,
    port: config.port,
    streamName: config.streamName,
    timeoutMs: config.timeoutMs,
    waitForResponse,
    replyProductName: 'Voicemeeter',
  };
  try {
    const response = await sendCommand(input.command, options);
    const timedOut = waitForResponse && response === null;
    return {
      ok: !timedOut,
      command: input.command,
      waitForResponse,
      response: response?.trim() ?? null,
      timedOut,
      rawPolicy: rawPolicyDetails(config),
      connection: connectionDetails(config),
    };
  } catch (err) {
    if (err instanceof VbanTextTimeoutError && waitForResponse) {
      return {
        ok: false,
        command: input.command,
        waitForResponse,
        response: null,
        timedOut: true,
        error: voicemeeterTimeoutMessage(input.command, config),
        diagnostics: err.diagnostics,
        rawPolicy: rawPolicyDetails(config),
        connection: connectionDetails(config),
      };
    }

    throw err;
  }
}

export function registerVoicemeeterVbanTextTools(server: McpServer): void {
  server.registerTool(
    'voicemeeter_vban_diagnostics',
    {
      description:
        'Read-only Voicemeeter VBAN-TEXT diagnostics using a fixed Strip[0].Gain query. Reports packet classification evidence for query/reply behavior; does not expose arbitrary command input.',
      inputSchema: z.object({}),
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      try {
        return jsonResponse(await runVoicemeeterVbanDiagnostics());
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown Voicemeeter VBAN diagnostics error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_raw_vban_text',
    {
      description:
        'Advanced power-user Voicemeeter VBAN-TEXT escape hatch. Prefer typed voicemeeter_* tools whenever one exists. Sends the exact command string over VOICEMEETER_VBAN_HOST/PORT/STREAM; disable with VOICEMEETER_MCP_DISABLE_RAW_VBAN_TEXT=true.',
      inputSchema: RawVoicemeeterVbanTextSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = RawVoicemeeterVbanTextSchema.parse(args);
        return jsonResponse(await runRawVoicemeeterVbanText(input));
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Unknown raw Voicemeeter VBAN-TEXT command error'
        );
      }
    }
  );
}
