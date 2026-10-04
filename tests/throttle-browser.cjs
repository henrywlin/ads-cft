const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`
   window.__throttleQa={isolate(){trafficFire.enabled=false;flightProgram.nextOffer=()=>null},stop(){endFlight()}};
  `})});
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.adsFlight?.getState().renderer.ready);
  async function acceleration(expected){
   const values=await page.evaluate(()=>({state:window.adsFlight.getState().properAcceleration,slider:document.querySelector('#thrust').valueAsNumber,output:document.querySelector('#thrustValue').value}));
   assert.equal(values.state,expected);assert.equal(values.slider,expected);assert.equal(values.output,expected.toFixed(1));
  }
  async function slider(value){await page.locator('#thrust').evaluate((element,value)=>{element.value=String(value);element.dispatchEvent(new Event('input',{bubbles:true}))},value)}
  async function repeat(code,count){return page.locator('#space').evaluate((element,{code,count})=>{let prevented=0;for(let i=0;i<count;i++)if(!element.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.slice(-1).toLowerCase(),repeat:true,bubbles:true,cancelable:true})))prevented++;return prevented},{code,count})}
  await page.keyboard.press('u');await page.keyboard.press('d');await acceleration(1.5);
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();
  await page.keyboard.press('u');await acceleration(1.5);
  for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).storyVisible,false);
  await page.evaluate(()=>{window.__throttleQa.isolate();window.adsFlight.setPause(true)});await page.locator('#space').focus();
  const frozen=await page.evaluate(()=>window.adsFlight.getState().properTime);
  await page.keyboard.press('u');await acceleration(1.6);await page.keyboard.press('d');await acceleration(1.5);
  await page.keyboard.press('Shift+u');await acceleration(1.6);
  const modified=await page.locator('#space').evaluate(element=>['ctrlKey','metaKey','altKey'].map(modifier=>element.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',key:'d',[modifier]:true,bubbles:true,cancelable:true}))));
  assert.deepEqual(modified,[true,true,true]);await acceleration(1.6);
  assert.equal(await repeat('KeyU',40),40);await acceleration(3);
  assert.equal(await repeat('KeyD',50),50);await acceleration(.3);
  assert.equal((await page.evaluate(()=>window.adsFlight.getState())).properTime,frozen);
  assert.deepEqual((await page.evaluate(()=>window.adsFlight.getState())).engine.force,[0,0,0]);
  await slider(.8);await acceleration(.8);await page.locator('#thrust').focus();
  await page.keyboard.press('u');await acceleration(.9);await page.keyboard.press('d');await acceleration(.8);
  await page.keyboard.press('ArrowRight');await acceleration(.9);
  await page.locator('#warp').focus();await page.keyboard.press('u');await page.keyboard.press('d');await acceleration(.9);
  await page.locator('#helpButton').click();await page.keyboard.press('u');await page.keyboard.press('d');await acceleration(.9);
  assert.match(await page.locator('#helpDialog').innerText(),/Throttle up \/ down/);
  await page.locator('#helpDialog [data-close]').click();
  await slider(1.5);await page.locator('#space').focus();await page.evaluate(()=>window.adsFlight.setPause(false));
  await page.keyboard.down('w');await page.waitForFunction(()=>window.adsFlight.getState().engine.force[2]===1.5);
  await page.keyboard.press('u');await page.waitForFunction(()=>window.adsFlight.getState().engine.force[2]===1.6);await acceleration(1.6);
  await page.keyboard.press('d');await page.waitForFunction(()=>window.adsFlight.getState().engine.force[2]===1.5);await acceleration(1.5);
  await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForFunction(()=>window.adsFlight.getState().engine.force[2]===-1.5);
  await page.keyboard.press('u');await page.waitForFunction(()=>window.adsFlight.getState().engine.force[2]===-1.6);
  await page.keyboard.up('s');await page.waitForFunction(()=>window.adsFlight.getState().engine.force.every(v=>v===0));
  await page.evaluate(()=>window.__throttleQa.stop());await page.keyboard.press('u');await page.keyboard.press('d');await acceleration(1.6);
  await page.evaluate(()=>{window.adsFlight.reset();window.__throttleQa.isolate();window.adsFlight.setPause(true)});await acceleration(1.6);
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Throttle hint must not cause horizontal overflow');
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,steps:.1,bounds:[.3,3],repeat:true,sliderSync:true,forwardAndReverse:true,briefingAndDialogGuards:true,modifiedKeysUntouched:true,pausedClockUnchanged:true,layout:true,errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
