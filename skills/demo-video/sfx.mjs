// Small synthesised UI sounds: a two-note "success" chime and a soft click.
// Usage: node sfx.mjs [outDir]   (default video/build/sfx)
import fs from 'node:fs';
import path from 'node:path';
const SR = 48000, dir = process.argv[2] || 'video/build/sfx';
fs.mkdirSync(dir, { recursive: true });
function wav(file, secs, fn) {
  const n = Math.round(secs * SR), pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(i / SR))) * 32767 * 0.7), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(dir, file), Buffer.concat([h, pcm]));
}
const tone = (f, t, d) => (t < 0 ? 0 : Math.sin(2 * Math.PI * f * t) * Math.exp(-d * t) * Math.min(1, t / 0.004));
// E6 → B6, bell-like with a soft octave partial
wav('chime.wav', 1.2, (t) => 0.32 * (tone(1318.5, t, 5) + 0.25 * tone(2637, t, 9)) + 0.32 * (tone(1975.5, t - 0.11, 4.5) + 0.25 * tone(3951, t - 0.11, 9)));
wav('click.wav', 0.06, (t) => 0.25 * (Math.random() * 2 - 1) * Math.exp(-120 * t) + 0.2 * tone(1800, t, 90));
console.log(`sfx: ${dir}/chime.wav, click.wav`);
