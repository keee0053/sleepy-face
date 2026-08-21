import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const CHANNEL_COUNT = 1;
const BITS_PER_SAMPLE = 16;
const MAX_AMPLITUDE = 0.32;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, '../assets/sounds');

function renderTone(frequency, durationSeconds) {
  const sampleCount = Math.round(durationSeconds * SAMPLE_RATE);
  const fadeInSamples = Math.round(0.008 * SAMPLE_RATE);
  const fadeOutSamples = Math.round(0.06 * SAMPLE_RATE);

  return Array.from({ length: sampleCount }, (_, index) => {
    const fadeIn = Math.min(1, index / fadeInSamples);
    const fadeOut = Math.min(1, (sampleCount - index - 1) / fadeOutSamples);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const time = index / SAMPLE_RATE;
    const fundamental = Math.sin(2 * Math.PI * frequency * time);
    const overtone = 0.2 * Math.sin(2 * Math.PI * frequency * 2 * time);

    return MAX_AMPLITUDE * envelope * (fundamental + overtone);
  });
}

function renderSilence(durationSeconds) {
  return Array(Math.round(durationSeconds * SAMPLE_RATE)).fill(0);
}

function createWaveFile(samples) {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNEL_COUNT * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNEL_COUNT * bytesPerSample, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  samples.forEach((sample, index) => {
    const normalizedSample = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(normalizedSample * 32_767), 44 + index * 2);
  });

  return buffer;
}

const correctAnswerSamples = [
  ...renderTone(659.25, 0.11),
  ...renderSilence(0.025),
  ...renderTone(987.77, 0.18),
];
const incorrectAnswerSamples = [
  ...renderTone(293.66, 0.12),
  ...renderSilence(0.025),
  ...renderTone(196, 0.2),
];

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  resolve(outputDirectory, 'quiz-correct.wav'),
  createWaveFile(correctAnswerSamples),
);
writeFileSync(
  resolve(outputDirectory, 'quiz-incorrect.wav'),
  createWaveFile(incorrectAnswerSamples),
);
