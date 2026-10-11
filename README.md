# Every1 is Lion Dance

**Your body. Your brush. One shared fortune.**

Lion Dance Motion Ink is a webcam experience for one, two, or three people drawing together at one camera. Move your nose—or a chosen wrist in seated mode—to make a Chinese blessing, wear a southern-lion-inspired costume, and take home your own red packet and video.

[Open on Vercel](https://every1isliondance.vercel.app) · [Original Site and keepsake backend](https://lion-dance-motion-ink.activepearl4.chatgpt.site)

**Edition 07 / v2.7.0:** the live stage adapts to portrait and landscape phones while preserving the entire camera frame. Landscape places touch controls beside the camera; portrait uses a taller stage. The growing blessing stays visible in the stage. Fullscreen uses the native stage API when available and a viewport-filling stage fallback when unavailable or rejected. Starting on a phone brings the camera into view, and rotation preserves existing marks while tracking reacquires a changed camera orientation. The numbered lanes, all-player raised-hand readiness, actual-stroke red packets, highlights, timelapse and QR keepsakes remain.

**Before starting:** Automatically make a QR keepsake at the end is checked by default. It uploads the finished poster and available videos to a public, unlisted link. Turn it off before starting to keep the media on this device. Camera processing stays local, and no microphone is recorded.

## Run locally

Use Node.js 20 or newer. The build and preview scripts use Node's built-in modules; there are no npm packages to install.

```sh
git clone https://github.com/chewwwwwwwwww/every1isliondance.git
cd every1isliondance
npm run build
npm run preview
```

Open **http://localhost:4173** in current Chrome or Edge. For camera access on another device, use HTTPS; the live Vercel demo is ready for phones. Review the automatic QR option, allow camera access and stand in your numbered lane. Wait for every player to be found, then lift one hand beside your face or upper chest for about one second. A thumbs-up works without visible fingers. All players must be ready together; you can lower your hand once the countdown begins. The first startup downloads MediaPipe JavaScript, WASM, and tracking models from CDNs. Timelapse conversion loads Mediabunny 1.61.3 from a pinned CDN. Warm the browser cache before an event; internet is still needed for uncached dependencies, fonts, and the QR library.

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

`scripts/build-vercel.mjs` first builds the current client, then embeds all six costume WebPs and the soundtrack into `public/index.html`. Camera tracking and media generation continue to run in the browser. External model/font/QR and timelapse-library dependencies still need their CDNs.

Vercel proxies `/api/*` and `/media/*` to the existing keepsake Worker at `lion-dance-motion-ink.activepearl4.chatgpt.site`. **That Worker and its persistent R2 bucket remain the sharing backend, unchanged for this edition.** This deployment does not move storage or API processing into Vercel. New QR links use the frontend's origin, so a keepsake created on Vercel opens the Vercel viewer while its media is served through the existing rewrites. Older Sites keepsake links remain valid.

The production frontend `https://every1isliondance.vercel.app` is registered with the backend. Before a cloned frontend can share or delete keepsakes, the backend owner must register its **exact HTTPS origin** in the backend's allowed-origin configuration. The committed rewrites alone do not grant access. If deploying your own keepsake Worker, update both rewrite destinations, bind its persistent `BUCKET`, and configure the matching frontend origin. Arbitrary preview deployment origins are not automatically allowed.

## The experience

- Draw simultaneously in one camera with up to three dancers. Costume sets are assigned randomly and stay with each dancer throughout the session.
- Choose **福 喜 春 安 吉 顺**, or **吉祥如意 心想事成 万事如意 年年有余 岁岁平安 恭喜发财**. These phrases are common blessing greetings; they are not all formal 成语.
- **Camera lobby:** the selected number of players must be recognized in separate numbered lanes for at least 1.25 seconds across four fresh observations. Each player then holds **one hand beside their own face or upper chest** for about one second (900 ms across at least three fresh samples). A credible measured Pose wrist or optional hand landmarks can qualify; no gesture classification or folded-finger geometry is required. Hands at the waist and faces alone cannot start the game. Lane ownership, freshness and distinct-person checks still apply.
- Leaving a lane during the **first** countdown returns everyone to the lobby and requires a new readiness gesture. After the first drawing begins, tracking pauses preserve the existing round time and marks. The optional hand model helps in close-up views; startup also works using measured body wrists while that model loads or is unavailable. A host can explicitly choose a **both hands above head** fallback held for about two seconds.
- Watch the bright reference during a **3–2–1 countdown**, then move freely. Each round starts, seals, assembles, and advances automatically. The reference is a cue; there is no tracing score.
- The timer finishes a dancer's mark after meaningful movement. Someone who has not moved gets another five seconds. Raise **both hands above your head for about one second** to finish early, or use the optional Seal button. Standing still does not finish a mark.
- Pause and tracking loss preserve round time and pause recording. Close-up tracking uses the measured face; a wider view supports body movement. The cursor stays in the mirrored camera's coordinate space, with gentle smoothing and no movement amplification.
- Photoreal costume textures follow measured body landmarks. Close-up views show headgear above the forehead; clothing appears only when the torso is reliably measured. The face remains visible.
- **Phone play:** portrait and landscape preserve the full camera frame without stretching it. Prop the phone up so hands are free; landscape is recommended for two or three dancers. Numbered lanes, the countdown and a growing artwork preview stay visible beside or above/below the camera. Rotation does not redraw existing marks. If the camera changes its intrinsic orientation, tracking pauses until fresh observations arrive.
- **Stage fullscreen:** compact **Sound**, **Pause**, **Start over**, and **Exit** controls remain available. Unsupported or rejected native fullscreen opens the entire stage in a viewport-filling fallback, including camera overlays and results. Browser bars may remain in fallback mode. Results scroll inside the stage, with Exit available through playback, downloads and the QR. Press **Esc** or use Exit to restore the full interface and previous page position.
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
- **Normal highlight:** 720 × 1280 portrait video containing the active drawing rounds and final celebration. Calibration, countdowns, pauses, and resets are omitted. It starts playing in the main red results stage and remains the selected version while the timelapse is prepared. Browser autoplay rules can require muted playback or a tap on Play. MP4 is preferred where the browser can encode it; WebM is the fallback.
- **3× timelapse:** created automatically from the finished highlight inside the browser. Mediabunny 1.61.3 decodes samples by source timestamp; WebCodecs encodes explicit output timestamps at 30 fps. Encoding speed does not decide which parts are included. The supplied percussion stays at its original tempo. The normal clip remains intact and selected. Keep the tab open during conversion; it can take longer than the resulting video.
- **QR keepsake:** with the disclosed default option enabled, the finished poster, normal highlight and successfully generated timelapse are uploaded automatically. A Vercel-origin QR appears in the red results stage. The phone viewer switches between and downloads both versions. Turn the option off before starting for local downloads; Share by QR remains available when you choose to share later. The sharing browser can remove its keepsake.

If recording fails or a round cannot be recorded, the app continues drawing and offers the artwork/poster, rather than publishing a partial normal video. Automatic QR can then share the poster alone. If the browser cannot decode or encode a complete timelapse with sound, conversion shows an error and retains the normal download; it does not silently fall back to accelerated real-time playback. Oversized videos can also use poster-only QR sharing.

Use the device's native Share video action where available, or download the clip and upload it to Instagram. The app does not post to social accounts itself.

Camera frames and landmark processing stay in the browser. No microphone is recorded. The supplied soundtrack excerpt is served at `/soundtrack.mp3` and is mixed with synthesized drum/cymbal accents in the normal highlight; the timelapse uses the supplied soundtrack at its original rate. Muting live playback does not mute the export. The pre-start automatic QR setting controls whether completed media is uploaded at the end. With that setting off, files stay local until a later Share by QR action. Anyone with a shared link can view it. Upload limits are 8 MiB for the poster and 24 MiB for each video; a poster-only share remains available for oversized clips.

## Source layout

| File or directory | Purpose |
| --- | --- |
| `client/index.html` | Responsive page, styles, and script insertion points |
| `client/app.js` | Session flow, adaptive camera geometry, timing, simultaneous lanes, ink, poster, and sharing UI |
| `client/mobile.css` | Portrait/landscape stages, touch controls, safe areas and compact progress dock |
| `client/stage-fullscreen.js` | Native stage fullscreen and viewport fallback with scroll/focus restoration |
| `client/pose-worker.js` | MediaPipe pose, optional face tracking and lobby-only gesture inference in a Worker |
| `client/player-lobby.js` | Pure distinct-player, lane ownership and observation freshness controller |
| `client/camera-lobby.js` | Two-step camera startup, all-player gesture gate, UI and explicit failure fallback |
| `client/readiness-gesture.js` | Pure hand geometry, ownership and fresh gesture-hold checks inside the Worker |
| `client/cursor-smoothing.js` | Camera-coordinate ink smoothing |
| `client/lion-filter.js` | Face-safe headgear and measured-body costume rendering |
| `client/media.js` | Canvas recording, soundtrack mix, MP4 audio-clock repair, and deterministic source-timestamp timelapse export |
| `client/glyph-library.js` | Curated reference geometry, movement groups, and blessing catalogue |
| `client/base.js` | Canvas utilities and retained glyph attribution |
| `client/assets/` | Original generated costume PNGs, optimized WebPs, prompts, design references, and generated favicon variants |
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

The browser loads MediaPipe Tasks Vision **0.10.32**, the Lite pose model, an optional face model, the canned Gesture Recognizer model for startup, QRCode.js, Google Fonts, and timelapse-only **Mediabunny 1.61.3** externally. Timelapse requires working browser VideoDecoder, VideoEncoder and AudioEncoder support for the selected codecs; unsupported browsers keep the normal download. If camera/model startup fails, **Try free ink with a cursor** works without camera tracking. **Preview** is a labelled automated demonstration using sample strokes and procedural lions, not footage of participants.

## Credits and retained notices

Reference glyph geometry comes from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), derived from Arphic fonts. Its extraction notice, attribution, and full unchanged **Arphic Public License** are retained in `client/glyph-library.js`, `client/base.js`, and the built page. An accessible copy is in [`licenses/ARPHICPL.TXT`](licenses/ARPHICPL.TXT).

The three costume sets are newly generated interpretations informed by southern lion-dance materials and silhouettes. [`client/assets/LION-ASSETS.md`](client/assets/LION-ASSETS.md) retains the cultural/artist references and renderer notes; `lion-assets-v21-prompts.json` retains the generation and edit prompts. Portable generation identifiers replace machine-specific file paths in this public snapshot.

The soundtrack excerpt was supplied by the project creator. This repository preserves the relevant third-party notices and does not assign a blanket licence to the soundtrack or other independently licensed material. No general licence for the original application code has been selected.

See [`THIRD_PARTY.md`](THIRD_PARTY.md) for dependency and media provenance.

Edition 07 adds phone layouts and a stage fullscreen fallback to the existing startup gate. This edition targets Vercel only; the existing Worker/R2 backend remains in use. Browser checks use synthetic camera fixtures and distinguish them from physical phone and participant rehearsal. Physical iPhone/Safari camera behavior still needs confirmation on the device.

Made for Common Ground. A playful contemporary interpretation of southern lion dance and the joy of making together.
