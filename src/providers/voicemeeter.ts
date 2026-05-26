import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmptySchema } from '../tools/schemas.js';
import { readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse } from '../utils/toolResponses.js';
import type { ProductProvider } from './types.js';
import { registerVoicemeeterControlTools } from './voicemeeterControls.js';
import { getVoicemeeterStatus } from './voicemeeterHelper.js';
import { voicemeeterCapabilitiesPayload, voicemeeterProviderMetadata } from './voicemeeterMetadata.js';

function registerVoicemeeterTools(server: McpServer): void {
  server.registerTool(
    'voicemeeter_get_capabilities',
    {
      description:
        'Read-only provider capability summary for the Voicemeeter helper-process provider. No native Voicemeeter DLLs are loaded in the MCP server process.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    () => jsonResponse(voicemeeterCapabilitiesPayload())
  );

  server.registerTool(
    'voicemeeter_get_status',
    {
      description:
        'Read-only Voicemeeter discovery/status via an external helper process. Reports helper-not-configured, missing-install, not-running, helper-failed, or available states.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => jsonResponse({ ...(await getVoicemeeterStatus()) })
  );

  registerVoicemeeterControlTools(server);
}

export const voicemeeterProvider: ProductProvider = {
  ...voicemeeterProviderMetadata,
  registerTools: registerVoicemeeterTools,
};
