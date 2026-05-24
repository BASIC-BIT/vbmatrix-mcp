import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  channelLabelQuery,
  removeChannelLabelCommand,
  resetChannelCommand,
  setChannelLabelCommand,
  validateChannelRangeTargetSyntax,
  validateChannelTargetSyntax,
  type ChannelRangeTarget,
  type ChannelTarget,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertChannelResetAllowed, assertChannelWriteAllowed, safetyDetails } from '../core/safety.js';
import { destructiveToolAnnotations, readOnlyToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import {
  ChannelOrRangeTargetSchema,
  ChannelTargetSchema,
  ResetChannelSchema,
  SetChannelLabelSchema,
} from './schemas.js';

function validateChannelOrRangeTarget(target: ChannelTarget | ChannelRangeTarget): void {
  if ('channel' in target) validateChannelTargetSyntax(target);
  else validateChannelRangeTargetSyntax(target);
}

async function queryLabel(
  client: VbMatrixClient,
  target: ChannelTarget | ChannelRangeTarget
): Promise<Record<string, unknown>> {
  const command = channelLabelQuery(target);
  return { command, value: await client.queryValue(command) };
}

export function registerChannelTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_get_channel_label',
    {
      description:
        'Read an input or output channel label. Supports documented Matrix range query syntax with startChannel/endChannel.',
      inputSchema: ChannelOrRangeTargetSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const target = ChannelOrRangeTargetSchema.parse(args);
        validateChannelOrRangeTarget(target);
        const client = new VbMatrixClient();
        return jsonResponse({ ok: true, target, label: await queryLabel(client, target) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix label query error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_channel_label',
    {
      description:
        'Set one input or output channel label. Range label setting is intentionally not exposed; Matrix docs only show range label removal with an empty label.',
      inputSchema: SetChannelLabelSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetChannelLabelSchema.parse(args);
        const target = ChannelTargetSchema.parse(input);
        const client = new VbMatrixClient();
        assertChannelWriteAllowed(client.config, target);
        const before = await queryLabel(client, target);
        const command = setChannelLabelCommand(target, input.label);
        await client.send(command);
        const after = await queryLabel(client, target);
        return jsonResponse({ ok: true, target, command, before, after, safety: safetyDetails(client.config) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix label write error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_remove_channel_label',
    {
      description:
        'Remove input or output channel labels by setting Name to an empty string. Supports documented single-channel and range syntax.',
      inputSchema: ChannelOrRangeTargetSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const target = ChannelOrRangeTargetSchema.parse(args);
        const client = new VbMatrixClient();
        assertChannelWriteAllowed(client.config, target);
        const before = await queryLabel(client, target);
        const command = removeChannelLabelCommand(target);
        await client.send(command);
        const after = await queryLabel(client, target);
        return jsonResponse({ ok: true, target, command, before, after, safety: safetyDetails(client.config) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix label removal error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_reset_channel_routes',
    {
      description:
        'Destructive input/output channel route reset. Supports documented single-channel and range syntax; requires confirm="RESET_CHANNEL_ROUTES" and destructive gate.',
      inputSchema: ResetChannelSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = ResetChannelSchema.parse(args);
        const target = ChannelOrRangeTargetSchema.parse(input);
        const client = new VbMatrixClient();
        assertChannelResetAllowed(client.config, target);
        const command = resetChannelCommand(target);
        await client.send(command);
        return jsonResponse({
          ok: true,
          target,
          command,
          confirmation: input.confirm,
          effect: 'Removes all routing points for the selected input/output channel target.',
          safety: safetyDetails(client.config),
        });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix channel reset error');
      }
    }
  );
}
