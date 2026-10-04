import assert from 'node:assert/strict';
import {dot,add,scale,initialPlayer,makeFleet,retarded,advance,rotate,TAU} from '../dist/physics.js';
import {createLaser,bounceCount,advanceLasers} from '../dist/lasers.js';
import {FlightMission,reflectedAim} from '../dist/missions.js';

function reflectedImpact(owner='player'){
 const player=initialPlayer(),target=makeFleet(72)[0];target.id='TRICK TARGET';
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
 for(const index of [0,7,24,70,71]){
  const target=makeFleet(72)[index],aim=reflectedAim(player,target);
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
const dead=makeFleet(72)[0];dead.deathTime=1;assert.equal(reflectedAim(initialPlayer(),dead),null);
const noImage={A:[0,0,1,0,0],B:[0,0,0,1,0]};assert.equal(reflectedAim(initialPlayer(),noImage),null);
console.log('PASS: reflected guidance remains normalized and hits moving targets after burns, rotations, and successive global-time circuits.');

// Clock Race compares simulated elapsed clocks in the displayed L/c=30 s
// scale. A burn must reach the goal through actual integrated states.
const clockRace=new FlightMission();clockRace.select('clock-race');
assert.equal(clockRace.getState().clockGoal,15);assert.equal(clockRace.getState().clockLead,0);
for(const hit of [direct,enemy,self,reflected])clockRace.hit(hit);
assert.equal(clockRace.getState().status,'active');assert.equal(clockRace.getState().directHits,0);assert.equal(clockRace.getState().reflectedHits,0,'Laser hits cannot advance Clock Race');
const coast=initialPlayer();let maxCoastLead=-Infinity;
for(let i=0;i<Math.ceil(TAU/.004);i++){
 advance(coast,.004);clockRace.sample(coast);maxCoastLead=Math.max(maxCoastLead,(coast.t-coast.tau)*30);
 close(clockRace.getState().clockLead,(coast.t-coast.tau)*30);assert.equal(clockRace.getState().status,'active','The initial coast orbit does not reach the 15-second goal');
}
assert.ok(maxCoastLead<15);
clockRace.reset();assert.equal(clockRace.getState().id,'clock-race');assert.equal(clockRace.getState().clockLead,0);assert.equal(clockRace.getState().result,null);
const racing=initialPlayer();let previousLead=0,steps=0;
for(;steps<2000&&clockRace.getState().status==='active';steps++){
 previousLead=clockRace.getState().clockLead;advance(racing,.004,1.5);clockRace.sample(racing);
 close(clockRace.getState().clockLead,(racing.t-racing.tau)*30);
}
assert.ok(steps<2000,'A sustained inward burn should win Clock Race');assert.ok(previousLead<15);assert.equal(clockRace.getState().status,'complete');
assert.deepEqual(clockRace.getState().result,{globalTime:racing.t,properTime:racing.tau,clockLead:(racing.t-racing.tau)*30});
assert.ok(clockRace.getState().result.clockLead>=15);
clockRace.fail();assert.equal(clockRace.getState().status,'failed');clockRace.sample(racing);assert.equal(clockRace.getState().status,'failed','Sampling cannot revive a fatal run');
clockRace.reset();assert.equal(clockRace.getState().status,'active');assert.equal(clockRace.getState().clockLead,0);assert.equal(clockRace.getState().result,null);
clockRace.select('trick-shot');clockRace.sample(racing);assert.equal(clockRace.getState().status,'active');assert.equal(clockRace.getState().reflectedHits,0,'The Clock Race threshold cannot win Trick Shot');
clockRace.select('free-flight');clockRace.sample(racing);assert.equal(clockRace.getState().status,'free');assert.equal(clockRace.getState().result,null);
console.log('PASS: Clock Race uses actual displayed clock differences, survives an initial coasting orbit, completes under relativistic thrust, and resets without mission bleed.');
