import assert from 'node:assert/strict';
import {makeTrafficRoster,shipCounts,defaultShipCount} from '../dist/fleet-settings.js';
import {makeFleet,initialPlayer,add,geodesicAt,norm3,TAU} from '../dist/physics.js';
import {createLaser,retargetLaserFleet,advanceLasers,laserEvent} from '../dist/lasers.js';

const roster=makeTrafficRoster();
assert.deepEqual(shipCounts,[2,12,24,48]);assert.equal(defaultShipCount,24);
assert.deepEqual(roster.all,makeFleet(),'Default worldlines and honorees stay unchanged');
for(const count of shipCounts){
 const ships=roster.ships(count);assert.equal(ships.length,count);assert.equal(new Set(ships.map(s=>s.id)).size,count);
 assert.deepEqual(ships.filter(s=>s.boundaryOrbit),roster.all.slice(-2));
 for(const ship of ships)assert.ok(roster.all.includes(ship),'Retain object identity and destruction state');
 for(const [i,ship] of ships.slice(-2).entries())for(const t of [0,2,13])
  assert.ok(Math.abs(norm3(geodesicAt(ship,t).X.slice(2))-[10,20][i])<1e-8);
}
for(const count of [0,1,3,72,NaN,'24'])assert.throws(()=>roster.ships(count));
const hidden=roster.all[20];hidden.deathTime=1;assert.ok(!roster.ships(12).includes(hidden));
assert.equal(roster.ships(48)[20].deathTime,1,'Switching counts never resurrects a ship');

const p=initialPlayer(),rho=.35;
const target=()=>({id:'TARGET',A:add(p.X,p.F,Math.cosh(rho),Math.sinh(rho)),B:p.U.slice(),C:[p.R,p.V,add(p.F,p.X,Math.cosh(rho),Math.sinh(rho))],kind:0,size:1.5});
const ship=target(),beam=createLaser(p,[ship]),direct=beam.candidates.filter(c=>c.age<1),first=direct[0].age,last=direct.at(-1).age,finalAge=beam.candidates.at(-1).age;
assert.ok(first>.05&&last<1);
const geometry={X:beam.X,P:beam.P,Q:beam.Q,D:beam.D,t:beam.t,firstBounce:beam.firstBounce,playerArmed:beam.playerArmed};
retargetLaserFleet(beam,[],.05);assert.equal(beam.candidates.length,0);
assert.equal(advanceLasers([beam],last+.1).length,0,'Removed ship cannot absorb a pulse');
const now=2*TAU+finalAge+.1;
retargetLaserFleet(beam,[ship],now);
for(const [key,value] of Object.entries(geometry))assert.deepEqual(beam[key],value,'Pulse propagation/arming remains unchanged');
assert.equal(advanceLasers([beam],now).length,0,'New targets never cause a hit in the past');
const hitTime=beam.t+beam.candidates[beam.index].age+beam.cycle*TAU;
assert.equal(advanceLasers([beam],hitTime-1e-6).length,0);
const hit=advanceLasers([beam],hitTime+1e-6)[0];assert.equal(hit.ship,ship);assert.ok(Math.abs(hit.time-hitTime)<1e-8);
const absorbed=JSON.stringify(beam);retargetLaserFleet(beam,[],hitTime+1);assert.equal(JSON.stringify(beam),absorbed,'Already absorbed pulses stay absorbed');

// A ship introduced around a live pulse absorbs it at the setting-change event.
const inserted=target(),insideBeam=createLaser(p,[]),insideTime=(first+last)/2;
retargetLaserFleet(insideBeam,[inserted],insideTime);
const immediate=advanceLasers([insideBeam],insideTime)[0];assert.equal(immediate.ship,inserted);
assert.ok(Math.abs(immediate.time-insideTime)<1e-8);assert.deepEqual(immediate.event,laserEvent(insideBeam,insideTime));

// Rebuilding traffic targets must retain outbound source immunity and returns.
const source={id:'SOURCE',A:p.X,B:p.U,C:[p.R,p.V,p.F],kind:0,size:1};
const outbound=createLaser(p,[source],p.F,source),before=outbound.candidates.map(c=>c.age);
retargetLaserFleet(outbound,[source],0);
assert.ok(outbound.candidates.every(c=>c.age===0||before.includes(c.age)));
// Setting changes at the instant of emission must not absorb the emitter's pulse.
assert.equal(outbound.candidates.some(c=>c.age===0),false);
console.log('PASS: 2–48 ship presets, stable outer orbits, retained ship identity/deaths, live pulse removal/addition, no past hits, immediate absorption and source immunity.');
