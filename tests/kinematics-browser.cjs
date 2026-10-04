const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=fn=>{window.__nextFrame=fn;return 1}});
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();let source=await response.text();
   assert.ok(!source.includes('drawThrustDirection'),'Vector animation removed');
   source=source.replace('uniform float engineBurn;','uniform float engineBurn;\n uniform float auditShift;').replace('color=shifted(hull,g)*clamp(pow(g,.8),.25,2.0);','if(auditShift>.5){frag=vec4(g/8.0,0,0,1);return;}\n   color=shifted(hull,g)*clamp(pow(g,.8),.25,2.0);');
   source+=`\nwindow.__audit={
    step(seconds){for(let remain=seconds;remain>1e-8;){const dt=Math.min(.02,remain);tick(last+dt*1000);remain-=dt}},
    isolate(){trafficFire.enabled=false},
    render(){gl.finish();dirty=true;draw(false);gl.finish()},
    center(){const X=eventAt([0,0,0],player.t),m=staticFrame(X);player={...player,X,U:m.T,R:m.E[0],V:m.E[1],F:m.E[2]};},
    bankShot(){
     player=initialPlayer();beams=[];const target=missionTarget(),aim=reflectedAim(player,target),d=[player.R,player.V,player.F].map(e=>dot(aim.direction,e));rotate(player,Math.atan2(d[0],d[2]),Math.atan2(d[1],Math.hypot(d[0],d[2])),0);
     if(!fire())throw Error('Production fire rejected the shot');const beam=latestPlayerBeam(),impact=beam.candidates[0];if(!impact||bounceCount(beam,beam.t+impact.age)<1)throw Error('Fixture has no reflected impact');
     const before=beam.t+impact.age-.001,at=geodesicAt({A:player.X,B:player.U},before);player.X=at.X;player.U=at.U;player.t=before;player.tau=at.s;warp=10;this.step(.02);return flightProgram.getState();
    },
    spectral(v,reflected){
     const A=eventAt([0,0,1],-Math.PI/4),T=staticFrame(A),g=1/Math.sqrt(1-v*v),B=add(T.T,T.E[2],g,g*v),C=[T.E[0],T.E[1],add(T.E[2],T.T,g,g*v)];
     const ship={A,B,C,id:'SPECTRAL TEST',size:1,kind:0,hue:.5,boundRadius:.065};fleet.splice(0,fleet.length,ship);chase=false;player.t=0;this.center();player.tau=0;const view=retarded(ship,player,reflected);if(view.dir[2]<0)player.F=scale(player.F,-1);
     const loc=gl.getUniformLocation(program,'auditShift');gl.uniform1f(loc,1);this.render();const pixel=new Uint8Array(4);gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.uniform1f(loc,0);
     return {pixel:[...pixel],measured:pixel[0]/255*8,expected:view.shift,reflected};
    },restore(){fleet.splice(0,fleet.length,...makeFleet());chase=true;reset();this.isolate()}
   };`;
   await route.fulfill({response,body:source});
  });
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__audit);await page.evaluate(()=>{window.__nextFrame(performance.now());window.__nextFrame(performance.now())});await page.waitForFunction(()=>{window.__audit.step(.02);return window.adsFlight.getState().renderer.ready},null,{polling:50});assert.ok((await page.evaluate(()=>window.adsFlight.getState())).renderer.ready);
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();await page.evaluate(()=>window.__audit.step(20));assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.playSeconds,0);
  for(let i=0;i<10&&(await page.evaluate(()=>window.adsFlight.getState().storyVisible));i++)await page.keyboard.press('Enter');await page.evaluate(()=>{window.__audit.isolate();window.__audit.step(1)});
  let state=await page.evaluate(()=>window.adsFlight.getState());assert.ok(Math.abs(state.properTime*30-1.5)<1e-7);assert.equal(state.effectiveSpeed,1.5);
  for(const w of [2,5,10]){await page.locator('#warp').selectOption(String(w));const p=await page.evaluate(()=>window.adsFlight.getState().properTime);await page.evaluate(()=>window.__audit.step(.2));const q=await page.evaluate(()=>window.adsFlight.getState().properTime);assert.ok(Math.abs((q-p)*30-.2*1.5*w)<1e-7)}
  await page.locator('#warp').selectOption('1');await page.evaluate(()=>window.adsFlight.setPause(true));const before=await page.evaluate(()=>window.adsFlight.getState().flightProgram.playSeconds);await page.evaluate(()=>window.__audit.step(30));assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.playSeconds,before);
  await page.evaluate(()=>window.adsFlight.setPause(false));await page.keyboard.press('m');await page.evaluate(()=>window.__audit.step(20));assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.playSeconds,before);await page.keyboard.press('m');
  await page.evaluate(()=>window.__audit.step(15-window.adsFlight.getState().flightProgram.playSeconds+.001));assert.equal(await page.locator('#missionOfferTitle').innerText(),'Trick Shot');
  const frozen=await page.evaluate(()=>window.adsFlight.getState());await page.evaluate(()=>window.__audit.step(10));state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.properTime,frozen.properTime);assert.equal(state.flightProgram.playSeconds,frozen.flightProgram.playSeconds);
  await page.evaluate(()=>window.__audit.render());await page.screenshot({path:'/workspace/ads-cft-kinematics/mission-offer.png'});await page.locator('#missionAccept').click();state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.flightProgram.missions[0].id,'trick-shot');assert.equal(state.properTime,frozen.properTime,'Accept preserves the flight');
  await page.evaluate(()=>window.__audit.step(45-window.adsFlight.getState().flightProgram.playSeconds+.001));assert.equal(await page.locator('#missionOfferTitle').innerText(),'Rest at the Center');await page.locator('#missionAccept').click();assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,2);
  await page.evaluate(()=>{window.__audit.center();window.__audit.step(1.5)});state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.flightProgram.missions[1].status,'complete');assert.equal(state.flightProgram.missions[0].status,'active');
  await page.keyboard.press('m');await page.screenshot({path:'/workspace/ads-cft-kinematics/orbital-map.png'});await page.keyboard.press('m');
  const bank=await page.evaluate(()=>window.__audit.bankShot());assert.equal(bank.missions[0].status,'complete');assert.ok(bank.missions[0].result.reflections>=1);assert.equal(bank.missions[1].status,'complete');
  for(const [key,sign] of [['w',1],['s',-1]]){await page.evaluate(()=>{window.adsFlight.reset();window.__audit.isolate()});await page.locator('#space').focus();await page.keyboard.down(key);await page.evaluate(()=>window.__audit.step(1));state=await page.evaluate(()=>window.adsFlight.getState());assert.equal(state.engine.force[2],sign*1.5);assert.equal(state.engine.exhaust[2],-sign);assert.ok(state.chaseCamera.lag*sign>0);await page.keyboard.up(key)}
  await page.evaluate(()=>window.adsFlight.setPause(true));const spectra=[];for(const v of [-.8,.8])for(const reflected of [false,true]){const result=await page.evaluate(([v,r])=>window.__audit.spectral(v,r),[v,reflected]);assert.ok(Math.abs(result.measured-result.expected)/result.expected<.12,JSON.stringify(result));spectra.push(result)}
  await page.evaluate(()=>window.__audit.restore());await page.evaluate(()=>window.__audit.step(15.01));await page.locator('#missionDecline').click();assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,0);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{window.__audit.step(.02);return window.adsFlight.getState().renderer.ready},null,{polling:50});await page.waitForFunction(()=>{window.__audit.step(Math.max(.1,45.02-window.adsFlight.getState().flightProgram.playSeconds));return document.querySelector('#missionOfferDialog').open&&document.querySelector('#missionOfferTitle').textContent==='Rest at the Center'},null,{polling:50});assert.equal(await page.locator('#missionOfferTitle').innerText(),'Rest at the Center');let box=await page.locator('#missionOfferDialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await page.screenshot({path:'/workspace/ads-cft-kinematics/mission-mobile.png'});await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,0);
  assert.equal(await page.locator('#missionDialog').count(),0);assert.equal(await page.getByText('Includes gravitational and kinematic time dilation.').count(),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,baseSpeed:1.5,warps:[1,2,5,10],offerTimes:[15,45],concurrentMissions:true,centerHold:true,acceptDecline:true,mobile:true,spectra,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
