// Lion Dance Motion Ink — unlisted, intentionally shared keepsakes.
// No participant media is uploaded until the UI's explicit Share action.
const MAX_POSTER = 8 * 1024 * 1024;
const MAX_VIDEO = 24 * 1024 * 1024;
const MAX_RECIPE = 256 * 1024;
// Allow both video variants at their individual limits, plus multipart headers.
const MAX_BODY = MAX_POSTER + 2 * MAX_VIDEO + MAX_RECIPE + 64 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// The static Vercel frontend proxies these requests to this Worker. Register
// only its stable production origin; previews and other hosts remain excluded.
const SHARING_FRONTENDS = new Set(['https://every1isliondance.vercel.app']);
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', ...extra,
  }});
}
function fail(status, code, message) { throw new ApiError(status, code, message); }
function methodAllowed(allow) {
  return json({ error: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.' }, 405, { Allow: allow });
}
function assertSharingOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin || (origin !== url.origin && !SHARING_FRONTENDS.has(origin))) fail(403, 'ORIGIN_NOT_ALLOWED', 'Share or delete from the Motion Ink page itself.');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    fail(403, 'ORIGIN_NOT_ALLOWED', 'Share or delete from the Motion Ink page itself.');
  }
}
function randomSecret(bytes) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function tokenHash(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function equalHashes(left, right) {
  // Fixed-size digests; examine every byte without an early mismatch return.
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== 64 || right.length !== 64) return false;
  let mismatch = 0;
  for (let index = 0; index < 64; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
function key(id, name) { return `keepsakes/${id}/${name}`; }
function publicMeta(meta, origin) {
  const base = `${origin}/media/${meta.id}`;
  return {
    id: meta.id, createdAt: meta.createdAt, recipe: meta.recipe,
    posterUrl: `${base}/poster.png`,
    videoUrl: meta.videoName ? `${base}/${meta.videoName}` : null,
    videoType: meta.videoType || null,
    posterBytes: meta.posterBytes, videoBytes: meta.videoBytes || 0,
    timelapseUrl: meta.timelapse?.filename ? `${base}/${meta.timelapse.filename}` : null,
    timelapseType: meta.timelapse?.mime || null,
    timelapseBytes: meta.timelapse?.bytes || 0,
    metaUrl: `${origin}/api/keepsakes/${meta.id}`,
    url: `${origin}/#keepsake=${meta.id}`,
  };
}
async function loadMeta(bucket, id) {
  const object = await bucket.get(key(id, 'meta.json'));
  if (!object) fail(404, 'KEEPSAKE_NOT_FOUND', 'This keepsake does not exist or has been deleted.');
  const meta = await object.json();
  if (meta.id !== id || meta.schema !== 1) fail(503, 'STORAGE_ERROR', 'The keepsake could not be read. Please try again.');
  return meta;
}

async function boundedFormData(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data\s*;/i.test(type)) fail(415, 'MULTIPART_REQUIRED', 'Send the poster and optional highlight as multipart form data.');
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    fail(400, 'INVALID_LENGTH', 'The upload length is invalid.');
  }
  if (declared !== null && Number(declared) > MAX_BODY) fail(413, 'UPLOAD_TOO_LARGE', 'The combined upload is too large. Save the videos locally or share the poster alone.');
  if (!request.body) fail(400, 'EMPTY_UPLOAD', 'Choose a poster to share.');
  const reader = request.body.getReader();
  let received = 0, overflow = false;
  const limited = new ReadableStream({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) { controller.close(); return; }
        received += result.value.byteLength;
        if (received > MAX_BODY) {
          overflow = true;
          await reader.cancel();
          controller.error(new Error('Upload limit exceeded'));
          return;
        }
        controller.enqueue(result.value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  try { return await new Response(limited, { headers: { 'Content-Type': type }}).formData(); }
  catch {
    if (overflow) fail(413, 'UPLOAD_TOO_LARGE', 'The combined upload is too large. Save the videos locally or share the poster alone.');
    fail(400, 'INVALID_MULTIPART', 'The upload could not be read. Please try sharing again.');
  }
}
function isFile(value) { return value && typeof value !== 'string' && typeof value.arrayBuffer === 'function' && typeof value.size === 'number'; }
function validateRecipe(text) {
  if (typeof text !== 'string') fail(400, 'RECIPE_REQUIRED', 'The keepsake recipe is missing.');
  if (new TextEncoder().encode(text).byteLength > MAX_RECIPE) fail(413, 'RECIPE_TOO_LARGE', 'The movement recipe is too large to share.');
  let recipe;
  try { recipe = JSON.parse(text); } catch { fail(400, 'INVALID_RECIPE', 'The movement recipe is not valid JSON.'); }
  if (!recipe || Array.isArray(recipe) || typeof recipe !== 'object') fail(400, 'INVALID_RECIPE', 'The movement recipe must be an object.');
  let nodes = 0;
  function inspect(value, depth) {
    if (++nodes > 40000 || depth > 12) fail(400, 'INVALID_RECIPE', 'The movement recipe is too complex.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.abs(value) > 1e12) fail(400, 'INVALID_RECIPE', 'The movement recipe contains an invalid number.');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 4096) fail(400, 'INVALID_RECIPE', 'The movement recipe contains too much text.');
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 4096) fail(400, 'INVALID_RECIPE', 'A movement path contains too many points.');
      for (const child of value) inspect(child, depth + 1);
      return;
    }
    const entries = Object.entries(value);
    if (entries.length > 128) fail(400, 'INVALID_RECIPE', 'The movement recipe contains too many fields.');
    for (const [name, child] of entries) {
      if (name.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(name)) fail(400, 'INVALID_RECIPE', 'The movement recipe contains an unsupported field.');
      inspect(child, depth + 1);
    }
  }
  inspect(recipe, 0);
  // Existing v2 keepsakes retain their original recipe shape. New choices use
  // an explicit item/character index, validated against the bundled catalogue.
  if (recipe.v === 2) return recipe;
  if (recipe.v !== 3) fail(400, 'INVALID_RECIPE_VERSION', 'This movement recipe version is unsupported.');
  const choices = typeof RECIPE_CHOICES === 'object' && RECIPE_CHOICES !== null ? RECIPE_CHOICES : null;
  if (!choices) fail(503, 'SHARING_UNAVAILABLE', 'The blessing catalogue is unavailable. Keep your files on this device.');
  if (typeof recipe.choice !== 'string' || !Object.hasOwn(choices, recipe.choice)) fail(400, 'INVALID_RECIPE_CHOICE', 'Choose a blessing from the available collection.');
  const choice = choices[recipe.choice];
  if (!Number.isInteger(recipe.n) || recipe.n < 1 || recipe.n > 3 ||
      !Number.isInteger(recipe.s) || recipe.s < 0 || recipe.s > 0xffffffff ||
      typeof recipe.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(recipe.d) ||
      !Array.isArray(recipe.strokes) || !recipe.strokes.length || recipe.strokes.length > choice.itemCount * recipe.n) {
    fail(400, 'INVALID_RECIPE', 'The blessing recipe contains invalid participants or marks.');
  }
  const assignments = new Set();
  for (const stroke of recipe.strokes) {
    if (!stroke || Array.isArray(stroke) || typeof stroke !== 'object' ||
        !Number.isInteger(stroke.i) || stroke.i < 0 || stroke.i >= choice.itemCount ||
        !Number.isInteger(stroke.c) || stroke.c < 0 || stroke.c >= choice.charCount ||
        (choice.charCount === 1 ? stroke.c !== 0 : choice.itemCount === choice.charCount && stroke.c !== stroke.i) ||
        !Number.isInteger(stroke.role) || stroke.role < 0 || stroke.role >= recipe.n ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 64 ||
        !Array.isArray(stroke.p) || stroke.p.length < 2) {
      fail(400, 'INVALID_RECIPE_STROKE', 'A movement mark contains an invalid item, character or dancer.');
    }
    const assignment = `${stroke.i}:${stroke.role}`;
    if (assignments.has(assignment)) fail(400, 'DUPLICATE_RECIPE_STROKE', 'Each dancer can contribute once to each item.');
    assignments.add(assignment);
    let points = 0;
    for (const point of stroke.p) {
      if (point === null) continue;
      if (!Array.isArray(point) || point.length !== 2 || !point.every(value => Number.isFinite(value) && value >= -.0801 && value <= 1.0801)) {
        fail(400, 'INVALID_RECIPE_POINT', 'A movement mark contains an invalid drawing point.');
      }
      points++;
    }
    if (points < 2) fail(400, 'INVALID_RECIPE_POINT', 'A movement mark needs a real drawing path.');
  }
  return recipe;
}
async function validatePoster(file) {
  if (!isFile(file) || file.size === 0) fail(400, 'POSTER_REQUIRED', 'A PNG poster is required. You can share it without a video.');
  if (file.size > MAX_POSTER) fail(413, 'POSTER_TOO_LARGE', 'Keep the poster under 8 MiB.');
  if (file.type.toLowerCase().split(';')[0] !== 'image/png') fail(415, 'INVALID_POSTER_TYPE', 'The poster must be a PNG image.');
  const prefix = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (prefix.length < 33 || !png.every((byte, index) => prefix[index] === byte) || String.fromCharCode(...prefix.slice(12, 16)) !== 'IHDR') {
    fail(415, 'INVALID_POSTER_FILE', 'The poster is not a valid PNG image.');
  }
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 8000 || height > 8000 || width * height > 32000000) fail(400, 'INVALID_POSTER_DIMENSIONS', 'The poster dimensions are unsupported.');
}
async function validateVideo(file, variant = 'highlight') {
  if (file === null || (isFile(file) && file.size === 0)) return null;
  const label = variant === 'timelapse' ? 'timelapse' : 'highlight';
  if (!isFile(file)) fail(400, 'INVALID_VIDEO', `The ${label} must be a video file, or leave it out.`);
  if (file.size > MAX_VIDEO) fail(413, 'VIDEO_TOO_LARGE', `Keep the ${label} under 24 MiB, or share the poster alone.`);
  const type = file.type.toLowerCase().split(';')[0].trim();
  if (type !== 'video/webm' && type !== 'video/mp4') fail(415, 'INVALID_VIDEO_TYPE', 'Videos must be MP4 or WebM. You can share the poster alone.');
  const prefix = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const mp4 = prefix.length >= 16 && String.fromCharCode(...prefix.slice(4, 8)) === 'ftyp';
  const webm = prefix.length >= 8 && [0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => prefix[index] === byte) && new TextDecoder().decode(prefix).includes('webm');
  if ((type === 'video/mp4' && !mp4) || (type === 'video/webm' && !webm)) fail(415, 'INVALID_VIDEO_FILE', `The ${label} does not match its video format.`);
  return { file, type, name: `${variant}.${type === 'video/mp4' ? 'mp4' : 'webm'}` };
}

async function createKeepsake(request, url, bucket, ctx) {
  assertSharingOrigin(request, url);
  if (request.headers.get('X-Keepsake-Share') !== '1') fail(400, 'SHARE_ACTION_REQUIRED', 'Use Share keepsake to upload this poster and optional highlight.');
  const form = await boundedFormData(request);
  const names = new Set(['poster', 'highlight', 'timelapse', 'recipe']);
  for (const name of form.keys()) {
    if (!names.has(name)) fail(400, 'UNKNOWN_FIELD', 'The upload contains an unsupported field.');
    if (form.getAll(name).length !== 1) fail(400, 'DUPLICATE_FIELD', 'Upload one poster, one recipe, and at most one of each video version.');
  }
  const poster = form.get('poster');
  const recipe = validateRecipe(form.get('recipe'));
  await validatePoster(poster);
  const video = await validateVideo(form.get('highlight'));
  const timelapse = await validateVideo(form.get('timelapse'), 'timelapse');
  const id = randomSecret(16), deleteToken = randomSecret(32);
  const meta = {
    schema: 1, id, createdAt: new Date().toISOString(), recipe,
    posterBytes: poster.size, videoBytes: video?.file.size || 0,
    videoName: video?.name || null, videoType: video?.type || null,
    timelapse: timelapse ? { mime: timelapse.type, bytes: timelapse.file.size, filename: timelapse.name } : null,
    deleteTokenHash: await tokenHash(deleteToken),
  };
  const keys = ['poster.png', 'highlight.mp4', 'highlight.webm', 'timelapse.mp4', 'timelapse.webm', 'meta.json'].map(name => key(id, name));
  try {
    const posterObject = await bucket.put(keys[0], poster.stream(), { httpMetadata: { contentType: 'image/png' } });
    if (!posterObject) throw new Error('Poster write failed');
    if (video) {
      const videoObject = await bucket.put(key(id, video.name), video.file.stream(), { httpMetadata: { contentType: video.type } });
      if (!videoObject) throw new Error('Video write failed');
    }
    if (timelapse) {
      const videoObject = await bucket.put(key(id, timelapse.name), timelapse.file.stream(), { httpMetadata: { contentType: timelapse.type } });
      if (!videoObject) throw new Error('Timelapse write failed');
    }
    // Publish the manifest last. Reads never expose unfinished uploads.
    const manifest = await bucket.put(key(id, 'meta.json'), JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
    if (!manifest) throw new Error('Manifest write failed');
  } catch {
    try { await bucket.delete(keys); }
    catch {
      if (ctx?.waitUntil) ctx.waitUntil(bucket.delete(keys).catch(() => {}));
    }
    fail(503, 'UPLOAD_FAILED', 'Sharing could not finish. Your local poster and videos are still available. Please try again.');
  }
  return json({ ...publicMeta(meta, url.origin), deleteToken }, 201);
}

function entityMatches(header, etag) {
  return header !== null && header.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  let start, end;
  if (first === null) {
    if (last <= 0) return null;
    start = Math.max(0, size - last); end = size - 1;
  } else {
    if (first >= size || (last !== null && last < first)) return null;
    start = first; end = last === null ? size - 1 : Math.min(last, size - 1);
  }
  return { start, end, length: end - start + 1 };
}
function ifRangeMatches(value, object) {
  if (!value) return true;
  if (value === object.httpEtag) return true;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(object.uploaded.getTime() / 1000) <= Math.floor(date / 1000);
}
async function serveMedia(request, url, bucket, id, filename) {
  const meta = await loadMeta(bucket, id);
  if (filename !== 'poster.png' && filename !== meta.videoName && filename !== meta.timelapse?.filename) fail(404, 'MEDIA_NOT_FOUND', 'This video version is unavailable.');
  const objectKey = key(id, filename);
  const object = await bucket.head(objectKey);
  if (!object) fail(404, 'MEDIA_NOT_FOUND', 'This file does not exist or has been deleted.');
  const type = filename === 'poster.png' ? 'image/png' : filename === meta.videoName ? meta.videoType : meta.timelapse.mime;
  const headers = new Headers({
    ...BASE_HEADERS, 'Content-Type': type,
    'Accept-Ranges': 'bytes', 'ETag': object.httpEtag,
    'Last-Modified': object.uploaded.toUTCString(),
    // Revalidate shared media so deletion is respected by browsers/CDNs.
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="fortune-${id}${filename.startsWith('timelapse.') ? '-timelapse' : ''}.${filename === 'poster.png' ? 'png' : filename.split('.').pop()}"`,
  });
  const noneMatch = request.headers.get('If-None-Match');
  const modifiedSince = request.headers.get('If-Modified-Since');
  if (entityMatches(noneMatch, object.httpEtag) || (noneMatch === null && modifiedSince && Number.isFinite(Date.parse(modifiedSince)) && Math.floor(object.uploaded.getTime() / 1000) <= Math.floor(Date.parse(modifiedSince) / 1000))) {
    return new Response(null, { status: 304, headers });
  }
  let range = null;
  const rangeHeader = request.method === 'GET' ? request.headers.get('Range') : null;
  if (rangeHeader && ifRangeMatches(request.headers.get('If-Range'), object)) {
    range = parseRange(rangeHeader, object.size);
    if (!range) {
      headers.set('Content-Range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
  }
  headers.set('Content-Length', String(range ? range.length : object.size));
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`);
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  const body = await bucket.get(objectKey, range ? { range: { offset: range.start, length: range.length } } : undefined);
  if (!body) fail(404, 'MEDIA_NOT_FOUND', 'This file does not exist or has been deleted.');
  return new Response(body.body, { status: range ? 206 : 200, headers });
}

export async function handleApi(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/') && !path.startsWith('/media/')) return null;
  try {
    const item = /^\/api\/keepsakes\/([A-Za-z0-9_-]+)$/.exec(path);
    const media = /^\/media\/([A-Za-z0-9_-]+)\/(poster\.png|(?:highlight|timelapse)\.(?:mp4|webm))$/.exec(path);
    const collection = path === '/api/keepsakes';
    if (!collection && !item && !media) fail(404, 'NOT_FOUND', 'This endpoint does not exist.');
    const id = (item || media)?.[1];
    if (id && !ID_PATTERN.test(id)) fail(404, 'KEEPSAKE_NOT_FOUND', 'This keepsake does not exist.');
    if (collection && request.method !== 'POST') return methodAllowed('POST');
    if (item && !['GET', 'HEAD', 'DELETE'].includes(request.method)) return methodAllowed('GET, HEAD, DELETE');
    if (media && !['GET', 'HEAD'].includes(request.method)) return methodAllowed('GET, HEAD');
    const bucket = env?.BUCKET;
    if (!bucket) fail(503, 'SHARING_UNAVAILABLE', 'Online sharing is unavailable. Download your poster and highlight on this device.');
    if (collection) return await createKeepsake(request, url, bucket, ctx);
    if (media) return await serveMedia(request, url, bucket, id, media[2]);
    if (request.method === 'DELETE') {
      assertSharingOrigin(request, url);
      const token = request.headers.get('X-Keepsake-Delete-Token') || '';
      if (!TOKEN_PATTERN.test(token)) fail(401, 'DELETE_TOKEN_REQUIRED', 'Use the deletion key saved on the device that shared this keepsake.');
      const meta = await loadMeta(bucket, id);
      if (!equalHashes(await tokenHash(token), meta.deleteTokenHash)) fail(403, 'INVALID_DELETE_TOKEN', 'The deletion key is incorrect.');
      await bucket.delete(['meta.json', 'poster.png', 'highlight.mp4', 'highlight.webm', 'timelapse.mp4', 'timelapse.webm'].map(name => key(id, name)));
      return new Response(null, { status: 204, headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store' } });
    }
    const meta = await loadMeta(bucket, id);
    const response = json(publicMeta(meta, url.origin));
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: response.headers });
    return response;
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.code, message: error.message }, error.status);
    return json({ error: 'STORAGE_ERROR', message: 'Online sharing is temporarily unavailable. Your local keepsake is still available.' }, 503);
  }
}
