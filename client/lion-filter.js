/*
 * Photographic southern lion headgear and performance costume, Canvas 2D.
 * Configure window.LION_ASSETS before loading: {head, outfit, sets:[{id,head,outfit}]}.
 * drawDancerLion(ctx,{landmarks,face,videoRect:{x,y,w,h},time,energy,role,color,costume}).
 * The video is mirrored. Draw this AFTER restoring the video-only clip so headgear
 * can use up to 16% of video height as headroom. The actual face stays uncovered.
 */
(function () {
  'use strict';
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const shift = (p,u,n) => ({x:p.x+u.x*n,y:p.y+u.y*n});
  const cache = new Map();
  const source = window.LION_ASSETS || {};
  function preload(value) {
    if (value && typeof value === 'object' && (value.width || value.naturalWidth)) return Promise.resolve(value);
    if (!value) return Promise.reject(new Error('Missing lion costume image'));
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Cannot load lion costume image'));
      image.src = value;
    });
  }
  const configs = Array.isArray(source.sets) && source.sets.length ? source.sets : [{id:'red',head:source.head,outfit:source.outfit}];
  const sets = configs.map((config,index) => ({id:config.id || String(index),ready:false,head:null,outfit:null}));
  const promises = configs.map((config,index) => Promise.all([preload(config.head),preload(config.outfit)]).then(images => {
    Object.assign(sets[index],{head:images[0],outfit:images[1],ready:true});
    return true;
  }).catch(error => { console.warn('Lion costume unavailable:',sets[index].id,error.message); return false; }));
  window.lionAssetsReady = Promise.all(promises).then(results => results.every(Boolean));
  function valid(p) {
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > -.3 && p.x < 1.3 && p.y > -.3 && p.y < 1.3 &&
      (p.visibility == null || p.visibility >= .35) && (p.presence == null || p.presence >= .35);
  }
  function average(points) {
    const present = points.filter(Boolean);
    return present.length ? {x:present.reduce((v,p)=>v+p.x,0)/present.length,y:present.reduce((v,p)=>v+p.y,0)/present.length} : null;
  }
  function crop(image,x,y,w,h) {
    return {x:x*image.width/1024,y:y*image.height/1536,w:w*image.width/1024,h:h*image.height/1536};
  }
  // A two-triangle affine warp keeps the photographed shirt inexpensive to animate.
  function triangle(ctx,image,src,s,d) {
    const sx1=s[1].x-s[0].x, sy1=s[1].y-s[0].y, sx2=s[2].x-s[0].x, sy2=s[2].y-s[0].y;
    const det=sx1*sy2-sx2*sy1;
    if (Math.abs(det)<.001) return;
    const dx1=d[1].x-d[0].x,dy1=d[1].y-d[0].y,dx2=d[2].x-d[0].x,dy2=d[2].y-d[0].y;
    const a=(dx1*sy2-dx2*sy1)/det,b=(dy1*sy2-dy2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,e=(dy2*sx1-dy1*sx2)/det;
    ctx.save();
    ctx.beginPath();ctx.moveTo(d[0].x,d[0].y);ctx.lineTo(d[1].x,d[1].y);ctx.lineTo(d[2].x,d[2].y);ctx.closePath();ctx.clip();
    ctx.transform(a,b,c,e,d[0].x-a*s[0].x-c*s[0].y,d[0].y-b*s[0].x-e*s[0].y);
    ctx.drawImage(image,src.x,src.y,src.w,src.h,0,0,src.w,src.h);
    ctx.restore();
  }
  function quad(ctx,image,src,q) {
    const s=[{x:0,y:0},{x:src.w,y:0},{x:src.w,y:src.h},{x:0,y:src.h}];
    triangle(ctx,image,src,[s[0],s[1],s[2]],[q[0],q[1],q[2]]);
    triangle(ctx,image,src,[s[0],s[2],s[3]],[q[0],q[2],q[3]]);
  }
  function limb(ctx,image,src,a,b,width,vertical,reverse) {
    if (!a || !b || distance(a,b)<3) return;
    const length=distance(a,b);
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x)-(vertical?Math.PI/2:0));
    if (vertical) ctx.drawImage(image,src.x,src.y,src.w,src.h,-width/2,-1,width,length+2);
    else {
      if (reverse) { ctx.translate(length,0);ctx.scale(-1,1); }
      ctx.drawImage(image,src.x,src.y,src.w,src.h,-1,-width/2,length+2,width);
    }
    ctx.restore();
  }
  function smooth(role,raw,face,clock) {
    let state=cache.get(role);
    if (!state || clock-state.seen>.8) { state={points:{},face:{...face},seen:clock};cache.set(role,state); }
    const alpha=1-Math.exp(-clamp(clock-state.seen,0,.2)/.095);
    const points={};
    Object.keys(raw).forEach(key => {
      const p=raw[key],old=state.points[key] || p;
      points[key]={x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha};
    });
    Object.keys(face).forEach(key => state.face[key]+= (face[key]-state.face[key])*alpha);
    state.points=points;state.seen=clock;
    return state;
  }
  function mapPoint(p,r) {
    return valid(p) ? {x:r.x+(1-p.x)*r.w,y:r.y+p.y*r.h} : null;
  }
  // FaceLandmarker coordinates refer to the same unmirrored camera frame as the
  // pose. Its measured contour remains useful when the torso is outside frame.
  function measureFace(face,r) {
    if (!face || !face.bounds) return null;
    const b=face.bounds,nose=mapPoint(face.nose,r),brow=mapPoint(face.forehead,r),chin=mapPoint(face.chin,r);
    if (!nose || !brow || ![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.width<=0 || b.height<=0 || b.width>1.3 || b.height>1.3) return null;
    const eyes=Array.isArray(face.eyes)?face.eyes.map(p=>mapPoint(p,r)).filter(Boolean):[];
    eyes.sort((a,b)=>a.x-b.x);
    const left=r.x+(1-b.x-b.width)*r.w,right=left+b.width*r.w;
    const top=Math.min(r.y+b.y*r.h,brow.y),bottom=Math.max(r.y+(b.y+b.height)*r.h,chin?chin.y:nose.y);
    const width=right-left;
    if (width<8 || bottom-top<8) return null;
    const roll=eyes.length>=2?clamp(Math.atan2(eyes.at(-1).y-eyes[0].y,eyes.at(-1).x-eyes[0].x),-.139626,.139626):0;
    return {x:brow.x,forehead:brow.y,roll,width:clamp(width*2.45,40,r.w*.4),faceWidth:width,left,right,top,bottom,nose};
  }
  function measuredTorso(lm,mapped) {
    const reliable=index=>valid(lm && lm[index]) && (lm[index].visibility==null || lm[index].visibility>=.6) &&
      (lm[index].presence==null || lm[index].presence>=.6) && mapped[index] && lm[index].y>=-.05 && lm[index].y<=1.05;
    if (![11,12,23,24].every(reliable)) return false;
    const shoulders=mid(mapped[11],mapped[12]),hips=mid(mapped[23],mapped[24]);
    const sw=distance(mapped[11],mapped[12]),length=distance(shoulders,hips);
    return sw>=12 && length>=sw*.35 && length<=sw*3.5 && hips.y>shoulders.y+sw*.12;
  }
  function drawFaceHeadgear(ctx,o,asset,rawFace) {
    const r=o.videoRect,state=smooth(String(o.role==null?'0':o.role)+'/face',{},
      {x:rawFace.x,forehead:rawFace.forehead,roll:rawFace.roll,width:rawFace.width},performance.now()/1000),f=state.face;
    const headroom=Math.max(0,Math.min(Number.isFinite(r.headRoom)?r.headRoom:r.h*.16,r.y-14));
    const gap=clamp(rawFace.faceWidth*.04,3,8),headBottom=Math.min(f.forehead,rawFace.forehead,rawFace.top)-gap;
    const topLimit=r.y-headroom+6,available=Math.max(0,headBottom-topLimit),ratio=asset.head.height/asset.head.width;
    const sine=Math.abs(Math.sin(f.roll)),cosine=Math.abs(Math.cos(f.roll));
    const headWidth=Math.min(f.width,available/(ratio*cosine+sine));
    const headHeight=headWidth*ratio,rotatedHeight=headHeight*cosine+headWidth*sine,rotatedWidth=headWidth*cosine+headHeight*sine;
    const centerX=clamp(f.x,r.x+rotatedWidth/2,r.x+r.w-rotatedWidth/2),centerY=headBottom-rotatedHeight/2;
    ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
    ctx.beginPath();ctx.rect(r.x,r.y-headroom,r.w,r.h+headroom);
    ctx.rect(rawFace.left-gap,rawFace.top-gap,rawFace.right-rawFace.left+gap*2,rawFace.bottom-rawFace.top+gap*2);ctx.clip('evenodd');
    if (headWidth>18) {
      ctx.translate(centerX,centerY);ctx.rotate(f.roll);
      ctx.drawImage(asset.head,-headWidth/2,-headHeight/2,headWidth,headHeight);
    }
    ctx.restore();
    return {ready:true,visible:headWidth>18,costume:asset.id,body:false,source:'face',
      head:{x:centerX,y:centerY,width:headWidth,height:headHeight,roll:f.roll,top:centerY-rotatedHeight/2,bottom:headBottom,forehead:rawFace.forehead,headroom},
      face:{x:(rawFace.left+rawFace.right)/2,y:(rawFace.top+rawFace.bottom)/2,width:rawFace.faceWidth,top:rawFace.top,bottom:rawFace.bottom}};
  }
  function drawDancerLion(ctx,o) {
    const r=o && o.videoRect,lm=o && o.landmarks;
    if (!r || !Number.isFinite(r.w) || r.w<=0 || !Number.isFinite(r.h) || r.h<=0) return {ready:false,visible:false};
    const chosen=sets[((Math.floor(o.costume || 0)%sets.length)+sets.length)%sets.length];
    const asset=chosen && chosen.ready ? chosen : sets.find(set=>set.ready);
    if (!asset) return {ready:false,visible:false};
    const mapped={};
    if (Array.isArray(lm)) lm.forEach((p,index)=>{ if(valid(p)) mapped[index]={x:r.x+(1-p.x)*r.w,y:r.y+p.y*r.h}; });
    const measured=measureFace(o.face,r),bodyVisible=measuredTorso(lm,mapped);
    if (measured && !bodyVisible) return drawFaceHeadgear(ctx,o,asset,measured);
    if (!mapped[0] || !mapped[11] || !mapped[12]) return {ready:true,visible:false};
    const lIndex=mapped[11].x<mapped[12].x?11:12,rIndex=lIndex===11?12:11;
    const nose=mapped[0],ls=mapped[lIndex],rs=mapped[rIndex],sw=distance(ls,rs);
    if (sw<12) return {ready:true,visible:false};
    let leftEye=average([mapped[1],mapped[2],mapped[3]]),rightEye=average([mapped[4],mapped[5],mapped[6]]);
    const eyeCenter=leftEye && rightEye?mid(leftEye,rightEye):{x:nose.x,y:nose.y-sw*.12};
    let eyeA=leftEye || mapped[7] || ls,eyeB=rightEye || mapped[8] || rs;
    if (eyeA.x>eyeB.x) {const swap=eyeA;eyeA=eyeB;eyeB=swap;}
    const faceWidth=clamp(mapped[7] && mapped[8]?distance(mapped[7],mapped[8])*1.08:leftEye && rightEye?distance(leftEye,rightEye)*2.85:sw*.44,sw*.28,sw*.65);
    const roll=clamp(Math.atan2(eyeB.y-eyeA.y,eyeB.x-eyeA.x),-.139626,.139626);
    // Ears measure head width, not just the brow. A conservative forehead margin
    // also protects a side-facing dancer whose nearer eye hides the other eye.
    const forehead=measured?Math.min(measured.forehead,measured.top):eyeCenter.y-Math.max(faceWidth*.65,sw*.27);
    const rawFace={x:measured?measured.x:eyeCenter.x,forehead,roll:measured?measured.roll:roll,width:measured?measured.width:clamp(sw*1.12,40,r.w*.34)};
    const state=smooth(String(o.role == null?'0':o.role),mapped,rawFace,performance.now()/1000);
    const p=state.points,f=state.face;
    const l=p[lIndex],right=p[rIndex],shoulderMid=mid(l,right);
    const currentSw=distance(l,right),u={x:(right.x-l.x)/currentSw,y:(right.y-l.y)/currentSw};
    const hipL=p[lIndex+12],hipR=p[rIndex+12];
    const hipMid=hipL && hipR?mid(hipL,hipR):shift(shoulderMid,{x:-u.y,y:u.x},currentSw*1.12);
    const length=Math.max(1,distance(shoulderMid,hipMid)),down={x:(hipMid.x-shoulderMid.x)/length,y:(hipMid.y-shoulderMid.y)/length};
    const headroom=Math.max(0,Math.min(Number.isFinite(r.headRoom)?r.headRoom:r.h*.16,r.y-14));
    const gap=clamp(faceWidth*.08,3,8);
    const headBottom=Math.min(f.forehead,forehead)-gap;
    const topLimit=r.y-headroom+6,available=Math.max(0,headBottom-topLimit);
    const ratio=asset.head.height/asset.head.width;
    const sine=Math.abs(Math.sin(f.roll)),cosine=Math.abs(Math.cos(f.roll));
    const headWidth=Math.min(f.width,available/(ratio*cosine+sine));
    const headHeight=headWidth*ratio,rotatedHeight=headHeight*cosine+headWidth*sine;
    const centerY=headBottom-rotatedHeight/2;
    const faceBottom=measured?measured.bottom:nose.y+Math.max(faceWidth*.82,sw*.35);
    const facePoints=[nose,leftEye,rightEye,mapped[7],mapped[8]].filter(Boolean);
    const faceMinX=measured?measured.left:Math.min(...facePoints.map(point=>point.x))-faceWidth*.3;
    const faceMaxX=measured?measured.right:Math.max(...facePoints.map(point=>point.x))+faceWidth*.3;
    const faceX=(faceMinX+faceMaxX)/2;
    ctx.save();
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
    // Exclude the CURRENT face, independently of smoothing. A sudden lean or hand
    // cross-over can never drag the opaque costume across the eyes or forehead.
    ctx.beginPath();ctx.rect(r.x,r.y-headroom,r.w,r.h+headroom);
    ctx.rect(Math.floor(faceMinX-gap),Math.floor(forehead-gap),Math.ceil(faceMaxX-faceMinX+gap*2)+1,Math.ceil(faceBottom-forehead+gap*2)+1);
    ctx.clip('evenodd');
    if (bodyVisible) {
    ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
    const outfit=asset.outfit;
    const hipsWidth=hipL && hipR?distance(hipL,hipR):currentSw*.66;
    const legWidth=clamp(hipsWidth*.84,currentSw*.34,currentSw*.8);
    limb(ctx,outfit,crop(outfit,244,550,270,445),p[lIndex+12],p[lIndex+14],legWidth,true,false);
    limb(ctx,outfit,crop(outfit,516,550,270,445),p[rIndex+12],p[rIndex+14],legWidth,true,false);
    limb(ctx,outfit,crop(outfit,228,985,290,438),p[lIndex+14],p[lIndex+16],legWidth*.92,true,false);
    limb(ctx,outfit,crop(outfit,528,985,275,438),p[rIndex+14],p[rIndex+16],legWidth*.92,true,false);
    const sleeveWidth=currentSw*.31;
    limb(ctx,outfit,crop(outfit,175,172,175,188),l,p[lIndex+2],sleeveWidth,false,true);
    limb(ctx,outfit,crop(outfit,6,172,175,188),p[lIndex+2],p[lIndex+4],sleeveWidth*.94,false,true);
    limb(ctx,outfit,crop(outfit,674,172,175,188),right,p[rIndex+2],sleeveWidth,false,false);
    limb(ctx,outfit,crop(outfit,845,172,179,188),p[rIndex+2],p[rIndex+4],sleeveWidth*.94,false,false);
    const topL=shift(shift(l,u,-currentSw*.09),down,currentSw*.045),topR=shift(shift(right,u,currentSw*.09),down,currentSw*.045);
    const lowerL=shift(shift(hipL || shift(l,down,currentSw*1.12),u,-currentSw*.12),down,currentSw*.18);
    const lowerR=shift(shift(hipR || shift(right,down,currentSw*1.12),u,currentSw*.12),down,currentSw*.18);
    quad(ctx,outfit,crop(outfit,302,118,420,474),[topL,topR,lowerR,lowerL]);
    const label=String(o.role == null?'':o.role).match(/\d+/);
    if (label) {
      ctx.save();ctx.translate(hipMid.x,hipMid.y);ctx.fillStyle='#6e231ddd';ctx.strokeStyle='#efcf8c';ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(-15,-10,30,20,7);ctx.fill();ctx.stroke();ctx.fillStyle='#fff3d8';ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label[0].slice(0,2),0,.5);ctx.restore();
    }
    ctx.restore();
    }
    if (headWidth>18) {
      ctx.save();ctx.translate(f.x,centerY);ctx.rotate(f.roll);
      ctx.drawImage(asset.head,-headWidth/2,-headHeight/2,headWidth,headHeight);ctx.restore();
    }
    ctx.restore();
    return {ready:true,visible:true,costume:asset.id,body:bodyVisible,source:measured?'face':'pose',head:{x:f.x,y:centerY,width:headWidth,height:headHeight,roll:f.roll,top:centerY-rotatedHeight/2,bottom:headBottom,forehead,headroom},face:{x:faceX,y:(forehead+faceBottom)/2,width:faceMaxX-faceMinX,top:forehead,bottom:faceBottom}};
  }
  window.drawDancerLion=drawDancerLion;
  window.LionFilter={sets,reset:()=>cache.clear(),draw:drawDancerLion,
    hasMeasuredTorso:(lm,r)=>!!lm&&measuredTorso(lm,lm.map(p=>mapPoint(p,r)))};
})();
