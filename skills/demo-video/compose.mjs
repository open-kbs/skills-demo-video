// Edits the video: scene pieces (trim / speed / punch-in zoom) + voice-over + sfx + burned-in captions + music bed
// → video/out/<name>.mp4. Each scene is cached in video/build/scenes/ keyed by its definition and the takes'
// mtimes, so a rerun only re-renders what changed.
// Usage: node compose.mjs [video/scenes.mjs]   — see examples/scenes.mjs for the config shape.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SKILL_DIR = path.dirname(new URL(import.meta.url).pathname);
const cfgFile = path.resolve(process.argv[2] || 'video/scenes.mjs');
if (!fs.existsSync(cfgFile)) { console.error(`config not found: ${cfgFile} (copy examples/scenes.mjs to video/scenes.mjs)`); process.exit(1); }
const VDIR = path.dirname(cfgFile);                       // video/
const B = (...p) => path.join(VDIR, 'build', ...p);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const marks = (take) => {
  const f = B('rec', `${take}.marks`);
  if (!fs.existsSync(f)) throw new Error(`no marks for take "${take}" (${f})`);
  return Object.fromEntries(fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const [k, v] = l.split(' '); return [k, Number(v)]; }));
};
const vo = (id) => B('vo', `${id}.wav`);

const mod = await import(pathToFileURL(cfgFile).href);
const cfg = typeof mod.default === 'function' ? await mod.default({ marks, dur, vo, B, VDIR }) : mod.default;
if (!cfg?.scenes?.length) { console.error('scenes.mjs must export { name, scenes: [...] }'); process.exit(1); }

const name = cfg.name || 'demo';
const { w: W, h: H } = cfg.output || { w: 1920, h: 1080 };
const FPS = cfg.fps || 30;
const narrFile = cfg.narrator || path.join(VDIR, 'vo', 'narrator.json');
const narrRaw = fs.existsSync(narrFile) ? JSON.parse(fs.readFileSync(narrFile, 'utf8')) : [];
const TEXT = Object.fromEntries((Array.isArray(narrRaw) ? narrRaw : narrRaw.lines || []).map((l) => [l.id, l.text]));
const zooms = cfg.zooms || {};
const cap = { font: 'Golos Text', size: 44, chipFont: 'Fira Sans Extra Condensed', chipSize: 50, chipColor: '#1f6feb', fontsDir: B('fonts'), ...(cfg.captions || {}) };

fs.mkdirSync(B('scenes'), { recursive: true });
fs.mkdirSync(path.join(VDIR, 'out'), { recursive: true });

// resolve an audio entry: ['vo:s01', at] | [path, at] | [path, at, 'caption text']
function audioEntry([src, at, text]) {
  if (typeof src === 'string' && src.startsWith('vo:')) {
    const id = src.slice(3);
    return { file: vo(id), at, text: text ?? TEXT[id] ?? '' };
  }
  return { file: path.resolve(VDIR, '..', src), at, text: text || '' };
}

function renderScene(sc) {
  const pieces = sc.pieces.map(([take, a, b, speed = 1, zoom]) => {
    const src = B('rec', `${take}.mp4`);
    if (!fs.existsSync(src)) throw new Error(`scene ${sc.id}: take "${take}" not found (${src})`);
    const z = typeof zoom === 'string' ? zooms[zoom] : zoom;
    if (zoom && !z) throw new Error(`scene ${sc.id}: unknown zoom "${zoom}"`);
    return { take, src, a, b: b ?? dur(src), speed, zoom: z };
  });
  const sceneTime = (take, t) => {
    let acc = 0;
    for (const p of pieces) { if (p.take === take && t >= p.a && t <= p.b) return acc + (t - p.a) / p.speed; acc += (p.b - p.a) / p.speed; }
    throw new Error(`sfx time ${take}@${t} is outside scene ${sc.id}`);
  };
  const audio = [
    ...(sc.audio || []).map(audioEntry),
    ...(sc.sfx || []).map(([n, take, t]) => ({ file: B('sfx', `${n}.wav`), at: sceneTime(take, t), text: '' })),
  ];
  for (const a of audio) if (!fs.existsSync(a.file)) throw new Error(`scene ${sc.id}: audio not found ${a.file}`);
  const vLen = pieces.reduce((s, p) => s + (p.b - p.a) / p.speed, 0);
  const aEnd = Math.max(0, ...audio.map((a) => a.at + dur(a.file)));
  const len = Math.max(vLen, aEnd + (sc.tail ?? 0.7));
  const key = crypto.createHash('md5').update(JSON.stringify({
    pieces, mtimes: pieces.map((p) => fs.statSync(p.src).mtimeMs), audio: audio.map((a) => [a.file, a.at, fs.statSync(a.file).mtimeMs]), len, W, H, FPS, v: 4,
  })).digest('hex').slice(0, 10);
  const out = B('scenes', `${sc.id}-${key}.mkv`);
  if (fs.existsSync(out)) return { ...sc, audio, out, len };

  const inputs = []; const f = [];
  pieces.forEach((p, i) => {
    inputs.push('-i', p.src);
    const crop = p.zoom ? `crop=${p.zoom.w}:${p.zoom.h}:${p.zoom.x}:${p.zoom.y},` : '';
    f.push(`[${i}:v]trim=${p.a.toFixed(3)}:${p.b.toFixed(3)},setpts=(PTS-STARTPTS)/${p.speed},${crop}scale=${W}:${H}:flags=lanczos,fps=${FPS},setsar=1[v${i}]`);
  });
  f.push(`${pieces.map((_, i) => `[v${i}]`).join('')}concat=n=${pieces.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${(len - vLen + 0.1).toFixed(3)},trim=0:${len.toFixed(3)},fade=t=in:st=0:d=0.25,fade=t=out:st=${(len - 0.25).toFixed(3)}:d=0.25[v]`);
  const ai = pieces.length;
  audio.forEach((a) => inputs.push('-i', a.file));
  audio.forEach((a, j) => f.push(`[${ai + j}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(a.at * 1000)}:all=1[a${j}]`));
  if (audio.length) f.push(`${audio.map((_, j) => `[a${j}]`).join('')}amix=inputs=${audio.length}:normalize=0,apad,atrim=0:${len.toFixed(3)}[a]`);
  else f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${len.toFixed(3)}[a]`);
  ff([...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', `${out}.part.mkv`]);
  fs.renameSync(`${out}.part.mkv`, out); // atomic: an interrupted render never leaves a half scene in the cache
  console.log(`scene ${sc.id}: ${len.toFixed(1)}s`);
  return { ...sc, audio, out, len };
}

const rendered = cfg.scenes.map(renderScene);

// ── captions (ASS) ──
const assColor = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); return m ? `&H00${m[3]}${m[2]}${m[1]}`.toUpperCase() : hex; };
const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = (t % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${s}`; };
const ass = [
  '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: Cap,${cap.font},${cap.size},&H00FFFFFF,&H00FFFFFF,&H28131111,&H28131111,-1,0,0,0,100,100,0,0,3,14,0,2,260,260,54,1`,
  `Style: CapL,${cap.font},${cap.size},&H00FFFFFF,&H00FFFFFF,&H28131111,&H28131111,-1,0,0,0,100,100,0,0,3,14,0,1,70,${Math.round(W * 0.44)},54,1`,
  `Style: Chip,${cap.chipFont},${cap.chipSize},&H00FFFFFF,&H00FFFFFF,${assColor(cap.chipColor)},${assColor(cap.chipColor)},-1,0,0,0,100,100,1,0,3,16,0,7,60,60,48,1`,
  '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
];
// split a narration line into caption chunks (sentences, max ~60 chars), timed by length
const chunks = (text) => {
  const parts = (text.match(/[^.!?:—]+[.!?:—]?/g) || [text]).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { const last = out[out.length - 1]; if (last && last.length + p.length < 62) out[out.length - 1] = `${last} ${p}`; else out.push(p); }
  return out;
};
let t0 = 0;
for (const sc of rendered) {
  if (sc.chapter) ass.push(`Dialogue: 1,${ts(t0 + 0.35)},${ts(t0 + 3.2)},Chip,,0,0,0,,{\\fad(250,300)}${sc.chapter.toUpperCase()}`);
  const style = sc.cap === 'left' ? 'CapL' : 'Cap';
  for (const a of sc.audio) {
    if (!a.text || cap.off) continue;
    const d = dur(a.file); const cs = chunks(a.text); const total = cs.reduce((s, c) => s + c.length, 0);
    let t = t0 + a.at;
    for (const c of cs) { const cd = d * c.length / total; ass.push(`Dialogue: 0,${ts(t)},${ts(t + cd - 0.02)},${style},,0,0,0,,{\\fad(120,120)}${c.replace(/—\s*$/, '').trim()}`); t += cd; }
  }
  t0 += sc.len;
}
fs.writeFileSync(B('captions.ass'), ass.join('\n') + '\n');

// ── assemble ──
const list = B('scenes.txt');
fs.writeFileSync(list, rendered.map((s) => `file '${s.out}'`).join('\n') + '\n');
const final = path.join(VDIR, 'out', `${name}.mp4`);
const total = rendered.reduce((s, sc) => s + sc.len, 0);
let music = cfg.music === undefined ? B('music.wav') : cfg.music ? path.resolve(VDIR, '..', cfg.music) : null;
if (music && cfg.music === undefined && (!fs.existsSync(music) || dur(music) < total)) {
  execFileSync('node', [path.join(SKILL_DIR, 'music.mjs'), String(Math.ceil(total) + 1), music], { stdio: 'inherit' });
}
const gain = cfg.musicGain ?? 0.55;
const vf = `[0:v]subtitles=${B('captions.ass')}:fontsdir=${cap.fontsDir}[v]`;
if (music) {
  // music bed: looped if short, ducked under the voice (sidechain), with a 1.5–3 kHz pocket for speech; fades with the picture
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', music,
    '-filter_complex', [vf,
      '[0:a]asplit=2[vo][key]',
      `[1:a]atrim=0:${total.toFixed(3)},afade=t=in:st=0:d=1.5,afade=t=out:st=${(total - 3).toFixed(3)}:d=3,equalizer=f=2200:t=q:w=1:g=-3,volume=${gain}[m]`,
      '[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500:makeup=1[md]',
      '[vo][md]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    ].join(';'),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', final]);
} else {
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-filter_complex', `${vf};[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', final]);
}
console.log(`done: ${final} (${dur(final).toFixed(1)}s, ${(fs.statSync(final).size / 1e6).toFixed(1)} MB)`);
