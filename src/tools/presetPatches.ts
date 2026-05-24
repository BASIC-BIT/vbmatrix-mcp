import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  presetPatchActionCommand,
  setPresetPatchCommentCommand,
  setPresetPatchGainCommand,
  setPresetPatchMuteCommand,
  setPresetPatchNameCommand,
  setPresetPatchPhaseCommand,
  type PresetPatchOperation,
  type PresetPatchState,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertPresetPatchDestructiveAllowed, assertPresetPatchWriteAllowed, safetyDetails } from '../core/safety.js';
import { destructiveToolAnnotations, readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { PresetPatchIndexSchema, PresetPatchOperationSchema } from './schemas.js';

const destructivePresetPatchOperations = new Set<PresetPatchOperation>([
  'apply',
  'recall',
  'copy',
  'paste',
  'delete',
  'resetZone',
  'update',
]);

function presetPatchCommand(input: ReturnType<typeof PresetPatchOperationSchema.parse>): string {
  switch (input.operation) {
    case 'gain':
      if (input.gainDb === undefined) throw new Error('gainDb is required when operation is gain');
      return setPresetPatchGainCommand(input.index, input.gainDb);
    case 'mute':
      if (input.muted === undefined) throw new Error('muted is required when operation is mute');
      return setPresetPatchMuteCommand(input.index, input.muted);
    case 'phase':
      if (input.phaseReversed === undefined) throw new Error('phaseReversed is required when operation is phase');
      return setPresetPatchPhaseCommand(input.index, input.phaseReversed);
    case 'name':
      if (input.name === undefined) throw new Error('name is required when operation is name');
      return setPresetPatchNameCommand(input.index, input.name);
    case 'comment':
      if (input.comment === undefined) throw new Error('comment is required when operation is comment');
      return setPresetPatchCommentCommand(input.index, input.comment);
    default:
      return presetPatchActionCommand(input.index, input.operation);
  }
}

export async function writePresetPatch(
  index: number,
  operation: PresetPatchOperation,
  command: string,
  client: VbMatrixClient
): Promise<Record<string, unknown>> {
  const before = await client.queryPresetPatchState(index);
  await client.send(command);
  const safety = safetyDetails(client.config);
  try {
    const after = await client.queryPresetPatchState(index);
    return { ok: true, index, operation, command, before, after, safety };
  } catch (err) {
    return {
      ok: false,
      partial: true,
      commandSent: true,
      index,
      operation,
      command,
      before,
      afterError: err instanceof Error ? err.message : 'Unknown VBMatrix post-write preset patch query error',
      safety,
    };
  }
}

function stateSummary(state: PresetPatchState): Record<string, string> {
  return {
    name: state.name,
    apply: state.apply,
    mute: state.mute,
    phase: state.phase,
    gain: state.gain,
    zone: state.zone,
    point: state.point,
  };
}

export function registerPresetPatchTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_get_preset_patch',
    {
      description:
        'Read-only query for one Matrix PresetPatch[n]: name, comment, apply count, mute count, phase count, gain, zone count, and point count.',
      inputSchema: PresetPatchIndexSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = PresetPatchIndexSchema.parse(args);
        const client = new VbMatrixClient();
        const state = await client.queryPresetPatchState(input.index);
        return jsonResponse({ ok: true, index: input.index, state, summary: stateSummary(state) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix preset patch query error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_preset_patch',
    {
      description:
        'Grouped typed PresetPatch[n] write tool for documented apply, recall, copy, paste, delete, gain, mute, phase, resetZone, update, name, and comment operations. dryRun defaults to true; execution requires confirmOperation="PRESET_PATCH_WRITE".',
      inputSchema: PresetPatchOperationSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = PresetPatchOperationSchema.parse(args);
        const command = presetPatchCommand(input);
        const client = new VbMatrixClient();
        const destructive = destructivePresetPatchOperations.has(input.operation);

        if (input.dryRun) {
          return jsonResponse({
            ok: true,
            dryRun: true,
            index: input.index,
            operation: input.operation,
            destructive,
            command,
            safety: safetyDetails(client.config),
          });
        }

        if (input.confirmOperation !== 'PRESET_PATCH_WRITE') {
          throw new Error('confirmOperation="PRESET_PATCH_WRITE" is required when dryRun is false');
        }

        if (destructive) assertPresetPatchDestructiveAllowed(client.config, input.index);
        else assertPresetPatchWriteAllowed(client.config, input.index);

        return jsonResponse(await writePresetPatch(input.index, input.operation, command, client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix preset patch operation error');
      }
    }
  );
}
