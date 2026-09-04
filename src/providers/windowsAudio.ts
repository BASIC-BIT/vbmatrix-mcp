import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EmptySchema } from '../tools/schemas.js';
import { readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse } from '../utils/toolResponses.js';
import type { ProductProvider } from './types.js';
import { runWindowsAudioOperation, type WindowsAudioHelperOperation } from './windowsAudioHelper.js';
import { windowsAudioCapabilitiesPayload, windowsAudioProviderMetadata } from './windowsAudioMetadata.js';

const DataFlowSchema = z.enum(['render', 'capture']);
const RoleSchema = z.enum(['console', 'multimedia', 'communications']);
const EndpointStateSchema = z.enum(['active', 'disabled', 'unplugged', 'not_present', 'unknown']);

const MixFormatSchema = z.object({
  available: z.boolean(),
  channels: z.number().int().min(1).max(512).optional(),
  sampleRateHz: z.number().int().min(1).max(1_536_000).optional(),
  bitsPerSample: z.number().int().min(1).max(128).optional(),
  blockAlign: z.number().int().min(1).max(65_535).optional(),
  averageBytesPerSecond: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  formatTag: z.number().int().min(0).max(65_535).optional(),
  hresult: z.string().max(32).optional(),
  reason: z.string().max(128).optional(),
});

const EndpointSchema = z.object({
  id: z.string().max(2_048),
  dataFlow: DataFlowSchema,
  state: EndpointStateSchema,
  stateValue: z.number().int().min(0).max(15),
  friendlyName: z.string().max(1_024),
  deviceDescription: z.string().max(1_024),
  interfaceFriendlyName: z.string().max(1_024),
  policyGuid: z.string().max(128),
  interfacePath: z.string().max(2_048),
  defaultRoles: z.array(RoleSchema).max(3),
  mixFormat: MixFormatSchema.optional(),
});

const EndpointHelperResultSchema = z.object({
  schemaVersion: z.literal('windows_audio.endpoints.v1'),
  ok: z.literal(true),
  availability: z.enum(['available', 'partial']),
  platform: z.literal('windows'),
  flow: z.enum(['all', 'render', 'capture']),
  includeInactive: z.boolean(),
  nameFilter: z.string().max(128),
  matchedCount: z.number().int().min(0),
  returnedCount: z.number().int().min(0).max(200),
  truncated: z.boolean(),
  endpoints: z.array(EndpointSchema).max(200),
});

const DefaultRowSchema = z.object({
  dataFlow: DataFlowSchema,
  role: RoleSchema,
  available: z.boolean(),
  hresult: z.string().max(32).optional(),
  endpoint: EndpointSchema.optional(),
});

const DefaultsHelperResultSchema = z.object({
  schemaVersion: z.literal('windows_audio.defaults.v1'),
  ok: z.literal(true),
  availability: z.enum(['available', 'partial']),
  platform: z.literal('windows'),
  defaults: z.array(DefaultRowSchema).max(6),
});

export const WindowsAudioEndpointsSchema = z.object({
  flow: z.enum(['all', 'render', 'capture']).default('all'),
  includeInactive: z
    .boolean()
    .default(false)
    .describe('Include disabled, unplugged, and not-present endpoint records.'),
  nameFilter: z
    .string()
    .max(128)
    .default('')
    .describe('Optional case-insensitive text filter across bounded endpoint identity fields.'),
  maxEndpoints: z.number().int().min(1).max(200).default(80),
});

type WindowsAudioOperationRunner = (
  operation: WindowsAudioHelperOperation,
  payload?: Record<string, unknown>
) => Promise<Record<string, unknown>>;

function contractFailure(operation: WindowsAudioHelperOperation, helper?: unknown): Record<string, unknown> {
  return {
    ok: false,
    availability: 'helper_failed',
    code: 'windows_audio_helper_contract_invalid',
    error: `Windows audio helper returned an invalid ${operation} response.`,
    ...(helper === undefined ? {} : { helper }),
  };
}

function hasValidEndpointDetails(endpoint: z.infer<typeof EndpointSchema>): boolean {
  return (
    new Set(endpoint.defaultRoles).size === endpoint.defaultRoles.length &&
    (!endpoint.mixFormat?.available ||
      (endpoint.mixFormat.channels !== undefined &&
        endpoint.mixFormat.sampleRateHz !== undefined &&
        endpoint.mixFormat.bitsPerSample !== undefined &&
        endpoint.mixFormat.blockAlign !== undefined &&
        endpoint.mixFormat.averageBytesPerSecond !== undefined &&
        endpoint.mixFormat.formatTag !== undefined))
  );
}

function hasUniqueEndpoints(endpoints: z.infer<typeof EndpointSchema>[]): boolean {
  const keys = endpoints.map((endpoint) => `${endpoint.dataFlow}\u0000${endpoint.id.toUpperCase()}`);
  return new Set(keys).size === keys.length && endpoints.every(hasValidEndpointDetails);
}

const expectedDefaultKeys = new Set([
  'render.console',
  'render.multimedia',
  'render.communications',
  'capture.console',
  'capture.multimedia',
  'capture.communications',
]);

export async function runWindowsAudioEndpoints(
  input: z.infer<typeof WindowsAudioEndpointsSchema>,
  runOperation: WindowsAudioOperationRunner = runWindowsAudioOperation
): Promise<Record<string, unknown>> {
  const response = await runOperation('endpoints', input);
  if (response.ok !== true) return response;
  const parsed = EndpointHelperResultSchema.safeParse(response);
  if (!parsed.success) return contractFailure('endpoints', response.helper);
  if (
    parsed.data.flow !== input.flow ||
    parsed.data.includeInactive !== input.includeInactive ||
    parsed.data.nameFilter !== input.nameFilter ||
    parsed.data.returnedCount !== parsed.data.endpoints.length ||
    parsed.data.matchedCount < parsed.data.endpoints.length ||
    (!parsed.data.truncated && parsed.data.matchedCount > parsed.data.returnedCount) ||
    !hasUniqueEndpoints(parsed.data.endpoints)
  ) {
    return contractFailure('endpoints', response.helper);
  }

  const endpoints = parsed.data.endpoints.slice(0, input.maxEndpoints);
  return {
    ...parsed.data,
    stateSource: 'windows-core-audio',
    liveState: true,
    observedAt: new Date().toISOString(),
    returnedCount: endpoints.length,
    truncated:
      parsed.data.truncated ||
      parsed.data.endpoints.length > endpoints.length ||
      parsed.data.matchedCount > endpoints.length,
    endpoints,
    helper: response.helper,
    privacy:
      'Endpoint IDs, interface paths, and device names are machine-specific; redact them before sharing support evidence.',
  };
}

export async function runWindowsAudioDefaults(
  runOperation: WindowsAudioOperationRunner = runWindowsAudioOperation
): Promise<Record<string, unknown>> {
  const response = await runOperation('defaults');
  if (response.ok !== true) return response;
  const parsed = DefaultsHelperResultSchema.safeParse(response);
  if (!parsed.success) return contractFailure('defaults', response.helper);
  const keys = parsed.data.defaults.map((row) => `${row.dataFlow}.${row.role}`);
  if (
    keys.length !== expectedDefaultKeys.size ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !expectedDefaultKeys.has(key)) ||
    parsed.data.defaults.some(
      (row) =>
        (row.available && row.endpoint?.dataFlow !== row.dataFlow) ||
        (!row.available && row.endpoint !== undefined) ||
        (row.endpoint &&
          (!row.endpoint.defaultRoles.includes(row.role) || !hasValidEndpointDetails(row.endpoint)))
    )
  ) {
    return contractFailure('defaults', response.helper);
  }
  return {
    ...parsed.data,
    stateSource: 'windows-core-audio',
    liveState: true,
    observedAt: new Date().toISOString(),
    helper: response.helper,
    privacy:
      'Endpoint IDs, interface paths, and device names are machine-specific; redact them before sharing support evidence.',
  };
}

function registerWindowsAudioTools(server: McpServer): void {
  server.registerTool(
    'windows_audio_get_capabilities',
    {
      description:
        'Report the Windows Core Audio provider, its isolated helper boundary, read-only guarantees, and platform availability semantics.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    () => jsonResponse(windowsAudioCapabilitiesPayload())
  );

  server.registerTool(
    'windows_audio_get_endpoints',
    {
      description:
        'Read a bounded Windows Core Audio render/capture endpoint inventory, including state, default roles, and mix format where available. Makes no audio changes.',
      inputSchema: WindowsAudioEndpointsSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => jsonResponse(await runWindowsAudioEndpoints(WindowsAudioEndpointsSchema.parse(args)))
  );

  server.registerTool(
    'windows_audio_get_defaults',
    {
      description:
        'Read Windows Core Audio default render and capture endpoints for console, multimedia, and communications roles. Makes no audio changes.',
      inputSchema: EmptySchema,
      annotations: readOnlyToolAnnotations,
    },
    async () => jsonResponse(await runWindowsAudioDefaults())
  );
}

export const windowsAudioProvider: ProductProvider = {
  ...windowsAudioProviderMetadata,
  registerTools: registerWindowsAudioTools,
};
