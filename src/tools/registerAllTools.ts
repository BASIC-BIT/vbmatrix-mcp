import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPointTools } from './points.js';
import { registerSlotTools } from './slots.js';
import { registerStatusTools } from './status.js';
import { registerSystemTools } from './system.js';

export function registerAllTools(server: McpServer): void {
  registerStatusTools(server);
  registerPointTools(server);
  registerSlotTools(server);
  registerSystemTools(server);
}
