import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChannelTools } from './channels.js';
import { registerPointTools } from './points.js';
import { registerStatusTools } from './status.js';
import { registerSystemTools } from './system.js';

export function registerAllTools(server: McpServer): void {
  registerStatusTools(server);
  registerPointTools(server);
  registerChannelTools(server);
  registerSystemTools(server);
}
