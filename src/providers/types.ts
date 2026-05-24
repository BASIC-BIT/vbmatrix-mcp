import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ProductProvider {
  id: string;
  displayName: string;
  toolPrefix: string;
  transport: string;
  capabilities: readonly string[];
  registerTools(server: McpServer): void;
}
