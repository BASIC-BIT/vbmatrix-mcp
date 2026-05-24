import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { restartEngineCommand } from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertDestructiveAllowed, safetyDetails } from '../core/safety.js';
import { destructiveToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { EmptySchema } from './schemas.js';

export function registerSystemTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_restart_engine',
    {
      description:
        'Fixed destructive action to restart the VBMatrix audio engine. Block with VBMATRIX_MCP_ALLOW_DESTRUCTIVE=false; accepts no raw VBAN-TEXT commands.',
      inputSchema: EmptySchema,
      annotations: destructiveToolAnnotations,
    },
    async () => {
      try {
        const client = new VbMatrixClient();
        assertDestructiveAllowed(client.config);
        const before = await client.queryValue('Command.Engine=?;').catch((err: unknown) => ({
          error: err instanceof Error ? err.message : 'Unknown engine query error',
        }));
        const command = restartEngineCommand();
        await client.send(command);
        return jsonResponse({ ok: true, command, before, safety: safetyDetails(client.config) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix restart error');
      }
    }
  );
}
