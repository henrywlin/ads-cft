// Fixed-scene benchmark. Synchronous readback includes GPU completion and copy
// cost; compare on the same browser, device and resolution, not as live FPS.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=fn=>{window.__nextFrame=fn;return 1});
  await page.route('**/game.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.__perf={ready(){gl.finish();tick(last+20);return graphicsReady},render(){gl.finish();dirty=true;draw(false);gl.finish()},
    fixture(name){reset();trafficFire.enabled=false;flightProgram.nextOffer=()=>null;chase=name!=='cockpit';
     if(name==='central-close'){const X=eventAt([0,0,.4]),m=staticFrame(X);player={X,U:m.T,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1),t:0,tau:0}}
     if(name==='fast-forward'||name==='fast-turn'){advance(player,.9,2.5);if(name==='fast-turn')rotate(player,1.7,.8,.3)}
     if(name==='upgraded')player.upgrades={frame:true,cannon:true};this.render()},
    async frameBench(count){const wall=[],cpu=[],pixels=new Uint8Array(canvas.width*canvas.height*4);for(let i=0;i<count;i++){
     gl.finish();await new Promise(r=>setTimeout(r,0));let attempts=0;while(!pollFrame(false)){if(++attempts>500)throw Error(JSON.stringify({graphicsState,graphicsMessage,contextLost,frames:renderedFrames,error:gl.getError(),width:canvas.width,height:canvas.height}));await new Promise(r=>setTimeout(r,1))}
     dirty=true;const before=renderedFrames,a=performance.now();draw(false);const b=performance.now();if(renderedFrames!==before+1)throw Error('Skipped measured frame');
     gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);wall.push(performance.now()-a);cpu.push(b-a)
    }return {wall,cpu}},
    mapBench(count){const a=performance.now();for(let i=0;i<count;i++)drawMap();return (performance.now()-a)/count},
    pixels(){const data=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return [...data]}
   };`})});
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__perf);await page.evaluate(()=>{window.__nextFrame(performance.now());window.__nextFrame(performance.now())});await page.waitForFunction(()=>window.__perf.ready(),null,{polling:80});
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  const scenes={};for(const name of ['initial-chase','cockpit','central-close','fast-forward','fast-turn','upgraded']){
   console.log('Benchmark scene: '+name);await page.evaluate(name=>window.__perf.fixture(name),name);await page.evaluate(()=>window.__perf.frameBench(1));
   const timing=await page.evaluate(()=>window.__perf.frameBench(6));const pixels=process.argv[2]?await page.evaluate(()=>window.__perf.pixels()):undefined;scenes[name]={...timing,pixels};
  }
  const maps=[];for(let i=0;i<5;i++)maps.push(await page.evaluate(()=>window.__perf.mapBench(60)));
  assert.deepEqual(errors,[]);const result={scenes,maps,errors};if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result));
  const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];console.log(JSON.stringify({file:process.argv[2],mapMs:median(maps),scenes:Object.fromEntries(Object.entries(scenes).map(([n,s])=>[n,{wallMs:median(s.wall),cpuMs:median(s.cpu)}])),errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
