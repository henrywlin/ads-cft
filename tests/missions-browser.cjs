const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
const qaSource=`
window.__missionQa={
 isolate(){trafficFire.enabled=false},
 reject(kind){
  setPause(true);trafficFire.enabled=false;let hit;
  if(kind==='direct'){
   const rho=.35,target={id:'DIRECT QA',A:add(player.X,player.F,Math.cosh(rho),Math.sinh(rho)),B:player.U.slice(),C:[player.R,player.V,add(player.F,player.X,Math.cosh(rho),Math.sinh(rho))],kind:0,size:1.5},pulse=createLaser(player,[target]);
   hit=advanceLasers([pulse],player.t+Math.PI)[0];
  }else if(kind==='npc'){
   const target=makeFleet(72)[0],aim=reflectedAim(player,target),pulse=createLaser(player,[target],aim.direction,{id:'NPC QA'});
   hit=advanceLasers([pulse],aim.arrival+1e-6)[0];
  }else{
   const copy=snapshot(player),pulse=createLaser(copy,[]);
   for(let i=0;i<1800&&!hit;i++)advance(copy,.004,0,false,(segment,t)=>{hit=advanceLasers([pulse],t,segment)[0]||null});
  }
  if(!hit)throw Error('No real '+kind+' fixture hit');mission.hit(hit);updateUi();
  return {mission:mission.getState(),owner:hit.beam.owner,self:!!hit.ship.isPlayer,reflections:bounceCount(hit.beam,hit.time)};
 },
 queue(kind){
  setPause(true);trafficFire.enabled=false;let pulse,hitTime;
  if(kind==='reflected'){
   const target=missionTarget(),aim=reflectedAim(player,target),d=[dot(aim.direction,player.R),dot(aim.direction,player.V),dot(aim.direction,player.F)];
   rotate(player,Math.atan2(d[0],d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2])),0);
   if(Math.abs(dot(player.F,aim.direction)-1)>1e-8)throw Error('Bank cue does not align with the physical nose');
   setPause(false);if(!window.adsFlight.fire())throw Error('Production fire rejected the aimed shot');pulse=latestPlayerBeam();setPause(true);
   if(pulse.candidates[0].ship!==target)throw Error('A different hull intercepts the marked-target shot');
   hitTime=player.t+pulse.candidates[0].age;
  }else{
   const copy=snapshot(player),probe=createLaser(copy,[]);let hit;
   for(let i=0;i<1800&&!hit;i++)advance(copy,.004,0,false,(segment,t)=>{hit=advanceLasers([probe],t,segment)[0]||null});
   if(!hit?.ship.isPlayer)throw Error('No real returning self hit');hitTime=hit.time;pulse=createLaser(player,[]);
  }
  const before=hitTime-.001,at=geodesicAt({A:player.X,B:player.U},before),phase=((at.s%TAU)+TAU)%TAU;
  player.X=at.X;player.U=at.U;player.t=before;player.tau+=phase;if(kind==='self')beams=[pulse];warp=20;$('warp').value='20';setPause(false);
  return {time:hitTime,reflections:bounceCount(pulse,hitTime),productionFire:kind==='reflected'};
 },
 clockBurn(){
  setPause(true);trafficFire.enabled=false;let steps=0;
  while((player.t-player.tau)*L_SECONDS<14.5&&steps++<2000){advance(player,.004,1.5);mission.sample(player)}
  if(mission.status!=='active')throw Error('Clock fixture must stop below the goal');
  updateUi();warp=20;$('warp').value='20';setPause(false);keys.add('KeyW');return mission.getState().clockLead;
 },
 aimArcs(){
  setPause(true);trafficFire.enabled=false;const aim=reflectedAim(player,missionTarget()),d=[dot(aim.direction,player.R),dot(aim.direction,player.V),dot(aim.direction,player.F)];
  rotate(player,Math.atan2(d[0],d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2])),0);
  const circles=[],arc=hctx.arc;hctx.arc=function(...args){if(args[2]===12)circles.push(args.slice(0,3));return arc.apply(this,args)};
  try{drawMissionAim()}finally{hctx.arc=arc}
  return {circles,width,height};
 }
};`;
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+qaSource})});
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.adsFlight?.getState().renderer.frames>0);
  assert.equal(await page.locator('#introScreen').isVisible(),false);await page.locator('#launchSound').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  for(let i=1;i<=5;i++){
   const state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.storyParagraph,i);assert.equal(state.properTime,0);assert.equal(state.pilot,'Steven Gubser');await page.keyboard.press('Enter');
  }
  await page.evaluate(()=>window.__missionQa.isolate());await page.waitForFunction(()=>window.adsFlight.getState().properTime>0);
  async function freezeWhile(selector){
   assert.equal(await page.locator(selector).evaluate(e=>e.open),true);const start=await page.evaluate(()=>window.adsFlight.getState());await page.waitForTimeout(200);const end=await page.evaluate(()=>window.adsFlight.getState());assert.equal(end.globalTime,start.globalTime);assert.equal(end.properTime,start.properTime);assert.deepEqual(end.engine.force,[0,0,0]);
  }
  await page.locator('#missionButton').click();await freezeWhile('#missionDialog');await page.locator('[data-mission="trick-shot"]').click();await page.evaluate(()=>window.__missionQa.isolate());
  let state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.id,'trick-shot');assert.equal(state.mission.status,'active');assert.equal(state.pilot,'Steven Gubser');assert.ok(state.properTime<.01);assert.ok(state.mission.targetId);
  const rejected=[];for(const kind of ['direct','npc','self']){const result=await page.evaluate(kind=>window.__missionQa.reject(kind),kind);assert.equal(result.mission.status,'active');assert.equal(result.mission.reflectedHits,0);assert.equal(result.mission.directHits,1);rejected.push({kind,owner:result.owner,self:result.self,reflections:result.reflections})}
  await page.evaluate(()=>{window.adsFlight.reset();window.__missionQa.isolate();window.adsFlight.setPause(true)});state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.id,'trick-shot');assert.equal(state.mission.directHits,0);assert.equal(state.mission.reflectedHits,0);assert.equal(state.globalTime,0);assert.equal(state.properTime,0);
  const reflected=await page.evaluate(()=>window.__missionQa.queue('reflected'));await page.waitForFunction(()=>window.adsFlight.getState().mission.status==='complete');await page.waitForFunction(()=>document.querySelector('#missionResultDialog').open);await freezeWhile('#missionResultDialog');
  state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.kills,1);assert.equal(state.shots,1);assert.equal(reflected.productionFire,true);assert.equal(state.aliveShips,71);assert.equal(state.mission.reflectedHits,1);assert.equal(state.mission.result.time,reflected.time);assert.equal(state.mission.result.reflections,1);assert.equal(state.gameOver,false);assert.match(await page.locator('#missionResultText').innerText(),/boundary reflection/);await page.screenshot({path:'/tmp/ads-v14-'+engine+'-mission-complete.png'});
  await page.locator('#missionReplayButton').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.status,'active');assert.equal(state.mission.result,null);assert.equal(state.aliveShips,72);assert.equal(state.kills,0);
  await page.evaluate(()=>window.__missionQa.queue('self'));await page.waitForFunction(()=>window.adsFlight.getState().gameOver);state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.status,'failed');assert.equal(state.mission.reflectedHits,0);assert.equal(await page.locator('#missionResultDialog').evaluate(e=>e.open),false);
  await page.waitForFunction(()=>!document.querySelector('#gameOverScreen').hidden);await page.locator('#gameOverMissions').click();await freezeWhile('#missionDialog');await page.locator('[data-mission="free-flight"]').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});
  state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.id,'free-flight');assert.equal(state.mission.status,'free');assert.equal(state.mission.directHits,0);assert.equal(state.mission.reflectedHits,0);assert.equal(state.mission.result,null);assert.equal(state.gameOver,false);
  await page.locator('#missionButton').click();await page.locator('[data-mission="clock-race"]').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});
  state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.id,'clock-race');assert.equal(state.mission.status,'active');assert.equal(state.mission.clockGoal,15);assert.ok(Math.abs(state.mission.clockLead)<.1);assert.match(await page.locator('#missionProgress').innerText(),/CLOCK LEAD/);
  for(const kind of ['direct','npc','self']){const result=await page.evaluate(kind=>window.__missionQa.reject(kind),kind);assert.equal(result.mission.status,'active');assert.equal(result.mission.directHits,0);assert.equal(result.mission.reflectedHits,0)}
  const clockBeforeGoal=await page.evaluate(()=>window.__missionQa.clockBurn());assert.ok(clockBeforeGoal<15);await page.waitForFunction(()=>document.querySelector('#missionResultDialog').open);await freezeWhile('#missionResultDialog');
  const clockState=await page.evaluate(()=>window.adsFlight.getState());assert.equal(clockState.mission.id,'clock-race');assert.equal(clockState.mission.status,'complete');assert.ok(clockState.mission.result.clockLead>=15);assert.ok(Math.abs(clockState.mission.result.clockLead-(clockState.globalTime-clockState.properTime)*30)<1e-8);assert.equal(clockState.kills,0);assert.equal(clockState.mission.reflectedHits,0);assert.match(await page.locator('#missionResultText').innerText(),/Onboard proper time/);
  await page.screenshot({path:'/tmp/ads-v14-'+engine+'-clock-race-complete.png'});await page.locator('#missionReplayButton').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});
  state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.id,'clock-race');assert.equal(state.mission.status,'active');assert.equal(state.mission.result,null);assert.ok(Math.abs(state.mission.clockLead)<.1);
  await page.locator('#missionButton').click();await page.locator('[data-mission="trick-shot"]').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.status,'active');assert.equal(state.mission.clockLead,0);assert.equal(state.mission.reflectedHits,0);assert.equal(state.mission.result,null);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);const mobileButton=await page.locator('#missionButton').boundingBox();assert.ok(mobileButton.height>=44);assert.ok(mobileButton.x>=0&&mobileButton.y>=0&&mobileButton.x+mobileButton.width<=390);await page.locator('#missionButton').click();await freezeWhile('#missionDialog');
  const dialog=await page.locator('#missionDialog').boundingBox();assert.ok(dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=390&&dialog.y+dialog.height<=844);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const id of ['trick-shot','clock-race']){const button=page.locator('[data-mission="'+id+'"]');await button.scrollIntoViewIfNeeded();assert.ok((await button.boundingBox()).height>=44)}
  const start=page.locator('[data-mission="clock-race"]');await start.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/ads-v14-'+engine+'-missions-mobile.png'});await start.click();await page.evaluate(()=>window.__missionQa.isolate());assert.equal((await page.evaluate(()=>window.adsFlight.getState())).mission.id,'clock-race');assert.equal(await page.locator('#missionDialog').evaluate(e=>e.open),false);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);await page.locator('#missionButton').click();await freezeWhile('#missionDialog');
  const landscapeDialog=await page.locator('#missionDialog').boundingBox();assert.ok(landscapeDialog.x>=0&&landscapeDialog.y>=0&&landscapeDialog.x+landscapeDialog.width<=844&&landscapeDialog.y+landscapeDialog.height<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const id of ['trick-shot','clock-race']){const button=page.locator('[data-mission="'+id+'"]');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.height>=44&&box.y>=0&&box.y+box.height<=390,'Both mission buttons remain reachable by scrolling in landscape')}
  await page.screenshot({path:'/tmp/ads-v14-'+engine+'-missions-landscape.png'});await page.locator('[data-mission="trick-shot"]').click();await page.evaluate(()=>{window.__missionQa.isolate();window.adsFlight.setPause(true)});assert.equal((await page.evaluate(()=>window.adsFlight.getState())).mission.id,'trick-shot');
  await page.setViewportSize({width:844,height:300});await page.waitForTimeout(100);const shortAim=await page.evaluate(()=>window.__missionQa.aimArcs());assert.equal(shortAim.height,240);assert.equal(shortAim.circles.length,1,'Aligned bank aim remains an on-screen circular cue on the short viewport');assert.ok(Math.abs(shortAim.circles[0][0]-shortAim.width/2)<1e-7);assert.ok(Math.abs(shortAim.circles[0][1]-shortAim.height/2)<1e-7);
  await page.evaluate(()=>window.__missionQa.queue('reflected'));await page.waitForFunction(()=>document.querySelector('#missionResultDialog').open);const earned=await page.evaluate(()=>window.adsFlight.getState().mission.result);await page.locator('#missionResultDialog .mission-result-actions [data-close]').click();
  await page.evaluate(()=>window.__missionQa.queue('self'));await page.waitForFunction(()=>window.adsFlight.getState().gameOver);state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.mission.status,'complete','A later death cannot erase an already awarded mission');assert.deepEqual(state.mission.result,earned);
  await page.waitForFunction(()=>!document.querySelector('#gameOverScreen').hidden);const chooseAfterDeath=page.locator('#gameOverMissions');await chooseAfterDeath.scrollIntoViewIfNeeded();const choiceBox=await chooseAfterDeath.boundingBox();assert.ok(choiceBox.y>=0&&choiceBox.y+choiceBox.height<=300,'Mission selection can scroll into the short viewport after game over');await chooseAfterDeath.click();await freezeWhile('#missionDialog');await page.screenshot({path:'/tmp/ads-v14-'+engine+'-missions-short.png'});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,introParagraphs:5,selection:true,nativeDialogStopsClocks:true,rejected,realReflectedImpact:reflected,replay:true,fatalSelfHitFails:true,freeFlight:true,clockRace:{lead:clockState.mission.result.clockLead,noLaserCredit:true,reset:true},mobile:true,landscape:true,shortAim,earnedCompletionSurvivesDeath:true,shortGameOverSelection:true,errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
