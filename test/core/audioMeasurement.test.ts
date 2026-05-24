import { describe, expect, test } from 'vitest';
import { correlation, levelDeltaDb, measureLevel, readWavPcm } from '../../src/core/audioMeasurement.js';

function wav16(samples: number[], sampleRate = 48000): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    data.writeInt16LE(Math.round(clamped * 32767), index * 2);
  });

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('audio measurement helpers', () => {
  test('reads 16-bit PCM WAV samples and measures RMS', () => {
    const audio = readWavPcm(wav16([0.5, -0.5, 0.5, -0.5]));

    expect(audio.sampleRate).toBe(48000);
    expect(audio.channels).toBe(1);
    expect(measureLevel(audio.samples[0]).rms).toBeCloseTo(0.5, 3);
    expect(measureLevel(new Float64Array([0])).rmsDbfs).toBe(Number.NEGATIVE_INFINITY);
  });

  test('compares level and detects inverted phase', () => {
    const baseline = measureLevel(new Float64Array([1, -1, 1, -1]));
    const reduced = measureLevel(new Float64Array([0.25, -0.25, 0.25, -0.25]));

    expect(levelDeltaDb(baseline, reduced)).toBeCloseTo(-12.04, 2);
    expect(correlation(new Float64Array([1, -1, 1, -1]), new Float64Array([-1, 1, -1, 1]))).toBeCloseTo(-1);
  });

  test('rejects non-WAV input', () => {
    expect(() => readWavPcm(Buffer.from('not a wav'))).toThrow(/RIFF\/WAVE/);
  });
});
