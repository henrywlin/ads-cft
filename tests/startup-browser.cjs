const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'webkit',url=process.env.ADS_URL||'http://127.0.0.1:8081/';
(async()=>{const b=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});try{
 const reports=[];
 const launchLayout=p=>p.evaluate(()=>['.launch-center','.launch-pilots','#launchButton','.launch-enter','.launch-bottom'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,y:r.y,height:r.height}}));
 function sameLayout(before,after){for(let i=0;i<before.length;i++){assert.ok(Math.abs(before[i].y-after[i].y)<.5,`${before[i].selector} moved: ${JSON.stringify({before:before[i],after:after[i]})}`);assert.ok(Math.abs(before[i].height-after[i].height)<.5,`${before[i].selector} changed height`)}}
 async function pageFor(mode,viewport={width:1280,height:850}){
  const p=await b.newPage({viewport,deviceScaleFactor:2}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(mode=>{
   window.__startup={release:false,assignments:0,lost:0,restored:0};
   const nativeContext=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){if(this.id==='space'&&type==='webgl2'&&mode==='unavailable')return null;return nativeContext.call(this,type,...args)};
   const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width');
   Object.defineProperty(HTMLCanvasElement.prototype,'width',{...descriptor,set(value){if(this.id==='space')window.__startup.assignments++;return descriptor.set.call(this,value)}});
   const nativeWait=WebGL2RenderingContext.prototype.clientWaitSync;let firstFence;
   WebGL2RenderingContext.prototype.clientWaitSync=function(sync,...args){firstFence??=sync;if(mode==='delay'&&!window.__startup.release)return this.TIMEOUT_EXPIRED;if(mode==='stale'&&sync===firstFence)return this.TIMEOUT_EXPIRED;return nativeWait.call(this,sync,...args)};
   document.addEventListener('webglcontextlost',()=>window.__startup.lost++,true);document.addEventListener('webglcontextrestored',()=>window.__startup.restored++,true);
  },mode);
  await p.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`\nwindow.__startup.age=()=>{gpuStarted=performance.now()-9000};window.__startup.size=resize;`})});
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.adsFlight);return {p,errors};
 }
 for(const viewport of [{width:1280,height:850},{width:390,height:844},{width:844,height:390}]){
  const {p,errors}=await pageFor('normal',viewport);await p.waitForFunction(()=>window.adsFlight.getState().renderer.ready);
  assert.equal(await p.locator('#launchButton').isEnabled(),true);assert.equal(await p.locator('#launchGraphicsStatus').isVisible(),false);
  const attrs=await p.evaluate(()=>document.getElementById('space').getContext('webgl2').getContextAttributes());assert.equal(attrs.preserveDrawingBuffer,true);assert.equal(attrs.powerPreference,'default');
  await p.locator('#launchSound').click();await p.locator('#launchButton').click();await p.waitForFunction(()=>window.adsFlight.getState().storyVisible);
  // No readPixels/finish hooks during startup: inspect retained pixels only
  // after rendering is confirmed and the briefing has been idle for a second.
  await p.waitForTimeout(1000);const image=await p.evaluate(()=>{const gl=document.getElementById('space').getContext('webgl2'),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let lit=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>45)lit++;return {lit,error:gl.getError()}});assert.ok(image.lit>250,JSON.stringify(image));assert.equal(image.error,0);
  const assigned=await p.evaluate(()=>window.__startup.assignments);await p.evaluate(()=>{window.__startup.size();window.__startup.size()});assert.equal(await p.evaluate(()=>window.__startup.assignments),assigned,'An unchanged size must not erase the scene');
  assert.equal((await p.evaluate(()=>window.adsFlight.getState())).properTime,0);assert.deepEqual(errors,[]);reports.push({viewport,retainedPixels:image.lit});await p.close();
 }
 for(const viewport of [{width:1280,height:850},{width:390,height:844},{width:844,height:390}]){
  const {p,errors}=await pageFor('delay',viewport);await p.waitForFunction(()=>window.adsFlight.getState().renderer.frames>0);await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.locator('#launchButton').isDisabled(),true);await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');let state=await p.evaluate(()=>window.adsFlight.getState());assert.equal(state.launched,false);assert.equal(state.properTime,0);assert.equal(state.renderer.ready,false);assert.equal(state.pilot,'Steven Gubser');assert.equal(await p.locator('#launchGraphicsStatus').isVisible(),true);const before=await launchLayout(p);
  await p.evaluate(()=>window.__startup.release=true);await p.waitForFunction(()=>window.adsFlight.getState().renderer.ready);sameLayout(before,await launchLayout(p));assert.equal(await p.locator('#launchGraphicsStatus').isVisible(),false);
  // Recovery can repeat readiness transitions without moving launch controls.
  await p.evaluate(()=>{window.__startup.contextRecovery=document.querySelector('#space').getContext('webgl2').getExtension('WEBGL_lose_context');window.__startup.contextRecovery.loseContext()});await p.waitForFunction(()=>window.adsFlight.getState().renderer.status==='lost');sameLayout(before,await launchLayout(p));
  await p.evaluate(()=>window.__startup.contextRecovery.restoreContext());await p.waitForFunction(()=>window.adsFlight.getState().renderer.ready);sameLayout(before,await launchLayout(p));
  await p.keyboard.press('Enter');assert.equal((await p.evaluate(()=>window.adsFlight.getState())).storyVisible,true);assert.deepEqual(errors,[]);await p.close();
 }
 {
  const {p,errors}=await pageFor('stale');await p.waitForFunction(()=>window.adsFlight.getState().renderer.frames>0);await p.evaluate(()=>window.__startup.age());await p.waitForFunction(()=>window.__startup.restored>0&&window.adsFlight.getState().renderer.ready);const state=await p.evaluate(()=>window.adsFlight.getState());assert.equal(state.properTime,0);assert.equal(await p.evaluate(()=>window.__startup.lost),1);assert.equal(await p.locator('#launchButton').isEnabled(),true);assert.deepEqual(errors,[]);await p.close();
 }
 {
  const {p,errors}=await pageFor('unavailable');await p.waitForFunction(()=>window.adsFlight.getState().renderer.status==='failed');assert.equal(await p.locator('#launchGraphicsStatus [data-reload-graphics]').isVisible(),true);await p.keyboard.press('Enter');assert.equal((await p.evaluate(()=>window.adsFlight.getState())).launched,false);await p.locator('#launchGraphicsStatus [data-reload-graphics]').focus();await Promise.all([p.waitForEvent('domcontentloaded'),p.keyboard.press('Enter')]);assert.deepEqual(errors,[]);await p.close();
 }
 console.log(JSON.stringify({pass:true,engine,coldLoads:reports,delayedFirstFrame:true,stableLaunchLayout:true,staleFenceRecovery:true,unavailableContext:true,unchangedResize:true}));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
