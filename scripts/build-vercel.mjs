// Build a static frontend with embedded costume textures and soundtrack.
// API/media routes remain backed by the separately deployed keepsake Worker.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
await import('./build-v2.mjs');
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');

const assignment = /window\.LION_ASSETS=(\{[^\n]+\});/;
const match = html.match(assignment);
if (!match) throw new Error('Built HTML is missing the lion asset configuration.');
const originalAssets = JSON.parse(match[1]);
// Complete sets already contain the default pair; omit duplicate top-level URLs.
const assets = Array.isArray(originalAssets.sets) && originalAssets.sets.length &&
  originalAssets.sets.every(set => typeof set.head === 'string' && typeof set.outfit === 'string')
  ? { sets: originalAssets.sets }
  : originalAssets;
const urls = new Set();
function collect(value) {
  if (typeof value === 'string' && value.startsWith('/assets/')) urls.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(assets);
const embedded = new Map();
for (const url of urls) {
  if (!/^\/assets\/lion-[a-z0-9-]+\.webp$/.test(url)) throw new Error('Unexpected costume asset path.');
  const bytes = await readFile(resolve(root, 'client', url.slice(1)));
  embedded.set(url, `data:image/webp;base64,${bytes.toString('base64')}`);
}
function replace(value) {
  if (typeof value === 'string') return embedded.get(value) || value;
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
  return value;
}
html = html.replace(assignment, `window.LION_ASSETS=${JSON.stringify(replace(assets))};`);
const soundtrack = await readFile(resolve(root, 'soundtrack.mp3'));
const audioUrl = `data:audio/mpeg;base64,${soundtrack.toString('base64')}`;
let audioReplacements = 0;
html = html.replace(/(['"])\/soundtrack\.mp3\1/g, () => { audioReplacements++; return 'window.LION_AUDIO_URL'; });
if (!audioReplacements) throw new Error('Built HTML is missing the soundtrack URL.');
// Both normal recording and timelapse reuse this one embedded soundtrack value.
html = html.replace('window.LION_ASSETS=', () => `window.LION_AUDIO_URL=${JSON.stringify(audioUrl)};\nwindow.LION_ASSETS=`);
for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script[1]);
await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(resolve(root, 'public/index.html'), html);
// Copy only these generated brand icons; no camera media enters the static build.
for (const [name, destination] of [['lion-favicon-16.png', 'favicon-16.png'], ['lion-favicon-32.png', 'favicon-32.png'], ['lion-favicon-180.png', 'apple-touch-icon.png']]) {
  const bytes = await readFile(resolve(root, 'client/assets/favicon', name));
  await writeFile(resolve(root, 'public', destination), bytes);
}
try {
  const bytes = await readFile(resolve(root, 'client/assets/favicon/favicon.ico'));
  await writeFile(resolve(root, 'public/favicon.ico'), bytes);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await rm(resolve(root, 'public/favicon.ico'), { force: true });
}
console.log(JSON.stringify({ staticHtmlBytes: Buffer.byteLength(html), embeddedCostumeAssets: embedded.size, embeddedAudioBytes: soundtrack.length }));
