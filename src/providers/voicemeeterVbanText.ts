import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadVoicemeeterVbanTextConfig, type VoicemeeterVbanTextConfig } from '../config/index.js';
import { assertVoicemeeterRawVbanTextAllowed } from '../core/safety.js';
import { sendVbanTextCommand, type SendVbanTextOptions } from '../core/vbanText.js';
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
      'When omitted, query-looking commands ending in ? or ?; wait for a reply and other commands fire-and-forget.'
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
  const response = await sendCommand(input.command, options);
  return {
    ok: true,
    command: input.command,
    waitForResponse,
    response: response?.trim() ?? null,
    rawPolicy: rawPolicyDetails(config),
    connection: connectionDetails(config),
  };
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
