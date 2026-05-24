import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slotPropertyQuery, validatePointTargetSyntax, validateSuidSyntax, type PointTarget } from '../core/commands.js';
import { VbMatrixClient } from '../core/client.js';
import { assertPointWriteAllowed, safetyDetails } from '../core/safety.js';
import {
  createMatrixSnapshot,
  capSnapshotDiff,
  diffMatrixSnapshots,
  matrixSnapshotSummary,
  planSnapshotRestore,
  summarizeSnapshotDiff,
  validateMatrixSnapshot,
  type SnapshotDiff,
  type MatrixPointSnapshot,
  type MatrixSlotSnapshot,
  type MatrixSnapshot,
  type RestorablePointProperty,
} from '../core/snapshots.js';
import { readOnlyToolAnnotations, writeToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';
import { SnapshotCaptureSchema, SnapshotDiffSchema, SnapshotReferenceSchema, SnapshotRestoreSchema } from './schemas.js';

const INLINE_ENTRY_LIMIT = 20;
const SNAPSHOT_DIR = '.vbmatrix-snapshots';

function snapshotDir(): string {
  return path.resolve(process.cwd(), SNAPSHOT_DIR);
}

function assertSafeSnapshotPath(filePath: string): string {
  const base = snapshotDir();
  const resolved = path.resolve(filePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Snapshot files must be under ${SNAPSHOT_DIR}`);
  }
  return resolved;
}

async function writeSnapshotArtifact(snapshot: MatrixSnapshot): Promise<string> {
  const dir = snapshotDir();
  await mkdir(dir, { recursive: true });
  const stamp = snapshot.capturedAt.replace(/[:.]/g, '-');
  const filePath = path.join(dir, `vbmatrix-snapshot-${stamp}.json`);
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

async function writeDiffArtifact(diff: SnapshotDiff): Promise<string> {
  const dir = snapshotDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `vbmatrix-diff-${stamp}.json`);
  await writeFile(filePath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
  return filePath;
}

async function readSnapshotArtifact(filePath: string): Promise<MatrixSnapshot> {
  const safePath = assertSafeSnapshotPath(filePath);
  const parsed = JSON.parse(await readFile(safePath, 'utf8')) as MatrixSnapshot;
  validateMatrixSnapshot(parsed);
  return parsed;
}

async function readSnapshotReference(reference: unknown): Promise<MatrixSnapshot> {
  const parsed = SnapshotReferenceSchema.parse(reference);
  if (parsed.snapshot !== undefined) {
    const snapshot = parsed.snapshot as unknown as MatrixSnapshot;
    validateMatrixSnapshot(snapshot);
    return snapshot;
  }
  return readSnapshotArtifact(parsed.snapshotFile ?? '');
}

async function querySlot(client: VbMatrixClient, suid: string): Promise<MatrixSlotSnapshot> {
  validateSuidSyntax(suid);
  const [info, online, runningStatus, master, device] = await Promise.all([
    client.queryValue(slotPropertyQuery(suid, 'Info')),
    client.queryValue(slotPropertyQuery(suid, 'Online')),
    client.queryValue(slotPropertyQuery(suid, 'RunningStatus')),
    client.queryValue(slotPropertyQuery(suid, 'Master')),
    client.queryValue(slotPropertyQuery(suid, 'Device')),
  ]);
  return { suid, info, online, runningStatus, master, device };
}

async function queryPoint(client: VbMatrixClient, target: PointTarget): Promise<MatrixPointSnapshot> {
  validatePointTargetSyntax(target);
  return { target, state: await client.queryPointState(target) };
}

async function queryOptionalMetadata(client: VbMatrixClient): Promise<MatrixSnapshot['metadata']> {
  const [version, engine, master] = await Promise.all([
    client.queryVersion().catch(() => undefined),
    client.queryValue('Command.Engine=?;').catch(() => undefined),
    client.queryValue('Command.Master=?;').catch(() => undefined),
  ]);
  return { version, engine, master };
}

async function captureSnapshot(input: {
  slots: string[];
  points: PointTarget[];
  client: VbMatrixClient;
}): Promise<MatrixSnapshot> {
  const [metadata, slots, points] = await Promise.all([
    queryOptionalMetadata(input.client),
    Promise.all(input.slots.map((suid) => querySlot(input.client, suid))),
    Promise.all(input.points.map((target) => queryPoint(input.client, target))),
  ]);
  return createMatrixSnapshot({ metadata, slots, points });
}

function selectedRestoreTargets(snapshot: MatrixSnapshot, selectedPoints: PointTarget[] | undefined): PointTarget[] {
  return selectedPoints ?? snapshot.points.map((point) => point.target);
}

export function validateSnapshotCaptureRetrievable(input: {
  includeSnapshot: boolean;
  writeToFile: boolean;
  entryCount: number;
}): void {
  if (!input.includeSnapshot && !input.writeToFile && input.entryCount <= INLINE_ENTRY_LIMIT) {
    throw new Error('includeSnapshot=false requires writeToFile=true for small snapshots so the snapshot is retrievable.');
  }
}

function pointKey(target: PointTarget): string {
  return `${target.inputSuid}.IN[${target.inputChannel}]->${target.outputSuid}.OUT[${target.outputChannel}]`;
}

function missingSelectedTargets(snapshot: MatrixSnapshot, selectedPoints: PointTarget[]): PointTarget[] {
  const desiredTargets = new Set(snapshot.points.map((point) => pointKey(point.target)));
  return selectedPoints.filter((target) => !desiredTargets.has(pointKey(target)));
}

export function registerSnapshotTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_capture_snapshot',
    {
      description:
        'Read-only targeted Matrix snapshot for explicit slots and routing points. Labels and preset metadata are reported as omissions until supported by typed queries.',
      inputSchema: SnapshotCaptureSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = SnapshotCaptureSchema.parse(args);
        const client = new VbMatrixClient();
        const snapshot = await captureSnapshot({ slots: input.slots, points: input.points, client });
        const entryCount = snapshot.slots.length + snapshot.points.length;
        validateSnapshotCaptureRetrievable({
          includeSnapshot: input.includeSnapshot,
          writeToFile: input.writeToFile,
          entryCount,
        });
        const artifactPath = input.writeToFile || entryCount > INLINE_ENTRY_LIMIT ? await writeSnapshotArtifact(snapshot) : undefined;
        const includeInline = input.includeSnapshot && entryCount <= INLINE_ENTRY_LIMIT;
        return jsonResponse({
          ok: true,
          summary: matrixSnapshotSummary(snapshot),
          artifactPath,
          inlineOmitted: includeInline ? false : true,
          inlineOmittedReason: includeInline ? undefined : 'Snapshot omitted from response; use artifactPath or request fewer entries.',
          snapshot: includeInline ? snapshot : undefined,
        });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix snapshot capture error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_diff_snapshots',
    {
      description: 'Read-only comparison of two Matrix snapshots supplied inline or from safe local snapshot artifact paths.',
      inputSchema: SnapshotDiffSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (args) => {
      try {
        const input = SnapshotDiffSchema.parse(args);
        const [before, after] = await Promise.all([readSnapshotReference(input.before), readSnapshotReference(input.after)]);
        const diff = diffMatrixSnapshots(before, after);
        const capped = input.includeDiff ? capSnapshotDiff(diff, input.maxEntries) : undefined;
        return jsonResponse({
          ok: true,
          summary: summarizeSnapshotDiff(diff),
          diff: capped?.diff,
          inlineOmitted: !input.includeDiff,
          inlineOmittedReason: input.includeDiff ? undefined : 'Diff details omitted by default; set includeDiff=true for capped inline details.',
          omittedEntries: capped?.omittedEntries,
          artifactPath: input.writeToFile ? await writeDiffArtifact(diff) : undefined,
        });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix snapshot diff error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_restore_snapshot',
    {
      description:
        'Plan or execute restore of point gain, mute, and phase from a targeted Matrix snapshot. Dry-run is the default; execution requires explicit confirmation and write safety gates.',
      inputSchema: SnapshotRestoreSchema,
      annotations: writeToolAnnotations,
    },
    async (args) => {
      try {
        const input = SnapshotRestoreSchema.parse(args);
        const desired = await readSnapshotReference(input);
        const client = new VbMatrixClient();
        const targets = selectedRestoreTargets(desired, input.selectedPoints);
        const missingTargets = missingSelectedTargets(desired, targets);
        if (missingTargets.length > 0 && !input.allowMissingSelectedPoints) {
          throw new Error(
            `Selected restore points are not present in the desired snapshot: ${missingTargets.map(pointKey).join(', ')}`
          );
        }
        const restorableTargets = targets.filter((target) => !missingTargets.some((missing) => pointKey(missing) === pointKey(target)));
        const currentPoints = await Promise.all(restorableTargets.map((target) => queryPoint(client, target)));
        const current = createMatrixSnapshot({ metadata: {}, slots: [], points: currentPoints });
        const plan = planSnapshotRestore({
          desired,
          current,
          selectedPoints: targets,
          properties: input.properties as RestorablePointProperty[] | undefined,
          allowMissingSelectedPoints: input.allowMissingSelectedPoints,
        });

        if (input.dryRun) {
          return jsonResponse({ ok: true, dryRun: true, plan, safety: safetyDetails(client.config) });
        }
        if (input.confirmRestore !== 'RESTORE_SNAPSHOT') {
          throw new Error('Executing snapshot restore requires confirmRestore="RESTORE_SNAPSHOT"');
        }
        if (plan.summary.broad && !input.confirmBroadRestore) {
          throw new Error('Broad snapshot restore requires confirmBroadRestore=true after reviewing the dry-run plan');
        }

        for (const step of plan.steps) assertPointWriteAllowed(client.config, step.target);

        const results = [];
        for (const step of plan.steps) {
          await client.send(step.command);
          const after = await client.queryPointState(step.target);
          results.push({ ...step, after: after[step.property] });
        }

        return jsonResponse({ ok: true, dryRun: false, plan, results, safety: safetyDetails(client.config) });
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown VBMatrix snapshot restore error');
      }
    }
  );
}
