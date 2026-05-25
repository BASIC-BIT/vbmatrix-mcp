import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { matrixProvider } from './matrix.js';
import type { ProductProvider } from './types.js';
import { voicemeeterProvider } from './voicemeeter.js';

export const productProviders: readonly ProductProvider[] = [matrixProvider, voicemeeterProvider];

export function registerProductProviders(server: McpServer): void {
  for (const provider of productProviders) provider.registerTools(server);
}
