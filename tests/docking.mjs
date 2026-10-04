import assert from 'node:assert/strict';
import {eventAt,movingFrame,geodesicAt,makeFleet,rotate,dot,boost,telemetry,scale} from '../dist/physics.js';
import {centralShip,centralHull,brakingAim} from '../dist/docking.js';
import {burnCommand} from '../dist/flight-controls.js';
import {createLaser,advanceLasers} from '../dist/lasers.js';
import {FlightMission,missionCatalog} from '../dist/missions.js';
import {TrafficFire} from '../dist/traffic.js';
import {mapVelocity} from '../dist/map.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const t of [0,1,Math.PI,17]){
 const p=geodesicAt(centralShip,t);p.X.slice(2).forEach(x=>close(x,0));close(telemetry(p).beta,0);
}
for(const [r,c] of centralHull){
 assert.ok(Math.hypot(...c)+Math.max(...r)<centralShip.boundRadius,'All hull parts fit the renderer bounds');
 assert.ok(c.reduce((sum,x,i)=>sum+(x/r[i])**2,0)>1,'The central berth is open');
}
for(const pos of [[0,0,0],[0,0,.78],[3,-2,1]])for(const v of [[.2,0,0],[0,0,-.7],[.3,-.2,.4]]){
 const X=eventAt(pos,.8),f=movingFrame(X,v),p={X,U:f.U,R:f.E[0],V:f.E[1],F:f.E[2]};rotate(p,.6,-.4,.1);
 const aim=brakingAim(p),command=burnCommand(p,false,false,true,1);
 close(dot(aim.direction,p.X),0);close(dot(aim.direction,p.U),0);close(dot(aim.direction,aim.direction),1);
 [p.R,p.V,p.F].forEach((e,i)=>close(dot(aim.direction,e),command.force[i]));
 const before=telemetry(p).beta,velocity=mapVelocity(p.X,p.U);boost(p,aim.direction,.0001);
 assert.ok(telemetry(p).beta<before,'Following the nose cue reduces speed');
 const after=mapVelocity(p.X,p.U);assert.ok(velocity.reduce((sum,x,i)=>sum+x*(after[i]-x),0)<0,'The braking map arrow opposes travel');
}
const atRest=eventAt([0,0,.3]);assert.equal(brakingAim({X:atRest,U:movingFrame(atRest,[0,0,0]).U}),null);
const X=eventAt([.165,0,.6]),f=movingFrame(X,[0,0,0]);
const source={X,U:f.U,F:scale(f.E[2],-1),t:0},station={...centralShip};
const beam=createLaser(source,[station]),hit=beam.candidates[0];assert.ok(hit,'A pulse aimed at the crown hits it');
const impacts=advanceLasers([beam],hit.age+1e-6);assert.equal(impacts.length,1);assert.equal(beam.impact.ship,'AXIOM');assert.equal(station.deathTime,undefined,'Axiom absorbs pulses without being destroyed');
assert.equal(advanceLasers([beam],20).length,0,'Absorbed pulses cannot return');
const centered=eventAt([0,0,.78]),frame=movingFrame(centered,[0,0,0]);
assert.equal(createLaser({X:centered,U:frame.U,F:scale(frame.E[2],-1),t:0},[station]).candidates.length,0,'The center of the docking bay is a genuine opening');
const trick=new FlightMission();trick.select('trick-shot');trick.hit({...impacts[0],time:100});assert.equal(trick.status,'active','Central ship impacts never score Trick Shot');
const traffic=new TrafficFire(makeFleet(),1,[station]);assert.equal(traffic.shooters.length,10);assert.ok(traffic.shooters.every(s=>s.ship!==station),'The central ship never fires');
assert.equal(missionCatalog.find(m=>m.id==='center-rest').name,'Dock with Central Spaceship');
console.log('PASS: central geodesic, open berth, hull bounds, relativistic braking cue, pulse absorption and protected mission target.');
