import {
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  validatePointTargetSyntax,
  validateSuidSyntax,
  type MatrixGain,
  type PointState,
  type PointTarget,
} from './commands.js';

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SnapshotOmissionKind = 'labels' | 'presetMetadata';
export type RestorablePointProperty = 'dBGain' | 'mute' | 'phase';

export interface MatrixSlotSnapshot {
  suid: string;
  info: string;
  online: string;
  runningStatus: string;
  master: string;
  device: string;
}

export interface MatrixPointSnapshot {
  target: PointTarget;
  state: PointState;
}

export interface MatrixSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  metadata: {
    version?: string;
    engine?: string;
    master?: string;
  };
  scope: {
    slots: string[];
    points: PointTarget[];
  };
  slots: MatrixSlotSnapshot[];
  points: MatrixPointSnapshot[];
  omissions: { kind: SnapshotOmissionKind; reason: string }[];
}

export interface SnapshotSummary {
  schemaVersion: number;
  capturedAt: string;
  slotCount: number;
  pointCount: number;
  omittedKinds: SnapshotOmissionKind[];
}

export interface SnapshotDiff {
  from: SnapshotSummary;
  to: SnapshotSummary;
  slots: {
    added: MatrixSlotSnapshot[];
    removed: MatrixSlotSnapshot[];
    changed: {
      suid: string;
      before: MatrixSlotSnapshot;
      after: MatrixSlotSnapshot;
      changedProperties: string[];
    }[];
  };
  points: {
    added: MatrixPointSnapshot[];
    removed: MatrixPointSnapshot[];
    changed: {
      target: PointTarget;
      before: PointState;
      after: PointState;
      changedProperties: RestorablePointProperty[];
    }[];
  };
}

export interface RestorePlanStep {
  target: PointTarget;
  property: RestorablePointProperty;
  before: string;
  desired: string;
  command: string;
}

export interface RestorePlan {
  summary: {
    pointCount: number;
    changedPointCount: number;
    commandCount: number;
    properties: RestorablePointProperty[];
    broad: boolean;
    nonRestorable: string[];
  };
  steps: RestorePlanStep[];
}

function pointKey(target: PointTarget): string {
  return `${target.inputSuid}.IN[${target.inputChannel}]->${target.outputSuid}.OUT[${target.outputChannel}]`;
}

function pointTargetEquals(left: PointTarget, right: PointTarget): boolean {
  return pointKey(left) === pointKey(right);
}

function summarize(snapshot: MatrixSnapshot): SnapshotSummary {
  return {
    schemaVersion: snapshot.schemaVersion,
    capturedAt: snapshot.capturedAt,
    slotCount: snapshot.slots.length,
    pointCount: snapshot.points.length,
    omittedKinds: snapshot.omissions.map((omission) => omission.kind),
  };
}

function validatePointState(state: PointState): void {
  parseGain(state.dBGain);
  parseBinaryState(state.mute, 'mute');
  parseBinaryState(state.phase, 'phase');
}

export function validateMatrixSnapshot(snapshot: MatrixSnapshot): void {
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported snapshot schemaVersion: ${String(snapshot.schemaVersion)}`);
  }
  for (const suid of snapshot.scope.slots) validateSuidSyntax(suid);
  for (const slot of snapshot.slots) validateSuidSyntax(slot.suid);
  for (const target of snapshot.scope.points) validatePointTargetSyntax(target);
  for (const point of snapshot.points) {
    validatePointTargetSyntax(point.target);
    validatePointState(point.state);
  }
}

export function createMatrixSnapshot(input: {
  capturedAt?: string;
  metadata?: MatrixSnapshot['metadata'];
  slots: MatrixSlotSnapshot[];
  points: MatrixPointSnapshot[];
}): MatrixSnapshot {
  const snapshot: MatrixSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    metadata: input.metadata ?? {},
    scope: {
      slots: input.slots.map((slot) => slot.suid),
      points: input.points.map((point) => point.target),
    },
    slots: input.slots,
    points: input.points,
    omissions: [
      {
        kind: 'labels',
        reason: 'VBAN-TEXT label queries are not implemented by this server yet.',
      },
      {
        kind: 'presetMetadata',
        reason: 'VBAN-TEXT preset metadata queries are not implemented by this server yet.',
      },
    ],
  };
  validateMatrixSnapshot(snapshot);
  return snapshot;
}

export function matrixSnapshotSummary(snapshot: MatrixSnapshot): SnapshotSummary {
  validateMatrixSnapshot(snapshot);
  return summarize(snapshot);
}

export function diffMatrixSnapshots(before: MatrixSnapshot, after: MatrixSnapshot): SnapshotDiff {
  validateMatrixSnapshot(before);
  validateMatrixSnapshot(after);

  const beforeSlots = new Map(before.slots.map((slot) => [slot.suid, slot]));
  const afterSlots = new Map(after.slots.map((slot) => [slot.suid, slot]));
  const beforePoints = new Map(before.points.map((point) => [pointKey(point.target), point]));
  const afterPoints = new Map(after.points.map((point) => [pointKey(point.target), point]));

  const slotProperties: (keyof MatrixSlotSnapshot)[] = ['info', 'online', 'runningStatus', 'master', 'device'];
  const pointProperties: RestorablePointProperty[] = ['dBGain', 'mute', 'phase'];

  return {
    from: summarize(before),
    to: summarize(after),
    slots: {
      added: after.slots.filter((slot) => !beforeSlots.has(slot.suid)),
      removed: before.slots.filter((slot) => !afterSlots.has(slot.suid)),
      changed: before.slots.flatMap((slot) => {
        const matching = afterSlots.get(slot.suid);
        if (!matching) return [];
        const changedProperties = slotProperties.filter((property) => slot[property] !== matching[property]);
        if (changedProperties.length === 0) return [];
        return [{ suid: slot.suid, before: slot, after: matching, changedProperties }];
      }),
    },
    points: {
      added: after.points.filter((point) => !beforePoints.has(pointKey(point.target))),
      removed: before.points.filter((point) => !afterPoints.has(pointKey(point.target))),
      changed: before.points.flatMap((point) => {
        const matching = afterPoints.get(pointKey(point.target));
        if (!matching) return [];
        const changedProperties = pointProperties.filter((property) => point.state[property] !== matching.state[property]);
        if (changedProperties.length === 0) return [];
        return [{ target: point.target, before: point.state, after: matching.state, changedProperties }];
      }),
    },
  };
}

function parseGain(value: string): MatrixGain {
  if (value === '-inf') return '-inf';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Snapshot dBGain must be numeric or -inf, got ${value}`);
  return parsed;
}

function parseBinaryState(value: string, property: RestorablePointProperty): boolean {
  if (value === '1') return true;
  if (value === '0') return false;
  throw new Error(`Snapshot ${property} must be 0 or 1, got ${value}`);
}

function restoreCommand(target: PointTarget, property: RestorablePointProperty, desired: string): string {
  if (property === 'dBGain') return setPointGainCommand(target, parseGain(desired));
  if (property === 'mute') return setPointMuteCommand(target, parseBinaryState(desired, property));
  return setPointPhaseCommand(target, parseBinaryState(desired, property));
}

export function planSnapshotRestore(input: {
  desired: MatrixSnapshot;
  current: MatrixSnapshot;
  selectedPoints?: PointTarget[];
  properties?: RestorablePointProperty[];
}): RestorePlan {
  validateMatrixSnapshot(input.desired);
  validateMatrixSnapshot(input.current);
  const properties = input.properties ?? ['dBGain', 'mute', 'phase'];
  const selectedPoints = input.selectedPoints ?? input.desired.points.map((point) => point.target);
  for (const target of selectedPoints) validatePointTargetSyntax(target);

  const currentPoints = new Map(input.current.points.map((point) => [pointKey(point.target), point]));
  const selectedDesired = input.desired.points.filter((point) =>
    selectedPoints.some((target) => pointTargetEquals(target, point.target))
  );

  const steps = selectedDesired.flatMap((point) => {
    const current = currentPoints.get(pointKey(point.target));
    if (!current) return [];
    return properties.flatMap((property) => {
      const before = current.state[property];
      const desired = point.state[property];
      if (before === desired) return [];
      return [{ target: point.target, property, before, desired, command: restoreCommand(point.target, property, desired) }];
    });
  });

  return {
    summary: {
      pointCount: selectedDesired.length,
      changedPointCount: new Set(steps.map((step) => pointKey(step.target))).size,
      commandCount: steps.length,
      properties,
      broad: selectedDesired.length > 1 || steps.length > 1,
      nonRestorable: ['slots are metadata-only', 'labels omitted', 'preset metadata omitted'],
    },
    steps,
  };
}
