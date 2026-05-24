import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  removeSlotDeviceCommand,
  resetSlotCommand,
  setSlotDeviceCommand,
  setSlotMasterCommand,
  setSlotOnlineCommand,
} from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertSlotDestructiveAllowed, assertSlotWriteAllowed, safetyDetails } from '../core/safety.js';
import { destructiveToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import {
  RemoveSlotDeviceSchema,
  ResetSlotSchema,
  SetSlotDeviceSchema,
  SetSlotMasterSchema,
  SetSlotOnlineSchema,
} from './schemas.js';

export async function writeSlot(
  suid: string,
  command: string,
  client: VbMatrixClient
): Promise<Record<string, unknown>> {
  const before = await client.querySlotState(suid);
  await client.send(command);
  const safety = safetyDetails(client.config);
  try {
    const after = await client.querySlotState(suid);
    return { ok: true, suid, command, before, after, safety };
  } catch (err) {
    return {
      ok: false,
      partial: true,
      commandSent: true,
      suid,
      command,
      before,
      afterError: err instanceof Error ? err.message : 'Unknown VBMatrix post-write slot query error',
      safety,
    };
  }
}

export function registerSlotTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_set_slot_online',
    {
      description:
        'Typed slot lifecycle write for Slot(SUID).Online. Queries slot state before and after; accepts no raw VBAN-TEXT commands.',
      inputSchema: SetSlotOnlineSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetSlotOnlineSchema.parse(args);
        const client = new VbMatrixClient();
        assertSlotWriteAllowed(client.config, input.suid);
        return jsonResponse(
          await writeSlot(input.suid, setSlotOnlineCommand(input.suid, input.online), client)
        );
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot online write error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_slot_master',
    {
      description:
        'Typed slot lifecycle write for Slot(SUID).Master. Queries slot state before and after; accepts no raw VBAN-TEXT commands.',
      inputSchema: SetSlotMasterSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetSlotMasterSchema.parse(args);
        const client = new VbMatrixClient();
        assertSlotWriteAllowed(client.config, input.suid);
        return jsonResponse(
          await writeSlot(input.suid, setSlotMasterCommand(input.suid, input.master), client)
        );
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot master write error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_reset_slot',
    {
      description:
        'Destructive typed slot reset for Slot(SUID).Reset. Requires confirm=true and destructive/write gates; accepts no raw VBAN-TEXT commands.',
      inputSchema: ResetSlotSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = ResetSlotSchema.parse(args);
        const client = new VbMatrixClient();
        assertSlotDestructiveAllowed(client.config, input.suid, input.confirm);
        return jsonResponse(await writeSlot(input.suid, resetSlotCommand(input.suid), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot reset error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_set_slot_device',
    {
      description:
        'Destructive typed device assignment using Slot(SUID).Device.ASIO/MME/KS/WDM="Device Name". Requires confirm=true and safe quoted device names.',
      inputSchema: SetSlotDeviceSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = SetSlotDeviceSchema.parse(args);
        const client = new VbMatrixClient();
        assertSlotDestructiveAllowed(client.config, input.suid, input.confirm);
        return jsonResponse(
          await writeSlot(input.suid, setSlotDeviceCommand(input.suid, input.kind, input.deviceName), client)
        );
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Unknown VBMatrix slot device assignment error'
        );
      }
    }
  );

  server.registerTool(
    'vbmatrix_remove_slot_device',
    {
      description:
        'Destructive typed device removal using Slot(SUID).Device="". Requires confirm=true and destructive/write gates.',
      inputSchema: RemoveSlotDeviceSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        const input = RemoveSlotDeviceSchema.parse(args);
        const client = new VbMatrixClient();
        assertSlotDestructiveAllowed(client.config, input.suid, input.confirm);
        return jsonResponse(await writeSlot(input.suid, removeSlotDeviceCommand(input.suid), client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot device removal error');
      }
    }
  );
}
