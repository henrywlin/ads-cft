const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=fn=>{window.__nextFrame=fn;return 1}});
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__dockQa={
   step(seconds){for(let remaining=seconds;remaining>1e-8;){const dt=Math.min(.02,remaining);tick(last+dt*1000);remaining-=dt}},
   ready(){gl.finish();this.step(.02);return graphicsReady},
   render(){gl.finish();dirty=true;draw();gl.finish();updateUi()},
   reset(){reset();trafficFire.enabled=false},
   center(){const X=eventAt([0,0,0],player.t),m=staticFrame(X);player={...player,X,U:m.T,R:m.E[0],V:m.E[1],F:m.E[2]};dirty=true;updateUi()},
   arrows(){const arrows=[],original=drawMapArrow;drawMapArrow=(c,x,y,dx,dy,color)=>{if(Math.hypot(dx,dy)>6)arrows.push({dx,dy,color});original(c,x,y,dx,dy,color)};try{drawMap()}finally{drawMapArrow=original}return arrows},
   centerVisible(visible){centralShip.visualRemoved=!visible;this.render()},
   pixels(){const data=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data]},
   station(){return {position:geodesicAt(centralShip,player.t).X.slice(2),fleet:fleet.length,pieces:centralShip.parts.length}}
  };`})});
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__dockQa);
  await page.evaluate(()=>{window.__nextFrame(performance.now());window.__nextFrame(performance.now())});
  await page.waitForFunction(()=>window.__dockQa.ready(),null,{polling:80});
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  await page.evaluate(()=>window.__dockQa.reset());
  const station=await page.evaluate(()=>window.__dockQa.station());assert.equal(station.fleet,48);assert.ok(station.pieces>30);assert.ok(station.position.every(x=>Math.abs(x)<1e-12));
  await page.evaluate(()=>window.__dockQa.centerVisible(false));const without=await page.evaluate(()=>window.__dockQa.pixels());
  await page.evaluate(()=>window.__dockQa.centerVisible(true));const withShip=await page.evaluate(()=>window.__dockQa.pixels());
  let changed=0;for(let i=0;i<withShip.length;i+=4)if(Math.abs(withShip[i]-without[i])+Math.abs(withShip[i+1]-without[i+1])+Math.abs(withShip[i+2]-without[i+2])>20)changed++;
  assert.ok(changed>300,`Axiom is visibly ray traced (${changed} changed pixels)`);
  await page.screenshot({path:`/tmp/ads-axiom-${engine}.png`});
  await page.evaluate(()=>window.__dockQa.step(15.01));assert.equal(await page.locator('#missionOfferTitle').innerText(),'Trick Shot');
  assert.equal(await page.locator('#missionMentor').isVisible(),false);assert.equal(await page.locator('#missionOfferTip').isVisible(),false);
  const before=await page.evaluate(()=>window.adsFlight.getState());await page.locator('#missionAccept').click();
  assert.equal(await page.locator('#missionMentor').isVisible(),true);assert.match(await page.locator('#missionOfferTip').innerText(),/BANK AIM/);
  assert.equal(await page.locator('#missionAccept').innerText(),'READY');assert.equal(await page.locator('#missionDecline').isVisible(),false);
  await page.evaluate(()=>window.__dockQa.step(3));assert.equal((await page.evaluate(()=>window.adsFlight.getState())).properTime,before.properTime,'Dirac advice pauses flight');
  await page.keyboard.press('Enter');assert.equal(await page.locator('#missionOfferDialog').isVisible(),false);
  await page.evaluate(()=>window.__dockQa.step(45.01-window.adsFlight.getState().flightProgram.playSeconds));
  assert.equal(await page.locator('#missionOfferTitle').innerText(),'Dock with Central Spaceship');assert.equal(await page.locator('#missionMentor').isVisible(),false);
  assert.ok((await page.evaluate(()=>window.__dockQa.arrows())).every(a=>a.color!=='#ffb85c'),'No braking cue before acceptance');
  await page.locator('#missionAccept').click();assert.equal(await page.locator('#missionMentor').isVisible(),true);
  assert.match(await page.locator('#missionOfferTip').innerText(),/NOSE/);await page.locator('#missionMentor img').evaluate(img=>img.decode());
  await page.screenshot({path:`/tmp/ads-docking-advice-${engine}.png`});
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:320,height:320}]){
   await page.setViewportSize(viewport);
   const layout=await page.evaluate(()=>{const d=document.querySelector('#missionOfferDialog').getBoundingClientRect(),b=document.querySelector('#missionAccept').getBoundingClientRect();return {fits:d.top>=0&&d.bottom<=innerHeight&&d.left>=0&&d.right<=innerWidth,button:b.top>=0&&b.bottom<=innerHeight}});
   assert.equal(layout.fits,true);assert.equal(layout.button,true);
  }
  await page.setViewportSize({width:1200,height:850});await page.locator('#missionOfferClose').click();
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,2,'Closing advice preserves acceptance');
  const arrows=await page.evaluate(()=>window.__dockQa.arrows()),cyan=arrows.filter(a=>a.color==='#bdffff'),amber=arrows.filter(a=>a.color==='#ffb85c');
  assert.ok(amber.length>0);assert.equal(amber.length,cyan.length);cyan.forEach((a,i)=>assert.ok(a.dx*amber[i].dx+a.dy*amber[i].dy<0,'Braking points opposite map travel'));
  await page.waitForFunction(()=>window.__dockQa.ready(),null,{polling:80});await page.keyboard.press('m');await page.evaluate(()=>window.__dockQa.render());await page.screenshot({path:`/tmp/ads-docking-map-${engine}.png`});await page.keyboard.press('m');
  await page.evaluate(()=>{window.__dockQa.center();window.__dockQa.step(1.5)});const done=await page.evaluate(()=>window.adsFlight.getState());
  assert.equal(done.flightProgram.missions[1].status,'complete');assert.equal(done.flightProgram.missions[0].status,'active');assert.ok((await page.evaluate(()=>window.__dockQa.arrows())).every(a=>a.color!=='#ffb85c'));
  await page.evaluate(()=>{window.__dockQa.reset();window.__dockQa.step(15.01)});assert.equal(await page.locator('#missionMentor').isVisible(),false);await page.locator('#missionDecline').click();
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,0);assert.equal(await page.locator('#missionOfferDialog').isVisible(),false);
  await page.evaluate(()=>window.__dockQa.step(30));await page.locator('#missionAccept').click();await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions[0].id,'center-rest');
  await page.evaluate(()=>window.__dockQa.reset());assert.equal((await page.evaluate(()=>window.adsFlight.getState())).flightProgram.missions.length,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,stationPixels:changed,offerThenAdvice:true,declineNoAdvice:true,brakingArrows:true,docking:true,mobile:true,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
