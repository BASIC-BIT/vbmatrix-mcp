import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  pointRangeSize,
  removePointCommand,
  removePointRangeCommand,
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  setPointRangeGainCommand,
  setPointRangeMuteCommand,
  setPointRangePhaseCommand,
  validatePointRangeTargetSyntax,
  validatePointTargetSyntax,
  type PointRangeTarget,
  type PointTarget,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertPointRangeWriteAllowed, assertPointWriteAllowed, safetyDetails } from '../core/safety.js';
import { readOnlyToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import {
  ApplyPointRangeSchema,
  PointRangeTargetSchema,
  PointTargetSchema,
  RemovePointSchema,
  SetPointGainSchema,
  SetPointMuteSchema,
  SetPointPhaseSchema,
} from './schemas.js';

function targetFromArgs(args: unknown): PointTarget {
  return PointTargetSchema.parse(args);
}

function rangeTargetFromArgs(args: unknown): PointRangeTarget {
  return PointRangeTargetSchema.parse(args);
}

function singlePointFromRange(target: PointRangeTarget): PointTarget | null {
  if (target.inputChannels.start !== target.inputChannels.end || target.outputChannels.start !== target.outputChannels.end) {
    return null;
  }
  return {
    inputSuid: target.inputSuid,
    inputChannel: target.inputChannels.start,
    outputSuid: target.outputSuid,
    outputChannel: target.outputChannels.start,
  };
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
      description: 'Read-only query for gain, mute, and phase state for one VBMatrix routing point.',
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
    'vbmatrix_remove_point',
    {
      description:
        'Typed single-point remove/disconnect. Queries before and after; requires confirmRemove=true; accepts no raw VBAN-TEXT commands.',
      inputSchema: RemovePointSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = RemovePointSchema.parse(args);
        const target = targetFromArgs(input);
        const client = new VbMatrixClient();
        return jsonResponse(await writePoint(target, removePointCommand(target), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix point remove error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_apply_point_range',
    {
      description:
        'Typed point range operation for gain, mute, phase, or remove using IN[start..end] and OUT[start..end]. dryRun defaults to true; execution requires confirmApply=true. Range state queries are only supported when the range identifies one point.',
      inputSchema: ApplyPointRangeSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = ApplyPointRangeSchema.parse(args);
        const target = rangeTargetFromArgs(input);
        validatePointRangeTargetSyntax(target);

        let command: string;
        if (input.operation === 'gain') {
          if (input.gainDb === undefined) throw new Error('gainDb is required when operation is gain');
          command = setPointRangeGainCommand(target, input.gainDb);
        } else if (input.operation === 'mute') {
          if (input.muted === undefined) throw new Error('muted is required when operation is mute');
          command = setPointRangeMuteCommand(target, input.muted);
        } else if (input.operation === 'phase') {
          if (input.phaseReversed === undefined) throw new Error('phaseReversed is required when operation is phase');
          command = setPointRangePhaseCommand(target, input.phaseReversed);
        } else {
          command = removePointRangeCommand(target);
        }

        const client = new VbMatrixClient();
        const affectedPoints = pointRangeSize(target);
        const dryRun = input.dryRun !== false;
        const queryTarget = singlePointFromRange(target);
        const stateQuery = queryTarget
          ? { supported: true, caveat: null }
          : {
              supported: false,
              caveat: 'VBMatrix range/zone aggregate state query support is not verified; no before/after state was queried.',
            };

        if (dryRun) {
          return jsonResponse({
            ok: true,
            dryRun: true,
            target,
            operation: input.operation,
            affectedPoints,
            command,
            stateQuery,
            safety: safetyDetails(client.config),
          });
        }

        if (input.confirmApply !== true) {
          throw new Error('confirmApply=true is required when dryRun is false');
        }

        assertPointRangeWriteAllowed(client.config, target);
        const before = queryTarget ? await client.queryPointState(queryTarget) : null;
        await client.send(command);
        const after = queryTarget ? await client.queryPointState(queryTarget) : null;

        return jsonResponse({
          ok: true,
          dryRun: false,
          target,
          operation: input.operation,
          affectedPoints,
          command,
          before,
          after,
          stateQuery,
          safety: safetyDetails(client.config),
        });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix point range operation error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_point_gain',
    {
      description:
        'Typed single-point write for gain. Queries before and after; respects write opt-out and optional SUID allowlist; accepts no raw VBAN-TEXT commands.',
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
      description:
        'Typed single-point write for mute. Queries before and after; respects write opt-out and optional SUID allowlist; accepts no raw VBAN-TEXT commands.',
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
      description:
        'Typed single-point write for phase reversal. Queries before and after; respects write opt-out and optional SUID allowlist; accepts no raw VBAN-TEXT commands.',
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
