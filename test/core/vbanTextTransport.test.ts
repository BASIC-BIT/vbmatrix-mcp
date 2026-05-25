import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';

class MockUdpSocket extends EventEmitter {
  readonly close = vi.fn();

  readonly connect = vi.fn((_port: number, _host: string, callback: () => void) => {
    queueMicrotask(callback);
  });

  readonly send = vi.fn((_packet: Buffer, callback: (err?: Error | null) => void) => {
    callback(null);
  });
}

interface VbanTextModule {
  VBAN_HEADER_SIZE: number;
  VBAN_REQUEST_REPLY_STREAM: string;
  VBAN_SERVICE_PROTOCOL: number;
  buildVbanTextPacket(command: string, options: { streamName: string; frameCounter?: number }): Buffer;
  sendVbanTextCommandWithDiagnostics(
    command: string,
    options: { host: string; port: number; streamName: string; timeoutMs: number; waitForResponse?: boolean }
  ): Promise<{
    response: string | null;
    diagnostics: {
      sent: boolean;
      receivedPackets: number;
      ignoredPackets: { reason: string }[];
      timeoutDiagnostic?: { classification: string; indeterminate: boolean; observedPacketReasons: string[] };
    };
  }>;
}

async function loadWithMockSocket(socket: MockUdpSocket): Promise<VbanTextModule> {
  vi.resetModules();
  vi.doMock('node:dgram', () => ({
    createSocket: vi.fn(() => socket),
  }));
  return import('../../src/core/vbanText.js') as Promise<VbanTextModule>;
}

function buildServicePacket(module: VbanTextModule, streamName: string, payload: string): Buffer {
  const header = Buffer.alloc(module.VBAN_HEADER_SIZE);
  Buffer.from('VBAN', 'ascii').copy(header, 0);
  header[4] = module.VBAN_SERVICE_PROTOCOL;
  header[5] = 0x80;
  header[6] = 0x02;
  Buffer.from(streamName, 'utf8').copy(header, 8);
  header.writeUInt32LE(1, 24);
  return Buffer.concat([header, Buffer.from(payload, 'utf8')]);
}

afterEach(() => {
  vi.doUnmock('node:dgram');
  vi.useRealTimers();
});

describe('VBAN-TEXT UDP exchange diagnostics', () => {
  test('ignores malformed packets and wrong streams before accepting Matrix Request Reply service packets', async () => {
    vi.useFakeTimers();
    const socket = new MockUdpSocket();
    const module = await loadWithMockSocket(socket);
    const exchange = module.sendVbanTextCommandWithDiagnostics('Command.Version=?;', {
      host: '127.0.0.1',
      port: 6980,
      streamName: 'Command1',
      timeoutMs: 1000,
      waitForResponse: true,
    });
    await Promise.resolve();

    socket.emit('message', Buffer.from('noise'));
    socket.emit(
      'message',
      module.buildVbanTextPacket('Command.Version = "VB-Audio Matrix";', {
        streamName: 'Command2',
        frameCounter: 1,
      })
    );
    socket.emit(
      'message',
      buildServicePacket(module, module.VBAN_REQUEST_REPLY_STREAM, 'Command.Version = "VB-Audio Matrix";')
    );

    await expect(exchange).resolves.toMatchObject({
      response: 'Command.Version = "VB-Audio Matrix";',
      diagnostics: {
        sent: true,
        receivedPackets: 3,
        ignoredPackets: [{ reason: 'too_short' }, { reason: 'text_stream_mismatch' }],
      },
    });
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  test('returns Matrix Err service replies as payloads for callers to classify', async () => {
    vi.useFakeTimers();
    const socket = new MockUdpSocket();
    const module = await loadWithMockSocket(socket);
    const exchange = module.sendVbanTextCommandWithDiagnostics('Point(VAIO1.IN[1],VAIO1.OUT[1]).dBGain=?;', {
      host: '127.0.0.1',
      port: 6980,
      streamName: 'Command1',
      timeoutMs: 1000,
      waitForResponse: true,
    });
    await Promise.resolve();

    socket.emit(
      'message',
      buildServicePacket(
        module,
        module.VBAN_REQUEST_REPLY_STREAM,
        'Point(VAIO1.IN[1],VAIO1.OUT[1]).dBGain = Err;'
      )
    );

    await expect(exchange).resolves.toMatchObject({
      response: 'Point(VAIO1.IN[1],VAIO1.OUT[1]).dBGain = Err;',
      diagnostics: {
        sent: true,
        receivedPackets: 1,
        ignoredPackets: [],
      },
    });
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  test('times out with wrong-stream diagnostics when only non-matching packets arrive', async () => {
    vi.useFakeTimers();
    const socket = new MockUdpSocket();
    const module = await loadWithMockSocket(socket);
    const exchange = module.sendVbanTextCommandWithDiagnostics('Command.Version=?;', {
      host: '127.0.0.1',
      port: 6980,
      streamName: 'Command1',
      timeoutMs: 50,
      waitForResponse: true,
    });
    await Promise.resolve();

    socket.emit('message', buildServicePacket(module, 'Other Reply', 'Command.Version = "VB-Audio Matrix";'));
    const rejection = expect(exchange).rejects.toMatchObject({
      name: 'VbanTextTimeoutError',
      diagnostics: {
        sent: true,
        receivedPackets: 1,
        ignoredPackets: [{ reason: 'service_stream_mismatch' }],
        timeoutDiagnostic: {
          classification: 'wrong_stream_observed',
          indeterminate: false,
          observedPacketReasons: ['service_stream_mismatch'],
        },
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  test('times out as indeterminate when no packets are observed, matching wrong-port symptoms', async () => {
    vi.useFakeTimers();
    const socket = new MockUdpSocket();
    const module = await loadWithMockSocket(socket);
    const exchange = module.sendVbanTextCommandWithDiagnostics('Command.Version=?;', {
      host: '127.0.0.1',
      port: 6981,
      streamName: 'Command1',
      timeoutMs: 50,
      waitForResponse: true,
    });
    await Promise.resolve();

    const rejection = expect(exchange).rejects.toMatchObject({
      name: 'VbanTextTimeoutError',
      diagnostics: {
        sent: true,
        receivedPackets: 0,
        ignoredPackets: [],
        timeoutDiagnostic: {
          classification: 'no_packets_observed',
          indeterminate: true,
          observedPacketReasons: [],
        },
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
