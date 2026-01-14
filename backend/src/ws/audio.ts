// /var/www/html/EquinotesV2/backend/src/ws/audio.ts

import { RawData } from "ws";

/**
 * NOTE:
 * The runtime error `TypeError: (0 , audio_1.rawToBuffer) is not a function`
 * happens when module interop (ts-node-dev / compiled dist) ends up importing
 * the default export object instead of named exports, or vice-versa.
 *
 * To make this file work reliably in both environments, keep named exports
 * AND also provide a default export object that contains the same functions.
 */

export function rawToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;

  // ws can also provide Uint8Array in some paths
  if (data instanceof Uint8Array) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]);
  return Buffer.from(String(data));
}

/**
 * Convert PCM16 bytes (Int16LE) -> Float32LE bytes with conservative normalization.
 * WhisperLive expects float32 samples.
 */
export function pcm16leToFloat32Bytes(pcmBytes: Buffer): Buffer {
  const evenLen = pcmBytes.length - (pcmBytes.length % 2);
  const sampleCount = evenLen / 2;
  if (sampleCount <= 0) return Buffer.alloc(0);

  // 1) PCM16 -> Float32 (-1..1)
  const floats = new Float32Array(sampleCount);
  let sum = 0;

  for (let i = 0; i < sampleCount; i++) {
    const s = pcmBytes.readInt16LE(i * 2);
    const f = s < 0 ? s / 32768 : s / 32767;
    floats[i] = f;
    sum += f;
  }

  // 2) DC offset removal
  const mean = sum / sampleCount;

  // 3) Compute RMS + peak + simple variability metric
  let peak = 0;
  let sumSq = 0;
  let sumAbsDiff = 0;

  let prev = 0;
  for (let i = 0; i < sampleCount; i++) {
    const x = floats[i] - mean;
    floats[i] = x;

    const ax = Math.abs(x);
    if (ax > peak) peak = ax;

    sumSq += x * x;

    if (i > 0) sumAbsDiff += Math.abs(x - prev);
    prev = x;
  }

  const rms = Math.sqrt(sumSq / sampleCount);

  // avg absolute delta between adjacent samples (very low for "flat" / steady signals)
  const avgAbsDiff = sumAbsDiff / Math.max(1, sampleCount - 1);

  // Hard gate: near silence
  const EPS = 1e-8;
  if (rms < 0.0015 && peak < 0.008) {
    return Buffer.from(new Uint8Array(floats.buffer));
  }

  const looksFlat = avgAbsDiff < 0.00035 && peak > 0.05;

  // 4) Automatic gain (only if not flat)
  let gain = 1.0;

  if (!looksFlat) {
    const TARGET_RMS = 0.1;
    gain = TARGET_RMS / Math.max(rms, EPS);

    const MIN_GAIN = 0.05;
    const MAX_GAIN = 16.0;
    if (gain < MIN_GAIN) gain = MIN_GAIN;
    if (gain > MAX_GAIN) gain = MAX_GAIN;

    if (peak > 0.92 && rms > 0.2) gain *= 0.6;
    if (peak > 0.98 && rms > 0.12) gain *= 0.5;
  } else {
    gain = 1.5;
  }

  // Apply gain and track post-gain peak
  let postPeak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const y = floats[i] * gain;
    floats[i] = y;
    const ay = Math.abs(y);
    if (ay > postPeak) postPeak = ay;
  }

  // 5) Soft limiting only if needed AND not flat
  const LIMIT_THRESHOLD = 0.97;

  if (!looksFlat && postPeak > LIMIT_THRESHOLD) {
    const DRIVE = 1.9;
    const tanhNorm = Math.tanh(DRIVE);

    for (let i = 0; i < sampleCount; i++) {
      const x = floats[i];
      const y = Math.tanh(DRIVE * x) / tanhNorm;
      floats[i] = y > 1 ? 1 : y < -1 ? -1 : y;
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const x = floats[i];
      floats[i] = x > 1 ? 1 : x < -1 ? -1 : x;
    }
  }

  return Buffer.from(new Uint8Array(floats.buffer));
}

// Default export for interop safety (ts-node-dev vs compiled dist)
const audioApi = {
  rawToBuffer,
  pcm16leToFloat32Bytes,
};

export default audioApi;
