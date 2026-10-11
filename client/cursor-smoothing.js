/* Real camera observations create ink; display() never creates ink.
 * Based on Casiez/Roussel/Vogel's One Euro filter: https://gery.casiez.net/1euro/
 * The visible marker uses the measured camera point. Only ink is gently filtered.
 */
(function (root) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

  class EuroAxis {
    constructor(minCutoff, beta, derivativeCutoff) {
      this.minCutoff = minCutoff; this.beta = beta; this.derivativeCutoff = derivativeCutoff;
      this.valid = false;
    }
    reset(value) { this.raw = this.value = value; this.derivative = 0; this.valid = true; }
    sample(value, dt) {
      if (!this.valid) { this.reset(value); return value; }
      const derivative = (value - this.raw) / dt;
      this.derivative += alpha(this.derivativeCutoff, dt) * (derivative - this.derivative);
      const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
      this.value += alpha(cutoff, dt) * (value - this.value);
      this.raw = value;
      return this.value;
    }
  }

  class MotionCursor {
    constructor({ minCutoff = 5, beta = 16, derivativeCutoff = 1, deadzone = .0005,
                  displayTau = .005, predictionMs = 0, maxLead = 0 } = {}) {
      this.x = new EuroAxis(minCutoff, beta, derivativeCutoff);
      this.y = new EuroAxis(minCutoff, beta, derivativeCutoff);
      this.deadzone = deadzone; this.displayTau = displayTau;
      this.predictionMs = predictionMs; this.maxLead = maxLead;
      this.clear({ x: .5, y: .12 });
    }
    clear(point = this.point) {
      this.valid = false; this.time = null; this.receivedAt = 0; this.renderAt = null;
      this.gapMs = 66; this.latencyMs = 0;
      this.point = { ...point }; this.visual = { ...point }; this.anchor = { ...point };
      this.velocity = { x: 0, y: 0 };
      this.x.valid = this.y.valid = false;
    }
    sample(point, capturedAt, receivedAt = performance.now(), dimensions) {
      const input = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
      const time = Number.isFinite(capturedAt) ? capturedAt : receivedAt;
      const elapsed = this.time === null ? 0 : time - this.time;
      // A stalled/lost tracker must not sweep an invented line across the gap.
      if (!this.valid || elapsed > 350 || elapsed <= 0) {
        this.x.reset(input.x); this.y.reset(input.y);
        this.anchor = { ...input }; this.point = { ...input }; this.visual = { ...input };
        this.velocity = { x: 0, y: 0 }; this.valid = true;
      } else {
        const dt = clamp(elapsed / 1000, .008, .35);
        this.gapMs = this.gapMs * .7 + elapsed * .3;
        // Distance is measured from the held anchor, so slow deliberate motion
        // eventually crosses the threshold; sub-threshold noise stays quiet.
        if (Math.hypot(input.x - this.anchor.x, input.y - this.anchor.y) >= this.deadzone) {
          this.anchor = input;
        }
        const previous = this.point;
        this.point = { x: this.x.sample(this.anchor.x, dt), y: this.y.sample(this.anchor.y, dt) };
        this.velocity = { x: clamp((this.point.x - previous.x) / dt, -3, 3),
                          y: clamp((this.point.y - previous.y) / dt, -3, 3) };
      }
      // Filtering may quiet tiny jitter, but must never drag a fast observation
      // away from the face. Bound the two-dimensional delay to three canvas px.
      if (dimensions?.width > 0 && dimensions?.height > 0) {
        const dx = (this.point.x - input.x) * dimensions.width;
        const dy = (this.point.y - input.y) * dimensions.height;
        const distance = Math.hypot(dx, dy);
        if (distance > 3) {
          this.point = { x: input.x + dx / dimensions.width * 3 / distance,
                         y: input.y + dy / dimensions.height * 3 / distance };
          this.x.value = this.point.x; this.y.value = this.point.y;
        }
      }
      this.time = time; this.receivedAt = receivedAt;
      this.latencyMs = Math.max(0, receivedAt - time);
      return { ...this.point }; // Record this value ONCE for each observed pose.
    }
    display(now = performance.now()) {
      if (!this.valid) return { ...this.visual };
      const elapsed = this.renderAt === null ? 0 : clamp((now - this.renderAt) / 1000, 0, .1);
      this.renderAt = now;
      const age = Math.max(0, now - this.receivedAt);
      // Tiny lead is visual only, and fades before the next expected sample.
      // Slow/stalled inference gets no extrapolation.
      const lead = this.latencyMs < 200 && this.gapMs < 200
        ? Math.min(this.predictionMs / 1000, this.gapMs / 1000 * .3)
          * Math.max(0, 1 - age / Math.max(40, this.gapMs * 1.2)) : 0;
      let dx = this.velocity.x * lead, dy = this.velocity.y * lead;
      const distance = Math.hypot(dx, dy);
      if (distance > this.maxLead) { dx *= this.maxLead / distance; dy *= this.maxLead / distance; }
      const target = { x: clamp(this.point.x + dx, 0, 1), y: clamp(this.point.y + dy, 0, 1) };
      const a = elapsed ? 1 - Math.exp(-elapsed / this.displayTau) : 1;
      this.visual.x += a * (target.x - this.visual.x);
      this.visual.y += a * (target.y - this.visual.y);
      return { ...this.visual }; // Never pass this to recordPoint().
    }
  }

  function sampleCameraCursor(player, point, capturedAt, receivedAt, dimensions) {
    player.cursorSmoothing ||= new MotionCursor();
    player.pointer = player.cursorSmoothing.sample(point, capturedAt, receivedAt, dimensions);
    player.displayPointer = player.cursorSmoothing.display(receivedAt);
    return player.pointer;
  }
  function resetCameraCursor(player) {
    player.cursorSmoothing?.clear(player.pointer);
    player.displayPointer = { ...player.pointer };
  }
  function displayCameraCursor(player, now) {
    player.displayPointer = player.cursorSmoothing?.display(now) || player.pointer;
    return player.displayPointer;
  }
  root.MotionCursor = MotionCursor;
  root.sampleCameraCursor = sampleCameraCursor;
  root.resetCameraCursor = resetCameraCursor;
  root.displayCameraCursor = displayCameraCursor;
})(typeof window === 'undefined' ? globalThis : window);
