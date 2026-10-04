import {seeded,geodesicAt,add} from './physics.js?v=15';
import {createLaser,advanceLasers} from './lasers.js?v=27';
// Emission times use the global clock. These are independent of frame rate and time warp.
export class TrafficFire {
 constructor(fleet,seed=190726,obstacles=[]){this.fleet=fleet;this.seed=seed;this.obstacles=obstacles;this.reset()}
 reset(time=0){
  this.random=seeded(this.seed);this.enabled=true;this.shots=0;
  const shuffled=this.fleet.slice();for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  this.shooters=shuffled.slice(0,Math.min(10,shuffled.length)).map(ship=>({ship,next:time+.15+this.random()*.65}));
 }
 next(end){if(!this.enabled)return null;let first=null;for(const s of this.shooters){if(Number.isFinite(s.ship.deathTime))continue;if(s.next<=end&&(!first||s.next<first.next))first=s}return first}
 emit(s,time){
  s.next=time+.6+this.random()*1.2;
  const state=geodesicAt(s.ship,time),angle=this.random()*Math.PI*2,tilt=this.random()*.35,C=s.ship.C;
  const direction=add(add(C[2],C[0],Math.cos(tilt),Math.sin(tilt)*Math.cos(angle)),C[1],1,Math.sin(tilt)*Math.sin(angle));
  this.shots++;return createLaser({...state,F:C[2],t:time},[...this.fleet,...this.obstacles],direction,s.ship);
 }
}
// Process hits before each emission: a ship destroyed earlier in this step cannot fire.
export function advanceTraffic(traffic,beams,end,segment,onShot=()=>{}){
 const hits=[];let start=segment;
 for(;;){
  const scheduled=traffic.next(end),time=scheduled?Math.max(start.t,scheduled.next):end;
  const impacts=advanceLasers(beams,time,start);hits.push(...impacts);
  if(impacts.some(h=>h.ship.isPlayer)||!scheduled)return hits;
  if(!Number.isFinite(scheduled.ship.deathTime)){const beam=traffic.emit(scheduled,time);beams.push(beam);onShot(beam)}
  const state=geodesicAt({A:segment.X,B:segment.U},time);start={...segment,...state,t:time};
 }
}
