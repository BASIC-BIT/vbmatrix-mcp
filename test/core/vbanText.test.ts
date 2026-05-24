import { describe, expect, test } from 'vitest';
import {
  buildVbanTextPacket,
  extractVbanTextPayload,
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

  test('extracts only matching VBAN-TEXT payloads', () => {
    const packet = buildVbanTextPacket('Command.Version = VB-Audio Matrix;', {
      streamName: 'Command1',
      frameCounter: 1,
    });

    expect(extractVbanTextPayload(packet, 'Command1')).toBe('Command.Version = VB-Audio Matrix;');
    expect(extractVbanTextPayload(packet, 'Other')).toBeNull();
    expect(extractVbanTextPayload(Buffer.from('not-vban'), 'Command1')).toBeNull();
  });

  test('extracts Matrix query replies from Request Reply service packets', () => {
    const header = Buffer.alloc(VBAN_HEADER_SIZE);
    Buffer.from('VBAN', 'ascii').copy(header, 0);
    header[4] = 0x60;
    header[5] = 0x80;
    header[6] = 0x02;
    Buffer.from('Request Reply', 'utf8').copy(header, 8);
    header.writeUInt32LE(1, 24);

    const packet = Buffer.concat([header, Buffer.from('Command.Version = "VB-Audio Matrix";', 'utf8')]);

    expect(extractVbanTextPayload(packet, 'Command1')).toBe('Command.Version = "VB-Audio Matrix";');
  });
});
