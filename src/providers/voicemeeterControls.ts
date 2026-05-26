import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { destructiveToolAnnotations, readOnlyToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import {
  runVoicemeeterOperation,
  voicemeeterEditionMetadata,
  type VoicemeeterEditionMetadata,
} from './voicemeeterHelper.js';

const MAX_LEVEL_CHANNELS = 64;
const STRIP_FLOAT_PROPERTIES = ['gain', 'mute', 'solo', 'mono', 'A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3'] as const;
const STRIP_STRING_PROPERTIES = ['name', 'label'] as const;
const BUS_FLOAT_PROPERTIES = ['gain', 'mute', 'mono'] as const;
const BUS_STRING_PROPERTIES = ['name', 'label'] as const;
const DEVICE_DRIVERS = ['mme', 'wdm', 'ks', 'asio'] as const;

type RunOperation = typeof runVoicemeeterOperation;
type ParameterKind = 'float' | 'string';

interface RemoteParameter {
  name: string;
  kind: ParameterKind;
}

interface ParameterWrite extends RemoteParameter {
  value: number | string;
}

const GetVoicemeeterStripSchema = z.object({
  index: z.number().int().min(0).describe('Zero-based Voicemeeter strip index.'),
  properties: z.array(z.enum([...STRIP_FLOAT_PROPERTIES, ...STRIP_STRING_PROPERTIES])).default([]),
});

const GetVoicemeeterBusSchema = z.object({
  index: z.number().int().min(0).describe('Zero-based Voicemeeter bus index.'),
  properties: z.array(z.enum([...BUS_FLOAT_PROPERTIES, ...BUS_STRING_PROPERTIES])).default([]),
});

const LevelTypeSchema = z.enum(['inputPreFader', 'inputPostFader', 'inputPostMute', 'output']);

const GetVoicemeeterLevelsSchema = z.object({
  levelType: LevelTypeSchema,
  channels: z.array(z.number().int().min(0)).min(1).max(MAX_LEVEL_CHANNELS),
});

const SetVoicemeeterStripParameterSchema = z.object({
  index: z.number().int().min(0),
  property: z.enum([...STRIP_FLOAT_PROPERTIES, ...STRIP_STRING_PROPERTIES]),
  value: z.union([z.number(), z.boolean(), z.string()]),
});

const SetVoicemeeterBusParameterSchema = z.object({
  index: z.number().int().min(0),
  property: z.enum([...BUS_FLOAT_PROPERTIES, ...BUS_STRING_PROPERTIES]),
  value: z.union([z.number(), z.boolean(), z.string()]),
});

const SetVoicemeeterDeviceSchema = z.object({
  target: z.enum(['strip', 'bus']),
  index: z.number().int().min(0),
  driver: z.enum(DEVICE_DRIVERS),
  deviceName: z.string().describe('Exact device name from voicemeeter_get_devices, or empty string to remove.'),
  confirm: z.literal(true).describe('Required because device changes can disrupt live audio.'),
});

const MacroButtonModeSchema = z.enum(['default', 'stateOnly', 'trigger', 'color']);

const GetVoicemeeterMacroButtonSchema = z.object({
  index: z.number().int().min(0).max(79),
  mode: MacroButtonModeSchema.default('default'),
});

const SetVoicemeeterMacroButtonSchema = z.object({
  index: z.number().int().min(0).max(79),
  mode: MacroButtonModeSchema.default('trigger'),
  value: z.union([z.number(), z.boolean()]),
  confirm: z.literal(true).describe('Required because MacroButtons can run user-configured actions.'),
});

const RawVoicemeeterRemoteApiSchema = z.object({
  operation: z.enum(['getFloat', 'getString', 'setFloat', 'setString', 'script']),
  parameter: z.string().optional().describe('Exact Voicemeeter Remote API parameter path.'),
  value: z.union([z.number(), z.string()]).optional(),
  script: z.string().max(48 * 1024).optional().describe('Exact SetParameters script, under 48 KiB.'),
});

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('Voicemeeter boolean environment values must be true or false');
}

function safetyPolicy(env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  return {
    disableWrites: parseBoolean(env.VOICEMEETER_MCP_DISABLE_WRITES, false),
    disableDestructive: parseBoolean(env.VOICEMEETER_MCP_DISABLE_DESTRUCTIVE, false),
    disableRawRemoteApi: parseBoolean(env.VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API, false),
  };
}

function assertWritesAllowed(env: Record<string, string | undefined> = process.env): void {
  if (parseBoolean(env.VOICEMEETER_MCP_DISABLE_WRITES, false)) {
    throw new Error('Voicemeeter writes are disabled by VOICEMEETER_MCP_DISABLE_WRITES=true');
  }
}

function assertDestructiveAllowed(env: Record<string, string | undefined> = process.env): void {
  if (parseBoolean(env.VOICEMEETER_MCP_DISABLE_DESTRUCTIVE, false)) {
    throw new Error('Voicemeeter destructive actions are disabled by VOICEMEETER_MCP_DISABLE_DESTRUCTIVE=true');
  }
}

function assertRawAllowed(env: Record<string, string | undefined> = process.env): void {
  if (parseBoolean(env.VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API, false)) {
    throw new Error('Raw Voicemeeter Remote API is disabled by VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API=true');
  }
}

function requireOk(result: Record<string, unknown>, operation: string): void {
  if (result.ok !== true) {
    throw new Error(`${operation} failed: ${typeof result.error === 'string' ? result.error : 'helper returned ok=false'}`);
  }
}

function parameterKind(property: string): ParameterKind {
  return property === 'name' || property === 'label' ? 'string' : 'float';
}

function routePropertiesForEdition(edition: VoicemeeterEditionMetadata): string[] {
  if (edition.name === 'standard') return ['A1', 'B1'];
  if (edition.name === 'banana') return ['A1', 'A2', 'A3', 'B1', 'B2'];
  if (edition.name === 'potato') return ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3'];
  return [];
}

function validateStripProperty(property: string, edition: VoicemeeterEditionMetadata): void {
  if (property.startsWith('A') || property.startsWith('B')) {
    const routes = routePropertiesForEdition(edition);
    if (!routes.includes(property)) {
      throw new Error(`Route ${property} is not valid for Voicemeeter edition ${edition.name}`);
    }
  }
}

function validateIndex(index: number, count: number, label: string): void {
  if (index >= count) throw new Error(`${label} index ${index} is outside detected count ${count}`);
}

function levelTypeNumber(levelType: z.infer<typeof LevelTypeSchema>): number {
  if (levelType === 'inputPreFader') return 0;
  if (levelType === 'inputPostFader') return 1;
  if (levelType === 'inputPostMute') return 2;
  return 3;
}

function levelChannelLimit(levelType: z.infer<typeof LevelTypeSchema>, edition: VoicemeeterEditionMetadata): number {
  if (levelType === 'output') {
    if (edition.name === 'standard') return 16;
    if (edition.name === 'banana') return 40;
    if (edition.name === 'potato') return 64;
  }
  if (edition.name === 'standard') return 12;
  if (edition.name === 'banana') return 22;
  if (edition.name === 'potato') return 34;
  return 0;
}

function macroModeNumber(mode: z.infer<typeof MacroButtonModeSchema>): number {
  if (mode === 'stateOnly') return 2;
  if (mode === 'trigger') return 3;
  if (mode === 'color') return 4;
  return 0;
}

function stripParameter(index: number, property: string): RemoteParameter {
  return { name: `Strip[${index}].${property}`, kind: parameterKind(property) };
}

function busParameter(index: number, property: string): RemoteParameter {
  return { name: `Bus[${index}].${property}`, kind: parameterKind(property) };
}

async function getEdition(runOperation: RunOperation = runVoicemeeterOperation): Promise<VoicemeeterEditionMetadata> {
  const status = await runOperation('status');
  requireOk(status, 'Voicemeeter status');
  if (typeof status.type !== 'number') throw new Error('Voicemeeter status did not include a numeric type');
  const edition = voicemeeterEditionMetadata(status.type);
  if (edition.name === 'unknown') throw new Error(`Unsupported Voicemeeter type ${status.type}`);
  return edition;
}

async function getParameters(parameters: RemoteParameter[], runOperation: RunOperation): Promise<Record<string, unknown>> {
  return runOperation('get-parameters', { parameters });
}

async function setParameters(parameters: ParameterWrite[], runOperation: RunOperation): Promise<Record<string, unknown>> {
  return runOperation('set-parameters', { parameters });
}

function coerceWriteValue(property: string, value: number | boolean | string): number | string {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (parameterKind(property) === 'string') return String(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${property} requires a finite number or boolean`);
  return value;
}

function firstParameterResult(result: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const parameters = result.parameters;
  if (!Array.isArray(parameters)) return undefined;
  return parameters.find((parameter): parameter is Record<string, unknown> => {
    if (typeof parameter !== 'object' || parameter === null) return false;
    return (parameter as Record<string, unknown>).name === name;
  });
}

function resultCodeOk(result: unknown): boolean {
  return typeof result === 'number' ? result === 0 : result === undefined;
}

function parameterWriteAccepted(write: Record<string, unknown>, name: string): boolean {
  const parameter = firstParameterResult(write, name);
  return write.ok === true && parameter !== undefined && resultCodeOk(parameter.result);
}

function valuesMatch(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) < 0.0001;
  return Object.is(left, right);
}

function macroRequestedValue(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function macroWriteAccepted(write: Record<string, unknown>): boolean {
  return write.ok === true && resultCodeOk(write.result);
}

export async function runGetVoicemeeterDevices(runOperation: RunOperation = runVoicemeeterOperation): Promise<Record<string, unknown>> {
  return runOperation('devices');
}

export async function runGetVoicemeeterStrip(
  input: z.infer<typeof GetVoicemeeterStripSchema>,
  runOperation: RunOperation = runVoicemeeterOperation
): Promise<Record<string, unknown>> {
  const edition = await getEdition(runOperation);
  validateIndex(input.index, edition.strips, 'Strip');
  const properties = input.properties.length > 0 ? input.properties : ['gain', 'mute', 'solo', 'mono', 'name', ...routePropertiesForEdition(edition)];
  for (const property of properties) validateStripProperty(property, edition);
  const result = await getParameters(properties.map((property) => stripParameter(input.index, property)), runOperation);
  return { ok: result.ok === true, target: { kind: 'strip', index: input.index }, edition, result };
}

export async function runGetVoicemeeterBus(
  input: z.infer<typeof GetVoicemeeterBusSchema>,
  runOperation: RunOperation = runVoicemeeterOperation
): Promise<Record<string, unknown>> {
  const edition = await getEdition(runOperation);
  validateIndex(input.index, edition.buses, 'Bus');
  const properties = input.properties.length > 0 ? input.properties : ['gain', 'mute', 'mono', 'name'];
  const result = await getParameters(properties.map((property) => busParameter(input.index, property)), runOperation);
  return { ok: result.ok === true, target: { kind: 'bus', index: input.index }, edition, result };
}

export async function runGetVoicemeeterLevels(
  input: z.infer<typeof GetVoicemeeterLevelsSchema>,
  runOperation: RunOperation = runVoicemeeterOperation
): Promise<Record<string, unknown>> {
  const edition = await getEdition(runOperation);
  const limit = levelChannelLimit(input.levelType, edition);
  const invalid = input.channels.find((channel) => channel >= limit);
  if (invalid !== undefined) throw new Error(`Level channel ${invalid} is outside ${input.levelType} limit ${limit}`);
  return runOperation('get-levels', { levelType: levelTypeNumber(input.levelType), channels: input.channels });
}

export async function runSetVoicemeeterStripParameter(
  input: z.infer<typeof SetVoicemeeterStripParameterSchema>,
  runOperation: RunOperation = runVoicemeeterOperation,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  assertWritesAllowed(env);
  const edition = await getEdition(runOperation);
  validateIndex(input.index, edition.strips, 'Strip');
  validateStripProperty(input.property, edition);
  const parameter = stripParameter(input.index, input.property);
  const before = await getParameters([parameter], runOperation);
  const write = await setParameters([{ ...parameter, value: coerceWriteValue(input.property, input.value) }], runOperation);
  const after = await getParameters([parameter], runOperation);
  return { ok: write.ok === true, target: { kind: 'strip', index: input.index }, parameter, before, write, after, safety: safetyPolicy(env) };
}

export async function runSetVoicemeeterBusParameter(
  input: z.infer<typeof SetVoicemeeterBusParameterSchema>,
  runOperation: RunOperation = runVoicemeeterOperation,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  assertWritesAllowed(env);
  const edition = await getEdition(runOperation);
  validateIndex(input.index, edition.buses, 'Bus');
  const parameter = busParameter(input.index, input.property);
  const before = await getParameters([parameter], runOperation);
  const write = await setParameters([{ ...parameter, value: coerceWriteValue(input.property, input.value) }], runOperation);
  const after = await getParameters([parameter], runOperation);
  return { ok: write.ok === true, target: { kind: 'bus', index: input.index }, parameter, before, write, after, safety: safetyPolicy(env) };
}

export async function runSetVoicemeeterDevice(
  input: z.infer<typeof SetVoicemeeterDeviceSchema>,
  runOperation: RunOperation = runVoicemeeterOperation,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  assertWritesAllowed(env);
  assertDestructiveAllowed(env);
  const edition = await getEdition(runOperation);
  validateIndex(input.index, input.target === 'strip' ? edition.strips : edition.buses, input.target);
  const prefix = input.target === 'strip' ? 'Strip' : 'Bus';
  const parameter = { name: `${prefix}[${input.index}].device.${input.driver}`, kind: 'string' as const };
  const stateParameter = { name: `${prefix}[${input.index}].device.name`, kind: 'string' as const };
  const before = await getParameters([stateParameter], runOperation);
  const write = await setParameters([{ ...parameter, value: input.deviceName }], runOperation);
  const after = await getParameters([stateParameter], runOperation);
  const beforeObservation = firstParameterResult(before, stateParameter.name);
  const afterObservation = firstParameterResult(after, stateParameter.name);
  const beforeValue = beforeObservation?.value;
  const afterValue = afterObservation?.value;
  return {
    ok: write.ok === true,
    target: input,
    parameter,
    before,
    write,
    after,
    confirmation: {
      writeAccepted: parameterWriteAccepted(write, parameter.name),
      stateQuery: stateParameter.name,
      stateObserved:
        before.ok === true &&
        after.ok === true &&
        beforeObservation !== undefined &&
        afterObservation !== undefined &&
        resultCodeOk(beforeObservation.result) &&
        resultCodeOk(afterObservation.result),
      observedBefore: beforeValue,
      observedAfter: afterValue,
      stateChanged: !valuesMatch(beforeValue, afterValue),
      matchesRequestedDeviceName: valuesMatch(afterValue, input.deviceName),
      note:
        'Remote API result=0 confirms accepted device assignment/removal; device.name is the immediately observable post-state and may not prove durable UI mutation on every target.',
    },
    safety: safetyPolicy(env),
  };
}

export async function runGetVoicemeeterMacroButton(
  input: z.infer<typeof GetVoicemeeterMacroButtonSchema>,
  runOperation: RunOperation = runVoicemeeterOperation
): Promise<Record<string, unknown>> {
  return runOperation('macro-status', { index: input.index, mode: macroModeNumber(input.mode) });
}

export async function runSetVoicemeeterMacroButton(
  input: z.infer<typeof SetVoicemeeterMacroButtonSchema>,
  runOperation: RunOperation = runVoicemeeterOperation,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  assertWritesAllowed(env);
  assertDestructiveAllowed(env);
  const modeNumber = macroModeNumber(input.mode);
  const requestedValue = macroRequestedValue(input.value);
  const before = await runOperation('macro-status', { index: input.index, mode: modeNumber });
  const write = await runOperation('macro-set', { index: input.index, mode: modeNumber, value: requestedValue });
  const after = await runOperation('macro-status', { index: input.index, mode: modeNumber });
  const beforeValue = before.value;
  const afterValue = after.value;
  const triggerMode = input.mode === 'trigger';
  return {
    ok: write.ok === true,
    target: { index: input.index, mode: input.mode },
    before,
    write,
    after,
    confirmation: {
      writeAccepted: macroWriteAccepted(write),
      mode: input.mode,
      modeNumber,
      requestedValue,
      stateObserved: before.ok === true && after.ok === true && resultCodeOk(before.result) && resultCodeOk(after.result),
      observedBefore: beforeValue,
      observedAfter: afterValue,
      stateChanged: !valuesMatch(beforeValue, afterValue),
      matchesRequestedValue: triggerMode ? null : valuesMatch(afterValue, requestedValue),
      statePersistence: triggerMode ? 'trigger_pulse' : 'queryable_status',
      note: triggerMode
        ? 'Trigger mode may pulse or run a user-configured action and then immediately read as 0; result=0 confirms Remote API acceptance only.'
        : 'For non-trigger modes, compare the queried after value with requestedValue to verify observable MacroButtons state.',
    },
    safety: safetyPolicy(env),
  };
}

export async function runRawVoicemeeterRemoteApi(
  input: z.infer<typeof RawVoicemeeterRemoteApiSchema>,
  runOperation: RunOperation = runVoicemeeterOperation,
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  assertRawAllowed(env);
  if (input.operation === 'script') {
    assertWritesAllowed(env);
    if (typeof input.script !== 'string') throw new Error('script is required for script operations');
    return { ...(await runOperation('raw-script', { script: input.script })), rawPolicy: { disableRawRemoteApi: false, preferTypedTools: true } };
  }
  if (typeof input.parameter !== 'string') throw new Error('parameter is required for raw parameter operations');
  if (input.operation === 'getFloat') return getParameters([{ name: input.parameter, kind: 'float' }], runOperation);
  if (input.operation === 'getString') return getParameters([{ name: input.parameter, kind: 'string' }], runOperation);
  if (input.operation === 'setFloat') {
    assertWritesAllowed(env);
    if (typeof input.value !== 'number') throw new Error('numeric value is required for setFloat');
    return setParameters([{ name: input.parameter, kind: 'float', value: input.value }], runOperation);
  }
  assertWritesAllowed(env);
  if (typeof input.value !== 'string') throw new Error('string value is required for setString');
  return setParameters([{ name: input.parameter, kind: 'string', value: input.value }], runOperation);
}

export function registerVoicemeeterControlTools(server: McpServer): void {
  server.registerTool(
    'voicemeeter_get_devices',
    {
      description: 'Read-only Voicemeeter input/output device inventory from the Remote API helper.',
      inputSchema: z.object({}),
      annotations: readOnlyToolAnnotations,
    },
    async () => jsonResponse(await runGetVoicemeeterDevices())
  );

  server.registerTool(
    'voicemeeter_get_strip',
    {
      description: 'Read-only typed Voicemeeter strip parameters, validated against the detected edition.',
      inputSchema: GetVoicemeeterStripSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runGetVoicemeeterStrip(GetVoicemeeterStripSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_get_strip error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_get_bus',
    {
      description: 'Read-only typed Voicemeeter bus parameters, validated against the detected edition.',
      inputSchema: GetVoicemeeterBusSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runGetVoicemeeterBus(GetVoicemeeterBusSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_get_bus error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_get_levels',
    {
      description: 'Read-only Voicemeeter level polling through VBVMR_GetLevel for explicit channels only.',
      inputSchema: GetVoicemeeterLevelsSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runGetVoicemeeterLevels(GetVoicemeeterLevelsSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_get_levels error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_set_strip_parameter',
    {
      description:
        'Set one typed Voicemeeter strip parameter with query-before-write. Disable with VOICEMEETER_MCP_DISABLE_WRITES=true.',
      inputSchema: SetVoicemeeterStripParameterSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runSetVoicemeeterStripParameter(SetVoicemeeterStripParameterSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_set_strip_parameter error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_set_bus_parameter',
    {
      description:
        'Set one typed Voicemeeter bus parameter with query-before-write. Disable with VOICEMEETER_MCP_DISABLE_WRITES=true.',
      inputSchema: SetVoicemeeterBusParameterSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runSetVoicemeeterBusParameter(SetVoicemeeterBusParameterSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_set_bus_parameter error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_set_device',
    {
      description:
        'Set or remove an exact Voicemeeter strip/bus device by driver namespace. Requires confirm=true and can disrupt live audio.',
      inputSchema: SetVoicemeeterDeviceSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runSetVoicemeeterDevice(SetVoicemeeterDeviceSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_set_device error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_get_macro_button',
    {
      description: 'Read one MacroButtons logical button state through the Remote API helper.',
      inputSchema: GetVoicemeeterMacroButtonSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runGetVoicemeeterMacroButton(GetVoicemeeterMacroButtonSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_get_macro_button error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_set_macro_button',
    {
      description:
        'Set or trigger one MacroButtons logical button. Requires confirm=true because buttons can run user-configured actions.',
      inputSchema: SetVoicemeeterMacroButtonSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runSetVoicemeeterMacroButton(SetVoicemeeterMacroButtonSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_set_macro_button error');
      }
    }
  );

  server.registerTool(
    'voicemeeter_raw_remote_api',
    {
      description:
        'Advanced power-user Remote API escape hatch. Prefer typed voicemeeter_* tools whenever one exists. Disable with VOICEMEETER_MCP_DISABLE_RAW_REMOTE_API=true.',
      inputSchema: RawVoicemeeterRemoteApiSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runRawVoicemeeterRemoteApi(RawVoicemeeterRemoteApiSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown voicemeeter_raw_remote_api error');
      }
    }
  );
}
