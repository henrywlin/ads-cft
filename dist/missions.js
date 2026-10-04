import {bounceCount} from './lasers.js?v=15';
import {dot,add,scale,retarded,telemetry} from './physics.js?v=15';

export const missionCatalog=[
 {id:'free-flight',name:'Free Flight',description:'Explore AdS, practice flying and fire at will.'},
 {id:'trick-shot',name:'Trick Shot',description:'Destroy a traffic ship with your own laser after at least one boundary reflection.'},
 {id:'center-rest',name:'Rest at the Center',description:'Settle near the center: r < 0.06 L and speed < 0.03 c for 2 ship seconds.'}
];

// Objectives use physical impact events, never the delayed image or wall clock.
export class FlightMission {
 constructor(){this.select('free-flight')}
 select(id){if(!missionCatalog.some(m=>m.id===id))throw Error('Unknown mission');this.id=id;this.reset()}
 reset(){this.status=this.id==='free-flight'?'free':'active';this.reflectedHits=0;this.directHits=0;this.settled=0;this.previousTau=null;this.wasSettled=false;this.radius=Infinity;this.speed=Infinity;this.result=null}
 hit(hit){
  if(this.id!=='trick-shot'||this.status!=='active'||hit.beam.owner!=='player'||hit.ship.isPlayer)return false;
  const reflections=bounceCount(hit.beam,hit.time);
  if(reflections<1){this.directHits++;return false}
  this.reflectedHits++;
  if(this.id==='trick-shot'){this.status='complete';this.result={ship:hit.ship.id,time:hit.time,reflections};return true}
  return false;
 }
 sample(player){
  if(this.id!=='center-rest'||this.status!=='active')return false;
  const {r,beta}=telemetry(player),dt=this.previousTau===null?0:Math.max(0,player.tau-this.previousTau)*30;
  this.previousTau=player.tau;this.radius=r;this.speed=beta;
  const eligible=r<.06&&beta<.03;this.settled=eligible?(this.wasSettled?this.settled+dt:0):0;this.wasSettled=eligible;
  if(this.settled>=2){this.status='complete';this.result={radius:r,speed:beta,properTime:player.tau};return true}
  return false;
 }
 fail(){if(this.id!=='free-flight'){this.status='failed';this.result=null}}
 getState(){return {id:this.id,name:missionCatalog.find(m=>m.id===this.id).name,status:this.status,reflectedHits:this.reflectedHits,directHits:this.directHits,settled:this.settled,radius:this.radius,speed:this.speed,result:this.result?{...this.result}:null}}
}

// Offer times count foreground play, independently of simulation time warp.
export class MissionProgram {
 constructor(){this.reset()}
 reset(){this.playSeconds=0;this.offered=new Set();this.accepted=new Set();this.missions=['trick-shot','center-rest'].map(id=>{const m=new FlightMission();m.select(id);return m})}
 advance(seconds){this.playSeconds+=seconds;return this.nextOffer()}
 nextOffer(){for(const [i,at] of [15,45].entries()){const id=this.missions[i].id;if(this.playSeconds>=at&&!this.offered.has(id)){this.offered.add(id);return id}}return null}
 accept(id,player){const m=this.missions.find(m=>m.id===id);if(!m||!this.offered.has(id))throw Error('Mission has not been offered');this.accepted.add(id);if(player){m.previousTau=player.tau;m.sample(player)}return m}
 hit(hit){for(const m of this.missions)if(this.accepted.has(m.id))m.hit(hit)}
 sample(player){for(const m of this.missions)if(this.accepted.has(m.id))m.sample(player)}
 fail(awarded=new Set()){for(const m of this.missions)if(this.accepted.has(m.id)&&!awarded.has(m.id))m.fail()}
 getState(){return {playSeconds:this.playSeconds,offered:[...this.offered],missions:this.missions.filter(m=>this.accepted.has(m.id)).map(m=>m.getState())}}
}

// A past direct image determines the antipodal future intersection after a
// boundary reflection. The direction is measured in the player's rest frame.
export function reflectedAim(player,target){
 if(!target||Number.isFinite(target.deathTime))return null;
 const image=retarded(target,player);if(!image)return null;
 const K=add(player.X,image.X,1,-1),frequency=-dot(K,player.U);
 if(!Number.isFinite(frequency)||frequency<=1e-10)return null;
 return {direction:add(scale(K,1/frequency),player.U,1,-1),arrival:player.t+Math.PI-image.delay};
}
