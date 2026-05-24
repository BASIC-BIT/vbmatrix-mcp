import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  addZoneCommand,
  copyZoneCommand,
  resetZoneCommand,
  setZoneGainCommand,
  setZoneMuteCommand,
  setZonePhaseCommand,
  storeZoneCommand,
  validateZoneTargetSyntax,
  type ZoneOperation,
  type ZoneTarget,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertZoneResetAllowed, assertZoneWriteAllowed, safetyDetails } from '../core/safety.js';
import { writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { ApplyZoneSchema, ZoneTargetSchema } from './schemas.js';

function zoneTargetFromArgs(args: unknown): ZoneTarget {
  return ZoneTargetSchema.parse(args);
}

function zoneCommand(input: ReturnType<typeof ApplyZoneSchema.parse>, target: ZoneTarget): string {
  if (input.operation === 'gain') {
    if (input.gainDb === undefined) throw new Error('gainDb is required when operation is gain');
    return setZoneGainCommand(target, input.gainDb);
  }
  if (input.operation === 'mute') {
    if (input.muted === undefined) throw new Error('muted is required when operation is mute');
    return setZoneMuteCommand(target, input.muted);
  }
  if (input.operation === 'phase') {
    if (input.phaseReversed === undefined) throw new Error('phaseReversed is required when operation is phase');
    return setZonePhaseCommand(target, input.phaseReversed);
  }
  if (input.operation === 'reset') return resetZoneCommand(target);
  if (input.operation === 'copy') return copyZoneCommand(target);

  if (input.presetNumber === undefined) throw new Error('presetNumber is required when operation is store or add');
  return input.operation === 'store' ? storeZoneCommand(target, input.presetNumber) : addZoneCommand(target, input.presetNumber);
}

function destructiveZoneOperation(operation: ZoneOperation, command: string): boolean {
  return operation === 'reset' || command.endsWith('.Reset;');
}

export function registerZoneTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_apply_zone',
    {
      description:
        'Typed Zone(...) operation using the documented two-corner Matrix zone grammar. dryRun defaults to true; execution requires confirmApply=true. State queries for zones are not documented, so no before/after state is queried.',
      inputSchema: ApplyZoneSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = ApplyZoneSchema.parse(args);
        const target = zoneTargetFromArgs(input);
        validateZoneTargetSyntax(target);

        const command = zoneCommand(input, target);
        const client = new VbMatrixClient();
        const dryRun = input.dryRun !== false;
        const destructive = destructiveZoneOperation(input.operation, command);
        const stateQuery = {
          supported: false,
          caveat: 'VBMatrix zone aggregate state query support is not documented; no before/after state was queried.',
        };

        if (dryRun) {
          return jsonResponse({
            ok: true,
            dryRun: true,
            target,
            operation: input.operation,
            command,
            destructive,
            stateQuery,
            safety: safetyDetails(client.config),
          });
        }

        if (input.confirmApply !== true) {
          throw new Error('confirmApply=true is required when dryRun is false');
        }

        if (destructive) assertZoneResetAllowed(client.config, target);
        else assertZoneWriteAllowed(client.config, target);

        await client.send(command);

        return jsonResponse({
          ok: true,
          dryRun: false,
          target,
          operation: input.operation,
          command,
          destructive,
          before: null,
          after: null,
          stateQuery,
          safety: safetyDetails(client.config),
        });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix zone operation error');
      }
    }
  );
}
