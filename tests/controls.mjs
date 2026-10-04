import assert from 'node:assert/strict';
import {initialPlayer,advance,rotate,dot,add,scale,chaseObserver,boost,eventAt,movingFrame} from '../dist/physics.js';
import {burnCommand} from '../dist/flight-controls.js';
import {ChaseCamera,rocketPoint} from '../dist/chase.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function constraints(p){close(dot(p.X,p.X),-1);close(dot(p.U,p.U),-1);close(dot(p.X,p.U),0);for(const name of ['R','V','F']){close(dot(p[name],p.X),0);close(dot(p[name],p.U),0);close(dot(p[name],p[name]),1)}for(const [a,b] of [['R','V'],['V','F'],['R','F']])close(dot(p[a],p[b]),0)}
for(const yaw of [0,.7,2.4])for(const pitch of [-.5,.3])for(const sign of [-1,1]){
 const p=initialPlayer();rotate(p,yaw,pitch,.3);const axis=p.F.slice(),coast=structuredClone(p),command=burnCommand(p,sign>0,sign<0,false,1.5);advance(p,.001,command.thrust,command.brake);advance(coast,.001);
 assert.ok(dot(add(p.U,coast.U,1,-1),axis)*sign>0,'Burn must change velocity in the requested direction');assert.ok(dot(add(p.X,coast.X,1,-1),axis)*sign>0,'Burn must displace the rocket away from the exhaust');close(command.force.reduce((sum,v,i)=>sum+v*command.exhaust[i],0),-1.5);
}
{const p=initialPlayer(),command=burnCommand(p,true,true,false,1.5);assert.equal(command.level,0);assert.equal(command.thrust,0)}
{const p=initialPlayer(),command=burnCommand(p,true,false,true,1.5);assert.equal(command.thrust,0);assert.equal(command.brake,1.5);const v=[p.R,p.V,p.F].map(e=>dot([0,1,0,0,0],e));assert.ok(command.force.reduce((sum,x,i)=>sum+x*v[i],0)>0);close(command.force.reduce((sum,v,i)=>sum+v*command.exhaust[i],0),-1.5)}
{const p=initialPlayer(),camera=new ChaseCamera(),o=camera.observer(p);constraints(o);assert.ok(dot(p.X,o.F)>0);assert.ok(dot(p.X,o.V)<0);}
for(const sign of [-1,1]){
 const p=initialPlayer(),camera=new ChaseCamera();let maxLag=0,previousScreen=rocketPoint(p,camera.observer(p),[0,0,0]).dir;previousScreen=previousScreen[1]/previousScreen[2];
 for(let j=0;j<1800;j++){
  if(j%70===0)rotate(p,.013,-.009,.008);
  const force=j<600?burnCommand(p,sign>0,sign<0,false,3):burnCommand(p,false,false,false,3);
  advance(p,.001,force.thrust,force.brake);camera.advance(.001,force.force);constraints(camera.observer(p));
  const center=rocketPoint(p,camera.observer(p),[0,0,0]).dir,currentScreen=center[1]/center[2];if(j<600)assert.ok((currentScreen-previousScreen)*sign>0,'The ship must visibly travel away from its exhaust throughout the burn');previousScreen=currentScreen;
  maxLag=Math.max(maxLag,Math.abs(camera.lag));
  for(const local of [[0,0,0],[0,0,-.039],[0,0,.084],[.017,0,.022]]){
   const o=camera.observer(p),point=rocketPoint(p,o,local);assert.ok(point);const K=add(point.X,o.X,1,-1),frequency=dot(K,o.U);assert.ok(frequency>0,'Nozzle ray must be past-directed');close(dot(K,K),0,1e-7);close(Math.hypot(...point.dir)/frequency,1,1e-7);close(dot(point.X,point.X),-1,1e-7);[p.R,p.V,p.F].forEach((e,i)=>close(dot(point.X,e),local[i]));assert.ok(point.phase<0&&point.phase>-Math.PI);
  }
 }
 assert.ok(maxLag>.025&&maxLag<.04);assert.ok(Math.abs(camera.lag)<.0001,'Chase camera must smoothly recover after release');assert.ok(Math.abs(camera.rate)<.001);camera.reset();assert.equal(camera.lag,0);
}
// Image-plane arrows and flames point in opposite directions for both burns.
for(const sign of [-1,1]){
 const p=initialPlayer(),camera=new ChaseCamera();for(let i=0;i<100;i++){advance(p,.002,sign*1.5);camera.advance(.002,[0,0,sign*1.5])}
 const o=camera.observer(p),xy=local=>{const d=rocketPoint(p,o,local).dir;return [d[0]/d[2],d[1]/d[2]]},difference=(a,b)=>a.map((v,i)=>v-b[i]);
 const arrow=difference(xy([0,0,sign*.084]),xy([0,0,sign*.044])),exhaust=difference(xy([0,0,-sign*.084]),xy([0,0,-sign*.039]));assert.ok(arrow.reduce((sum,v,i)=>sum+v*exhaust[i],0)<0);
 assert.ok(camera.lag*sign>0);
}
console.log('PASS: rotated forward/reverse burns accelerate away from exhaust, brake precedence, orthonormal moving chase frames, bounded trailing/recovery and retarded nozzle/arrow alignment.');
