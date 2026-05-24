import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandPropertyQuery, slotPropertyQuery, validateSuidSyntax } from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
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
      description: 'Query VBMatrix version to verify VBAN-TEXT communication.',
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
    'vbmatrix_get_engine',
    {
      description: 'Query VBMatrix audio engine state.',
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
      description: 'Query VBMatrix master clock state.',
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
      description: 'Query VBMatrix slot info, online state, running status, master flag, and device string.',
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
