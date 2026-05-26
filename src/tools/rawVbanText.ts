import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VbMatrixClient } from '../core/client.js';
import { assertRawVbanTextAllowed } from '../core/safety.js';
import { destructiveToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { RawVbanTextSchema } from './schemas.js';

function shouldWaitForResponse(command: string): boolean {
  return /\?\s*;?\s*$/.test(command);
}

function rawPolicyDetails(client: VbMatrixClient): Record<string, unknown> {
  return {
    disableRawCommands: client.config.rawCommands.disabled,
    preferTypedTools: true,
  };
}

export async function runRawVbanText(
  input: { command: string; waitForResponse?: boolean },
  client: VbMatrixClient
): Promise<Record<string, unknown>> {
  assertRawVbanTextAllowed(client.config);

  const waitForResponse = input.waitForResponse ?? shouldWaitForResponse(input.command);
  if (waitForResponse) {
    const response = await client.query(input.command);
    return {
      ok: true,
      command: input.command,
      waitForResponse,
      response,
      rawPolicy: rawPolicyDetails(client),
      connection: {
        host: client.config.host,
        port: client.config.port,
        streamName: client.config.streamName,
        timeoutMs: client.config.timeoutMs,
      },
    };
  }

  await client.send(input.command);
  return {
    ok: true,
    command: input.command,
    waitForResponse,
    response: null,
    rawPolicy: rawPolicyDetails(client),
    connection: {
      host: client.config.host,
      port: client.config.port,
      streamName: client.config.streamName,
      timeoutMs: client.config.timeoutMs,
    },
  };
}

export function registerRawVbanTextTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_raw_vban_text',
    {
      description:
        'Advanced power-user VBAN-TEXT escape hatch. Prefer typed vbmatrix_* tools whenever one exists. Sends the exact command string over the configured Matrix VBAN-TEXT stream with no typed Matrix validation; disable with VBMATRIX_MCP_DISABLE_RAW_COMMANDS=true.',
      inputSchema: RawVbanTextSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = RawVbanTextSchema.parse(args);
        return jsonResponse(await runRawVbanText(input, new VbMatrixClient()));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown raw VBAN-TEXT command error');
      }
    }
  );
}
