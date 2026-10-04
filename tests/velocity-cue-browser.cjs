const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`
   window.__velocityQa={isolate(){trafficFire.enabled=false;flightProgram.nextOffer=()=>null},fixture(aft){player=initialPlayer();rotate(player,aft?-Math.PI/2:Math.PI/2,0,0);dirty=true},cue(){return velocityCue(player,width,height)}};
  `})});
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.adsFlight?.getState().renderer.ready);
  await page.keyboard.press('v');assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),true);
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();
  await page.keyboard.press('v');assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),true);
  for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  await page.evaluate(()=>{window.__velocityQa.isolate();window.adsFlight.setPause(true);window.__velocityQa.fixture(false)});
  await page.locator('#space').focus();
  async function pixels(){return page.evaluate(()=>{const c=document.querySelector('#overlay'),ctx=c.getContext('2d'),cue=window.__velocityQa.cue(),rect=c.getBoundingClientRect(),sx=c.width/rect.width,sy=c.height/rect.height;return Array.from(ctx.getImageData(Math.round((cue.x-22)*sx),Math.round((cue.y-12)*sy),Math.round(44*sx),Math.round(40*sy)).data)})}
  await page.waitForTimeout(150);const visible=await pixels(),clock=await page.evaluate(()=>window.adsFlight.getState().properTime);
  await page.keyboard.press('v');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),false);assert.notDeepEqual(await pixels(),visible,'V removes the drawn arrow');
  await page.locator('#velocityToggle').click();await page.waitForTimeout(150);assert.equal(await page.locator('#velocityToggle').getAttribute('aria-checked'),'true');assert.deepEqual(await pixels(),visible);
  await page.locator('#space').focus();
  const modified=await page.locator('#space').evaluate(el=>['ctrlKey','metaKey','altKey'].map(modifier=>el.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',[modifier]:true,bubbles:true,cancelable:true}))));assert.deepEqual(modified,[true,true,true]);
  await page.locator('#space').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',repeat:true,bubbles:true,cancelable:true})));assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),true);
  await page.locator('#warp').focus();await page.keyboard.press('v');assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),true);
  await page.locator('#helpButton').click();await page.keyboard.press('v');assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),true);await page.locator('#helpDialog [data-close]').click();
  for(const camera of ['chase','cockpit'])for(const aft of [false,true]){
   await page.evaluate(({camera,aft})=>{window.adsFlight.setCamera(camera);window.__velocityQa.fixture(aft)},{camera,aft});
   await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__velocityQa.cue().aft),aft);
   const on=await pixels();await page.locator('#space').focus();await page.keyboard.press('v');await page.waitForTimeout(150);assert.notDeepEqual(await pixels(),on);await page.keyboard.press('v');
  }
  assert.equal(await page.evaluate(()=>window.adsFlight.getState().properTime),clock);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.adsFlight.getState().renderer.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/ads-velocity-${engine}-mobile.png`});
  await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>{window.adsFlight.setCamera('chase');window.__velocityQa.fixture(false);window.adsFlight.setPause(false)});await page.waitForFunction(()=>window.adsFlight.getState().renderer.ready&&window.adsFlight.getState().properTime>0);await page.screenshot({path:`/tmp/ads-velocity-${engine}.png`});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,engine,visiblePixels:true,toggles:true,guards:true,cameras:true,aft:true,mobile:true,errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
