import {bounceCount} from './lasers.js?v=11';
import {dot,add,scale,retarded} from './physics.js?v=10';

export const missionCatalog=[
 {id:'free-flight',name:'Free Flight',description:'Explore AdS, practice flying and fire at will.'},
 {id:'trick-shot',name:'Trick Shot',description:'Destroy a traffic ship with your own laser after at least one boundary reflection.'},
 {id:'clock-race',name:'Clock Race',description:'Make global AdS time get 15 seconds ahead of your onboard proper clock.'}
];

// Objectives use physical impact events, never the delayed image or wall clock.
export class FlightMission {
 constructor(){this.select('free-flight')}
 select(id){if(!missionCatalog.some(m=>m.id===id))throw Error('Unknown mission');this.id=id;this.reset()}
 reset(){this.status=this.id==='free-flight'?'free':'active';this.reflectedHits=0;this.directHits=0;this.clockLead=0;this.clockGoal=15;this.result=null}
 hit(hit){
  if(this.id!=='trick-shot'||this.status!=='active'||hit.beam.owner!=='player'||hit.ship.isPlayer)return false;
  const reflections=bounceCount(hit.beam,hit.time);
  if(reflections<1){this.directHits++;return false}
  this.reflectedHits++;
  if(this.id==='trick-shot'){this.status='complete';this.result={ship:hit.ship.id,time:hit.time,reflections};return true}
  return false;
 }
 sample(player){
  if(this.id!=='clock-race'||this.status!=='active')return false;
  this.clockLead=(player.t-player.tau)*30;
  if(this.clockLead>=this.clockGoal){this.status='complete';this.result={globalTime:player.t,properTime:player.tau,clockLead:this.clockLead};return true}
  return false;
 }
 fail(){if(this.id!=='free-flight'){this.status='failed';this.result=null}}
 getState(){return {id:this.id,name:missionCatalog.find(m=>m.id===this.id).name,status:this.status,reflectedHits:this.reflectedHits,directHits:this.directHits,clockLead:this.clockLead,clockGoal:this.clockGoal,result:this.result?{...this.result}:null}}
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
