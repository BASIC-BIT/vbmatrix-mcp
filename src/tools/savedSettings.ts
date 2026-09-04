import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig, type VbMatrixConfig } from '../config/index.js';
import {
  diffMatrixSavedSettings,
  loadMatrixSavedSettingsFile,
  SavedSettingsError,
  type LoadedSavedSettings,
  type SavedSettingsRoute,
  type SavedSettingsSlot,
} from '../core/savedSettings.js';
import { readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';

const SavedSettingsSlotKindSchema = z.enum([
  'clock',
  'vaio',
  'vban',
  'virtual_asio',
  'asio_device',
  'windows_device',
  'unknown',
]);

export const InspectSavedSettingsSchema = z.object({
  filePath: z.string().min(1).describe('Absolute .xml file path under VBMATRIX_MCP_SAVED_SETTINGS_ROOTS.'),
  slotKind: SavedSettingsSlotKindSchema.optional().describe('Optional exact saved slot-kind filter.'),
  onlineOnly: z.boolean().default(false).describe('Return only slots marked online in the saved file.'),
  inputSuid: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Optional exact case-insensitive input SUID filter.'),
  inputChannel: z.number().int().min(1).optional().describe('Optional exact input channel filter.'),
  outputSuid: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Optional exact case-insensitive output SUID filter.'),
  outputChannel: z.number().int().min(1).optional().describe('Optional exact output channel filter.'),
  includeMuted: z.boolean().default(true).describe('Include routes marked muted in the saved file.'),
  maxSlots: z.number().int().min(1).max(1_000).default(200),
  maxRoutes: z.number().int().min(1).max(2_000).default(200),
});

export const DiffSavedSettingsSchema = z.object({
  beforeFilePath: z
    .string()
    .min(1)
    .describe('Older absolute .xml path under configured saved-settings roots.'),
  afterFilePath: z
    .string()
    .min(1)
    .describe('Newer absolute .xml path under configured saved-settings roots.'),
  maxItems: z.number().int().min(1).max(500).default(100),
});

function readPolicy(config: VbMatrixConfig) {
  return {
    allowedRoots: config.matrixFiles?.savedSettingsRoots ?? [],
    maxFileBytes: config.matrixFiles?.savedSettingsMaxBytes,
  };
}

function exactMatch(actual: string, expected: string | undefined): boolean {
  return expected === undefined || actual.toUpperCase() === expected.toUpperCase();
}

function filterSlots(
  settings: LoadedSavedSettings,
  input: z.infer<typeof InspectSavedSettingsSchema>
): SavedSettingsSlot[] {
  return settings.slots.filter((slot) => {
    if (input.slotKind !== undefined && slot.kind !== input.slotKind) return false;
    if (input.onlineOnly && !slot.online) return false;
    return true;
  });
}

function filterRoutes(
  settings: LoadedSavedSettings,
  input: z.infer<typeof InspectSavedSettingsSchema>
): SavedSettingsRoute[] {
  return settings.routes.filter((route) => {
    if (!exactMatch(route.inputSuid, input.inputSuid)) return false;
    if (input.inputChannel !== undefined && route.inputChannel !== input.inputChannel) return false;
    if (!exactMatch(route.outputSuid, input.outputSuid)) return false;
    if (input.outputChannel !== undefined && route.outputChannel !== input.outputChannel) return false;
    if (!input.includeMuted && route.muted) return false;
    return true;
  });
}

function cappedItems<T>(items: T[], maxItems: number) {
  return {
    matchedCount: items.length,
    returnedCount: Math.min(items.length, maxItems),
    truncated: items.length > maxItems,
    items: items.slice(0, maxItems),
  };
}

function publicSlot(slot: SavedSettingsSlot): Omit<SavedSettingsSlot, 'attributes'> {
  const { attributes, ...result } = slot;
  void attributes;
  return result;
}

function publicRoute(route: SavedSettingsRoute): Omit<SavedSettingsRoute, 'attributes'> {
  const { attributes, ...result } = route;
  void attributes;
  return result;
}

export async function runInspectSavedSettings(
  input: z.infer<typeof InspectSavedSettingsSchema>,
  config: VbMatrixConfig = getConfig()
): Promise<Record<string, unknown>> {
  const settings = await loadMatrixSavedSettingsFile(input.filePath, readPolicy(config));
  const slots = filterSlots(settings, input);
  const routes = filterRoutes(settings, input);
  return {
    ok: true,
    stateSource: settings.stateSource,
    liveState: settings.liveState,
    caveat: 'This is persisted file state and may differ from the currently running Matrix engine.',
    file: settings.file,
    schemaVersion: settings.schemaVersion,
    rootElement: settings.rootElement,
    sectionCounts: settings.sectionCounts,
    summary: settings.summary,
    filters: {
      slotKind: input.slotKind,
      onlineOnly: input.onlineOnly,
      inputSuid: input.inputSuid,
      inputChannel: input.inputChannel,
      outputSuid: input.outputSuid,
      outputChannel: input.outputChannel,
      includeMuted: input.includeMuted,
    },
    slots: cappedItems(slots.map(publicSlot), input.maxSlots),
    routes: cappedItems(routes.map(publicRoute), input.maxRoutes),
  };
}

function cappedDiff<T>(items: T[], maxItems: number) {
  return {
    count: items.length,
    truncated: items.length > maxItems,
    items: items.slice(0, maxItems),
  };
}

export async function runDiffSavedSettings(
  input: z.infer<typeof DiffSavedSettingsSchema>,
  config: VbMatrixConfig = getConfig()
): Promise<Record<string, unknown>> {
  const policy = readPolicy(config);
  const [before, after] = await Promise.all([
    loadMatrixSavedSettingsFile(input.beforeFilePath, policy),
    loadMatrixSavedSettingsFile(input.afterFilePath, policy),
  ]);
  const diff = diffMatrixSavedSettings(before, after);
  const sections = [
    diff.routes.added,
    diff.routes.removed,
    diff.routes.changed,
    diff.slots.added,
    diff.slots.removed,
    diff.slots.changed,
  ];

  return {
    ok: true,
    stateSource: 'saved-settings-file',
    liveState: false,
    caveat: 'This compares two persisted files and does not query or modify the running Matrix engine.',
    before: { file: before.file, summary: before.summary },
    after: { file: after.file, summary: after.summary },
    routes: {
      added: cappedDiff(diff.routes.added.map(publicRoute), input.maxItems),
      removed: cappedDiff(diff.routes.removed.map(publicRoute), input.maxItems),
      changed: cappedDiff(
        diff.routes.changed.map(({ before: beforeRoute, after: afterRoute }) => ({
          before: publicRoute(beforeRoute),
          after: publicRoute(afterRoute),
        })),
        input.maxItems
      ),
    },
    slots: {
      added: cappedDiff(diff.slots.added.map(publicSlot), input.maxItems),
      removed: cappedDiff(diff.slots.removed.map(publicSlot), input.maxItems),
      changed: cappedDiff(
        diff.slots.changed.map(({ before: beforeSlot, after: afterSlot }) => ({
          before: publicSlot(beforeSlot),
          after: publicSlot(afterSlot),
        })),
        input.maxItems
      ),
    },
    truncated: sections.some((items) => items.length > input.maxItems),
  };
}

function savedSettingsToolError(error: unknown, fallback: string) {
  if (error instanceof SavedSettingsError) {
    return toolError(error.message, { error: error.message, code: error.code });
  }
  return toolError(error instanceof Error ? error.message : fallback);
}

export function registerSavedSettingsTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_inspect_saved_settings',
    {
      description:
        'Inspect bounded slot and route topology from a saved VB-Audio Matrix XML file under configured roots. This does not query live Matrix state.',
      inputSchema: InspectSavedSettingsSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runInspectSavedSettings(InspectSavedSettingsSchema.parse(args)));
      } catch (error) {
        return savedSettingsToolError(error, 'Unknown saved Matrix settings inspection error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_diff_saved_settings',
    {
      description:
        'Compare slots and routing points in two saved VB-Audio Matrix XML files under configured roots. This does not query or modify live Matrix state.',
      inputSchema: DiffSavedSettingsSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runDiffSavedSettings(DiffSavedSettingsSchema.parse(args)));
      } catch (error) {
        return savedSettingsToolError(error, 'Unknown saved Matrix settings diff error');
      }
    }
  );
}
