import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  validatePointTargetSyntax,
  type PointTarget,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertPointWriteAllowed, safetyDetails } from '../core/safety.js';
import { readOnlyToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { PointTargetSchema, SetPointGainSchema, SetPointMuteSchema, SetPointPhaseSchema } from './schemas.js';

function targetFromArgs(args: unknown): PointTarget {
  return PointTargetSchema.parse(args);
}

async function writePoint(
  target: PointTarget,
  command: string,
  client: VbMatrixClient
): Promise<Record<string, unknown>> {
  assertPointWriteAllowed(client.config, target);
  const before = await client.queryPointState(target);
  await client.send(command);
  const after = await client.queryPointState(target);
  return { ok: true, target, command, before, after, safety: safetyDetails(client.config) };
}

export function registerPointTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_get_point',
    {
      description: 'Query gain, mute, and phase state for one VBMatrix routing point.',
      inputSchema: PointTargetSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const target = targetFromArgs(args);
        validatePointTargetSyntax(target);
        const client = new VbMatrixClient();
        return jsonResponse({ ok: true, target, state: await client.queryPointState(target) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix point query error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_point_gain',
    {
      description: 'Set gain for one VBMatrix routing point. Respects write opt-out and optional SUID allowlist.',
      inputSchema: SetPointGainSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetPointGainSchema.parse(args);
        const target = targetFromArgs(input);
        const client = new VbMatrixClient();
        return jsonResponse(await writePoint(target, setPointGainCommand(target, input.gainDb), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix gain write error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_point_mute',
    {
      description: 'Set mute state for one VBMatrix routing point. Respects write opt-out and optional SUID allowlist.',
      inputSchema: SetPointMuteSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetPointMuteSchema.parse(args);
        const target = targetFromArgs(input);
        const client = new VbMatrixClient();
        return jsonResponse(await writePoint(target, setPointMuteCommand(target, input.muted), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix mute write error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_point_phase',
    {
      description: 'Set phase reversal for one VBMatrix routing point. Respects write opt-out and optional SUID allowlist.',
      inputSchema: SetPointPhaseSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetPointPhaseSchema.parse(args);
        const target = targetFromArgs(input);
        const client = new VbMatrixClient();
        return jsonResponse(await writePoint(target, setPointPhaseCommand(target, input.phaseReversed), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix phase write error');
      }
    }
  );
}
