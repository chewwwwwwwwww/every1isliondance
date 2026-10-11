# Every1 is Lion Dance

**Your body. Your brush. One shared fortune.**

Lion Dance Motion Ink is a webcam experience for one, two, or three people drawing together at one camera. Move your nose—or a chosen wrist in seated mode—to make a Chinese blessing, wear a southern-lion-inspired costume, and take home your own red packet and video.

[Open on Vercel](https://every1isliondance.vercel.app) · [Original live demo](https://lion-dance-motion-ink.activepearl4.chatgpt.site)

## Run locally

Use Node.js 20 or newer. The build and preview scripts use Node's built-in modules; there are no npm packages to install.

```sh
git clone https://github.com/chewwwwwwwwww/every1isliondance.git
cd every1isliondance
npm run build
npm run preview
```

Open **http://localhost:4173** in current Chrome or Edge. Allow camera access and stand in your numbered lane. The first startup downloads MediaPipe JavaScript, WASM, and tracking models from CDNs. Warm the browser cache before an event; internet is still needed for uncached dependencies, fonts, and the QR library.

The local server runs the real compiled Worker with an **in-memory R2-compatible bucket**. Poster/video uploads, keepsake pages, byte-range video playback, and deletion work locally. Stored keepsakes disappear when the preview process stops. Localhost QR links open only on the same device; use the live demo for links that attendees can open on their phones.

```sh
npm run preview -- --port 8000
```

Rebuild after editing the client or API. The preview reloads the compiled Worker on subsequent requests while keeping its in-memory bucket.

## Deploy the frontend on Vercel

Import this repository into Vercel. `vercel.json` selects a static deployment with no framework or Vercel function. It runs **`npm run build:vercel`** and publishes **`public/`**. You can run the same build locally:

```sh
npm run build:vercel
```

`scripts/build-vercel.mjs` first builds the current client, then embeds all six costume WebPs and the soundtrack into `public/index.html`. Camera tracking and media generation continue to run in the browser. External model/font/QR dependencies still need their CDNs.

Vercel proxies `/api/*` and `/media/*` to the existing keepsake Worker at `lion-dance-motion-ink.activepearl4.chatgpt.site`. **That Worker and its persistent R2 bucket remain the sharing backend.** This deployment does not move storage or API processing into Vercel. Keepsake QR links use the backend's canonical Sites address; this is expected.

The production frontend `https://every1isliondance.vercel.app` is registered with the backend. Before a cloned frontend can share or delete keepsakes, the backend owner must register its **exact HTTPS origin** in the backend's allowed-origin configuration. The committed rewrites alone do not grant access. If deploying your own keepsake Worker, update both rewrite destinations, bind its persistent `BUCKET`, and configure the matching frontend origin. Arbitrary preview deployment origins are not automatically allowed.

## The experience

- Draw simultaneously in one camera with up to three dancers. Costume sets are assigned randomly and stay with each dancer throughout the session.
- Choose **福 喜 春 安 吉 顺**, or **吉祥如意 心想事成 万事如意 年年有余 岁岁平安 恭喜发财**. These phrases are common blessing greetings; they are not all formal 成语.
- Watch the bright reference during a **3–2–1 countdown**, then move freely. Each round starts, seals, assembles, and advances automatically. The reference is a cue; there is no tracing score.
- The timer finishes a dancer's mark after meaningful movement. Someone who has not moved gets another five seconds. Raise **both hands above your head for about one second** to finish early, or use the optional Seal button. Standing still does not finish a mark.
- Pause and tracking loss preserve round time and pause recording. Close-up tracking uses the measured face; a wider view supports body movement. The cursor stays in the mirrored camera's coordinate space, with gentle smoothing and no movement amplification.
- Photoreal costume textures follow measured body landmarks. Close-up views show headgear above the forehead; clothing appears only when the torso is reliably measured. The face remains visible.
- Fullscreen shows the red stage and camera with compact **Pause**, **Start over**, and **Exit fullscreen** controls. Press **Esc** to restore the full interface. When the finished export is ready, the app returns to the results automatically.
- The red packet contains **the participants' actual strokes**. Paths are positioned and uniformly scaled into the blessing while preserving their curves, proportions, and pen lifts.

### Drawing time adapts to each part

| Assigned part | Source stroke count | Drawing window |
| --- | --- | --- |
| Connected section of one character | 1–2 | 5 seconds |
| Connected section of one character | 3 | 7 seconds |
| Connected section of one character | 4 or more | 8 seconds |
| Whole character in a blessing phrase | 1–4 | 8 seconds |
| Whole character in a blessing phrase | 5–7 | 10 seconds |
| Whole character in a blessing phrase | 8 or more | 12 seconds |

Everyone in a simultaneous round receives the longest assigned window. A brief 0.45-second reset joins the marks before the next countdown. Tracking pauses and no-movement extensions add time when needed. 福 has six connected parts: solo draws six rounds, two people draw three, and three people draw two.

## Take-home media

- **Red packet:** 900 × 1200 PNG of the actual shared artwork.
- **Normal highlight:** 720 × 1280 portrait video containing the active drawing rounds and final celebration. Calibration, countdowns, pauses, and resets are omitted. MP4 is preferred where the browser can encode it; WebM is the fallback.
- **3× timelapse:** generated on request from the finished highlight inside the browser. The pictures speed up while lion-dance percussion plays at its original tempo. The normal clip remains available. Keep the tab open during conversion; browser recording support and device performance affect availability.
- **QR keepsake:** explicitly choosing Share by QR uploads the poster and available video variants to a public, unlisted link. Make the timelapse before sharing to include both videos. The phone page previews and downloads either version. The sharing browser can remove its keepsake.

Use the device's native Share video action where available, or download the clip and upload it to Instagram. The app does not post to social accounts itself.

Camera frames and landmark processing stay in the browser. No microphone is recorded. The supplied soundtrack excerpt is served at `/soundtrack.mp3` and is mixed with synthesized drum/cymbal accents; muting live playback does not mute the export. Media remains on the device until the explicit QR sharing action. Anyone with a shared link can view it. Upload limits are 8 MiB for the poster and 24 MiB for each video; a poster-only share remains available for oversized clips.

## Source layout

| File or directory | Purpose |
| --- | --- |
| `client/index.html` | Responsive page, styles, and script insertion points |
| `client/app.js` | Session flow, adaptive timing, simultaneous lanes, ink, poster, and sharing UI |
| `client/pose-worker.js` | MediaPipe pose and optional face tracking in a Worker |
| `client/cursor-smoothing.js` | Camera-coordinate ink smoothing |
| `client/lion-filter.js` | Face-safe headgear and measured-body costume rendering |
| `client/media.js` | Canvas recording, soundtrack mix, MP4 audio-clock repair, and timelapse generation |
| `client/glyph-library.js` | Curated reference geometry, movement groups, and blessing catalogue |
| `client/base.js` | Canvas utilities and retained glyph attribution |
| `client/assets/` | Original generated costume PNGs, optimized WebPs, prompts, and design references |
| `soundtrack.mp3` | The energetic 67.6–105.6-second excerpt of the supplied lion-dance recording |
| `worker/api.js` | Keepsake upload, validation, range requests, and deletion |
| `scripts/build-v2.mjs` | Validates scripts and embeds client, audio, and WebP assets into the Worker |
| `scripts/build-vercel.mjs` | Builds a static page with embedded textures/audio for Vercel |
| `scripts/preview.mjs` | Dependency-free local HTTP preview with an in-memory R2 bucket |
| `vercel.json` | Static build output and external keepsake API/media rewrites |
| `index.html` | Self-embedded standalone demo with costume textures and soundtrack |
| `worker/index.js`, `dist/server/index.js` | Generated executable Worker; both are rebuilt from source and excluded from Git |
| `dist/index.html` | Built browser page; its asset/audio URLs are served by the Worker |
| `.openai/hosting.json` | Generic build metadata declaring the `BUCKET` R2 binding; no account or project ID |

The Worker serves `/`, `/index.html`, `/assets/lion-*.webp`, and `/soundtrack.mp3`. Sharing uses `POST /api/keepsakes`, `GET /api/keepsakes/:id`, and `DELETE /api/keepsakes/:id`. Media is served at `/media/:id/poster.png`, `/media/:id/highlight.mp4` or `.webm`, and `/media/:id/timelapse.mp4` or `.webm`. Deletion requires the token kept by the sharing browser.

The repository also includes `index.html`, a standalone file with the costumes and soundtrack embedded. Serve it over localhost or HTTPS for camera access. Local drawing, posters, and video downloads work when its external CDN dependencies can load. QR uploads require a compatible backend on the same origin; the standalone file alone does not provide one. The Node preview uses the freshly built Worker page, rather than the root standalone file.

For a complete independent backend deployment, provide a Worker-compatible runtime and a persistent R2 bucket bound as **`BUCKET`**. The repository has no deployment credentials or production project binding. Hosting only `dist/index.html` does not supply its asset routes or the keepsake backend. The provided Vercel configuration supplies a static frontend plus a proxy to the existing backend. Production storage lifetime and any cleanup policy belong to the backend deployment; the app does not promise automatic expiry.

The browser loads MediaPipe Tasks Vision **0.10.32**, the Lite pose model, an optional face model, QRCode.js, and Google Fonts externally. If camera/model startup fails, **Try free ink with a cursor** works without camera tracking. **Preview** is a labelled automated demonstration using sample strokes and procedural lions, not footage of participants.

## Credits and retained notices

Reference glyph geometry comes from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), derived from Arphic fonts. Its extraction notice, attribution, and full unchanged **Arphic Public License** are retained in `client/glyph-library.js`, `client/base.js`, and the built page. An accessible copy is in [`licenses/ARPHICPL.TXT`](licenses/ARPHICPL.TXT).

The three costume sets are newly generated interpretations informed by southern lion-dance materials and silhouettes. [`client/assets/LION-ASSETS.md`](client/assets/LION-ASSETS.md) retains the cultural/artist references and renderer notes; `lion-assets-v21-prompts.json` retains the generation and edit prompts. Portable generation identifiers replace machine-specific file paths in this public snapshot.

The soundtrack excerpt was supplied by the project creator. This repository preserves the relevant third-party notices and does not assign a blanket licence to the soundtrack or other independently licensed material. No general licence for the original application code has been selected.

See [`THIRD_PARTY.md`](THIRD_PARTY.md) for dependency and media provenance.

The app source matches published Sites version 7, commit `644cb6c8a8a5e6e7dee350c2b8e01731e722d9ec`, with portable build/deployment metadata and local path redaction added for this public repository.

Made for Common Ground. A playful contemporary interpretation of southern lion dance and the joy of making together.
