import assert from 'node:assert/strict';
import {hullParts,makeFleet,geodesicAt,TAU,initialPlayer,shipBounds,retarded,advance,rotate} from '../dist/physics.js';
import {centralHull,centralShip} from '../dist/docking.js';
import {interceptorHull,cannonHull} from '../dist/ship-upgrades.js';
import {hullAtlas} from '../dist/hull-atlas.js';
import {orbitPolyline,mapCoordinates} from '../dist/map.js';
import {ChaseCamera} from '../dist/chase.js';
const shapes=[hullParts(0),hullParts(1),hullParts(2),hullParts(3),centralHull,interceptorHull,cannonHull];
let row=0;
for(const [kind,parts] of shapes.entries()){
 assert.equal(kind===6?hullAtlas.cannonOffset:hullAtlas.offsets[kind],row);
 if(kind<6)assert.equal(hullAtlas.counts[kind],parts.length);
 for(const [r,c] of parts){
  r.forEach((v,i)=>assert.equal(hullAtlas.data[row*8+i],Math.fround(v)));
  c.forEach((v,i)=>assert.equal(hullAtlas.data[row*8+4+i],Math.fround(v)));row++;
 }
}
assert.equal(row,hullAtlas.rows);
const fleet=makeFleet(),camera=new ChaseCamera();
for(const ship of fleet){
 const points=orbitPolyline(ship);assert.equal(orbitPolyline(ship),points,'Reuse immutable orbits');
 for(let j=0;j<=90;j++){
  const X=geodesicAt(ship,TAU*j/90).X,q=mapCoordinates(X,[0,2]);
  assert.ok(Math.abs(points[j*3]-q.point[0])<1e-12);assert.ok(Math.abs(points[j*3+2]-q.point[1])<1e-12);
 }
 for(let i=0;i<3;i++)assert.ok(Math.abs(points[i]-points[270+i])<1e-12,'One complete periodic orbit');
 const changed={...ship,A:ship.A.slice(),B:ship.B.slice()},old=orbitPolyline(changed);changed.A=changed.A.slice();assert.notEqual(orbitPolyline(changed),old,'Invalidate replacement trajectories');
}
for(const time of [0,.3,2,8]){
 const p=initialPlayer();advance(p,time);rotate(p,.9,-.4,.2);
 for(const observer of [p,camera.observer(p)])for(const ship of [centralShip,...fleet]){
  const pair=shipBounds(ship,observer,.003,true,true),union=shipBounds(ship,observer,.003,true);
  assert.equal(pair.length,2);pair.flat().forEach(v=>assert.ok(Number.isFinite(v)));
  for(const bounds of pair)if(bounds[0]!==1000){
   assert.ok(Math.abs(bounds[0]-union[0])+bounds[2]<=union[2]+1e-9);
   assert.ok(Math.abs(bounds[1]-union[1])+bounds[2]<=union[2]+1e-9);
  }
  for(const reflected of [false,true]){
   const view=retarded(ship,observer,reflected);if(!view||view.dir[2]<=.001)continue;
   const x=view.dir[0]/view.dir[2]/1.4,y=view.dir[1]/view.dir[2]/1.4;
   assert.ok(pair.some(b=>Math.abs(x-b[0])<=b[2]&&Math.abs(y-b[1])<=b[2]),'Direct and reflected centers remain in a retained cap');
  }
 }
}
console.log('PASS: exact shared hull atlas, immutable orbit reuse/invalidation, periodic curves and conservative direct/reflected image caps.');
