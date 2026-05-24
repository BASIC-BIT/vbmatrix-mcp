export interface PcmAudio {
  sampleRate: number;
  channels: number;
  samples: Float64Array[];
}

export interface AudioLevel {
  rms: number;
  rmsDbfs: number;
}

const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const PCM_FORMAT = 1;
const FLOAT_FORMAT = 3;

function readAscii(buffer: Buffer, offset: number, length: number): string {
  return buffer.subarray(offset, offset + length).toString('ascii');
}

function findChunk(buffer: Buffer, chunkId: string): Buffer {
  let offset = RIFF_HEADER_SIZE;
  while (offset + CHUNK_HEADER_SIZE <= buffer.length) {
    const id = readAscii(buffer, offset, 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + CHUNK_HEADER_SIZE;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw new Error(`Invalid WAV chunk size for ${id}`);
    if (id === chunkId) return buffer.subarray(dataStart, dataEnd);
    offset = dataEnd + (size % 2);
  }
  throw new Error(`Missing WAV ${chunkId} chunk`);
}

function readSample(data: Buffer, offset: number, format: number, bitsPerSample: number): number {
  if (format === FLOAT_FORMAT && bitsPerSample === 32) return data.readFloatLE(offset);
  if (format !== PCM_FORMAT) throw new Error(`Unsupported WAV format code: ${format}`);
  if (bitsPerSample === 16) return data.readInt16LE(offset) / 32768;
  if (bitsPerSample === 24) return data.readIntLE(offset, 3) / 8388608;
  if (bitsPerSample === 32) return data.readInt32LE(offset) / 2147483648;
  throw new Error(`Unsupported PCM bit depth: ${bitsPerSample}`);
}

export function readWavPcm(buffer: Buffer): PcmAudio {
  if (buffer.length < RIFF_HEADER_SIZE || readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new Error('Expected RIFF/WAVE data');
  }

  const fmt = findChunk(buffer, 'fmt ');
  if (fmt.length < 16) throw new Error('Invalid WAV fmt chunk');
  const format = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const blockAlign = fmt.readUInt16LE(12);
  const bitsPerSample = fmt.readUInt16LE(14);
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) throw new Error(`Invalid bit depth: ${bitsPerSample}`);
  if (channels < 1) throw new Error('WAV must contain at least one channel');
  if (blockAlign !== channels * bytesPerSample) throw new Error('Unsupported WAV block alignment');
  if (format !== PCM_FORMAT && !(format === FLOAT_FORMAT && bitsPerSample === 32)) {
    throw new Error(`Unsupported WAV format code: ${format}`);
  }

  const data = findChunk(buffer, 'data');
  const frames = Math.floor(data.length / blockAlign);
  const samples = Array.from({ length: channels }, () => new Float64Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    const frameOffset = frame * blockAlign;
    for (let channel = 0; channel < channels; channel += 1) {
      samples[channel][frame] = readSample(data, frameOffset + channel * bytesPerSample, format, bitsPerSample);
    }
  }

  return { sampleRate, channels, samples };
}

export function measureLevel(samples: Float64Array): AudioLevel {
  if (samples.length === 0) throw new Error('Cannot measure empty audio');
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  const rms = Math.sqrt(sumSquares / samples.length);
  return { rms, rmsDbfs: rms === 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms) };
}

export function levelDeltaDb(reference: AudioLevel, measured: AudioLevel): number {
  return measured.rmsDbfs - reference.rmsDbfs;
}

export function correlation(a: Float64Array, b: Float64Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) throw new Error('Cannot correlate empty audio');
  let dot = 0;
  let aSquares = 0;
  let bSquares = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aSquares += a[index] * a[index];
    bSquares += b[index] * b[index];
  }
  const denominator = Math.sqrt(aSquares * bSquares);
  if (denominator === 0) throw new Error('Cannot correlate silent audio');
  return dot / denominator;
}
