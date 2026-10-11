import assert from 'node:assert/strict';
import {add,eventAt,movingFrame,rotate,telemetry,boost} from '../dist/physics.js';
import {mapCoordinates,mapVelocity,mapVectors,mapRadiusGauge} from '../dist/map.js';

const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const length=v=>Math.hypot(...v);
const normalized=v=>v.map(x=>x/length(v));
const ball=X=>mapCoordinates(X,[0,1,2]).point;
const phaseDifference=(X,Y)=>Math.atan2(X[0]*Y[1]-X[1]*Y[0],X[0]*Y[0]+X[1]*Y[1]);
function player(position,velocity,time=.7){
 const X=eventAt(position,time),frame=movingFrame(X,velocity);
 return {X,U:frame.U,R:frame.E[0],V:frame.E[1],F:frame.E[2],t:time,tau:0};
}

// A finite difference of an independently constructed exact geodesic must
// retain mapVelocity's compact-coordinate derivative semantics.
function finiteVelocity(p,epsilon=1e-6){
 const before=add(p.X,p.U,Math.cos(epsilon),-Math.sin(epsilon));
 const after=add(p.X,p.U,Math.cos(epsilon),Math.sin(epsilon));
 const dt=phaseDifference(before,after),a=ball(before),b=ball(after);
 return b.map((x,i)=>(x-a[i])/dt);
}

// Construct actual small Fermi offsets along the body nose, then drift each
// offset until it intersects the original global-time slice. This tests the
// orientation by geometry rather than duplicating the helper's tangent code.
function synchronizedNose(p,epsilon=1e-6){
 const offset=sign=>{
  const Z=add(p.X,p.F,Math.cosh(epsilon),sign*Math.sinh(epsilon));
  const sine=-(p.X[0]*Z[1]-p.X[1]*Z[0]);
  const cosine=p.X[0]*p.U[1]-p.X[1]*p.U[0];
  const drift=Math.atan2(sine,cosine);
  const Y=add(Z,p.U,Math.cos(drift),Math.sin(drift));
  close(phaseDifference(p.X,Y),0,1e-10);
  return ball(Y);
 };
 const before=offset(-1),after=offset(1);
 return normalized(after.map((x,i)=>x-before[i]));
}

for(const radius of [0,.78,1,10,20]){
 for(const direction of [[1,0,0],[0,1,0],[0,0,1],normalized([2,-1,3])]){
  for(const beta of [0,.2,.4,.8,.98]){
   const p=player([radius/Math.sqrt(3),radius/Math.sqrt(3),radius/Math.sqrt(3)],direction.map(v=>v*beta));
   const vectors=mapVectors(p),raw=mapVelocity(p.X,p.U),difference=finiteVelocity(p);
   close(vectors.speed,beta,1e-8);close(length(vectors.velocity),beta,1e-8);
   close(length(vectors.nose),1);
   raw.forEach((v,i)=>close(v,difference[i],2e-7));
   if(beta){
    close(vectors.speed,telemetry(p).beta,1e-8);
    normalized(raw).forEach((v,i)=>close(v,normalized(vectors.velocity)[i]));
   }else{
    vectors.velocity.forEach(v=>close(v,0));
   }
   rotate(p,.53,-.29,.18);
   const turned=mapVectors(p);
   turned.velocity.forEach((v,i)=>close(v,vectors.velocity[i]));
   const physicalNose=synchronizedNose(p);
   turned.nose.forEach((v,i)=>close(v,physicalNose[i],2e-6));
  }
 }
}

// Changing radius cannot shorten the arrow at the same optical/global speed.
for(const radius of [0,1,20]){
 const low=mapVectors(player([0,0,radius],[.2,0,0]));
 const high=mapVectors(player([0,0,radius],[.4,0,0]));
 close(length(high.velocity)/length(low.velocity),2);
}

const resting=mapVectors(player([0,0,10],[0,0,0]));
close(length(resting.velocity),0);close(length(resting.nose),1);
resting.nose.forEach((v,i)=>close(v,i===2?1:0));

// Longitudinal contraction changes a tilted nose's orientation on a static
// observer's simultaneous slice. Dropping F's time component would give the
// inverse distortion and fails this 45-degree analytic example.
const tilted=player([0,0,0],[.8,0,0]);rotate(tilted,Math.PI/4,0,0);
const nose=mapVectors(tilted).nose,expected=normalized([.6,0,1]);
nose.forEach((v,i)=>close(v,expected[i]));

// Each panel is a projection of the same 3D vector, not independently
// normalized: motion perpendicular to a panel correctly vanishes there.
const xTravel=mapVectors(player([0,0,0],[.4,0,0]));
close(Math.hypot(xTravel.velocity[0],xTravel.velocity[2]),.4);
close(Math.hypot(xTravel.velocity[1],xTravel.velocity[2]),0);
const yTravel=mapVectors(player([0,0,0],[0,.4,0]));
close(Math.hypot(yTravel.velocity[0],yTravel.velocity[2]),0);
close(Math.hypot(yTravel.velocity[1],yTravel.velocity[2]),.4);
const diagonal=mapVectors(player([0,0,0],[.2,.2,.2]));
close(Math.hypot(diagonal.velocity[0],diagonal.velocity[2]),Math.SQRT2*.2);
close(Math.hypot(diagonal.velocity[1],diagonal.velocity[2]),Math.SQRT2*.2);
assert.ok(Math.hypot(diagonal.velocity[0],diagonal.velocity[2])<diagonal.speed);

// Reproduce the reported mismatch: both projected dots can be inside 10L,
// while the independent full-radius gauge must be beyond its 10L tick.
const diagonalPosition=eventAt([12/Math.sqrt(3),12/Math.sqrt(3),12/Math.sqrt(3)]);
for(const axes of [[0,2],[1,2]])assert.ok(length(mapCoordinates(diagonalPosition,axes).point)<mapRadiusGauge(eventAt([10,0,0])).compact);
assert.ok(mapRadiusGauge(diagonalPosition).compact>mapRadiusGauge(eventAt([10,0,0])).compact);
for(const radius of [0,1,3,9.99,10,10.01,12,20,100])for(const direction of [[1,0,0],[0,1,0],[0,0,-1],normalized([2,-3,4])]){
 const X=eventAt(direction.map(v=>v*radius)),gauge=mapRadiusGauge(X);
 close(gauge.radius,radius);close(gauge.compact,Math.tan(Math.atan(radius)/2));
 assert.deepEqual(gauge.ticks.map(t=>t.radius),[0,1,3,10]);
 if(radius!==10)assert.equal(gauge.compact>gauge.ticks.at(-1).compact,radius>10);
}

// The displayed nose must agree with the velocity change from a forward burn,
// even with tilted attitude and high transverse momentum. Reverse opposes it.
for(const radius of [0,.78,12,20])for(const velocity of [[0,0,0],[.2,-.1,.3],[.8,.2,.1]])for(const burn of [-1,1]){
 const p=player([radius/Math.sqrt(3),radius/Math.sqrt(3),radius/Math.sqrt(3)],velocity);
 rotate(p,.71,-.38,.23);const before=mapVectors(p);
 boost(p,p.F,burn*1e-6);const after=mapVectors(p),change=normalized(after.velocity.map((v,i)=>v-before.velocity[i]));
 change.forEach((v,i)=>close(v,burn*before.nose[i],2e-6));
}
console.log('Map vectors: full 3D radius crossing 10L, projected-radius ambiguity, global speed scaling, motion derivatives, simultaneous nose/thrust directions and projection foreshortening pass.');
