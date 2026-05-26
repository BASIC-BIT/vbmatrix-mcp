import { existsSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VbMatrixClient } from '../core/client.js';
import { validateMatrixFilePath, type MatrixFileKind, type MatrixFileOperation } from '../core/matrixFilePolicy.js';
import { assertPresetPatchDestructiveAllowed, assertPresetPatchWriteAllowed, safetyDetails } from '../core/safety.js';
import { destructiveToolAnnotations, readOnlyToolAnnotations } from '../utils/toolAnnotations.js';
import { jsonResponse, toolError } from '../utils/toolResponses.js';

const MATRIX_FILE_EXTENSIONS = ['.xml'];

export const PresetPatchFileSchema = z.object({
  index: z.number().int().min(1).describe('1-based Matrix preset patch index.'),
  operation: z.enum(['load', 'saveAs']),
  filePath: z.string().min(1).describe('Absolute Windows file path under VBMATRIX_MCP_PRESET_PATCH_ROOTS.'),
  allowOverwrite: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  confirmOperation: z.literal('MATRIX_PRESET_FILE_WRITE').optional(),
});

function quoteMatrixFilePath(filePath: string): string {
  if (/[;"\r\n]/.test(filePath)) throw new Error('Matrix file paths must not contain semicolons, quotes, or newlines');
  return `"${filePath}"`;
}

function matrixFilePolicies(client: VbMatrixClient, kind: MatrixFileKind) {
  const roots = client.config.matrixFiles;
  const allowedRoots =
    kind === 'presetPatch'
      ? (roots?.presetPatchRoots ?? [])
      : kind === 'project'
        ? (roots?.projectRoots ?? [])
        : (roots?.gridRoots ?? []);
  return [{ kind, allowedRoots, allowedExtensions: MATRIX_FILE_EXTENSIONS }];
}

function commandForPresetPatchFile(index: number, operation: MatrixFileOperation, filePath: string): string {
  if (operation === 'load') return `PresetPatch[${index}].Load=${quoteMatrixFilePath(filePath)};`;
  if (operation === 'saveAs') return `PresetPatch[${index}].SaveAs=${quoteMatrixFilePath(filePath)};`;
  throw new Error(`Unsupported preset patch file operation: ${operation}`);
}

async function queryMatrixFileState(client: VbMatrixClient): Promise<Record<string, unknown>> {
  const project = await client.query('Command.Load=?;');
  const grid = await client.query('Command.LoadGrid=?;');
  return {
    ok: true,
    project,
    grid,
    connection: {
      host: client.config.host,
      port: client.config.port,
      streamName: client.config.streamName,
      timeoutMs: client.config.timeoutMs,
    },
  };
}

export async function runMatrixFileState(client: VbMatrixClient = new VbMatrixClient()): Promise<Record<string, unknown>> {
  return queryMatrixFileState(client);
}

export async function runPresetPatchFileOperation(
  input: z.infer<typeof PresetPatchFileSchema>,
  client: VbMatrixClient = new VbMatrixClient()
): Promise<Record<string, unknown>> {
  const pathDecision = validateMatrixFilePath(
    { kind: 'presetPatch', operation: input.operation, filePath: input.filePath, allowOverwrite: input.allowOverwrite },
    matrixFilePolicies(client, 'presetPatch')
  );
  const exists = existsSync(pathDecision.resolvedPath);
  if (input.operation === 'load' && !exists) throw new Error('Preset patch load file does not exist');
  if (input.operation === 'saveAs' && exists && !input.allowOverwrite) {
    throw new Error('Preset patch saveAs target exists; set allowOverwrite=true after review');
  }

  const command = commandForPresetPatchFile(input.index, input.operation, pathDecision.resolvedPath);
  const before = await queryMatrixFileState(client);
  const destructive = input.operation === 'load' || input.allowOverwrite;
  const plan = {
    index: input.index,
    operation: input.operation,
    destructive,
    command,
    path: pathDecision,
    existsBefore: exists,
    requiredConfirmation: 'MATRIX_PRESET_FILE_WRITE',
  };
  if (input.dryRun) return { ok: true, dryRun: true, plan, before, safety: safetyDetails(client.config) };

  if (input.confirmOperation !== 'MATRIX_PRESET_FILE_WRITE') {
    throw new Error('Executing preset patch file operations requires confirmOperation="MATRIX_PRESET_FILE_WRITE"');
  }
  if (destructive) assertPresetPatchDestructiveAllowed(client.config, input.index);
  else assertPresetPatchWriteAllowed(client.config, input.index);

  await client.send(command);
  const after = await queryMatrixFileState(client);
  return { ok: true, dryRun: false, plan, before, after, safety: safetyDetails(client.config) };
}

export function registerMatrixFileTools(server: McpServer): void {
  server.registerTool(
    'vbmatrix_get_file_state',
    {
      description: 'Read current Matrix project/grid file state with Command.Load=? and Command.LoadGrid=?.',
      inputSchema: z.object({}),
      annotations: readOnlyToolAnnotations,
    },
    async () => {
      try {
        return jsonResponse(await runMatrixFileState());
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown Matrix file state error');
      }
    }
  );

  server.registerTool(
    'vbmatrix_preset_patch_file',
    {
      description:
        'Load or SaveAs one Matrix preset patch XML file under VBMATRIX_MCP_PRESET_PATCH_ROOTS. Dry-run by default; execution requires confirmation.',
      inputSchema: PresetPatchFileSchema,
      annotations: destructiveToolAnnotations,
    },
    async (args) => {
      try {
        return jsonResponse(await runPresetPatchFileOperation(PresetPatchFileSchema.parse(args)));
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Unknown Matrix preset patch file error');
      }
    }
  );

}
