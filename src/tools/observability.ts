import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import {
  createRouteInspectionPlan,
  createSlotInspectionPlan,
  summarizePointState,
  type PointQueryPlan,
} from '../core/observability.js';
import { VbMatrixClient } from '../core/client.js';
import { readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { InspectRoutesSchema, InspectSlotsSchema } from './schemas.js';

type InspectRoutesInput = z.infer<typeof InspectRoutesSchema>;
type InspectSlotsInput = z.infer<typeof InspectSlotsSchema>;

interface QueryObservation {
  ok: boolean;
  command: string;
  value?: string;
  error?: string;
}

async function observeQuery(client: VbMatrixClient, command: string): Promise<QueryObservation> {
  try {
    return { ok: true, command, value: await client.queryValue(command) };
  } catch (err) {
    return { ok: false, command, error: err instanceof Error ? err.message : 'Unknown Matrix query error' };
  }
}

function hasObservationErrors(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasObservationErrors);
  if (value !== null && typeof value === 'object') {
    if ('ok' in value && (value as { ok?: unknown }).ok === false) return true;
    return Object.values(value).some(hasObservationErrors);
  }
  return false;
}

async function observeQueryGroup<T extends object>(
  client: VbMatrixClient,
  commands: { [K in keyof T]: string }
): Promise<{ [K in keyof T]: QueryObservation }> {
  const entries = await Promise.all(
    Object.entries(commands as Record<string, string>).map(
      async ([key, command]) => [key, await observeQuery(client, command)] as const
    )
  );
  return Object.fromEntries(entries) as { [K in keyof T]: QueryObservation };
}

function pointStateFromObservations(observations: { [K in keyof PointQueryPlan]: QueryObservation }) {
  if (!observations.dBGain.ok || !observations.mute.ok || !observations.phase.ok) return null;
  return {
    dBGain: observations.dBGain.value ?? '',
    mute: observations.mute.value ?? '',
    phase: observations.phase.value ?? '',
  };
}

async function observeLabelQueries(
  client: VbMatrixClient,
  queries: { channel: number; command: string }[]
): Promise<{ channel: number; observation: QueryObservation }[]> {
  return Promise.all(
    queries.map(async (query) => ({ channel: query.channel, observation: await observeQuery(client, query.command) }))
  );
}

export async function inspectRoutes(input: InspectRoutesInput, client: VbMatrixClient): Promise<Record<string, unknown>> {
  const plan = createRouteInspectionPlan(input.points);
  const system = input.includeSystem ? await observeQueryGroup(client, plan.systemQueries) : null;
  const slots = input.includeSlots
    ? await Promise.all(
        plan.uniqueSlotSuids.map(async (suid) => ({
          suid,
          observations: await observeQueryGroup(client, plan.slotQueries[suid]),
        }))
      )
    : [];
  const routes = await Promise.all(
    plan.routes.map(async (route) => {
      const pointObservations = await observeQueryGroup(client, route.pointQueries);
      const state = pointStateFromObservations(pointObservations);
      const labels = input.includeLabels
        ? {
            input: await observeQuery(client, route.labelQueries.input),
            output: await observeQuery(client, route.labelQueries.output),
          }
        : null;

      return {
        key: route.key,
        target: route.target,
        point: {
          ok: state !== null,
          observations: pointObservations,
          state,
          summary: state === null ? null : summarizePointState(state),
        },
        labels,
      };
    })
  );

  return {
    ok: !hasObservationErrors({ system, slots, routes }),
    scope: {
      highVolumeScan: false,
      pointCount: plan.pointCount,
      maxPoints: plan.maxPoints,
      includeSystem: input.includeSystem,
      includeSlots: input.includeSlots,
      includeLabels: input.includeLabels,
    },
    queryPlan: plan,
    system,
    slots,
    routes,
    routingGuidance: [
      'Use this output to confirm exact SUIDs/channels before writes.',
      'A connected point with muted=false and phaseReversed=false is the least surprising baseline for a small gain change.',
      'If labels or slot info are Err/unavailable, ask the operator to verify Matrix UI names instead of guessing.',
    ],
  };
}

export async function inspectSlots(input: InspectSlotsInput, client: VbMatrixClient): Promise<Record<string, unknown>> {
  const plan = createSlotInspectionPlan(input.slots);
  const slots = await Promise.all(
    plan.slots.map(async (slot) => ({
      suid: slot.suid,
      slotState: input.includeSlotState ? await observeQueryGroup(client, slot.slotQueries) : null,
      labels: input.includeLabels
        ? {
            input: await observeLabelQueries(client, slot.labelQueries.input),
            output: await observeLabelQueries(client, slot.labelQueries.output),
          }
        : null,
    }))
  );

  return {
    ok: !hasObservationErrors({ slots }),
    scope: {
      highVolumeScan: false,
      slotCount: plan.slotCount,
      labelQueryCount: plan.labelQueryCount,
      maxSlots: plan.maxSlots,
      maxLabelChannelsPerSide: plan.maxLabelChannelsPerSide,
      maxLabelQueries: plan.maxLabelQueries,
      includeSlotState: input.includeSlotState,
      includeLabels: input.includeLabels,
    },
    queryPlan: plan,
    slots,
    routingGuidance: [
      'Use slot device and label observations to choose explicit SUID/channel targets before route inspection or writes.',
      'If labels are missing or Err, ask the operator to identify channels in the Matrix UI instead of guessing.',
      'This tool does not discover every Matrix slot/channel; provide candidate SUIDs and channels explicitly.',
    ],
  };
}

export function registerObservabilityTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_inspect_routes',
    {
      description:
        'Bounded read-only inspection for explicit route points. Queries point state, optional channel labels, optional unique slot state, and optional engine/master state without scanning the full matrix.',
      inputSchema: InspectRoutesSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = InspectRoutesSchema.parse(args);
        const client = new VbMatrixClient();
        return jsonResponse(await inspectRoutes(input, client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix route inspection error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_inspect_slots',
    {
      description:
        'Bounded read-only inspection for explicit Matrix slots and selected input/output channel labels. Does not enumerate or scan all slots/channels.',
      inputSchema: InspectSlotsSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = InspectSlotsSchema.parse(args);
        const client = new VbMatrixClient();
        return jsonResponse(await inspectSlots(input, client));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix slot inspection error');
      }
    }
  );
}
