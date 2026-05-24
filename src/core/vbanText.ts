import { createSocket } from 'node:dgram';

export const VBAN_HEADER_SIZE = 28;
export const VBAN_TEXT_SR_INDEX = 0x52;
export const VBAN_TEXT_UTF8_FORMAT = 0x10;
export const DEFAULT_FRAME_COUNTER = 0;

let frameCounter = DEFAULT_FRAME_COUNTER;

export interface BuildPacketOptions {
  streamName: string;
  frameCounter?: number;
}

export interface SendVbanTextOptions {
  host: string;
  port: number;
  streamName: string;
  timeoutMs: number;
  waitForResponse?: boolean;
}

function nextFrameCounter(): number {
  frameCounter = (frameCounter + 1) >>> 0;
  return frameCounter;
}

function streamNameBuffer(streamName: string): Buffer {
  const stream = Buffer.from(streamName, 'utf8');
  if (stream.length > 16) {
    throw new Error('VBAN stream name must be 16 bytes or fewer');
  }
  const padded = Buffer.alloc(16);
  stream.copy(padded, 0);
  return padded;
}

export function buildVbanTextPacket(command: string, options: BuildPacketOptions): Buffer {
  const header = Buffer.alloc(VBAN_HEADER_SIZE);
  Buffer.from('VBAN', 'ascii').copy(header, 0);
  header[4] = VBAN_TEXT_SR_INDEX;
  header[5] = 0;
  header[6] = 0;
  header[7] = VBAN_TEXT_UTF8_FORMAT;
  streamNameBuffer(options.streamName).copy(header, 8);
  header.writeUInt32LE(options.frameCounter ?? nextFrameCounter(), 24);
  return Buffer.concat([header, Buffer.from(command, 'utf8')]);
}

export async function sendVbanTextCommand(command: string, options: SendVbanTextOptions): Promise<string | null> {
  const packet = buildVbanTextPacket(command, { streamName: options.streamName });
  const waitForResponse = options.waitForResponse ?? false;

  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.close();
      callback();
    };

    if (waitForResponse) {
      timer = setTimeout(() => {
        settle(() => reject(new Error(`Timed out waiting for VBAN-TEXT response to ${command}`)));
      }, options.timeoutMs);

      socket.once('message', (message) => {
        const response = message.subarray(VBAN_HEADER_SIZE).toString('utf8');
        settle(() => resolve(response));
      });
    }

    socket.send(packet, options.port, options.host, (err) => {
      if (err) {
        settle(() => reject(err));
        return;
      }
      if (!waitForResponse) {
        settle(() => resolve(null));
      }
    });
  });
}
