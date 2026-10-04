import assert from 'node:assert/strict';
import {eventAt,movingFrame,initialPlayer,rotate,telemetry} from '../dist/physics.js';
import {velocityDirection,velocityCue} from '../dist/velocity-cue.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const radius of [0,1,10])for(const velocity of [[0,0,0],[.8,0,0],[0,.6,0],[0,0,.7],[0,0,-.5],[.2,-.3,.4]]){
 const X=eventAt([0,0,radius],.7),m=movingFrame(X,velocity),p={X,U:m.U,R:m.E[0],V:m.E[1],F:m.E[2]};
 const motion=velocityDirection(p),speed=Math.hypot(...velocity);
 if(!speed){assert.equal(motion,null);assert.equal(velocityCue(p,1000,600),null);continue}
 close(motion.beta,speed);close(motion.beta,telemetry(p).beta);
 motion.direction.forEach((v,i)=>close(v,velocity[i]/speed));
 const before=p.U.slice();rotate(p,.8,-.3,.4);assert.deepEqual(p.U,before);
 close(Math.hypot(...velocityDirection(p).direction),1);
 for(const [width,height] of [[1100,700],[390,500],[670,260]]){
  const cue=velocityCue(p,width,height);assert.ok(Number.isFinite(cue.angle));
  assert.ok(cue.x>=0&&cue.x<=width&&cue.y>=0&&cue.y<=height);
 }
}
const p=initialPlayer();close(velocityDirection(p).direction[0],1);
rotate(p,Math.PI/2,0,0);close(velocityDirection(p).direction[2],1);
let cue=velocityCue(p,1000,600);close(cue.x,500);close(cue.y,300);assert.equal(cue.aft,false);
rotate(p,Math.PI,0,0);cue=velocityCue(p,1000,600);close(cue.x,500);assert.ok(cue.y>300);assert.equal(cue.aft,true);
console.log('Velocity cue: static-frame speeds, relativistic body directions, attitude-only turns, rest and screen edges pass.');
