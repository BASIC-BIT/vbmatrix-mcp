import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadVoicemeeterVbanTextConfig, type VoicemeeterVbanTextConfig } from '../config/index.js';
import { assertVoicemeeterRawVbanTextAllowed } from '../core/safety.js';
import { sendVbanTextCommand, VbanTextTimeoutError, type SendVbanTextOptions } from '../core/vbanText.js';
import { destructiveToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';

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
        error: err.message,
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
