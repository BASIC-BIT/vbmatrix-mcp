import { createSocket } from 'node:dgram';

export const VBAN_HEADER_SIZE = 28;
export const VBAN_TEXT_SR_INDEX = 0x52;
export const VBAN_TEXT_PROTOCOL = 0x40;
export const VBAN_SERVICE_PROTOCOL = 0x60;
export const VBAN_PROTOCOL_MASK = 0xe0;
export const VBAN_TEXT_UTF8_FORMAT = 0x10;
export const VBAN_REQUEST_REPLY_STREAM = 'Request Reply';
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

function readStreamName(message: Buffer): string {
  return message.subarray(8, 24).toString('utf8').replace(/\0+$/, '');
}

export function extractVbanTextPayload(message: Buffer, streamName: string): string | null {
  if (message.length < VBAN_HEADER_SIZE) return null;
  if (message.subarray(0, 4).toString('ascii') !== 'VBAN') return null;
  const protocol = message[4] & VBAN_PROTOCOL_MASK;
  const responseStreamName = readStreamName(message);
  if (protocol === VBAN_TEXT_PROTOCOL) {
    if (message[7] !== VBAN_TEXT_UTF8_FORMAT) return null;
    if (responseStreamName !== streamName) return null;
  } else if (protocol === VBAN_SERVICE_PROTOCOL) {
    if (responseStreamName !== VBAN_REQUEST_REPLY_STREAM) return null;
  } else {
    return null;
  }
  return message.subarray(VBAN_HEADER_SIZE).toString('utf8');
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

      socket.on('message', (message) => {
        const response = extractVbanTextPayload(message, options.streamName);
        if (response === null) return;
        settle(() => resolve(response));
      });
    }

    socket.once('error', (err) => {
      settle(() => reject(err));
    });

    socket.connect(options.port, options.host, () => {
      socket.send(packet, (err) => {
        if (err) {
          settle(() => reject(err));
          return;
        }
        if (!waitForResponse) {
          settle(() => resolve(null));
        }
      });
    });
  });
}
