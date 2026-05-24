import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json' with { type: 'json' };
import { logger } from './infra/logger.js';
import { registerAllTools } from './tools/registerAllTools.js';

const server = new McpServer({ name: 'vbmatrix-mcp', version: pkg.version ?? '0.0.0' });

async function main(): Promise<void> {
  registerAllTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  logger.error('Fatal error starting server', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
