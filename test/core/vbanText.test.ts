import { describe, expect, test } from 'vitest';
import {
  buildVbanTextPacket,
  VBAN_HEADER_SIZE,
  VBAN_TEXT_SR_INDEX,
  VBAN_TEXT_UTF8_FORMAT,
} from '../../src/core/vbanText.js';

describe('VBAN-TEXT packet builder', () => {
  test('builds a VBAN-TEXT header and payload', () => {
    const packet = buildVbanTextPacket('Command.Version=?;', { streamName: 'Command1', frameCounter: 7 });

    expect(packet.subarray(0, 4).toString('ascii')).toBe('VBAN');
    expect(packet[4]).toBe(VBAN_TEXT_SR_INDEX);
    expect(packet[7]).toBe(VBAN_TEXT_UTF8_FORMAT);
    expect(packet.subarray(8, 24).toString('utf8').replace(/\0+$/, '')).toBe('Command1');
    expect(packet.readUInt32LE(24)).toBe(7);
    expect(packet.subarray(VBAN_HEADER_SIZE).toString('utf8')).toBe('Command.Version=?;');
  });

  test('rejects stream names longer than VBAN header field', () => {
    expect(() => buildVbanTextPacket('Command.Version=?;', { streamName: '12345678901234567' })).toThrow(
      /16 bytes/
    );
  });
});
