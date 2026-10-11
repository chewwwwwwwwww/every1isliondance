// Portable local Worker preview. R2 data is held only in memory and disappears
// when this process exits. Use synthetic sample uploads during development.
import http from 'node:http';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.crypto ||= webcrypto;

function metadataHeaders(metadata, headers) {
  const names = { contentType: 'Content-Type', contentLanguage: 'Content-Language', contentDisposition: 'Content-Disposition', contentEncoding: 'Content-Encoding', cacheControl: 'Cache-Control' };
  for (const [field, name] of Object.entries(names)) if (metadata[field] !== undefined) headers.set(name, metadata[field]);
  if (metadata.cacheExpiry) headers.set('Expires', new Date(metadata.cacheExpiry).toUTCString());
}
function copyHttpMetadata(input) {
  if (!(input instanceof Headers)) return { ...(input || {}) };
  const result = {};
  for (const [field, name] of Object.entries({ contentType: 'Content-Type', contentLanguage: 'Content-Language', contentDisposition: 'Content-Disposition', contentEncoding: 'Content-Encoding', cacheControl: 'Cache-Control' })) {
    const value = input.get(name); if (value !== null) result[field] = value;
  }
  return result;
}
function etagValues(header) { return header.split(',').map(value => value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')); }
function satisfies(object, condition) {
  if (!condition) return true;
  if (condition instanceof Headers) {
    const matches = condition.get('If-Match'), differs = condition.get('If-None-Match');
    if (matches && !object) return false;
    if (matches && !etagValues(matches).some(value => value === '*' || value === object.etag)) return false;
    if (differs && object && etagValues(differs).some(value => value === '*' || value === object.etag)) return false;
    const unmodified = condition.get('If-Unmodified-Since'), modified = condition.get('If-Modified-Since');
    if (unmodified && object && object.uploaded.getTime() > Date.parse(unmodified)) return false;
    if (modified && object && object.uploaded.getTime() <= Date.parse(modified)) return false;
    return true;
  }
  if (condition.etagMatches && (!object || object.etag !== condition.etagMatches.replace(/^"|"$/g, ''))) return false;
  if (condition.etagDoesNotMatch && object && object.etag === condition.etagDoesNotMatch.replace(/^"|"$/g, '')) return false;
  if (condition.uploadedBefore && object && object.uploaded >= new Date(condition.uploadedBefore)) return false;
  if (condition.uploadedAfter && object && object.uploaded <= new Date(condition.uploadedAfter)) return false;
  return true;
}
function resolveRange(range, size) {
  if (!range) return null;
  if (range instanceof Headers) {
    const value = range.get('Range');
    if (!value) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) throw new RangeError('Unsupported byte range');
    if (!match[1]) range = { suffix: Number(match[2]) };
    else range = { offset: Number(match[1]), ...(match[2] ? { length: Number(match[2]) - Number(match[1]) + 1 } : {}) };
  }
  const offset = range.suffix !== undefined ? Math.max(0, size - range.suffix) : range.offset || 0;
  const length = range.suffix !== undefined ? size - offset : Math.min(range.length ?? size - offset, size - offset);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > size) throw new RangeError('Invalid byte range');
  return { offset, length };
}

export class MemoryR2Bucket {
  constructor() { this.objects = new Map(); }
  metadata(stored) {
    const object = {
      key: stored.key, version: stored.version, size: stored.bytes.byteLength,
      etag: stored.etag, httpEtag: `"${stored.etag}"`, uploaded: new Date(stored.uploaded),
      httpMetadata: { ...stored.httpMetadata }, customMetadata: { ...stored.customMetadata },
      checksums: { md5: Uint8Array.from(Buffer.from(stored.etag, 'hex')).buffer },
      storageClass: 'Standard',
    };
    object.writeHttpMetadata = headers => metadataHeaders(object.httpMetadata, headers);
    return object;
  }
  async put(key, value, options = {}) {
    if (!satisfies(this.objects.get(key), options.onlyIf)) return null;
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const stored = {
      key, bytes, etag: createHash('md5').update(bytes).digest('hex'),
      version: randomUUID(), uploaded: new Date(),
      httpMetadata: copyHttpMetadata(options.httpMetadata), customMetadata: { ...(options.customMetadata || {}) },
    };
    this.objects.set(key, stored);
    return this.metadata(stored);
  }
  async head(key) {
    const stored = this.objects.get(key);
    return stored ? this.metadata(stored) : null;
  }
  async get(key, options = {}) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const object = this.metadata(stored);
    if (!satisfies(stored, options.onlyIf)) return object;
    const range = resolveRange(options.range, stored.bytes.length);
    const bytes = range ? stored.bytes.slice(range.offset, range.offset + range.length) : stored.bytes.slice();
    const response = new Response(bytes);
    return {
      ...object, ...(range ? { range } : {}), body: response.body,
      get bodyUsed() { return response.bodyUsed; },
      arrayBuffer: () => response.arrayBuffer(), text: () => response.text(),
      json: () => response.json(), blob: () => response.blob(),
    };
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

export async function startPreview({ port = 4173, host = '127.0.0.1', workerPath = fileURLToPath(new URL('../dist/server/index.js', import.meta.url)) } = {}) {
  const bucket = new MemoryR2Bucket();
  let moduleVersion = null, worker;
  async function loadWorker() {
    const info = await stat(workerPath);
    const version = `${info.mtimeMs}-${info.size}`;
    if (moduleVersion !== version) {
      const module = await import(`${pathToFileURL(workerPath).href}?preview=${encodeURIComponent(version)}`);
      worker = module.default || module;
      if (typeof worker.fetch !== 'function') throw new Error('Compiled Worker must export default { fetch } or named fetch.');
      moduleVersion = version;
    }
    return worker;
  }
  // Fail before listening if npm run build has not produced the Worker yet.
  await loadWorker();
  const server = http.createServer(async (incoming, outgoing) => {
    const controller = new AbortController();
    incoming.once('aborted', () => controller.abort());
    try {
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      const requestOrigin = `http://${headers.get('Host') || `${host}:${port}`}`;
      const method = incoming.method || 'GET';
      const init = { method, headers, signal: controller.signal };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = Readable.toWeb(incoming); init.duplex = 'half';
      }
      const request = new Request(new URL(incoming.url || '/', requestOrigin), init);
      const context = {
        waitUntil(promise) { Promise.resolve(promise).catch(error => console.error('Background preview task failed:', error.message)); },
        passThroughOnException() {},
      };
      const handler = await loadWorker();
      const response = await handler.fetch(request, { BUCKET: bucket }, context);
      if (!(response instanceof Response)) throw new Error('Worker fetch did not return a Response.');
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      if (method === 'HEAD' || !response.body) { await response.body?.cancel(); outgoing.end(); return; }
      await pipeline(Readable.fromWeb(response.body), outgoing);
    } catch (error) {
      if (controller.signal.aborted || outgoing.destroyed) return;
      console.error('Local preview request failed:', error.message);
      if (outgoing.headersSent) { outgoing.destroy(error); return; }
      outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      outgoing.end('Local Worker preview failed. Check the terminal and rebuild the Worker.');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, bucket, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4173;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use --port followed by a valid port number.');
  const { server, url } = await startPreview({ port });
  console.log(`Motion Ink Worker preview: ${url}`);
  console.log('R2 is in memory. Shared keepsakes disappear when this server stops.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}
