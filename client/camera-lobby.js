/* Camera startup is a two-step consent gate. It runs only before the first mark. */
function inCameraLobby(){return S.source==='camera'&&['lobbyFinding','lobbyReady'].includes(S.phase);}
function setReadiness(enabled,preload=true,retry=false){
 S.readinessEpoch=(S.readinessEpoch||0)+1;S.gestureEnabled=enabled;S.gestureEnabledAt=performance.now();S.readyData=[];
 S.fallbackHolds=Array.from({length:S.count},()=>null);
 worker?.postMessage({type:'readiness',enabled:enabled&&S.startGesture!=='hands',preload,epoch:S.readinessEpoch,retry});
}
function openCameraLobby({reset=true}={}){
 if(reset||!S.lobby)S.lobby=new PlayerLobby.Controller(S.count);
 S.launchPending=false;S.paused=false;$('pauseBtn').textContent='Pause';S.trackingHold=false;S.transition=false;S.phaseMs=0;
 setReadiness(false,true);
 phase('lobbyFinding','Find your<br>own lane.',`One different person in each numbered lane. Face the camera and hold your place for a moment. We will wait for all ${S.count===1?'of you':S.count+' players'}.`,'The dance waits for everyone. No countdown starts from faces alone.');
 $('stageLabel').textContent=`Camera lobby · ${S.count} ${S.count===1?'player':'players'} wanted`;
}
function cancelCameraLaunch(){
 if(!inCameraLobby()&&!S.launchPending)return;
 openCameraLobby();$('liveNotice').textContent='A player left their lane. Find everyone again, then give the readiness gesture together.';
}
function fallbackReadiness(time,now){
 return S.players.map((p,i)=>{
  const valid=playerVisible(p,now)&&handsAboveHead(p),old=S.fallbackHolds[i];
  if(!valid){S.fallbackHolds[i]=null;return{thumbsUp:false,ready:false,progress:0,sampledAt:time};}
  if(old&&time<=old.time)return old.result;
  const continuous=old&&time-old.time<=650,start=continuous?old.start:time,samples=continuous?old.samples+1:1,heldMs=time-start;
  const result={thumbsUp:true,ready:samples>=5&&heldMs>=1600,progress:Math.min(1,heldMs/1600),heldMs,samples,score:1,sampledAt:time,capturedAt:time};
  S.fallbackHolds[i]={time,start,samples,result};return result;
 });
}
function observeLobby(data,time,now=performance.now()){
 if(!inCameraLobby()&&!S.launchPending)return;
 S.lobby?.observe(data.lobbyPresence,time,now,{aspect:(video.videoWidth||1280)/(video.videoHeight||720)});
 if(inCameraLobby()&&S.phase==='lobbyReady'&&data.readinessEpoch===S.readinessEpoch){
  S.readyData=S.startGesture==='hands'?fallbackReadiness(time,now):(data.readiness||[]);
 }
 tickLobby(now);
}
function gestureAccepted(entry,now){
 const at=entry?.sampledAt;
 return !!entry?.ready&&entry.thumbsUp===true&&entry.score>=.8&&entry.samples>=4&&entry.heldMs>=(S.startGesture==='hands'?1600:1200)
  &&Number.isFinite(at)&&at>=S.gestureEnabledAt&&at<=now+50&&now-at<=650;
}
function tickLobby(now=performance.now()){
 if(!inCameraLobby()&&!S.launchPending)return;
 const found=!!S.lobby?.allFound(now);
 if(S.launchPending){if(!found||!allVisible())cancelCameraLaunch();return;}
 if(S.phase==='lobbyReady'&&!found){openCameraLobby({reset:false});return;}
 if(S.phase==='lobbyFinding'&&found){
  setReadiness(true,true);
  phase('lobbyReady','All here.<br>Thumbs up.',S.startGesture==='hands'?'Everyone: lift BOTH hands above your head and hold until your lane says Ready.':'Everyone: hold ONE thumb up beside your face, pointing up with your fingers folded, until your lane says Ready.','Only when every player is ready will the 3… 2… 1… countdown begin.');
  $('stageLabel').textContent=`Camera lobby · all ${S.count} ${S.count===1?'player':'players'} found`;
 }
 if(S.phase==='lobbyReady'&&found&&allVisible()&&!S.paused&&!S.workerRecovering
  &&(S.startGesture==='hands'||S.gestureStatus==='ready')&&S.readyData?.length===S.count&&S.readyData.every(e=>gestureAccepted(e,now))){
  S.players.forEach(p=>{p.base={...p.raw};p.samples=[];});
  S.launchPending=true;setReadiness(false,true);roundReady();
 }
}
function updateLobbyUI(){
 const lobby=inCameraLobby();$('lobbyPanel').hidden=!lobby;$('lobbyOverlay').hidden=!lobby;$('stage').classList.toggle('lobby',lobby);
 for(const el of [$('liveArtwork').closest('.live-artwork'),$('meter'),$('roundLabel').parentElement,$('players')])el.hidden=lobby;
 $('pauseBtn').hidden=lobby;$('fullscreenPauseBtn').disabled=lobby;$('sealGuide').hidden=lobby||S.phase!=='drawing';
 if(!lobby)return;
 const ready=S.phase==='lobbyReady',hands=S.startGesture==='hands',unavailable=S.gestureStatus==='unavailable'&&!hands;
 const title=!ready?'1 · Find your numbered lane':unavailable?'Thumb detector needs a retry':hands?'2 · Both hands up together':'2 · Thumbs up together';
 const help=!ready?'Face the camera. One person per lane. We wait for everyone.':unavailable?'The dance stays here. Retry thumbs-up, or ask the host to select the two-hands gesture.':hands?'Lift BOTH hands above your head. Hold until every lane says Ready.':'Hold ONE thumb up beside your face, fingers folded. Keep it up until every lane says Ready.';
 $('lobbyStageTitle').textContent=title;$('lobbyStageHelp').textContent=help;
 $('lobbyStep1').classList.toggle('current',!ready);$('lobbyStep1').classList.toggle('done',ready);$('lobbyStep2').classList.toggle('current',ready);
 $('lobbyGestureName').textContent=hands?'Both hands above your head':'One thumb up beside your face';
 $('lobbyGestureCopy').textContent=ready?(hands?'Hold both hands high for about 2 seconds.':'Point your thumb up, fold the other fingers, and hold for about 1.2 seconds.'):'Wait until every player is found. Then everyone gives the readiness gesture.';
 $('thumbIllustration').toggleAttribute('hidden',hands);$('handsIllustration').toggleAttribute('hidden',!hands);
 $('gestureRetryBtn').hidden=!unavailable;$('gestureFallbackBtn').hidden=!unavailable;
 const entries=S.lobby?.entries||[];
 const cards=entries.map((e,i)=>{
  const observation=S.readyData?.[i],fresh=Number.isFinite(observation?.sampledAt)&&performance.now()-observation.sampledAt<=650;
  const accepted=ready&&gestureAccepted(observation,performance.now()),progress=ready?(fresh?observation.progress||0:0):e.progress||0;
  const status=!e.seen?'Find your lane':!e.found?'Recognizing…':accepted?'Ready ✓':ready?unavailable?'Waiting for detector':S.gestureStatus!=='ready'&&!hands?'Loading thumbs-up…':fresh&&observation.thumbsUp?'Keep holding…':hands?'Lift both hands':'Show one thumb up':'Player found ✓';
  const pos=S.count===1?'Your space':i===0?'Left lane':i===S.count-1?'Right lane':'Middle lane';
  return `<div class="lobby-player ${e.found?'found':''} ${accepted?'ready':''}" data-player="${i}" style="--hold:${Math.round(Math.min(1,progress)*100)}%"><span class="lobby-number" aria-hidden="true">${accepted?'✓':String(i+1).padStart(2,'0')}</span><div><strong>Player ${String(i+1).padStart(2,'0')} · ${pos}</strong><span>${status}</span></div><div class="lobby-hold" role="progressbar" aria-label="Player ${i+1} ${ready?'readiness':'recognition'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1,progress)*100)}"><i></i></div></div>`;
 }).join('');
 if(S.lobbyHtml!==cards){S.lobbyHtml=cards;$('lobbyPlayers').innerHTML=cards;$('lobbyStagePlayers').innerHTML=cards;}
 $('lobbyStagePlayers').style.gridTemplateColumns=`repeat(${S.count},minmax(0,1fr))`;
 $('lobbyFoundCount').textContent=`${entries.filter(e=>e.found).length} of ${S.count} players found`;
 $('lobbyModelStatus').textContent=unavailable?'Thumbs-up is unavailable. Retry or select the host fallback.':hands?'Host selected the two-hands readiness gesture.':S.gestureStatus==='ready'?'One hand is enough. Everyone must be ready together.':'Preparing the thumbs-up detector…';
}
function retryReadiness(){if(!inCameraLobby())return;S.startGesture='thumb';S.gestureStatus='loading';setReadiness(S.phase==='lobbyReady',true,true);updateUI();}
function chooseReadinessFallback(){if(!inCameraLobby()||S.gestureStatus!=='unavailable')return;S.startGesture='hands';openCameraLobby();}
