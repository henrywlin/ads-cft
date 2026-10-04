import assert from 'node:assert/strict';
import {initialPlayer,makeFleet,geodesicAt,add,scale,dot,advance} from '../dist/physics.js';
import {createLaser,advanceLasers,bounceCount} from '../dist/lasers.js';
import {TrafficFire,advanceTraffic} from '../dist/traffic.js';
const p=initialPlayer(),source={id:'EMITTER',A:p.X,B:p.U,C:[p.R,p.V,p.F],kind:0,size:.8};
const pulse=createLaser(p,[source],p.F,source);
assert.equal(pulse.owner,'traffic');assert.equal(pulse.sourceId,'EMITTER');assert.equal(pulse.playerArmed,true);
assert.equal(advanceLasers([pulse],.1).length,0,'The firing hull must survive the outgoing pulse');
assert.equal(source.deathTime,undefined);
const returned=advanceLasers([pulse],Math.PI);assert.equal(returned.length,1);assert.equal(returned[0].ship,source);assert.ok(source.deathTime>3);assert.equal(bounceCount(pulse,source.deathTime),1);
// An NPC pulse arriving at the rocket must stop its integrator at the physical hit.
const rho=.35,shooter={id:'ATTACKER',A:add(p.X,p.F,Math.cosh(rho),Math.sinh(rho)),B:p.U.slice(),C:[p.R,p.V,add(p.F,p.X,Math.cosh(rho),Math.sinh(rho))],kind:0,size:.8};
const incoming=createLaser({...geodesicAt(shooter,0),F:shooter.C[2],t:0},[shooter],scale(shooter.C[2],-1),shooter);
let fatal=null;while(p.t<.6&&!fatal)advance(p,.004,0,false,(segment,t)=>{fatal=advanceLasers([incoming],t,segment).find(h=>h.ship.isPlayer);return fatal?{stopAt:fatal.time}:null});
assert.ok(fatal,'Traffic fire must kill the player');assert.equal(p.t,fatal.time);assert.equal(incoming.impact.ship,'YOUR ROCKET');assert.equal(shooter.deathTime,undefined);
// Scheduling must give identical emission times across different frame partitions.
function simulate(step){const fleet=makeFleet(),traffic=new TrafficFire(fleet),rocket=initialPlayer(),beams=[],times=[];for(let end=step;end<.9000001;end+=step){const seg={...rocket};advance(rocket,step);advanceTraffic(traffic,beams,rocket.t,seg,b=>{times.push([b.sourceId,b.t]);assert.ok(Math.abs(dot(b.P,b.P))<1e-8)})}return {traffic,beams,times,fleet}}
const a=simulate(.003),b=simulate(.009);assert.deepEqual(a.times,b.times);assert.ok(a.times.length>=10);assert.equal(new Set(a.times.map(v=>v[0])).size,10);
const dead=a.traffic.shooters[0];dead.ship.deathTime=0;assert.ok(a.traffic.next(100)?.ship!==dead.ship);
a.traffic.reset();assert.equal(a.traffic.shots,0);assert.equal(a.traffic.shooters.length,10);
// Existing pulses kill a scheduled shooter before it can emit in that same step.
const victim={...shooter,id:'VICTIM'};const t=new TrafficFire([victim]);t.shooters[0].next=.5;const rocket=initialPlayer(),out=createLaser(rocket,[victim]),beams=[out];
const hits=advanceTraffic(t,beams,.6,rocket);assert.ok(hits.some(h=>h.ship===victim));assert.equal(t.shots,0);assert.equal(beams.length,1);
console.log('PASS: traffic launch immunity, reflected self-hit, lethal incoming fire, frame-independent schedules, reset and chronological destruction.');
