import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.cwd(), 'client/public/sounds');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_RATE = 44100;

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
}

function synthSequence(notes, totalDurationSec) {
  const totalSamples = Math.floor(SAMPLE_RATE * totalDurationSec);
  const out = new Float32Array(totalSamples);

  for (const n of notes) {
    const startSample = Math.floor(n.start * SAMPLE_RATE);
    const durSamples = Math.floor(n.dur * SAMPLE_RATE);
    const wave = n.wave || 'sine';
    const gain = n.gain ?? 0.4;

    for (let i = 0; i < durSamples && startSample + i < totalSamples; i++) {
      const t = i / SAMPLE_RATE;
      const envAttack = Math.min(1, t / 0.012);
      const envRelease = Math.min(1, (n.dur - t) / 0.04);
      const env = envAttack * envRelease;

      const freq = n.freqEnd
        ? n.freq + (n.freqEnd - n.freq) * (i / durSamples)
        : n.freq;

      let val = 0;
      const phase = 2 * Math.PI * freq * t;
      if (wave === 'sine') val = Math.sin(phase);
      else if (wave === 'triangle') val = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else if (wave === 'square') val = Math.sin(phase) >= 0 ? 0.6 : -0.6;

      out[startSample + i] += val * env * gain;
    }
  }
  return out;
}

// 1. Countdown beep (3, 2, 1)
writeWav('countdown.wav', synthSequence([{ start: 0, dur: 0.16, freq: 587.33, wave: 'sine', gain: 0.45 }], 0.18));

// 2. GO! chime
writeWav(
  'go.wav',
  synthSequence(
    [
      { start: 0, dur: 0.14, freq: 783.99, wave: 'triangle', gain: 0.45 },
      { start: 0.1, dur: 0.35, freq: 1046.5, wave: 'triangle', gain: 0.5 },
    ],
    0.46
  )
);

// 3. Positive score update
writeWav(
  'positive.wav',
  synthSequence(
    [
      { start: 0, dur: 0.11, freq: 523.25, wave: 'triangle', gain: 0.4 },
      { start: 0.09, dur: 0.12, freq: 659.25, wave: 'triangle', gain: 0.4 },
      { start: 0.18, dur: 0.24, freq: 783.99, wave: 'triangle', gain: 0.45 },
    ],
    0.44
  )
);

// 4. Negative score update
writeWav(
  'negative.wav',
  synthSequence(
    [
      { start: 0, dur: 0.14, freq: 311.13, wave: 'triangle', gain: 0.4 },
      { start: 0.12, dur: 0.25, freq: 233.08, wave: 'triangle', gain: 0.42 },
    ],
    0.38
  )
);

// 5. Final 10-second tick
writeWav('tick.wav', synthSequence([{ start: 0, dur: 0.06, freq: 920, wave: 'sine', gain: 0.32 }], 0.07));

// 6. Time-up alert (classic classroom bell/buzzer)
writeWav(
  'time-up.wav',
  synthSequence(
    [
      { start: 0, dur: 0.22, freq: 440, wave: 'triangle', gain: 0.48 },
      { start: 0.24, dur: 0.22, freq: 440, wave: 'triangle', gain: 0.48 },
      { start: 0.48, dur: 0.45, freq: 349.23, wave: 'triangle', gain: 0.5 },
    ],
    0.95
  )
);

// 7. Round completion fanfare
writeWav(
  'round-complete.wav',
  synthSequence(
    [
      { start: 0, dur: 0.14, freq: 523.25, wave: 'triangle', gain: 0.4 },
      { start: 0.13, dur: 0.14, freq: 659.25, wave: 'triangle', gain: 0.4 },
      { start: 0.26, dur: 0.14, freq: 783.99, wave: 'triangle', gain: 0.42 },
      { start: 0.4, dur: 0.45, freq: 1046.5, wave: 'triangle', gain: 0.48 },
    ],
    0.88
  )
);

// 8. Winner announcement fanfare
writeWav(
  'winner.wav',
  synthSequence(
    [
      { start: 0, dur: 0.14, freq: 523.25, wave: 'triangle', gain: 0.42 },
      { start: 0.14, dur: 0.14, freq: 659.25, wave: 'triangle', gain: 0.42 },
      { start: 0.28, dur: 0.14, freq: 783.99, wave: 'triangle', gain: 0.44 },
      { start: 0.42, dur: 0.2, freq: 1046.5, wave: 'triangle', gain: 0.48 },
      { start: 0.64, dur: 0.16, freq: 783.99, wave: 'triangle', gain: 0.42 },
      { start: 0.8, dur: 0.65, freq: 1046.5, wave: 'triangle', gain: 0.52 },
    ],
    1.48
  )
);

console.log('Generated 8 local WAV sound files in', OUT_DIR);
