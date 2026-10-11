/* Pure lobby readiness checks. Coordinates are raw, unmirrored camera space.
 * MediaPipe's Thumb_Up classifier is mandatory; body wrists never imply a thumb.
 */
(() => {
  'use strict';
  const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  const credible = p => finite(p) && (p.visibility ?? 1) >= .6 && (p.presence ?? 1) >= .6;
  const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const inLane = (p, lane, lanes, margin = .006) => finite(p) && p.x > lane / lanes + margin && p.x < (lane + 1) / lanes - margin;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function players(poses, faces, lanes, aspect = 1, capturedAt = 0) {
    const refs = Array.from({ length: lanes }, (_, lane) => {
      const pose = poses?.[lane], face = faces?.[lane], nose = credible(face?.nose) ? face.nose : credible(pose?.[0]) ? pose[0] : null;
      let headWidth = face?.bounds?.width, headHeight = face?.bounds?.height;
      if (!Number.isFinite(headWidth) || !Number.isFinite(headHeight)) {
        const ears = credible(pose?.[7]) && credible(pose?.[8]) ? Math.abs(pose[7].x - pose[8].x) : 0;
        const eyes = credible(pose?.[2]) && credible(pose?.[5]) ? Math.abs(pose[2].x - pose[5].x) * 2.5 : 0;
        headWidth = Math.max(ears, eyes); headHeight = headWidth * aspect * 1.25;
      }
      const anchor = nose && headWidth >= .009 && headHeight >= .012 ? {
        x: nose.x, y: nose.y, headWidth, headHeight, source: credible(face?.nose) ? 'face' : 'pose'
      } : null;
      const seen = !!anchor && inLane(anchor, lane, lanes);
      return { seen, distinct: seen, reason: seen ? 'person' : anchor ? 'center-in-lane' : 'find-person', capturedAt, anchor, pose, face, lane, lanes };
    });
    // Independent overlapping Pose crops can discover the same person twice.
    // No readiness is granted to overlapping/near-identical face anchors.
    for (let a = 0; a < refs.length; a++) for (let b = a + 1; b < refs.length; b++) {
      const x = refs[a], y = refs[b];
      if (!x.anchor || !y.anchor) continue;
      const tooClose = distance(x.anchor, y.anchor, aspect) < Math.max(.035, Math.min(x.anchor.headWidth, y.anchor.headWidth) * aspect * .75);
      if (tooClose) for (const p of [x, y]) { p.seen = false; p.distinct = false; p.reason = 'spread-apart'; }
    }
    return refs;
  }

  function angle(a, b, c, aspect = 1, world = false) {
    const v = p => [(p.x - b.x) * aspect, p.y - b.y, world ? (p.z || 0) - (b.z || 0) : 0];
    const u = v(a), w = v(c), length = Math.hypot(...u) * Math.hypot(...w);
    return length ? Math.acos(clamp(u.reduce((s, x, i) => s + x * w[i], 0) / length, -1, 1)) * 180 / Math.PI : 0;
  }
  function thumbGeometry(landmarks, worldLandmarks, aspect = 1) {
    if (landmarks?.length !== 21 || !landmarks.every(finite)) return false;
    const p = landmarks, palm = distance(p[5], p[17], aspect);
    if (palm < .008 || palm > .65 || p[2].y - p[4].y < palm * .25 || angle(p[2], p[3], p[4], aspect) < 140) return false;
    const world = worldLandmarks?.length === 21 && worldLandmarks.every(p => p && ['x','y','z'].every(k => Number.isFinite(p[k])));
    const q = world ? worldLandmarks : p;
    const dist = (a,b) => world ? Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z) : distance(a,b,aspect);
    let curled = 0;
    for (const [m, joint, tip] of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]) {
      if (dist(q[tip],q[0]) < dist(q[joint],q[0]) * 1.12 || angle(q[m],q[joint],q[tip],world ? 1 : aspect,world) < 145) curled++;
    }
    return curled >= 3;
  }
  function nearby(wrist, ref, aspect) {
    if (!ref?.seen || !ref.distinct || !inLane(wrist, ref.lane, ref.lanes)) return false;
    const head = ref.anchor, vertical = Math.min(.5, Math.max(.28, head.headHeight * 3.5));
    return wrist.y > head.y - Math.max(.14, head.headHeight * 1.2) && wrist.y < head.y + vertical
      && distance(wrist, head, aspect) < Math.min(.65, Math.max(.22, head.headWidth * aspect * 3.5));
  }
  function association(hand, refs, aspect = 1) {
    const wrist = hand.landmarks?.[0];
    if (!finite(wrist)) return { owner: -1, reason: 'show-hand' };
    const palm = distance(hand.landmarks[5],hand.landmarks[17],aspect), matches = [];
    for (const ref of refs) {
      if (!nearby(wrist, ref, aspect)) continue;
      // Tight face framing can produce credible-looking body wrists near the
      // bottom edge. Only wrists in this player's ready-hand neighborhood are
      // relevant; unrelated detections must not suppress close-up face ownership.
      const wrists = [ref.pose?.[15],ref.pose?.[16]].filter(p => credible(p) && nearby(p,ref,aspect));
      if (wrists.length) {
        const d = Math.min(...wrists.map(p => distance(wrist,p,aspect)));
        if (d <= Math.max(.045, palm * 1.6)) matches.push({ lane: ref.lane, d, source: 'wrist' });
      } else {
        // Close-up users may have no valid body pose. A hand must stay beside
        // their one local face; lane membership alone never establishes owner.
        const limit = Math.min(.38, Math.max(.12,ref.anchor.headWidth * aspect * 2.1));
        const d = distance(wrist,ref.anchor,aspect);
        if (ref.face && d <= limit) matches.push({ lane:ref.lane,d,source:'face' });
      }
    }
    matches.sort((a,b)=>a.d-b.d);
    if (!matches.length || matches[0].lane !== hand.lane) return { owner:-1,reason:'hand-near-own-face' };
    if (matches.length > 1 && matches[1].d < matches[0].d * 1.5 + .025) return { owner:-1,reason:'separate-hands' };
    // A credible neighboring wrist closer to this hand vetoes the lane guess,
    // even if the neighboring person's hand crossed a crop boundary.
    const best = matches[0];
    for (const ref of refs) if (ref.lane !== best.lane && ref.seen) {
      const other = [ref.pose?.[15],ref.pose?.[16]].filter(credible);
      if (other.some(p => distance(wrist,p,aspect) <= best.d + .025)) return { owner:-1,reason:'separate-hands' };
    }
    return { owner:best.lane,reason:'thumb-up' };
  }
  function observations(hands, refs, aspect = 1) {
    refs.forEach(p => { p.lanes = refs.length; });
    const out = refs.map(p=>({ thumbsUp:false,score:0,reason:p.seen?'show-thumb':p.reason,hand:null }));
    for (const hand of hands) {
      if (hand.label !== 'Thumb_Up' || !Number.isFinite(hand.score) || hand.score < .8) continue;
      if (!thumbGeometry(hand.landmarks,hand.worldLandmarks,aspect)) continue;
      const match = association(hand,refs,aspect);
      if (match.owner < 0) { if(out[hand.lane]) out[hand.lane].reason=match.reason; continue; }
      const prior=out[match.owner];
      if (hand.score > prior.score) out[match.owner]={thumbsUp:true,score:hand.score,reason:'hold-thumb',hand:{wrist:hand.landmarks[0],thumb:hand.landmarks[4]}};
    }
    // A copied/cross-boundary detection must never ready two roles.
    for(let a=0;a<out.length;a++)for(let b=a+1;b<out.length;b++){
      if(out[a].hand&&out[b].hand&&distance(out[a].hand.wrist,out[b].hand.wrist,aspect)<.04){
        for(const i of [a,b])out[i]={thumbsUp:false,score:0,reason:'separate-hands',hand:null};
      }
    }
    return out;
  }

  class Hold {
    constructor(lanes, { holdMs=1200, gapMs=700, minSamples=4 }={}) { this.lanes=lanes;this.holdMs=holdMs;this.gapMs=gapMs;this.minSamples=minSamples;this.reset(); }
    reset(epoch=this.epoch) { this.epoch=epoch;this.states=Array(this.lanes).fill(null); }
    update(values,refs,time,epoch,aspect=1) {
      if(epoch!==this.epoch)this.reset(epoch);
      return refs.map((ref,i)=>{
        const value=values[i]||{thumbsUp:false,score:0,reason:'show-thumb'},prior=this.states[i];
        const fresh=Number.isFinite(time)&&(!prior||time>prior.time);
        const changed=prior&&ref.anchor&&distance(ref.anchor,prior.anchor,aspect)>Math.max(.12,ref.anchor.headWidth*aspect*1.5);
        if(!fresh||!ref.seen||!ref.distinct||!value.thumbsUp){this.states[i]=null;return{...value,thumbsUp:false,ready:false,progress:0,heldMs:0,samples:0,reason:fresh?value.reason:'stale-frame',capturedAt:time,sampledAt:time};}
        const continuing=prior&&!changed&&time-prior.time<=this.gapMs;
        const state={start:continuing?prior.start:time,time,samples:continuing?prior.samples+1:1,anchor:ref.anchor};this.states[i]=state;
        const heldMs=Math.max(0,time-state.start),ready=heldMs>=this.holdMs&&state.samples>=this.minSamples;
        return{...value,ready,progress:Math.min(1,heldMs/this.holdMs),heldMs,samples:state.samples,reason:ready?'ready':'hold-thumb',capturedAt:time,sampledAt:time};
      });
    }
  }
  globalThis.ReadinessGesture={players,thumbGeometry,association,observations,Hold,inLane,distance};
})();
