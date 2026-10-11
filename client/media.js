/* Canvas + owned soundtrack recording. No microphone. Offline timelapse codecs load from a pinned CDN. */
(() => {
  'use strict';
  // Mediabunny 1.61.3 (MPL-2.0), unmodified CDN module for offline exports.
  // Source/license: https://github.com/Vanilagy/mediabunny/tree/v1.61.3
  let timelapseLibraryPromise;
  /* Chromium's fragmented MP4 recorder can emit zero/repeated AAC timestamps
   * after pause/resume. The encoded AAC frames are intact. Repair only a proven
   * broken AAC-LC clock, in place: no sample payload, box size or video timestamp
   * changes. Unsupported/malformed containers return the original bytes.
   */
  function repairMp4AudioClock(original) {
    const unchanged = reason => ({ bytes: original, repaired: false, reason });
    if (!(original instanceof Uint8Array)) return unchanged('unsupported input');
    try {
      const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
      const u32 = at => view.getUint32(at), u16 = at => view.getUint16(at);
      const u64 = at => {
        const value = u32(at) * 4294967296 + u32(at + 4);
        if (!Number.isSafeInteger(value)) throw new Error('Large MP4 timestamp');
        return value;
      };
      const tag = at => String.fromCharCode(...original.subarray(at, at + 4));
      const boxes = (start, end) => {
        const found = [];
        for (let at = start; at < end;) {
          if (at + 8 > end) throw new Error('Truncated MP4 box');
          let size = u32(at), header = 8;
          if (size === 1) { if (at + 16 > end) throw new Error('Truncated MP4 box'); size = u64(at + 8); header = 16; }
          if (size === 0) size = end - at;
          if (size < header || at + size > end) throw new Error('Invalid MP4 box');
          found.push({ type: tag(at + 4), start: at, p: at + header, end: at + size });
          at += size;
          if (found.length > 100000) throw new Error('Too many MP4 boxes');
        }
        return found;
      };
      const children = box => boxes(box.p, box.end);
      const child = (box, type) => children(box).find(b => b.type === type);
      const requireBytes = (box, at, n) => { if (at < box.p || at + n > box.end) throw new Error('Truncated MP4 timing'); };
      const version = box => { requireBytes(box, box.p, 4); const v = original[box.p]; if (v > 1) throw new Error('Unknown MP4 version'); return v; };
      const timing = box => {
        const v = version(box), scaleAt = box.p + (v ? 20 : 12), durationAt = scaleAt + 4;
        requireBytes(box, scaleAt, v ? 12 : 8);
        return { scale: u32(scaleAt), durationAt, duration64: !!v };
      };
      const aacSamples = entry => {
        // AudioSampleEntry version 0 and an explicit AAC-LC DecoderSpecificInfo.
        requireBytes(entry, entry.p, 28);
        if (u16(entry.p + 8) !== 0) return null;
        const esds = boxes(entry.p + 28, entry.end).find(b => b.type === 'esds');
        if (!esds) return null;
        const descriptor = (at, end) => {
          if (at >= end) throw new Error('Truncated AAC descriptor');
          const type = original[at++]; let length = 0, last = false;
          for (let i = 0; i < 4; i++) {
            if (at >= end) throw new Error('Truncated AAC descriptor');
            const value = original[at++]; length = length * 128 + (value & 127);
            if (!(value & 128)) { last = true; break; }
          }
          if (!last || at + length > end) throw new Error('Invalid AAC descriptor');
          return { type, p: at, end: at + length };
        };
        const es = descriptor(esds.p + 4, esds.end);
        if (es.type !== 3 || es.p + 3 > es.end) return null;
        const flags = original[es.p + 2]; let at = es.p + 3;
        if (flags & 128) at += 2;
        if (flags & 64) { if (at >= es.end) return null; at += 1 + original[at]; }
        if (flags & 32) at += 2;
        const config = descriptor(at, es.end);
        if (config.type !== 4 || config.p + 13 > config.end || original[config.p] !== 0x40) return null;
        const specific = descriptor(config.p + 13, config.end);
        if (specific.type !== 5) return null;
        let bit = 0;
        const bits = count => {
          let value = 0;
          for (let i = 0; i < count; i++, bit++) {
            if (specific.p + (bit >> 3) >= specific.end) throw new Error('Truncated AAC config');
            value = value * 2 + ((original[specific.p + (bit >> 3)] >> (7 - (bit & 7))) & 1);
          }
          return value;
        };
        if (bits(5) !== 2) return null; // AAC-LC only; HE-AAC uses another frame clock.
        const rates = [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
        const index = bits(4), rate = index === 15 ? bits(24) : rates[index];
        if (!rate || !bits(4)) return null;
        const samples = bits(1) ? 960 : 1024;
        return { samples, rate };
      };
      const top = boxes(0, original.length), moov = top.find(b => b.type === 'moov');
      if (!top.some(b => b.type === 'ftyp') || !moov || !top.some(b => b.type === 'moof')) return unchanged('not fragmented MP4');
      const mvhd = child(moov, 'mvhd'); if (!mvhd) return unchanged('missing movie clock');
      const movie = timing(mvhd); if (!movie.scale) return unchanged('invalid movie clock');
      const tracks = new Map(), defaults = new Map(), patches = new Map();
      const patch = (at, value, wide = false) => patches.set(at, { at, value, wide });
      const mvex = child(moov, 'mvex');
      for (const box of mvex ? children(mvex) : []) if (box.type === 'trex') {
        requireBytes(box, box.p, 24);
        defaults.set(u32(box.p + 4), { value: u32(box.p + 12), at: box.p + 12 });
      }
      for (const trak of children(moov).filter(b => b.type === 'trak')) {
        const tkhd = child(trak, 'tkhd'), mdia = child(trak, 'mdia'); if (!tkhd || !mdia) continue;
        const tv = version(tkhd), idAt = tkhd.p + (tv ? 20 : 12), tkDuration = tkhd.p + (tv ? 28 : 20);
        requireBytes(tkhd, idAt, tv ? 16 : 12);
        const mdhd = child(mdia, 'mdhd'), hdlr = child(mdia, 'hdlr'); if (!mdhd || !hdlr) continue;
        requireBytes(hdlr, hdlr.p, 12);
        const clock = timing(mdhd); if (!clock.scale) continue;
        const track = { id: u32(idAt), ...clock, tkDuration, tkWide: !!tv, end: 0, samples: 0, declared: 0, broken: false, runs: [] };
        if (tag(hdlr.p + 8) === 'soun') {
          const minf = child(mdia, 'minf'), stbl = minf && child(minf, 'stbl'), stsd = stbl && child(stbl, 'stsd');
          if (stsd) {
            requireBytes(stsd, stsd.p, 8);
            const entries = boxes(stsd.p + 8, stsd.end);
            if (u32(stsd.p + 4) !== entries.length) throw new Error('Invalid MP4 sample description count');
            if (entries.length === 1 && entries[0].type === 'mp4a') {
              const aac = aacSamples(entries[0]);
              if (aac && Number.isInteger(aac.samples * clock.scale / aac.rate)) track.step = aac.samples * clock.scale / aac.rate;
            }
          }
        }
        tracks.set(track.id, track);
      }
      if (![...tracks.values()].some(t => t.step)) return unchanged('unsupported audio codec');
      for (const moof of top.filter(b => b.type === 'moof')) for (const traf of children(moof).filter(b => b.type === 'traf')) {
        const list = children(traf), tfhd = list.find(b => b.type === 'tfhd'), tfdt = list.find(b => b.type === 'tfdt');
        if (!tfhd) continue;
        requireBytes(tfhd, tfhd.p, 8);
        const flags = u32(tfhd.p) & 0xffffff;
        if (original[tfhd.p] !== 0 || (flags & ~0x03003b)) throw new Error('Unknown MP4 fragment header');
        const track = tracks.get(u32(tfhd.p + 4)); if (!track) continue;
        let at = tfhd.p + 8;
        if (flags & 1) at += 8;
        if (flags & 2) at += 4;
        let fallback = defaults.get(track.id);
        if (flags & 8) { requireBytes(tfhd, at, 4); fallback = { value: u32(at), at }; at += 4; }
        if (flags & 16) at += 4;
        if (flags & 32) at += 4;
        requireBytes(tfhd, at, 0);
        if (!tfdt) { if (track.step) throw new Error('Missing AAC decode timestamp'); else continue; }
        const dv = version(tfdt), decodeAt = tfdt.p + 4;
        requireBytes(tfdt, decodeAt, dv ? 8 : 4);
        const decode = dv ? u64(decodeAt) : u32(decodeAt);
        const expected = track.samples * (track.step || 0);
        if (track.step && Math.abs(decode - expected) > track.step * 3) track.broken = true;
        if (track.step) track.runs.push({ decodeAt, wide: !!dv, expected });
        let duration = 0;
        for (const trun of list.filter(b => b.type === 'trun')) {
          version(trun); requireBytes(trun, trun.p, 8);
          const f = u32(trun.p) & 0xffffff, count = u32(trun.p + 4);
          if (f & ~0x000f05) throw new Error('Unknown MP4 sample flags');
          let cursor = trun.p + 8 + ((f & 1) ? 4 : 0) + ((f & 4) ? 4 : 0);
          const stride = ((f & 0x100) ? 4 : 0) + ((f & 0x200) ? 4 : 0) + ((f & 0x400) ? 4 : 0) + ((f & 0x800) ? 4 : 0);
          if (count > 10000000 || cursor + count * stride > trun.end) throw new Error('Invalid MP4 sample count');
          if (count && !(f & 0x100) && !fallback) throw new Error('Missing default sample duration');
          for (let i = 0; i < count; i++) {
            const d = (f & 0x100) ? u32(cursor) : fallback.value;
            duration += d;
            if (track.step) {
              if (!d) track.broken = true;
              if (f & 0x100) track.runs.push({ durationAt: cursor });
            }
            cursor += stride;
          }
          if (track.step && count && !(f & 0x100)) track.runs.push({ durationAt: fallback.at });
          track.samples += count;
        }
        track.declared += duration; track.end = Math.max(track.end, decode + duration);
      }
      const damaged = [...tracks.values()].filter(t => t.step && t.samples && (t.broken || Math.abs(t.end - t.samples * t.step) > t.step * 3));
      if (!damaged.length) return unchanged('audio clock already valid');
      for (const t of damaged) {
        t.end = t.samples * t.step;
        for (const run of t.runs) {
          if (run.durationAt !== undefined) patch(run.durationAt, t.step);
          else patch(run.decodeAt, run.expected, run.wide);
        }
        patch(t.durationAt, t.end, t.duration64);
        patch(t.tkDuration, Math.round(t.end / t.scale * movie.scale), t.tkWide);
      }
      const duration = Math.max(...[...tracks.values()].map(t => t.end / t.scale));
      patch(movie.durationAt, Math.round(duration * movie.scale), movie.duration64);
      const output = new Uint8Array(original), out = new DataView(output.buffer);
      for (const { at, value, wide } of patches.values()) {
        if (!Number.isSafeInteger(value) || value < 0 || (!wide && value > 0xffffffff)) return unchanged('timestamp overflow');
        if (wide) { out.setUint32(at, Math.floor(value / 4294967296)); out.setUint32(at + 4, value % 4294967296); }
        else out.setUint32(at, value);
      }
      return { bytes: output, repaired: true, duration, samples: damaged.reduce((s,t) => s+t.samples, 0) };
    } catch (_) { return unchanged('unsupported or malformed MP4'); }
  }

  class MotionMedia {
    constructor({ canvas, audioUrl = '/soundtrack.mp3', onStatus = () => {} } = {}) {
      if (!canvas) throw new Error('MotionMedia requires an export canvas.');
      this.canvas = canvas;
      this.audioUrl = audioUrl;
      this.onStatus = onStatus;
      this.available = !!(canvas.captureStream && window.MediaRecorder);
      this.state = 'idle';
      this._generation = 0;
      this._queue = Promise.resolve();
      this._waiters = new Set();
      this._musicOffset = 0;
      this._liveMuted = false;
      this._objectUrls = new Set();
      this._accents = new Set();
      this._roundActive = false;
      this._activeMs = 0;
      this._recordingSince = null;
    }

    _status(state, extra = {}) {
      this.state = state;
      try { this.onStatus({ state, available: this.available, ...extra }); } catch (_) {}
    }
    _valid(token) { return token === this._generation; }
    _enqueue(fn) {
      const token = this._generation;
      const task = this._queue.catch(() => {}).then(() => this._valid(token) ? fn(token) : false);
      this._queue = task.catch(() => {});
      return task;
    }
    _waitEvent(target, event, action, timeout = 3500) {
      return new Promise((resolve, reject) => {
        let done = false;
        const end = (error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          target.removeEventListener(event, success);
          target.removeEventListener('error', failure);
          this._waiters.delete(cancel);
          error ? reject(error) : resolve(true);
        };
        const success = () => end();
        const failure = e => end(e.error || new Error('Recording failed.'));
        const cancel = () => end(new Error('Recording cancelled.'));
        const timer = setTimeout(() => end(new Error(`Recording ${event} timed out.`)), timeout);
        this._waiters.add(cancel);
        target.addEventListener(event, success, { once: true });
        target.addEventListener('error', failure, { once: true });
        try { action(); } catch (e) { end(e); }
      });
    }
    _delay(ms) {
      return new Promise(resolve => {
        const done = () => { clearTimeout(timer); this._waiters.delete(done); resolve(); };
        const timer = setTimeout(done, ms);
        this._waiters.add(done);
      });
    }
    _bounded(promise, ms = 12000) {
      return new Promise((resolve, reject) => {
        let done = false;
        const end = (error, value) => {
          if (done) return;
          done = true; clearTimeout(timer); this._waiters.delete(cancel);
          error ? reject(error) : resolve(value);
        };
        const cancel = () => end(new Error('Recording cancelled.'));
        const timer = setTimeout(() => end(new Error('Audio setup timed out.')), ms);
        this._waiters.add(cancel);
        Promise.resolve(promise).then(value => end(null, value), error => end(error));
      });
    }

    /* Call directly inside a click/tap handler, before awaiting camera/model setup. */
    async init() {
      const token = this._generation;
      let resume;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (Audio && (!this._audio || this._audio.state === 'closed')) {
          this._audio = new Audio();
          this._master = this._audio.createGain();
          this._master.gain.value = .85;
          this._musicGain = this._audio.createGain();
          this._musicGain.gain.value = 1;
          this._musicGain.connect(this._master);
          this._liveGain = this._audio.createGain();
          this._liveGain.gain.value = this._liveMuted ? 0 : 1;
          this._master.connect(this._liveGain);
          this._liveGain.connect(this._audio.destination);
        }
        // Resume happens immediately in the user's activation, before async fetch/decode.
        if (this._audio) resume = this._audio.resume();
      } catch (e) {
        this._status('warning', { warning: `Sound unavailable: ${e.message}` });
      }
      if (resume) {
        try { await this._bounded(resume, 3500); } catch (_) {}
      }
      if (!this._valid(token)) return false;
      if (!this.available) {
        this._status('unavailable', { warning: 'Video recording is unavailable in this browser. You can still play and save the poster.' });
      }
      if (!this._audio || this._buffer || !this.audioUrl) return true;
      if (this._initPromise) return this._initPromise;
      this._fetchAbort = new AbortController();
      const controller = this._fetchAbort;
      const timer = setTimeout(() => controller.abort(), 12000);
      const promise = (async () => {
        try {
          const response = await fetch(this.audioUrl, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await this._bounded(this._audio.decodeAudioData(await response.arrayBuffer()));
          if (!this._valid(token)) return false;
          this._buffer = buffer;
          return true;
        } catch (e) {
          if (this._valid(token)) this._status('warning', { warning: 'Soundtrack could not load. Recording can continue with drum accents.' });
          return false;
        } finally {
          clearTimeout(timer);
          if (this._fetchAbort === controller) this._fetchAbort = null;
          if (this._initPromise === promise) this._initPromise = null;
        }
      })();
      this._initPromise = promise;
      return promise;
    }

    captureFrame({ force = false } = {}) {
      if (this._recorder?.state !== 'recording' || !this._videoTrack || this._videoTrack.readyState === 'ended') return false;
      if (force) {
        // captureStream requires a canvas paint even when the final image holds.
        // An exact self-copy marks it painted without changing the artwork.
        const q = this.canvas.getContext('2d');
        q.save(); q.resetTransform(); q.globalAlpha = 1; q.globalCompositeOperation = 'copy';
        q.filter = 'none'; q.shadowColor = 'transparent'; q.shadowBlur = 0;
        q.drawImage(this.canvas, 0, 0); q.restore();
      }
      this._videoTrack.requestFrame?.();
      return true;
    }

    prepare() {
      return this._enqueue(async token => {
        this._cleanupSession();
        this._musicOffset = 0;
        this._activeMs = 0;
        this._recordingSince = null;
        this._finishing = false;
        if (!this.available) return false;
        try {
          if (!this._audio || this._audio.state === 'closed') await this.init();
          if (!this._valid(token)) return false;
          let stream = this.canvas.captureStream(0);
          if (typeof stream.getVideoTracks()[0]?.requestFrame !== 'function') {
            stream.getTracks().forEach(track => track.stop());
            stream = this.canvas.captureStream(30);
          }
          this._videoTrack = stream.getVideoTracks()[0];
          this._stream = stream;
          if (this._audio && this._audio.state !== 'closed') {
            this._recordDest = this._audio.createMediaStreamDestination();
            this._master.connect(this._recordDest);
            for (const track of this._recordDest.stream.getAudioTracks()) stream.addTrack(track);
          }
          const types = [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4',
            'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', ''
          ];
          let recorder;
          for (const mimeType of types) {
            if (mimeType && !MediaRecorder.isTypeSupported(mimeType)) continue;
            try {
              recorder = new MediaRecorder(stream, {
                ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1500000, audioBitsPerSecond: 128000
              });
              break;
            } catch (_) {}
          }
          if (!recorder) throw new Error('No supported video encoder.');
          this._recorder = recorder;
          const chunks = [];
          this._chunks = chunks;
          this._sessionError = null;
          recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
          recorder.addEventListener('error', e => {
            if (this._recorder !== recorder) return;
            this._sessionError = e.error || new Error('Video encoder failed.');
            if (this._valid(token) && this._recorder === recorder) this._status('warning', { warning: 'Video recording failed. You can still save the poster.' });
          });
          // MediaRecorder has no start-paused option. Pause immediately, then await acknowledgement.
          await this._waitEvent(recorder, 'pause', () => { recorder.start(250); recorder.pause(); });
          await this._suspendAudio();
          if (!this._valid(token)) return false;
          this._status('ready', { mime: recorder.mimeType, audio: stream.getAudioTracks().length > 0 });
          return true;
        } catch (e) {
          this._cleanupSession();
          if (this._valid(token)) this._status('warning', { warning: `Video recording unavailable: ${e.message} You can still save the poster.` });
          return false;
        }
      });
    }

    _startMusic() {
      if (!this._audio || !this._buffer || this._audio.state !== 'running' || this._musicSource) return;
      const audio = this._audio;
      const source = audio.createBufferSource();
      source.buffer = this._buffer;
      source.loop = true;
      source.connect(this._musicGain);
      const now = audio.currentTime;
      this._musicGain.gain.cancelScheduledValues(now);
      this._musicGain.gain.setValueAtTime(0, now);
      this._musicGain.gain.linearRampToValueAtTime(this._finishing ? .42 : 1, now + .012);
      source.start(now, this._musicOffset % this._buffer.duration);
      this._musicStartedAt = now;
      this._musicSource = source;
    }
    async _resumeAudio() {
      if (!this._audio || this._audio.state === 'closed') return;
      try { await this._bounded(this._audio.resume(), 3500); } catch (_) {}
    }
    async _suspendAudio() {
      if (!this._audio || this._audio.state !== 'running') return;
      try { await this._bounded(this._audio.suspend(), 1500); } catch (_) {}
    }
    _stopMusic(fade = false) {
      const source = this._musicSource;
      if (!source) return;
      const now = this._audio.currentTime;
      const end = now + (fade ? .012 : 0);
      this._musicOffset = (this._musicOffset + end - this._musicStartedAt) % this._buffer.duration;
      this._musicGain.gain.cancelScheduledValues(now);
      this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, now);
      this._musicGain.gain.linearRampToValueAtTime(0, end);
      try { source.stop(end); } catch (_) {}
      source.onended = () => { try { source.disconnect(); } catch (_) {} };
      this._musicSource = null;
    }

    async _beginRound(token) {
      const recorder = this._recorder;
      if (recorder && this._sessionError) return false;
      if (this._roundActive) return true;
      await this._resumeAudio();
      if (!this._valid(token)) return false;
      if (recorder) {
        if (recorder.state !== 'paused') return false;
        await this._waitEvent(recorder, 'resume', () => recorder.resume());
        this._recordingSince = performance.now();
      }
      if (!this._valid(token)) return false;
      this._roundActive = true;
      if (recorder && !this.captureFrame({ force: true })) throw new Error('The video capture track stopped.');
      this._startMusic();
      this._status(this._finishing ? 'finishing' : recorder ? 'recording' : 'playing', { recording: !!recorder });
      return true;
    }
    beginRound() {
      return this._enqueue(async token => {
        try { return await this._beginRound(token); }
        catch (e) { if (this._valid(token)) this._status('warning', { warning: e.message }); return false; }
      });
    }
    async _endRound(token) {
      const recorder = this._recorder;
      if (!this._roundActive) return true;
      if (recorder && recorder.state !== 'recording') {
        this._sessionError = new Error('A drawing section could not finish recording.');
        return false;
      }
      // requestFrame queues capture for the next canvas paint. Keep the sealed
      // drawing on screen through that paint before pausing the recorder.
      if (recorder) {
        if (!this.captureFrame({ force: true })) throw new Error('The final drawing frame could not be captured.');
        await this._delay(80);
        if (!this._valid(token)) return false;
        if (!this.captureFrame({ force: true })) throw new Error('The final drawing frame could not be captured.');
        await this._delay(24);
      }
      this._stopMusic(true);
      await this._delay(16); // Keep music through the hold, then record its click-free fade.
      if (!this._valid(token)) return false;
      if (recorder) await this._waitEvent(recorder, 'pause', () => recorder.pause());
      // Suspend the private clock too; silent frames must not accumulate during resets.
      await this._suspendAudio();
      if (!this._valid(token)) return false;
      if (this._recordingSince !== null) this._activeMs += performance.now() - this._recordingSince;
      this._recordingSince = null;
      this._roundActive = false;
      this._status('paused', { recording: !!recorder });
      return true;
    }
    /* Await this BEFORE showing reset/transition cues on the export canvas. */
    endRound() {
      return this._enqueue(async token => {
        try { return await this._endRound(token); }
        catch (e) {
          if (this._valid(token)) {
            this._sessionError = e;
            this._status('warning', { warning: `${e.message} The incomplete video will not be saved.` });
          }
          return false;
        }
      });
    }

    finish() {
      return this._enqueue(async token => {
        if (this._sessionError) {
          this._cleanupSession();
          await this._suspendAudio();
          this._status('warning', { warning: 'A drawing section did not finish recording. Save the poster or record again for a complete video.' });
          return null;
        }
        try {
          this._finishing = true;
          if (!await this._beginRound(token)) { this._cleanupSession(); await this._suspendAudio(); return null; }
          this._status('finishing');
          const now = this._audio?.currentTime;
          if (now !== undefined) {
            this._musicGain.gain.cancelScheduledValues(now);
            this._musicGain.gain.setTargetAtTime(.42, now, .035);
          }
          this.hit(1.15, true);
          await this._delay(2000);
          if (!this._valid(token)) return null;
          if (!await this._endRound(token)) {
            if (this._valid(token)) { this._cleanupSession(); await this._suspendAudio(); }
            return null;
          }
          if (!this._valid(token)) return null;
          const recorder = this._recorder;
          if (!recorder) {
            this._finishing = false;
            this._status('complete', { recording: false });
            return null;
          }
          await this._waitEvent(recorder, 'stop', () => recorder.stop(), 5000);
          if (!this._valid(token)) return null;
          if (this._sessionError) throw this._sessionError;
          const mime = recorder.mimeType || this._chunks[0]?.type || 'video/webm';
          let blob = new Blob(this._chunks, { type: mime });
          if (mime.includes('mp4')) {
            const clock = repairMp4AudioClock(new Uint8Array(await blob.arrayBuffer()));
            if (!this._valid(token)) return null;
            if (clock.repaired) blob = new Blob([clock.bytes], { type: mime });
          }
          const duration = this._activeMs / 1000;
          this._cleanupSession();
          if (!blob.size) throw new Error('The video encoder returned an empty clip.');
          this._status('complete', { mime, duration, bytes: blob.size });
          return { blob, mime, duration };
        } catch (e) {
          this._cleanupSession();
          await this._suspendAudio();
          if (this._valid(token)) this._status('warning', { warning: `Clip could not be saved: ${e.message} You can still save the poster.` });
          return null;
        }
      });
    }

    /* Decode by source timestamp and encode explicit output timestamps. Encoding
     * speed never controls which drawing frames are selected. The normal clip
     * stays intact; unsupported browsers keep that download available. */
    async makeTimelapse(clip, { speed = 3, signal, onProgress = () => {} } = {}) {
      if (!clip?.blob?.size) throw new Error('Make your normal highlight before creating a timelapse.');
      if (!window.VideoDecoder || !window.VideoEncoder || !window.AudioEncoder) {
        throw new Error('Timelapse export is unavailable in this browser. Your normal highlight is still available.');
      }
      if (this._timelapseController) throw new Error('Your timelapse is already being made.');
      speed = Math.max(1.5, Math.min(6, Number(speed) || 3));
      const token = this._generation, controller = new AbortController(), abortSignal = controller.signal;
      this._timelapseController = controller;
      const aborted = () => new DOMException('Timelapse cancelled.', 'AbortError');
      const check = () => { if (abortSignal.aborted || !this._valid(token)) throw aborted(); };
      const report = (progress, phase) => { try { onProgress({ progress: Math.max(0, Math.min(1, progress)), phase, speed }); } catch (_) {} };
      const externalAbort = () => controller.abort();
      signal?.addEventListener('abort', externalAbort, { once: true });
      if (signal?.aborted) controller.abort();
      let input, output, iterator, frameCount = 0;
      const wait = (task, timeout = 30000) => new Promise((resolve, reject) => {
        let settled = false;
        const end = (error, value) => {
          if (settled) return; settled = true; clearTimeout(timer);
          abortSignal.removeEventListener('abort', cancel);
          error ? reject(error) : resolve(value);
        };
        const cancel = () => end(aborted());
        const timer = setTimeout(() => end(new Error('Timelapse processing timed out. Your normal highlight is still available.')), timeout);
        abortSignal.addEventListener('abort', cancel, { once: true });
        Promise.resolve(task).then(value => end(null, value), error => end(error));
        if (abortSignal.aborted) cancel();
      });
      const release = () => {
        try { input?.dispose(); } catch (_) {}
        if (output && output.state !== 'finalized' && output.state !== 'canceled') output.cancel().catch(() => {});
      };
      abortSignal.addEventListener('abort', release, { once: true });
      try {
        check(); report(0, 'loading');
        // Audio activation happens in the initiating click; offline encoding uses
        // decoded PCM at its original sample rate, rather than accelerated audio.
        const audioTask = this.init();
        if (!timelapseLibraryPromise) {
          timelapseLibraryPromise = import('https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/+esm');
          timelapseLibraryPromise.catch(() => { timelapseLibraryPromise = null; });
        }
        const m = await wait(timelapseLibraryPromise, 15000);
        await wait(audioTask, 15000); check();
        if (!this._audio || !this._buffer) throw new Error('The timelapse soundtrack could not load. Your normal highlight is still available.');
        input = new m.Input({ formats: m.ALL_FORMATS, source: new m.BlobSource(clip.blob) });
        const track = await wait(input.getPrimaryVideoTrack()); check();
        if (!track || !await wait(track.canDecode())) throw new Error('This browser cannot decode the highlight for a timelapse. Your normal highlight is still available.');
        const [first, videoEnd, movieEnd, width, height] = await wait(Promise.all([
          track.getFirstTimestamp(), track.computeDuration(), input.computeDuration(), track.getDisplayWidth(), track.getDisplayHeight()
        ])); check();
        // A final static frame may hold until the audio/movie finishes. Keep that
        // legitimate tail, while detecting missing samples inside the video.
        const sourceDuration = Math.max(videoEnd, movieEnd) - first, duration = sourceDuration / speed;
        if (!Number.isFinite(duration) || duration <= .01 || duration > 300 || !width || !height) {
          throw new Error('This browser could not read the highlight timeline. Your normal highlight is still available.');
        }
        const canvas = document.createElement('canvas'), scale = Math.min(1, 720 / width, 1280 / height);
        canvas.width = Math.max(2, Math.round(width * scale / 2) * 2);
        canvas.height = Math.max(2, Math.round(height * scale / 2) * 2);
        const q = canvas.getContext('2d', { alpha: false });
        if (!q) throw new Error('Timelapse canvas is unavailable. Your normal highlight is still available.');
        const soundtrack = this._buffer, channels = Math.min(2, soundtrack.numberOfChannels), sampleRate = soundtrack.sampleRate;
        const videoOptions = { width: canvas.width, height: canvas.height, bitrate: 1500000, frameRate: 30 };
        const audioOptions = { numberOfChannels: channels, sampleRate, bitrate: 128000 };
        let videoCodec, audioCodec, format;
        if (await wait(m.canEncodeVideo('avc', videoOptions)) && await wait(m.canEncodeAudio('aac', audioOptions))) {
          videoCodec = 'avc'; audioCodec = 'aac'; format = new m.Mp4OutputFormat({ fastStart: 'in-memory' });
        } else if (await wait(m.canEncodeVideo('vp8', videoOptions)) && await wait(m.canEncodeAudio('opus', audioOptions))) {
          videoCodec = 'vp8'; audioCodec = 'opus'; format = new m.WebMOutputFormat();
        } else throw new Error('This browser cannot encode a timelapse with sound. Your normal highlight is still available.');
        check();
        const target = new m.BufferTarget();
        output = new m.Output({ format, target });
        const videoSource = new m.CanvasSource(canvas, { codec: videoCodec, bitrate: 1500000, keyFrameInterval: 1 });
        const audioSource = new m.AudioBufferSource({ codec: audioCodec, bitrate: 128000 });
        output.addVideoTrack(videoSource, { frameRate: 30 }); output.addAudioTrack(audioSource);
        await wait(output.start()); check();
        const totalFrames = Math.ceil(duration * 30), totalAudioSamples = Math.ceil(duration * sampleRate);
        const times = Array.from({ length: totalFrames }, (_, i) => first + i * speed / 30);
        iterator = new m.VideoSampleSink(track).samplesAtTimestamps(times);
        let audioSamples = 0;
        const addAudioUntil = async timestamp => {
          const through = Math.min(totalAudioSamples, Math.ceil(timestamp * sampleRate));
          while (audioSamples < through) {
            check();
            const length = Math.min(through - audioSamples, sampleRate);
            const buffer = this._audio.createBuffer(channels, length, sampleRate);
            for (let c = 0; c < channels; c++) {
              const original = soundtrack.getChannelData(c), data = buffer.getChannelData(c);
              for (let j = 0; j < length; j++) {
                const at = audioSamples + j, t = at / sampleRate;
                const fade = Math.max(0, Math.min(1, t / .03, (duration - t) / .04));
                data[j] = original[at % original.length] * .85 * fade;
              }
            }
            await wait(audioSource.add(buffer)); audioSamples += length;
          }
        };
        for (let i = 0; i < totalFrames; i++) {
          check();
          const { value: sample, done } = await wait(iterator.next()); check();
          if (done || !sample) throw new Error('The highlight has an unreadable frame. Your normal highlight is still available.');
          try {
            // A damaged source cannot be repaired by inventing footage. Reject
            // long missing-frame intervals instead of exporting a frozen result.
            if (times[i] < videoEnd && times[i] - sample.timestamp > 1.25) throw new Error('The highlight is missing video frames. Keep the normal highlight and record again for a complete timelapse.');
            sample.draw(q, 0, 0, canvas.width, canvas.height);
            const timestamp = i / 30, frameDuration = Math.min(1 / 30, duration - timestamp);
            await wait(videoSource.add(timestamp, frameDuration));
            await addAudioUntil(timestamp + frameDuration);
            frameCount++;
            report(frameCount / totalFrames * .95, 'encoding');
          } finally { sample.close(); }
          // Keep progress and cancellation responsive under a slow software codec.
          if (i % 8 === 7) await wait(new Promise(resolve => setTimeout(resolve, 0)));
        }
        await addAudioUntil(duration); videoSource.close(); audioSource.close();
        report(.97, 'finishing'); await wait(output.finalize()); check();
        const mime = await wait(output.getMimeType()), blob = new Blob([target.buffer], { type: mime });
        if (!blob.size || frameCount !== totalFrames) throw new Error('The browser did not finish every timelapse frame. Your normal highlight is still available.');
        report(1, 'complete');
        return { blob, mime, duration, speed, frames: frameCount, sourceDuration };
      } catch (error) {
        if (abortSignal.aborted || !this._valid(token)) throw aborted();
        const message = error?.message || 'Timelapse export failed.';
        throw new Error(message.includes('normal highlight') ? message : `${message} Your normal highlight is still available.`);
      } finally {
        release();
        try { await iterator?.return(); } catch (_) {}
        abortSignal.removeEventListener('abort', release);
        signal?.removeEventListener('abort', externalAbort);
        if (this._timelapseController === controller) this._timelapseController = null;
        if (this._audio?.state === 'running' && !this._roundActive) {
          try { await this._bounded(this._audio.suspend(), 1500); } catch (_) {}
        }
      }
    }

    muteLive(muted = true) {
      this._liveMuted = !!muted;
      if (this._liveGain) this._liveGain.gain.setTargetAtTime(muted ? 0 : 1, this._audio.currentTime, .015);
      return this._liveMuted;
    }
    hit(strength = 1, cymbal = false) {
      if (!this._audio || this._audio.state !== 'running') return;
      const a = this._audio, t = a.currentTime;
      strength = Math.max(0, Math.min(1.4, Number(strength) || 1));
      const osc = a.createOscillator(), gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + .20);
      gain.gain.setValueAtTime(.48 * strength, t);
      gain.gain.exponentialRampToValueAtTime(.001, t + .48);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + .50);
      this._accents.add(osc);
      osc.onended = () => { this._accents.delete(osc); osc.disconnect(); gain.disconnect(); };
      if (cymbal) {
        const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * 1.4), a.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = a.createBufferSource(), filter = a.createBiquadFilter(), envelope = a.createGain();
        source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 3500;
        envelope.gain.setValueAtTime(.11 * strength, t);
        envelope.gain.exponentialRampToValueAtTime(.001, t + 1.35);
        source.connect(filter); filter.connect(envelope); envelope.connect(this._master);
        source.start(t); source.stop(t + 1.4);
        this._accents.add(source);
        source.onended = () => { this._accents.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
      }
    }

    /* Use this helper for preview URLs so cancel/restart can revoke them safely. */
    createObjectURL(blob) {
      const url = URL.createObjectURL(blob);
      this._objectUrls.add(url);
      return url;
    }
    _cleanupSession() {
      this._stopMusic();
      for (const source of this._accents) { try { source.stop(); } catch (_) {} }
      this._accents.clear();
      const recorder = this._recorder;
      this._recorder = null;
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (_) {} }
      if (this._stream) this._stream.getTracks().forEach(track => track.stop());
      this._stream = null;
      if (this._recordDest) {
        try { this._master.disconnect(this._recordDest); } catch (_) {}
        this._recordDest.stream.getTracks().forEach(track => track.stop());
      }
      this._recordDest = null;
      this._finishing = false;
      this._roundActive = false;
    }
    async cancel() {
      ++this._generation;
      this._timelapseController?.abort();
      this._fetchAbort?.abort();
      this._initPromise = null;
      for (const cancel of [...this._waiters]) cancel();
      this._cleanupSession();
      const audio = this._audio;
      this._audio = null;
      this._master = null;
      this._musicGain = null;
      this._liveGain = null;
      this._musicOffset = 0;
      this._activeMs = 0;
      this._recordingSince = null;
      for (const url of this._objectUrls) URL.revokeObjectURL(url);
      this._objectUrls.clear();
      this._status('cancelled');
      if (audio && audio.state !== 'closed') {
        try { await this._bounded(audio.close(), 1500); } catch (_) {}
      }
      return true;
    }
  }
  MotionMedia.repairMp4AudioClock = repairMp4AudioClock;
  window.MotionMedia = MotionMedia;
})();
