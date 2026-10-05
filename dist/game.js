import {dot,add,scale,norm3,TAU,eventAt,staticFrame,initialPlayer,advance,rotate,telemetry,makeFleet,geodesicAt,retarded,shipBounds,seeded,chaseObserver,snapshot} from './physics.js?v=32';
import {ResolutionController} from './resolution.js?v=32';
import {ArcadeScore} from './music.js?v=21';
import {createLaser,advanceLasers,bounceCount,retardedLaser,laserEvent,retargetLaserFleet} from './lasers.js?v=33';
import {TrafficFire,advanceTraffic} from './traffic.js?v=33';
import {makeTrafficRoster,defaultShipCount} from './fleet-settings.js?v=33';
import {burnCommand} from './flight-controls.js?v=15';
import {ChaseCamera,rocketPoint} from './chase.js?v=15';
import {MissionProgram,missionCatalog,reflectedAim} from './missions.js?v=32';
import {compactRadius,mapCoordinates,mapVelocity,mapVectors,orbitPolyline} from './map.js?v=34';
import {hullAtlas} from './hull-atlas.js?v=32';
import {pickShipImage,faceDirectImage,directImageBox} from './image-navigation.js?v=26';
import {centralShip,brakingAim} from './docking.js?v=26';
import {awardUpgrade,playerHull,interceptorHull,laserMuzzle,engineNozzles} from './ship-upgrades.js?v=29';
import {velocityCue} from './velocity-cue.js?v=30';
const $=id=>document.getElementById(id),canvas=$('space'),hud=$('overlay'),map=$('map');
// Static launch/briefing frames must survive compositor clears in Safari.
// Let the browser choose the GPU instead of forcing a graphics switch on launch.
const gl=(()=>{try{return canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'default'})}catch(error){console.warn('Graphics context creation failed',error);return null}})();
const trafficRoster=makeTrafficRoster(),fleet=trafficRoster.ships(defaultShipCount),L_SECONDS=30,keys=new Set(),trafficFire=new TrafficFire(fleet,190726,[centralShip]);
const latestPlayerBeam=()=>{for(let i=beams.length-1;i>=0;i--)if(beams[i].owner!=='traffic')return beams[i];return null};
const destroyedCount=()=>fleet.filter(s=>Number.isFinite(s.deathTime)).length;
let player=initialPlayer(),paused=false,grid=true,warp=1,accel=1.5,last=performance.now(),width=1,height=1,frame=0,lastUi=0,fps=60,drag=null,noticeTimer;
let gameOver=false,deathAnimation=0;
let launched=false,dirty=true,pendingFence=null,musicWanted=true,effectTime=0,renderedFrames=0,renderedTraffic=fleet.length,contextLost=false;const score=new ArcadeScore();
const EXPLOSION_SECONDS=1.6,touchHolds=new Map();
let chase=true,beams=[],lastShot=-Infinity,kills=0,shots=0,lastImpact=null;
let selectedImageShip=null,imageFrame=null;
let velocityArrowEnabled=false;
function toggleVelocityArrow(){velocityArrowEnabled=!velocityArrowEnabled;dirty=true;$('velocityToggle').classList.toggle('on',velocityArrowEnabled);$('velocityToggle').setAttribute('aria-checked',String(velocityArrowEnabled))}
$('velocityToggle').onclick=toggleVelocityArrow;
const flightProgram=new MissionProgram();let missionTargetId=null,pendingMission=null;const announcedMissions=new Set();
const trickMission=()=>flightProgram.missions[0];
const dockingActive=()=>flightProgram.accepted.has('center-rest')&&flightProgram.missions[1].status==='active'&&!gameOver;
function missionTarget(){if(!flightProgram.accepted.has('trick-shot')||trickMission().status!=='active')return null;let target=fleet.find(s=>s.id===missionTargetId&&!Number.isFinite(s.deathTime));if(!target){target=fleet.find(s=>!Number.isFinite(s.deathTime));missionTargetId=target?.id??null}return target}
const gpuInfo=gl?.getExtension('WEBGL_debug_renderer_info'),softwareRenderer=gpuInfo&&/SwiftShader|llvmpipe|Software|softpipe/i.test(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL));
const resolution=new ResolutionController({software:!!softwareRenderer,coarse:matchMedia('(pointer: coarse)').matches});
let gpuStarted=0,gpuLastPoll=0,gpuSampleValid=false;
let graphicsState='starting',graphicsReady=false,surfaceGeneration=0,pendingGeneration=0,graphicsRecoveryAttempts=0,graphicsMessage=null,graphicsRecoveryTimer;
function graphicsStatus(state,message=''){if(graphicsState===state&&graphicsMessage===message)return;graphicsMessage=message;graphicsState=state;graphicsReady=state==='ready';clearTimeout(graphicsRecoveryTimer);if(state==='lost')graphicsRecoveryTimer=setTimeout(()=>{if(graphicsState==='lost')graphicsStatus('failed','Graphics could not be restored. Reload the game to retry.')},12000);$('launchButton').disabled=!graphicsReady;for(const id of ['launchGraphicsStatus','graphicsStatus']){$(id).hidden=graphicsReady;$(id).querySelector('p').textContent=message;$(id).querySelector('button').hidden=state!=='failed'}}
document.querySelectorAll('[data-reload-graphics]').forEach(b=>b.onclick=()=>location.reload());
const pilotColors=['#55dce8','#ff984f','#9f87ff','#f06caa','#8ad86a'];
let engineLevel=0,engineMode='forward',exhaust=[0,0,-1];
const chaseCamera=new ChaseCamera();let thrustForce=[0,0,0];
const viewObserver=()=>chase?chaseCamera.observer(player):player;
const pilotNames=['Juan Maldacena','Steven Gubser','Igor Klebanov','Alexander Polyakov','Edward Witten'];let pilot=0;
const hctx=hud.getContext('2d'),mctx=map.getContext('2d');
let controlsPreference=null;
function updateControls(){const enabled=controlsPreference??(innerWidth<=900||matchMedia('(pointer: coarse)').matches);$('app').classList.toggle('controls-visible',enabled);$('controlsButton').setAttribute('aria-pressed',String(enabled));$('controlsButton').setAttribute('aria-label',enabled?'Hide clickable flight controls':'Show clickable flight controls');if(!enabled){touchHolds.clear();document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('pressed'))}}
$('controlsButton').onclick=()=>{controlsPreference=!$('app').classList.contains('controls-visible');updateControls()};
window.addEventListener('resize',updateControls);updateControls();
function notify(s){$('notice').textContent=s;$('notice').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('show'),3500)}
function clearControls(){thrustForce=[0,0,0];chaseCamera.force=[0,0,0];drag=null;gpuSampleValid=false;resolution.resetSamples();engineLevel=0;score.setThrust(0);dirty=true;keys.clear();touchHolds.clear();document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('pressed'))}
function held(code){return keys.has(code)||[...touchHolds.values()].some(b=>b.dataset.key===code)}
function setPause(value){paused=value;clearControls();$('pauseOverlay').hidden=!value;$('pauseButton').innerHTML=value?'▷ <span>Resume</span>':'Ⅱ <span>Pause</span>';$('touchPause').textContent=value?'RESUME':'PAUSE';$('touchPause').setAttribute('aria-pressed',String(value));last=performance.now()}
function reset(){gameOver=false;deathAnimation=0;selectedImageShip=null;imageFrame=null;$('gameOverScreen').hidden=true;dismissDirac();if($('missionOfferDialog').open)$('missionOfferDialog').close();flightProgram.reset();announcedMissions.clear();pendingMission=null;missionTargetId=null;setPause(false);player=initialPlayer();chaseCamera.reset();thrustForce=[0,0,0];trafficFire.reset();beams=[];kills=0;shots=0;lastShot=-Infinity;lastImpact=null;effectTime=0;trafficRoster.all.forEach(s=>{delete s.deathTime;delete s.deathPoint;delete s.explosionStarted;delete s.visualRemoved});dirty=true;clearControls();updateUi();notify('Flight reset · ships and clocks restored')}
function setShipCount(count){
 const next=trafficRoster.ships(count);if(count===fleet.length)return;
 fleet.splice(0,fleet.length,...next);
 const targets=[...fleet,centralShip];for(const beam of beams)retargetLaserFleet(beam,targets,player.t);
 const {enabled,shots:trafficShots}=trafficFire;trafficFire.reset(player.t);trafficFire.enabled=enabled;trafficFire.shots=trafficShots;
 if(selectedImageShip&&!targets.includes(selectedImageShip))selectedImageShip=null;
 if(!fleet.some(s=>s.id===missionTargetId))missionTargetId=null;
 imageFrame=null;dirty=true;$('shipCount').value=String(count);updateUi();notify(`Traffic · ${count} ships`);
}
$('shipCount').onchange=e=>setShipCount(Number(e.target.value));
function fire(){if(!graphicsReady||contextLost||gameOver||!launched||!$('introScreen').hidden||paused||document.querySelector('dialog[open]')||player.tau-lastShot<.012)return false;lastShot=player.tau;const beam=createLaser(player,[...fleet,centralShip]);beam.flashTime=effectTime;beams.push(beam);shots++;score.laser();dirty=true;return true}
$('fireButton').onclick=fire;
$('retryButton').onclick=()=>{reset();canvas.focus({preventScroll:true})};
function endFlight(){
 gameOver=true;deathAnimation=0;dismissDirac();flightProgram.fail(announcedMissions);clearControls();score.explosion();dirty=true;
 $('laserStatus').textContent='ROCKET DESTROYED';
}

$('touchPause').onclick=()=>setPause(!paused);
$('touchCamera').onclick=()=>setCamera(chase?'cockpit':'chase');
function setCamera(view){if(!['chase','cockpit'].includes(view))throw Error('Unknown camera view');chase=view==='chase';dirty=true;$('cameraButton').textContent=chase?'Cockpit':'Chase';$('touchCamera').textContent=chase?'COCKPIT':'CHASE';$('viewLabel').textContent=chase?'CHASE VIEW':'COCKPIT VIEW';$('cameraButton').setAttribute('aria-label',chase?'Switch to cockpit view':'Switch to chase view');canvas.setAttribute('aria-label',chase?'Ray-traced chase view of your rocket':'Ray-traced view from your rocket cockpit')}
$('cameraButton').onclick=()=>setCamera(chase?'cockpit':'chase');
async function setMusic(value){musicWanted=value;$('launchSound').textContent=value?'SOUND ON':'SOUND OFF';$('launchSound').setAttribute('aria-pressed',String(value));$('musicButton').innerHTML=`<span>Sound ${value?'on':'off'}</span>`;$('musicButton').setAttribute('aria-pressed',String(value));if(value){try{await score.start()}catch{notify('Audio could not start. Toggle Sound to try again.')}}else score.stop()}
const introPages=[...document.querySelectorAll('[data-intro-paragraph]')];let introStep=0;
const introMotion=matchMedia('(prefers-reduced-motion: reduce)');
let introFrame=0,introTyping=false,introLetters=[],introRevealed=0;
function introControls(){
 $('introContinue').textContent=introTyping?'SHOW TEXT':introStep===introPages.length-1?'BEGIN FLIGHT →':'NEXT →';
 $('introClose').setAttribute('aria-label',introTyping?'Show the full paragraph':'Close this paragraph and continue');
 $('introHint').textContent=introTyping?'ENTER OR × TO SHOW TEXT':'ENTER OR × TO CONTINUE';
}
function finishIntroTyping(){
 cancelAnimationFrame(introFrame);introLetters[introRevealed-1]?.classList.remove('intro-caret');
 while(introRevealed<introLetters.length)introLetters[introRevealed++].style.visibility='visible';
 introTyping=false;introControls();
}
function typeIntro(paragraph){
 cancelAnimationFrame(introFrame);introLetters=[];introRevealed=0;
 // Keep the complete text accessible and reserve its layout while the visual
 // copy types. Screen readers receive one paragraph, not letter-by-letter updates.
 const readable=document.createElement('span'),visual=document.createElement('span');
 readable.className='intro-readable';readable.id=`${paragraph.id}Text`;readable.textContent=paragraph.textContent;
 visual.setAttribute('aria-hidden','true');visual.append(...paragraph.childNodes);
 const walker=document.createTreeWalker(visual,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){const fragment=document.createDocumentFragment();for(const character of node.textContent){const letter=document.createElement('span');letter.className='intro-letter';letter.textContent=character;introLetters.push(letter);fragment.append(letter)}node.replaceWith(fragment)}
 paragraph.replaceChildren(readable,visual);$('introScreen').setAttribute('aria-describedby',readable.id);
 introTyping=true;introControls();
 if(introMotion.matches){finishIntroTyping();return}
 const started=performance.now();
 function tick(now){
  introLetters[introRevealed-1]?.classList.remove('intro-caret');
  const count=Math.min(introLetters.length,1+Math.floor((now-started)/25));
  while(introRevealed<count)introLetters[introRevealed++].style.visibility='visible';
  if(introRevealed===introLetters.length){finishIntroTyping();return}
  introLetters[introRevealed-1]?.classList.add('intro-caret');introFrame=requestAnimationFrame(tick);
 }
 introFrame=requestAnimationFrame(tick);
}
introMotion.addEventListener('change',()=>{if(introMotion.matches&&introTyping)finishIntroTyping()});
function renderIntro(playSound=true){introPages.forEach((p,i)=>p.hidden=i!==introStep);$('introProgress').textContent=`${introStep+1} / ${introPages.length}`;typeIntro(introPages[introStep]);document.querySelector('.intro-body').scrollTop=0;if(playSound)score.incoming()}
function nextIntro(){if($('introScreen').hidden)return;if(introTyping){finishIntroTyping();return}if(++introStep===introPages.length)beginFlight();else renderIntro()}
function beginFlight(){$('introScreen').close();$('introScreen').hidden=true;$('app').inert=false;document.body.classList.remove('story-open');last=performance.now();canvas.focus({preventScroll:true});notify(`Welcome aboard, ${pilotNames[pilot]} · W to burn, arrow keys to steer`)}
$('introContinue').onclick=nextIntro;$('introClose').onclick=nextIntro;$('introScreen').addEventListener('cancel',e=>{e.preventDefault();nextIntro()});
function launch(){if(launched||!graphicsReady)return;launched=true;$('launchScreen').hidden=true;introStep=0;renderIntro(false);$('introScreen').hidden=false;$('introScreen').showModal();clearControls();document.body.classList.add('story-open');$('introClose').focus({preventScroll:true});last=performance.now();dirty=true;if(musicWanted)void setMusic(true).then(()=>{if(!$('introScreen').hidden)score.incoming()})}
$('launchButton').onclick=launch;$('launchSound').onclick=()=>void setMusic(!musicWanted);$('musicButton').onclick=()=>void setMusic(!musicWanted);
function openDialog(id){clearControls();$(id).showModal()}
function dismissDirac(){$('diracRadio').hidden=true}
function showDirac(id,reward=null){
 const mission=missionCatalog.find(m=>m.id===id);
 $('diracRadioTitle').textContent=reward?'UPGRADE INSTALLED':mission.name;
 $('diracRadioText').textContent=reward==='frame'
  ?'Docking confirmed. Axiom has fitted you with a new interceptor: swept wings, twin engines and a luminous cockpit. Your cannon stays mounted if you have earned it.'
  :reward==='cannon'
   ?'An excellent reflection. Your reward is a mounted laser cannon. Use F or FIRE as before—and keep clear of returning shots.'
   :id==='trick-shot'
    ?'Steer toward the gold BANK AIM marker. Center it in your sights and fire with F or FIRE. Your laser must bounce off the boundary before hitting the marked vessel.'
    :'Axiom waits at r = 0. Use M for the map. Cyan shows your travel; amber shows where to point your nose and thrust to slow down. Space or BRAKE does this without turning. Approach gently and hold slow in the open central bay for two ship seconds.';
 $('diracRadio').hidden=false;score.incoming();
}
$('diracRadioClose').onclick=()=>{dismissDirac();if(!document.querySelector('dialog[open]'))canvas.focus({preventScroll:true})};
function offerMission(id){
 pendingMission=id;dismissDirac();const m=missionCatalog.find(m=>m.id===id);
 $('missionOfferTitle').textContent=m.name;$('missionOfferText').textContent=m.description;
 openDialog('missionOfferDialog');document.querySelector('.mission-message').scrollTop=0;$('missionAccept').focus({preventScroll:true});score.incoming();
}
$('missionAccept').onclick=()=>{
 if(!pendingMission)return;
 const id=pendingMission;flightProgram.accept(id,player);$('missionOfferDialog').close();showDirac(id);dirty=true;updateUi();
};
$('missionDecline').onclick=()=>$('missionOfferDialog').close();
$('missionOfferDialog').addEventListener('close',()=>{if($('missionOfferDialog').open)return;pendingMission=null;last=performance.now();canvas.focus({preventScroll:true})});
function announceMissions(){
 for(const m of flightProgram.missions)if(m.status==='complete'&&!announcedMissions.has(m.id)){
  announcedMissions.add(m.id);const reward=awardUpgrade(player,m.id);dirty=true;
  notify(m.id==='center-rest'?'DOCKING COMPLETE · INTERCEPTOR UNLOCKED':'TRICK SHOT COMPLETE · CANNON INSTALLED');
  if(reward)showDirac(m.id,reward);
 }
}
function openMap(){openDialog('mapDialog');drawExpandedMap()}
$('expandMapButton').onclick=openMap;
function toggleFlightMap(show=$('flightMap').hidden){
 $('flightMap').hidden=!show;canvas.parentElement.classList.toggle('map-visible',show);$('mapOverlayButton').setAttribute('aria-pressed',String(show));
 $('mapOverlayButton').setAttribute('aria-label',`${show?'Hide':'Show'} orbital map overlay`);
 $('mapOverlayButton').textContent=show?'HIDE · M':'MAP · M';if(show)drawFlightMap();
}
$('mapOverlayButton').onclick=()=>{toggleFlightMap();canvas.focus({preventScroll:true})};
$('physicsButton').onclick=()=>openDialog('physicsDialog');$('helpButton').onclick=()=>openDialog('helpDialog');
$('pilotButton').onclick=()=>openDialog('pilotDialog');
function selectPilot(index){
 if(!Number.isInteger(index)||index<0||index>=pilotNames.length)throw Error('Unknown pilot');pilot=index;dirty=true;
 $('pilotName').textContent=pilotNames[index].split(' ').at(-1);$('currentPortrait').dataset.avatar=String(index);$('currentPortrait').style.setProperty('--pilot-position',`${index*25}%`);$('pilotButton').setAttribute('aria-label',`Choose pilot, currently ${pilotNames[index]}`);
 document.querySelectorAll('[data-pilot]').forEach(b=>{const selected=Number(b.dataset.pilot)===index;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.querySelector('.pilot-select-label').textContent=selected?'Selected':'Select pilot'});
 document.querySelectorAll('[data-launch-pilot]').forEach(b=>{const selected=Number(b.dataset.launchPilot)===index;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.tabIndex=selected?0:-1});
 if($('pilotDialog').open)$('pilotDialog').close();if(launched)notify(`Pilot selected · ${pilotNames[index]}`);
}
document.querySelectorAll('[data-pilot]').forEach(b=>b.onclick=()=>selectPilot(Number(b.dataset.pilot)));
document.querySelectorAll('[data-launch-pilot]').forEach(b=>{b.tabIndex=Number(b.dataset.launchPilot)===pilot?0:-1;b.onclick=()=>selectPilot(Number(b.dataset.launchPilot))});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('startButton').onclick=()=>$('helpDialog').close();
document.querySelectorAll('dialog:not(#introScreen)').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$('pauseButton').onclick=()=>setPause(!paused);$('resumeButton').onclick=()=>setPause(false);$('resetButton').onclick=reset;
$('gridToggle').onclick=()=>{grid=!grid;dirty=true;$('gridToggle').classList.toggle('on',grid);$('gridToggle').setAttribute('aria-checked',String(grid))};
$('warp').onchange=e=>{warp=Number(e.target.value);notify(`Time warp ${warp}× · ${(warp*1.5).toFixed(1)}× base playback`)};
$('graphicsQuality').onchange=e=>{resolution.setMode(e.target.value);resize();dirty=true};
function setAcceleration(value){
 const control=$('thrust'),step=Number(control.step),min=Number(control.min),max=Number(control.max);
 if(!Number.isFinite(value))return;
 accel=Number(Math.max(min,Math.min(max,Math.round(value/step)*step)).toFixed(1));
 control.value=accel.toFixed(1);$('thrustValue').value=accel.toFixed(1);
}
$('thrust').oninput=e=>setAcceleration(e.target.valueAsNumber);
$('fullscreenButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{notify('Fullscreen is unavailable in this browser')}};
const gameKeys=['KeyW','KeyS','KeyQ','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(!launched){
  if(e.code==='Enter'&&e.target.id!=='launchSound'&&!e.target.matches('[data-reload-graphics]')){e.preventDefault();if(!e.repeat)launch()}
  else if($('introScreen').hidden&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();const delta=['ArrowRight','ArrowDown'].includes(e.code)?1:-1;selectPilot((pilot+delta+pilotNames.length)%pilotNames.length);document.querySelector(`[data-launch-pilot="${pilot}"]`).focus()}
  return;
 }
 if(!$('introScreen').hidden){if(e.code==='Enter'){e.preventDefault();if(!e.repeat)nextIntro()}return}
 if((e.code==='Enter'||e.code==='Escape')&&!e.repeat&&!$('diracRadio').hidden&&!document.querySelector('dialog[open]')){e.preventDefault();dismissDirac();return}
 if(e.code==='KeyM'&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&(!document.querySelector('dialog[open]')||$('mapDialog').open)){e.preventDefault();if(!e.repeat){if($('mapDialog').open)$('mapDialog').close();else if(gameOver)openMap();else toggleFlightMap()}return}
 if(e.code==='Escape'&&!document.querySelector('dialog[open]')&&!$('flightMap').hidden){e.preventDefault();toggleFlightMap(false);return}
 if(gameOver){if(!document.querySelector('dialog[open]')&&!e.repeat&&(e.code==='KeyR'||e.code==='Enter')){e.preventDefault();reset();canvas.focus({preventScroll:true})}return}
 const throttleKey=e.code==='KeyU'||e.code==='KeyD',formFocused=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName);
 if(document.querySelector('dialog[open]')||(formFocused&&!(throttleKey&&e.target.id==='thrust')))return;
 if(!graphicsReady||contextLost)return;
 if(e.code==='KeyV'){e.preventDefault();if(!e.repeat)toggleVelocityArrow();return}
 if(throttleKey){e.preventDefault();setAcceleration(accel+(e.code==='KeyU'?1:-1)*Number($('thrust').step));return}
 if(gameKeys.includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)fire()}
 if(!e.repeat&&e.code==='KeyP')setPause(!paused);
 if(!e.repeat&&e.code==='KeyR')reset();
});
document.addEventListener('focusin',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))clearControls()});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{clearControls();last=performance.now();if(!document.hidden){gpuStarted=last;dirty=true}});
window.addEventListener('pageshow',()=>{clearControls();last=performance.now();gpuStarted=last;dirty=true});
function reflectedImageAt(clientX,clientY){
 if(!imageFrame)return null;const rect=canvas.getBoundingClientRect();
 const x=(clientX-rect.left)*imageFrame.width/rect.width,y=(clientY-rect.top)*imageFrame.height/rect.height;
 const label=imageFrame.labels.find(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);
 if(label)return label.id;
 // Sample the same pixel center as the GPU, even at reduced render resolution.
 const px=Math.floor(x/imageFrame.width*imageFrame.pixelWidth)+.5,py=Math.floor(y/imageFrame.height*imageFrame.pixelHeight)+.5;
 const hit=pickShipImage(imageFrame.observer,imageFrame.ships,px,py,imageFrame.pixelWidth,imageFrame.pixelHeight);
 return hit?.reflected&&!hit.ship.own?hit.ship.id:null;
}
function selectReflectedImage(id){
 selectedImageShip=null;
 const ship=[...fleet,centralShip].find(s=>s.id===id);
 if(!ship||Number.isFinite(ship.deathTime)||ship.visualRemoved){notify('That vessel’s direct image is no longer available');return}
 if(!faceDirectImage(player,ship))return;
 selectedImageShip=ship;dirty=true;notify(`${ship.id} · DIRECT IMAGE`);
}
canvas.addEventListener('pointerdown',e=>{if(drag||e.button!==0||!graphicsReady||contextLost||gameOver||!launched||paused||!$('introScreen').hidden||document.querySelector('dialog[open]'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,reflection:reflectedImageAt(e.clientX,e.clientY)};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!graphicsReady||!drag||drag.id!==e.pointerId||paused)return;if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;rotate(player,(e.clientX-drag.x)*.003,-(e.clientY-drag.y)*.003,0);dirty=true;drag={...drag,x:e.clientX,y:e.clientY,moved:true}});
canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4){if(drag.reflection)selectReflectedImage(drag.reflection);else fire()}drag=null});canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('lostpointercapture',()=>drag=null);
document.querySelectorAll('[data-key]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{e.preventDefault();if(!graphicsReady||contextLost||gameOver||!launched||!$('introScreen').hidden||paused||document.querySelector('dialog[open]'))return;touchHolds.set(e.pointerId,b);b.classList.add('pressed');b.setPointerCapture(e.pointerId);if(b.dataset.key==='KeyF')fire()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{touchHolds.delete(e.pointerId);if(![...touchHolds.values()].includes(b))b.classList.remove('pressed')});
 b.addEventListener('click',e=>{if(!graphicsReady||contextLost||gameOver||!launched||!$('introScreen').hidden||paused)return;if(e.detail===0){if(b.dataset.key==='KeyF')fire();else{const token=Symbol();touchHolds.set(token,b);b.classList.add('pressed');setTimeout(()=>{touchHolds.delete(token);if(![...touchHolds.values()].includes(b))b.classList.remove('pressed')},140)}}});
});
const fleetCapacity=fleet.length+2; // Includes Axiom and the player hull in chase view.
let program,skyTexture,shipTexture,hullTexture,vertexArray,locations={},fleetData=new Float32Array(10*fleetCapacity*4);
function initRenderer(){
 graphicsStatus('starting','Preparing the flight view…');
 if(!gl){graphicsStatus('failed','Graphics could not start. Reload the game to retry.');return}
 const vertex=`#version 300 es
 precision highp float;
 precision highp int;
 void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
 const fragment=`#version 300 es
 precision highp float;
 precision highp int;
 uniform vec2 resolution;
 uniform vec2 Xt,Ut,Rt,Vt,Ft;
 uniform vec3 Xs,Us,Rs,Vs,Fs;
 uniform lowp sampler2D sky;
 uniform highp sampler2D fleet;
 uniform highp sampler2D hullGeometry;
 const int hullCounts[6]=int[6](${hullAtlas.counts.join(',')});
 const int hullOffsets[6]=int[6](${hullAtlas.offsets.join(',')});
 uniform float showGrid;
 uniform float observerTime;
 uniform int shipCount;
 uniform vec3 playerColor;
 uniform float engineBurn;
 uniform float playerCannon;
 uniform float playerFiring;
 out vec4 frag;
 const float PI=3.141592653589793;
 vec4 data(int row,int col){return texelFetch(fleet,ivec2(col,row),0);}
 // Exact intersection with an ellipsoid in a geodesic's Fermi coordinates.
 vec2 hullRoots(vec3 origin,vec3 dir,vec3 center,vec3 radii){
   vec3 o=(origin-center)/radii,d=dir/radii;
   float dl=length(d);vec3 unitD=d/dl;
   float b=dot(o,unitD);vec3 transverse=cross(o,unitD);
   float disc=1.0-dot(transverse,transverse);
   if(disc<0.0)return vec2(1e25);
   float root=sqrt(disc);
   return vec2((-b-root)/dl,(-b+root)/dl);
 }
 vec3 shifted(vec3 color,float g){
   float z=clamp(log(max(g,0.0001)),-3.0,3.0);
   // Display response to the exact frequency ratio; broadband colors are stylized.
   return color*vec3(exp(-1.10*z),exp(-.12*abs(z)),exp(1.10*z));
 }
 void main(){
  vec2 screen=(gl_FragCoord.xy-.5*resolution)/resolution.y;
  vec3 d=normalize(vec3(screen*1.40,1.0));
  // K = -U + d_i E_i is a past-directed null tangent, normalized at the observer.
  vec2 nt=-Ut+d.x*Rt+d.y*Vt+d.z*Ft;
  vec3 ns=-Us+d.x*Rs+d.y*Vs+d.z*Fs;
  vec3 boundary=normalize(ns);
  vec2 uv=vec2(atan(boundary.z,boundary.x)/(2.0*PI)+.5,acos(clamp(boundary.y,-1.0,1.0))/PI);
  float E=Xt.y*nt.x-Xt.x*nt.y;
  float gain=1.0/max(E,.00001);
  vec3 stars=texture(sky,uv).rgb;
  vec3 color=vec3(.006,.011,.025)+shifted(stars,gain)*clamp(pow(gain,.8),.14,2.5);
  if(showGrid>.5){
   vec2 gridUv=vec2(uv.x*16.0,uv.y*8.0);
   vec2 aa=max(fwidth(gridUv),vec2(.00001));
   vec2 line=(.5-abs(fract(gridUv)-.5))/aa;
   float g=1.0-smoothstep(.35,1.3,min(line.x,line.y));
   color+=vec3(.028,.070,.115)*g;
  }
  float nearest=1e20;
  for(int i=0;i<shipCount;i++){
   vec4 bounds=data(i,8);
   vec4 echoBounds=data(i,9);
   bool inDirect=abs(screen.x-bounds.x)<=bounds.z&&abs(screen.y-bounds.y)<=bounds.z;
   bool inEcho=abs(screen.x-echoBounds.x)<=echoBounds.z&&abs(screen.y-echoBounds.y)<=echoBounds.z;
   if(!inDirect&&!inEcho)continue;
   vec4 pos=data(i,0),vel=data(i,1);
   vec3 nc=-vel.xyz+d.x*data(i,2).xyz+d.y*data(i,3).xyz+d.z*data(i,4).xyz;
   float size=pos.w;
   int kind=int(data(i,4).w+.5);
   vec3 radii=vec3(.013,.014,.047)*size,center=vec3(0);
   float h=0.0,etaHit=1.0,bestDelay=nearest;int part=0;bool found=false;
   bool own=data(i,2).w>.5;
   bool cannon=own&&playerCannon>.5;
   int basePieces=hullCounts[kind];
   int pieces=basePieces+(cannon?${hullAtlas.cannonParts}:0);
   for(int piece=0;piece<pieces;piece++){
    int shapeRow=cannon&&piece>=basePieces?${hullAtlas.cannonOffset}+piece-basePieces:hullOffsets[kind]+piece;
    vec3 rr=texelFetch(hullGeometry,ivec2(0,shapeRow),0).xyz;
    vec3 cc=texelFetch(hullGeometry,ivec2(1,shapeRow),0).xyz;
    for(int reflected=0;reflected<2;reflected++){
     float eta=reflected==0?1.0:-1.0;if(own&&reflected==1)continue;
     vec2 roots=hullRoots(eta*pos.xyz,eta*nc,cc*size,rr*size);
     for(int root=0;root<2;root++){
      float mu=roots[root];if(abs(mu)>1e20||(own&&mu<=.00001))continue;
      vec2 time=eta*(Xt+mu*nt);
      float delay=mod(atan(Xt.y,Xt.x)-atan(time.y,time.x)+2.0*PI,2.0*PI);
      if(delay<.00001)continue;
      float emittedAt=observerTime-delay;
      if(bounds.w>=0.0&&emittedAt>=bounds.w)continue;
      if(delay<bestDelay){h=mu;etaHit=eta;bestDelay=delay;radii=rr*size;center=cc*size;part=piece;found=true;}
     }
    }
   }
   if(!found)continue;
   nearest=bestDelay;
   vec3 q=etaHit*(pos.xyz+h*nc),local=q-center,normal=normalize(local/(radii*radii));
   float lighting=.22+.7*max(0.0,dot(normal,normalize(vec3(-.7,1.0,.3))));
   vec3 base=kind==4?vec3(.72,.80,.85):kind==1?vec3(.82,.80,.72):kind==2?vec3(.37,.32,.25):kind==3?vec3(.67,.73,.79):mix(vec3(.31,.39,.47),vec3(.57,.62,.67),vel.w);
   if(own)base=playerColor;
   vec3 hull=base*lighting;
   float edge=pow(1.0-abs(dot(normal,normalize(nc))),2.0);
   hull+=vec3(.04,.20,.28)*edge;
   if(kind==5){
    // Swept interceptor: pilot-colored body, metallic fins and two hot engines.
    hull=mix(vec3(.12,.19,.25),playerColor,.65)*lighting;
    if(part==1||part==5||part==6){hull=vec3(.70,.76,.82)*lighting;if(abs(local.x)>radii.x*.72)hull=vec3(.14,.85,1.0)*1.3;}
    if(part==7)hull=vec3(.14,.52,.90)*1.4+vec3(.20,.10,.36)*edge;
    if(part==3||part==4){hull=vec3(.32,.42,.51)*lighting;if(local.z<-radii.z*.78)hull=mix(vec3(.10,.20,.35),vec3(.25,.70,1.0)*2.2,engineBurn);}
    if(part==8)hull=vec3(.95,.64,.24)*lighting;
    if(part==0&&abs(local.x)>.012*size)hull+=vec3(.30,.19,.06);
   }else if(kind==0){
    if(part==0&&local.z>radii.z*.36&&abs(local.x)<radii.x*.7)hull=vec3(.10,.55,.72)*(.7+.3*lighting);
    if(part==0&&local.z<-radii.z*.79)hull=own?mix(vec3(.05,.07,.09),vec3(1.0,.48,.12)*1.8,engineBurn):vec3(1.0,.39,.11)*1.4;
    if(part==1&&abs(local.x)>radii.x*.82)hull=vec3(.25,.94,.98);
   }else if(kind==1){
    if(part==0&&abs(local.y)<radii.y*.16&&local.z>0.0)hull=vec3(.045,.13,.18);
    if(part==2&&local.z<-radii.z*.8)hull=vec3(.28,.57,1.0);
   }else if(kind==2){
    if(part==0&&local.z>radii.z*.85)hull=vec3(.015,.020,.026);
    if(part==0&&abs(local.y)<.002*size&&abs(local.z)<.085*size)hull=vec3(.42,.32,.10);
   }else if(kind==4){
    // Pearl-metal crowns, gold seams, luminous windows and violet drive petals.
    float angle=atan(q.y,q.x),radial=length(q.xy);
    float panels=step(.86,fract(angle*24.0/PI+q.z*110.0));
    hull=mix(hull,vec3(.86,.54,.18)*(.6+lighting),panels*.75);
    if(part<32){
     float windows=step(.35,fract(angle*56.0/PI));
     if(abs(local.z)<radii.z*.6&&windows>.5)hull=vec3(.15,.86,1.0)*1.6;
     if(radial<(part<16?.144:.110))hull=vec3(.30,.95,1.0)*1.8;
     if(local.z>radii.z*.83)hull+=vec3(.14,.20,.26);
    }else if(part<40){hull+=vec3(.18,.48,.56)*.7;}
    else{
     if(local.z<-.115)hull=vec3(.52,.26,1.0)*2.0;
     if(abs(local.x)<.009&&abs(local.y)<.009&&local.z>.11)hull=vec3(1.0,.74,.32)*1.8;
    }
   }else{
    if((part==2||part==3)&&local.z>radii.z*.77)hull=vec3(1.0,.19,.10);
    if((part==2||part==3)&&abs(local.x)>radii.x*.65)hull=vec3(.15,.46,1.0);
    if(part==0&&abs(local.y)<.004*size&&local.z>.018*size)hull=vec3(.25,.45,.63);
   }
   if(cannon&&part>=(kind==5?${interceptorHull.length}:2)){
    int gunPart=part-(kind==5?${interceptorHull.length}:2);
    // Heavy gunmetal armor, silver heat bands and hot accelerator rails.
    vec3 hot=vec3(1.0,.08,.32)*(1.35+2.8*playerFiring);
    hull=vec3(.19,.24,.31)*lighting+vec3(.14,.23,.30)*edge;
    if(gunPart==0)hull=mix(vec3(.22,.28,.34),playerColor,.25)*lighting;
    if(gunPart==1){
     hull=vec3(.45,.52,.60)*lighting;
     if(abs(local.x)>radii.x*.62&&local.z<radii.z*.3)hull=vec3(1.0,.60,.16)*(.6+lighting);
    }
    if(gunPart==2){
     float bands=step(.72,fract(q.z/size*190.0));
     hull=mix(vec3(.16,.20,.25),vec3(.65,.72,.79),bands)*lighting;
    }
    if(gunPart==3){
     hull=vec3(.62,.69,.77)*lighting+vec3(.16,.23,.28)*edge;
     if(local.z>radii.z*.45){
      float bore=length(local.xy/radii.xy);
      hull=bore<.36?vec3(1.0,.80,.85)*(1.6+3.0*playerFiring):hot;
     }
    }
    if(gunPart==4||gunPart==5){
     hull=vec3(.42,.49,.57)*lighting;
     if(local.y>radii.y*.22)hull=hot;
    }
    if(gunPart==6||gunPart==7){
     float vents=step(.5,fract(q.z/size*180.0));
     hull=mix(vec3(.09,.13,.18),vec3(.50,.59,.67),vents)*lighting;
     if(local.y>radii.y*.75)hull=hot*.6;
    }
    if(gunPart==8)hull=hot*(.7+.3*edge);
    if(gunPart==9)hull=vec3(1.0,.65,.18)*1.5;
   }
   vec4 ab=data(i,5),rv=data(i,6),f=data(i,7);
   float na=-ab.z+d.x*rv.x+d.y*rv.z+d.z*f.x,nb=-ab.w+d.x*rv.y+d.y*rv.w+d.z*f.y;
   float phase=atan(-etaHit*(ab.y+h*nb),-etaHit*(ab.x+h*na));
   float emitted=etaHit*(-na*sin(phase)+nb*cos(phase));
   float g=1.0/max(emitted,.0001);
   color=shifted(hull,g)*clamp(pow(g,.8),.25,2.0);
  }
  float vignette=1.0-.27*pow(length(screen)/1.1,1.4);
  color*=max(.55,vignette);
  // A fixed ordered dither and a 6-bit palette evoke early arcade hardware.
  // Keep full spatial resolution: the ray intersections remain unchanged.
  vec3 displayColor=pow(color,vec3(.85));
  float dither=mod(floor(gl_FragCoord.x)+2.0*floor(gl_FragCoord.y),4.0)/4.0;
  frag=vec4(floor(clamp(displayColor,0.0,1.0)*63.0+dither)/63.0,1);
 }`;
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
 try{
  program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);vertexArray=gl.createVertexArray();gl.bindVertexArray(vertexArray);
  for(const n of ['resolution','Xt','Ut','Rt','Vt','Ft','Xs','Us','Rs','Vs','Fs','showGrid','sky','fleet','shipCount','observerTime','playerColor','engineBurn','playerCannon','playerFiring','hullGeometry'])locations[n]=gl.getUniformLocation(program,n);
  skyTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
  const sky=document.createElement('canvas');sky.width=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));sky.height=sky.width/2;const ctx=sky.getContext('2d'),rand=seeded(914982);
  ctx.fillStyle='#000';ctx.fillRect(0,0,sky.width,sky.height);
  for(let i=0;i<6000;i++){
   // cos(theta), not theta, is uniform: these are uniform points on S².
   const cosTheta=rand()*2-1,x=rand()*sky.width,y=Math.acos(cosTheta)/Math.PI*sky.height,b=rand(),r=(b>.995?2.8:b>.96?1.7:.45+rand()*.65)*sky.width/4096;
   const palette=rand(),color=palette<.13?'255,180,135':palette>.76?'143,192,255':'210,228,255';
   for(const xx of [x-sky.width,x,x+sky.width]){
    if(r>1.4){const glow=ctx.createRadialGradient(xx,y,0,xx,y,r*5);glow.addColorStop(0,`rgba(${color},.7)`);glow.addColorStop(.2,`rgba(${color},.22)`);glow.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=glow;ctx.fillRect(xx-r*5,y-r*5,r*10,r*10)}
    ctx.beginPath();ctx.arc(xx,y,r,0,TAU);ctx.fillStyle=`rgba(${color},${.38+rand()*.62})`;ctx.fill();
   }
  }
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sky);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  shipTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shipTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,10,fleetCapacity,0,gl.RGBA,gl.FLOAT,fleetData);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(locations.sky,0);gl.uniform1i(locations.fleet,1);
  hullTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,hullTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,2,hullAtlas.rows,0,gl.RGBA,gl.FLOAT,hullAtlas.data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(locations.hullGeometry,2);
  if(gl.getError()!==gl.NO_ERROR)throw Error('Unable to initialize the ray-tracing textures');
 }catch(e){console.error(e);program=null;graphicsStatus('failed','Graphics could not start. Reload the game to retry.')}
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clearControls();contextLost=true;program=null;pendingFence=null;graphicsStatus('lost','Restoring the flight view…')});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;initRenderer();resize();dirty=true;last=performance.now()});
function resize(){
 const r=canvas.getBoundingClientRect(),dimensions=resolution.configure(r.width,r.height,window.devicePixelRatio||1,matchMedia('(pointer: coarse)').matches);
 width=r.width;height=r.height;
 // Assigning even the SAME canvas size discards its drawing buffer.
 if(canvas.width!==dimensions.width||canvas.height!==dimensions.height){canvas.width=dimensions.width;canvas.height=dimensions.height;surfaceGeneration++;if(program&&!contextLost&&graphicsState!=='failed')graphicsStatus('starting','Preparing the flight view…')}gpuSampleValid=false;
 const hudDpr=Math.min(window.devicePixelRatio||1,2),hudWidth=Math.max(1,Math.round(width*hudDpr)),hudHeight=Math.max(1,Math.round(height*hudDpr));if(hud.width!==hudWidth)hud.width=hudWidth;if(hud.height!==hudHeight)hud.height=hudHeight;hctx.setTransform(hudDpr,0,0,hudDpr,0,0);
 if(gl)gl.viewport(0,0,canvas.width,canvas.height);
 dirty=true;
}
new ResizeObserver(resize).observe(canvas.parentElement);
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
function row(i,col,values){fleetData.set(values,(i*10+col)*4)}
function recoverGraphics(){
 if(contextLost||graphicsState==='lost'||graphicsState==='failed')return;
 clearControls();graphicsReady=false;
 const extension=gl?.getExtension('WEBGL_lose_context');
 if(extension&&graphicsRecoveryAttempts++<1){
  graphicsStatus('lost','Restoring the flight view…');extension.loseContext();
  setTimeout(()=>{if(gl.isContextLost())extension.restoreContext()},120);
 }else{graphicsStatus('failed','Graphics stopped responding. Reload the game to retry.')}
}
function pollFrame(active=false){
 if(!gl||!program||contextLost||graphicsState==='lost'||graphicsState==='failed')return false;
 if(!pendingFence)return true;
 const poll=performance.now();gpuSampleValid=gpuSampleValid&&active&&poll-gpuLastPoll<250;gpuLastPoll=poll;
 const status=gl.clientWaitSync(pendingFence,0,0);
 if(status===gl.TIMEOUT_EXPIRED){if(!document.hidden&&poll-gpuStarted>8000)recoverGraphics();return false}
 if(status===gl.WAIT_FAILED){recoverGraphics();return false}
 gl.deleteSync(pendingFence);pendingFence=null;
 if(pendingGeneration===surfaceGeneration){if(!graphicsReady&&gl.getError()!==gl.NO_ERROR){recoverGraphics();return false}graphicsRecoveryAttempts=0;graphicsStatus('ready')}
 if(resolution.observe(poll-gpuStarted,{active,continuous:gpuSampleValid}))resize();
 return true;
}
function draw(active=false){
 if(!pollFrame(active))return;
 const observer=viewObserver();
 hctx.clearRect(0,0,width,height);hctx.font='7px "Arcade",monospace';let labeled=0;const reflectionLabels=[];
 const views=new Map(),traffic=[centralShip,...fleet].filter(s=>{
  if(s.visualRemoved)return false;
  const view=retarded(s,observer);views.set(s,view);
  if(Number.isFinite(s.deathTime)&&view&&observer.t-view.delay>=s.deathTime){
   if(s.explosionStarted===undefined){s.explosionStarted=effectTime;score.explosion()}
   if(effectTime-s.explosionStarted>=EXPLOSION_SECONDS){s.visualRemoved=true;return false}
  }
  return true;
 });
 renderedTraffic=traffic.filter(s=>s!==centralShip).length;
 for(const s of traffic)for(const reflected of [false,true]){
  const view=reflected?retarded(s,observer,true):views.get(s);if(!view||view.dir[2]<=.03)continue;
  const x=width/2+view.dir[0]/view.dir[2]/1.4*height,y=height/2-view.dir[1]/view.dir[2]/1.4*height;
  if(s.explosionStarted!==undefined){if(!reflected)drawExplosion(x,y,(effectTime-s.explosionStarted)/EXPLOSION_SECONDS,s,view);continue}
  if(Number.isFinite(s.deathTime))continue;
  if((reflected||s!==selectedImageShip)&&x>50&&x<width-105&&y>85&&y<height-120&&labeled<10){
   labeled++;const size=Math.max(7,Math.min(24,.065*s.size/Math.max(.07,view.distance)*height));
   hctx.strokeStyle='rgba(119,172,207,.38)';hctx.lineWidth=.7;
   for(const [a,b,c,e] of [[-1,-1,1,1],[1,-1,-1,1],[-1,1,1,-1],[1,1,-1,-1]]){hctx.beginPath();hctx.moveTo(x+a*size+c*5,y+b*size);hctx.lineTo(x+a*size,y+b*size);hctx.lineTo(x+a*size,y+b*size+e*5);hctx.stroke()}
   const name=`${s.id}${s===centralShip?' · CENTRAL SHIP':''}${reflected?' · REFLECTED':''}`,spectrum=`×${view.shift.toFixed(2)} ${view.shift<.975?'RED':view.shift>1.025?'BLUE':'NEUTRAL'} · ${(view.delay*L_SECONDS).toFixed(1)} s ago`;
   const labelWidth=Math.max(hctx.measureText(name).width,hctx.measureText(spectrum).width),labelX=Math.max(12,Math.min(x+size+8,width-labelWidth-12));
   hctx.fillStyle='rgba(168,199,224,.68)';hctx.fillText(name,labelX,y-3);
   hctx.fillStyle='rgba(117,151,184,.62)';hctx.fillText(spectrum,labelX,y+11);
   if(reflected)reflectionLabels.push({id:s.id,left:labelX-4,right:labelX+labelWidth+4,top:y-14,bottom:y+16});
  }
 }
 // A current-frame proxy makes our own hull and immediate engine cues agree.
 // The observer, surrounding traffic and laser rays still use the AdS geometry.
 const ownState=chase&&!gameOver?player:null;
 if(ownState)drawEnginePlume(observer,ownState);
 drawLaserPulses(observer);
 drawMissionAim();
 drawDockingAim();
 drawSelectedImage(observer);
 drawVelocityArrow();
 if(gameOver&&deathAnimation<EXPLOSION_SECONDS)drawExplosion(width/2,height*.68,Math.min(.999,deathAnimation/EXPLOSION_SECONDS),{boundRadius:.065,size:.8}, {distance:.17});
 if(!gl||!program||contextLost)return;
 gl.useProgram(program);gl.bindVertexArray(vertexArray);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,hullTexture);
 for(const name of ['X','U','R','V','F']){gl.uniform2fv(locations[name+'t'],observer[name].slice(0,2));gl.uniform3fv(locations[name+'s'],observer[name].slice(2))}
 gl.uniform1f(locations.observerTime,observer.t);
 gl.uniform2f(locations.resolution,canvas.width,canvas.height);gl.uniform1f(locations.showGrid,grid?1:0);
 gl.uniform3fv(locations.playerColor,[1,3,5].map(i=>parseInt(pilotColors[pilot].slice(i,i+2),16)/255));gl.uniform1f(locations.engineBurn,engineMode==='forward'?engineLevel:0);
 gl.uniform1f(locations.playerCannon,player.upgrades?.cannon?1:0);const flash=latestPlayerBeam();gl.uniform1f(locations.playerFiring,flash?Math.max(0,1-(effectTime-flash.flashTime)/.24):0);
 const visible=ownState?[...traffic,playerHull(ownState)]:traffic;
 // Separate the two image caps: their enclosing rectangle can cover empty sky.
 // Cull only geometry whose exact enclosing sphere misses the entire viewport.
 const inView=b=>Math.abs(b[0])<=canvas.width/(2*canvas.height)+b[2]&&Math.abs(b[1])<=.5+b[2];
 const prepared=visible.map(s=>({s,bounds:shipBounds(s,observer,3/canvas.height,!s.own,true)})).filter(item=>item.bounds.some(inView));
 gl.uniform1i(locations.shipCount,prepared.length);
 prepared.forEach(({s,bounds},i)=>{
  row(i,0,[...s.C.map(c=>dot(observer.X,c)),s.size]);row(i,1,[...s.C.map(c=>dot(observer.U,c)),s.hue]);
  for(const [j,k] of [[2,'R'],[3,'V'],[4,'F']])row(i,j,[...s.C.map(c=>dot(observer[k],c)),j===4?s.kind:j===2&&s.own?1:0]);
  row(i,5,[dot(observer.X,s.A),dot(observer.X,s.B),dot(observer.U,s.A),dot(observer.U,s.B)]);
  row(i,6,[dot(observer.R,s.A),dot(observer.R,s.B),dot(observer.V,s.A),dot(observer.V,s.B)]);row(i,7,[dot(observer.F,s.A),dot(observer.F,s.B),0,0]);
  bounds[0][3]=Number.isFinite(s.deathTime)?s.deathTime:-1;row(i,8,bounds[0]);row(i,9,bounds[1]);
 });
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shipTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,10,fleetCapacity,gl.RGBA,gl.FLOAT,fleetData);gl.drawArrays(gl.TRIANGLES,0,3);
 imageFrame={observer:snapshot(observer),ships:prepared.map(({s})=>({...s})),width,height,pixelWidth:canvas.width,pixelHeight:canvas.height,labels:reflectionLabels};
 pendingFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!pendingFence){recoverGraphics();return}pendingGeneration=surfaceGeneration;gl.flush();gpuStarted=performance.now();gpuLastPoll=gpuStarted;gpuSampleValid=active;dirty=false;renderedFrames++;
}
function drawVelocityArrow(){
 if(!velocityArrowEnabled||!launched||!$('introScreen').hidden||gameOver)return;
 const cue=velocityCue(player,width,height,chase?viewObserver():null);if(!cue)return;
 const {x,y,tailX,tailY,angle,aft}=cue;
 hctx.save();hctx.lineCap='round';hctx.lineJoin='round';
 hctx.beginPath();hctx.moveTo(tailX,tailY);hctx.lineTo(x,y);
 hctx.moveTo(x-Math.cos(angle-.6)*12,y-Math.sin(angle-.6)*12);hctx.lineTo(x,y);hctx.lineTo(x-Math.cos(angle+.6)*12,y-Math.sin(angle+.6)*12);
 hctx.strokeStyle='#020711';hctx.lineWidth=7;hctx.stroke();hctx.strokeStyle='#ffdf55';hctx.lineWidth=3;hctx.stroke();
 hctx.font='7px "Arcade",monospace';hctx.textAlign='center';
 const text=aft?'VELOCITY · AFT':'VELOCITY · V',labelWidth=hctx.measureText(text).width+14;
 const labelX=Math.max(labelWidth/2+8,Math.min(width-labelWidth/2-8,(tailX+x)/2));
 const labelY=Math.min(height-24,Math.max(y,tailY)+24);
 hctx.fillStyle='#07121aee';hctx.fillRect(labelX-labelWidth/2,labelY-13,labelWidth,22);
 hctx.strokeStyle='#a18b35';hctx.lineWidth=1;hctx.strokeRect(labelX-labelWidth/2,labelY-13,labelWidth,22);
 hctx.fillStyle='#ffdf55';hctx.fillText(text,labelX,labelY+1);hctx.restore();
}
function drawSelectedImage(observer){
 if(!selectedImageShip)return;
 if(gameOver||selectedImageShip.visualRemoved||Number.isFinite(selectedImageShip.deathTime)){selectedImageShip=null;return}
 const box=directImageBox(selectedImageShip,observer,width,height);if(!box)return;
 hctx.save();hctx.strokeStyle='#7ffff1';hctx.fillStyle='#bafff8';hctx.lineWidth=2;
 hctx.strokeRect(box.left,box.top,box.width,box.height);hctx.font='7px "Arcade",monospace';
 const text=`${selectedImageShip.id} · DIRECT IMAGE`,x=Math.max(8,Math.min(box.left,width-hctx.measureText(text).width-8));
 hctx.fillText(text,x,box.top>=22?box.top-8:Math.min(height-8,box.top+box.height+16));hctx.restore();
}
function drawMissionAim(){
 const target=missionTarget(),aim=target&&reflectedAim(player,target);if(!aim)return;
 drawGuidanceCue(aim.direction,'BANK AIM',`${target.id} · ${Math.round((aim.arrival-player.t)*L_SECONDS)} s`,'#ffd287');
}
function drawDockingAim(){
 if(!dockingActive())return;
 const aim=brakingAim(player);if(!aim)return;
 drawGuidanceCue(aim.direction,'BRAKE THIS WAY','POINT NOSE · W / THRUST','#ffb85c');
}
function drawGuidanceCue(direction,label,detail,color){
 const d=[player.R,player.V,player.F].map(e=>dot(direction,e)),front=d[2]>.02;
 let x=front?width/2+d[0]/d[2]/1.4*height:width/2+Math.atan2(d[0],d[2])*height,
     y=front?height/2-d[1]/d[2]/1.4*height:height/2-Math.asin(Math.max(-1,Math.min(1,d[1])))*height;
 const minY=Math.min(124,height*.45),maxY=Math.max(minY+24,height-Math.min(145,height*.35));
 const onScreen=front&&x>=32&&x<=width-32&&y>=minY&&y<=maxY;
 x=Math.max(32,Math.min(width-32,x));y=Math.max(minY,Math.min(maxY,y));
 hctx.save();hctx.strokeStyle=color;hctx.fillStyle=color;hctx.lineWidth=1.5;
 hctx.beginPath();if(onScreen){hctx.arc(x,y,12,0,TAU);hctx.moveTo(x-18,y);hctx.lineTo(x-7,y);hctx.moveTo(x+7,y);hctx.lineTo(x+18,y)}else{const a=Math.atan2(y-height/2,x-width/2);hctx.moveTo(x+Math.cos(a)*10,y+Math.sin(a)*10);hctx.lineTo(x+Math.cos(a+2.4)*9,y+Math.sin(a+2.4)*9);hctx.lineTo(x+Math.cos(a-2.4)*9,y+Math.sin(a-2.4)*9);hctx.closePath()}hctx.stroke();
 hctx.font='7px "Arcade",monospace';hctx.textAlign=x>width*.6?'right':'left';const labelX=x>width*.6?x-19:x+19;hctx.fillText(label,labelX,y-5);hctx.font='6px "Arcade",monospace';hctx.fillText(detail,labelX,y+10);hctx.restore();
}
// Engine feedback and the player hull share the same current comoving frame.
function projectRocketPoint(observer,ship,local){
 const view=rocketPoint(ship,observer,local);if(!view||view.dir[2]<=.005)return null;
 return [width/2+view.dir[0]/view.dir[2]/1.4*height,height/2-view.dir[1]/view.dir[2]/1.4*height];
}
function drawEnginePlume(observer,ship){
 if(engineLevel<.015)return;
 const project=local=>projectRocketPoint(observer,ship,local);
 const flicker=.86+.1*Math.sin(effectTime*81)+.06*Math.sin(effectTime*137),length=(.012+.045*engineLevel)*flicker;
 const nozzles=engineNozzles(ship,engineMode,exhaust);
 hctx.save();hctx.globalCompositeOperation='lighter';hctx.lineCap='round';
 for(const origin of nozzles){
  const start=project(origin),end=project(origin.map((v,i)=>v+exhaust[i]*length));if(!start||!end)continue;
  const span=Math.hypot(end[0]-start[0],end[1]-start[1]),radius=Math.min(22,Math.max(3,span*.16));
  const glow=hctx.createRadialGradient(...start,0,...start,radius*2.8);glow.addColorStop(0,'#fff5d3');glow.addColorStop(.3,'#ffb64d99');glow.addColorStop(1,'#ff842000');hctx.fillStyle=glow;hctx.fillRect(start[0]-radius*3,start[1]-radius*3,radius*6,radius*6);
  const dx=end[0]-start[0],dy=end[1]-start[1],nx=-dy/Math.max(.001,span),ny=dx/Math.max(.001,span);
  for(const [thickness,fraction,head,tail] of [[radius,.98,'#ff7b32cc','#ff501000'],[radius*.57,.85,'#ffde87','#ff8c3000'],[radius*.23,.65,'#fffef4','#ffdb8600']]){
   const tip=[start[0]+dx*fraction,start[1]+dy*fraction],gradient=hctx.createLinearGradient(...start,...tip);gradient.addColorStop(0,head);gradient.addColorStop(.45,head);gradient.addColorStop(1,tail);hctx.fillStyle=gradient;hctx.shadowColor='#ff9239';hctx.shadowBlur=radius;
   hctx.beginPath();hctx.moveTo(start[0]+nx*thickness,start[1]+ny*thickness);hctx.quadraticCurveTo(start[0]+dx*.35+nx*thickness*.65,start[1]+dy*.35+ny*thickness*.65,...tip);hctx.quadraticCurveTo(start[0]+dx*.35-nx*thickness*.65,start[1]+dy*.35-ny*thickness*.65,start[0]-nx*thickness,start[1]-ny*thickness);hctx.closePath();hctx.fill();
  }
  hctx.shadowBlur=0;
  for(let j=0;j<24;j++){
   const age=(effectTime*(1.5+engineLevel)+j*.6180339)%1,spread=.002+age*.012;
   const point=project(origin.map((v,i)=>v+exhaust[i]*length*(.3+age*1.5)+(i<2?Math.sin(j*17.3+i*7)*spread:0)));if(!point)continue;
   hctx.globalAlpha=engineLevel*(1-age)**2;hctx.fillStyle=j%3?'#ffb761':'#fff2ad';const r=.7+(1-age)*1.4;hctx.fillRect(point[0]-r,point[1]-r,r*2,r*2);
  }
  hctx.globalAlpha=1;
 }
 hctx.restore();
}
function drawExplosion(x,y,age,ship,view){
 if(x<-250||x>width+250||y<-250||y>height+250)return;
 const extent=Math.max(65,Math.min(170,ship.boundRadius*ship.size/Math.max(.08,view.distance)*height*3)),r=extent*(.25+1.35*Math.sqrt(age)),fade=Math.pow(1-age,1.4);
 hctx.save();hctx.globalCompositeOperation='lighter';hctx.globalAlpha=fade;
 const glow=hctx.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,'#fffbe6');glow.addColorStop(.15,'#fff0a0');glow.addColorStop(.4,'#ff742acc');glow.addColorStop(1,'#ff321000');hctx.fillStyle=glow;hctx.fillRect(x-r,y-r,r*2,r*2);
 hctx.strokeStyle='#ffcd7c';hctx.lineWidth=3*(1-age)+1;hctx.beginPath();hctx.ellipse(x,y,r*.9,r*.4,0,0,TAU);hctx.stroke();
 const rand=seeded(2301+fleet.indexOf(ship));
 for(let j=0;j<42;j++){
  const theta=rand()*TAU,travel=r*(.35+rand()*.85),xx=x+Math.cos(theta)*travel,yy=y+Math.sin(theta)*travel,px=3+rand()*7*(1-age);
  hctx.strokeStyle=j%3?'#ff8539':'#fff3b5';hctx.lineWidth=px*.55;hctx.beginPath();hctx.moveTo(xx,yy);hctx.lineTo(xx-Math.cos(theta)*px*3,yy-Math.sin(theta)*px*3);hctx.stroke();hctx.fillStyle=j%3?'#ffb954':'#fffbe1';hctx.fillRect(xx-px/2,yy-px/2,px,px);
 }
 if(age<.12){hctx.globalAlpha=(1-age/.12)*.13;hctx.fillStyle='#ffbc6b';hctx.fillRect(0,0,width,height)}hctx.restore();
}
function drawLaserPulses(observer){
 const visible=[];
 for(const beam of beams){
  // Tracer particles are a simultaneous arcade aid; the pulse itself remains null.
  const phase=player.t-beam.t;if(phase<0||beam.impact)continue;
  const X=laserEvent(beam,phase);if(!X)continue;
  const view={phase,dir:[dot(X,observer.R),dot(X,observer.V),dot(X,observer.F)]};if(view.dir[2]<=.001)continue;
  const x=width/2+view.dir[0]/view.dir[2]/1.4*height,y=height/2-view.dir[1]/view.dir[2]/1.4*height;if(x<-100||x>width+100||y<-100||y>height+100)continue;
  visible.push({beam,view,x,y,distance:Math.hypot(...view.dir)});
 }
 // Nearby returning shots stay visible even after many newer shots are fired.
 visible.sort((a,b)=>a.distance-b.distance);
 for(const {beam,view,x,y} of visible.slice(0,48).reverse()){
  // A luminous tracer is a visibility aid along the exact optical path.
  const points=[];for(let j=0;j<=14;j++){
   const phase=Math.max(0,view.phase-.09*(1-j/14)),X=laserEvent(beam,phase);if(!X){points.push(null);continue}
   const z=dot(X,observer.F);if(z<=.001){points.push(null);continue}
   const a=width/2+dot(X,observer.R)/z/1.4*height,b=height/2-dot(X,observer.V)/z/1.4*height;
   points.push(Math.abs(a-width/2)>width*3||Math.abs(b-height/2)>height*3?null:[a,b]);
  }
  points.push([x,y]);hctx.save();hctx.globalCompositeOperation='lighter';hctx.lineCap='round';hctx.lineJoin='round';
  const traffic=beam.owner==='traffic',glow=traffic?'#35ff9a':'#ff3356';
  for(const [lineWidth,color,blur] of traffic?[[15,'#24ff914d',24],[7,'#50ffa5',16],[2.5,'#effff4',7]]:[[15,'#ff24434d',24],[7,'#ff4a67',16],[2.5,'#fff4ee',7]]){
   hctx.strokeStyle=color;hctx.lineWidth=lineWidth;hctx.shadowBlur=blur;hctx.shadowColor=glow;hctx.beginPath();let previous=null;for(const p of points){if(!p){previous=null;continue}if(!previous||Math.hypot(p[0]-previous[0],p[1]-previous[1])>height*.5)hctx.moveTo(...p);else hctx.lineTo(...p);previous=p}hctx.stroke();
  }
  hctx.fillStyle='#fff9ef';hctx.shadowBlur=25;hctx.beginPath();hctx.arc(x,y,4.5,0,TAU);hctx.fill();hctx.restore();
 }
 const flash=latestPlayerBeam();if(flash&&effectTime-flash.flashTime<.24){
  const [mx,my]=projectRocketPoint(observer,player,laserMuzzle(player))??[width/2,height/2];
  const strength=1-(effectTime-flash.flashTime)/.24,flare=player.upgrades?.cannon?42:26;hctx.save();hctx.translate(mx-width/2,my-height/2);hctx.globalAlpha=strength;hctx.globalCompositeOperation='lighter';hctx.strokeStyle='#ff6179';hctx.lineWidth=6;hctx.shadowBlur=25;hctx.shadowColor='#ff2049';
  if(player.upgrades?.cannon){const glow=hctx.createRadialGradient(width/2,height/2,2,width/2,height/2,flare);glow.addColorStop(0,'#fff2f9');glow.addColorStop(.2,'#ff668dcc');glow.addColorStop(1,'#ff205000');hctx.fillStyle=glow;hctx.fillRect(width/2-flare,height/2-flare,flare*2,flare*2);hctx.beginPath();hctx.arc(width/2,height/2,8+24*(1-strength),0,TAU);hctx.lineWidth=2;hctx.stroke();hctx.lineWidth=6}
  hctx.beginPath();hctx.moveTo(width/2-flare,height/2);hctx.lineTo(width/2+flare,height/2);hctx.moveTo(width/2,height/2-flare);hctx.lineTo(width/2,height/2+flare);hctx.stroke();hctx.strokeStyle='#fff3e9';hctx.lineWidth=2;hctx.stroke();hctx.restore();
 }
}
function formatClock(s){const m=Math.floor(s/60),sec=s%60;return `${String(m).padStart(2,'0')}:${sec.toFixed(2).padStart(5,'0')}`}
function updateUi(){
 const observer=viewObserver(),K=add(observer.U,observer.F,-1,1),lightShift=1/Math.max(.00001,observer.X[1]*K[0]-observer.X[0]*K[1]);
 const shiftType=lightShift>1.025?'blue':lightShift<.975?'red':'neutral';$('lightShift').dataset.shift=shiftType;$('lightShift').textContent=`${shiftType==='blue'?'BLUESHIFT':shiftType==='red'?'REDSHIFT':'SPECTRUM'} ×${lightShift.toFixed(2)}`;
 $('shipOutfit').hidden=!player.upgrades?.frame&&!player.upgrades?.cannon;$('shipOutfit').textContent=[player.upgrades?.frame?'AXIOM INTERCEPTOR':null,player.upgrades?.cannon?'LASER CANNON':null].filter(Boolean).join(' · ');
 const t=telemetry(player);$('speed').textContent=t.beta.toFixed(3);$('speedMeter').style.width=(t.beta*100)+'%';$('radius').innerHTML=t.r.toFixed(3)+' <small>L</small>';$('gamma').innerHTML=t.gamma.toFixed(3)+' <small>γ</small>';$('rho').textContent=t.chi.toFixed(3);$('clockRate').textContent=t.clock.toFixed(3);$('properClock').textContent=formatClock(player.tau*L_SECONDS);$('globalClock').textContent=formatClock(player.t*L_SECONDS);$('fps').textContent=String(Math.round(fps));
 drawMap();if($('mapDialog').open)drawExpandedMap();if(!$('flightMap').hidden)drawFlightMap();
 const latest=latestPlayerBeam(),bounces=latest?bounceCount(latest,player.t):0,clickable=$('app').classList.contains('controls-visible');$('laserStatus').textContent=gameOver?'ROCKET DESTROYED':latest?.impact?(latest.impact.ship===centralShip.id?'ABSORBED BY AXIOM':'SHIP DESTROYED'):bounces?`BOUNCES ${bounces}`:player.upgrades?.cannon?'CANNON READY':'LASER READY';$('laserStats').textContent=shots?`${shots} SHOTS · ${kills} HITS · ${clickable?'HOLD FIRE':'F TO FIRE'}`:clickable?'Hold FIRE to shoot':'F / click to fire';$('fleetLabel').textContent=`${fleet.length-destroyedCount()} VESSELS · ${destroyedCount()} DESTROYED`;
 const missions=flightProgram.getState().missions;$('missionReadout').hidden=!missions.length;
 $('missionProgress').textContent=missions.map(m=>`${m.name.toUpperCase()} · ${m.status==='complete'?'COMPLETE':m.status==='failed'?'FAILED':m.id==='trick-shot'?`${m.reflectedHits}/1 BOUNCE HIT`:`r ${m.radius.toFixed(2)} L · ${m.speed.toFixed(2)} c · ${Math.min(2,m.settled).toFixed(1)}/2 s`}`).join(' | ');
}
function drawExpandedMap(){
 const big=$('expandedMap'),r=big.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(w*360/560));
 if(big.width!==w||big.height!==h){big.width=w;big.height=h}
 const c=big.getContext('2d');c.setTransform(w/560,0,0,h/360,0,0);drawMap(c);
}
function drawFlightMap(){
 const live=$('flightMapCanvas'),r=live.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
 if(live.width!==w||live.height!==h){live.width=w;live.height=h}
 const c=live.getContext('2d'),scale=Math.min(w/560,h/360);
 c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);
 c.setTransform(scale,0,0,scale,(w-560*scale)/2,(h-360*scale)/2);drawMap(c,true);
}
const orbitPaths=new WeakMap();
function cachedOrbitPaths(ship){
 const samples=orbitPolyline(ship),cached=orbitPaths.get(ship);if(cached?.samples===samples)return cached.paths;
 const paths=[[140,[0,2]],[420,[1,2]]].map(([cx,axes])=>{const path=new Path2D();for(let j=0;j<samples.length;j+=3){const x=cx+samples[j+axes[0]]*118,y=173-samples[j+axes[1]]*118;if(j)path.lineTo(x,y);else path.moveTo(x,y)}return path});
 orbitPaths.set(ship,{samples,paths});return paths;
}
const MAP_VELOCITY_SCALE=48,MAP_NOSE_LENGTH=26;
function drawMap(c=mctx,translucent=false){
 c.clearRect(0,0,560,360);
 if(translucent){c.fillStyle='#06132399';c.fillRect(0,0,560,360)}
 const {velocity,nose,speed}=mapVectors(player),braking=dockingActive()&&brakingAim(player);
 for(const [cx,axes,title] of [[140,[0,2],'X / Z'],[420,[1,2],'Y / Z']]){
  const radius=118,cy=173,point=X=>{const q=mapCoordinates(X,axes).point;return [cx+q[0]*radius,cy-q[1]*radius]};
  c.lineWidth=1;c.setLineDash([]);c.font=`${translucent?13:9}px "Arcade",monospace`;c.textAlign='center';c.fillStyle='#a7c9df';c.fillText(title,cx,25);
  for(const r of [1,3,10,Infinity]){const a=r===Infinity?1:compactRadius(r);c.beginPath();c.arc(cx,cy,a*radius,0,TAU);c.strokeStyle=r===Infinity?'#58778c':translucent?'#4c6d87':'#2c4156';c.stroke();c.fillStyle='#829ab0';c.fillText(r===Infinity?'∞':`${r}L`,cx+13,cy-a*radius+11)}
  c.strokeStyle='#273749';c.setLineDash([3,6]);c.beginPath();c.moveTo(cx-radius,cy);c.lineTo(cx+radius,cy);c.moveTo(cx,cy-radius);c.lineTo(cx,cy+radius);c.stroke();c.setLineDash([]);c.textAlign='left';
  const trail=ship=>{c.strokeStyle=ship.boundaryOrbit?'#e9bc7965':translucent?'#6d90be80':'#45659450';c.stroke(cachedOrbitPaths(ship)[cx===140?0:1])};
  for(let i=0;i<fleet.length;i++){const ship=fleet[i];if(Number.isFinite(ship.deathTime))continue;if(i%7===0||ship.boundaryOrbit)trail(ship);const [x,y]=point(geodesicAt(ship,player.t).X);c.fillStyle=ship.boundaryOrbit?'#e9bc79':translucent?'#9dbff5':'#80a6e090';c.fillRect(x-2,y-2,4,4)}
  const target=missionTarget();if(target){const [x,y]=point(geodesicAt(target,player.t).X);c.strokeStyle='#ffd287';c.lineWidth=2;c.beginPath();c.arc(x,y,7,0,TAU);c.stroke();c.lineWidth=1}
  for(const beam of beams.slice(-8)){
   const age=Math.max(0,Math.min(player.t,beam.impact?.time??Infinity)-beam.t),start=Math.max(0,age-Math.PI);c.beginPath();
   for(let j=0;j<=60;j++){const s=start+(age-start)*j/60,q=beam.Q.map((v,i)=>v*Math.cos(s)+beam.D[i]*Math.sin(s)),x=cx+q[axes[0]+1]/(1+Math.abs(q[0]))*radius,y=cy-q[axes[1]+1]/(1+Math.abs(q[0]))*radius;if(j)c.lineTo(x,y);else c.moveTo(x,y)}
   c.strokeStyle=beam.owner==='traffic'?'#50ffa599':'#ff667499';c.lineWidth=1.5;c.stroke();c.lineWidth=1;
  }
  c.save();c.strokeStyle='#d9e6ff';c.lineWidth=1.5;c.beginPath();c.arc(cx,cy,6,0,TAU);c.arc(cx,cy,3,0,TAU);c.moveTo(cx-10,cy);c.lineTo(cx-6,cy);c.moveTo(cx+6,cy);c.lineTo(cx+10,cy);c.stroke();
  c.fillStyle='#d9e6ff';c.font='7px "Arcade",monospace';c.textAlign='center';c.fillText('AXIOM',cx,cy+19);c.restore();
  if(dockingActive()){c.strokeStyle='#ffb85c';c.setLineDash([2,3]);c.beginPath();c.arc(cx,cy,11,0,TAU);c.stroke();c.setLineDash([])}
  const [x,y]=point(player.X);
  // Both panels project the same 3D vectors. Velocity length is linear in
  // beta; the fixed-length nose arrow describes attitude, even at rest.
  if(speed>1e-8){
   const dx=MAP_VELOCITY_SCALE*velocity[axes[0]],dy=-MAP_VELOCITY_SCALE*velocity[axes[1]];
   drawMapArrow(c,x,y,dx,dy,'#bdffff');
   if(braking)drawMapArrow(c,x,y,-30*velocity[axes[0]]/speed,30*velocity[axes[1]]/speed,'#ffb85c');
  }
  // A dashed nose shaft leaves both colors readable when nose and travel align.
  drawMapArrow(c,x,y,MAP_NOSE_LENGTH*nose[axes[0]],-MAP_NOSE_LENGTH*nose[axes[1]],'#f08bff');
  c.beginPath();c.arc(x,y,9,0,TAU);c.strokeStyle='#63e5e660';c.stroke();c.beginPath();c.arc(x,y,4,0,TAU);c.fillStyle='#63e5e6';c.fill();
 }
 c.textAlign='center';c.font=`${translucent?14:10}px "Arcade",monospace`;c.fillStyle='#bdffff';c.fillText(`YOUR RADIUS: ${telemetry(player).r.toFixed(3)} L`,280,322);c.textAlign='left';
 c.font=`${translucent?10:8}px "Arcade",monospace`;c.textAlign='center';
 c.fillStyle='#bdffff';c.fillText('CYAN: VELOCITY',braking?100:140,347);
 c.fillStyle='#f08bff';c.fillText('PINK: NOSE',braking?280:420,347);
 if(braking){c.fillStyle='#ffb85c';c.fillText('AMBER: BRAKE',460,347)}c.textAlign='left';
}
function drawMapArrow(c,x,y,dx,dy,color){
 const length=Math.hypot(dx,dy);if(length<=1e-5)return;
 const ux=dx/length,uy=dy/length,head=Math.min(5,length/3),gap=Math.min(5,length*.2);
 c.save();c.lineJoin='round';c.lineCap='round';
 const stroke=()=>{c.strokeStyle='#061323';c.lineWidth=4;c.stroke();c.strokeStyle=color;c.lineWidth=2;c.stroke()};
 c.setLineDash(color==='#f08bff'?[4,6]:[]);c.beginPath();c.moveTo(x+ux*gap,y+uy*gap);c.lineTo(x+dx,y+dy);stroke();
 c.setLineDash([]);c.beginPath();c.moveTo(x+dx-head*(ux+uy*.65),y+dy-head*(uy-ux*.65));c.lineTo(x+dx,y+dy);c.lineTo(x+dx-head*(ux-uy*.65),y+dy-head*(uy+ux*.65));stroke();c.restore();
}
function tick(now){
 const rawElapsed=Math.max(0,(now-last)/1000),elapsed=Math.min(.06,rawElapsed);last=now;fps=fps*.96+.04/Math.max(.001,rawElapsed);
 pollFrame(!gameOver&&!contextLost&&launched&&$('introScreen').hidden&&!paused&&!document.querySelector('dialog[open]')&&!document.hidden);
 const active=graphicsReady&&!gameOver&&!contextLost&&launched&&$('introScreen').hidden&&!paused&&!document.querySelector('dialog[open]')&&!document.hidden;
 if(active){const turn=.65*elapsed;rotate(player,((held('ArrowRight')?1:0)-(held('ArrowLeft')?1:0))*turn,((held('ArrowUp')?1:0)-(held('ArrowDown')?1:0))*turn,((held('KeyQ')?1:0)-(held('KeyE')?1:0))*turn)}
 const command=burnCommand(player,active&&held('KeyW'),active&&held('KeyS'),active&&held('Space'),accel),demand=command.level;
 thrustForce=command.force;chaseCamera.force=command.force.slice();
 engineLevel+=(demand-engineLevel)*(1-Math.exp(-elapsed/(demand?.055:.09)));
 if(engineLevel<.001)engineLevel=0;
 if(demand){engineMode=command.mode;exhaust=command.exhaust}
 score.setThrust(demand,engineMode);
 if(active){
  effectTime+=elapsed;
  const h=elapsed*1.5*warp/L_SECONDS,n=Math.max(1,Math.ceil(h/.004)),thrust=command.thrust;
  for(let i=0;i<n;i++){
   const beforeTau=player.tau;
   advance(player,h/n,thrust,command.brake,(segment,endTime)=>{
    const impacts=advanceTraffic(trafficFire,beams,endTime,segment);
    for(const hit of impacts){if(hit.ship.isPlayer){endFlight();return {stopAt:hit.time}}if(hit.ship.indestructible){dirty=true;continue}if(hit.beam.owner!=='traffic')kills++;flightProgram.hit(hit);if(flightProgram.accepted.has('trick-shot')&&trickMission().status==='active'&&hit.beam.owner==='player')notify('Direct hit · Trick Shot needs a boundary bounce');lastImpact=hit;dirty=true}
   });
   chaseCamera.advance(player.tau-beforeTau,command.force);
   if(gameOver){$('gameOverStats').textContent=`${formatClock(player.tau*L_SECONDS)} PROPER TIME · ${kills} SHIPS DESTROYED`;break}
   flightProgram.sample(player);
   if(!Number.isFinite(player.X[0])||Math.abs(dot(player.X,player.X)+1)>1e-3){setPause(true);notify('Numerical precision limit reached near the boundary. Reset to continue.');break}
  }
  if(held('KeyF'))fire();
  if(beams.length>8)beams=beams.filter((beam,i)=>!beam.impact||i>=beams.length-8);
  if(!gameOver){announceMissions();const offer=flightProgram.advance(rawElapsed);if(offer)offerMission(offer)}
 }
 if(gameOver&&deathAnimation<EXPLOSION_SECONDS){deathAnimation+=rawElapsed;dirty=true;if(deathAnimation>=EXPLOSION_SECONDS){$('gameOverScreen').hidden=false;$('retryButton').focus({preventScroll:true})}}
 if(!document.hidden&&(active||dirty))draw(active);if(now-lastUi>100){updateUi();lastUi=now}frame++;requestAnimationFrame(tick);
}
// State read-back is useful for scientific inspection and automated validation.
window.adsFlight={getState:()=>({launched,gameOver,flightProgram:flightProgram.getState(),storyVisible:!$('introScreen').hidden,storyParagraph:$('introScreen').hidden?null:introStep+1,storyParagraphs:introPages.length,pilot:pilotNames[pilot],upgrades:{frame:!!player.upgrades?.frame,cannon:!!player.upgrades?.cannon},radioVisible:!$('diracRadio').hidden,music:score.playing,shipColor:pilotColors[pilot],engine:{level:engineLevel,mode:engineMode,soundLevel:score.thrustLevel,force:thrustForce.slice(),exhaust:exhaust.slice()},chaseCamera:{lag:chaseCamera.lag,rate:chaseCamera.rate},selectedImageShip:selectedImageShip?.id??null,velocityArrow:velocityArrowEnabled,camera:chase?'chase':'cockpit',globalTime:player.t,properTime:player.tau,paused,warp,properAcceleration:accel,baseSpeed:1.5,effectiveSpeed:1.5*warp,grid,controlsVisible:$('app').classList.contains('controls-visible'),activeControls:gameKeys.filter(held),renderer:{ready:graphicsReady&&!contextLost,status:graphicsState,frames:renderedFrames,traffic:renderedTraffic,width:canvas.width,height:canvas.height,quality:resolution.mode,pixelBudget:Math.round(resolution.budget),minimumPixels:Math.round(resolution.floor),maximumPixels:Math.round(resolution.ceiling)},explosions:fleet.filter(s=>s.explosionStarted!==undefined&&!s.visualRemoved).length,removedShips:fleet.filter(s=>s.visualRemoved).length,telemetry:telemetry(player),constraints:{position:dot(player.X,player.X),velocity:dot(player.U,player.U),orthogonality:dot(player.X,player.U)},fleetCount:fleet.length,fleetRoster:fleet.map(s=>({ship:s.id,honoree:s.honoree})),aliveShips:fleet.length-destroyedCount(),trafficShots:trafficFire.shots,armedShips:trafficFire.shooters.filter(s=>!Number.isFinite(s.ship.deathTime)).length,shots,kills,latestBeam:beams.length?{reflections:bounceCount(beams.at(-1),player.t),impact:beams.at(-1).impact}:null,boundaryOrbiters:fleet.filter(s=>s.boundaryOrbit).map(s=>({id:s.id,radius:norm3(geodesicAt(s,player.t).X.slice(2)),alive:!Number.isFinite(s.deathTime)}))}),reset,setPause,selectPilot,launch,fire,setCamera,setShipCount};
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const specs=[
  {name:'read_ads_flight_state',description:'Read rocket clocks, global velocity in optical space, simulation settings, and numerical constraints.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');return window.adsFlight.getState()}},
  {name:'launch_ads_flight',description:'Launch with the selected pilot and show the opening story; Begin Flight starts the clocks.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');launch();return window.adsFlight.getState()}},
  {name:'select_ads_pilot',description:'Select one of the five visible arcade physicist avatars and update the cockpit pilot.',inputSchema:{type:'object',properties:{pilotIndex:{type:'integer',minimum:0,maximum:4}},required:['pilotIndex'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='pilotIndex')||!Number.isInteger(input.pilotIndex))throw Error('Invalid pilot selection');selectPilot(input.pilotIndex);return window.adsFlight.getState()}},
  {name:'fire_ads_laser',description:'Fire a laser pulse along the rocket nose. It reflects at the AdS boundary and destroys the first hull it hits, including your rocket on return.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');return {fired:fire(),state:window.adsFlight.getState()}}},
  {name:'set_ads_camera',description:'Switch the visible game between a chase view showing your rocket and its cockpit view.',inputSchema:{type:'object',properties:{view:{type:'string',enum:['chase','cockpit']}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='view'))throw Error('Invalid camera setting');setCamera(input.view);return window.adsFlight.getState()}},
  {name:'configure_ads_flight',description:'Set the visible pause state or time-warp control in the flight simulation.',inputSchema:{type:'object',properties:{paused:{type:'boolean'},warp:{type:'number',enum:[1,2,5,10]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>!['paused','warp'].includes(k))||('paused'in input&&typeof input.paused!=='boolean')||('warp'in input&&![1,2,5,10].includes(input.warp)))throw Error('Invalid flight settings');if('paused'in input)setPause(input.paused);if('warp'in input){warp=input.warp;$('warp').value=String(warp)}updateUi();return window.adsFlight.getState()}}
 ];
 for(const tool of specs){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn)}catch(e){console.warn(e)}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
// Paint pilot selection before cold shader compilation can occupy the main thread.
resize();updateUi();requestAnimationFrame(()=>requestAnimationFrame(()=>{initRenderer();resize();last=performance.now();requestAnimationFrame(tick)}));
