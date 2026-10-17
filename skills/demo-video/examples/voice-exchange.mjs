// Records a REAL voice exchange with the product's own voice agent, for the "it talks" scene:
// mints a Live session from the product's API (the same endpoint its web UI uses, so the same tools run),
// sends the customer's question as a turn and saves the agent's spoken answer + transcript.
// Usage: node voice-exchange.mjs <mint-url> "<question>" [outDir]       (skipped when <outDir>/assistant.wav exists)
//   <mint-url> = the project endpoint that returns { session: { url, token } } or { url, token }
// Then: node tts.mjs <outDir>/question.json <outDir> Puck   → customer.wav (a different voice than the narrator)
import fs from 'node:fs';
import path from 'node:path';

const [, , mintUrl, QUESTION, outDir = 'video/build/voice'] = process.argv;
if (!mintUrl || !QUESTION) { console.error('usage: node voice-exchange.mjs <mint-url> "<question>" [outDir]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(path.join(outDir, 'assistant.wav'))) { console.log('skip voice exchange (exists)'); process.exit(0); }

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const minted = await fetch(mintUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: '/' }) }).then((r) => r.json());
const session = minted.session || minted;
if (!session?.url) throw new Error('mint failed: ' + JSON.stringify(minted).slice(0, 300));

const result = await new Promise((resolve, reject) => {
  const ws = new WebSocket(session.url);
  const chunks = []; const tools = []; let said = ''; let firstAudioAt = null; const t0 = Date.now();
  const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 120000);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: session.token }));
  ws.onmessage = async (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
    if (m.type === 'ready') ws.send(JSON.stringify({ type: 'text', text: QUESTION, turnComplete: true, role: 'user' }));
    else if (m.type === 'audio') { firstAudioAt ??= Date.now() - t0; chunks.push(Buffer.from(m.data, 'base64')); }
    else if (m.type === 'transcript' && m.role === 'model') said += m.text;
    else if (m.type === 'tool') {
      tools.push({ name: m.name, args: m.args, handledBy: m.handledBy });
      if (m.handledBy !== 'server') ws.send(JSON.stringify({ type: 'tool_result', id: m.id, name: m.name, result: { status: 'ok' } }));
    } else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.message)); }
    else if (m.type === 'turn_complete' && chunks.length) { clearTimeout(timer); ws.close(1000); resolve({ pcm: Buffer.concat(chunks), said, tools, firstAudioAt }); }
  };
  ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
});

fs.writeFileSync(path.join(outDir, 'assistant.wav'), wav(result.pcm));
fs.writeFileSync(path.join(outDir, 'dialog.json'), JSON.stringify({ question: QUESTION, answer: result.said, tools: result.tools, firstAudioMs: result.firstAudioAt }, null, 2));
fs.writeFileSync(path.join(outDir, 'question.json'), JSON.stringify([{ id: 'customer', text: QUESTION }]));
console.log(`assistant: ${(result.pcm.length / 48000).toFixed(1)}s, first audio after ${result.firstAudioAt} ms`);
console.log('tools:', result.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(' ') || 'none');
console.log('said:', result.said);
