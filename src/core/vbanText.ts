import { createSocket } from 'node:dgram';

export const VBAN_HEADER_SIZE = 28;
export const VBAN_TEXT_SR_INDEX = 0x52;
export const VBAN_TEXT_PROTOCOL = 0x40;
export const VBAN_SERVICE_PROTOCOL = 0x60;
export const VBAN_PROTOCOL_MASK = 0xe0;
export const VBAN_TEXT_UTF8_FORMAT = 0x10;
export const VBAN_REQUEST_REPLY_STREAM = 'Request Reply';
export const DEFAULT_FRAME_COUNTER = 0;
export const MAX_DIAGNOSTIC_IGNORED_PACKETS = 10;

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
  replyProductName?: string;
}

export type VbanPacketClassificationReason =
  | 'accepted_text'
  | 'accepted_service_request_reply'
  | 'too_short'
  | 'bad_magic'
  | 'text_non_utf8'
  | 'text_stream_mismatch'
  | 'service_stream_mismatch'
  | 'unsupported_protocol';

export type VbanTextTimeoutClassification =
  | 'no_packets_observed'
  | 'wrong_stream_observed'
  | 'unsupported_protocol_observed'
  | 'malformed_packet_observed'
  | 'packets_observed_no_matrix_reply';

export interface VbanPacketSummary {
  length: number;
  magic?: string;
  protocol?: number;
  protocolName?: 'text' | 'service' | 'unknown';
  streamName?: string;
  format?: number;
  frameCounter?: number;
}

export interface VbanPacketClassification {
  accepted: boolean;
  reason: VbanPacketClassificationReason;
  packet: VbanPacketSummary;
  payload?: string;
}

export interface VbanTextTimeoutDiagnostic {
  classification: VbanTextTimeoutClassification;
  indeterminate: boolean;
  observedPacketReasons: VbanPacketClassificationReason[];
  likelyCauses: string[];
}

export interface VbanTextExchangeDiagnostics {
  command: string;
  connection: {
    host: string;
    port: number;
    streamName: string;
    timeoutMs: number;
    responseStreamName: typeof VBAN_REQUEST_REPLY_STREAM;
  };
  sent: boolean;
  receivedPackets: number;
  ignoredPackets: VbanPacketClassification[];
  acceptedPacket?: VbanPacketClassification;
  timeoutDiagnostic?: VbanTextTimeoutDiagnostic;
  likelySetupStages: string[];
  replyProductName?: string;
}

export interface SendVbanTextDiagnosticsResult {
  response: string | null;
  diagnostics: VbanTextExchangeDiagnostics;
}

export class VbanTextTimeoutError extends Error {
  readonly diagnostics: VbanTextExchangeDiagnostics;

  constructor(command: string, diagnostics: VbanTextExchangeDiagnostics) {
    const productName = diagnostics.replyProductName ?? 'Matrix';
    super(
      `Timed out waiting for VBAN-TEXT response to ${command}. Check VBAN service, incoming TEXT stream '${diagnostics.connection.streamName}', UDP ${diagnostics.connection.host}:${diagnostics.connection.port}, and ${productName} '${VBAN_REQUEST_REPLY_STREAM}' replies.`
    );
    this.name = 'VbanTextTimeoutError';
    this.diagnostics = diagnostics;
  }
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

function protocolName(protocol: number): VbanPacketSummary['protocolName'] {
  if (protocol === VBAN_TEXT_PROTOCOL) return 'text';
  if (protocol === VBAN_SERVICE_PROTOCOL) return 'service';
  return 'unknown';
}

function setupStageHints(diagnostics: VbanTextExchangeDiagnostics): string[] {
  if (diagnostics.acceptedPacket) return [];
  const productName = diagnostics.replyProductName ?? 'Matrix';
  const hints = [`No accepted ${productName} query reply was received.`];
  if (diagnostics.receivedPackets === 0) {
    hints.push(
      `No UDP packets arrived before timeout. UDP cannot prove whether this is no listener, no command-stream reply, a disabled stream, firewall/network block, wrong host/port, or ${productName} not running.`
    );
  }
  const mismatch = diagnostics.ignoredPackets.find(
    (packet) => packet.reason === 'text_stream_mismatch' || packet.reason === 'service_stream_mismatch'
  );
  if (mismatch?.packet.streamName) {
    hints.push(
      `Observed VBAN stream '${mismatch.packet.streamName}' instead of expected command stream '${diagnostics.connection.streamName}' or ${productName} reply stream '${VBAN_REQUEST_REPLY_STREAM}'.`
    );
  }
  if (diagnostics.ignoredPackets.some((packet) => packet.reason === 'text_non_utf8')) {
    hints.push(
      `Observed VBAN-TEXT packet with a non-UTF-8 format byte; ${productName} command replies should be UTF-8 text.`
    );
  }
  if (diagnostics.ignoredPackets.some((packet) => packet.reason === 'unsupported_protocol')) {
    hints.push('Observed VBAN packets that were not TEXT or SERVICE protocol packets.');
  }
  return hints;
}

export function buildTimeoutDiagnostic(diagnostics: VbanTextExchangeDiagnostics): VbanTextTimeoutDiagnostic {
  const observedPacketReasons = [...new Set(diagnostics.ignoredPackets.map((packet) => packet.reason))];
  const productName = diagnostics.replyProductName ?? 'Matrix';

  if (diagnostics.receivedPackets === 0) {
    return {
      classification: 'no_packets_observed',
      indeterminate: true,
      observedPacketReasons,
      likelyCauses: [
        'wrong host or UDP port',
        'VBAN service off or blocked by firewall/network policy',
        `incoming TEXT stream disabled or ${productName} not running`,
        `${productName} received the command but did not emit an observable reply`,
      ],
    };
  }

  if (
    observedPacketReasons.some(
      (reason) => reason === 'text_stream_mismatch' || reason === 'service_stream_mismatch'
    )
  ) {
    return {
      classification: 'wrong_stream_observed',
      indeterminate: false,
      observedPacketReasons,
      likelyCauses: [
        `VBAN traffic arrived on a stream other than the configured command stream or ${productName} Request Reply stream`,
      ],
    };
  }

  if (observedPacketReasons.includes('unsupported_protocol')) {
    return {
      classification: 'unsupported_protocol_observed',
      indeterminate: false,
      observedPacketReasons,
      likelyCauses: [
        'VBAN packets arrived, but they were not TEXT or SERVICE protocol packets this diagnostic accepts',
      ],
    };
  }

  if (
    observedPacketReasons.some(
      (reason) => reason === 'too_short' || reason === 'bad_magic' || reason === 'text_non_utf8'
    )
  ) {
    return {
      classification: 'malformed_packet_observed',
      indeterminate: false,
      observedPacketReasons,
      likelyCauses: [
        `UDP/VBAN-like packets arrived, but no parseable ${productName} query reply was observed`,
      ],
    };
  }

  return {
    classification: 'packets_observed_no_matrix_reply',
    indeterminate: true,
    observedPacketReasons,
    likelyCauses: [
      `UDP packets arrived, but none matched the ${productName} query reply protocol and stream`,
    ],
  };
}

export function classifyVbanTextPacket(message: Buffer, streamName: string): VbanPacketClassification {
  const packet: VbanPacketSummary = { length: message.length };
  if (message.length < VBAN_HEADER_SIZE) return { accepted: false, reason: 'too_short', packet };

  packet.magic = message.subarray(0, 4).toString('ascii');
  if (packet.magic !== 'VBAN') return { accepted: false, reason: 'bad_magic', packet };

  const protocol = message[4] & VBAN_PROTOCOL_MASK;
  packet.protocol = protocol;
  packet.protocolName = protocolName(protocol);
  packet.streamName = readStreamName(message);
  packet.format = message[7];
  packet.frameCounter = message.readUInt32LE(24);

  if (protocol === VBAN_TEXT_PROTOCOL) {
    if (message[7] !== VBAN_TEXT_UTF8_FORMAT) return { accepted: false, reason: 'text_non_utf8', packet };
    if (packet.streamName !== streamName) return { accepted: false, reason: 'text_stream_mismatch', packet };
    return {
      accepted: true,
      reason: 'accepted_text',
      packet,
      payload: message.subarray(VBAN_HEADER_SIZE).toString('utf8'),
    };
  }

  if (protocol === VBAN_SERVICE_PROTOCOL) {
    if (packet.streamName !== VBAN_REQUEST_REPLY_STREAM) {
      return { accepted: false, reason: 'service_stream_mismatch', packet };
    }
    return {
      accepted: true,
      reason: 'accepted_service_request_reply',
      packet,
      payload: message.subarray(VBAN_HEADER_SIZE).toString('utf8'),
    };
  }

  return { accepted: false, reason: 'unsupported_protocol', packet };
}

export function extractVbanTextPayload(message: Buffer, streamName: string): string | null {
  const classification = classifyVbanTextPacket(message, streamName);
  return classification.accepted ? (classification.payload ?? '') : null;
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

export async function sendVbanTextCommandWithDiagnostics(
  command: string,
  options: SendVbanTextOptions
): Promise<SendVbanTextDiagnosticsResult> {
  const packet = buildVbanTextPacket(command, { streamName: options.streamName });
  const waitForResponse = options.waitForResponse ?? false;
  const diagnostics: VbanTextExchangeDiagnostics = {
    command,
    connection: {
      host: options.host,
      port: options.port,
      streamName: options.streamName,
      timeoutMs: options.timeoutMs,
      responseStreamName: VBAN_REQUEST_REPLY_STREAM,
    },
    sent: false,
    receivedPackets: 0,
    ignoredPackets: [],
    likelySetupStages: [],
    replyProductName: options.replyProductName,
  };

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
        diagnostics.timeoutDiagnostic = buildTimeoutDiagnostic(diagnostics);
        diagnostics.likelySetupStages = setupStageHints(diagnostics);
        settle(() => reject(new VbanTextTimeoutError(command, diagnostics)));
      }, options.timeoutMs);

      socket.on('message', (message) => {
        diagnostics.receivedPackets += 1;
        const classification = classifyVbanTextPacket(message, options.streamName);
        if (!classification.accepted) {
          if (diagnostics.ignoredPackets.length < MAX_DIAGNOSTIC_IGNORED_PACKETS) {
            diagnostics.ignoredPackets.push(classification);
          }
          return;
        }
        diagnostics.acceptedPacket = classification;
        diagnostics.likelySetupStages = setupStageHints(diagnostics);
        settle(() => resolve({ response: classification.payload ?? '', diagnostics }));
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
        diagnostics.sent = true;
        if (!waitForResponse) {
          settle(() => resolve({ response: null, diagnostics }));
        }
      });
    });
  });
}

export async function sendVbanTextCommand(
  command: string,
  options: SendVbanTextOptions
): Promise<string | null> {
  const result = await sendVbanTextCommandWithDiagnostics(command, options);
  return result.response;
}
