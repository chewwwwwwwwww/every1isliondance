const $=id=>document.getElementById(id),canvas=$('art'),ctx=canvas.getContext('2d'),video=$('video');
const W=1000,H=700,RED='#ad2926',GOLD='#e9bd73',PAPER='#f6ecd8',INK='#29241e';
const COLORS=['#BB3427','#426B58','#785193'],INKS=['#f9daa0','#eed3a3','#ffd89b'];
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
function costumeOrder(seed){const order=[0,1,2];let r=seed>>>0;for(let i=order.length-1;i>0;i--){r^=r<<13;r^=r>>>17;r^=r<<5;const j=(r>>>0)%(i+1);[order[i],order[j]]=[order[j],order[i]];}return order;}
const SECTIONS=['A falling dot','Sweep, then sink','A long downward line','A short diagonal','The upper line','The left of the box','Across, then down','Close the little box','The field’s left side','Across, then down','Across the field','Down the center','The final shared line'];
const CUES=['Lean to one side, then lower diagonally.','Sweep across, then lower toward the other side.','Start tall; lower your body in one long movement.','Make a short, bold diagonal with your body.','Lean from one side to the other.','Lower your body with a slight sideways lean.','Lean across, then lower on that side.','Sweep across to close the box.','Start tall and lower with a slight lean.','Lean across, then sink down on that side.','Sweep your whole body from side to side.','Lower in a long, steady movement.','Sweep across together. One last shared mark.'];
const FLOW={preview:0,countdown:3000,drawing:5000,extension:5000,reset:450,gesture:1000,defaultRange:10000};
const LIB=window.BlessingLibrary;
const S={autoShare:true,autoResultBusy:false,publishBusy:false,publishPromise:null,timelapsePromise:null,recordingFailure:false,choice:'fu',items:[],timelapse:null,timelapseUrl:null,timelapseBusy:false,timelapseAbort:null,videoVariant:'normal',count:2,mode:'body',source:'idle',phase:'intro',round:0,rounds:[],players:[],strokes:[],paused:false,transition:false,showSkeleton:false,started:0,phaseAt:0,lastInfer:0,lastSeen:0,trackingMs:0,record:true,clip:null,clipUrl:null,recipe:null,shared:null,seed:0,run:0,celebrateAt:0,trackingHold:false,phaseMs:0,roundMs:0,drawingMs:FLOW.drawing,deadline:FLOW.drawing,clockAt:0,mediaSync:false,extensions:0};
let worker=null,workerUrl=null,workerBusy=false,stream=null,media=null,qrPromise=null,frameTime=performance.now(),lastVideoTime=-1,pointerDown=false,lastPlayerHtml='',lastPaintAt=0;
const exportCanvas=document.createElement('canvas');exportCanvas.width=720;exportCanvas.height=1280;const eq=exportCanvas.getContext('2d');
const POSE_WORKER="__POSE_WORKER__";
function getChoice(id=S.choice){return LIB.choices.find(c=>c.id===id)||LIB.choices[0];}
function makeItems(choice=getChoice()){
 return choice.chars.flatMap((char,c)=>{const glyph=LIB.glyphs[char];const wholeCharacter=choice.kind==='phrase',groups=wholeCharacter?[{indices:glyph.strokes.map((_,i)=>i),label:char,cue:'Make one flowing interpretation of this character. Keep moving; it does not have to be perfect.'}]:glyph.groups;return groups.map(group=>({...group,c,char,wholeCharacter}));});
}
function itemDuration(item){const strokes=item?.indices?.length||1;return item?.wholeCharacter?(strokes<=4?8000:strokes<=7?10000:12000):(strokes<=2?FLOW.drawing:strokes===3?7000:8000);}
function roundDuration(indices=S.rounds[S.round]||[],items=S.items){return Math.max(FLOW.drawing,...indices.map(i=>itemDuration(items[i])));}
function sessionDuration(rounds=schedule(S.count),items=S.items){return rounds.reduce((total,indices)=>total+FLOW.countdown+roundDuration(indices,items),0)+Math.max(0,rounds.length-1)*FLOW.reset+2700;}
function roundNames(){return [...new Set((S.rounds[S.round]||[]).map(i=>itemAt(i).label))].join(' · ');}
function itemAt(i){return S.items[i]||makeItems()[i]||makeItems()[0];}
const medianPoints=i=>{const item=itemAt(i),glyph=LIB.glyphs[item.char];return item.indices.flatMap((index,j)=>[...(j?[null]:[]),...glyph.medians[index].map(([x,y])=>[x/1024,(900-y)/1024])]);};
S.items=makeItems();
function glyphSlot(c,count,size){if(count===1)return{x:0,y:0,size};const cols=2,gap=size*.045,cell=(size-gap)/2;return{x:(c%cols)*(cell+gap),y:Math.floor(c/cols)*(cell+gap),size:cell};}
function referenceBlessing(q,x,y,size,choice=getChoice(),alpha=.10){for(let c=0;c<choice.chars.length;c++){const slot=glyphSlot(c,choice.chars.length,size),glyph=LIB.glyphs[choice.chars[c]];q.save();q.globalAlpha=alpha;q.translate(x+slot.x,y+slot.y+slot.size*900/1024);q.scale(slot.size/1024,-slot.size/1024);q.fillStyle=GOLD;for(const path of glyph.strokes)q.fill(new Path2D(path));q.restore();}}
function renderPicker(){
 const category=$('phraseTab').getAttribute('aria-pressed')==='true'?'phrase':'character';
 $('blessingGrid').classList.toggle('phrases',category==='phrase');
 $('blessingGrid').innerHTML=LIB.choices.filter(c=>c.kind===category).map(c=>`<button class="blessing-option ${c.kind}" data-blessing="${c.id}" aria-pressed="${S.choice===c.id}" aria-label="${c.text}: ${c.meaning}"><span class="blessing-word" lang="zh-Hans">${c.text}</span><span>${c.meaning}</span><i aria-hidden="true">${S.choice===c.id?'✓':''}</i></button>`).join('');
 const choice=getChoice(),rounds=schedule(S.count),seconds=Math.ceil(sessionDuration(rounds)/1000);
 $('selectedBlessing').textContent=`${choice.text} · ${choice.meaning}`;
 $('durationHint').textContent=`About ${seconds} seconds · ${rounds.length} ${rounds.length===1?'round':'rounds'}`;
 $('choiceHint').textContent=choice.kind==='phrase'?'One flowing interpretation per character. Draw freely; your own marks make the phrase.':`${S.items.length} connected parts. Move freely; you do not need to follow the guide exactly.`;
}
function selectBlessing(id){if(!LIB.choices.some(c=>c.id===id))return;S.choice=id;S.items=makeItems();S.strokes=[];renderPicker();}
function renderProgress(){
 const c=$('liveArtwork'),q=c.getContext('2d'),size=430,x=(c.width-size)/2,y=20;
 q.fillStyle='#721f22';q.fillRect(0,0,c.width,c.height);referenceBlessing(q,x,y,size,getChoice(),.11);
 actualGlyph(q,x,y,size);
 if(S.phase==='drawing'){q.save();q.globalAlpha=.55;for(const p of S.players)if(!p.sealed&&p.hasMoved&&p.points.filter(Boolean).length>1){const i=S.rounds[S.round]?.[p.role];if(i!==undefined)actualGlyph(q,x,y,size,[arrangeStroke(i,p.points,p.role)]);}q.restore();}
 $('artworkWord').textContent=getChoice().text;
 const completed=new Set(S.strokes.map(p=>p.i));$('artworkCount').textContent=`${completed.size} / ${S.items.length} parts`;
}
function bounds(points){const a=points.filter(Boolean);return{minX:Math.min(...a.map(p=>p[0])),maxX:Math.max(...a.map(p=>p[0])),minY:Math.min(...a.map(p=>p[1])),maxY:Math.max(...a.map(p=>p[1]))};}
function guidePoints(i){const p=medianPoints(i),b=bounds(p),w=b.maxX-b.minX,h=b.maxY-b.minY,scale=.76/Math.max(w,h,.01);return p.map(v=>v?[(v[0]-(b.minX+b.maxX)/2)*scale+.5,(v[1]-(b.minY+b.maxY)/2)*scale+.5]:null);}
function strokePath(q,points,x,y,w,h,width,color){q.save();q.lineCap='round';q.lineJoin='round';q.strokeStyle=color;q.lineWidth=width;let drawing=false;q.beginPath();for(const p of points){if(!p){drawing=false;continue;}const px=x+p[0]*w,py=y+p[1]*h;if(!drawing){q.moveTo(px,py);drawing=true;}else q.lineTo(px,py);}q.stroke();q.restore();}
function brush(q,points,x,y,size,width=14,color=GOLD){q.save();const g=q.createLinearGradient(x,y,x+size,y+size);g.addColorStop(0,'#ffe8b1');g.addColorStop(.4,color);g.addColorStop(.7,'#bb8035');g.addColorStop(1,'#ffdfa0');strokePath(q,points,x,y,size,size,width,g);strokePath(q,points,x,y,size,size,Math.max(.8,width*.1),'#fff1c230');q.restore();}
function arrangeStroke(i,raw,role){const p=raw.filter(Boolean),rb=bounds(p),target=bounds(medianPoints(i)),rw=Math.max(rb.maxX-rb.minX,.015),rh=Math.max(rb.maxY-rb.minY,.015);const tw=Math.max(target.maxX-target.minX,.11),th=Math.max(target.maxY-target.minY,.11);const scale=Math.min(tw/rw,th/rh);const rx=(rb.maxX+rb.minX)/2,ry=(rb.maxY+rb.minY)/2,tx=(target.maxX+target.minX)/2,ty=(target.maxY+target.minY)/2;return{i,c:itemAt(i).c,role,p:raw.map(v=>v?[+clamp((v[0]-rx)*scale+tx,-.08,1.08).toFixed(4),+clamp((v[1]-ry)*scale+ty,-.08,1.08).toFixed(4)]:null),width:14+role*1.6};}
function actualGlyph(q,x,y,size,strokes=S.strokes,recipe=null){const choice=recipe?(recipe.v===3?getChoice(recipe.choice):null):getChoice();for(const s of strokes){const slot=choice?glyphSlot(s.c??0,choice.chars.length,size):{x:0,y:0,size};brush(q,s.p,x+slot.x,y+slot.y,slot.size,slot.size*s.width/700);}}
function referenceGlyph(q,x,y,size,alpha=.13){q.save();q.globalAlpha=alpha;q.translate(x,y+size*900/1024);q.scale(size/1024,-size/1024);q.fillStyle=GOLD;for(const path of FU.strokes)q.fill(new Path2D(path));q.restore();}
function schedule(n,itemCount=S.items.length){const rounds=[];for(let offset=0;offset<itemCount;offset+=n){const remaining=Math.min(n,itemCount-offset);rounds.push(Array.from({length:n},(_,role)=>offset+role%remaining));}return rounds;}
function makePlayer(i){return{role:i,lm:null,face:null,cameraPoint:null,capturedAt:0,lastSeen:0,visible:false,base:null,low:null,samples:[],wrist:15,pointer:{x:.5,y:.12},prev:null,points:[],length:0,span:0,bodyMotion:0,lastMoved:0,sealed:false,hasMoved:false,handSince:0,handHeldMs:0,handSamples:0,stillFrames:0,energy:0,raw:null};}
function showPanel(name){$('lobbyPanel').hidden=true;$('lobbyOverlay').hidden=true;$('stage').classList.remove('lobby');$('introPanel').hidden=name!=='intro';$('livePanel').hidden=name!=='live';$('resultPanel').hidden=name!=='result';$('stage').classList.toggle('active',name!=='intro');$('stage').classList.toggle('results',name==='result');$('stage').closest('.experience').classList.toggle('finished',name==='result');$('error').hidden=true;$('flowBanner').hidden=name!=='live';}
function error(text){$('error').textContent=text;$('error').hidden=false;}
function phase(name,title,help,notice){S.phase=name;S.phaseAt=performance.now();S.phaseMs=0;S.clockAt=S.phaseAt;$('phaseLabel').textContent=name==='drawing'?'Your drawing window':name==='ready'?'Learn your next stroke':name==='countdown'?'Get into your starting pose':name==='reset'?'Your marks have joined':name==='lobbyFinding'?'Step 1 · Find every player':name==='lobbyReady'?'Step 2 · Everyone ready':name.startsWith('calibrat')?'Find your face':name==='celebrating'?'Made together':'Your moment';$('liveTitle').innerHTML=title;$('liveHelp').textContent=help;$('liveNotice').textContent=notice;updateUI();}
function remainingMs(){return S.phase==='ready'?Math.max(0,FLOW.preview-S.phaseMs):S.phase==='countdown'?Math.max(0,FLOW.countdown-S.phaseMs):S.phase==='drawing'?Math.max(0,S.deadline-S.roundMs):S.phase==='reset'?Math.max(0,FLOW.reset-S.phaseMs):S.phase==='calibratingLow'?Math.max(0,FLOW.defaultRange-S.phaseMs):0;}
function updateFlowUI(){const active=['ready','countdown','drawing','reset','calibratingLow'].includes(S.phase);$('flowBanner').hidden=!active;const remaining=Math.ceil(remainingMs()/1000);$('flowLabel').textContent=S.paused?'Paused':S.trackingHold?'Waiting for every dancer':S.phase==='ready'?'Look at your stroke':S.phase==='countdown'?'Get ready':S.phase==='drawing'?'Draw your stroke':S.phase==='reset'?'Your marks are joining':'Find your gentle low';$('flowTime').textContent=S.paused||S.trackingHold?'Ⅱ':S.phase==='countdown'?String(Math.max(1,remaining)):S.phase==='reset'?'✓':`${remaining}s`;$('flowBanner').classList.toggle('countdown',S.phase==='countdown');$('flowBanner').classList.toggle('held',S.paused||S.trackingHold);const duration=S.phase==='ready'?FLOW.preview:S.phase==='countdown'?FLOW.countdown:S.phase==='drawing'?(S.extensions?FLOW.extension:S.drawingMs):S.phase==='reset'?FLOW.reset:FLOW.defaultRange;$('flowProgress').style.width=`${clamp(remainingMs()/duration,0,1)*100}%`;$('sealGuide').hidden=S.phase!=='drawing';$('gestureTitle').textContent=S.source==='camera'?'Finish early: both hands above your head':'Your stroke seals when the timer ends';$('gestureCopy').textContent=S.source==='camera'?'The timer finishes your stroke. To finish early, show BOTH hands above your head and hold until your bar fills (about 1 second).':'Drag in each dancer’s lane. Pause between marks if you like; the timer does the sealing.';}
function updateUI(){
 const complete=new Set(S.strokes.map(p=>p.i)),indices=S.rounds[S.round]||[],total=S.items.length;
 $('roundLabel').textContent=`Round ${Math.min(S.round+1,S.rounds.length)} of ${S.rounds.length}`;$('percentLabel').textContent=`${Math.round(complete.size/total*100)}%`;
 $('meter').style.gridTemplateColumns=`repeat(${total},1fr)`;$('meter').innerHTML=Array.from({length:total},(_,i)=>`<i class="${complete.has(i)?'done':indices.includes(i)?'current':''}"></i>`).join('');$('meter').setAttribute('aria-label',`${complete.size} of ${total} parts completed`);
 const playerHtml=S.players.map((p,i)=>{const item=itemAt(indices[i]??0),held=Math.round(clamp((p.handHeldMs||0)/FLOW.gesture,0,p.handSamples>=2?1:.95)*100);return `<div class="player-card"><span class="badge">0${i+1}</span><div><strong>${item.label}</strong><small>${p.sealed?'✓ Your mark is sealed':S.phase==='drawing'?(p.hasMoved?'Keep moving · the timer finishes your mark':item.cue):S.phase==='countdown'?item.cue:S.source==='camera'&&!p.visible?'Step into your numbered lane':`Dancer ${i+1} · ${i===0?'left':i===S.count-1?'right':'middle'} lane`}</small>${S.phase==='drawing'&&S.source==='camera'&&!p.sealed?`<div class="gesture-progress" role="progressbar" aria-label="Dancer ${i+1} hands-above-head hold" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${held}"><span style="width:${held}%"></span></div><small class="gesture-status">${held?`Keep both hands high · ${held}%`:'Hands above head is optional'}</small>`:''}</div><button class="seal" data-seal="${i}" aria-label="Seal dancer ${i+1}’s mark" ${S.phase!=='drawing'||!p.hasMoved||p.sealed||S.paused||S.trackingHold?'disabled':''}>${p.sealed?'✓':'Seal'}</button></div>`;}).join('');
 if(lastPlayerHtml!==playerHtml){lastPlayerHtml=playerHtml;const focus=document.activeElement?.dataset?.seal;$('players').innerHTML=playerHtml;if(focus!==undefined)$('players').querySelector(`[data-seal="${focus}"]`)?.focus({preventScroll:true});}
 updateLobbyUI();$('roundBtn').hidden=true;$('fullscreenPauseBtn').textContent=S.paused?'Resume':'Pause';updateFlowUI();
}
function resetRound(preservePointer=false){for(const p of S.players){p.autoSegment=null;p.points=[];p.prev=null;p.length=0;p.span=0;p.bodyMotion=0;p.lastMoved=performance.now();p.sealed=false;p.hasMoved=false;p.handSince=0;p.handHeldMs=0;p.handSamples=0;p.stillFrames=0;p.origin=p.raw?{...p.raw}:null;if(!preservePointer&&S.source!=='camera'){p.pointer={x:.5,y:.12};resetCameraCursor(p);}}}
function roundReady(){resetRound();S.roundMs=0;S.drawingMs=roundDuration();S.deadline=S.drawingMs;S.extensions=0;phase('countdown','See it.<br>Make it yours.',`${roundNames()}. Look at the bright reference during the countdown. You will have ${S.drawingMs/1000} seconds to make your own flowing version.`,'3… 2… 1… Drawing starts automatically.');$('stageLabel').textContent=`${getChoice().text} · next part starts in 3 seconds`;}
function useDefaultRange(){if(S.phase!=='calibratingLow'||S.paused||S.trackingHold)return;S.players.forEach(p=>{p.low={y:p.base.y+.15};p.samples=[];});roundReady();}
async function beginMediaRound(){const run=S.run;let started=await media?.beginRound();if(started!==false)return started;for(let attempt=0;attempt<2&&started===false;attempt++){if(S.run!==run)return false;$('liveNotice').textContent='Waiting for video recording. Your drawing time is saved.';started=await media?.beginRound();}if(started===false){S.recordingFailure=true;$('liveNotice').textContent='Video recording stopped. Your drawing and red packet will continue.';}return started;}
async function beginRound(){
 if(S.transition||S.paused||S.trackingHold||!['ready','countdown'].includes(S.phase)||S.source==='camera'&&!allVisible())return;
 if(S.launchPending){if(!S.lobby?.allFound(performance.now())){cancelCameraLaunch();return;}S.launchPending=false;setReadiness(false,false);}
 S.transition=true;const run=S.run;resetRound(true);S.roundMs=0;S.drawingMs=roundDuration();S.deadline=S.drawingMs;S.extensions=0;
 const help=`You have ${S.drawingMs/1000} seconds for ${roundNames()}. `;
 phase('drawing','Move freely.<br>Make it yours.',help+(S.source==='camera'?'Move freely; the ink follows your nose (or chosen wrist). The timer finishes each stroke. Both hands above your head is an optional early finish.':'Drag a bold stroke in each lane; it will seal automatically.'),'The timer seals your real movement. Standing still does not finish a stroke.');
 $('stageLabel').textContent=S.count===1?'Your body. Your brush.':`${S.count} dancers · one shared fortune`;
 drawScene(performance.now());renderExport(performance.now());
 await beginMediaRound();if(run!==S.run)return;S.started=performance.now();S.clockAt=S.started;S.transition=false;
 if(S.paused||S.source==='camera'&&!allVisible())await media?.endRound();
}
async function sealPlayer(i){const p=S.players[i];if(!p||p.sealed||S.phase!=='drawing'||!p.hasMoved||S.transition||S.paused||S.trackingHold)return;p.sealed=true;p.handHeldMs=FLOW.gesture;const index=S.rounds[S.round][i];S.strokes.push(arrangeStroke(index,p.points,i));media?.hit(.3);updateUI();if(S.players.every(p=>p.sealed)){S.transition=true;const run=S.run;drawScene(performance.now());renderExport(performance.now());media?.captureFrame();await media?.endRound();if(run!==S.run)return;S.transition=false;if(S.round===S.rounds.length-1){finishDance();return;}phase('reset','Marks joined.','Your next part starts now.','This reset is left out of your highlight.');$('stageLabel').textContent='Marks joined · next stroke coming';}}
function handsAboveHead(p){return p.lm&&p.raw&&good(p.lm[15])&&good(p.lm[16])&&p.lm[15].y<p.raw.noseY-.035&&p.lm[16].y<p.raw.noseY-.035;}
function syncTracking(now){if(S.workerRecovering)return;if(inCameraLobby()||S.launchPending){tickLobby(now);return;}if(S.source!=='camera'||!['ready','countdown','drawing','reset','calibratingUpright','calibratingLow'].includes(S.phase)||S.paused)return;const visible=allVisible();if(!visible&&!S.trackingHold){S.trackingHold=true;S.players.forEach(p=>{p.prev=null;p.handHeldMs=0;p.handSamples=0;p.samples=[];});$('liveNotice').textContent='Everything is paused. Find your numbered lanes; the timer and highlight will wait.';if(S.phase==='drawing'){S.mediaSync=true;const run=S.run;Promise.resolve(media?.endRound()).finally(()=>{if(run===S.run)S.mediaSync=false;});}updateUI();}else if(visible&&S.trackingHold&&!S.mediaSync){if(S.phase==='drawing'){S.mediaSync=true;const run=S.run;Promise.resolve(beginMediaRound()).finally(()=>{if(run!==S.run)return;S.mediaSync=false;if(S.paused||!allVisible()){media?.endRound();return;}S.trackingHold=false;S.clockAt=performance.now();$('liveNotice').textContent='Everyone is back. Continue your marks; your remaining time is saved.';updateUI();});}else{S.trackingHold=false;S.clockAt=now;$('liveNotice').textContent=S.phase.startsWith('calibrating')?'Everyone is back. Hold comfortably for a moment.':'Everyone is back. Your next stroke continues automatically.';updateUI();}}}
function renderResultArtwork(){const c=$('resultArtwork'),q=c.getContext('2d');q.fillStyle='#841f23';q.fillRect(0,0,c.width,c.height);actualGlyph(q,50,30,540,S.recipe.strokes,S.recipe);$('resultBlessing').textContent=getChoice(S.recipe.choice).text;}
async function autoplayHighlight(){const run=S.run,v=$('highlightPreview');if(!v.src||S.phase!=='complete')return;v.muted=$('soundBtn').getAttribute('aria-pressed')!=='true';$('playbackHint').textContent='';try{await v.play();}catch(e){if(run!==S.run)return;v.muted=true;try{await v.play();if(run===S.run){$('soundBtn').setAttribute('aria-pressed','false');$('soundBtn').textContent='Sound off';$('soundBtn').setAttribute('aria-label','Unmute highlight sound');$('playbackHint').textContent='Playing without sound. Tap Sound off to hear your dance.';}}catch(e){if(run===S.run)$('playbackHint').textContent='Tap play to watch your highlight.';}}}
async function prepareResultKeepsake(run){S.autoResultBusy=true;try{if(S.clip){$('shareStatus').textContent=S.autoShare?'Preparing your timelapse and QR keepsake…':'Preparing your timelapse. Your files stay on this device.';await makeTimelapse({select:false});}if(run!==S.run)return;if(S.autoShare){await publish();if(run!==S.run)return;if(!S.shared&&S.posterOnlyAvailable)await publish(false);}else if(!S.timelapseBusy)$('shareStatus').textContent='Your files are ready on this device. Make a QR keepsake when you want to share.';}finally{if(run===S.run)S.autoResultBusy=false;}}
async function finishDance(){
 const run=S.run;S.celebrateAt=performance.now();phase('celebrating','Your blessing,<br>made together.','Your real marks are becoming your keepsake.','One final drum flourish.');$('stageCaption').textContent='Your marks. Your shared blessing.';
 S.recipe={v:3,choice:S.choice,n:S.count,d:new Date().toISOString().slice(0,10),s:S.seed,strokes:S.strokes,demo:S.source==='auto'};
 renderPoster($('posterPreview'),S.recipe);const clip=await media?.finish();if(run!==S.run)return;S.clip=S.recordingFailure?null:clip||null;
 if(S.clip?.blob){S.clipUrl=URL.createObjectURL(S.clip.blob);$('highlightPreview').src=S.clipUrl;$('highlightPreview').hidden=false;$('downloadVideo').hidden=false;$('makeTimelapse').hidden=false;$('videoVersions').hidden=false;$('timelapseHelp').hidden=false;$('nativeShare').hidden=!canShareClip(S.clip);}else{$('highlightPreview').hidden=true;$('downloadVideo').hidden=true;$('makeTimelapse').hidden=true;$('videoVersions').hidden=true;$('timelapseHelp').hidden=true;$('nativeShare').hidden=true;}
 stopCamera();phase('complete','Your blessing,<br>made together.','','');showPanel('result');$('stageLabel').textContent='Every mark belongs to you';$('resultCopy').textContent=S.recipe.demo?'An automated preview. Your own dance will make its own unique marks.':`${getChoice().text} · ${getChoice().meaning}. Made from your actual movements.`;
 renderResultArtwork();$('noVideoNote').hidden=!!S.clip;$('noVideoNote').textContent=S.recordingFailure?'Recording stopped before every part was captured. Your complete red packet is still ready.':S.record?'Video recording was unavailable. Your red packet is ready.':'Your red packet is ready. This dance has no video.';
 sharingOptions();if(S.clip)autoplayHighlight();prepareResultKeepsake(run).catch(e=>{if(run===S.run)$('shareStatus').textContent=`Could not prepare the QR: ${e.message}. Your downloads are still available.`;});
}

function good(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&(p.visibility??1)>.45&&(p.presence??1)>.45;}
function freshness(){return clamp(S.trackingMs*2.5+120,350,650);}
function playerVisible(p,now=performance.now()){return p.visible&&now-p.lastSeen<freshness()&&now-p.capturedAt<freshness();}
function allVisible(){return S.players.every(p=>playerVisible(p));}
function losePlayer(p){p.visible=false;p.cameraPoint=null;p.lm=null;p.face=null;p.raw=null;p.prev=null;p.samples=[];p.handSamples=0;p.handHeldMs=0;resetCameraCursor(p);}
function rawPose(p,lm,face){
 const nose=good(face?.nose)?face.nose:good(lm?.[0])?lm[0]:null;
 if(!nose)return null;
 if(S.mode==='seated'&&!p.base){const l=lm?.[15],r=lm?.[16];p.wrist=good(l)&&(!good(r)||l.y<r.y)?15:16;}
 const tracked=S.mode==='body'?nose:lm?.[p.wrist];if(!good(tracked))return null;
 const shoulders=good(lm?.[11])&&good(lm?.[12]),hips=good(lm?.[23])&&good(lm?.[24]);
 const r=videoRect(),eyeSpan=good(lm?.[2])&&good(lm?.[5])?Math.abs(lm[2].x-lm[5].x)*r.w/r.h:0;
 const headHeight=good(face?.nose)&&Number.isFinite(face.bounds?.height)?face.bounds.height:Math.max(.04,eyeSpan*3.4);
 return{x:tracked.x,y:tracked.y,noseX:nose.x,noseY:nose.y,sx:shoulders?(lm[11].x+lm[12].x)/2:null,sy:shoulders?(lm[11].y+lm[12].y)/2:null,hy:hips?(lm[23].y+lm[24].y)/2:null,fullBody:shoulders&&hips&&LionFilter.hasMeasuredTorso(lm,r),headHeight:clamp(headHeight,.04,.65),source:good(face?.nose)?'face':'pose'};
}
function cameraCursorPosition(p,r=videoRect(),now=performance.now()){
 if(!p.cameraPoint||!playerVisible(p,now))return null;
 return{x:r.x+p.cameraPoint.x*r.w,y:r.y+p.cameraPoint.y*r.h};
}
function handlePoses(poses,time,ms,faces=[],lobbyData={}){
 const capturedAt=Number.isFinite(time)?time:performance.now(),now=performance.now(),r=videoRect();
 S.trackingMs=Number.isFinite(ms)?ms:0;
 for(let i=0;i<S.count;i++){
  const p=S.players[i],lm=poses?.[i]||null;
  const face=faces[i]&&(!Number.isFinite(faces[i].capturedAt)||Math.abs(faces[i].capturedAt-capturedAt)<1)?faces[i]:null;
  const raw=now-capturedAt<=650?rawPose(p,lm,face):null;
  if(!raw){losePlayer(p);continue;}
  if(!playerVisible(p,now)||capturedAt-p.capturedAt>350){p.prev=null;resetCameraCursor(p);}
  p.lm=lm;p.face=good(face?.nose)?face:null;p.raw=raw;p.visible=true;p.lastSeen=now;p.capturedAt=capturedAt;S.lastSeen=now;
  // Video, marker, headgear and recorded ink share the same mirrored camera
  // coordinates. No baseline subtraction, movement gain, lane squeeze or inset.
  p.cameraPoint={x:1-raw.x,y:raw.y};
  sampleCameraCursor(p,p.cameraPoint,capturedAt,now,{width:r.w,height:r.h});
  const finishing=S.phase==='drawing'&&!S.paused&&!S.trackingHold&&!S.transition&&!S.mediaSync&&!S.workerRecovering&&!p.sealed&&p.hasMoved&&handsAboveHead(p);
  if(finishing)p.handSamples++;else{p.handSamples=0;p.handHeldMs=0;}
  if(S.phase==='drawing'&&!S.paused&&!S.trackingHold&&!S.transition&&!S.mediaSync&&!S.workerRecovering&&!p.sealed&&!finishing)recordPoint(p,p.pointer.x*r.w/r.h,p.pointer.y,now);
 }
 $('trackingStatus').textContent=allVisible()?`${S.count} ${S.count===1?'dancer':'dancers'} connected${S.mode==='body'&&S.players.some(p=>!p.raw.fullBody)?' · face view':' · move together'}`:S.mode==='body'?'Find your lane · keep your face visible':'Find your lane · keep your face and chosen hand visible';
 observeLobby(lobbyData,capturedAt,now);
 updateUI();
}
function recordPoint(p,x,y,now){
 if(S.transition||S.mediaSync||S.workerRecovering)return;
 if(p.origin&&p.raw?.fullBody){for(const key of ['sx','sy','hy'])if(!Number.isFinite(p.origin[key])&&Number.isFinite(p.raw[key]))p.origin[key]=p.raw[key];}
 if(!p.prev){if(p.points.length&&p.points.at(-1)!==null)p.points.push(null);p.points.push([x,y]);p.prev=[x,y];p.lastMoved=now;return;}
 const distance=Math.hypot(x-p.prev[0],y-p.prev[1]);p.energy=lerp(p.energy,clamp(distance*16,0,1),.35);
 if(distance>(S.source==='camera'?.0015:.003)){p.stillFrames=0;p.length+=distance;p.lastMoved=now;if(p.points.length<699)p.points.push([+x.toFixed(4),+y.toFixed(4)]);p.prev=[x,y];const b=bounds(p.points);p.span=Math.max(b.maxX-b.minX,b.maxY-b.minY);}else p.stillFrames++;
 if(p.origin&&p.raw){for(const key of ['sx','sy','hy'])if(Number.isFinite(p.raw[key])&&Number.isFinite(p.origin[key]))p.bodyMotion=Math.max(p.bodyMotion,Math.abs(p.raw[key]-p.origin[key])*(key==='sx'?S.count:1));}
 if(S.source==='camera'){
  const size=p.raw?.headHeight||.08;
  p.hasMoved||=p.length>Math.max(.035,size*.35)&&p.span>Math.max(.018,size*.22)&&(S.mode==='seated'||!p.raw?.fullBody||p.bodyMotion>.008);
 }else{const plot=plotRect(p.role),unit=Math.min(1,plot.w/plot.h);p.hasMoved=p.length>.23*unit&&p.span>.15*unit;}
}
function advance(now){const dt=Math.max(0,Math.min(250,now-(S.clockAt||now)));S.clockAt=now;syncTracking(now);if(inCameraLobby()){updateLobbyUI();return;}if(S.paused||S.trackingHold||S.transition||S.mediaSync||S.workerRecovering){S.players.forEach(p=>{p.handHeldMs=0;p.handSamples=0;});updateFlowUI();return;}S.phaseMs+=dt;
 if(S.phase==='calibratingLow'&&S.phaseMs>=FLOW.defaultRange){useDefaultRange();return;}
 if(S.phase==='ready'&&S.phaseMs>=FLOW.preview){phase('countdown','Get ready.<br>Make it yours.','Find your starting pose. Begin moving when the countdown ends.','3… 2… 1… Drawing starts automatically.');return;}
 if(S.phase==='countdown'&&S.phaseMs>=FLOW.countdown){beginRound();return;}
 if(S.phase==='reset'&&S.phaseMs>=FLOW.reset){S.round++;roundReady();return;}
 if(S.phase==='drawing'){S.roundMs+=dt;
  if(S.source==='auto'){const elapsed=S.roundMs;S.players.forEach((p,i)=>{if(p.sealed)return;let segment=0;const g=guidePoints(S.rounds[S.round][i]).flatMap(v=>v?[{v,segment}]:(segment++,[])),t=clamp(elapsed/(S.drawingMs*.84),0,1)*(g.length-1),k=Math.min(g.length-2,Math.floor(t)),f=t-k,a=g[k],b=g[k+1],part=f>=1?b:a;if(p.autoSegment!==part.segment){p.prev=null;p.autoSegment=part.segment;}const x=a.segment===b.segment?lerp(a.v[0],b.v[0],f):part.v[0],y=a.segment===b.segment?lerp(a.v[1],b.v[1],f):part.v[1],plot=plotRect(i),side=Math.min(plot.w,plot.h);p.pointer={x:((plot.w-side)/2+x*side)/plot.w,y:((plot.h-side)/2+y*side)/plot.h};recordPoint(p,p.pointer.x*plot.w/plot.h,p.pointer.y,now);p.visible=true;});}
  if(S.source==='camera'){S.players.forEach((p,i)=>{if(p.sealed)return;if(p.hasMoved&&handsAboveHead(p)){p.handHeldMs=(p.handHeldMs||0)+dt;if(p.handHeldMs>=FLOW.gesture&&p.handSamples>=2)sealPlayer(i);}else{p.handHeldMs=0;p.handSamples=0;}});}
  if(S.roundMs>=S.deadline&&!S.transition){S.players.forEach((p,i)=>{if(!p.sealed&&p.hasMoved)sealPlayer(i);});if(!S.players.every(p=>p.sealed)){S.deadline+=FLOW.extension;S.extensions++;const waiting=S.players.filter(p=>!p.sealed).map(p=>`0${p.role+1}`).join(', ');$('liveNotice').textContent=`5 more seconds for dancer${waiting.includes(',')?'s':''} ${waiting}. Make one broad movement. We’ll seal your real stroke when the timer ends.`;}}
 }
 if(now-(S.lastFlowUI||0)>100){S.lastFlowUI=now;updateUI();}else updateFlowUI();}
/* Worker recovery preserves the camera, marks, calibration and round timers. */
let workerReady = false, workerSentAt = 0, workerDelegate = 'CPU';
let workerGeneration = 0, workerInitCancel = null;
let workerRecoveryPromise = null, workerRecoveryUsed = false, workerRecoveryRun = -1;

function poseWorkerProgress(text, stage = 'loading') {
  S.workerStatus = text;
  const startCopy = S.phase==='loading' ? $('startBtn')?.querySelector('span') : null;
  if(startCopy)startCopy.textContent=text;
  const status = $('trackingStatus');
  if (status) status.textContent = text;
  const copy = $('loadingCopy') || $('loadingStatus');
  if (copy) copy.textContent = text;
  const card = $('loadingCard');
  if (card) card.hidden = stage === 'ready' || stage === 'failed';
}

function disposePoseWorker() {
  ++workerGeneration;
  const cancel = workerInitCancel;
  workerInitCancel = null;
  cancel?.(); // Settle an interrupted start() immediately, rather than after 90 s.
  worker?.terminate(); worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = null; workerBusy = false; workerReady = false; workerSentAt = 0;
  lastVideoTime = -1;
}

async function initWorker({ delegate, recovering = false, run = S.run, timeoutMs = 90000 } = {}) {
  if (run !== S.run || S.source !== 'camera') throw new DOMException('Tracking start cancelled.', 'AbortError');
  disposePoseWorker();
  if (!recovering) {
    workerRecoveryUsed = false; workerRecoveryRun = run;
    S.workerRecovering = false;
  }
  const generation = ++workerGeneration;
  const url = URL.createObjectURL(new Blob([POSE_WORKER], { type: 'text/javascript' }));
  const instance = new Worker(url); // Classic: MediaPipe WASM requires importScripts.
  worker = instance; workerUrl = url;
  workerDelegate = delegate || 'AUTO';
  S.workerInterval = 33;
  poseWorkerProgress(recovering ? 'Reconnecting body tracking…' : 'Loading body tracking…');

  await new Promise((resolve, reject) => {
    let settled = false, dead = false;
    const current = () => !dead && worker === instance && workerGeneration === generation
      && S.run === run && S.source === 'camera';
    const cleanup = () => {
      clearTimeout(timer);
      if (workerInitCancel === cancel) workerInitCancel = null;
    };
    const fail = cause => {
      if (settled) return;
      settled = true; dead = true; cleanup();
      instance.terminate(); URL.revokeObjectURL(url);
      if (worker === instance) {
        worker = null; workerUrl = null; workerReady = false; workerBusy = false; workerSentAt = 0;
      }
      reject(cause instanceof Error || cause instanceof DOMException ? cause : new Error(String(cause)));
    };
    const cancel = () => fail(new DOMException('Tracking start cancelled.', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Pose model timed out. Check your connection and try again.')), timeoutMs);
    workerInitCancel = cancel;

    instance.onmessage = ({ data }) => {
      if (!current()) return;
      if (data.type === 'progress') {
        const cpu = data.delegate === 'CPU';
        poseWorkerProgress(`${recovering ? 'Reconnecting' : 'Preparing'} dancer ${data.lane + 1} of ${S.count}…`);
      } else if (data.type === 'ready') {
        if (settled) return;
        settled = true; cleanup(); workerReady = true;
        const delegates = data.delegates || [delegate || 'CPU'];
        workerDelegate = delegates.every(d => d === 'CPU') ? 'CPU' : 'GPU';
        S.workerDelegates = delegates; S.workerRenderer = data.renderer || '';
        S.workerInputHeight = data.inputHeight; S.workerError = null;
        if(inCameraLobby()||S.launchPending||S.phase==='loading')setReadiness(false,true);
        poseWorkerProgress(recovering ? 'Tracking restored. Find your numbered lanes.' : 'Tracking ready. Finding your dancers.', 'ready');
        resolve(data);
      } else if (data.type === 'gestureLoading') {
        S.gestureStatus='loading';updateUI();
      } else if (data.type === 'gestureReady') {
        S.gestureStatus='ready';updateUI();
      } else if (data.type === 'gestureUnavailable') {
        S.gestureStatus='unavailable';S.gestureError=data.message;updateUI();
      } else if (data.type === 'gestureState' && data.readinessEpoch === S.readinessEpoch) {
        if(['ready','loading','unavailable'].includes(data.state))S.gestureStatus=data.state;
        updateUI();
      } else if (data.type === 'error') {
        if (!settled) fail(new Error(data.message));
        else void recoverPoseWorker(data.message);
      } else if (data.type === 'poses' && workerReady) {
        workerBusy = false; workerSentAt = 0;
        S.workerInterval = Math.max(33, Math.min(120, Number(data.suggestedInterval) || 33));
        S.workerInputHeight = data.inputHeight;
        if (data.delegates) {
          S.workerDelegates = data.delegates;
          workerDelegate = data.delegates.every(d => d === 'CPU') ? 'CPU' : 'GPU';
        }
        if (!S.workerRecovering) handlePoses(data.poses, data.capturedAt ?? data.time, data.ms, data.faces, data);
      } else if (data.type === 'frameError') {
        workerBusy = false; workerSentAt = 0; S.workerError = data.message;
        poseWorkerProgress('Tracking is reconnecting…');
        void recoverPoseWorker(data.message);
      }
    };
    instance.onerror = event => {
      if (!current()) return;
      const cause = new Error(event.message || 'The tracking worker stopped.');
      if (!settled) fail(cause);
      else void recoverPoseWorker(cause.message);
    };
    try { instance.postMessage({ type: 'init', lanes: S.count, ...(delegate ? { delegate } : {}) }); }
    catch (cause) { fail(cause); }
  });
}

function freezePoseTracking(message) {
  if(inCameraLobby()||S.launchPending)openCameraLobby();
  S.trackingHold = !inCameraLobby(); S.clockAt = performance.now();
  for (const p of S.players) {
    p.visible = false; p.prev = null; p.samples = [];
    p.handHeldMs = 0; p.handSamples = 0;
    if (typeof resetCameraCursor === 'function') resetCameraCursor(p);
  }
  const notice = $('liveNotice');
  if (notice) notice.textContent = message;
  updateUI();
}

function failPoseTracking(cause) {
  const message = cause?.message || String(cause || 'The tracking worker stopped.');
  disposePoseWorker();
  S.workerRecovering = false; S.mediaSync = false; S.workerError = message;
  freezePoseTracking('Your marks and remaining time are saved. Tracking needs a fresh start.');
  poseWorkerProgress('Tracking could not reconnect. Start over or try free ink with a cursor.', 'failed');
  error(`Tracking could not reconnect. ${message} Your marks are still here. Use Start over to retry, or try free ink with a cursor.`);
}

function recoverPoseWorker(reason = 'Body tracking stopped responding.') {
  if (workerRecoveryPromise) return workerRecoveryPromise;
  if (S.source !== 'camera' || !stream || ['intro', 'loading', 'celebrating', 'complete'].includes(S.phase)) return Promise.resolve(false);
  if (workerRecoveryRun !== S.run) { workerRecoveryRun = S.run; workerRecoveryUsed = false; }
  if (workerRecoveryUsed) {
    // Keep the camera open and marks intact for the existing Start over action.
    // A second failure is reported once; pumpPoseWorker cannot submit more work.
    void Promise.resolve(media?.endRound()).catch(() => {});
    failPoseTracking(new Error(reason));
    return Promise.resolve(false);
  }
  workerRecoveryUsed = true;
  const run = S.run, activeStream = stream, activeMedia = media;
  S.workerRecovering = true; S.mediaSync = true;
  freezePoseTracking('Tracking is reconnecting. Your timer, music and highlight are paused; your marks are saved.');
  // MotionMedia's pause API is endRound(); it preserves the music offset.
  // Terminate the stuck worker immediately while media acknowledges its pause.
  const pause = Promise.resolve(activeMedia?.endRound()).catch(() => false);
  disposePoseWorker();
  const task = (async () => {
    try {
      await Promise.all([pause, initWorker({ delegate: 'CPU', recovering: true, run })]);
      if (run !== S.run || S.source !== 'camera' || stream !== activeStream) return false;
      S.workerRecovering = false; S.mediaSync = false; S.clockAt = performance.now();
      if(inCameraLobby())openCameraLobby();
      // Do NOT resume media or clear trackingHold here. Existing syncTracking()
      // resumes only after all dancers produce fresh valid poses again.
      poseWorkerProgress('Tracking restored. Find your numbered lanes.', 'ready');
      const notice = $('liveNotice');
      if (notice) notice.textContent = 'Tracking restored. Return to your lanes; your marks and remaining time are saved.';
      updateUI();
      return true;
    } catch (cause) {
      if (run === S.run && S.source === 'camera' && stream === activeStream) failPoseTracking(cause);
      return false;
    } finally {
      if (workerRecoveryPromise === task) workerRecoveryPromise = null;
    }
  })();
  workerRecoveryPromise = task;
  return task;
}

function pumpPoseWorker(now) {
  if (S.source !== 'camera') return;
  if (workerBusy && workerSentAt && now - workerSentAt > 7000) {
    void recoverPoseWorker('Body tracking stopped responding for more than seven seconds.');
    return;
  }
  if (!workerReady || S.workerRecovering || !stream || !worker || workerBusy || S.paused
      || video.readyState < 2 || video.currentTime === lastVideoTime
      || now - S.lastInfer < (S.workerInterval || 33)) return;
  const instance = worker, run = S.run, generation = workerGeneration;
  const capturedAt = performance.now(); // Before createImageBitmap, not after it resolves.
  workerBusy = true; workerSentAt = capturedAt; S.lastInfer = capturedAt;
  lastVideoTime = video.currentTime;
  createImageBitmap(video).then(bitmap => {
    if (worker !== instance || workerGeneration !== generation || S.run !== run
        || S.source !== 'camera' || !workerReady || S.workerRecovering) {
      bitmap.close(); return;
    }
    try { instance.postMessage({ type: 'frame', bitmap, time: capturedAt, captureEpoch: performance.timeOrigin + capturedAt }, [bitmap]); }
    catch (cause) {
      bitmap.close(); workerBusy = false; workerSentAt = 0;
      void recoverPoseWorker(cause.message);
    }
  }).catch(cause => {
    if (worker === instance && workerGeneration === generation && S.run === run) {
      workerBusy = false; workerSentAt = 0; S.workerError = cause.message;
      poseWorkerProgress('Waiting for a camera frame…', 'ready');
    }
  });
}


async function start(source){const run=++S.run;const cleanup=teardown(false);S.source=source;S.phase='loading';S.round=0;S.items=makeItems();S.rounds=schedule(S.count);S.players=Array.from({length:S.count},(_,i)=>makePlayer(i));S.lobby=new PlayerLobby.Controller(S.count);S.launchPending=false;S.lobbyHtml='';S.readyData=[];S.startGesture='hand';S.gestureStatus='loading';S.strokes=[];S.seed=crypto.getRandomValues(new Uint32Array(1))[0];S.costumes=costumeOrder(S.seed);S.players.forEach(p=>p.costume=S.costumes[p.role]);S.record=$('recordToggle').checked;S.autoShare=$('autoShareToggle').checked;S.autoResultBusy=false;S.publishBusy=false;S.publishPromise=null;S.timelapsePromise=null;S.recordingFailure=false;S.shared=null;S.clip=null;S.timelapse=null;S.videoVariant='normal';S.timelapseBusy=false;S.recipe=null;$('makeTimelapse').disabled=false;$('timelapseHelp').textContent='Your normal video stays yours. The timelapse keeps the percussion at its original tempo.';$('downloadVideo').innerHTML='<span>Download normal highlight</span><span aria-hidden="true">↓</span>';$('makeTimelapse').innerHTML='<span>Make 3× timelapse</span><span>↗</span>';$('timelapseTab').disabled=true;$('normalTab').setAttribute('aria-pressed','true');$('timelapseTab').setAttribute('aria-pressed','false');S.posterOnlyAvailable=false;$('posterOnlyBtn').hidden=true;$('posterOnlyBtn').disabled=false;S.paused=false;S.transition=false;S.trackingHold=false;S.workerRecovering=false;S.phaseMs=0;S.roundMs=0;S.clockAt=performance.now();S.mediaSync=false;$('qrRow').hidden=true;$('qr').replaceChildren();$('playbackHint').textContent='';$('noVideoNote').hidden=true;$('publishBtn').disabled=false;$('publishBtn').innerHTML='<span>Share by QR</span><span>↗</span>';$('previewBtn').textContent=source==='auto'?'Stop preview':'▷ Preview';media=new MotionMedia({canvas:exportCanvas,audioUrl:'/soundtrack.mp3',onStatus:status=>{if(status.warning)$('shareStatus').textContent=status.warning;}});media.muteLive($('soundBtn').getAttribute('aria-pressed')!=='true');const audioTask=media.init();setLoading(true);$('pauseBtn').textContent='Pause';$('startBtn').disabled=true;$('startBtn').innerHTML='<span>Waking our lions…</span><i class="loading"></i>';try{
  await cleanup;if(run!==S.run)return;
  if(source==='camera'){
   if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs HTTPS. Try free ink with a cursor.');
   const results=await Promise.allSettled([initWorker(),navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}})]);
   const acquired=results[1].status==='fulfilled'?results[1].value:null;if(run!==S.run){acquired?.getTracks().forEach(t=>t.stop());return;}if(results.some(r=>r.status==='rejected')){acquired?.getTracks().forEach(t=>t.stop());throw results.find(r=>r.status==='rejected').reason;}stream=acquired;video.srcObject=stream;await video.play();
  }
  await audioTask;if(run!==S.run)return;if(S.record)await media.prepare();if(run!==S.run)return;showPanel('live');$('trackingStatus').textContent=source==='auto'?'Automated preview':source==='cursor'?'Cursor ready':'Finding your dancers';if(source==='camera')openCameraLobby();else{S.players.forEach(p=>{p.visible=true;});roundReady();}$('stage').focus({preventScroll:true});
 }catch(e){if(run!==S.run)return;stopCamera();worker?.terminate();S.source='idle';S.phase='intro';showPanel('intro');error(e.name==='NotAllowedError'?'Camera permission was declined. Allow it in your browser or try the cursor.':e.name==='NotReadableError'?'The camera is busy. Close other camera apps and try again.':`Could not start tracking. ${e.message||'Check your connection and try again.'}`);}finally{if(run!==S.run)return;setLoading(false);$('startBtn').disabled=false;$('startBtn').innerHTML='<span>Open camera lobby</span><span>↗</span>';}}
function stopCamera(){S.launchPending=false;S.workerRecovering=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;disposePoseWorker();window.LionFilter?.reset();}
function setLoading(loading){for(const el of document.querySelectorAll('#countButtons button,#blessingGrid button,#characterTab,#phraseTab,#bodyBtn,#seatBtn,#cursorBtn,#previewBtn'))el.disabled=loading;}
async function teardown(clear=true){S.timelapseAbort?.abort();S.timelapseAbort=null;if(S.timelapseUrl){URL.revokeObjectURL(S.timelapseUrl);S.timelapseUrl=null;}const oldMedia=media;media=null;stopCamera();if(S.clipUrl){URL.revokeObjectURL(S.clipUrl);S.clipUrl=null;}$('highlightPreview').pause();$('highlightPreview').removeAttribute('src');$('highlightPreview').load();$('qr').replaceChildren();if(clear){S.source='idle';S.phase='intro';showPanel('intro');$('stageLabel').textContent='A shared ritual of good fortune';$('stageCaption').textContent='Different hands. One shared blessing.';$('previewBtn').textContent='▷ Preview';}await oldMedia?.cancel();}
function videoRect(){const vw=video.videoWidth||1280,vh=video.videoHeight||720;const scale=Math.min(952/vw,450/vh);return{x:(W-vw*scale)/2,y:99+(450-vh*scale)/2,w:vw*scale,h:vh*scale,headRoom:72};}
function laneRect(i,r=videoRect()){return{x:r.x+i*r.w/S.count,y:r.y,w:r.w/S.count,h:r.h};}
function plotRect(i,r=videoRect()){const lane=laneRect(i,r);return{x:lane.x+lane.w*.14,y:lane.y+lane.h*.14,w:lane.w*.72,h:lane.h*.75};}
const connections=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function skeleton(q,lm,r){q.save();q.strokeStyle='#fff1bc';q.lineWidth=1.3;for(const [a,b]of connections){if(!good(lm[a])||!good(lm[b]))continue;q.beginPath();q.moveTo(r.x+(1-lm[a].x)*r.w,r.y+lm[a].y*r.h);q.lineTo(r.x+(1-lm[b].x)*r.w,r.y+lm[b].y*r.h);q.stroke();}q.restore();}
function drawStrokeGuide(q,index,plot,preview){const side=Math.min(plot.w,plot.h);plot={x:plot.x+(plot.w-side)/2,y:plot.y+(plot.h-side)/2,w:side,h:side};const guide=guidePoints(index);q.save();q.lineWidth=1;q.fillStyle=preview?'#35151bc2':'#36131930';q.beginPath();q.roundRect(plot.x-12,plot.y-12,plot.w+24,plot.h+24,12);q.fill();strokePath(q,guide,plot.x,plot.y,plot.w,plot.h,preview?24:17,'#35151be6');q.setLineDash(preview?[24,12]:[16,13]);strokePath(q,guide,plot.x,plot.y,plot.w,plot.h,preview?13:8,preview?'#fff1be':'#fff0b5c7');q.setLineDash([]);const a=guide[0],b=guide.at(-1);q.fillStyle='#fff8de';q.beginPath();q.arc(plot.x+a[0]*plot.w,plot.y+a[1]*plot.h,preview?9:6,0,Math.PI*2);q.fill();if(preview){q.font='bold 11px "DM Sans",sans-serif';q.textAlign='center';q.fillText('START',plot.x+a[0]*plot.w,plot.y+a[1]*plot.h-18);q.fillText('END',plot.x+b[0]*plot.w,plot.y+b[1]*plot.h+25);}q.restore();}
function drawScene(now){ctx.clearRect(0,0,W,H);const bg=ctx.createRadialGradient(480,270,40,480,300,730);bg.addColorStop(0,'#bd3b2c');bg.addColorStop(.7,RED);bg.addColorStop(1,'#831e21');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#e9bd7326';ctx.lineWidth=1;ctx.strokeRect(19,19,962,662);ctx.save();ctx.globalAlpha=.09;ctx.strokeStyle=GOLD;for(const rad of[180,260,340]){ctx.beginPath();ctx.arc(615,310,rad,0,Math.PI*2);ctx.stroke();}ctx.restore();const time=reduced?0:now/1000;
 if(S.phase==='intro'||S.phase==='loading'){referenceBlessing(ctx,425,158,320,getChoice(),.18);drawLion(ctx,{x:748,y:452,scale:1.12,time,energy:.15,crouch:.02,tilt:Math.sin(time)*.035,leap:0});ctx.save();ctx.fillStyle='#f6ecd869';ctx.font='10px "DM Sans",sans-serif';ctx.textAlign='right';ctx.fillText('YOUR MOVEMENT BECOMES YOUR MARK.',942,615);ctx.restore();return;}
 const r=videoRect();ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,8);ctx.clip();ctx.fillStyle='#521e20';ctx.fillRect(r.x,r.y,r.w,r.h);if(S.source==='camera'&&video.readyState>=2){ctx.save();ctx.translate(r.x+r.w,r.y);ctx.scale(-1,1);ctx.drawImage(video,0,0,r.w,r.h);ctx.restore();ctx.fillStyle='#2e111a28';ctx.fillRect(r.x,r.y,r.w,r.h);}else{ctx.fillStyle='#792624';ctx.fillRect(r.x,r.y,r.w,r.h);for(let i=0;i<S.count;i++){const l=laneRect(i,r);drawLion(ctx,{x:l.x+l.w*.5,y:l.y+l.h*.59,scale:S.count===1?1.3:S.count===2?.9:.62,time,energy:S.players[i]?.energy??.2,tilt:Math.sin(time+i)*.05,crouch:.1,leap:0});}}
 ctx.restore();
 for(let i=0;i<S.count;i++){const p=S.players[i];if(S.source==='camera'&&(p.lm||p.face)&&playerVisible(p,now))drawDancerLion(ctx,{landmarks:p.lm,face:p.face,videoRect:r,time,energy:p.energy,role:`0${i+1}`,color:COLORS[i],costume:p.costume||0});}
 ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,8);ctx.clip();
 for(let i=0;i<S.count;i++){
  const p=S.players[i],l=laneRect(i,r),plot=plotRect(i,r);
  const cursor=S.source==='camera'?cameraCursorPosition(p,r,now):{x:plot.x+p.pointer.x*plot.w,y:plot.y+p.pointer.y*plot.h};
  if(i){ctx.strokeStyle=inCameraLobby()?'#fff0ba':'#f6ecd84a';ctx.lineWidth=inCameraLobby()?3:1;ctx.setLineDash(inCameraLobby()?[]:[5,7]);ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(l.x,l.y+l.h);ctx.stroke();ctx.setLineDash([]);}
  if(S.source==='camera'&&p.lm&&playerVisible(p,now)&&S.showSkeleton)skeleton(ctx,p.lm,r);
  if(['drawing','ready','countdown','reset'].includes(S.phase)){
   const index=S.rounds[S.round]?.[i]??0,preview=['ready','countdown'].includes(S.phase);
   if(S.phase!=='reset'){
    const size=Math.min(100,l.w*.27);
    drawStrokeGuide(ctx,index,preview?plot:{x:l.x+20,y:l.y+48,w:size,h:size},preview);
   }
   if(S.source==='camera')strokePath(ctx,p.points,r.x,r.y,r.h,r.h,8,INKS[i]);
   else strokePath(ctx,p.points,plot.x,plot.y,plot.h,plot.h,8,INKS[i]);
   ctx.fillStyle=p.sealed?'#fce2a3':'#fff2d4';ctx.font=`bold ${S.count===3?12:14}px "DM Sans",sans-serif`;ctx.textAlign='center';
   ctx.fillText(p.sealed?'✓ MARK SEALED':`DANCER 0${i+1} · PART ${String(index+1).padStart(2,'0')}`,l.x+l.w/2,l.y+26);
   if(S.phase==='drawing'&&!p.sealed){
    const cx=l.x+l.w*.5,cy=l.y+l.h-28,held=clamp((p.handHeldMs||0)/FLOW.gesture,0,p.handSamples>=2?1:.95);
    ctx.fillStyle='#38151bcf';ctx.beginPath();ctx.roundRect(cx-l.w*.4,cy-18,l.w*.8,34,6);ctx.fill();ctx.fillStyle='#fff1c9';ctx.font=`${S.count===3?10:12}px "DM Sans",sans-serif`;
    ctx.fillText(S.source==='camera'?(held?'KEEP BOTH HANDS ABOVE HEAD':p.hasMoved?'TIMER FINISHES YOUR STROKE':'MAKE ONE BROAD MOVEMENT'):'DRAG YOUR STROKE · TIMER SEALS IT',cx,cy+2);
    if(S.source==='camera'&&held&&cursor){ctx.strokeStyle='#ffe59e';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cursor.x,cursor.y,19,-Math.PI/2,-Math.PI/2+held*Math.PI*2);ctx.stroke();}
   }
  }
  if(inCameraLobby()){
   const e=S.lobby?.entries[i];ctx.strokeStyle=e?.found?'#f9daa0':'#f6ecd891';ctx.lineWidth=2;ctx.strokeRect(l.x+5,l.y+5,l.w-10,l.h-10);
   ctx.fillStyle='#3b141bcc';ctx.fillRect(l.x+8,l.y+8,l.w-16,42);ctx.fillStyle='#fff0d3';ctx.font='bold 16px \"DM Sans\",sans-serif';ctx.textAlign='center';ctx.fillText(`PLAYER 0${i+1} · ${e?.found?'FOUND':'YOUR LANE'}`,l.x+l.w/2,l.y+35);
  }
  if(S.phase.startsWith('calibrating')){
   ctx.fillStyle='#fff0d3';ctx.font='14px "DM Sans",sans-serif';ctx.textAlign='center';ctx.fillText(`DANCER 0${i+1} · FACE THE CAMERA`,l.x+l.w/2,l.y+28);
  }
  if(cursor&&!p.sealed&&['drawing','ready','countdown','calibratingUpright','lobbyFinding','lobbyReady'].includes(S.phase)){
   ctx.save();ctx.strokeStyle='#401519';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cursor.x,cursor.y,7,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#fff1bd';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff1bd';ctx.beginPath();ctx.arc(cursor.x,cursor.y,2,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 }

 ctx.restore();
 if(S.phase==='reset'||S.paused||S.trackingHold){ctx.fillStyle='#3a141aa8';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle=PAPER;ctx.textAlign='center';ctx.font='38px Newsreader,Georgia,serif';ctx.fillText(S.paused?'Take your time.':S.trackingHold?'Find your lanes.':'Your marks are joining.',W/2,r.y+r.h*.47);ctx.font='12px "DM Sans",sans-serif';ctx.fillText(S.paused||S.trackingHold?'Timer and highlight paused. Your marks are saved.':'Relax. The next stroke starts automatically.',W/2,r.y+r.h*.47+30);}
 actualGlyph(ctx,788,550,135);ctx.fillStyle=GOLD;ctx.textAlign='left';ctx.font='24px Newsreader,Georgia,serif';ctx.fillText(S.count===1?'Fortune, in your own hand.':'Different hands. One fortune.',62,594);ctx.font='10px "DM Sans",sans-serif';ctx.fillStyle='#f1d4b5';ctx.fillText(S.phase==='drawing'?'MOVE FREELY · THE TIMER FINISHES YOUR STROKE':S.phase==='reset'?'MARKS JOINED · NEXT STROKE COMING':inCameraLobby()?'ONE PLAYER PER LANE · THE DANCE WAITS FOR EVERYONE':S.phase.startsWith('calibrating')?'FIND YOUR FACE · THE GOLD CURSOR FOLLOWS YOUR NOSE':S.phase==='countdown'?'GET READY · DRAW WHEN THE COUNTDOWN ENDS':'WATCH YOUR STROKE · YOUR OWN MARK COMES NEXT',63,619);
 if(S.phase==='celebrating'){ctx.save();ctx.fillStyle='#ffdf9822';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.textAlign='center';ctx.fillStyle=GOLD;ctx.font='16px \"DM Sans\",sans-serif';ctx.fillText('FORTUNE, MADE TOGETHER',W/2,r.y+30);ctx.restore();}
 if(S.phase==='complete'){ctx.fillStyle='#641c20e8';ctx.fillRect(r.x,r.y,r.w,r.h);actualGlyph(ctx,W/2-160,r.y+28,320);ctx.textAlign='center';ctx.fillStyle=GOLD;ctx.font='31px Newsreader,Georgia,serif';ctx.fillText('Fortune, made together.',W/2,r.y+r.h-40);if(!reduced&&S.phase==='celebrating'){const t=(now-S.celebrateAt)/1000;for(let k=0;k<65;k++){const a=k*2.399,rad=30+t*(30+k%7*8);ctx.globalAlpha=clamp(1-t/3,0,1);ctx.fillRect(W/2+Math.cos(a)*rad,r.y+r.h/2+Math.sin(a)*rad,2,5);}ctx.globalAlpha=1;}}
}
function renderExport(now){eq.fillStyle=RED;eq.fillRect(0,0,720,1280);eq.strokeStyle='#e9bd7380';eq.lineWidth=1;eq.strokeRect(24,24,672,1232);eq.strokeRect(30,30,660,1220);eq.textAlign='center';eq.fillStyle=GOLD;eq.font='15px "DM Sans",sans-serif';eq.fillText('LION DANCE MOTION INK',360,82);eq.font='47px Newsreader,Georgia,serif';eq.fillText('Fortune, made together.',360,148);const r=videoRect(),top=Math.max(24,r.y-r.headRoom),sourceH=r.y+r.h-top,scale=Math.min(640/r.w,435/sourceH);eq.drawImage(canvas,r.x,top,r.w,sourceH,360-r.w*scale/2,210,r.w*scale,sourceH*scale);eq.font='13px "DM Sans",sans-serif';eq.fillStyle='#f5ddbd';eq.fillText(`${S.count} ${S.count===1?'DANCER':'DANCERS'} · ONE SHARED BLESSING`,360,692);actualGlyph(eq,140,736,440);if(S.phase==='drawing'){for(const p of S.players)if(!p.sealed&&p.hasMoved&&p.points.filter(Boolean).length>1){const i=S.rounds[S.round]?.[p.role];if(i!==undefined)actualGlyph(eq,140,736,440,[arrangeStroke(i,p.points,p.role)]);}}eq.font='15px Newsreader,Georgia,serif';eq.fillText('Your marks. Your moment.',360,1195);eq.font='10px "DM Sans",sans-serif';eq.fillText('COMMON GROUND 2026',360,1231);}
function animate(now){
 frameTime=now;
 S.players.forEach(p=>{if(S.source==='camera'&&p.visible&&!playerVisible(p,now))losePlayer(p);});
 pumpPoseWorker(now);
 advance(now);
 if(now-lastPaintAt>=1000/30){
  lastPaintAt=now;
  drawScene(now);if(!$('livePanel').hidden)renderProgress();
  if(S.record&&['drawing','celebrating'].includes(S.phase)&&!S.paused&&!S.trackingHold){renderExport(now);media?.captureFrame();}
 }
 requestAnimationFrame(animate);
}
function renderPoster(c,recipe,qrImage=null){
 const q=c.getContext('2d'),w=c.width,h=c.height;q.fillStyle=RED;q.fillRect(0,0,w,h);q.strokeStyle='#e9bd7380';q.lineWidth=1.3;q.strokeRect(36,36,w-72,h-72);q.strokeRect(44,44,w-88,h-88);q.save();q.strokeStyle='#e9bd7320';q.lineWidth=1;for(const r of[230,315,390]){q.beginPath();q.arc(w/2,h*.46,r,0,Math.PI*2);q.stroke();}q.restore();
 q.textAlign='center';q.fillStyle=GOLD;q.font='13px "DM Sans",sans-serif';q.fillText('LION DANCE MOTION INK',w/2,104);q.font='42px Newsreader,Georgia,serif';q.fillText(recipe.n===1?'A blessing, in your own hand.':'A blessing, made together.',w/2,170);
 if(recipe.v===3){q.font='22px serif';q.fillText(getChoice(recipe.choice).text,w/2,222);actualGlyph(q,135,257,630,recipe.strokes,recipe);}else if(recipe.v===2)actualGlyph(q,135,257,630,recipe.strokes,recipe);else referenceGlyph(q,135,257,630,1);
 q.font='27px Newsreader,Georgia,serif';q.fillText(recipe.v===3?getChoice(recipe.choice).meaning:'May good fortune follow your every move.',w/2,995,740);q.font='12px "DM Sans",sans-serif';q.fillText(`${recipe.n||1} ${(recipe.n||1)===1?'DANCER':'DANCERS'} · YOUR REAL MARKS · ONE SHARED BLESSING`,w/2,1044);q.font='10px "DM Sans",sans-serif';q.fillText(`${recipe.d} · COMMON GROUND 2026 · ${recipe.s.toString(16).toUpperCase()}`,w/2,1080);
 if(qrImage){q.fillStyle='#fff';q.fillRect(w-194,h-194,144,144);q.imageSmoothingEnabled=false;q.drawImage(qrImage,w-178,h-178,112,112);q.imageSmoothingEnabled=true;q.textAlign='left';q.fillStyle=GOLD;q.font='12px "DM Sans",sans-serif';q.fillText('Scan for your dance.',59,1133);q.font='10px "DM Sans",sans-serif';q.fillText('Your marks. Your moment.',59,1154);}else{q.font='12px Newsreader,Georgia,serif';q.fillText('Your marks. Your moment.',w/2,1139);}
}
function canvasBlob(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Poster export failed')),'image/png'));}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function clipFile(clip=S.clip){return new File([clip.blob],`fortune-${S.seed.toString(16)}${clip===S.timelapse?'-timelapse':''}.${clip.mime.includes('mp4')?'mp4':'webm'}`,{type:clip.mime.split(';')[0]});}
function selectedClip(){return S.videoVariant==='timelapse'&&S.timelapse?S.timelapse:S.clip;}
function selectVideo(variant){
 if(variant==='timelapse'&&!S.timelapse)return;S.videoVariant=variant;
 $('highlightPreview').pause();$('highlightPreview').src=variant==='timelapse'?S.timelapseUrl:S.clipUrl;
 $('normalTab').setAttribute('aria-pressed',variant==='normal');$('timelapseTab').setAttribute('aria-pressed',variant==='timelapse');
 $('downloadVideo').innerHTML=`<span>Download ${variant==='timelapse'?'3× timelapse':'normal highlight'}</span><span aria-hidden="true">↓</span>`;
 $('nativeShare').hidden=!canShareClip(selectedClip());autoplayHighlight();
}
function makeTimelapse({select=true}={}){
 if(!S.clip)return Promise.resolve(null);if(S.timelapseBusy)return S.timelapsePromise;if(S.timelapse){if(select)selectVideo('timelapse');return Promise.resolve(S.timelapse);}
 const run=S.run,encoder=media,abort=new AbortController();S.timelapseAbort=abort;S.timelapseBusy=true;
 $('makeTimelapse').disabled=true;$('publishBtn').disabled=true;$('posterOnlyBtn').disabled=true;
 $('makeTimelapse').innerHTML='<span>Making timelapse… 0%</span><i class="loading"></i>';$('timelapseTab').textContent='3× timelapse · preparing';
 $('timelapseHelp').textContent='Preparing every frame of your short film. Your normal highlight is ready to watch.';
 const job=(async()=>{try{
  const result=await encoder.makeTimelapse(S.clip,{speed:3,signal:abort.signal,onProgress:({progress})=>{if(run===S.run){$('makeTimelapse').innerHTML=`<span>Making timelapse… ${Math.round(progress*100)}%</span><i class="loading"></i>`;$('timelapseTab').textContent=`3× timelapse · ${Math.round(progress*100)}%`;}}});
  if(run!==S.run)return null;S.timelapse=result;S.timelapseUrl=URL.createObjectURL(result.blob);$('timelapseTab').disabled=false;$('timelapseTab').textContent='3× timelapse';
  $('makeTimelapse').hidden=true;if(select)selectVideo('timelapse');$('timelapseHelp').textContent='Both versions are ready. The percussion keeps its original tempo.';
  if(S.shared)$('shareStatus').textContent='Your existing QR contains its original versions. Remove it and share again to add the timelapse.';
  return result;
 }catch(e){if(run!==S.run||e.name==='AbortError')return null;$('makeTimelapse').hidden=false;$('makeTimelapse').innerHTML='<span>Retry 3× timelapse</span><span>↗</span>';$('timelapseTab').textContent='3× timelapse · unavailable';$('timelapseHelp').textContent=`Timelapse could not be made: ${e.message}. Your normal video remains available.`;return null;
 }finally{if(run===S.run){S.timelapseBusy=false;S.timelapseAbort=null;S.timelapsePromise=null;$('makeTimelapse').disabled=false;$('posterOnlyBtn').disabled=false;sharingOptions();}}})();S.timelapsePromise=job;return job;
}

function canShareClip(clip){try{return !!navigator.canShare?.({files:[clipFile(clip)]});}catch(e){return false;}}
async function qrImage(url,isCurrent=()=>true){if(!qrPromise)qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.onload=resolve;s.onerror=()=>{qrPromise=null;reject(new Error('QR library could not load'));};document.head.append(s);});await qrPromise;if(!isCurrent())throw new DOMException('This dance was restarted','AbortError');const box=$('qr');box.replaceChildren();new QRCode(box,{text:url,width:224,height:224,colorDark:INK,colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});const image=box.querySelector('canvas');if(!image)throw new Error('QR generation failed');image.setAttribute('aria-label','QR code to open this keepsake');box.querySelector('img')?.setAttribute('alt','QR code to open this keepsake');return image;}
function sharingOptions(){const large=[S.clip,S.timelapse].some(clip=>clip?.blob?.size>24*1024*1024);$('posterOnlyBtn').hidden=!!S.shared||!(large||S.posterOnlyAvailable);$('posterOnlyBtn').disabled=S.timelapseBusy||S.publishBusy;$('publishBtn').disabled=S.timelapseBusy||S.publishBusy||(!S.shared&&large);}
function publish(includeVideo=true){
 if(S.publishBusy)return S.publishPromise;if(!S.recipe||S.shared||S.timelapseBusy)return Promise.resolve(null);
 if(includeVideo&&[S.clip,S.timelapse].some(clip=>clip?.blob?.size>24*1024*1024)){S.posterOnlyAvailable=true;sharingOptions();$('shareStatus').textContent='A video is too large to upload. Download your videos here, or share the red packet only.';return Promise.resolve(null);}
 S.publishBusy=true;const run=S.run,recipe=S.recipe,normalFile=S.clip?clipFile():null,timelapseFile=S.timelapse?clipFile(S.timelapse):null;const btn=$('publishBtn'),fallback=$('posterOnlyBtn');btn.disabled=true;fallback.disabled=true;$('makeTimelapse').disabled=true;
 const hasVideo=includeVideo&&!!S.clip?.blob,hasTimelapse=hasVideo&&!!S.timelapse?.blob;
 $('shareStatus').textContent=hasTimelapse?'Uploading your red packet and both videos…':hasVideo?'Uploading your red packet and highlight…':'Uploading your red packet only…';
 const job=(async()=>{try{
  const poster=await canvasBlob($('posterPreview'));if(run!==S.run)return;const body=new FormData();body.append('poster',poster,'fortune.png');if(hasVideo)body.append('highlight',normalFile);if(hasTimelapse)body.append('timelapse',timelapseFile);body.append('recipe',JSON.stringify(recipe));
  const response=await fetch('/api/keepsakes',{method:'POST',headers:{'X-Keepsake-Share':'1'},body});const data=await response.json();
  if(run!==S.run){if(response.ok)await fetch(`/api/keepsakes/${data.id}`,{method:'DELETE',headers:{'X-Keepsake-Delete-Token':data.deleteToken}});return;}
  if(!response.ok){if(response.status===413&&hasVideo)S.posterOnlyAvailable=true;throw new Error(data.message||data.error||'Upload failed');}S.shared=data;try{localStorage.setItem('motion-ink-delete:'+data.id,data.deleteToken);}catch(e){}
  const url=new URL(`/#keepsake=${data.id}`,location.origin).href;S.shared.absoluteUrl=url;
  const contents=data.timelapseUrl?'red packet, normal highlight and timelapse':data.videoUrl?'red packet and highlight':'red packet';
  $('qrContent').textContent=`Scan for your ${contents}.`;
  try{const qr=await qrImage(url,()=>run===S.run);if(run!==S.run)return;renderPoster($('posterPreview'),recipe,qr);$('qrRow').hidden=false;$('shareStatus').textContent=`Your ${contents} ${data.videoUrl?'are':'is'} shared. Anyone with the link can view ${data.videoUrl?'them':'it'}.`;}
  catch(e){if(run!==S.run)return;$('shareStatus').textContent=`Your ${contents} ${data.videoUrl?'are':'is'} shared. QR could not load; use Copy keepsake link.`;$('qrRow').hidden=false;}
  $('publishBtn').innerHTML='<span>Shared · open keepsake</span><span>↗</span>';
 }catch(e){if(run!==S.run)return;$('shareStatus').textContent=S.posterOnlyAvailable?`Could not upload the videos: ${e.message}. Share the red packet only, or download your videos here.`:`Could not share: ${e.message}. Your local downloads are still available.`;}
 finally{if(run===S.run){S.publishBusy=false;S.publishPromise=null;fallback.disabled=false;$('makeTimelapse').disabled=false;sharingOptions();}}})();S.publishPromise=job;return job;
}
async function removeKeepsake(){
 const run=S.run,shared=S.shared;if(!shared)return;
 try{
  const response=await fetch(`/api/keepsakes/${shared.id}`,{method:'DELETE',headers:{'X-Keepsake-Delete-Token':shared.deleteToken}});
  if(response.ok){try{localStorage.removeItem('motion-ink-delete:'+shared.id);}catch(e){}}
  if(run!==S.run||S.shared?.id!==shared.id)return;
  if(response.ok){S.shared=null;S.posterOnlyAvailable=false;$('qrRow').hidden=true;sharingOptions();$('shareStatus').textContent='Shared keepsake removed. Your local files are still available.';$('publishBtn').innerHTML='<span>Share by QR</span><span>↗</span>';renderPoster($('posterPreview'),S.recipe);}
  else $('shareStatus').textContent='Could not remove the keepsake. Try again.';
 }catch(e){if(run===S.run&&S.shared?.id===shared.id)$('shareStatus').textContent='Could not remove the keepsake. Try again.';}
}

function validRecipe(r){
 if(!r||![2,3].includes(r.v)||!Number.isInteger(r.n)||r.n<1||r.n>3||!Number.isInteger(r.s)||!Array.isArray(r.strokes)||r.strokes.length>39)return false;
 const choice=r.v===3?LIB.choices.find(c=>c.id===r.choice):null;if(r.v===3&&!choice)return false;const items=choice?makeItems(choice):null;
 return r.strokes.every(s=>Number.isInteger(s.i)&&s.i>=0&&s.i<(items?items.length:13)&&(!items||Number.isInteger(s.c)&&s.c===items[s.i].c)&&Number.isInteger(s.role)&&s.role>=0&&s.role<r.n&&Number.isFinite(s.width)&&s.width>=1&&s.width<=40&&Array.isArray(s.p)&&s.p.length>=2&&s.p.length<=701&&s.p.every(p=>p===null||Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=-.1&&n<=1.1)));
}
function keepsakeMediaUrl(value,id,variant){if(typeof value!=='string'||!['highlight','timelapse'].includes(variant))return value;try{const url=new URL(value,location.origin),base=`/media/${id}/${variant}`;if(['https:','http:'].includes(url.protocol)&&!url.search&&!url.hash&&[`${base}.mp4`,`${base}.webm`].includes(url.pathname))return url.pathname;}catch(e){}return value;}
async function keepsakeRoute(){if(location.hash.startsWith('#keepsake=')){const id=location.hash.slice(10);$('app').hidden=true;$('keepsake').hidden=false;try{if(!/^[A-Za-z0-9_-]{16,64}$/.test(id))throw new Error('Invalid keepsake link');const response=await fetch(`/api/keepsakes/${id}`);const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'This keepsake is unavailable');if(!validRecipe(data.recipe))throw new Error('The artwork data is incomplete');data.videoUrl=keepsakeMediaUrl(data.videoUrl,id,'highlight');data.timelapseUrl=keepsakeMediaUrl(data.timelapseUrl,id,'timelapse');renderPoster($('phonePoster'),data.recipe);let phoneQr=null;qrImage(location.href).then(q=>{phoneQr=q;renderPoster($('phonePoster'),data.recipe,q);}).catch(()=>{});document.fonts.ready.then(()=>renderPoster($('phonePoster'),data.recipe,phoneQr));$('phoneDownload').onclick=async()=>downloadBlob(await canvasBlob($('phonePoster')),'fortune.png');let deleteKey=null;try{deleteKey=localStorage.getItem('motion-ink-delete:'+id);}catch(e){}if(deleteKey){const b=document.createElement('button');b.className='text-button';b.textContent='Remove this shared keepsake';b.onclick=async()=>{const r=await fetch(`/api/keepsakes/${id}`,{method:'DELETE',headers:{'X-Keepsake-Delete-Token':deleteKey}});if(r.ok){localStorage.removeItem('motion-ink-delete:'+id);location.reload();}else $('keepsakeStatus').textContent='Could not remove the keepsake. Try again.';};$('keepsakeStatus').replaceChildren(b);}if(data.videoUrl){
 let phoneVariant='normal';const videoUrl=()=>phoneVariant==='timelapse'?data.timelapseUrl:data.videoUrl;
 const selectPhone=variant=>{if(variant==='timelapse'&&!data.timelapseUrl)return;phoneVariant=variant;$('phoneVideo').pause();$('phoneVideo').src=videoUrl();$('phoneVideo').hidden=false;$('phoneNormalTab').setAttribute('aria-pressed',variant==='normal');$('phoneTimelapseTab').setAttribute('aria-pressed',variant==='timelapse');const a=$('phoneVideoDownload');a.href=videoUrl()+'?download=1';a.download=`fortune${variant==='timelapse'?'-timelapse':''}.${videoUrl().endsWith('.mp4')?'mp4':'webm'}`;a.textContent=`Download ${variant==='timelapse'?'3× timelapse':'normal highlight'} ↓`;a.hidden=false;};
 selectPhone('normal');$('phoneVersions').hidden=!data.timelapseUrl;$('phoneVideoHelp').hidden=!data.timelapseUrl;$('phoneNormalTab').onclick=()=>selectPhone('normal');$('phoneTimelapseTab').onclick=()=>selectPhone('timelapse');
 $('phoneShare').hidden=!navigator.share;$('phoneShare').onclick=async()=>{try{const r=await fetch(videoUrl()),blob=await r.blob(),file=new File([blob],`fortune${phoneVariant==='timelapse'?'-timelapse':''}.${videoUrl().endsWith('.mp4')?'mp4':'webm'}`,{type:blob.type});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Fortune, made together'});else await navigator.share({url:location.href,title:'Fortune, made together'});}catch(e){if(e.name!=='AbortError')$('keepsakeStatus').textContent='Sharing is unavailable here. Use Download highlight.';}};
 }else $('keepsakeCopy').textContent='A blessing made from your own movement. This keepsake contains a red packet.';return true;}catch(e){$('keepsakeCopy').textContent=e.message;$('phonePoster').hidden=true;$('phoneDownload').hidden=true;return true;}}
 if(location.hash.startsWith('#poster=')){try{const value=location.hash.slice(8);if(value.length>1000)throw new Error();const r=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));if(r.v!==1||!Number.isInteger(r.s)||!/^[0-9-]{10}$/.test(r.d))throw new Error();$('app').hidden=true;$('keepsake').hidden=false;renderPoster($('phonePoster'),r);$('keepsakeCopy').textContent='A fortune from the original Motion Ink edition.';$('phoneDownload').onclick=async()=>downloadBlob(await canvasBlob($('phonePoster')),'fortune.png');return true;}catch(e){error('This poster link is incomplete. Make a fresh fortune.');}}
 return false;}
function updateFullscreenUI(){const active=document.fullscreenElement===$('stage'),button=$('fullBtn');button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Exit fullscreen':'Enter stage fullscreen');button.title=active?'Exit fullscreen (Esc)':'Enter stage fullscreen';button.textContent=active?'↙':'⛶';}
async function exitStageFullscreen(){if(document.fullscreenElement===$('stage')){try{await document.exitFullscreen();}catch(e){/* The exit button and browser Escape remain available. */}}}
async function toggleStageFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen({navigationUI:'hide'});}catch(e){error('Fullscreen is unavailable in this browser.');}}
document.addEventListener('fullscreenchange',updateFullscreenUI);
$('fullscreenPauseBtn').onclick=()=>$('pauseBtn').click();
$('fullscreenResetBtn').onclick=async()=>{await exitStageFullscreen();$('resetBtn').click();};
function pointer(e){if(S.source!=='cursor'||S.phase!=='drawing'||S.paused||S.trackingHold||S.transition||S.mediaSync||S.workerRecovering||!pointerDown)return;const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;for(let i=0;i<S.count;i++){const plot=plotRect(i),p=S.players[i];if(x<plot.x-15||x>plot.x+plot.w+15||y<plot.y-15||y>plot.y+plot.h+15||p.sealed)continue;p.pointer={x:clamp((x-plot.x)/plot.w,.03,.97),y:clamp((y-plot.y)/plot.h,.03,.97)};recordPoint(p,p.pointer.x*plot.w/plot.h,p.pointer.y,performance.now());updateUI();break;}}
canvas.addEventListener('pointerdown',e=>{pointerDown=true;canvas.setPointerCapture(e.pointerId);pointer(e);});canvas.addEventListener('pointermove',pointer);function liftPointer(){pointerDown=false;S.players.forEach(p=>p.prev=null);}
canvas.addEventListener('pointerup',liftPointer);canvas.addEventListener('pointercancel',liftPointer);
$('blessingGrid').addEventListener('click',e=>{const b=e.target.closest('[data-blessing]');if(b)selectBlessing(b.dataset.blessing);});
function setCategory(kind){$('characterTab').setAttribute('aria-pressed',kind==='character');$('phraseTab').setAttribute('aria-pressed',kind==='phrase');renderPicker();}
$('characterTab').onclick=()=>setCategory('character');$('phraseTab').onclick=()=>setCategory('phrase');
$('normalTab').onclick=()=>selectVideo('normal');$('timelapseTab').onclick=()=>selectVideo('timelapse');$('makeTimelapse').onclick=makeTimelapse;
$('countButtons').addEventListener('click',e=>{const btn=e.target.closest('[data-count]');if(!btn)return;S.count=Number(btn.dataset.count);for(const b of $('countButtons').querySelectorAll('button'))b.setAttribute('aria-pressed',b===btn);renderPicker();});
function setMode(mode){S.mode=mode;$('bodyBtn').setAttribute('aria-pressed',mode==='body');$('seatBtn').setAttribute('aria-pressed',mode==='seated');$('modeHelp').textContent=mode==='body'?'Lean and lower comfortably. Your nose moves the ink. Close-up: move your head. Step back for the full costume.':'Raise one hand to choose it, then move that hand comfortably. Your wrist moves the ink.';}
$('bodyBtn').onclick=()=>setMode('body');$('seatBtn').onclick=()=>setMode('seated');$('startBtn').onclick=()=>start('camera');$('cursorBtn').onclick=()=>start('cursor');$('previewBtn').onclick=()=>S.source==='auto'&&S.phase!=='intro'?(S.run++,teardown()):start('auto');$('roundBtn').onclick=useDefaultRange;$('players').addEventListener('click',e=>{const b=e.target.closest('[data-seal]');if(b)sealPlayer(Number(b.dataset.seal));});$('skeletonBtn').onclick=()=>{S.showSkeleton=!S.showSkeleton;$('skeletonBtn').setAttribute('aria-pressed',S.showSkeleton);$('skeletonBtn').textContent=S.showSkeleton?'Hide tracking':'Show tracking';};$('pauseBtn').onclick=async()=>{if(S.transition||inCameraLobby())return;if(S.launchPending){cancelCameraLaunch();$('liveNotice').textContent='Countdown stopped. Find your lanes and give the readiness gesture together when you are ready.';return;}S.paused=!S.paused;S.clockAt=performance.now();S.players.forEach(p=>{p.prev=null;p.handHeldMs=0;p.handSamples=0;p.samples=[];});$('pauseBtn').textContent=S.paused?'Resume':'Pause';updateUI();if(S.paused)await media?.endRound();else if(S.phase==='drawing'&&(S.source!=='camera'||allVisible())&&!S.trackingHold){S.mediaSync=true;const run=S.run;await beginMediaRound();if(run===S.run){S.mediaSync=false;S.clockAt=performance.now();}}};$('resetBtn').onclick=()=>{S.run++;teardown();};$('againBtn').onclick=async()=>{S.run++;await exitStageFullscreen();teardown();};$('soundBtn').onclick=()=>{const mute=$('soundBtn').getAttribute('aria-pressed')==='true';$('soundBtn').setAttribute('aria-pressed',!mute);$('soundBtn').textContent=mute?'Sound off':'Sound on';$('soundBtn').setAttribute('aria-label',mute?'Unmute live sound':'Mute live sound');media?.muteLive(mute);$('highlightPreview').muted=mute;if(S.phase==='complete'&&!mute){$('playbackHint').textContent='';autoplayHighlight();}};$('drumBtn').onclick=()=>media?.hit();document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('button,input,a,dialog')){e.preventDefault();media?.hit();}});$('fullBtn').onclick=toggleStageFullscreen;$('aboutBtn').onclick=()=>$('about').showModal();$('closeAbout').onclick=()=>$('about').close();$('downloadPoster').onclick=async()=>{try{downloadBlob(await canvasBlob($('posterPreview')),`fortune-${S.seed.toString(16)}.png`);}catch(e){error(e.message);}};$('downloadVideo').onclick=()=>selectedClip()&&downloadBlob(selectedClip().blob,clipFile(selectedClip()).name);$('nativeShare').onclick=async()=>{try{await navigator.share({files:[clipFile(selectedClip())],title:'Fortune, made together'});}catch(e){if(e.name!=='AbortError')$('shareStatus').textContent='Sharing is unavailable here. Use Download highlight.';}};$('posterOnlyBtn').onclick=()=>publish(false);$('publishBtn').onclick=()=>S.shared?window.open(S.shared.absoluteUrl,'_blank','noopener'):publish();$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(S.shared.absoluteUrl);$('copyBtn').textContent='Link copied';}catch(e){$('shareStatus').textContent=S.shared.absoluteUrl;}};$('deleteBtn').onclick=removeKeepsake;window.addEventListener('pagehide',()=>{S.timelapseAbort?.abort();stopCamera();media?.cancel();});
$('gestureRetryBtn').onclick=retryReadiness;$('gestureFallbackBtn').onclick=chooseReadinessFallback;
window.MotionInk={PlayerLobby,observeLobby,tickLobby,setReadiness,openCameraLobby,gestureAccepted,retryReadiness,chooseReadinessFallback,start,selectVideo,makeTimelapse,selectedClip,keepsakeMediaUrl,getChoice,makeItems,selectBlessing,schedule,itemDuration,roundDuration,sessionDuration,renderResultArtwork,prepareResultKeepsake,autoplayHighlight,renderProgress,validRecipe,state:S,timings:FLOW,advance,roundReady,makePlayer,handsAboveHead,guidePoints,arrangeStroke,renderPoster,handlePoses,recordPoint,beginRound,sealPlayer,phase,allVisible,cameraCursorPosition,videoRect,playerVisible,rawPose,exportCanvas};
renderPicker();
keepsakeRoute().then(route=>{if(!route)requestAnimationFrame(animate);});
