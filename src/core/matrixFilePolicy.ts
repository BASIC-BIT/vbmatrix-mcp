import path from 'node:path';

const matrixPath = path.win32;

export type MatrixFileKind = 'presetPatch' | 'project' | 'grid';
export type MatrixFileOperation = 'load' | 'save' | 'saveAs';

export interface MatrixFilePathPolicy {
  kind: MatrixFileKind;
  allowedRoots: string[];
  allowedExtensions: string[];
}

export interface MatrixFilePathRequest {
  kind: MatrixFileKind;
  operation: MatrixFileOperation;
  filePath: string;
  allowOverwrite?: boolean;
}

export interface MatrixFilePathDecision {
  kind: MatrixFileKind;
  operation: MatrixFileOperation;
  resolvedPath: string;
  matchedRoot: string;
  extension: string;
  allowOverwrite: boolean;
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) throw new Error('Allowed file extensions must not be empty');
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function resolveRoot(root: string): string {
  if (isUncPath(root)) throw new Error(`Matrix file roots must not be UNC paths: ${root}`);
  if (!matrixPath.isAbsolute(root))
    throw new Error(`Matrix file roots must be absolute Windows paths: ${root}`);
  return matrixPath.resolve(root);
}

function assertAbsoluteCandidate(filePath: string): void {
  if (isUncPath(filePath)) throw new Error('Matrix file paths must not be UNC paths');
  if (!matrixPath.isAbsolute(filePath)) throw new Error('Matrix file paths must be absolute Windows paths');
}

function isPathInsideRoot(resolvedPath: string, root: string): boolean {
  const relative = matrixPath.relative(root, resolvedPath);
  return relative === '' || (!relative.startsWith('..') && !matrixPath.isAbsolute(relative));
}

function isUncPath(value: string): boolean {
  return value.replaceAll('/', '\\').startsWith('\\\\');
}

export function validateMatrixFilePath(
  request: MatrixFilePathRequest,
  policies: MatrixFilePathPolicy[]
): MatrixFilePathDecision {
  assertAbsoluteCandidate(request.filePath);

  const policy = policies.find((candidate) => candidate.kind === request.kind);
  if (policy === undefined) throw new Error(`No Matrix file path policy configured for ${request.kind}`);
  if (policy.allowedRoots.length === 0)
    throw new Error(`No allowed Matrix file roots configured for ${request.kind}`);
  if (policy.allowedExtensions.length === 0) {
    throw new Error(`No allowed Matrix file extensions configured for ${request.kind}`);
  }

  const roots = policy.allowedRoots.map(resolveRoot);
  const resolvedPath = matrixPath.resolve(request.filePath);
  const matchedRoot = roots.find((root) => isPathInsideRoot(resolvedPath, root));
  if (matchedRoot === undefined) throw new Error(`Matrix ${request.kind} file path is outside allowed roots`);

  const extension = matrixPath.extname(resolvedPath).toLowerCase();
  const allowedExtensions = policy.allowedExtensions.map(normalizeExtension);
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`Matrix ${request.kind} file extension must be one of: ${allowedExtensions.join(', ')}`);
  }

  return {
    kind: request.kind,
    operation: request.operation,
    resolvedPath,
    matchedRoot,
    extension,
    allowOverwrite: request.allowOverwrite === true,
  };
}
