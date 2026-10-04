import assert from 'node:assert/strict';
import {dot,add,scale,initialPlayer,makeFleet,retarded,advance,rotate,TAU,eventAt,movingFrame} from '../dist/physics.js';
import {createLaser,bounceCount,advanceLasers} from '../dist/lasers.js';
import {FlightMission,MissionProgram,reflectedAim} from '../dist/missions.js';

function reflectedImpact(owner='player'){
 const player=initialPlayer(),target=makeFleet()[0];target.id='TRICK TARGET';
 const image=retarded(target,player),K=add(player.X,image.X,1,-1),frequency=-dot(K,player.U);
 const direction=add(scale(K,1/frequency),player.U,1,-1);
 const source=owner==='traffic'?{id:'NPC SOURCE'}:null;
 const beam=createLaser(player,[target],direction,source),first=beam.candidates[0];
 assert.ok(first.age>beam.firstBounce,'The target lies beyond a real boundary reflection');
 assert.equal(advanceLasers([beam],first.age-1e-6).length,0);
 const hits=advanceLasers([beam],first.age+1e-6);assert.equal(hits.length,1);
 assert.equal(bounceCount(beam,hits[0].time),1);
 assert.equal(advanceLasers([beam],first.age+TAU).length,0,'An absorbed pulse produces no duplicate hit');
 return hits[0];
}
function directImpact(){
 const player=initialPlayer(),rho=.35;
 const target={id:'DIRECT TARGET',A:add(player.X,player.F,Math.cosh(rho),Math.sinh(rho)),B:player.U.slice(),C:[player.R,player.V,add(player.F,player.X,Math.cosh(rho),Math.sinh(rho))],kind:0,size:1.5};
 const beam=createLaser(player,[target]),first=beam.candidates[0];
 assert.ok(first.age<beam.firstBounce,'The target intercepts the outbound pulse');
 const hits=advanceLasers([beam],first.age+TAU);assert.equal(hits.length,1);
 assert.equal(bounceCount(beam,hits[0].time),0);
 assert.equal(bounceCount(beam,first.age+TAU),0,'Absorption prevents later fictitious reflections');
 return hits[0];
}
function returningSelfImpact(){
 const player=initialPlayer(),beam=createLaser(player,[]);let hit=null;
 for(let i=0;i<1800&&!hit;i++)advance(player,.004,0,false,(segment,t)=>{hit=advanceLasers([beam],t,segment)[0]||null});
 assert.ok(hit?.ship.isPlayer,'The reflected pulse actually intersects our own moving hull');
 assert.equal(bounceCount(beam,hit.time),1);return hit;
}
const reflected=reflectedImpact(),direct=directImpact(),enemy=reflectedImpact('traffic'),self=returningSelfImpact();
const mission=new FlightMission();
assert.equal(mission.getState().id,'free-flight');assert.equal(mission.getState().status,'free');
mission.hit(reflected);mission.fail();assert.equal(mission.getState().status,'free','Free flight has no mission win or loss');
mission.select('trick-shot');
assert.equal(mission.getState().status,'active');assert.equal(mission.getState().directHits,0);assert.equal(mission.getState().reflectedHits,0);assert.equal(mission.getState().result,null);
mission.hit(enemy);mission.hit(self);
assert.equal(mission.getState().status,'active');assert.equal(mission.getState().reflectedHits,0);assert.equal(mission.getState().directHits,0,'NPC and self hits never award mission progress');
mission.hit(direct);
assert.equal(mission.getState().status,'active');assert.equal(mission.getState().directHits,1);assert.equal(mission.getState().reflectedHits,0);assert.equal(mission.getState().result,null,'A direct hit cannot complete Trick Shot');
mission.hit(reflected);
const complete=mission.getState();assert.equal(complete.status,'complete');assert.equal(complete.directHits,1);assert.equal(complete.reflectedHits,1);
assert.deepEqual(complete.result,{ship:reflected.ship.id,time:reflected.time,reflections:1},'The result records the actual absorbing hull and exact global hit time');
// A fatal collision in the same physics substep takes priority over success.
mission.fail();assert.equal(mission.getState().status,'failed');
mission.reset();
assert.equal(mission.getState().id,'trick-shot');assert.equal(mission.getState().status,'active');assert.equal(mission.getState().directHits,0);assert.equal(mission.getState().reflectedHits,0);assert.equal(mission.getState().result,null);
mission.fail();mission.hit(reflected);assert.equal(mission.getState().status,'failed','A failed mission cannot be revived by a later callback');
mission.reset();const beforeInvalid=mission.getState();
try{mission.select('nonexistent-mission')}catch{}
assert.deepEqual(mission.getState(),beforeInvalid,'An invalid mission selection must preserve the current run');
mission.select('free-flight');assert.equal(mission.getState().status,'free');mission.reset();assert.equal(mission.getState().id,'free-flight');
console.log('PASS: Trick Shot accepts real reflected hull impacts, rejects outbound/NPC/self hits, records exact results, resets progress, and prioritizes fatal collisions.');

// The guidance formula must survive a changed rest frame and several circuits
// of unwrapped global time, including the two high-angular-momentum targets.
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
for(const coast of [0,3,7,14]){
 const player=initialPlayer();advance(player,.6);rotate(player,.65,-.3,.2);
 for(let i=0;i<60;i++)advance(player,.004,1.5);
 advance(player,coast);rotate(player,-.2,.15,-.1);
 for(const index of [0,7,24,46,47]){
  const target=makeFleet()[index],aim=reflectedAim(player,target);
  assert.ok(aim,'A live moving target provides reflected guidance');
  close(dot(aim.direction,aim.direction),1);close(dot(aim.direction,player.U),0);close(dot(aim.direction,player.X),0);
  assert.ok(aim.arrival>player.t&&aim.arrival<player.t+Math.PI);
  const pulse=createLaser(player,[target],aim.direction);
  const hits=advanceLasers([pulse],aim.arrival+1e-6);assert.equal(hits.length,1);assert.equal(hits[0].ship.id,target.id);
  assert.ok(bounceCount(pulse,hits[0].time)>=1,'The computed rest-frame direction must hit after reflection');
  assert.ok(hits[0].time<=aim.arrival+1e-8,'The near hull is absorbed before the predicted center crossing');
 }
}
assert.equal(reflectedAim(initialPlayer(),null),null);
const dead=makeFleet()[0];dead.deathTime=1;assert.equal(reflectedAim(initialPlayer(),dead),null);
const noImage={A:[0,0,1,0,0],B:[0,0,0,1,0]};assert.equal(reflectedAim(initialPlayer(),noImage),null);
console.log('PASS: reflected guidance remains normalized and hits moving targets after burns, rotations, and successive global-time circuits.');

// Center rest requires low total speed AND the full three-dimensional radius.
const rest=new FlightMission();rest.select('center-rest');
const state=(x,v,tau)=>{const X=eventAt(x),frame=movingFrame(X,v);return {X,U:frame.U,tau,t:tau}};
for(const p of [state([0,.5,0],[0,0,0],0),state([0,0,0],[0,.2,0],1)]){rest.sample(p);assert.equal(rest.status,'active');assert.equal(rest.settled,0)}
rest.sample(state([.01,.01,.01],[0,0,0],2));
rest.sample(state([.01,.01,.01],[0,0,0],2+1/30));assert.ok(rest.settled<2);
rest.sample(state([0,0,0],[0,.2,0],2+1.5/30));assert.equal(rest.settled,0,'A fast pass resets the hold');
rest.sample(state([.01,.01,.01],[0,0,0],3));rest.sample(state([.01,.01,.01],[0,0,0],3+2.01/30));assert.equal(rest.status,'complete');
const program=new MissionProgram();assert.equal(program.advance(14.99),null);assert.equal(program.advance(.01),'trick-shot');
assert.equal(program.advance(0),null,'Declined offers are not repeated');program.accept('trick-shot',initialPlayer());
assert.equal(program.advance(29.99),null);assert.equal(program.advance(.02),'center-rest');program.accept('center-rest',initialPlayer());
assert.equal(program.getState().missions.length,2,'Accepting the second mission preserves the first');program.hit(reflected);assert.equal(program.missions[0].status,'complete');program.fail(new Set(['trick-shot']));assert.equal(program.missions[0].status,'complete');assert.equal(program.missions[1].status,'failed');
program.reset();assert.equal(program.playSeconds,0);assert.deepEqual(program.getState().missions,[]);assert.equal(program.advance(45),'trick-shot');assert.equal(program.advance(0),'center-rest');
console.log('PASS: timed offers, independent concurrent objectives, full-radius/speed/hold requirement, and earned success preserved on later death.');
