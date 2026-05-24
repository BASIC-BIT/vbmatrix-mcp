import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChannelTools } from './channels.js';
import { registerPointTools } from './points.js';
import { registerPresetPatchTools } from './presetPatches.js';
import { registerSafeRoutingTools } from './safeRouting.js';
import { registerSlotTools } from './slots.js';
import { registerSnapshotTools } from './snapshots.js';
import { registerStatusTools } from './status.js';
import { registerSystemTools } from './system.js';
import { registerZoneTools } from './zones.js';

export function registerAllTools(server: McpServer): void {
  registerStatusTools(server);
  registerPointTools(server);
  registerZoneTools(server);
  registerChannelTools(server);
  registerPresetPatchTools(server);
  registerSafeRoutingTools(server);
  registerSlotTools(server);
  registerSnapshotTools(server);
  registerSystemTools(server);
}
