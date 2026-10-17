// Voice-over through the project's AI proxy: the Live model reads each line verbatim.
// Usage: node tts.mjs <narrator.json> <outDir> [voice]
//   narrator.json: { "language": "bg-BG", "voice": "Charon", "style": "...", "pronounce": { "Brand": "how to say it" },
//                    "lines": [{ "id": "s01", "text": "..." }] }   (a bare array of lines also works)
// Existing <id>.wav files are skipped (resumable); <id>.txt holds the model's own transcript for checking.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , linesFile, outDir = 'video/build/vo', voiceArg] = process.argv;
if (!linesFile) { console.error('usage: node tts.mjs <narrator.json> <outDir> [voice]'); process.exit(1); }
const PROXY = process.env.OPENKBS_PROXY_URL || 'https://proxy.openkbs.com';
const jwtFile = path.join(os.homedir(), '.openkbs', 'projectJWT');
const token = process.env.OPENKBS_API_KEY || (fs.existsSync(jwtFile) ? fs.readFileSync(jwtFile, 'utf8').trim() : '');
if (!token) { console.error('no credentials: run inside the Studio container or set OPENKBS_API_KEY'); process.exit(1); }

const raw = JSON.parse(fs.readFileSync(linesFile, 'utf8'));
const cfg = Array.isArray(raw) ? { lines: raw } : raw;
const lines = cfg.lines || [];
const voice = voiceArg || cfg.voice || 'Kore';
const language = cfg.language || 'en-US';
const model = cfg.model || 'gemini-3.8-live';
fs.mkdirSync(outDir, { recursive: true });

const SYSTEM = [
  `You are a professional voice-over narrator for commercials, speaking ${language}.`,
  'Your only task: read aloud EXACTLY the text you receive, word for word. Do not add, skip, translate or comment on anything.',
  'Do not greet, do not answer the text, do not ask questions. Just read it.',
  cfg.style || 'Tone: warm, confident, energetic, like a high-quality TV commercial. Pace: calm, clear diction, natural pauses.',
  ...Object.entries(cfg.pronounce || {}).map(([k, v]) => `Read "${k}" as "${v}".`),
].join('\n');

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(text) {
  const res = await fetch(`${PROXY}/v1/live/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, systemInstruction: SYSTEM, voice, language, languages: [language],
      outputAudioTranscription: { languageCodes: [language] }, maxSessionMs: 120000 }),
  });
  const session = await res.json();
  if (!session.url) throw new Error('session failed: ' + JSON.stringify(session).slice(0, 300));
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(session.url);
    const chunks = []; let said = '';
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 90000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: session.token }));
    ws.onmessage = async (ev) => {
      const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
      if (m.type === 'ready') ws.send(JSON.stringify({ type: 'text', text: `Read:\n${text}`, turnComplete: true, role: 'user' }));
      else if (m.type === 'audio') chunks.push(Buffer.from(m.data, 'base64'));
      else if (m.type === 'transcript' && m.role === 'model') said += m.text;
      else if (m.type === 'error') { clearTimeout(timer); ws.close(); reject(new Error(m.message)); }
      else if (m.type === 'turn_complete') { clearTimeout(timer); ws.close(1000); resolve({ pcm: Buffer.concat(chunks), said }); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
let failed = 0;
for (const l of lines) {
  const out = path.join(outDir, `${l.id}.wav`);
  if (fs.existsSync(out)) { console.log(`skip ${l.id}`); continue; }
  let best;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await speak(l.text);
      // fidelity check: share of script words found in the model's own transcript
      const said = new Set(norm(r.said)); const words = norm(l.text);
      const hit = words.filter((w) => said.has(w)).length / Math.max(1, words.length);
      const secs = r.pcm.length / 48000;
      console.log(`${l.id} try${attempt}: ${secs.toFixed(1)}s match=${(hit * 100).toFixed(0)}% | ${r.said.slice(0, 140)}`);
      if (secs < 0.3) continue;
      if (!best || hit > best.hit) best = { ...r, hit };
      if (hit >= 0.8) break;
    } catch (e) { console.log(`${l.id} try${attempt} error: ${e.message}`); }
  }
  if (!best) { console.log(`FAIL ${l.id}`); failed++; continue; }
  fs.writeFileSync(out, wav(best.pcm));
  fs.writeFileSync(out.replace(/\.wav$/, '.txt'), best.said);
}
console.log(failed ? `done with ${failed} failed line(s) — rerun to retry them` : `done: ${lines.length} lines in ${outDir}`);
process.exit(failed ? 1 : 0);
