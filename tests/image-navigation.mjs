import assert from 'node:assert/strict';
import {eventAt,movingFrame,initialPlayer,makeFleet,retarded,rotate,dot,advance} from '../dist/physics.js';
import {ChaseCamera} from '../dist/chase.js';
import {pickShipImage,faceDirectImage,directImageBox} from '../dist/image-navigation.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const shipAt=z=>{const A=eventAt([0,0,z]),m=movingFrame(A,[0,0,0]);return {id:String(z),A,B:m.U,C:m.E,kind:0,size:1,boundRadius:.065}};
const X=eventAt([0,0,.6]),m=movingFrame(X,[0,0,0]),observer={X,U:m.U,R:m.E[0],V:m.E[1],F:m.E[2],t:4*Math.PI,tau:4*Math.PI};
const source=shipAt(0),blocker=shipAt(1.5);
let hit=pickShipImage(observer,[source],400,300,800,600);assert.equal(hit.ship,source);assert.equal(hit.reflected,true);
hit=pickShipImage(observer,[source,blocker],400,300,800,600);assert.equal(hit.ship,blocker);assert.equal(hit.reflected,false,'A foreground direct image must occlude a reflection');
blocker.deathTime=1;hit=pickShipImage(observer,[source,blocker],400,300,800,600);assert.equal(hit.ship,source);assert.equal(hit.reflected,true);
source.deathTime=1;assert.equal(pickShipImage(observer,[source],400,300,800,600),null,'Light emitted after destruction must not be selectable');delete source.deathTime;
assert.equal(pickShipImage(observer,[source],-1,300,800,600),null);
for(const reflected of [false,true]){
 const p=structuredClone(observer);if(!reflected)rotate(p,Math.PI,0,0);
 for(const kind of [0,1,2,3]){source.kind=kind;hit=pickShipImage(p,[source],400,300,800,600);assert.equal(hit.ship,source);assert.equal(hit.reflected,reflected)}
}
const camera=new ChaseCamera();
for(const ship of makeFleet())for(const burn of [0,1.5,-1.5]){
 const p=initialPlayer();rotate(p,.9,-.7,.4);advance(p,.3,burn);const before=structuredClone(p);
 assert.equal(faceDirectImage(p,ship),true);
 for(const key of ['X','U','t','tau'])assert.deepEqual(p[key],before[key]);
 const direct=retarded(ship,p);close(direct.dir[0],0);close(direct.dir[1],0);close(direct.dir[2],1);
 for(const e of ['R','V','F']){close(dot(p[e],p[e]),1);close(dot(p[e],p.X),0);close(dot(p[e],p.U),0)}
 close(dot(p.R,p.V),0);close(dot(p.R,p.F),0);close(dot(p.V,p.F),0);
 for(const o of [p,camera.observer(p)]){
  const view=retarded(ship,o),box=directImageBox(ship,o,800,600);
  const x=400+view.dir[0]/view.dir[2]/1.4*600,y=300-view.dir[1]/view.dir[2]/1.4*600;
  if(view.dir[2]>.03&&x>3&&x<797&&y>3&&y<597){assert.ok(box);assert.ok(x>=box.left&&x<=box.left+box.width&&y>=box.top&&y<=box.top+box.height,'The box must enclose the direct image center')}
 }
}
console.log('PASS: direct/reflected hull picking, occlusion, destruction timing, all hull types, direct-image boxes and attitude-only orientation after burns.');
