import {
  channelLabelQuery,
  commandPropertyQuery,
  validateChannelIndex,
  pointPropertyQuery,
  slotPropertyQuery,
  validatePointTargetSyntax,
  validateSuidSyntax,
  type PointState,
  type PointTarget,
} from './commands.js';

export const MAX_ROUTE_INSPECTION_POINTS = 12;
export const MAX_SLOT_INSPECTION_SLOTS = 12;
export const MAX_SLOT_LABEL_CHANNELS_PER_SIDE = 16;
export const MAX_SLOT_LABEL_QUERIES = 48;

export interface PointQueryPlan {
  dBGain: string;
  mute: string;
  phase: string;
}

export interface RouteInspectionPlanRoute {
  key: string;
  target: PointTarget;
  pointQueries: PointQueryPlan;
  labelQueries: {
    input: string;
    output: string;
  };
}

export interface RouteInspectionPlan {
  maxPoints: number;
  pointCount: number;
  uniqueSlotSuids: string[];
  systemQueries: {
    engine: string;
    master: string;
  };
  slotQueries: Record<string, Record<'info' | 'online' | 'runningStatus' | 'master' | 'device', string>>;
  routes: RouteInspectionPlanRoute[];
}

export interface PointStateSummary {
  connected: boolean;
  muted: boolean | null;
  phaseReversed: boolean | null;
  gainDb: string;
  attention: string[];
}

export interface SlotInspectionTarget {
  suid: string;
  inputChannels: number[];
  outputChannels: number[];
}

export interface SlotInspectionPlanSlot {
  suid: string;
  slotQueries: Record<'info' | 'online' | 'runningStatus' | 'master' | 'device', string>;
  labelQueries: {
    input: { channel: number; command: string }[];
    output: { channel: number; command: string }[];
  };
}

export interface SlotInspectionPlan {
  maxSlots: number;
  maxLabelChannelsPerSide: number;
  maxLabelQueries: number;
  slotCount: number;
  labelQueryCount: number;
  slots: SlotInspectionPlanSlot[];
}

export function pointTargetKey(target: PointTarget): string {
  return `${target.inputSuid}.IN[${target.inputChannel}]->${target.outputSuid}.OUT[${target.outputChannel}]`;
}

export function validateRouteInspectionTargets(points: PointTarget[]): void {
  if (points.length === 0) throw new Error('At least one route point is required');
  if (points.length > MAX_ROUTE_INSPECTION_POINTS) {
    throw new Error(`Route inspection is capped at ${MAX_ROUTE_INSPECTION_POINTS} points`);
  }

  const seen = new Set<string>();
  for (const target of points) {
    validatePointTargetSyntax(target);
    const key = pointTargetKey(target);
    if (seen.has(key)) throw new Error(`Duplicate route inspection target: ${key}`);
    seen.add(key);
  }
}

export function uniqueRouteSlotSuids(points: PointTarget[]): string[] {
  validateRouteInspectionTargets(points);
  const suids = new Set<string>();
  for (const target of points) {
    suids.add(target.inputSuid);
    suids.add(target.outputSuid);
  }
  return [...suids];
}

export function createRouteInspectionPlan(points: PointTarget[]): RouteInspectionPlan {
  validateRouteInspectionTargets(points);
  const uniqueSlotSuids = uniqueRouteSlotSuids(points);
  return {
    maxPoints: MAX_ROUTE_INSPECTION_POINTS,
    pointCount: points.length,
    uniqueSlotSuids,
    systemQueries: {
      engine: commandPropertyQuery('Engine'),
      master: commandPropertyQuery('Master'),
    },
    slotQueries: Object.fromEntries(
      uniqueSlotSuids.map((suid) => [
        suid,
        {
          info: slotPropertyQuery(suid, 'Info'),
          online: slotPropertyQuery(suid, 'Online'),
          runningStatus: slotPropertyQuery(suid, 'RunningStatus'),
          master: slotPropertyQuery(suid, 'Master'),
          device: slotPropertyQuery(suid, 'Device'),
        },
      ])
    ),
    routes: points.map((target) => ({
      key: pointTargetKey(target),
      target,
      pointQueries: {
        dBGain: pointPropertyQuery(target, 'dBGain'),
        mute: pointPropertyQuery(target, 'Mute'),
        phase: pointPropertyQuery(target, 'Phase'),
      },
      labelQueries: {
        input: channelLabelQuery({ kind: 'input', suid: target.inputSuid, channel: target.inputChannel }),
        output: channelLabelQuery({ kind: 'output', suid: target.outputSuid, channel: target.outputChannel }),
      },
    })),
  };
}

function validateUniqueChannels(channels: number[], label: string): void {
  if (channels.length > MAX_SLOT_LABEL_CHANNELS_PER_SIDE) {
    throw new Error(`${label} channel inspection is capped at ${MAX_SLOT_LABEL_CHANNELS_PER_SIDE} channels per slot side`);
  }
  const seen = new Set<number>();
  for (const channel of channels) {
    validateChannelIndex(channel);
    if (seen.has(channel)) throw new Error(`Duplicate ${label} channel in slot inspection target: ${channel}`);
    seen.add(channel);
  }
}

export function validateSlotInspectionTargets(targets: SlotInspectionTarget[]): void {
  if (targets.length === 0) throw new Error('At least one slot is required');
  if (targets.length > MAX_SLOT_INSPECTION_SLOTS) {
    throw new Error(`Slot inspection is capped at ${MAX_SLOT_INSPECTION_SLOTS} slots`);
  }

  const seen = new Set<string>();
  let labelQueryCount = 0;
  for (const target of targets) {
    validateSuidSyntax(target.suid);
    if (seen.has(target.suid)) throw new Error(`Duplicate slot inspection target: ${target.suid}`);
    seen.add(target.suid);
    validateUniqueChannels(target.inputChannels, `${target.suid} input`);
    validateUniqueChannels(target.outputChannels, `${target.suid} output`);
    labelQueryCount += target.inputChannels.length + target.outputChannels.length;
  }

  if (labelQueryCount > MAX_SLOT_LABEL_QUERIES) {
    throw new Error(`Slot label inspection is capped at ${MAX_SLOT_LABEL_QUERIES} label queries`);
  }
}

export function createSlotInspectionPlan(targets: SlotInspectionTarget[]): SlotInspectionPlan {
  validateSlotInspectionTargets(targets);
  const slots = targets.map((target) => ({
    suid: target.suid,
    slotQueries: {
      info: slotPropertyQuery(target.suid, 'Info'),
      online: slotPropertyQuery(target.suid, 'Online'),
      runningStatus: slotPropertyQuery(target.suid, 'RunningStatus'),
      master: slotPropertyQuery(target.suid, 'Master'),
      device: slotPropertyQuery(target.suid, 'Device'),
    },
    labelQueries: {
      input: target.inputChannels.map((channel) => ({
        channel,
        command: channelLabelQuery({ kind: 'input', suid: target.suid, channel }),
      })),
      output: target.outputChannels.map((channel) => ({
        channel,
        command: channelLabelQuery({ kind: 'output', suid: target.suid, channel }),
      })),
    },
  }));
  return {
    maxSlots: MAX_SLOT_INSPECTION_SLOTS,
    maxLabelChannelsPerSide: MAX_SLOT_LABEL_CHANNELS_PER_SIDE,
    maxLabelQueries: MAX_SLOT_LABEL_QUERIES,
    slotCount: targets.length,
    labelQueryCount: targets.reduce((count, target) => count + target.inputChannels.length + target.outputChannels.length, 0),
    slots,
  };
}

function binaryState(value: string): boolean | null {
  const trimmed = value.trim();
  if (trimmed === '1') return true;
  if (trimmed === '0') return false;
  return null;
}

export function summarizePointState(state: PointState): PointStateSummary {
  const gainDb = state.dBGain.trim();
  const muted = binaryState(state.mute);
  const phaseReversed = binaryState(state.phase);
  const connected = gainDb !== '-inf' && gainDb !== 'Err';
  const attention: string[] = [];

  if (gainDb === 'Err' || state.mute.trim() === 'Err' || state.phase.trim() === 'Err') {
    attention.push('Matrix returned Err for at least one point property');
  }
  if (!connected) attention.push('Point appears disconnected or silent by gain state');
  if (muted === true) attention.push('Point is muted');
  if (phaseReversed === true) attention.push('Point phase is reversed');
  if (muted === null && state.mute.trim() !== 'Err') attention.push(`Unexpected mute value: ${state.mute}`);
  if (phaseReversed === null && state.phase.trim() !== 'Err') attention.push(`Unexpected phase value: ${state.phase}`);

  return { connected, muted, phaseReversed, gainDb, attention };
}
