import {dot,add,scale,norm3,TAU,eventAt,staticFrame,initialPlayer,advance,rotate,telemetry,makeFleet,geodesicAt,retarded,shipBounds,seeded,chaseObserver,snapshot} from './physics.js?v=10';
import {ResolutionController} from './resolution.js?v=6';
import {ArcadeScore} from './music.js?v=10';
import {createLaser,advanceLasers,bounceCount,retardedLaser,laserEvent} from './lasers.js?v=11';
import {TrafficFire,advanceTraffic} from './traffic.js?v=11';
import {burnCommand} from './flight-controls.js?v=13';
import {ChaseCamera,rocketPoint} from './chase.js?v=13';
import {FlightMission,reflectedAim} from './missions.js?v=14';
const $=id=>document.getElementById(id),canvas=$('space'),hud=$('overlay'),map=$('map');
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
const fleet=makeFleet(72),L_SECONDS=30,keys=new Set(),trafficFire=new TrafficFire(fleet);
const latestPlayerBeam=()=>{for(let i=beams.length-1;i>=0;i--)if(beams[i].owner!=='traffic')return beams[i];return null};
const destroyedCount=()=>fleet.filter(s=>Number.isFinite(s.deathTime)).length;
let player=initialPlayer(),paused=false,grid=true,warp=1,accel=1.5,last=performance.now(),width=1,height=1,frame=0,lastUi=0,fps=60,drag=null,noticeTimer;
let gameOver=false,deathAnimation=0;
let launched=false,dirty=true,pendingFence=null,musicWanted=true,effectTime=0,renderedFrames=0,renderedTraffic=72,contextLost=false;const score=new ArcadeScore();
const EXPLOSION_SECONDS=1.6,touchHolds=new Map();
let chase=true,beams=[],lastShot=-Infinity,kills=0,shots=0,lastImpact=null;
const mission=new FlightMission();let missionResultShown=false,missionTargetId=null;
function missionTarget(){if(mission.id!=='trick-shot'||mission.status!=='active')return null;let target=fleet.find(s=>s.id===missionTargetId&&!Number.isFinite(s.deathTime));if(!target){target=fleet.find(s=>!Number.isFinite(s.deathTime));missionTargetId=target?.id??null}return target}
const gpuInfo=gl?.getExtension('WEBGL_debug_renderer_info'),softwareRenderer=gpuInfo&&/SwiftShader|llvmpipe|Software|softpipe/i.test(gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL));
const resolution=new ResolutionController({software:!!softwareRenderer,coarse:matchMedia('(pointer: coarse)').matches});
let gpuStarted=0,gpuLastPoll=0,gpuSampleValid=false;
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
function reset(){gameOver=false;deathAnimation=0;$('gameOverScreen').hidden=true;if($('missionResultDialog').open)$('missionResultDialog').close();mission.reset();missionResultShown=false;missionTargetId=null;setPause(false);player=initialPlayer();chaseCamera.reset();thrustForce=[0,0,0];trafficFire.reset();beams=[];kills=0;shots=0;lastShot=-Infinity;lastImpact=null;effectTime=0;fleet.forEach(s=>{delete s.deathTime;delete s.deathPoint;delete s.explosionStarted;delete s.visualRemoved});dirty=true;clearControls();updateUi();notify('Flight reset · ships and clocks restored')}
function fire(){if(contextLost||gameOver||!launched||!$('introScreen').hidden||paused||document.querySelector('dialog[open]')||player.tau-lastShot<.012)return false;lastShot=player.tau;const beam=createLaser(player,fleet);beam.flashTime=effectTime;beams.push(beam);shots++;score.laser();dirty=true;return true}
$('fireButton').onclick=fire;
$('retryButton').onclick=()=>{reset();canvas.focus({preventScroll:true})};
function endFlight(){
 gameOver=true;deathAnimation=0;if(!missionResultShown)mission.fail();clearControls();score.explosion();dirty=true;
 $('laserStatus').textContent='ROCKET DESTROYED';
}

$('touchPause').onclick=()=>setPause(!paused);
$('touchCamera').onclick=()=>setCamera(chase?'cockpit':'chase');
function setCamera(view){if(!['chase','cockpit'].includes(view))throw Error('Unknown camera view');chase=view==='chase';dirty=true;$('cameraButton').textContent=chase?'Cockpit':'Chase';$('touchCamera').textContent=chase?'COCKPIT':'CHASE';$('viewLabel').textContent=chase?'CHASE VIEW':'COCKPIT VIEW';$('cameraButton').setAttribute('aria-label',chase?'Switch to cockpit view':'Switch to chase view');canvas.setAttribute('aria-label',chase?'Ray-traced chase view of your rocket':'Ray-traced view from your rocket cockpit')}
$('cameraButton').onclick=()=>setCamera(chase?'cockpit':'chase');
async function setMusic(value){musicWanted=value;$('launchSound').textContent=value?'SOUND ON':'SOUND OFF';$('launchSound').setAttribute('aria-pressed',String(value));$('musicButton').innerHTML=`<span>Sound ${value?'on':'off'}</span>`;$('musicButton').setAttribute('aria-pressed',String(value));if(value){try{await score.start()}catch{notify('Audio could not start. Toggle Sound to try again.')}}else score.stop()}
const introPages=[...document.querySelectorAll('[data-intro-paragraph]')];let introStep=0;
function renderIntro(){introPages.forEach((p,i)=>p.hidden=i!==introStep);$('introProgress').textContent=`${introStep+1} / ${introPages.length}`;$('introScreen').setAttribute('aria-describedby',introPages[introStep].id);$('introContinue').textContent=introStep===introPages.length-1?'BEGIN FLIGHT →':'NEXT →';document.querySelector('.intro-body').scrollTop=0}
function nextIntro(){if($('introScreen').hidden)return;if(++introStep===introPages.length)beginFlight();else renderIntro()}
function beginFlight(){$('introScreen').close();$('introScreen').hidden=true;$('app').inert=false;document.body.classList.remove('story-open');last=performance.now();canvas.focus({preventScroll:true});notify(`Welcome aboard, ${pilotNames[pilot]} · W to burn, arrow keys to steer`)}
$('introContinue').onclick=nextIntro;$('introClose').onclick=nextIntro;$('introScreen').addEventListener('cancel',e=>{e.preventDefault();nextIntro()});
function launch(){if(launched)return;launched=true;$('launchScreen').hidden=true;introStep=0;renderIntro();$('introScreen').hidden=false;$('introScreen').showModal();clearControls();document.body.classList.add('story-open');$('introClose').focus({preventScroll:true});last=performance.now();dirty=true;if(musicWanted)void setMusic(true)}
$('launchButton').onclick=launch;$('launchSound').onclick=()=>void setMusic(!musicWanted);$('musicButton').onclick=()=>void setMusic(!musicWanted);
function openDialog(id){clearControls();$(id).showModal()}
function startMission(id){mission.select(id);if($('missionDialog').open)$('missionDialog').close();reset();canvas.focus({preventScroll:true});notify(`${mission.getState().name} · ${id==='trick-shot'?'land a reflected laser hit':id==='clock-race'?'earn 15 seconds of clock advantage':'explore AdS'}`)}
$('missionButton').onclick=()=>openDialog('missionDialog');$('gameOverMissions').onclick=()=>openDialog('missionDialog');
document.querySelectorAll('[data-mission]').forEach(b=>b.onclick=()=>startMission(b.dataset.mission));
$('missionNextButton').onclick=()=>{$('missionResultDialog').close();openDialog('missionDialog')};
$('missionReplayButton').onclick=()=>{reset();canvas.focus({preventScroll:true})};
function showMissionResult(){if(mission.status!=='complete'||missionResultShown||gameOver)return;missionResultShown=true;const result=mission.result;$('missionResultTitle').textContent=`${mission.getState().name} complete`;$('missionResultText').textContent=mission.id==='trick-shot'?`Your laser destroyed ${result.ship} after ${result.reflections} boundary reflection${result.reflections===1?'':'s'}. Impact at ${formatClock(result.time*L_SECONDS)} global time.`:`Global AdS time: ${formatClock(result.globalTime*L_SECONDS)}. Onboard proper time: ${formatClock(result.properTime*L_SECONDS)}. Your clock advantage is ${result.clockLead.toFixed(2)} seconds.`;openDialog('missionResultDialog')}
function openMap(){openDialog('mapDialog');drawExpandedMap()}
$('expandMapButton').onclick=openMap;
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
$('warp').onchange=e=>{warp=Number(e.target.value);notify(`Time warp ${warp}× · all clocks and trajectories advance together`)};
$('graphicsQuality').onchange=e=>{resolution.setMode(e.target.value);resize();dirty=true};
$('thrust').oninput=e=>{accel=Number(e.target.value);$('thrustValue').value=accel.toFixed(1)};
$('fullscreenButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{notify('Fullscreen is unavailable in this browser')}};
const gameKeys=['KeyW','KeyS','KeyQ','KeyE','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(!launched){if(e.code==='Enter'&&e.target.id!=='launchSound'){e.preventDefault();if(!e.repeat){launch()}}else if($('introScreen').hidden&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();const delta=['ArrowRight','ArrowDown'].includes(e.code)?1:-1;selectPilot((pilot+delta+pilotNames.length)%pilotNames.length);document.querySelector(`[data-launch-pilot="${pilot}"]`).focus()}return}if(!$('introScreen').hidden){if(e.code==='Enter'){e.preventDefault();if(!e.repeat)nextIntro()}return}if(e.code==='KeyM'&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&(!document.querySelector('dialog[open]')||$('mapDialog').open)){e.preventDefault();if(!e.repeat){if($('mapDialog').open)$('mapDialog').close();else openMap()}return}if(gameOver){if(!document.querySelector('dialog[open]')&&!e.repeat&&(e.code==='KeyR'||e.code==='Enter')){e.preventDefault();reset();canvas.focus({preventScroll:true})}return}if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(contextLost)return;if(gameKeys.includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)fire()}if(!e.repeat&&e.code==='KeyP')setPause(!paused);if(!e.repeat&&e.code==='KeyR')reset()});
document.addEventListener('focusin',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))clearControls()});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{clearControls();last=performance.now()});
canvas.addEventListener('pointerdown',e=>{if(contextLost||gameOver||!launched||paused)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||paused)return;rotate(player,(e.clientX-drag.x)*.003,-(e.clientY-drag.y)*.003,0);dirty=true;drag={...drag,x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)fire();drag=null});canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('lostpointercapture',()=>drag=null);
document.querySelectorAll('[data-key]').forEach(b=>{
 b.addEventListener('pointerdown',e=>{e.preventDefault();if(contextLost||gameOver||!launched||!$('introScreen').hidden||paused||document.querySelector('dialog[open]'))return;touchHolds.set(e.pointerId,b);b.classList.add('pressed');b.setPointerCapture(e.pointerId);if(b.dataset.key==='KeyF')fire()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{touchHolds.delete(e.pointerId);if(![...touchHolds.values()].includes(b))b.classList.remove('pressed')});
 b.addEventListener('click',e=>{if(contextLost||gameOver||!launched||!$('introScreen').hidden||paused)return;if(e.detail===0){if(b.dataset.key==='KeyF')fire();else{const token=Symbol();touchHolds.set(token,b);b.classList.add('pressed');setTimeout(()=>{touchHolds.delete(token);if(![...touchHolds.values()].includes(b))b.classList.remove('pressed')},140)}}});
});
let program,skyTexture,shipTexture,locations={},fleetData=new Float32Array(9*73*4);
function initRenderer(){
 if(!gl){notify('This flight simulator needs a browser with WebGL 2. Try a current browser with graphics acceleration enabled.');return}
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
 uniform float showGrid;
 uniform float observerTime;
 uniform int shipCount;
 uniform vec3 playerColor;
 uniform float engineBurn;
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
   if(abs(screen.x-bounds.x)>bounds.z||abs(screen.y-bounds.y)>bounds.z)continue;
   vec4 pos=data(i,0),vel=data(i,1);
   vec3 nc=-vel.xyz+d.x*data(i,2).xyz+d.y*data(i,3).xyz+d.z*data(i,4).xyz;
   float size=pos.w;
   int kind=int(data(i,4).w+.5);
   vec3 radii=vec3(.013,.014,.047)*size,center=vec3(0);
   float h=0.0,etaHit=1.0,bestDelay=nearest;int part=0;bool found=false;
   bool own=data(i,2).w>.5;
   int pieces=kind==3?6:kind==1?4:2;
   for(int piece=0;piece<pieces;piece++){
    vec3 rr,cc;bool enabled=true;
    if(kind==0){
     if(piece==0){rr=vec3(.013,.014,.047);cc=vec3(0);}else if(piece==1){rr=vec3(.043,.0035,.020);cc=vec3(0,-.005,-.008);}else enabled=false;
    }else if(kind==1){
     // Discovery: spherical command module, long narrow spine, rear engine block.
     if(piece==0){rr=vec3(.024);cc=vec3(0,0,.068);}
     else if(piece==1){rr=vec3(.005,.005,.071);cc=vec3(0,0,-.005);}
     else if(piece==2){rr=vec3(.026,.018,.023);cc=vec3(0,0,-.078);}
     else if(piece==3){rr=vec3(.012,.014,.023);cc=vec3(0,0,.022);}
     else enabled=false;
    }else if(kind==2){
     // Heighliner: an immense elongated carrier with a dark recessed bow.
     if(piece==0){rr=vec3(.041,.042,.106);cc=vec3(0);}
     else if(piece==1){rr=vec3(.053,.016,.044);cc=vec3(0,-.022,-.050);}
     else enabled=false;
    }else{
     // Saucer, engineering section, twin nacelles, cross-pylon and neck.
     if(piece==0){rr=vec3(.054,.007,.043);cc=vec3(0,.015,.032);}
     else if(piece==1){rr=vec3(.015,.015,.048);cc=vec3(0,-.018,-.030);}
     else if(piece==2){rr=vec3(.009,.009,.055);cc=vec3(-.041,.006,-.050);}
     else if(piece==3){rr=vec3(.009,.009,.055);cc=vec3(.041,.006,-.050);}
     else if(piece==4){rr=vec3(.044,.004,.008);cc=vec3(0,-.002,-.045);}
     else{rr=vec3(.007,.020,.014);cc=vec3(0,0,.007);}
    }
    if(!enabled)continue;
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
   vec3 base=kind==1?vec3(.82,.80,.72):kind==2?vec3(.37,.32,.25):kind==3?vec3(.67,.73,.79):mix(vec3(.31,.39,.47),vec3(.57,.62,.67),vel.w);
   if(own)base=playerColor;
   vec3 hull=base*lighting;
   float edge=pow(1.0-abs(dot(normal,normalize(nc))),2.0);
   hull+=vec3(.04,.20,.28)*edge;
   if(kind==0){
    if(part==0&&local.z>radii.z*.36&&abs(local.x)<radii.x*.7)hull=vec3(.10,.55,.72)*(.7+.3*lighting);
    if(part==0&&local.z<-radii.z*.79)hull=own?mix(vec3(.05,.07,.09),vec3(1.0,.48,.12)*1.8,engineBurn):vec3(1.0,.39,.11)*1.4;
    if(part==1&&abs(local.x)>radii.x*.82)hull=vec3(.25,.94,.98);
   }else if(kind==1){
    if(part==0&&abs(local.y)<radii.y*.16&&local.z>0.0)hull=vec3(.045,.13,.18);
    if(part==2&&local.z<-radii.z*.8)hull=vec3(.28,.57,1.0);
   }else if(kind==2){
    if(part==0&&local.z>radii.z*.85)hull=vec3(.015,.020,.026);
    if(part==0&&abs(local.y)<.002*size&&abs(local.z)<.085*size)hull=vec3(.42,.32,.10);
   }else{
    if((part==2||part==3)&&local.z>radii.z*.77)hull=vec3(1.0,.19,.10);
    if((part==2||part==3)&&abs(local.x)>radii.x*.65)hull=vec3(.15,.46,1.0);
    if(part==0&&abs(local.y)<.004*size&&local.z>.018*size)hull=vec3(.25,.45,.63);
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
  program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());
  for(const n of ['resolution','Xt','Ut','Rt','Vt','Ft','Xs','Us','Rs','Vs','Fs','showGrid','sky','fleet','shipCount','observerTime','playerColor','engineBurn'])locations[n]=gl.getUniformLocation(program,n);
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
  shipTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shipTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,9,73,0,gl.RGBA,gl.FLOAT,fleetData);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(locations.sky,0);gl.uniform1i(locations.fleet,1);
  if(gl.getError()!==gl.NO_ERROR)throw Error('Unable to initialize the ray-tracing textures');
 }catch(e){console.error(e);notify('The flight renderer could not start. Try reloading with graphics acceleration enabled.');program=null}
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clearControls();contextLost=true;program=null;pendingFence=null;notify('Graphics interrupted · restoring the view…')});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;initRenderer();resize();dirty=true;notify('Graphics restored')});
initRenderer();
function resize(){
 const r=canvas.getBoundingClientRect(),dimensions=resolution.configure(r.width,r.height,window.devicePixelRatio||1,matchMedia('(pointer: coarse)').matches);
 width=r.width;height=r.height;canvas.width=dimensions.width;canvas.height=dimensions.height;gpuSampleValid=false;
 const hudDpr=Math.min(window.devicePixelRatio||1,2);hud.width=Math.max(1,Math.round(width*hudDpr));hud.height=Math.max(1,Math.round(height*hudDpr));hctx.setTransform(hudDpr,0,0,hudDpr,0,0);
 if(gl)gl.viewport(0,0,canvas.width,canvas.height);
 dirty=true;
}
new ResizeObserver(resize).observe(canvas.parentElement);
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
function row(i,col,values){fleetData.set(values,(i*9+col)*4)}
function draw(active=false){
 if(gl&&program&&!contextLost&&pendingFence){const poll=performance.now();gpuSampleValid=gpuSampleValid&&active&&poll-gpuLastPoll<250;gpuLastPoll=poll;
  const status=gl.clientWaitSync(pendingFence,0,0);if(status===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(pendingFence);pendingFence=null;
  if(resolution.observe(poll-gpuStarted,{active,continuous:gpuSampleValid}))resize();
 }
 const observer=viewObserver();
 hctx.clearRect(0,0,width,height);hctx.font='7px "Arcade",monospace';let labeled=0;
 const views=new Map(),traffic=fleet.filter(s=>{
  if(s.visualRemoved)return false;
  const view=retarded(s,observer);views.set(s,view);
  if(Number.isFinite(s.deathTime)&&view&&observer.t-view.delay>=s.deathTime){
   if(s.explosionStarted===undefined){s.explosionStarted=effectTime;score.explosion()}
   if(effectTime-s.explosionStarted>=EXPLOSION_SECONDS){s.visualRemoved=true;return false}
  }
  return true;
 });
 renderedTraffic=traffic.length;
 for(const s of traffic){
  const view=views.get(s);if(!view||view.dir[2]<=.03)continue;
  const x=width/2+view.dir[0]/view.dir[2]/1.4*height,y=height/2-view.dir[1]/view.dir[2]/1.4*height;
  if(s.explosionStarted!==undefined){drawExplosion(x,y,(effectTime-s.explosionStarted)/EXPLOSION_SECONDS,s,view);continue}
  if(Number.isFinite(s.deathTime))continue;
  if(x>50&&x<width-105&&y>85&&y<height-120&&labeled<10){
   labeled++;const size=Math.max(7,Math.min(24,.065*s.size/Math.max(.07,view.distance)*height));
   hctx.strokeStyle='rgba(119,172,207,.38)';hctx.lineWidth=.7;
   for(const [a,b,c,e] of [[-1,-1,1,1],[1,-1,-1,1],[-1,1,1,-1],[1,1,-1,-1]]){hctx.beginPath();hctx.moveTo(x+a*size+c*5,y+b*size);hctx.lineTo(x+a*size,y+b*size);hctx.lineTo(x+a*size,y+b*size+e*5);hctx.stroke()}
   hctx.fillStyle='rgba(168,199,224,.68)';hctx.fillText(s.id,x+size+8,y-3);
   hctx.fillStyle='rgba(117,151,184,.62)';hctx.fillText(`Δt ${(view.delay*L_SECONDS).toFixed(1)} s`,x+size+8,y+11);
  }
 }
 // A current-frame proxy makes our own hull and immediate engine cues agree.
 // The observer, surrounding traffic and laser rays still use the AdS geometry.
 const ownState=chase&&!gameOver?player:null;
 if(ownState){drawEnginePlume(observer,ownState);drawThrustDirection(observer,ownState)}
 drawLaserPulses(observer);
 drawMissionAim();
 if(gameOver&&deathAnimation<EXPLOSION_SECONDS)drawExplosion(width/2,height*.68,Math.min(.999,deathAnimation/EXPLOSION_SECONDS),{boundRadius:.065,size:.8}, {distance:.17});
 if(!gl||!program||contextLost)return;
 gl.useProgram(program);
 for(const name of ['X','U','R','V','F']){gl.uniform2fv(locations[name+'t'],observer[name].slice(0,2));gl.uniform3fv(locations[name+'s'],observer[name].slice(2))}
 gl.uniform1f(locations.observerTime,observer.t);
 gl.uniform2f(locations.resolution,canvas.width,canvas.height);gl.uniform1f(locations.showGrid,grid?1:0);
 gl.uniform3fv(locations.playerColor,[1,3,5].map(i=>parseInt(pilotColors[pilot].slice(i,i+2),16)/255));gl.uniform1f(locations.engineBurn,engineMode==='forward'?engineLevel:0);
 const visible=ownState?[...traffic,{id:'YOUR ROCKET',A:ownState.X,B:ownState.U,C:[ownState.R,ownState.V,ownState.F],kind:0,size:.8,hue:.95,boundRadius:.065,own:true}]:traffic;
 gl.uniform1i(locations.shipCount,visible.length);
 visible.forEach((s,i)=>{
  row(i,0,[...s.C.map(c=>dot(observer.X,c)),s.size]);row(i,1,[...s.C.map(c=>dot(observer.U,c)),s.hue]);
  for(const [j,k] of [[2,'R'],[3,'V'],[4,'F']])row(i,j,[...s.C.map(c=>dot(observer[k],c)),j===4?s.kind:j===2&&s.own?1:0]);
  row(i,5,[dot(observer.X,s.A),dot(observer.X,s.B),dot(observer.U,s.A),dot(observer.U,s.B)]);
  row(i,6,[dot(observer.R,s.A),dot(observer.R,s.B),dot(observer.V,s.A),dot(observer.V,s.B)]);row(i,7,[dot(observer.F,s.A),dot(observer.F,s.B),0,0]);
  const bounds=shipBounds(s,observer,3/canvas.height,!s.own);bounds[3]=Number.isFinite(s.deathTime)?s.deathTime:-1;row(i,8,bounds);
 });
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shipTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,9,73,gl.RGBA,gl.FLOAT,fleetData);gl.drawArrays(gl.TRIANGLES,0,3);
 pendingFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();gpuStarted=performance.now();gpuLastPoll=gpuStarted;gpuSampleValid=active;dirty=false;renderedFrames++;
}
function drawMissionAim(){
 const target=missionTarget(),aim=target&&reflectedAim(player,target);if(!aim)return;
 const d=[player.R,player.V,player.F].map(e=>dot(aim.direction,e)),front=d[2]>.02;
 let x=front?width/2+d[0]/d[2]/1.4*height:width/2+Math.atan2(d[0],d[2])*height,
     y=front?height/2-d[1]/d[2]/1.4*height:height/2-Math.asin(Math.max(-1,Math.min(1,d[1])))*height;
 const minY=Math.min(124,height*.45),maxY=Math.max(minY+24,height-Math.min(145,height*.35));
 const onScreen=front&&x>=32&&x<=width-32&&y>=minY&&y<=maxY;
 x=Math.max(32,Math.min(width-32,x));y=Math.max(minY,Math.min(maxY,y));
 hctx.save();hctx.strokeStyle='#ffd287';hctx.fillStyle='#ffd287';hctx.lineWidth=1.5;
 hctx.beginPath();if(onScreen){hctx.arc(x,y,12,0,TAU);hctx.moveTo(x-18,y);hctx.lineTo(x-7,y);hctx.moveTo(x+7,y);hctx.lineTo(x+18,y)}else{const a=Math.atan2(y-height/2,x-width/2);hctx.moveTo(x+Math.cos(a)*10,y+Math.sin(a)*10);hctx.lineTo(x+Math.cos(a+2.4)*9,y+Math.sin(a+2.4)*9);hctx.lineTo(x+Math.cos(a-2.4)*9,y+Math.sin(a-2.4)*9);hctx.closePath()}hctx.stroke();
 hctx.font='7px "Arcade",monospace';hctx.textAlign=x>width*.6?'right':'left';const labelX=x>width*.6?x-19:x+19;hctx.fillText('BANK AIM',labelX,y-5);hctx.font='6px "Arcade",monospace';hctx.fillText(`${target.id} · ${Math.round((aim.arrival-player.t)*L_SECONDS)} s`,labelX,y+10);hctx.restore();
}
// Engine feedback and the player hull share the same current comoving frame.
function projectRocketPoint(observer,ship,local){
 const view=rocketPoint(ship,observer,local);if(!view||view.dir[2]<=.005)return null;
 return [width/2+view.dir[0]/view.dir[2]/1.4*height,height/2-view.dir[1]/view.dir[2]/1.4*height];
}
function drawThrustDirection(observer,ship){
 const magnitude=Math.hypot(...thrustForce);if(magnitude<1e-8)return;
 const direction=thrustForce.map(v=>v/magnitude),start=projectRocketPoint(observer,ship,direction.map(v=>v*.020)),end=projectRocketPoint(observer,ship,direction.map(v=>v*.084));if(!start||!end)return;
 const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);if(length<3||start[0]<18||start[0]>width-18||start[1]<18||start[1]>height-18)return;const nx=dx/length,ny=dy/length;
 // Keep the cue readable even when an aft-pointing arrow is foreshortened.
 let span=Math.min(length,68);if(nx>0)span=Math.min(span,(width-18-start[0])/nx);if(nx<0)span=Math.min(span,(18-start[0])/nx);if(ny>0)span=Math.min(span,(height-18-start[1])/ny);if(ny<0)span=Math.min(span,(18-start[1])/ny);end[0]=start[0]+nx*span;end[1]=start[1]+ny*span;
 hctx.save();hctx.strokeStyle='#78ffdc';hctx.fillStyle='#b2ffec';hctx.lineWidth=2;hctx.shadowBlur=7;hctx.shadowColor='#39edbd';hctx.beginPath();hctx.moveTo(...start);hctx.lineTo(...end);hctx.moveTo(end[0]-nx*7-ny*4,end[1]-ny*7+nx*4);hctx.lineTo(...end);hctx.lineTo(end[0]-nx*7+ny*4,end[1]-ny*7-nx*4);hctx.stroke();hctx.font='7px "Arcade",monospace';hctx.fillText('THRUST',Math.min(width-60,Math.max(8,end[0]+8)),Math.max(14,end[1]-5));hctx.restore();
}
function drawEnginePlume(observer,ship){
 if(engineLevel<.015)return;
 const project=local=>projectRocketPoint(observer,ship,local);
 const flicker=.86+.1*Math.sin(effectTime*81)+.06*Math.sin(effectTime*137),length=(.012+.045*engineLevel)*flicker;
 const nozzles=engineMode==='forward'?[[0,0,-.039]]:engineMode==='reverse'?[[-.017,0,.022],[.017,0,.022]]:[exhaust.map(v=>v*.021)];
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
  const [mx,my]=projectRocketPoint(observer,player,[0,0,.04])??[width/2,height/2];
  const strength=1-(effectTime-flash.flashTime)/.24;hctx.save();hctx.translate(mx-width/2,my-height/2);hctx.globalAlpha=strength;hctx.globalCompositeOperation='lighter';hctx.strokeStyle='#ff6179';hctx.lineWidth=6;hctx.shadowBlur=25;hctx.shadowColor='#ff2049';
  hctx.beginPath();hctx.moveTo(width/2-26,height/2);hctx.lineTo(width/2+26,height/2);hctx.moveTo(width/2,height/2-26);hctx.lineTo(width/2,height/2+26);hctx.stroke();hctx.strokeStyle='#fff3e9';hctx.lineWidth=2;hctx.stroke();hctx.restore();
 }
}
function formatClock(s){const m=Math.floor(s/60),sec=s%60;return `${String(m).padStart(2,'0')}:${sec.toFixed(2).padStart(5,'0')}`}
function updateUi(){
 const observer=viewObserver(),K=add(observer.U,observer.F,-1,1),lightShift=1/Math.max(.00001,observer.X[1]*K[0]-observer.X[0]*K[1]);
 const shiftType=lightShift>1.025?'blue':lightShift<.975?'red':'neutral';$('lightShift').dataset.shift=shiftType;$('lightShift').textContent=`${shiftType==='blue'?'BLUESHIFT':shiftType==='red'?'REDSHIFT':'SPECTRUM'} ×${lightShift.toFixed(2)}`;
 const t=telemetry(player);$('speed').textContent=t.beta.toFixed(3);$('speedMeter').style.width=(t.beta*100)+'%';$('radius').innerHTML=t.r.toFixed(3)+' <small>L</small>';$('gamma').innerHTML=t.gamma.toFixed(3)+' <small>γ</small>';$('rho').textContent=t.chi.toFixed(3);$('clockRate').textContent=t.clock.toFixed(3);$('properClock').textContent=formatClock(player.tau*L_SECONDS);$('globalClock').textContent=formatClock(player.t*L_SECONDS);$('fps').textContent=String(Math.round(fps));
 drawMap();if($('mapDialog').open)drawExpandedMap();
 const latest=latestPlayerBeam(),bounces=latest?bounceCount(latest,player.t):0,clickable=$('app').classList.contains('controls-visible');$('laserStatus').textContent=gameOver?'ROCKET DESTROYED':latest?.impact?'SHIP DESTROYED':bounces?`BOUNCES ${bounces}`:'LASER READY';$('laserStats').textContent=shots?`${shots} SHOTS · ${kills} HITS · ${clickable?'HOLD FIRE':'F TO FIRE'}`:clickable?'Hold FIRE to shoot':'F / click to fire';$('fleetLabel').textContent=`${fleet.length-destroyedCount()} VESSELS · ${destroyedCount()} DESTROYED`;
 const m=mission.getState();$('missionName').textContent=m.name.toUpperCase();$('missionButton').dataset.status=m.status;$('missionProgress').textContent=m.status==='free'?'CHOOSE MISSION ↗':m.status==='complete'?'COMPLETE · CHOOSE MISSION ↗':m.status==='failed'?'FAILED · RETRY OR CHOOSE ↗':m.id==='clock-race'?`CLOCK LEAD ${m.clockLead.toFixed(1)} / ${m.clockGoal} s ↗`:`${m.reflectedHits} / 1 REFLECTED HIT · MISSIONS ↗`;
}
function drawExpandedMap(){
 const big=$('expandedMap'),r=big.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(w*360/560));
 if(big.width!==w||big.height!==h){big.width=w;big.height=h}
 const c=big.getContext('2d');c.setTransform(w/560,0,0,h/360,0,0);drawMap(c);
}
function mapPoint(X){const r=norm3(X.slice(2)),factor=r?Math.tan(Math.atan(r)/2)/r:0;return [280+X[2]*factor*156,180-X[4]*factor*156]}
function drawMap(c=mctx){
c.clearRect(0,0,560,360);c.lineWidth=1;
 for(const r of [52,104,156]){c.beginPath();c.ellipse(280,180,r,r,0,0,TAU);c.strokeStyle=r===156?'#345264':'#223142';c.stroke()}
 c.strokeStyle='#273749';c.setLineDash([3,7]);c.beginPath();c.moveTo(118,180);c.lineTo(442,180);c.moveTo(280,18);c.lineTo(280,342);c.stroke();c.setLineDash([]);
 c.fillStyle='#6f8caa';c.font='12px "Arcade",monospace';c.fillText('L',389,171);c.fillText('∞',435,181);
 for(let i=0;i<9;i++){
  const ship=fleet[i*7];if(Number.isFinite(ship.deathTime))continue;
  c.beginPath();for(let j=0;j<=70;j++){const v=geodesicAt(ship,player.t-TAU*j/70).X,p=mapPoint(v);if(j)c.lineTo(...p);else c.moveTo(...p)}c.strokeStyle=i%3===0?'#45659459':'#334b6840';c.stroke();
 }
 for(const ship of fleet.filter(s=>s.boundaryOrbit)){
  if(Number.isFinite(ship.deathTime))continue;
  c.beginPath();for(let j=0;j<=90;j++){const p=mapPoint(geodesicAt(ship,player.t-TAU*j/90).X);if(j)c.lineTo(...p);else c.moveTo(...p)}c.strokeStyle='#e9bc7965';c.stroke();
 }
 for(const ship of fleet){if(Number.isFinite(ship.deathTime))continue;const [x,y]=mapPoint(geodesicAt(ship,player.t).X);c.fillStyle=ship.boundaryOrbit?'#e9bc79':'#80a6e090';c.fillRect(x-2,y-2,ship.boundaryOrbit?6:4,ship.boundaryOrbit?6:4)}
 const target=missionTarget();if(target){const [x,y]=mapPoint(geodesicAt(target,player.t).X);c.strokeStyle='#ffd287';c.lineWidth=2;c.beginPath();c.moveTo(x,y-9);c.lineTo(x+9,y);c.lineTo(x,y+9);c.lineTo(x-9,y);c.closePath();c.stroke();c.lineWidth=1;c.font='8px "Arcade",monospace';c.fillStyle='#ffd287';c.fillText('BANK TARGET',Math.min(x+14,440),Math.max(20,y-12))}
 for(const beam of beams.slice(-8)){
  const age=Math.max(0,Math.min(player.t,beam.impact?.time??Infinity)-beam.t),start=Math.max(0,age-Math.PI);c.beginPath();for(let j=0;j<=60;j++){const s=start+(age-start)*j/60,q=beam.Q.map((v,i)=>v*Math.cos(s)+beam.D[i]*Math.sin(s)),x=280+q[1]/(1+Math.abs(q[0]))*156,y=180-q[3]/(1+Math.abs(q[0]))*156;if(j)c.lineTo(x,y);else c.moveTo(x,y)}c.strokeStyle=beam.owner==='traffic'?'#50ffa599':'#ff667499';c.lineWidth=1.5;c.stroke();c.lineWidth=1;
 }
 const [x,y]=mapPoint(player.X);c.beginPath();c.arc(x,y,14,0,TAU);c.strokeStyle='#63e5e660';c.stroke();c.beginPath();c.arc(x,y,5,0,TAU);c.fillStyle='#63e5e6';c.fill();c.fillStyle='#bdffff';c.font='10px "Arcade",monospace';c.fillText('YOU',x+19,y+5);
}
function tick(now){
 const rawElapsed=Math.max(0,(now-last)/1000),elapsed=Math.min(.06,rawElapsed);last=now;fps=fps*.96+.04/Math.max(.001,rawElapsed);
 const active=!gameOver&&!contextLost&&launched&&$('introScreen').hidden&&!paused&&!document.querySelector('dialog[open]')&&!document.hidden;
 if(active){const turn=.65*elapsed;rotate(player,((held('ArrowRight')?1:0)-(held('ArrowLeft')?1:0))*turn,((held('ArrowUp')?1:0)-(held('ArrowDown')?1:0))*turn,((held('KeyQ')?1:0)-(held('KeyE')?1:0))*turn)}
 const command=burnCommand(player,active&&held('KeyW'),active&&held('KeyS'),active&&held('Space'),accel),demand=command.level;
 thrustForce=command.force;chaseCamera.force=command.force.slice();
 engineLevel+=(demand-engineLevel)*(1-Math.exp(-elapsed/(demand?.055:.09)));
 if(engineLevel<.001)engineLevel=0;
 if(demand){engineMode=command.mode;exhaust=command.exhaust}
 score.setThrust(demand,engineMode);
 if(active){
  effectTime+=elapsed;
  const h=elapsed*warp/L_SECONDS,n=Math.max(1,Math.ceil(h/.004)),thrust=command.thrust;
  for(let i=0;i<n;i++){
   const beforeTau=player.tau;
   advance(player,h/n,thrust,command.brake,(segment,endTime)=>{
    const impacts=advanceTraffic(trafficFire,beams,endTime,segment);
    for(const hit of impacts){if(hit.ship.isPlayer){endFlight();return {stopAt:hit.time}}if(hit.beam.owner!=='traffic')kills++;mission.hit(hit);if(mission.id==='trick-shot'&&mission.status==='active'&&hit.beam.owner==='player')notify('Direct hit · Trick Shot needs a boundary bounce');lastImpact=hit;dirty=true}
   });
   chaseCamera.advance(player.tau-beforeTau,command.force);
   if(gameOver){$('gameOverStats').textContent=`${formatClock(player.tau*L_SECONDS)} PROPER TIME · ${kills} SHIPS DESTROYED`;break}
   mission.sample(player);
   if(mission.status==='complete'&&!missionResultShown)break;
   if(!Number.isFinite(player.X[0])||Math.abs(dot(player.X,player.X)+1)>1e-3){setPause(true);notify('Numerical precision limit reached near the boundary. Reset to continue.');break}
  }
  if(held('KeyF'))fire();
  if(beams.length>8)beams=beams.filter((beam,i)=>!beam.impact||i>=beams.length-8);
  showMissionResult();
 }
 if(gameOver&&deathAnimation<EXPLOSION_SECONDS){deathAnimation+=rawElapsed;dirty=true;if(deathAnimation>=EXPLOSION_SECONDS){$('gameOverScreen').hidden=false;$('retryButton').focus({preventScroll:true})}}
 if(active||dirty)draw(active);if(now-lastUi>100){updateUi();lastUi=now}frame++;requestAnimationFrame(tick);
}
// State read-back is useful for scientific inspection and automated validation.
window.adsFlight={getState:()=>({launched,gameOver,mission:{...mission.getState(),targetId:missionTarget()?.id??null},storyVisible:!$('introScreen').hidden,storyParagraph:$('introScreen').hidden?null:introStep+1,storyParagraphs:introPages.length,pilot:pilotNames[pilot],music:score.playing,shipColor:pilotColors[pilot],engine:{level:engineLevel,mode:engineMode,soundLevel:score.thrustLevel,force:thrustForce.slice(),exhaust:exhaust.slice()},chaseCamera:{lag:chaseCamera.lag,rate:chaseCamera.rate},camera:chase?'chase':'cockpit',globalTime:player.t,properTime:player.tau,paused,warp,grid,controlsVisible:$('app').classList.contains('controls-visible'),activeControls:gameKeys.filter(held),renderer:{ready:!!program&&!contextLost,frames:renderedFrames,traffic:renderedTraffic,width:canvas.width,height:canvas.height,quality:resolution.mode,pixelBudget:Math.round(resolution.budget),minimumPixels:Math.round(resolution.floor),maximumPixels:Math.round(resolution.ceiling)},explosions:fleet.filter(s=>s.explosionStarted!==undefined&&!s.visualRemoved).length,removedShips:fleet.filter(s=>s.visualRemoved).length,telemetry:telemetry(player),constraints:{position:dot(player.X,player.X),velocity:dot(player.U,player.U),orthogonality:dot(player.X,player.U)},fleetCount:fleet.length,aliveShips:fleet.length-destroyedCount(),trafficShots:trafficFire.shots,armedShips:trafficFire.shooters.filter(s=>!Number.isFinite(s.ship.deathTime)).length,shots,kills,latestBeam:beams.length?{reflections:bounceCount(beams.at(-1),player.t),impact:beams.at(-1).impact}:null,boundaryOrbiters:fleet.filter(s=>s.boundaryOrbit).map(s=>({id:s.id,radius:norm3(geodesicAt(s,player.t).X.slice(2)),alive:!Number.isFinite(s.deathTime)}))}),reset,setPause,selectPilot,launch,fire,setCamera,startMission};
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const specs=[
  {name:'read_ads_flight_state',description:'Read rocket clocks, global velocity in optical space, simulation settings, and numerical constraints.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');return window.adsFlight.getState()}},
  {name:'launch_ads_flight',description:'Launch with the selected pilot and show the opening story; Begin Flight starts the clocks.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');launch();return window.adsFlight.getState()}},
  {name:'select_ads_pilot',description:'Select one of the five visible arcade physicist avatars and update the cockpit pilot.',inputSchema:{type:'object',properties:{pilotIndex:{type:'integer',minimum:0,maximum:4}},required:['pilotIndex'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='pilotIndex')||!Number.isInteger(input.pilotIndex))throw Error('Invalid pilot selection');selectPilot(input.pilotIndex);return window.adsFlight.getState()}},
  {name:'fire_ads_laser',description:'Fire a laser pulse along the rocket nose. It reflects at the AdS boundary and destroys the first hull it hits, including your rocket on return.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(Object.keys(input||{}).length)throw Error('Expected an empty object');return {fired:fire(),state:window.adsFlight.getState()}}},
  {name:'set_ads_camera',description:'Switch the visible game between a chase view showing your rocket and its cockpit view.',inputSchema:{type:'object',properties:{view:{type:'string',enum:['chase','cockpit']}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='view'))throw Error('Invalid camera setting');setCamera(input.view);return window.adsFlight.getState()}},
  {name:'configure_ads_flight',description:'Set the visible pause state or time-warp control in the flight simulation.',inputSchema:{type:'object',properties:{paused:{type:'boolean'},warp:{type:'number',enum:[1,5,20]}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>!['paused','warp'].includes(k))||('paused'in input&&typeof input.paused!=='boolean')||('warp'in input&&![1,5,20].includes(input.warp)))throw Error('Invalid flight settings');if('paused'in input)setPause(input.paused);if('warp'in input){warp=input.warp;$('warp').value=String(warp)}updateUi();return window.adsFlight.getState()}}
 ];
 for(const tool of specs){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn)}catch(e){console.warn(e)}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
resize();updateUi();requestAnimationFrame(tick);
