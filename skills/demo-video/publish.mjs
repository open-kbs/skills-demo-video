// Uploads a finished video (and optionally a cover frame) to the project's storage with the right content type,
// so browsers play it inline instead of downloading it.
// Usage: node publish.mjs <file> [key] [--cover <seconds>]      default key: video/<filename>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const coverAt = args.includes('--cover') ? Number(args[args.indexOf('--cover') + 1]) : null;
const [file, keyArg] = args.filter((a, i) => a !== '--cover' && args[i - 1] !== '--cover');
if (!file || !fs.existsSync(file)) { console.error('usage: node publish.mjs <file> [key] [--cover <seconds>]'); process.exit(1); }

const conf = ['openkbs.json', 'openkbs.local.json'].filter(fs.existsSync).reduce((o, f) => ({ ...o, ...JSON.parse(fs.readFileSync(f, 'utf8')) }), {});
if (!conf.projectId) { console.error('no openkbs.json with projectId in the current directory'); process.exit(1); }
const jwtFile = path.join(os.homedir(), '.openkbs', 'projectJWT');
const token = process.env.OPENKBS_API_KEY || (fs.existsSync(jwtFile) ? fs.readFileSync(jwtFile, 'utf8').trim() : '');
if (!token) { console.error('no credentials: run inside the Studio container or set OPENKBS_API_KEY'); process.exit(1); }
const API = process.env.OPENKBS_PROJECT_API || 'https://project.openkbs.com';
const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.vtt': 'text/vtt', '.srt': 'text/plain' };

async function upload(local, key) {
  const contentType = TYPES[path.extname(local).toLowerCase()] || 'application/octet-stream';
  const r = await fetch(`${API}/projects/${conf.projectId}/storage/upload-url`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType }),
  });
  const j = await r.json();
  if (!r.ok || !j.uploadUrl) throw new Error(`upload-url failed: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: fs.readFileSync(local) });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
  console.log(`uploaded ${key} (${contentType}, ${(fs.statSync(local).size / 1e6).toFixed(1)} MB)`);
  const prefix = conf.storage?.cloudfront;
  if (!prefix) return console.log('  no "storage": { "cloudfront": "<prefix>" } in openkbs.json → not served by the site CDN; share it with `openkbs storage download` or move it under site/');
  const url = `https://${await siteHost()}/${prefix}/${key}`;
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  console.log(head?.ok ? `  ${url}` : `  ${url} → HTTP ${head?.status ?? 'error'} (the storage CDN path is set up by \`openkbs deploy\`; run it once after adding storage.cloudfront)`);
}

let host;
async function siteHost() {
  if (host) return host;
  const r = await fetch(`${API}/projects/${conf.projectId}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => ({}));
  const p = r.project || {};
  host = (p.domainStatus === 'active' && p.domain) || p.cfDomainName || `<site host>`;
  return host;
}

const key = keyArg || `video/${path.basename(file)}`;
await upload(file, key);
if (coverAt !== null && !Number.isNaN(coverAt)) {
  const cover = file.replace(/\.[^.]+$/, '-cover.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(coverAt), '-i', file, '-frames:v', '1', '-q:v', '2', cover]);
  await upload(cover, key.replace(/\.[^.]+$/, '-cover.jpg'));
}
