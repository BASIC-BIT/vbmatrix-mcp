import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateMatrixFilePath, type MatrixFilePathPolicy } from '../../src/core/matrixFilePolicy.js';

const root = path.resolve('D:/MatrixState/Presets');
const policies: MatrixFilePathPolicy[] = [
  {
    kind: 'presetPatch',
    allowedRoots: [root],
    allowedExtensions: ['.vbm-preset'],
  },
];

describe('Matrix file path policy', () => {
  test('accepts an absolute path under the matching configured root', () => {
    const filePath = path.join(root, 'Scene.VBM-PRESET');
    expect(validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)).toEqual({
      kind: 'presetPatch',
      operation: 'load',
      resolvedPath: path.resolve(filePath),
      matchedRoot: root,
      extension: '.vbm-preset',
      allowOverwrite: false,
    });
  });

  test('tracks explicit overwrite intent without inferring it', () => {
    const filePath = path.join(root, 'Scene.vbm-preset');
    expect(
      validateMatrixFilePath({ kind: 'presetPatch', operation: 'saveAs', filePath, allowOverwrite: true }, policies)
    ).toMatchObject({ allowOverwrite: true });
  });

  test('rejects relative paths', () => {
    expect(() =>
      validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath: 'Scene.vbm-preset' }, policies)
    ).toThrow(/absolute/);
  });

  test('rejects paths outside configured roots after resolution', () => {
    const filePath = path.join(root, '..', 'Other', 'Scene.vbm-preset');
    expect(() => validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)).toThrow(
      /outside allowed roots/
    );
  });

  test('rejects unallowlisted extensions', () => {
    const filePath = path.join(root, 'Scene.txt');
    expect(() => validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)).toThrow(
      /extension must be one of/
    );
  });

  test('requires a policy for the requested file kind', () => {
    const filePath = path.join(root, 'Project.vbm-project');
    expect(() => validateMatrixFilePath({ kind: 'project', operation: 'load', filePath }, policies)).toThrow(
      /No Matrix file path policy configured/
    );
  });
});
