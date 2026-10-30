const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium',url=process.env.ADS_URL||'http://127.0.0.1:8081/';
const baseline=execFileSync('git',['show','1a04d98e04e7aa0af595bc7fe7469e4b7f066721:dist/game.js'],{encoding:'utf8'});
(async()=>{const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});try{
 const errors=[],captures=[];
 const pixels=canvas=>{const gl=canvas.getContext('webgl2'),w=canvas.width,h=canvas.height,data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);let raw='';for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));return {w,h,pixels:btoa(raw),error:gl.getError()}};
 for(const reference of [true,false]){
  const p=await browser.newPage({viewport:{width:1200,height:850}});p.on('pageerror',e=>errors.push(e.message));
  if(reference)await p.route('**/game.js?*',route=>route.fulfill({contentType:'text/javascript',body:baseline}));
  await p.goto(url+'?level=1&v=37',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.adsFlight?.getState().renderer.ready);
  const data=await p.evaluate('('+pixels.toString()+')(document.getElementById("space"))');assert.equal(data.error,0);captures.push({...data,pixels:Buffer.from(data.pixels,'base64')});await p.close();
 }
 assert.equal(captures[0].w,captures[1].w);assert.equal(captures[0].h,captures[1].h);let changed=0;for(let i=0;i<captures[0].pixels.length;i++)if(captures[0].pixels[i]!==captures[1].pixels[i])changed++;assert.equal(changed,0,'Shared materials preserve the published level 1 pixels');
 const p=await browser.newPage({viewport:{width:1400,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(60000);
 await p.route('**/black-hole-game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 window.__styleQa={
  paint({pilot:which=0,mode='idle',explosion=false,traffic=false}={}){selectPilot(which);paused=true;$('pauseOverlay').hidden=true;chase=true;chaseCamera.reset();plume=mode==='reverse'?-1.5:mode==='idle'?0:1.5;braking=mode==='brake';engineVisualLevel=mode==='idle'?0:.8;time=1;bursts=explosion?[{x:player.x,player:true,age:0,started:performance.now()-640,seed:2301}]:[];drawOverlay(0);return this.stats()},
  stats(){const gl=rocketModel.gl,w=rocketModel.canvas.width,h=rocketModel.canvas.height,a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);const colors=new Set();let opaque=0;for(let i=0;i<a.length;i+=4)if(a[i+3]){opaque++;colors.add(a[i]+','+a[i+1]+','+a[i+2])}const image=ctx.getImageData(0,0,overlay.width,overlay.height).data;let warm=0;for(let i=0;i<image.length;i+=4)if(image[i]>150&&image[i]>image[i+2]*1.4&&image[i+1]>50&&image[i+3]>60)warm++;let raw='';for(let i=0;i<a.length;i+=8192)raw+=String.fromCharCode(...a.subarray(i,i+8192));return {w,h,opaque,colors:colors.size,warm,pixels:btoa(raw),error:gl.getError()}},
  cockpit(){chase=false;plume=0;engineVisualLevel=0;bursts=[];beams=[];flashAt=-Infinity;drawOverlay(0);return ctx.getImageData(0,0,overlay.width,overlay.height).data.some(v=>v)},
 };`})});
 await p.goto(url+'?level=2&v=37',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.adsFlight?.getState().renderer.ready);await p.locator('#launchSound').click();await p.locator('#launchButton').click();for(let i=0;i<4;i++)await p.keyboard.press('Enter');await p.evaluate(()=>{window.adsFlight.setPause(true);document.getElementById('pauseOverlay').hidden=true});
 const states=[];for(let pilot=0;pilot<5;pilot++){const state=await p.evaluate(pilot=>window.__styleQa.paint({pilot}),pilot);assert.equal(state.error,0);assert.ok(state.opaque>500);assert.ok(state.colors>25,'A shaded 3D hull has many lighting levels');states.push(state)}
 assert.equal(new Set(states.map(s=>s.pixels)).size,5,'All pilots retain their level 1 paint colors');assert.equal(new Set(states.map(s=>s.opaque)).size,1,'Pilot selection changes paint, not geometry');
 const idle=states[0],effects=[];for(const mode of ['forward','reverse','brake']){const s=await p.evaluate(mode=>window.__styleQa.paint({mode}),mode);assert.ok(s.warm>idle.warm+15,mode+' uses warm level 1 engine effects');effects.push({mode,warm:s.warm})}
 const explosion=await p.evaluate(()=>window.__styleQa.paint({explosion:true}));assert.ok(explosion.warm>2000,'Explosion shares the large warm flash and debris treatment');
 assert.equal(await p.evaluate(()=>window.__styleQa.cockpit()),false,'Cockpit hides the 3D chase hull');
 const shots=[];for(const viewport of [{width:1400,height:900},{width:390,height:844},{width:844,height:390}]){await p.setViewportSize(viewport);await p.waitForTimeout(120);await p.evaluate(()=>window.__styleQa.paint());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:'/tmp/ads-style-'+engine+'-'+viewport.width+'.png'});shots.push(viewport)}
 assert.equal(await p.locator('#musicButton > span').count(),1);assert.equal(await p.locator('#pauseButton > span').count(),1);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,engine,level1ChangedBytes:changed,rocket:{opaque:idle.opaque,shades:idle.colors},pilots:5,effects,layouts:shots}));await p.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
