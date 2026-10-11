const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';

(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'
  ?{headless:true,env:{...process.env,PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS:'1'}}
  :{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/game.js?*',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`
    flightProgram.nextOffer=()=>null;
    let countOriginalBeams=[],countOriginalOrbiters=[],countOriginalRays='';
    const countRayState=()=>JSON.stringify(beams.map(b=>({X:b.X,P:b.P,Q:b.Q,D:b.D,t:b.t,firstBounce:b.firstBounce,playerArmed:b.playerArmed,impact:b.impact})));
    const countLossExtension=gl.getExtension('WEBGL_lose_context');
    window.__shipCountQa={
     prepare(){
      reset();setPause(true);selectPilot(2);trafficFire.enabled=false;
      if(!velocityArrowEnabled)toggleVelocityArrow();
      advance(player,7.3);player.upgrades={frame:true,cannon:true};
      flightProgram.playSeconds=51;flightProgram.offered.add('trick-shot');
      flightProgram.accept('trick-shot',player);trickMission().directHits=2;
      const selected=fleet[20];selectedImageShip=selected;missionTargetId=selected.id;imageFrame={ships:[selected]};
      const old=createLaser(initialPlayer(),[...fleet,centralShip]);old.flashTime=-Infinity;old.playerArmed=true;
      const fresh=createLaser(player,[...fleet,centralShip]);fresh.flashTime=effectTime;
      const emitter=fleet[20],state=geodesicAt(emitter,player.t);
      const traffic=createLaser({...state,F:emitter.C[2],t:player.t},[...fleet,centralShip],emitter.C[2],emitter);traffic.flashTime=-Infinity;
      const absorbed=createLaser(player,[]);absorbed.impact={time:player.t-.1,ship:'PREVIOUS HIT'};absorbed.flashTime=-Infinity;
      beams=[old,fresh,traffic,absorbed];countOriginalBeams=beams.slice();countOriginalOrbiters=fleet.filter(s=>s.boundaryOrbit);countOriginalRays=countRayState();
      shots=8;kills=2;lastShot=player.tau-.02;trafficFire.shots=7;dirty=true;
      return this.preserved();
     },
     preserved(){return {player:snapshot(player),pilot,upgrades:{...player.upgrades},paused,velocityArrowEnabled,mission:flightProgram.getState(),shots,kills,lastShot,trafficShots:trafficFire.shots,trafficEnabled:trafficFire.enabled}},
     audit(){
      const active=beams.filter(b=>!b.impact),pool=new Set([...fleet,centralShip]);
      return {
       identities:beams.length===countOriginalBeams.length&&beams.every((b,i)=>b===countOriginalBeams[i]),
       raysUnchanged:countRayState()===countOriginalRays,
       candidatesCurrent:active.every(b=>b.candidates.every(c=>pool.has(c.ship))),
       futureCandidates:active.every(b=>!b.candidates.length||b.t+b.candidates[b.index].age+b.cycle*TAU>=player.t-1e-8),
       oldCycle:beams[0].cycle,oldCandidates:beams[0].candidates.length,freshArmed:beams[1].playerArmed,absorbed:beams[3].impact.ship,
       orbitIdentity:fleet.filter(s=>s.boundaryOrbit).every((s,i)=>s===countOriginalOrbiters[i]),
       selected:selectedImageShip?.id??null,targetCurrent:missionTargetId===null||fleet.some(s=>s.id===missionTargetId),imageFrameCleared:imageFrame===null,
       capacity:fleetCapacity,dataRows:fleetData.length/40,
       shooters:trafficFire.shooters.length,
       shooterMembership:trafficFire.shooters.every(s=>fleet.includes(s.ship)),
       next:trafficFire.shooters.map(s=>s.next),now:player.t
      };
     },
     scheduleProbe(){
      trafficFire.enabled=true;trafficFire.shots=77;
      window.adsFlight.setShipCount(2);
      const now=player.t,probe=[],before=trafficFire.shots;
      advanceTraffic(trafficFire,probe,now,{...player});
      const atNow=trafficFire.shots,first=Math.min(...trafficFire.shooters.map(s=>s.next));
      advanceTraffic(trafficFire,probe,first+1e-6,{...player});
      trafficFire.enabled=false;
      return {before,atNow,after:trafficFire.shots,emissions:probe.map(b=>b.t),now,first};
     },
     markHiddenDeath(){const ship=trafficRoster.all.find(s=>!fleet.includes(s));ship.deathTime=player.t;ship.visualRemoved=true;ship.explosionStarted=0;return ship.id},
     resetPaused(){reset();setPause(true);trafficFire.enabled=false},
     poolAlive(){return trafficRoster.all.every(s=>!Number.isFinite(s.deathTime)&&!s.visualRemoved&&s.explosionStarted===undefined)},
     contextAvailable(){return !!countLossExtension},lose(){countLossExtension.loseContext()},restore(){countLossExtension.restoreContext()},
     gpu(){gl.finish();return {error:gl.getError(),submitted:gl.getUniform(program,locations.shipCount),capacity:fleetCapacity}}
    };
   `})
  });
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.adsFlight?.getState().renderer.ready);
  assert.equal(await page.locator('#shipCount').inputValue(),'24');
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).fleetCount,24);
  assert.deepEqual(await page.locator('#shipCount option').evaluateAll(options=>options.map(o=>o.value)),['2','12','24','48']);
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();
  for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  const before=await page.evaluate(()=>window.__shipCountQa.prepare());
  for(const count of [2,12,24,48,12,48]){
   // Inspect synchronously with the setting change, before the next GPU frame.
   const result=await page.evaluate(count=>{
    const control=document.getElementById('shipCount');control.value=String(count);control.dispatchEvent(new Event('change',{bubbles:true}));
    return {state:window.adsFlight.getState(),preserved:window.__shipCountQa.preserved(),audit:window.__shipCountQa.audit()};
   },count);
   assert.equal(result.state.fleetCount,count);assert.equal(result.state.aliveShips,count);
   assert.deepEqual(result.preserved,before,`Changing to ${count} preserves the ongoing flight`);
   assert.equal(result.audit.identities,true);assert.equal(result.audit.raysUnchanged,true);assert.equal(result.audit.candidatesCurrent,true);assert.equal(result.audit.futureCandidates,true);
   if(result.audit.oldCandidates)assert.ok(result.audit.oldCycle>=1,'Old pulses retain future periodic collisions');
   assert.equal(result.audit.freshArmed,false,'A newly fired player pulse remains unarmed inside its emitter');
   assert.equal(result.audit.absorbed,'PREVIOUS HIT');assert.equal(result.audit.orbitIdentity,true);
   assert.equal(result.audit.capacity,50);assert.equal(result.audit.dataRows,50);
   assert.equal(result.audit.shooters,Math.min(10,count));assert.equal(result.audit.shooterMembership,true);
   assert.ok(result.audit.next.every(t=>t>result.audit.now&&t<=result.audit.now+.81),'NPC shots restart ahead of the current clock');
   assert.equal(result.audit.selected,null);assert.equal(result.audit.targetCurrent,true);assert.equal(result.audit.imageFrameCleared,true);
   assert.deepEqual(result.state.boundaryOrbiters.map(s=>s.id),['USS WEINBERG','USS HAWKING']);
   assert.ok(Math.abs(result.state.boundaryOrbiters[0].radius-10)<1e-8);assert.ok(Math.abs(result.state.boundaryOrbiters[1].radius-20)<1e-8);
  }
  const rejected=await page.evaluate(()=>[0,1,3,49,72,NaN,Infinity,12.5,'12'].map(count=>{try{window.adsFlight.setShipCount(count);return false}catch{return true}}));
  assert.ok(rejected.every(Boolean),'Unsupported or nonnumeric ship counts are rejected');
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).fleetCount,48);
  const schedule=await page.evaluate(()=>window.__shipCountQa.scheduleProbe());
  assert.equal(schedule.before,77);assert.equal(schedule.atNow,77);assert.ok(schedule.after>77);
  assert.ok(schedule.first>schedule.now);assert.ok(schedule.emissions.every(t=>t>=schedule.first));
  const hidden=await page.evaluate(()=>window.__shipCountQa.markHiddenDeath());assert.ok(hidden);
  await page.evaluate(()=>window.__shipCountQa.resetPaused());
  assert.equal(await page.evaluate(()=>window.__shipCountQa.poolAlive()),true,'Reset restores ships hidden by the smaller preset');
  await page.selectOption('#shipCount','48');
  let restored=false;
  if(await page.evaluate(()=>window.__shipCountQa.contextAvailable())){
   await page.evaluate(()=>window.__shipCountQa.lose());await page.waitForFunction(()=>!window.adsFlight.getState().renderer.ready);
   const clock=(await page.evaluate(()=>window.adsFlight.getState())).properTime;
   await page.evaluate(()=>window.__shipCountQa.restore());await page.waitForFunction(()=>window.adsFlight.getState().renderer.ready);
   const state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.fleetCount,48);assert.equal(state.properTime,clock);
   const gpu=await page.evaluate(()=>window.__shipCountQa.gpu());assert.equal(gpu.error,0);assert.ok(gpu.submitted<=50);assert.equal(gpu.capacity,50);restored=true;
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#shipCount').scrollIntoViewIfNeeded();
  await page.selectOption('#shipCount','2');assert.equal((await page.evaluate(()=>window.adsFlight.getState())).fleetCount,2);
  const layout=await page.locator('#shipCount').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}});
  assert.equal(layout.overflow,false);assert.ok(layout.left>=0&&layout.right<=layout.viewport&&layout.width>40,'Ship selector fits the mobile viewport');
  await page.selectOption('#shipCount','24');assert.equal((await page.evaluate(()=>window.adsFlight.getState())).fleetCount,24);
  await page.screenshot({path:`/tmp/ads-ship-count-${engine}-mobile.png`});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,presets:[2,12,24,48],liveStatePreserved:true,pulsesRetargeted:true,outerOrbiters:true,noBacklog:true,hiddenReset:true,contextRestored:restored,mobile:true,errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
