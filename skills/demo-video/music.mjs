// Synthesised ambient music bed (royalty-free by construction): Am–F–C–G pads, soft bass pluck and pulse, 100 bpm.
// Usage: node music.mjs <seconds> <out.wav>   (compose.mjs calls it when no music is configured)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [, , secsArg = '190', out = 'video/build/music.wav'] = process.argv;
const SR = 48000, secs = Number(secsArg), N = Math.ceil(secs * SR);
const hz = (n) => 440 * 2 ** ((n - 69) / 12);
const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am F C G
const BEAT = 0.6, BAR = BEAT * 8, LOOP = BAR * chords.length;
const L = new Float32Array(N), R = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const t = i / SR, lt = t % LOOP, ci = Math.floor(lt / BAR), ct = lt - ci * BAR;
  // pad envelope with overlap-free soft attack/release inside each chord window
  const env = Math.min(1, ct / 1.2) * Math.min(1, (BAR - ct) / 1.2);
  let l = 0, r = 0;
  for (const n of chords[ci]) {
    const f = hz(n);
    l += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t);
    r += Math.sin(2 * Math.PI * f * 1.004 * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * 1.004 * t);
  }
  const shimmer = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.25 * t);
  l *= 0.05 * env * shimmer; r *= 0.05 * env * shimmer;
  // bass pluck on every beat (chord root, two octaves below the voicing)
  const bt = t % BEAT;
  const bass = 0.22 * Math.sin(2 * Math.PI * hz(chords[ci][0] - 24) * t) * Math.exp(-3.5 * bt) * Math.min(1, bt / 0.01);
  // soft pulse on beats 1 and 3
  const kt = t % (BEAT * 2);
  const kick = 0.25 * Math.sin(2 * Math.PI * (50 * kt + (70 / 30) * (1 - Math.exp(-30 * kt)))) * Math.exp(-10 * kt);
  // airy hat on off-beats
  const ht = (t + BEAT / 2) % BEAT;
  const hat = 0.012 * (Math.random() * 2 - 1) * Math.exp(-60 * ht);
  // variation: soft eighth-note arpeggio on every second pass of the progression, panned slightly
  let arp = 0;
  if (Math.floor(t / LOOP) % 2 === 1) {
    const step = Math.floor(ct / (BEAT / 2)), at = ct % (BEAT / 2), notes = chords[ci];
    const fa = hz(notes[[0, 1, 2, 3, 2, 1][step % 6]] + 12);
    arp = 0.045 * Math.sin(2 * Math.PI * fa * t) * Math.exp(-6 * at) * Math.min(1, at / 0.005);
  }
  L[i] = l + bass + kick + hat + arp * 0.7; R[i] = r + bass + kick + hat + arp;
}

// fades + write 16-bit stereo WAV
const fadeIn = 2 * SR, fadeOut = 3 * SR;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn, (N - i) / fadeOut);
  pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * g * 32767 * 0.8))), i * 4);
  pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * g * 32767 * 0.8))), i * 4 + 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
const raw = out.replace(/\.wav$/, '.raw.wav');
fs.writeFileSync(raw, Buffer.concat([h, pcm]));
// a little space and warmth
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'highpass=f=38,equalizer=f=70:t=q:w=1.2:g=-3,lowpass=f=3200,aecho=0.8:0.5:240|480:0.22|0.12', out]);
fs.unlinkSync(raw);
console.log(`music: ${out} (${secs}s)`);
