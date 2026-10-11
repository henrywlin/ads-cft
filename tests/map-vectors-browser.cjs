const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.argv[2]||'chromium';
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const length=arrow=>Math.hypot(arrow.dx,arrow.dy);
const velocityColor='#bdffff',noseColor='#f08bff';

(async()=>{
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/game.js?*',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text())+`
    const {movingFrame:qaMovingFrame}=await import('./physics.js?v=32');
    const qaMapArrow=drawMapArrow,qaRadiusGauge=drawMapRadiusGauge;let qaArrows=[],qaRadiusMarkers=[];
    drawMapArrow=(c,x,y,dx,dy,color)=>{if(Math.hypot(dx,dy)>1e-5)qaArrows.push({canvas:c.canvas.id,x,y,dx,dy,color});return qaMapArrow(c,x,y,dx,dy,color)};
    drawMapRadiusGauge=(c,translucent)=>{const original=c.moveTo;c.moveTo=function(x,y){if(y===310)qaRadiusMarkers.push({canvas:c.canvas.id,x});return original.call(this,x,y)};try{return qaRadiusGauge(c,translucent)}finally{c.moveTo=original}};
    window.__mapVectorsQa={
     isolate(){trafficFire.enabled=false;flightProgram.nextOffer=()=>null;setPause(true)},
     fixture(speed=.4,yaw=0,direction=[1,1,1],position=[0,0,0]){
      const X=eventAt(position,0),magnitude=Math.hypot(...direction),frame=qaMovingFrame(X,direction.map(x=>x*speed/magnitude));
      player={...initialPlayer(),X,U:frame.U,R:frame.E[0],V:frame.E[1],F:frame.E[2],t:0,tau:0};rotate(player,yaw,0,0);dirty=true;
     },
     capture(){
      qaArrows=[];qaRadiusMarkers=[];drawMap();if($('mapDialog').open)drawExpandedMap();if(!$('flightMap').hidden)drawFlightMap();
      const canvases=['map','expandedMap','flightMapCanvas'].filter(id=>id==='map'||id==='expandedMap'&&$('mapDialog').open||id==='flightMapCanvas'&&!$('flightMap').hidden);
      const pixels={};for(const id of canvases){const c=$(id),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let cyan=0,pink=0;for(let i=0;i<data.length;i+=4){if(data[i]>130&&data[i+1]>210&&data[i+2]>210&&data[i+3]>100)cyan++;if(data[i]>180&&data[i+1]>75&&data[i+1]<190&&data[i+2]>190&&data[i+3]>100)pink++}pixels[id]={cyan,pink,width:c.width,height:c.height}}
      const alignedPixels=[140,420].map(cx=>{const data=$('map').getContext('2d').getImageData(cx-7,142,14,26).data;let cyan=0,pink=0;for(let i=0;i<data.length;i+=4){if(data[i]>130&&data[i+1]>210&&data[i+2]>210&&data[i+1]>1.15*data[i]&&data[i+2]>1.15*data[i]&&data[i+3]>100)cyan++;if(data[i]>180&&data[i+1]>75&&data[i+1]<190&&data[i+2]>190&&data[i+3]>100)pink++}return {cyan,pink}});
      return {arrows:qaArrows,pixels,alignedPixels,markers:qaRadiusMarkers,radius:telemetry(player).r,speed:telemetry(player).beta};
     }
    };
   `});
  });
  await page.goto(process.env.ADS_URL||'http://127.0.0.1:8081/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__mapVectorsQa&&window.adsFlight?.getState().renderer.ready);
  await page.locator('#launchSound').click();await page.locator('#launchButton').click();
  for(let i=0;i<5;i++)await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.adsFlight.getState().storyVisible),false);
  assert.equal(await page.locator('#shipCount').inputValue(),'24');
  await page.evaluate(()=>window.__mapVectorsQa.isolate());

  const arrows=(capture,color,canvas='map')=>capture.arrows.filter(a=>a.color===color&&a.canvas===canvas);
  async function fixture(speed,yaw=0,direction=[1,1,1],position=[0,0,0]){
   return page.evaluate(({speed,yaw,direction,position})=>{window.__mapVectorsQa.fixture(speed,yaw,direction,position);return window.__mapVectorsQa.capture()},{speed,yaw,direction,position});
  }
  const tenTick=44+472*Math.tan(Math.atan(10)/2);
  for(const radius of [9.99,10,10.01,12,20])for(const direction of [[1,0,0],[0,1,0],[0,0,1],[1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)]]){
   const capture=await fixture(.4,0,[1,1,1],direction.map(v=>v*radius));
   close(capture.radius,radius);close(capture.markers[0].x,44+472*Math.tan(Math.atan(radius)/2));
   if(radius!==10)assert.equal(capture.markers[0].x>tenTick,radius>10,'Full radius crosses the 10L tick in every orientation');
   if(radius===12&&direction[0]!==0&&direction[1]!==0){
    for(const [i,arrow] of arrows(capture,velocityColor).entries())assert.ok(Math.hypot(arrow.x-[140,420][i],arrow.y-173)<118*Math.tan(Math.atan(10)/2),'Reproduce projected dots inside 10L while true radius is outside');
   }
  }
  const rest=await fixture(0),slow=await fixture(.2),fast=await fixture(.4),turned=await fixture(.4,.7);
  assert.equal(arrows(rest,noseColor).length,2,'Both map projections show the nose while stationary');
  assert.equal(arrows(rest,velocityColor).length,0,'A stationary ship has no velocity arrow');
  for(const capture of [slow,fast,turned]){assert.equal(arrows(capture,velocityColor).length,2);assert.equal(arrows(capture,noseColor).length,2)}
  close(slow.speed,.2);close(fast.speed,.4);
  for(let i=0;i<2;i++){
   const low=arrows(slow,velocityColor)[i],high=arrows(fast,velocityColor)[i],yawed=arrows(turned,velocityColor)[i];
   close(high.dx,2*low.dx);close(high.dy,2*low.dy);close(length(high),48*.4*Math.sqrt(2/3));
   close(high.dx,yawed.dx);close(high.dy,yawed.dy);
  }
  assert.ok(arrows(fast,noseColor).some((a,i)=>Math.hypot(a.dx-arrows(turned,noseColor)[i].dx,a.dy-arrows(turned,noseColor)[i].dy)>1),'Yaw changes nose orientation without changing velocity');
  const xTravel=await fixture(.4,0,[1,0,0]);assert.equal(arrows(xTravel,velocityColor).length,1,'Out-of-plane motion has no false velocity arrow');close(length(arrows(xTravel,velocityColor)[0]),48*.4);
  const yTravel=await fixture(.4,0,[0,1,0]);assert.equal(arrows(yTravel,velocityColor).length,1);close(length(arrows(yTravel,velocityColor)[0]),48*.4);
  const tiny=await fixture(.02);assert.equal(arrows(tiny,velocityColor).length,2,'Slow travel retains proportionately short vectors');
  const aligned=[];
  for(const speed of [.5,26/48]){
   const capture=await fixture(speed,0,[0,0,1]);
   assert.equal(arrows(capture,velocityColor).length,2);assert.equal(arrows(capture,noseColor).length,2);
   for(const color of [velocityColor,noseColor])for(const arrow of arrows(capture,color))close(arrow.dx,0);
   for(const pixels of capture.alignedPixels){assert.ok(pixels.cyan>2,'Aligned arrows retain visible cyan velocity pixels in the local ship ROI');assert.ok(pixels.pink>2,'Aligned arrows retain visible pink nose pixels in the local ship ROI')}
   aligned.push({speed,pixels:capture.alignedPixels});
  }
  await page.locator('#map').screenshot({path:'/tmp/ads-map-vectors-'+engine+'-aligned.png'});

  await fixture(.4,.7);
  const beforeV=await page.evaluate(()=>window.__mapVectorsQa.capture());
  await page.locator('#space').focus();await page.keyboard.press('v');
  const afterV=await page.evaluate(()=>window.__mapVectorsQa.capture());
  assert.deepEqual(afterV.arrows,beforeV.arrows,'The flight-view V toggle does not hide either orbital-map vector');
  await page.keyboard.press('v');
  assert.equal(await page.evaluate(()=>window.adsFlight.getState().velocityArrow),false);

  const layouts=[];
  for(const viewport of [{width:1200,height:850},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   await page.locator('#space').focus();await page.keyboard.press('m');
   assert.equal(await page.locator('#flightMap').isVisible(),true);
   let capture=await fixture(.4,.7,[1,1,1],[12/Math.sqrt(3),12/Math.sqrt(3),12/Math.sqrt(3)]);
   for(const marker of capture.markers)assert.ok(marker.x>tenTick,'Every map shows the true radius beyond 10L');
   for(const canvas of ['map','flightMapCanvas']){
    assert.deepEqual(arrows(capture,velocityColor,canvas).map(({dx,dy})=>({dx,dy})),arrows(capture,velocityColor).map(({dx,dy})=>({dx,dy})));
    assert.deepEqual(arrows(capture,noseColor,canvas).map(({dx,dy})=>({dx,dy})),arrows(capture,noseColor).map(({dx,dy})=>({dx,dy})));
    assert.ok(capture.pixels[canvas].cyan>10,`${canvas} has visible cyan geometry`);assert.ok(capture.pixels[canvas].pink>5,`${canvas} has visible pink nose arrows`);
   }
   await page.keyboard.press('m');
   await page.locator('#expandMapButton').click();assert.equal(await page.locator('#mapDialog').evaluate(d=>d.open),true);
   capture=await page.evaluate(()=>window.__mapVectorsQa.capture());
   assert.ok(capture.markers.some(marker=>marker.canvas==='expandedMap'&&marker.x>tenTick));
   for(const color of [velocityColor,noseColor])assert.deepEqual(arrows(capture,color,'expandedMap').map(({dx,dy})=>({dx,dy})),arrows(capture,color).map(({dx,dy})=>({dx,dy})));
   assert.ok(capture.pixels.expandedMap.cyan>10);assert.ok(capture.pixels.expandedMap.pink>5);
   const layout=await page.evaluate(()=>{const d=document.querySelector('#mapDialog').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,dialogFits:d.left>=0&&d.right<=innerWidth&&d.top>=0&&d.bottom<=innerHeight}});
   assert.equal(layout.overflow,false);assert.equal(layout.dialogFits,true);layouts.push({viewport,...layout});
   await page.screenshot({path:'/tmp/ads-map-vectors-'+engine+'-'+viewport.width+'.png'});
   await page.keyboard.press('Escape');
  }
  for(const id of ['map','expandedMap','flightMapCanvas']){
   const label=await page.locator('#'+id).getAttribute('aria-label');assert.match(label,/nose/i);assert.match(label,/velocity/i);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,engine,defaultShips:24,trueRadius:true,restingNose:true,proportionalVelocity:true,attitudeIndependent:true,foreshortening:true,slowVectors:true,aligned,allMaps:true,VIndependent:true,layouts,errors}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
