# Third-party material and provenance

## Reference glyph geometry

The glyphs come from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), `graphics.txt`, derived from Arphic PL KaitiM GB and Arphic PL UKai. Twenty-two character records were extracted on 2026-10-11. SVG paths and median coordinates are unchanged; curated choices, English glosses, and movement-group metadata were added. Source coordinates and the upstream SHA-256 are recorded in `client/glyph-library.js`.

Copyright © 1999 Arphic Technology Co., Ltd. The full unchanged Arphic Public License is retained in the glyph source and built HTML, and copied to [`licenses/ARPHICPL.TXT`](licenses/ARPHICPL.TXT). Keep these notices and the licence with redistributed glyph material. The glyphs are supplied without warranty under that licence.

## Browser dependencies loaded externally

The application fetches these dependencies at runtime; their code and models are not vendored into this repository. Their upstream notices and licences apply to those components.

| Component | Version or asset | Upstream |
| --- | --- | --- |
| MediaPipe Tasks Vision | `@mediapipe/tasks-vision@0.10.32` JS/WASM | [MediaPipe](https://github.com/google-ai-edge/mediapipe) |
| Pose model | Pose Landmarker Lite, float16, model version 1 | [Pose Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) |
| Optional face model | Face Landmarker, float16, model version 1 | [Face Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) |
| Lobby hand gesture model | Gesture Recognizer, float16, model version 1; canned `Thumb_Up` | [Gesture Recognizer documentation](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js) |
| QR generator | `qrcodejs@1.0.0` | [QRCode.js](https://github.com/davidshimjs/qrcodejs) |
| Timelapse media toolkit | `mediabunny@1.61.3`, dynamically imported from jsDelivr `+esm`; MPL-2.0 | [Mediabunny source and licence](https://github.com/Vanilagy/mediabunny) |
| Fonts | DM Sans, Manrope, Newsreader via Google Fonts | [Google Fonts](https://github.com/google/fonts) |

Edition 05 uses Mediabunny only in the browser to read the completed local highlight, decode frames by source timestamp, and mux the WebCodecs-generated 30 fps derivative with original-rate soundtrack audio. The dependency is pinned and unmodified; no participant footage is sent to its CDN. The CDN supplies library code, while decoding and encoding happen locally. Unsupported codecs are reported rather than replaced with an accelerated real-time recorder.

Edition 06 additionally runs Gesture Recognizer locally in the Worker during the camera lobby. It examines cropped raw camera images, independently of the rendered costume. The selected participants must be recognized before hand classification begins. Hand inference stops when the first drawing round begins; frames and hand landmarks are not uploaded by the detector.

## Costume assets

The six costume source PNGs and their optimized WebPs were generated for this project with AI image generation. They are contemporary AR interpretations, not copied reference photographs. [`client/assets/LION-ASSETS.md`](client/assets/LION-ASSETS.md) records design choices, renderer notes, and the original cultural/artist/catalogue reference links. `client/assets/lion-assets-v21-prompts.json` retains the generation/edit prompts and portable generation provenance. Reference websites' photographs were consulted, not bundled.

The three sets are inspired by red/ivory Fut San, jade/ivory Hok San, and gold/black Fut San forms. The app's separate headgear and fitted clothing are an adaptation; a traditional southern lion also has the connecting body/cape.

## Favicon

The cute southern-lion favicon was newly generated for this project with the built-in imagegen tool on 2026-10-11. Transparent PNG and ICO variants retain the generated artwork and alpha. [`client/assets/favicon/PROMPT.md`](client/assets/favicon/PROMPT.md) preserves the prompt and generation provenance. No external reference image is bundled.

## Soundtrack

`soundtrack.mp3` contains the energetic 67.6–105.6-second excerpt of `Lion Dance.mp3` supplied by the project creator for the demo. It is used for live/export percussion with additional synthesized accents. The full original recording and local source path are not included. No separate licence for this recording is asserted by this notice.

## Original application

No blanket licence has been selected for the original application code or independently licensed media. This notice preserves provenance and third-party terms; it does not replace them or grant additional rights.
