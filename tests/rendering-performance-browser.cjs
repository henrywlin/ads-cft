const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=fn=>{window.__nextFrame=fn;return 1});
  await page.route('**/game.js?*',async route=>{
   const response=await route.fetch();let source=await response.text();
   const pair='bounds:shipBounds(s,observer,3/canvas.height,!s.own,true)';assert.ok(source.includes(pair));
   source=source.replace(pair,'bounds:referenceCulling?[shipBounds(s,observer,3/canvas.height,!s.own),[1000,1000,0,0]]:shipBounds(s,observer,3/canvas.height,!s.own,true)');
   source=source.replace('.filter(item=>item.bounds.some(inView))','.filter(item=>referenceCulling||item.bounds.some(inView))');
   source+=`
    import {movingFrame} from './physics.js?v=32';
    let referenceCulling=false;
    window.__renderQa={
     ready(){gl.finish();tick(last+20);return graphicsReady},
     fixture(name){reset();trafficFire.enabled=false;flightProgram.nextOffer=()=>null;chase=name!=='cockpit';
      if(name==='central-close'){const X=eventAt([0,0,.4]),m=staticFrame(X);player={X,U:m.T,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1),t:0,tau:0}}
      if(name==='inside-axiom'){const X=eventAt([0,0,.03]),m=staticFrame(X);player={X,U:m.T,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1),t:0,tau:0};chase=false}
      if(name==='fast-forward'||name==='fast-turn'){advance(player,.9,2.5);if(name==='fast-turn')rotate(player,1.7,.8,.3)}
      if(name==='outer-orbit'){const X=eventAt([0,0,14],.8),m=movingFrame(X,[.95,0,0]);player={X,U:m.U,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1),t:.8,tau:0}}
      if(name==='upgraded')player.upgrades={frame:true,cannon:true};dirty=true;
     },
     async render(reference){referenceCulling=reference;gl.finish();let attempts=0;while(!pollFrame(false)){if(++attempts>500)throw Error('GPU frame unavailable');await new Promise(r=>setTimeout(r,2))}
      dirty=true;const before=renderedFrames;draw(false);if(renderedFrames!==before+1)throw Error('Frame skipped');
      const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const submitted=gl.getUniform(program,locations.shipCount);return {pixels:[...pixels],submitted};
     }
    };`;
   await route.fulfill({response,body:source});
  });
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__renderQa);await page.evaluate(()=>{window.__nextFrame(performance.now());window.__nextFrame(performance.now())});await page.waitForFunction(()=>window.__renderQa.ready(),null,{polling:80});
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  const reports=[];
  for(const scene of ['initial-chase','cockpit','central-close','inside-axiom','fast-forward','fast-turn','outer-orbit','upgraded']){
   console.log('Checking scene: '+scene);await page.evaluate(scene=>window.__renderQa.fixture(scene),scene);
   const reference=await page.evaluate(()=>window.__renderQa.render(true)),optimized=await page.evaluate(()=>window.__renderQa.render(false));
   assert.equal(optimized.pixels.length,reference.pixels.length);let differences=0,first=-1;for(let i=0;i<optimized.pixels.length;i++)if(optimized.pixels[i]!==reference.pixels[i]){differences++;if(first<0)first=i}
   assert.equal(differences,0,`${scene}: ${differences} changed color bytes; first at ${first}, ${optimized.pixels[first]} vs ${reference.pixels[first]}`);
   assert.ok(optimized.submitted<=reference.submitted);assert.equal((await page.evaluate(()=>window.adsFlight.getState())).fleetCount,48);
   reports.push({scene,referenceShips:reference.submitted,submittedShips:optimized.submitted});
  }
  assert.ok(reports.some(r=>r.submittedShips<r.referenceShips),'Avoid submitting invisible hulls');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,engine,pixelsUnchanged:true,reports,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
