import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { SaxesParser } from 'saxes';

export const DEFAULT_SAVED_SETTINGS_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_SAVED_SETTINGS_MAX_BYTES = 64 * 1024 * 1024;
const MAX_XML_ELEMENTS = 250_000;
const MAX_DISTINCT_ELEMENT_NAMES = 256;
const MAX_ATTRIBUTES_PER_ELEMENT = 64;
const MAX_ATTRIBUTE_VALUE_LENGTH = 4_096;
const MAX_PARSED_SLOTS = 4_096;
const MAX_PARSED_ROUTES = 100_000;
const MAX_SUMMARY_ROUTE_GROUPS = 200;
const SLOT_ELEMENTS = new Set(['CLOCKSlot', 'AMDevice', 'VAIOSlot', 'VBANSlot', 'VASIOSlot']);

export type SavedSettingsSlotKind =
  | 'clock'
  | 'vaio'
  | 'vban'
  | 'virtual_asio'
  | 'asio_device'
  | 'windows_device'
  | 'unknown';

export interface SavedSettingsFileIdentity {
  requestedPath: string;
  resolvedPath: string;
  matchedRoot: string;
  sizeBytes: number;
  modifiedAt: string;
  sha256: string;
}

export interface SavedSettingsSlot {
  suid: string;
  kind: SavedSettingsSlotKind;
  element: string;
  name: string;
  online: boolean;
  master: boolean;
  deviceType: string;
  guid: string;
  latency: string;
  outputDelayEnabled: boolean;
  outputDelayMs: number | null;
  attributes: Record<string, string>;
}

export interface SavedSettingsRoute {
  index: number;
  inputSuid: string;
  inputChannel: number | null;
  outputSuid: string;
  outputChannel: number | null;
  gainDb: number | null;
  gainText: string;
  muted: boolean;
  phaseReversed: boolean;
  attributes: Record<string, string>;
}

export interface SavedSettingsSummary {
  slotCount: number;
  slotCountByKind: Record<string, number>;
  onlineSlotsByKind: Record<string, string[]>;
  masterSuids: string[];
  routeCount: number;
  mutedRouteCount: number;
  phaseReversedRouteCount: number;
  routeGroupCount: number;
  routeGroupsTruncated: boolean;
  routeGroups: { inputSuid: string; outputSuid: string; routeCount: number }[];
}

export interface ParsedSavedSettings {
  schemaVersion: 'vbmatrix.saved-settings.v1';
  rootElement: 'VBAudioMatrixSettings';
  sectionCounts: Record<string, number>;
  slots: SavedSettingsSlot[];
  routes: SavedSettingsRoute[];
  summary: SavedSettingsSummary;
}

export interface LoadedSavedSettings extends ParsedSavedSettings {
  stateSource: 'saved-settings-file';
  liveState: false;
  file: SavedSettingsFileIdentity;
}

export interface SavedSettingsReadPolicy {
  allowedRoots: string[];
  maxFileBytes?: number;
}

export class SavedSettingsError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'SavedSettingsError';
  }
}

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function sortedRecord(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function slotKind(element: string, suid: string): SavedSettingsSlotKind {
  if (element === 'CLOCKSlot') return 'clock';
  if (element === 'VAIOSlot') return 'vaio';
  if (element === 'VBANSlot') return 'vban';
  if (element === 'VASIOSlot') return 'virtual_asio';
  if (suid.toUpperCase().startsWith('ASIO')) return 'asio_device';
  if (suid.toUpperCase().startsWith('WIN')) return 'windows_device';
  return 'unknown';
}

function parseSlot(element: string, attributes: Record<string, string>): SavedSettingsSlot {
  const suid = attributes.uniq ?? '';
  return {
    suid,
    kind: slotKind(element, suid),
    element,
    name: attributes.name ?? '',
    online: parseBoolean(attributes.online, element === 'AMDevice' && suid !== ''),
    master: parseBoolean(attributes.master),
    deviceType: attributes.type ?? '',
    guid: attributes.guid ?? '',
    latency: attributes.latency ?? '',
    outputDelayEnabled: parseBoolean(attributes.ODelayOn),
    outputDelayMs: parseNumber(attributes.ODelayMs),
    attributes: { ...attributes },
  };
}

function parseRoute(index: number, attributes: Record<string, string>): SavedSettingsRoute {
  return {
    index,
    inputSuid: attributes.slotin ?? '',
    inputChannel: parseInteger(attributes.in),
    outputSuid: attributes.slotout ?? '',
    outputChannel: parseInteger(attributes.out),
    gainDb: parseNumber(attributes.dBGain),
    gainText: attributes.dBGain ?? '',
    muted: parseBoolean(attributes.mute),
    phaseReversed: parseBoolean(attributes.phase),
    attributes: { ...attributes },
  };
}

function summarizeSavedSettings(
  slots: SavedSettingsSlot[],
  routes: SavedSettingsRoute[]
): SavedSettingsSummary {
  const slotCountByKind: Record<string, number> = {};
  const onlineSlotsByKind: Record<string, string[]> = {};
  for (const slot of slots) {
    slotCountByKind[slot.kind] = (slotCountByKind[slot.kind] ?? 0) + 1;
    if (slot.online) (onlineSlotsByKind[slot.kind] ??= []).push(slot.suid);
  }
  for (const suids of Object.values(onlineSlotsByKind))
    suids.sort((left, right) => left.localeCompare(right));

  const groupCounts = new Map<string, { inputSuid: string; outputSuid: string; routeCount: number }>();
  for (const route of routes) {
    const key = `${route.inputSuid}\u0000${route.outputSuid}`;
    const current = groupCounts.get(key);
    if (current === undefined) {
      groupCounts.set(key, { inputSuid: route.inputSuid, outputSuid: route.outputSuid, routeCount: 1 });
    } else {
      current.routeCount += 1;
    }
  }

  const routeGroups = [...groupCounts.values()].sort(
    (left, right) =>
      right.routeCount - left.routeCount ||
      left.inputSuid.localeCompare(right.inputSuid) ||
      left.outputSuid.localeCompare(right.outputSuid)
  );

  return {
    slotCount: slots.length,
    slotCountByKind: sortedRecord(slotCountByKind),
    onlineSlotsByKind: Object.fromEntries(
      Object.entries(onlineSlotsByKind).sort(([left], [right]) => left.localeCompare(right))
    ),
    masterSuids: slots
      .filter((slot) => slot.master)
      .map((slot) => slot.suid)
      .sort((left, right) => left.localeCompare(right)),
    routeCount: routes.length,
    mutedRouteCount: routes.filter((route) => route.muted).length,
    phaseReversedRouteCount: routes.filter((route) => route.phaseReversed).length,
    routeGroupCount: routeGroups.length,
    routeGroupsTruncated: routeGroups.length > MAX_SUMMARY_ROUTE_GROUPS,
    routeGroups: routeGroups.slice(0, MAX_SUMMARY_ROUTE_GROUPS),
  };
}

export function parseMatrixSavedSettingsXml(xml: string): ParsedSavedSettings {
  const slots: SavedSettingsSlot[] = [];
  const routes: SavedSettingsRoute[] = [];
  const sectionCounts: Record<string, number> = {};
  const distinctElementNames = new Set<string>();
  const elementStack: string[] = [];
  let rootElement = '';
  let elementCount = 0;

  const parser = new SaxesParser({ xmlns: false, position: true });
  parser.on('doctype', () => {
    throw new SavedSettingsError(
      'saved_settings_doctype_forbidden',
      'Matrix saved settings XML must not contain a DOCTYPE'
    );
  });
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    elementCount += 1;
    if (elementCount > MAX_XML_ELEMENTS) {
      throw new SavedSettingsError(
        'saved_settings_structure_too_large',
        `Matrix saved settings XML exceeds the ${MAX_XML_ELEMENTS} element limit`
      );
    }

    if (elementStack.length === 0) rootElement = tag.name;
    distinctElementNames.add(tag.name);
    if (distinctElementNames.size > MAX_DISTINCT_ELEMENT_NAMES) {
      throw new SavedSettingsError(
        'saved_settings_structure_too_large',
        `Matrix saved settings XML exceeds the ${MAX_DISTINCT_ELEMENT_NAMES} distinct element-name limit`
      );
    }
    sectionCounts[tag.name] = (sectionCounts[tag.name] ?? 0) + 1;
    const attributes = { ...tag.attributes };
    const attributeValues = Object.values(attributes);
    if (attributeValues.length > MAX_ATTRIBUTES_PER_ELEMENT) {
      throw new SavedSettingsError(
        'saved_settings_structure_too_large',
        `Matrix saved settings XML element exceeds the ${MAX_ATTRIBUTES_PER_ELEMENT} attribute limit`
      );
    }
    if (attributeValues.some((value) => value.length > MAX_ATTRIBUTE_VALUE_LENGTH)) {
      throw new SavedSettingsError(
        'saved_settings_structure_too_large',
        `Matrix saved settings XML attribute exceeds the ${MAX_ATTRIBUTE_VALUE_LENGTH} character limit`
      );
    }

    if (SLOT_ELEMENTS.has(tag.name)) {
      if (slots.length >= MAX_PARSED_SLOTS) {
        throw new SavedSettingsError(
          'saved_settings_slot_limit_exceeded',
          `Matrix saved settings XML exceeds the ${MAX_PARSED_SLOTS} slot limit`
        );
      }
      slots.push(parseSlot(tag.name, attributes));
    }

    if (tag.name === 'Point' && elementStack.at(-1) === 'VBAudioMatrixGridConfiguration') {
      if (routes.length >= MAX_PARSED_ROUTES) {
        throw new SavedSettingsError(
          'saved_settings_route_limit_exceeded',
          `Matrix saved settings XML exceeds the ${MAX_PARSED_ROUTES} route limit`
        );
      }
      routes.push(parseRoute(routes.length + 1, attributes));
    }

    elementStack.push(tag.name);
  });
  parser.on('closetag', () => {
    elementStack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof SavedSettingsError) throw error;
    throw new SavedSettingsError(
      'saved_settings_invalid_xml',
      `Unable to parse Matrix saved settings XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (rootElement !== 'VBAudioMatrixSettings') {
    throw new SavedSettingsError(
      'saved_settings_wrong_root',
      `Expected VBAudioMatrixSettings root element, received ${rootElement || 'none'}`
    );
  }

  return {
    schemaVersion: 'vbmatrix.saved-settings.v1',
    rootElement: 'VBAudioMatrixSettings',
    sectionCounts: sortedRecord(sectionCounts),
    slots,
    routes,
    summary: summarizeSavedSettings(slots, routes),
  };
}

function isUncPath(value: string): boolean {
  return process.platform === 'win32' && value.replaceAll('/', '\\').startsWith('\\\\');
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function validatedMaxBytes(value: number | undefined): number {
  const selected = value ?? DEFAULT_SAVED_SETTINGS_MAX_BYTES;
  if (!Number.isInteger(selected) || selected < 1_024 || selected > MAX_SAVED_SETTINGS_MAX_BYTES) {
    throw new SavedSettingsError(
      'saved_settings_invalid_size_limit',
      `Saved settings maximum file size must be an integer from 1024 to ${MAX_SAVED_SETTINGS_MAX_BYTES} bytes`
    );
  }
  return selected;
}

async function canonicalDirectory(root: string): Promise<string> {
  if (isUncPath(root)) {
    throw new SavedSettingsError(
      'saved_settings_unc_forbidden',
      'Saved settings roots must not be UNC paths'
    );
  }
  if (!path.isAbsolute(root)) {
    throw new SavedSettingsError(
      'saved_settings_root_not_absolute',
      'Saved settings roots must be absolute paths'
    );
  }
  let resolved: string;
  try {
    resolved = await realpath(root);
  } catch {
    throw new SavedSettingsError(
      'saved_settings_root_unavailable',
      'Configured saved settings root does not exist'
    );
  }
  const rootStat = await stat(resolved);
  if (!rootStat.isDirectory()) {
    throw new SavedSettingsError(
      'saved_settings_root_not_directory',
      'Configured saved settings root is not a directory'
    );
  }
  return resolved;
}

async function resolveSavedSettingsFile(
  requestedPath: string,
  allowedRoots: string[]
): Promise<{ resolvedPath: string; matchedRoot: string }> {
  if (allowedRoots.length === 0) {
    throw new SavedSettingsError(
      'saved_settings_roots_not_configured',
      'No saved settings roots configured; set VBMATRIX_MCP_SAVED_SETTINGS_ROOTS'
    );
  }
  if (isUncPath(requestedPath)) {
    throw new SavedSettingsError(
      'saved_settings_unc_forbidden',
      'Saved settings file paths must not be UNC paths'
    );
  }
  if (!path.isAbsolute(requestedPath)) {
    throw new SavedSettingsError(
      'saved_settings_path_not_absolute',
      'Saved settings file path must be absolute'
    );
  }
  if (path.extname(requestedPath).toLowerCase() !== '.xml') {
    throw new SavedSettingsError(
      'saved_settings_extension_forbidden',
      'Saved settings file extension must be .xml'
    );
  }

  const canonicalRoots = await Promise.all(allowedRoots.map(canonicalDirectory));
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requestedPath);
  } catch {
    throw new SavedSettingsError('saved_settings_file_not_found', 'Saved settings file does not exist');
  }
  const matchedRoot = canonicalRoots.find((root) => isInsideRoot(resolvedPath, root));
  if (matchedRoot === undefined) {
    throw new SavedSettingsError(
      'saved_settings_path_outside_roots',
      'Saved settings file path is outside configured roots'
    );
  }
  return { resolvedPath, matchedRoot };
}

export async function loadMatrixSavedSettingsFile(
  requestedPath: string,
  policy: SavedSettingsReadPolicy
): Promise<LoadedSavedSettings> {
  const maxFileBytes = validatedMaxBytes(policy.maxFileBytes);
  const { resolvedPath, matchedRoot } = await resolveSavedSettingsFile(requestedPath, policy.allowedRoots);
  const handle = await open(resolvedPath, 'r');
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new SavedSettingsError(
        'saved_settings_not_regular_file',
        'Saved settings path must resolve to a regular file'
      );
    }
    if (fileStat.size > maxFileBytes) {
      throw new SavedSettingsError(
        'saved_settings_file_too_large',
        `Saved settings file exceeds the configured ${maxFileBytes} byte limit`
      );
    }
    const contents = await handle.readFile();
    if (contents.byteLength > maxFileBytes) {
      throw new SavedSettingsError(
        'saved_settings_file_too_large',
        `Saved settings file exceeds the configured ${maxFileBytes} byte limit`
      );
    }
    const parsed = parseMatrixSavedSettingsXml(contents.toString('utf8'));
    return {
      ...parsed,
      stateSource: 'saved-settings-file',
      liveState: false,
      file: {
        requestedPath,
        resolvedPath,
        matchedRoot,
        sizeBytes: contents.byteLength,
        modifiedAt: fileStat.mtime.toISOString(),
        sha256: createHash('sha256').update(contents).digest('hex'),
      },
    };
  } finally {
    await handle.close();
  }
}

function routeKey(route: SavedSettingsRoute): string {
  return [
    route.inputSuid.toUpperCase(),
    route.inputChannel,
    route.outputSuid.toUpperCase(),
    route.outputChannel,
  ].join('\u0000');
}

function comparableRouteState(route: SavedSettingsRoute): Record<string, unknown> {
  return { gainDb: route.gainDb, muted: route.muted, phaseReversed: route.phaseReversed };
}

function comparableSlotState(slot: SavedSettingsSlot): Record<string, unknown> {
  return {
    kind: slot.kind,
    element: slot.element,
    name: slot.name,
    online: slot.online,
    master: slot.master,
    deviceType: slot.deviceType,
    guid: slot.guid,
    latency: slot.latency,
    outputDelayEnabled: slot.outputDelayEnabled,
    outputDelayMs: slot.outputDelayMs,
    attributes: Object.fromEntries(
      Object.entries(slot.attributes).sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

function sameValue(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface SavedSettingsDiff {
  routes: {
    added: SavedSettingsRoute[];
    removed: SavedSettingsRoute[];
    changed: { before: SavedSettingsRoute; after: SavedSettingsRoute }[];
  };
  slots: {
    added: SavedSettingsSlot[];
    removed: SavedSettingsSlot[];
    changed: { before: SavedSettingsSlot; after: SavedSettingsSlot }[];
  };
}

function uniqueMap<T>(
  items: T[],
  keyFor: (item: T) => string,
  code: string,
  message: string
): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyFor(item);
    if (result.has(key)) throw new SavedSettingsError(code, message);
    result.set(key, item);
  }
  return result;
}

export function diffMatrixSavedSettings(
  before: ParsedSavedSettings,
  after: ParsedSavedSettings
): SavedSettingsDiff {
  const duplicateRouteMessage =
    'Saved settings contain duplicate routing-point coordinates and cannot be diffed deterministically';
  const beforeRoutes = uniqueMap(
    before.routes,
    routeKey,
    'saved_settings_duplicate_route',
    duplicateRouteMessage
  );
  const afterRoutes = uniqueMap(
    after.routes,
    routeKey,
    'saved_settings_duplicate_route',
    duplicateRouteMessage
  );

  const beforeSlotCandidates = before.slots.filter((slot) => slot.suid !== '');
  const afterSlotCandidates = after.slots.filter((slot) => slot.suid !== '');
  const duplicateSlotMessage =
    'Saved settings contain duplicate non-empty slot SUIDs and cannot be diffed deterministically';
  const slotKey = (slot: SavedSettingsSlot) => slot.suid.toUpperCase();
  const beforeSlots = uniqueMap(
    beforeSlotCandidates,
    slotKey,
    'saved_settings_duplicate_slot',
    duplicateSlotMessage
  );
  const afterSlots = uniqueMap(
    afterSlotCandidates,
    slotKey,
    'saved_settings_duplicate_slot',
    duplicateSlotMessage
  );

  const routeKeys = [...new Set([...beforeRoutes.keys(), ...afterRoutes.keys()])].sort();
  const slotKeys = [...new Set([...beforeSlots.keys(), ...afterSlots.keys()])].sort();
  const diff: SavedSettingsDiff = {
    routes: { added: [], removed: [], changed: [] },
    slots: { added: [], removed: [], changed: [] },
  };

  for (const key of routeKeys) {
    const beforeRoute = beforeRoutes.get(key);
    const afterRoute = afterRoutes.get(key);
    if (beforeRoute === undefined && afterRoute !== undefined) diff.routes.added.push(afterRoute);
    else if (beforeRoute !== undefined && afterRoute === undefined) diff.routes.removed.push(beforeRoute);
    else if (
      beforeRoute !== undefined &&
      afterRoute !== undefined &&
      !sameValue(comparableRouteState(beforeRoute), comparableRouteState(afterRoute))
    ) {
      diff.routes.changed.push({ before: beforeRoute, after: afterRoute });
    }
  }

  for (const key of slotKeys) {
    const beforeSlot = beforeSlots.get(key);
    const afterSlot = afterSlots.get(key);
    if (beforeSlot === undefined && afterSlot !== undefined) diff.slots.added.push(afterSlot);
    else if (beforeSlot !== undefined && afterSlot === undefined) diff.slots.removed.push(beforeSlot);
    else if (
      beforeSlot !== undefined &&
      afterSlot !== undefined &&
      !sameValue(comparableSlotState(beforeSlot), comparableSlotState(afterSlot))
    ) {
      diff.slots.changed.push({ before: beforeSlot, after: afterSlot });
    }
  }

  return diff;
}
