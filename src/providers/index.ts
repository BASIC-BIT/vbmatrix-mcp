import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { matrixProvider } from './matrix.js';
import type { ProductProvider } from './types.js';
import { voicemeeterProvider } from './voicemeeter.js';
import { windowsAudioProvider } from './windowsAudio.js';

export const productProviders: readonly ProductProvider[] = [
  matrixProvider,
  voicemeeterProvider,
  windowsAudioProvider,
];

export function registerProductProviders(server: McpServer): void {
  for (const provider of productProviders) provider.registerTools(server);
}
