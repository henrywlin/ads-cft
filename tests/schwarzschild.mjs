import assert from 'node:assert/strict';
import * as s from '../dist/schwarzschild.js';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const constraints=p=>{close(s.inner(p.x,p.U,p.U),-1);for(const k of ['R','V','F']){close(s.inner(p.x,p[k],p[k]),1);close(s.inner(p.x,p.U,p[k]),0)}for(const [a,b] of [['R','V'],['R','F'],['V','F']])close(s.inner(p.x,p[a],p[b]),0)};
close(s.lapse(s.HORIZON),0);close(s.PHOTON_SPHERE,1.5*s.MU);
// Independently differentiate the metric: Christoffels must preserve all products.
for(const x of [[.3,.2,.7],[2,-1,3],[.1,0,.2]]){
 const A=[1.3,.2,-.4,.3],B=[-.1,.8,.2,-.5],D=[.5,-.2,.3,.1],h=1e-6;
 const derivative=(s.inner(s.plus(x,D.slice(1),h),A,B)-s.inner(s.plus(x,D.slice(1),-h),A,B))/(2*h);
 close(derivative,s.inner(x,s.connection(x,D,A),B)+s.inner(x,A,s.connection(x,D,B)),1e-7);
}
let p=s.initialPlayer(),initial=s.telemetry(p);for(let i=0;i<10000;i++)s.advance(p,.002);constraints(p);const final=s.telemetry(p);close(final.r,initial.r);close(final.energy,initial.energy);close(final.angularMomentum,initial.angularMomentum);close(p.t/p.tau,1/initial.clock);
// Generic inclined eccentric geodesic, not just circular force balance.
{
 const x=[.8,.3,1.1],m=s.movingFrame(x,[.4,.15,-.12]);const q={x,v:0,t:0,tau:0,U:m.U,R:m.E[0],V:m.E[1],F:m.E[2]},first=s.telemetry(q);
 for(let i=0;i<3500;i++){s.advance(q,.001);if(s.length(q.x)<s.HORIZON*1.01)break}constraints(q);const z=s.telemetry(q);close(z.energy,first.energy,2e-7);close(z.angularMomentum,first.angularMomentum,2e-7);
}
// Frame transport through sustained burns and rotation; force points along F.
for(const thrust of [-2,2]){const q=s.initialPlayer(),first=s.telemetry(q),nose=q.F.slice();s.advance(q,.00001,thrust);constraints(q);const change=s.plus(q.U,s.initialPlayer().U,-1),free=s.initialPlayer();s.advance(free,.00001);const thrustChange=s.plus(q.U,free.U,-1);assert.ok(s.inner(q.x,thrustChange,nose)*thrust>0);for(let i=0;i<400;i++){s.rotate(q,.0001,-.00015,.00012);s.advance(q,.001,thrust)}constraints(q);assert.ok(Number.isFinite(s.telemetry(q).energy))}
// Stable exact circular traffic, including two near-boundary radii.
const fleet=s.makeFleet();assert.equal(fleet.length,48);for(const ship of fleet){for(const t of [-5,0,10]){const q=s.shipAt(ship,t);close(s.length(q.x),ship.r);close(s.inner(q.x,q.U,q.U),-1);close(s.circularSpeed(ship.r),ship.r*ship.omega/Math.sqrt(s.lapse(ship.r)))}assert.ok(ship.r>s.PHOTON_SPHERE)}
// Null constants and reflection conserve the Hamiltonian through many circuits.
for(const dir of [[1,0,0],[0,0,1],[0,0,-1],[.8,.6,0]]){
 const x=[0,0,1.8],m=s.movingFrame(x,[0,0,0]),F=m.E.reduce((v,e,i)=>s.plus(v,e,dir[i]),[0,0,0,0]),ray=s.createPhoton({x,U:m.U,t:0},F);
 for(let i=0;i<10000&&!ray.captured;i++){s.advancePhoton(ray,.002);close(ray.p*ray.p+ray.b*ray.b*(1+ray.u*ray.u-s.MU*ray.u**3),1,2e-6)}
 if(dir[2]===-1)assert.ok(ray.captured);if(dir[0]===1)assert.ok(ray.bounces>1);
}
// Radial null travel dr/dt=f agrees with an independent quadrature.
{
 const x=[0,0,1],m=s.movingFrame(x,[0,0,0]),ray=s.createPhoton({x,U:m.U,t:0},m.E[2]);s.advancePhoton(ray,.2);const end=s.photonPosition(ray)[2],n=20000,h=(end-1)/n;let integral=0;for(let i=0;i<n;i++)integral+=h/s.lapse(1+(i+.5)*h);close(integral,.2,1e-8);
}
// Capture cone: b below the photon-sphere critical value falls in; above escapes.
{
 const x=[0,0,2],m=s.movingFrame(x,[0,0,0]),critical=s.PHOTON_SPHERE/Math.sqrt(s.lapse(s.PHOTON_SPHERE));for(const factor of [.95,1.05]){const tangent=critical*factor*Math.sqrt(s.lapse(2))/2,F=s.plus(s.times(m.E[0],tangent),m.E[2],-Math.sqrt(1-tangent*tangent)),ray=s.createPhoton({x,U:m.U,t:0},F);for(let i=0;i<20000&&!ray.captured&&!ray.bounces;i++)s.advancePhoton(ray,.002);assert.equal(ray.captured,factor<1);assert.equal(ray.bounces>0,factor>1)}
}
// Heading turns leave velocity intact. Map arrow speed equals the gauge.
{
 const q=s.initialPlayer(),U=q.U.slice(),v=s.mapVectors(q);close(s.length(v.velocity),s.telemetry(q).beta);s.rotate(q,.4,.2,.1);assert.deepEqual(q.U,U);assert.notDeepEqual(s.mapVectors(q).nose,v.nose);
}
// A moving target can cross a null segment, and the earliest crossing is retained.
close(s.segmentHit([-1,0,2],[1,0,2],[0,0,2],[0,0,2],.1),.45);assert.equal(s.segmentHit([-1,1,2],[1,1,2],[0,0,2],[0,0,2],.1),null);
console.log('PASS Schwarzschild–AdS: metric connection, circular/eccentric geodesics, conserved quantities, tetrads, burns, exact traffic, null invariants, boundary reflection, radial travel, capture cone and collisions.');
// Independently compare the circular-emitter shader frequency expression with
// the covariant four-vector contraction, including both orbital directions.
for(const r of [.85,2.2,20])for(const sign of [-1,1]){
 const x=[0,0,r],staticBasis=s.staticFrame(x),omega=Math.sqrt(1+s.MU/(2*r**3)),ut=1/Math.sqrt(1-1.5*s.MU/r),U=[ut,r*omega*ut,0,0],d=[sign*.7,0,-Math.sqrt(1-.49)],K=staticBasis.E.reduce((v,e,i)=>s.plus(v,e,d[i]),s.times(staticBasis.T,-1)),energy=-(s.lapse(r)*K[0]-K[3]),b=r*Math.abs(K[1])/energy;
 const expression=energy*ut*(1+b*omega*sign),covariant=s.inner(x,K,U);close(expression,covariant,1e-9);
}
console.log('PASS: circular-emitter gravitational and Doppler factors agree with covariant photon frequencies.');

// Fourth-order convergence during a sustained burn.
{
 const run=h=>{const p=s.initialPlayer();for(let t=0;t<.5-h/2;t+=h)s.advance(p,h,1.8);return p},ref=run(.000125),error=p=>Math.hypot(...p.x.map((v,i)=>v-ref.x[i]),p.t-ref.t);
 assert.ok(error(run(.002))/error(run(.001))>14);
}
console.log('PASS: fourth-order burn convergence.');
