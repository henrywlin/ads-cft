import assert from 'node:assert/strict';
import {dot,add,scale,eventAt,movingFrame,retarded,makeFleet,initialPlayer,advance,telemetry,geodesicAt} from '../dist/physics.js';
import {ChaseCamera} from '../dist/chase.js';
import {compactRadius,mapCoordinates} from '../dist/map.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const observer=(r,t=0)=>{const X=eventAt([0,0,r],t),m=movingFrame(X,[0,0,0]);return {X,U:m.U,R:m.E[0],V:m.E[1],F:m.E[2],t,tau:0}};
// Prescribe a radial emission event on the observer's past cone, independently
// of the retarded solver. Compare with gravitational × SR longitudinal shift.
for(const [re,ro] of [[1,0],[1,4],[.001,0],[.001,.002]])for(const v of [-.8,0,.4,.8]){
 const direction=Math.sign(ro-re),delay=Math.abs(Math.atan(ro)-Math.atan(re));
 const A=eventAt([0,0,re],-delay),m=movingFrame(A,[0,0,direction*v]),ship={A,B:m.U,C:m.E},o=observer(ro),view=retarded(ship,o);
 assert.ok(view);close(view.delay,delay);close(view.gravity,Math.hypot(1,re)/Math.hypot(1,ro));close(view.doppler,Math.sqrt((1+v)/(1-v)));
 close(view.shift,view.gravity*view.doppler);
 if(re===1&&ro===4&&v===.4){assert.ok(view.doppler>1&&view.shift<1);console.log(`Approaching at 0.4c: Doppler ${view.doppler.toFixed(3)} × gravity ${view.gravity.toFixed(3)} = ${view.shift.toFixed(3)} (red).`)}
}
// Independently compare the measured frequency with the spacing of emission
// proper phases of successive received wavefronts, direct and reflected.
const fleet=makeFleet(72),player=initialPlayer(),camera=new ChaseCamera();
for(const time of [0,.4,2,7]){
 const p=structuredClone(player);advance(p,time);const burnt=structuredClone(p);for(let i=0;i<150;i++)advance(burnt,.002,1.5);const observers=[p,camera.observer(p),burnt,camera.observer(burnt)];
 for(const o of observers)for(const ship of fleet)for(const reflected of [false,true]){
  const image=retarded(ship,o,reflected);assert.ok(image,'Both optical branches exist');
  const eps=1e-6,next=structuredClone(o);advance(next,eps);const second=retarded(ship,next,reflected);assert.ok(second);
  const phase=image.X,phase2=second.X;
  const s1=Math.atan2(-dot(phase,ship.B),-dot(phase,ship.A)),s2=Math.atan2(-dot(phase2,ship.B),-dot(phase2,ship.A));
  const difference=Math.atan2(Math.sin(s2-s1),Math.cos(s2-s1));close(difference/eps,image.shift,3e-4);
  const eta=reflected?-1:1,K=scale(add(phase,o.X,eta,-1),1/(dot(add(phase,o.X,eta,-1),o.U)));
  close(dot(K,K),0,1e-7);close(dot(K,o.U),1);close(1/(eta*dot(K,image.U)),image.shift);
  // The shader reconstructs this same phase from the intersection and K.
  const mu=1/dot(add(phase,o.X,eta,-1),o.U),na=dot(K,ship.A),nb=dot(K,ship.B);
  const shaderPhase=Math.atan2(-eta*(dot(o.X,ship.B)+nb/mu),-eta*(dot(o.X,ship.A)+na/mu));
  const emitted=eta*(-na*Math.sin(shaderPhase)+nb*Math.cos(shaderPhase));close(1/emitted,image.shift,1e-7);
 }
}
for(const r of [0,.06,1,3,10,1e5]){
 close(compactRadius(r),Math.tan(Math.atan(r)/2));
 for(const v of [[r,0,0],[0,r,0],[0,0,r],[r/Math.sqrt(3),r/Math.sqrt(3),r/Math.sqrt(3)]]){
  const X=eventAt(v),xz=mapCoordinates(X),yz=mapCoordinates(X,[1,2]);close(xz.radius,r,1e-6);close(yz.radius,r,1e-6);
  close(Math.hypot(xz.point[0],yz.point[0],xz.point[1]),compactRadius(r));
 }
}
console.log('PASS: analytic radial Doppler/gravity, direct/reflected wavefront frequencies, shader phase signs, both chase/cockpit observers, and full 3D map radii.');
