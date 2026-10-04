import assert from 'node:assert/strict';
import {initialPlayer,eventAt,movingFrame,scale,advance} from '../dist/physics.js';
import {awardUpgrade,playerHull,engineNozzles,laserMuzzle,interceptorHull,cannonHull} from '../dist/ship-upgrades.js';
import {createLaser,advanceLasers} from '../dist/lasers.js';
const staticPlayer=()=>{const X=eventAt([0,0,0]),f=movingFrame(X,[0,0,0]);return {X,U:f.U,R:f.E[0],V:f.E[1],F:f.E[2],t:0,tau:0}};
for(const order of [['center-rest','trick-shot'],['trick-shot','center-rest']]){
 const p=initialPlayer(),before={X:p.X.slice(),U:p.U.slice(),t:p.t,tau:p.tau};
 for(const id of order){assert.ok(awardUpgrade(p,id));assert.equal(awardUpgrade(p,id),null,'Rewards apply once');}
 assert.deepEqual(p.upgrades,{frame:true,cannon:true});assert.deepEqual({X:p.X,U:p.U,t:p.t,tau:p.tau},before,'Upgrading preserves position, velocity and clocks');
 assert.equal(playerHull(p).parts.length,interceptorHull.length+cannonHull.length);assert.equal(engineNozzles(p,'forward',[0,0,-1]).length,2);
 assert.ok(laserMuzzle(p)[1]>0,'The firing flash sits on the dorsal cannon');
}
function outfit(ids){const p=staticPlayer();ids.forEach(id=>awardUpgrade(p,id));return p}
const configurations=[[],['trick-shot'],['center-rest'],['center-rest','trick-shot']];
for(const ids of configurations){
 const p=outfit(ids),hull=playerHull(p);
 for(const [r,c] of hull.parts)assert.ok(Math.hypot(...c)+Math.max(...r)<hull.boundRadius,'Complete visible hull fits the broad-phase bounds');
 const beam=createLaser(p,[]);let hit=null;
 for(let i=0;i<850&&!hit;i++)advance(p,.004,0,false,(segment,t)=>{hit=advanceLasers([beam],t,segment)[0]??null});
 assert.ok(hit?.ship.isPlayer,'Reflected player shots remain dangerous for every outfit');
 assert.ok(hit.time>beam.t+beam.firstBounce,'The muzzle is safe during launch');
}
function skim(ids,x,y){
 const p=outfit(ids),X=eventAt([x,y,.3]),f=movingFrame(X,[0,0,0]);
 const beam=createLaser({X,U:f.U,F:scale(f.E[2],-1),t:0},[],undefined,{id:'INCOMING'});let hit=null;
 for(let i=0;i<100&&!hit;i++)advance(p,.004,0,false,(segment,t)=>{hit=advanceLasers([beam],t,segment)[0]??null});
 return hit;
}
assert.equal(skim([], .046,-.0032),null,'A grazing pulse misses the original wing');
assert.ok(skim(['center-rest'],.046,-.0032)?.ship.isPlayer,'The same pulse hits the new interceptor wing');
assert.equal(skim([],0,.0192),null,'A pulse above the starter hull misses');
assert.ok(skim(['trick-shot'],0,.0192)?.ship.isPlayer,'The mounted cannon intercepts the same pulse');
assert.equal(awardUpgrade(initialPlayer(),'unknown'),null);
console.log('PASS: cumulative one-time upgrades, preserved flight state, both reward orders, hull bounds, launch immunity and wing/cannon collisions.');
