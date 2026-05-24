import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChannelTools } from './channels.js';
import { registerPointTools } from './points.js';
import { registerPresetPatchTools } from './presetPatches.js';
import { registerSlotTools } from './slots.js';
import { registerSnapshotTools } from './snapshots.js';
import { registerStatusTools } from './status.js';
import { registerSystemTools } from './system.js';

export function registerAllTools(server: McpServer): void {
  registerStatusTools(server);
  registerPointTools(server);
  registerChannelTools(server);
  registerPresetPatchTools(server);
  registerSlotTools(server);
  registerSnapshotTools(server);
  registerSystemTools(server);
}
