import assert from 'node:assert/strict';
import {dot,add,scale,eventAt,movingFrame,initialPlayer,advance,makeFleet,retarded,TAU,chaseObserver,initialHistory,retardedRocket,snapshot,geodesicAt,norm3,rotate} from '../dist/physics.js';
import {createLaser,laserEvent,bounceCount,advanceLasers,retardedLaser} from '../dist/lasers.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
const p=initialPlayer(),beam=createLaser(p,[]),norm=a=>a.reduce((s,v)=>s+v*v,0);
close(norm(beam.Q),1);close(norm(beam.D),1);close(beam.Q.reduce((s,v,i)=>s+v*beam.D[i],0),0);close(dot(beam.P,beam.P),0);
const anti=laserEvent(beam,Math.PI);anti.forEach((v,i)=>close(v,-p.X[i]));const back=laserEvent(beam,TAU);back.forEach((v,i)=>close(v,p.X[i]));
assert.equal(bounceCount(beam,beam.firstBounce-.0001),0);assert.equal(bounceCount(beam,beam.firstBounce+.0001),1);assert.equal(bounceCount(beam,beam.firstBounce+Math.PI+.001),2);
// Absorption at creation must use the physical hull, including offset parts.
const absorptionTime=TAU+.7,absorptionSize=1.4;
const absorptionShip=()=>({id:'ABSORPTION TEST',A:eventAt([0,0,0]),B:[0,1,0,0,0],C:[[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]],kind:1,size:absorptionSize});
const absorptionPlayer=sign=>{const X=eventAt([0,.023,.074].map(v=>sign*v*absorptionSize),absorptionTime),frame=movingFrame(X,[0,0,0]);return {X,U:frame.U,R:frame.E[0],V:frame.E[1],F:frame.E[2],t:absorptionTime,tau:0}};
const inside=absorptionPlayer(1),insideShip=absorptionShip(),insideBeam=createLaser(inside,[insideShip]);
assert.equal(insideBeam.candidates[0].age,0);assert.deepEqual(insideBeam.candidates[0].event,inside.X);
assert.equal(advanceLasers([insideBeam],absorptionTime-1e-9).length,0);
const immediate=advanceLasers([insideBeam],absorptionTime);assert.equal(immediate.length,1);assert.equal(immediate[0].time,absorptionTime);assert.deepEqual(immediate[0].event,inside.X);assert.equal(insideShip.deathTime,absorptionTime);
assert.equal(bounceCount(insideBeam,absorptionTime+TAU),0);assert.equal(advanceLasers([insideBeam],absorptionTime+TAU).length,0);
const outsideShip=absorptionShip(),outsideBeam=createLaser(absorptionPlayer(-1),[outsideShip]);
assert.ok(outsideBeam.candidates.length);assert.ok(outsideBeam.candidates.every(hit=>hit.age>0));assert.equal(advanceLasers([outsideBeam],absorptionTime).length,0);assert.ok(!Number.isFinite(outsideShip.deathTime));
const fleet=makeFleet(72);
for(const ship of fleet.slice(-2))for(const t of [0,.8,3,13])close(norm3(geodesicAt(ship,t).X.slice(2)),norm3(ship.A.slice(2)),1e-8);
for(const ship of fleet.slice(0,30)){
 const view=retarded(ship,p),K=add(p.X,view.X,1,-1),freq=-dot(K,p.U),P=scale(K,1/freq),direction=add(P,p.U,1,-1),b=createLaser(p,[ship],direction);
 assert.ok(b.candidates.length);const hit=b.candidates[0];assert.ok(hit.age<Math.PI-view.delay&&hit.age>0);assert.equal(bounceCount(b,hit.age),1);
 assert.equal(advanceLasers([b],hit.age-1e-6).length,0);assert.ok(!Number.isFinite(ship.deathTime));assert.equal(advanceLasers([b],hit.age+1e-6).length,1);close(ship.deathTime,hit.age);assert.equal(advanceLasers([b],hit.age+1).length,0);
 const event=laserEvent(b,hit.age);event.forEach((v,i)=>close(v,hit.event[i]));
}
const observer=initialPlayer();advance(observer,.3);const glow=retardedLaser(beam,observer);assert.ok(glow);close(dot(add(observer.X,glow.X,1,-1),add(observer.X,glow.X,1,-1)),0);assert.ok(glow.delay>=0&&glow.delay<Math.PI);
const cam=chaseObserver(p);close(dot(cam.X,cam.X),-1);close(dot(cam.U,cam.U),-1);close(dot(cam.X,cam.U),0);for(const k of ['R','V','F']){close(dot(cam[k],cam[k]),1);close(dot(cam[k],cam.X),0);close(dot(cam[k],cam.U),0)}
const history=initialHistory(p),source=retardedRocket(history,cam);close(dot(add(cam.X,source.X,1,-1),add(cam.X,source.X,1,-1)),0);assert.ok(source.t<p.t);
for(let i=0;i<200;i++){advance(p,.004,1.5);history.push(snapshot(p))}const cam2=chaseObserver(p),source2=retardedRocket(history,cam2);close(dot(add(cam2.X,source2.X,1,-1),add(cam2.X,source2.X,1,-1)),0);assert.ok(source2.t<p.t);
console.log('PASS: reflective null rays, AdS refocusing, immediate hull absorption, delayed moving-hull hits, circular boundary orbits, pulse light cones, and chase-camera history.');
// Returning light must hit the piloted hull after clearing its own launch tube.
for(const thrust of [0,1.5]){
 const rocket=initialPlayer(),pulse=createLaser(rocket,[]);let hit=null;
 for(let i=0;i<1800&&!hit;i++)advance(rocket,.004,thrust,false,(segment,t)=>{hit=advanceLasers([pulse],t,segment)[0]||null});
 assert.ok(hit?.ship.isPlayer,'Returning pulse must hit the moving player hull');assert.ok(pulse.playerArmed);assert.ok(hit.time>pulse.firstBounce);assert.equal(bounceCount(pulse,hit.time),1);assert.equal(advanceLasers([pulse],rocket.t+TAU,rocket).length,0);
}
// A destroyed traffic target absorbs the pulse before it can return to us.
{
 const rocket=initialPlayer(),rho=.35,target={id:'BLOCKER',A:add(rocket.X,rocket.F,Math.cosh(rho),Math.sinh(rho)),B:rocket.U.slice(),C:[rocket.R,rocket.V,add(rocket.F,rocket.X,Math.cosh(rho),Math.sinh(rho))],kind:0,size:1.5};
 const pulse=createLaser(rocket,[target]);let all=[];
 for(let i=0;i<900;i++)advance(rocket,.004,0,false,(segment,t)=>all.push(...advanceLasers([pulse],t,segment)));
 assert.equal(all.length,1);assert.equal(all[0].ship.id,'BLOCKER');assert.equal(pulse.impact.ship,'BLOCKER');
}
console.log('PASS: player survives launch, returning pulses hit coasting/accelerating rockets, and earlier traffic absorption prevents self hits.');

// Steering and burning out of the return path must let the player evade it.
{
 const rocket=initialPlayer(),pulse=createLaser(rocket,[]);let hits=[];
 const step=thrust=>advance(rocket,.004,thrust,false,(seg,t)=>hits.push(...advanceLasers([pulse],t,seg)));
 for(let i=0;i<30;i++)step(0);rotate(rocket,Math.PI/2,0,0);
 for(let i=0;i<1800&&rocket.t<3.5;i++)step(i<200?3:0);
 assert.ok(rocket.t>Math.PI);assert.equal(hits.length,0);assert.equal(pulse.impact,null);
}
console.log('PASS: lateral thrust evades the returning pulse.');
