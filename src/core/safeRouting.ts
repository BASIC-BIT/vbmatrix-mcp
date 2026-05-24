import {
  removePointCommand,
  setPointGainCommand,
  setPointMuteCommand,
  setPointPhaseCommand,
  validatePointTargetSyntax,
  type MatrixGain,
  type PointState,
  type PointTarget,
} from './commands.js';
import { createMatrixSnapshot, type MatrixSnapshot } from './snapshots.js';

export type SafeRouteWorkflowOperation = 'auditionRoute' | 'cleanupRoutes' | 'emergencyMute';

export interface SafeRouteWorkflowInput {
  operation: SafeRouteWorkflowOperation;
  target?: PointTarget;
  points?: PointTarget[];
  gainDb?: MatrixGain;
  muted?: boolean;
  phaseReversed?: boolean;
}

export interface SafeRoutePlan {
  operation: SafeRouteWorkflowOperation;
  targets: PointTarget[];
  commands: string[];
  caveats: string[];
}

export interface SafeRouteRollback {
  commands: string[];
  instructions: string;
  caveats: string[];
}

function pointKey(target: PointTarget): string {
  return `${target.inputSuid}.IN[${target.inputChannel}]->${target.outputSuid}.OUT[${target.outputChannel}]`;
}

function uniqueExplicitPoints(points: PointTarget[]): PointTarget[] {
  const seen = new Set<string>();
  const unique: PointTarget[] = [];
  for (const point of points) {
    validatePointTargetSyntax(point);
    const key = pointKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

export function planSafeRouteWorkflow(input: SafeRouteWorkflowInput): SafeRoutePlan {
  if (input.operation === 'auditionRoute') {
    if (input.target === undefined) throw new Error('target is required for auditionRoute');
    if (input.gainDb === undefined) throw new Error('gainDb is required for auditionRoute');
    if (input.gainDb === '-inf')
      throw new Error('auditionRoute gainDb must be finite; use cleanupRoutes to remove a route');
    if (input.muted === undefined) throw new Error('muted is required for auditionRoute');
    if (input.phaseReversed === undefined) throw new Error('phaseReversed is required for auditionRoute');
    const target = uniqueExplicitPoints([input.target])[0];
    return {
      operation: input.operation,
      targets: [target],
      commands: [
        setPointGainCommand(target, input.gainDb),
        setPointMuteCommand(target, input.muted),
        setPointPhaseCommand(target, input.phaseReversed),
      ],
      caveats: [
        'This is a control-plane route change only; no live audio measurement is performed by this workflow.',
        'The caller must provide an operator-approved safe source/output point.',
      ],
    };
  }

  const points = uniqueExplicitPoints(input.points ?? []);
  if (points.length === 0) throw new Error('points must include at least one explicit point target');

  if (input.operation === 'cleanupRoutes') {
    return {
      operation: input.operation,
      targets: points,
      commands: points.map((target) => removePointCommand(target)),
      caveats: [
        'Only the explicit point targets are removed; no output-wide or inferred cleanup is performed.',
        'The caller must review rollback commands before executing cleanup.',
      ],
    };
  }

  return {
    operation: input.operation,
    targets: points,
    commands: points.map((target) => setPointMuteCommand(target, true)),
    caveats: [
      'Only the explicit point targets are muted; this is not an output-wide emergency mute.',
      'Other routes, hardware paths, applications, and external mixers may still pass audio.',
    ],
  };
}

function restoreCommandsForPoint(target: PointTarget, state: PointState): string[] {
  if (state.dBGain === '-inf') return [setPointGainCommand(target, '-inf')];
  return [
    setPointGainCommand(target, Number(state.dBGain)),
    setPointMuteCommand(target, state.mute === '1'),
    setPointPhaseCommand(target, state.phase === '1'),
  ];
}

export function rollbackFromSnapshot(snapshot: MatrixSnapshot): SafeRouteRollback {
  const commands = snapshot.points.flatMap((point) => restoreCommandsForPoint(point.target, point.state));
  return {
    commands,
    instructions:
      'Rollback by reviewing these commands or by passing the returned beforeSnapshot to vbmatrix_restore_snapshot with dryRun=true first, then execute only after operator approval.',
    caveats: ['Rollback covers only the explicit points captured by this workflow snapshot.'],
  };
}

export async function capturePointSnapshot(input: {
  targets: PointTarget[];
  queryPointState: (target: PointTarget) => Promise<PointState>;
}): Promise<MatrixSnapshot> {
  const points = await Promise.all(
    input.targets.map(async (target) => ({ target, state: await input.queryPointState(target) }))
  );
  return createMatrixSnapshot({ metadata: {}, slots: [], points });
}
