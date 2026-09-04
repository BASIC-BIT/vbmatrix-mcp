import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  diffMatrixSavedSettings,
  loadMatrixSavedSettingsFile,
  parseMatrixSavedSettingsXml,
  SavedSettingsError,
} from '../../src/core/savedSettings.js';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'saved-settings'
);
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'vb-audio-mcp-saved-settings-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('saved Matrix settings parser', () => {
  test('parses sanitized slots, routes, sections, and topology summary', async () => {
    const loaded = await loadMatrixSavedSettingsFile(path.join(fixtureRoot, 'before.xml'), {
      allowedRoots: [fixtureRoot],
    });

    expect(loaded).toMatchObject({
      schemaVersion: 'vbmatrix.saved-settings.v1',
      rootElement: 'VBAudioMatrixSettings',
      stateSource: 'saved-settings-file',
      liveState: false,
      summary: {
        slotCount: 5,
        routeCount: 3,
        routeGroupCount: 2,
        routeGroupsTruncated: false,
        mutedRouteCount: 1,
        phaseReversedRouteCount: 1,
        masterSuids: ['ASIO64A'],
      },
    });
    expect(loaded.summary.slotCountByKind).toEqual({
      asio_device: 1,
      clock: 1,
      vaio: 1,
      vban: 1,
      windows_device: 1,
    });
    expect(loaded.summary.routeGroups[0]).toEqual({
      inputSuid: 'VAIO1',
      outputSuid: 'ASIO64A',
      routeCount: 2,
    });
    expect(loaded.file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.routes[1]).toMatchObject({
      inputSuid: 'VAIO1',
      inputChannel: 2,
      outputSuid: 'ASIO64A',
      outputChannel: 10,
      gainDb: -3,
      muted: true,
      phaseReversed: false,
    });
  });

  test('diffs route and slot additions, removals, and state changes deterministically', async () => {
    const [before, after] = await Promise.all([
      loadMatrixSavedSettingsFile(path.join(fixtureRoot, 'before.xml'), { allowedRoots: [fixtureRoot] }),
      loadMatrixSavedSettingsFile(path.join(fixtureRoot, 'after.xml'), { allowedRoots: [fixtureRoot] }),
    ]);
    const diff = diffMatrixSavedSettings(before, after);

    expect(diff.routes.added).toHaveLength(1);
    expect(diff.routes.removed).toHaveLength(1);
    expect(diff.routes.changed).toHaveLength(1);
    expect(diff.routes.changed[0]?.after.gainDb).toBe(-6);
    expect(diff.slots.added.map((slot) => slot.suid)).toEqual(['VASIO8']);
    expect(diff.slots.removed.map((slot) => slot.suid)).toEqual(['VBAN1']);
    expect(diff.slots.changed).toHaveLength(1);
    expect(diff.slots.changed[0]?.after.outputDelayMs).toBe(2.5);
  });

  test('treats numerically equal gain formatting as unchanged', () => {
    const before = parseMatrixSavedSettingsXml(
      '<VBAudioMatrixSettings><VBAudioMatrixGridConfiguration><Point slotin="VAIO1" in="1" slotout="VAIO1" out="1" dBGain="0.00" mute="0" phase="0" /></VBAudioMatrixGridConfiguration></VBAudioMatrixSettings>'
    );
    const after = parseMatrixSavedSettingsXml(
      '<VBAudioMatrixSettings><VBAudioMatrixGridConfiguration><Point slotin="VAIO1" in="1" slotout="VAIO1" out="1" dBGain="0" mute="0" phase="0" /></VBAudioMatrixGridConfiguration></VBAudioMatrixSettings>'
    );
    expect(diffMatrixSavedSettings(before, after).routes.changed).toEqual([]);
  });

  test('caps topology groups independently of the route parser limit', () => {
    const points = Array.from(
      { length: 201 },
      (_, index) => `<Point slotin="VAIO${index + 1}" in="1" slotout="ASIO${index + 1}" out="1" />`
    ).join('');
    const parsed = parseMatrixSavedSettingsXml(
      `<VBAudioMatrixSettings><VBAudioMatrixGridConfiguration>${points}</VBAudioMatrixGridConfiguration></VBAudioMatrixSettings>`
    );
    expect(parsed.summary).toMatchObject({
      routeGroupCount: 201,
      routeGroupsTruncated: true,
    });
    expect(parsed.summary.routeGroups).toHaveLength(200);
  });

  test('rejects malformed XML, wrong roots, doctypes, and duplicate diff identities', () => {
    expect(() => parseMatrixSavedSettingsXml('<VBAudioMatrixSettings>')).toThrow(SavedSettingsError);
    expect(() => parseMatrixSavedSettingsXml('<OtherSettings />')).toThrow(/Expected VBAudioMatrixSettings/);
    expect(() =>
      parseMatrixSavedSettingsXml(
        '<!DOCTYPE VBAudioMatrixSettings [<!ENTITY example "expanded">]><VBAudioMatrixSettings />'
      )
    ).toThrow(/DOCTYPE/);

    const duplicate = parseMatrixSavedSettingsXml(
      '<VBAudioMatrixSettings><VBAudioMatrixGridConfiguration><Point slotin="VAIO1" in="1" slotout="VAIO1" out="1" /><Point slotin="VAIO1" in="1" slotout="VAIO1" out="1" /></VBAudioMatrixGridConfiguration></VBAudioMatrixSettings>'
    );
    expect(() => diffMatrixSavedSettings(duplicate, duplicate)).toThrow(/duplicate routing-point/);

    const duplicateSlot = parseMatrixSavedSettingsXml(
      '<VBAudioMatrixSettings><VBAudioMatrixSlotConfiguration><VAIOSlot uniq="VAIO1" /><VAIOSlot uniq="vaio1" /></VBAudioMatrixSlotConfiguration></VBAudioMatrixSettings>'
    );
    expect(() => diffMatrixSavedSettings(duplicateSlot, duplicateSlot)).toThrow(
      /duplicate non-empty slot SUIDs/
    );
  });

  test('requires a configured root and rejects paths outside it or with another extension', async () => {
    await expect(
      loadMatrixSavedSettingsFile(path.join(fixtureRoot, 'before.xml'), { allowedRoots: [] })
    ).rejects.toMatchObject({ code: 'saved_settings_roots_not_configured' });

    const root = await temporaryRoot();
    await expect(
      loadMatrixSavedSettingsFile(path.join(fixtureRoot, 'before.xml'), { allowedRoots: [root] })
    ).rejects.toMatchObject({ code: 'saved_settings_path_outside_roots' });

    const wrongExtension = path.join(root, 'settings.txt');
    await writeFile(wrongExtension, '<VBAudioMatrixSettings />', 'utf8');
    await expect(loadMatrixSavedSettingsFile(wrongExtension, { allowedRoots: [root] })).rejects.toMatchObject(
      {
        code: 'saved_settings_extension_forbidden',
      }
    );
  });

  test('rejects oversized files before XML parsing', async () => {
    const root = await temporaryRoot();
    const filePath = path.join(root, 'oversized.xml');
    await writeFile(filePath, 'x'.repeat(1_025), 'utf8');
    await expect(
      loadMatrixSavedSettingsFile(filePath, { allowedRoots: [root], maxFileBytes: 1_024 })
    ).rejects.toMatchObject({ code: 'saved_settings_file_too_large' });
  });

  test('rejects a directory link that resolves outside the configured root', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    const outsideFile = path.join(outside, 'outside.xml');
    await writeFile(outsideFile, '<VBAudioMatrixSettings />', 'utf8');
    const linkPath = path.join(root, 'linked');
    await mkdir(root, { recursive: true });
    await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(
      loadMatrixSavedSettingsFile(path.join(linkPath, 'outside.xml'), { allowedRoots: [root] })
    ).rejects.toMatchObject({ code: 'saved_settings_path_outside_roots' });
  });
});
