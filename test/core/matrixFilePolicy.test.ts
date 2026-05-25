import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateMatrixFilePath, type MatrixFilePathPolicy } from '../../src/core/matrixFilePolicy.js';

const root = path.win32.resolve('D:/MatrixState/Presets');
const policies: MatrixFilePathPolicy[] = [
  {
    kind: 'presetPatch',
    allowedRoots: [root],
    allowedExtensions: ['.vbm-preset'],
  },
];

describe('Matrix file path policy', () => {
  test('accepts an absolute path under the matching configured root', () => {
    const filePath = path.win32.join(root, 'Scene.VBM-PRESET');
    expect(validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)).toEqual({
      kind: 'presetPatch',
      operation: 'load',
      resolvedPath: path.win32.resolve(filePath),
      matchedRoot: root,
      extension: '.vbm-preset',
      allowOverwrite: false,
    });
  });

  test('uses Windows path semantics on any host platform', () => {
    const filePath = 'D:\\MatrixState\\Presets\\Scene.vbm-preset';
    expect(
      validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)
    ).toMatchObject({
      resolvedPath: path.win32.resolve(filePath),
      matchedRoot: root,
    });
  });

  test('tracks explicit overwrite intent without inferring it', () => {
    const filePath = path.win32.join(root, 'Scene.vbm-preset');
    expect(
      validateMatrixFilePath(
        { kind: 'presetPatch', operation: 'saveAs', filePath, allowOverwrite: true },
        policies
      )
    ).toMatchObject({ allowOverwrite: true });
  });

  test('rejects relative paths', () => {
    expect(() =>
      validateMatrixFilePath(
        { kind: 'presetPatch', operation: 'load', filePath: 'Scene.vbm-preset' },
        policies
      )
    ).toThrow(/absolute/);
  });

  test('rejects drive-relative and rooted-but-drive-implicit paths', () => {
    for (const filePath of ['D:Scene.vbm-preset', '\\MatrixState\\Presets\\Scene.vbm-preset']) {
      expect(() =>
        validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)
      ).toThrow(/drive-qualified/);
    }

    expect(() =>
      validateMatrixFilePath(
        { kind: 'presetPatch', operation: 'load', filePath: 'D:/MatrixState/Presets/Scene.vbm-preset' },
        [
          {
            kind: 'presetPatch',
            allowedRoots: ['\\MatrixState\\Presets'],
            allowedExtensions: ['.vbm-preset'],
          },
        ]
      )
    ).toThrow(/drive-qualified/);
  });

  test('rejects paths outside configured roots after resolution', () => {
    const filePath = path.win32.join(root, '..', 'Other', 'Scene.vbm-preset');
    expect(() =>
      validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)
    ).toThrow(/outside allowed roots/);
  });

  test('rejects UNC candidates and roots', () => {
    expect(() =>
      validateMatrixFilePath(
        { kind: 'presetPatch', operation: 'load', filePath: '\\\\server\\share\\Scene.vbm-preset' },
        policies
      )
    ).toThrow(/UNC/);

    expect(() =>
      validateMatrixFilePath(
        { kind: 'presetPatch', operation: 'load', filePath: 'D:/MatrixState/Presets/Scene.vbm-preset' },
        [{ kind: 'presetPatch', allowedRoots: ['\\\\server\\share'], allowedExtensions: ['.vbm-preset'] }]
      )
    ).toThrow(/UNC/);
  });

  test('rejects unallowlisted extensions', () => {
    const filePath = path.win32.join(root, 'Scene.txt');
    expect(() =>
      validateMatrixFilePath({ kind: 'presetPatch', operation: 'load', filePath }, policies)
    ).toThrow(/extension must be one of/);
  });

  test('requires a policy for the requested file kind', () => {
    const filePath = path.win32.join(root, 'Project.vbm-project');
    expect(() => validateMatrixFilePath({ kind: 'project', operation: 'load', filePath }, policies)).toThrow(
      /No Matrix file path policy configured/
    );
  });
});
