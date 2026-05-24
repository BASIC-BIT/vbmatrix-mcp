import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProductProviders } from '../providers/index.js';

export function registerAllTools(server: McpServer): void {
  registerProductProviders(server);
}
