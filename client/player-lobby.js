/* A camera lobby counts distinct, fresh noses, never drawing wrists or timers. */
(function(root){
 'use strict';
 const finite=v=>Number.isFinite(v);
 class Controller {
  constructor(count,{stableMs=1250,minFrames=4,maxAge=650}={}){
   this.count=count;this.stableMs=stableMs;this.minFrames=minFrames;this.maxAge=maxAge;
   this.entries=Array.from({length:count},()=>this.empty());
  }
  empty(reason='Step into your lane'){return{seen:false,found:false,reason,anchor:null,since:0,lastAt:-Infinity,frames:0,progress:0};}
  reset(){this.entries=this.entries.map(()=>this.empty());}
  observe(presence,capturedAt,now,{aspect=4/3}={}){
   if(!finite(capturedAt)||capturedAt>now+50||now-capturedAt>this.maxAge){this.tick(now);return this.entries;}
   const candidates=Array.from({length:this.count},(_,i)=>{
    const p=presence?.[i],a=p?.anchor,x=a?1-a.x:NaN,margin=.012/this.count;
    if(!p?.seen||p.distinct!==true||!a||![a.x,a.y].every(finite)||a.y<0||a.y>1)return{reason:p?.reason||'Face the camera in your lane'};
    if(x<i/this.count+margin||x>(i+1)/this.count-margin)return{reason:'Move toward the middle of your lane'};
    return{anchor:{...a},reason:''};
   });
   for(let i=0;i<this.count;i++)for(let j=i+1;j<this.count;j++){
    const a=candidates[i].anchor,b=candidates[j].anchor;if(!a||!b)continue;
    const distance=Math.hypot((a.x-b.x)*aspect,a.y-b.y),minSeparation=Math.max(.06,Math.min(a.headHeight||.08,b.headHeight||.08)*.55);
    if(distance<minSeparation){candidates[i].reason=candidates[j].reason='One different person in each lane';candidates[i].duplicate=candidates[j].duplicate=true;}
   }
   this.entries=this.entries.map((old,i)=>{
    if(capturedAt<=old.lastAt)return old;
    const c=candidates[i];if(!c.anchor||c.duplicate)return{...this.empty(c.reason),lastAt:capturedAt};
    const a=c.anchor,jumped=old.anchor&&Math.hypot((a.x-old.anchor.x)*aspect,a.y-old.anchor.y)>Math.max(.18,(old.anchor.headHeight||.08)*.85);
    const continuous=old.seen&&capturedAt-old.lastAt<=this.maxAge&&!jumped;
    const since=continuous?old.since:capturedAt,frames=continuous?old.frames+1:1,held=Math.max(0,capturedAt-since);
    const found=frames>=this.minFrames&&held>=this.stableMs;
    return{seen:true,found,anchor:a,since,lastAt:capturedAt,frames,progress:found?1:Math.min(.96,held/this.stableMs),reason:found?'Player found':jumped?'Hold your place for a moment':'Recognizing you…'};
   });
   this.tick(now);return this.entries;
  }
  tick(now){this.entries=this.entries.map(e=>now-e.lastAt>this.maxAge?{...this.empty('Face the camera in your lane'),lastAt:e.lastAt}:e);return this.entries;}
  allFound(now){this.tick(now);return this.entries.length===this.count&&this.entries.every(e=>e.found);}
 }
 root.PlayerLobby={Controller};
})(typeof window==='object'?window:globalThis);
