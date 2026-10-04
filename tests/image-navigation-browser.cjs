const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const engine=process.argv[2]||'chromium';
(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.addInitScript(()=>{window.requestAnimationFrame=fn=>{window.__nextFrame=fn;return 1}});
  await page.route('**/game.js?*',async route=>{
   const response=await route.fetch();let source=await response.text();
   source=source.replace('uniform float engineBurn;','uniform float engineBurn; uniform float imageAudit;')
    .replace('float nearest=1e20;','vec3 pickedColor=vec3(0.0);float nearest=1e20;')
    .replace('nearest=bestDelay;','nearest=bestDelay;pickedColor=vec3(float(i+1)/255.0,etaHit<0.0?1.0:0.0,0.0);')
    .replace('float vignette=','if(imageAudit>.5){frag=vec4(pickedColor,1.0);return;}float vignette=');
   source+=`\nwindow.__imageQa={
    render(){gl.finish();dirty=true;draw(false);gl.finish();pollFrame(false)},
    fixture(camera){
     reset();trafficFire.enabled=false;flightProgram.nextOffer=()=>null;setCamera(camera);
     const X=eventAt([0,0,.6]),m=staticFrame(X);player={X,U:m.T,R:m.E[0],V:m.E[1],F:m.E[2],t:0,tau:0};
     const A=eventAt([0,0,0]),f=staticFrame(A);fleet.splice(0,fleet.length,{id:'STARSHIP NEWTON',A,B:f.T,C:f.E,kind:0,size:1,hue:.5,boundRadius:.065});
     this.render();return this.point(true);
    },
    point(reflected){const s=fleet[0],v=retarded(s,imageFrame.observer,reflected);return {x:width/2+v.dir[0]/v.dir[2]/1.4*height,y:height/2-v.dir[1]/v.dir[2]/1.4*height}},
    result(){const box=selectedImageShip&&directImageBox(selectedImageShip,viewObserver(),width,height),pixels=hctx.getImageData(0,0,hud.width,hud.height).data;let cyan=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<180&&pixels[i+1]>235&&pixels[i+2]>215&&pixels[i+3]>180)cyan++;return {selected:selectedImageShip?.id??null,shots,player:snapshot(player),dir:retarded(fleet[0],player).dir,box,cyan}},
    label(){return imageFrame.labels[0]},
    turnWithoutRendering(){rotate(player,.7,-.3,0)},
    destroy(){fleet[0].deathTime=player.t;this.render()},
    populated(){fleet.splice(0,fleet.length,...makeFleet());player=initialPlayer();setCamera('chase');this.render()},
    async gpuCheck(){
     const ready=async()=>{for(let i=0;i<100;i++){gl.finish();if(pollFrame(false))return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('GPU did not finish the diagnostic frame')};await ready();
     const loc=gl.getUniformLocation(program,'imageAudit');gl.uniform1f(loc,1);this.render();await ready();
     const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     const checks=[];for(let y=2;y<canvas.height;y+=3)for(let x=2;x<canvas.width;x+=3){const i=((canvas.height-1-y)*canvas.width+x)*4;if(!pixels[i])continue;
      const hit=pickShipImage(imageFrame.observer,imageFrame.ships,x+.5,y+.5,canvas.width,canvas.height);
      checks.push({gpu:imageFrame.ships[pixels[i]-1].id,cpu:hit?.ship.id,reflected:pixels[i+1]>128,cpuReflected:hit?.reflected});
     }
     gl.uniform1f(loc,0);this.render();await ready();return checks;
    }
   };`;
   await route.fulfill({response,body:source});
  });
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8082/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__imageQa);await page.evaluate(()=>{window.__nextFrame(performance.now());window.__nextFrame(performance.now())});
  await page.waitForFunction(()=>{window.__imageQa.render();return window.adsFlight.getState().renderer.ready},null,{timeout:30000,polling:50}).catch(async e=>{console.log(JSON.stringify({errors,state:await page.evaluate(()=>window.adsFlight.getState().renderer)}));throw e});
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();
  for(let i=0;i<10&&(await page.evaluate(()=>window.adsFlight.getState().storyVisible));i++)await page.keyboard.press('Enter');
  const reports=[];
  const location=async p=>{const r=await page.locator('#space').boundingBox();return {x:r.x+p.x,y:r.y+p.y}};
  const fixture=async camera=>{const frames=(await page.evaluate(()=>window.adsFlight.getState())).renderer.frames;await page.evaluate(c=>window.__imageQa.fixture(c),camera);await page.waitForFunction(n=>{window.__imageQa.render();const r=window.adsFlight.getState().renderer;return r.ready&&r.frames>n},frames,{polling:50});return page.evaluate(()=>window.__imageQa.point(true))};
  for(const viewport of [{width:1200,height:850},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(()=>{window.__imageQa.render();return window.adsFlight.getState().renderer.ready},null,{polling:50});
   for(const camera of ['cockpit','chase']){
    let point=await fixture(camera),p=await location(point);
    const before=await page.evaluate(()=>window.__imageQa.result());
    if(viewport.width<500)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
    await page.evaluate(()=>window.__imageQa.render());const after=await page.evaluate(()=>window.__imageQa.result());
    if(!after.selected)console.log(JSON.stringify({camera,viewport,point,p,before,after,debug:await page.evaluate(p=>({target:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,350),state:window.adsFlight.getState(),}),p).catch(e=>e.message)}));assert.equal(after.selected,'STARSHIP NEWTON');assert.equal(after.shots,0);assert.ok(after.dir[2]>.999999);
    for(const k of ['X','U','t','tau'])assert.deepEqual(after.player[k],before.player[k]);assert.ok(after.box&&after.cyan>20,'Direct image needs a visible cyan box');
    await page.screenshot({path:'/tmp/ads-image-navigation-'+engine+'-'+camera+'-'+viewport.width+'.png'});
    const gpu=await page.evaluate(()=>window.__imageQa.gpuCheck());assert.ok(gpu.length>0);for(const c of gpu){assert.equal(c.cpu,c.gpu);assert.equal(c.cpuReflected,c.reflected)}
    await page.evaluate(()=>window.__imageQa.destroy());assert.equal((await page.evaluate(()=>window.__imageQa.result())).selected,null);
    point=await fixture(camera);p=await location(point);
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+25,p.y+8);await page.mouse.move(p.x,p.y);await page.mouse.up();
    let result=await page.evaluate(()=>window.__imageQa.result());assert.equal(result.selected,null);assert.equal(result.shots,0,'A drag back to its starting point must not fire');
    point=await fixture(camera);p=await location(point);await page.evaluate(()=>window.__imageQa.turnWithoutRendering());await page.mouse.click(p.x,p.y);assert.equal((await page.evaluate(()=>window.__imageQa.result())).selected,'STARSHIP NEWTON','Picking must use the shown frame');
    await fixture(camera);const label=await page.evaluate(()=>window.__imageQa.label());if(label){const l=await location({x:(label.left+label.right)/2,y:(label.top+label.bottom)/2});await page.mouse.click(l.x,l.y);assert.equal((await page.evaluate(()=>window.__imageQa.result())).selected,'STARSHIP NEWTON')}
    await fixture(camera);const blank=await location({x:20,y:40});await page.mouse.click(blank.x,blank.y,{button:'right'});assert.equal((await page.evaluate(()=>window.__imageQa.result())).shots,0);await page.mouse.click(blank.x,blank.y);assert.equal((await page.evaluate(()=>window.__imageQa.result())).shots,1,'Empty space must still fire');
    reports.push({camera,viewport,gpuPixels:gpu.length});
   }
  }
  await page.evaluate(()=>window.__imageQa.populated());const populated=await page.evaluate(()=>window.__imageQa.gpuCheck());assert.ok(populated.length>0);for(const c of populated){assert.equal(c.cpu,c.gpu,JSON.stringify(c));assert.equal(c.cpuReflected,c.reflected,JSON.stringify(c))}
  await page.evaluate(()=>window.adsFlight.reset());assert.equal((await page.evaluate(()=>window.adsFlight.getState())).selectedImageShip,null);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,reports,populatedPixels:populated.length,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
