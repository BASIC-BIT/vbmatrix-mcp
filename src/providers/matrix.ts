import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChannelTools } from '../tools/channels.js';
import { registerObservabilityTools } from '../tools/observability.js';
import { registerPointTools } from '../tools/points.js';
import { registerPresetPatchTools } from '../tools/presetPatches.js';
import { registerRawVbanTextTools } from '../tools/rawVbanText.js';
import { registerSafeRoutingTools } from '../tools/safeRouting.js';
import { registerSlotTools } from '../tools/slots.js';
import { registerSnapshotTools } from '../tools/snapshots.js';
import { registerStatusTools } from '../tools/status.js';
import { registerSystemTools } from '../tools/system.js';
import { registerZoneTools } from '../tools/zones.js';
import { matrixProviderMetadata } from './matrixMetadata.js';
import type { ProductProvider } from './types.js';

function registerMatrixTools(server: McpServer): void {
  registerStatusTools(server);
  registerRawVbanTextTools(server);
  registerObservabilityTools(server);
  registerPointTools(server);
  registerZoneTools(server);
  registerChannelTools(server);
  registerPresetPatchTools(server);
  registerSafeRoutingTools(server);
  registerSlotTools(server);
  registerSnapshotTools(server);
  registerSystemTools(server);
}

export const matrixProvider: ProductProvider = {
  ...matrixProviderMetadata,
  registerTools: registerMatrixTools,
};
