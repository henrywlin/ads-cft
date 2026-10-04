import {dot,add,scale,TAU,hullParts} from './physics.js';
const positive=v=>((v%TAU)+TAU)%TAU;
export function laserEvent(beam,age){
 const c=Math.cos(age),s=Math.sin(age),q=beam.Q.map((v,i)=>v*c+beam.D[i]*s),q0=Math.abs(q[0]);
 if(q0<1e-7)return null;
 const t=beam.t+age;return [Math.cos(t)/q0,Math.sin(t)/q0,...q.slice(1).map(v=>v/q0)];
}
export function createLaser(player,fleet,direction=player.F){
 const X=player.X.slice(),P=add(player.U,direction),R=Math.hypot(X[0],X[1]),E=X[0]*P[1]-X[1]*P[0],J=X[0]*P[0]+X[1]*P[1];
 const Q=[1/R,...X.slice(2).map(v=>v/R)],D=[-J/(R*E),...P.slice(2).map((v,i)=>(R*v-Q[i+1]*J)/E)];
 const beam={X,P,Q,D,t:player.t,firstBounce:Math.atan2(Q[0],-D[0]),candidates:[],index:0,cycle:0,impact:null,trail:[]};
 for(const ship of fleet){
  if(Number.isFinite(ship.deathTime))continue;
  for(const [radii,center] of hullParts(ship.kind))for(const eta of [1,-1]){
   const o=ship.C.map((c,i)=>(eta*dot(X,c)-center[i]*ship.size)/(radii[i]*ship.size));
   if(eta===1&&o.reduce((sum,v)=>sum+v*v,0)<=1){
    beam.candidates.push({age:0,ship,event:X.slice()});continue;
   }
   const d=ship.C.map((c,i)=>eta*dot(P,c)/(radii[i]*ship.size));
   const dl=Math.hypot(...d),n=d.map(v=>v/dl),b=o.reduce((a,v,i)=>a+v*n[i],0),cross=[o[1]*n[2]-o[2]*n[1],o[2]*n[0]-o[0]*n[2],o[0]*n[1]-o[1]*n[0]],disc=1-cross.reduce((a,v)=>a+v*v,0);
   if(disc<0)continue;
   for(const mu of [(-b-Math.sqrt(disc))/dl,(-b+Math.sqrt(disc))/dl]){
    const hit=scale(add(X,P,1,mu),eta),age=positive(Math.atan2(hit[1],hit[0])-Math.atan2(X[1],X[0]));
    if(age<1e-8)continue;
    const actual=laserEvent(beam,age);if(!actual||Math.hypot(...actual.map((v,i)=>v-hit[i]))>1e-5*Math.max(1,...hit.map(Math.abs)))continue;
    beam.candidates.push({age,ship,event:hit});
   }
  }
 }
 beam.candidates.sort((a,b)=>a.age-b.age);return beam;
}
export function bounceCount(beam,globalTime){const age=Math.max(0,Math.min(globalTime,beam.impact?.time??Infinity)-beam.t);return age<beam.firstBounce?0:1+Math.floor((age-beam.firstBounce)/Math.PI)}
function nextImpact(beam,now){
 if(beam.impact||!beam.candidates.length)return null;
 // A source and free geodesic hull repeat geometrically every 2π in global time.
 for(let j=0;j<beam.candidates.length;j++){
  const c=beam.candidates[beam.index],time=beam.t+c.age+beam.cycle*TAU;
  if(!Number.isFinite(c.ship.deathTime))return time<=now?{beam,ship:c.ship,event:c.event,time}:null;
  beam.index++;if(beam.index===beam.candidates.length){beam.index=0;beam.cycle++}
 }
 return null;
}
export function advanceLasers(beams,globalTime){
 const impacts=[];
 for(;;){
  let first=null;for(const beam of beams){const hit=nextImpact(beam,globalTime);if(hit&&(!first||hit.time<first.time))first=hit}
  if(!first)break;
  first.ship.deathTime=first.time;first.ship.deathPoint=first.event;first.beam.impact={time:first.time,ship:first.ship.id,event:first.event};impacts.push(first);
 }
 return impacts;
}
export function retardedLaser(beam,player){
 const age=player.t-beam.t,min=Math.max(0,age-Math.PI),max=Math.min(age,beam.impact?beam.impact.time-beam.t:Infinity);if(max<min)return null;
 const O=player.X,c0=Math.cos(beam.t),s0=Math.sin(beam.t);let best=null;
 for(const eta of [1,-1]){
  const a=-O[0]*c0-O[1]*s0+O.slice(2).reduce((sum,v,i)=>sum+v*beam.Q[i+1],0)+eta*beam.Q[0];
  const b=O[0]*s0-O[1]*c0+O.slice(2).reduce((sum,v,i)=>sum+v*beam.D[i+1],0)+eta*beam.D[0];
  if(Math.hypot(a,b)<1e-9)continue;
  const root=Math.atan2(-a,b);
  for(let n=Math.ceil((min-root)/Math.PI);n<=(max-root)/Math.PI+1e-10;n++){
   const phase=root+n*Math.PI,raw0=beam.Q[0]*Math.cos(phase)+beam.D[0]*Math.sin(phase);if(eta*raw0<1e-6)continue;
   const X=laserEvent(beam,phase),K=add(player.X,X,1,-1),freq=-dot(K,player.U);if(freq<1e-8)continue;
   const dir=[-dot(K,player.R)/freq,-dot(K,player.V)/freq,-dot(K,player.F)/freq];
   if(Math.abs(dot(K,K))>1e-6*Math.max(1,freq*freq))continue;
   if(!best||phase>best.phase)best={X,phase,dir,delay:age-phase};
  }
 }
 return best;
}
