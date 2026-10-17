// Audio QA: sends an audio or video file to Gemini through the project's AI proxy with a question and prints the answer.
// Use it to check the mix: diction, mispronounced words, music-to-voice balance, glitches, long silences.
// Usage: node listen.mjs <file> "<question>"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , file, question] = process.argv;
if (!file || !question) { console.error('usage: node listen.mjs <file> "<question>"'); process.exit(1); }
const jwtFile = path.join(os.homedir(), '.openkbs', 'projectJWT');
const jwt = process.env.OPENKBS_API_KEY || (fs.existsSync(jwtFile) ? fs.readFileSync(jwtFile, 'utf8').trim() : '');
if (!jwt) { console.error('no credentials: run inside the Studio container or set OPENKBS_API_KEY'); process.exit(1); }
const PROXY = process.env.OPENKBS_PROXY_URL || 'https://proxy.openkbs.com';
const MODEL = process.env.MODEL || 'gemini-3.8-flash';
// compress to mono mp3 so long clips fit in one inline request
const mp3 = path.join(os.tmpdir(), `listen-${process.pid}.mp3`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-b:a', '64k', mp3]);
const data = fs.readFileSync(mp3).toString('base64');
fs.unlinkSync(mp3);
const res = await fetch(`${PROXY}/v1/google/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/mp3', data } }, { text: question }] }], generationConfig: { temperature: 0.2 } }),
}).then((r) => r.json());
console.log(res.candidates?.[0]?.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('') || JSON.stringify(res).slice(0, 500));
