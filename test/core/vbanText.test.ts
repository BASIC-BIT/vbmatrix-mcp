import { describe, expect, test } from 'vitest';
import {
  buildTimeoutDiagnostic,
  buildVbanTextPacket,
  classifyVbanTextPacket,
  extractVbanTextPayload,
  VBAN_HEADER_SIZE,
  VBAN_REQUEST_REPLY_STREAM,
  VBAN_SERVICE_PROTOCOL,
  VBAN_TEXT_SR_INDEX,
  VBAN_TEXT_UTF8_FORMAT,
  type VbanTextExchangeDiagnostics,
} from '../../src/core/vbanText.js';

function buildServicePacket(streamName: string, payload: string): Buffer {
  const header = Buffer.alloc(VBAN_HEADER_SIZE);
  Buffer.from('VBAN', 'ascii').copy(header, 0);
  header[4] = VBAN_SERVICE_PROTOCOL;
  header[5] = 0x80;
  header[6] = 0x02;
  Buffer.from(streamName, 'utf8').copy(header, 8);
  header.writeUInt32LE(1, 24);
  return Buffer.concat([header, Buffer.from(payload, 'utf8')]);
}

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
    const packet = buildServicePacket(VBAN_REQUEST_REPLY_STREAM, 'Command.Version = "VB-Audio Matrix";');

    expect(extractVbanTextPayload(packet, 'Command1')).toBe('Command.Version = "VB-Audio Matrix";');
  });

  test('classifies accepted Matrix Request Reply service packets', () => {
    const packet = buildServicePacket(VBAN_REQUEST_REPLY_STREAM, 'Command.Version = "VB-Audio Matrix";');

    expect(classifyVbanTextPacket(packet, 'Command1')).toMatchObject({
      accepted: true,
      reason: 'accepted_service_request_reply',
      packet: {
        protocol: VBAN_SERVICE_PROTOCOL,
        protocolName: 'service',
        streamName: VBAN_REQUEST_REPLY_STREAM,
      },
      payload: 'Command.Version = "VB-Audio Matrix";',
    });
  });

  test('classifies command stream mismatches for diagnostics', () => {
    const packet = buildVbanTextPacket('Command.Version = "VB-Audio Matrix";', {
      streamName: 'Command2',
      frameCounter: 2,
    });

    expect(classifyVbanTextPacket(packet, 'Command1')).toMatchObject({
      accepted: false,
      reason: 'text_stream_mismatch',
      packet: {
        protocolName: 'text',
        streamName: 'Command2',
      },
    });
  });

  test('classifies malformed or unrelated packets for diagnostics', () => {
    const packet = buildVbanTextPacket('Command.Version = "VB-Audio Matrix";', {
      streamName: 'Command1',
      frameCounter: 3,
    });
    packet[7] = 0x00;

    expect(classifyVbanTextPacket(Buffer.from('not-vban'), 'Command1')).toMatchObject({
      accepted: false,
      reason: 'too_short',
    });
    expect(
      classifyVbanTextPacket(Buffer.concat([Buffer.from('NOPE'), packet.subarray(4)]), 'Command1')
    ).toMatchObject({
      accepted: false,
      reason: 'bad_magic',
    });
    expect(classifyVbanTextPacket(packet, 'Command1')).toMatchObject({
      accepted: false,
      reason: 'text_non_utf8',
    });
  });

  test('shapes zero-packet timeouts as indeterminate no-packet diagnostics', () => {
    const diagnostics: VbanTextExchangeDiagnostics = {
      command: 'Command.Version=?;',
      connection: {
        host: '127.0.0.1',
        port: 6980,
        streamName: 'Command1',
        timeoutMs: 10,
        responseStreamName: VBAN_REQUEST_REPLY_STREAM,
      },
      sent: true,
      receivedPackets: 0,
      ignoredPackets: [],
      likelySetupStages: [],
    };

    const timeoutDiagnostic = buildTimeoutDiagnostic(diagnostics);

    expect(timeoutDiagnostic).toMatchObject({
      classification: 'no_packets_observed',
      indeterminate: true,
      observedPacketReasons: [],
    });
    expect(timeoutDiagnostic.likelyCauses).toContain('wrong host or UDP port');
    expect(timeoutDiagnostic.likelyCauses).toContain(
      'Matrix received the command but did not emit an observable reply'
    );
  });

  test('uses product-specific timeout causes for non-Matrix diagnostics', () => {
    const diagnostics: VbanTextExchangeDiagnostics = {
      command: 'Strip[0].Gain=?;',
      connection: {
        host: '127.0.0.1',
        port: 6982,
        streamName: 'Command1',
        timeoutMs: 10,
        responseStreamName: VBAN_REQUEST_REPLY_STREAM,
      },
      sent: true,
      receivedPackets: 0,
      ignoredPackets: [],
      likelySetupStages: [],
      replyProductName: 'Voicemeeter',
    };

    const timeoutDiagnostic = buildTimeoutDiagnostic(diagnostics);

    expect(timeoutDiagnostic.likelyCauses).toContain(
      'incoming TEXT stream disabled or Voicemeeter not running'
    );
    expect(timeoutDiagnostic.likelyCauses).toContain(
      'Voicemeeter received the command but did not emit an observable reply'
    );
    expect(JSON.stringify(timeoutDiagnostic)).not.toContain('Matrix');
  });

  test('uses a product-neutral fallback timeout classification', () => {
    const diagnostics: VbanTextExchangeDiagnostics = {
      command: 'Strip[0].Gain=?;',
      connection: {
        host: '127.0.0.1',
        port: 6982,
        streamName: 'Command1',
        timeoutMs: 10,
        responseStreamName: VBAN_REQUEST_REPLY_STREAM,
      },
      sent: true,
      receivedPackets: 1,
      ignoredPackets: [],
      likelySetupStages: [],
      replyProductName: 'Voicemeeter',
    };

    expect(buildTimeoutDiagnostic(diagnostics).classification).toBe('packets_observed_no_accepted_reply');
  });

  test('shapes observed timeout packets without collapsing wrong stream and unsupported protocol cases', () => {
    const wrongStreamPacket = buildVbanTextPacket('Command.Version = "VB-Audio Matrix";', {
      streamName: 'Command2',
      frameCounter: 4,
    });
    const unsupportedPacket = Buffer.from(wrongStreamPacket);
    unsupportedPacket[4] = 0x20;
    const baseDiagnostics: VbanTextExchangeDiagnostics = {
      command: 'Command.Version=?;',
      connection: {
        host: '127.0.0.1',
        port: 6980,
        streamName: 'Command1',
        timeoutMs: 10,
        responseStreamName: VBAN_REQUEST_REPLY_STREAM,
      },
      sent: true,
      receivedPackets: 1,
      ignoredPackets: [classifyVbanTextPacket(wrongStreamPacket, 'Command1')],
      likelySetupStages: [],
    };

    expect(buildTimeoutDiagnostic(baseDiagnostics)).toMatchObject({
      classification: 'wrong_stream_observed',
      indeterminate: false,
      observedPacketReasons: ['text_stream_mismatch'],
    });

    expect(
      buildTimeoutDiagnostic({
        ...baseDiagnostics,
        ignoredPackets: [classifyVbanTextPacket(unsupportedPacket, 'Command1')],
      })
    ).toMatchObject({
      classification: 'unsupported_protocol_observed',
      indeterminate: false,
      observedPacketReasons: ['unsupported_protocol'],
    });
  });
});
