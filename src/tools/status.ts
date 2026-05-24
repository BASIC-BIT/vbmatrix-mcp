import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandPropertyQuery, parseQueryResponseValue, slotPropertyQuery, validateSuidSyntax } from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { VbanTextTimeoutError } from '../core/vbanText.js';
import { readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { EmptySchema, SlotInputSchema } from './schemas.js';

function connectionSummary(client: VbMatrixClient): Record<string, unknown> {
  return {
    host: client.config.host,
    port: client.config.port,
    streamName: client.config.streamName,
    timeoutMs: client.config.timeoutMs,
  };
}

export function registerStatusTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_ping',
    {
      description: 'Read-only query for VBMatrix version and VBAN-TEXT communication details.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      try {
        const client = new VbMatrixClient();
        const version = await client.queryVersion();
        return jsonResponse({ ok: true, version, connection: connectionSummary(client) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix ping error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_vban_diagnostics',
    {
      description:
        'Read-only VBAN-TEXT diagnostics using a Matrix version query; reports host, port, command stream, Request Reply packet classification, observed timeout classification, and indeterminate no-packet timeout hints.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      const client = new VbMatrixClient();
      const command = commandPropertyQuery('Version');
      try {
        const result = await client.queryWithDiagnostics(command);
        let responseParsing: Record<string, unknown>;
        try {
          responseParsing = { ok: true, version: parseQueryResponseValue(command, result.response ?? '') };
        } catch (err) {
          responseParsing = { ok: false, error: err instanceof Error ? err.message : 'Unknown response parsing error' };
        }
        return jsonResponse({
          ok: true,
          command,
          response: result.response,
          responseParsing,
          diagnostics: result.diagnostics,
          configurationSupport: {
            mcpConfig: ['VBMATRIX_HOST', 'VBMATRIX_PORT', 'VBMATRIX_STREAM', 'VBMATRIX_TIMEOUT_MS'],
            matrixConfig: 'Operator-in-loop UI setup only; this server does not expose VBAN service/stream config writes.',
          },
        });
      } catch (err) {
        if (err instanceof VbanTextTimeoutError) {
          return jsonResponse({
            ok: false,
            command,
            error: err.message,
            diagnostics: err.diagnostics,
            likelyFixes: [
              'Confirm VBMatrix is running and VBAN service is ON.',
              `Confirm the incoming TEXT command stream is enabled and named '${client.config.streamName}' (default Command1).`,
              `Confirm UDP host/port ${client.config.host}:${client.config.port} is reachable and not blocked by firewall policy.`,
              "Expect Matrix query replies as VBAN SERVICE packets on stream 'Request Reply', not on the command stream.",
            ],
          });
        }
        return toolError(err instanceof Error ? err.message : 'Unknown VBAN diagnostics error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_get_engine',
    {
      description: 'Read-only query for VBMatrix audio engine state.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      try {
        const client = new VbMatrixClient();
        const engine = await client.queryValue(commandPropertyQuery('Engine'));
        return jsonResponse({ ok: true, engine });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix engine query error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_get_master',
    {
      description: 'Read-only query for VBMatrix master clock state.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      try {
        const client = new VbMatrixClient();
        const master = await client.queryValue(commandPropertyQuery('Master'));
        return jsonResponse({ ok: true, master });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix master query error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_get_slot_info',
    {
      description: 'Read-only query for VBMatrix slot info, online state, running status, master flag, and device string.',
      inputSchema: SlotInputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = SlotInputSchema.parse(args);
        validateSuidSyntax(input.suid);
        const client = new VbMatrixClient();
        const [info, online, runningStatus, master, device] = await Promise.all([
          client.queryValue(slotPropertyQuery(input.suid, 'Info')),
          client.queryValue(slotPropertyQuery(input.suid, 'Online')),
          client.queryValue(slotPropertyQuery(input.suid, 'RunningStatus')),
          client.queryValue(slotPropertyQuery(input.suid, 'Master')),
          client.queryValue(slotPropertyQuery(input.suid, 'Device')),
        ]);
        return jsonResponse({ ok: true, suid: input.suid, info, online, runningStatus, master, device });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot query error');
      }
    }
  );
}
