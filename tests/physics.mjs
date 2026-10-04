import assert from 'node:assert/strict';
import {dot,add,scale,eventAt,movingFrame,initialPlayer,advance,rotate,telemetry,makeFleet,geodesicAt,retarded,shipBounds} from '../dist/physics.js';
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
const constraints=p=>{
 close(dot(p.X,p.X),-1);close(dot(p.U,p.U),-1);close(dot(p.X,p.U),0);
 for(const a of ['R','V','F']){close(dot(p[a],p[a]),1);close(dot(p[a],p.X),0);close(dot(p[a],p.U),0)}
 for(const [a,b] of [['R','V'],['R','F'],['V','F']])close(dot(p[a],p[b]),0);
};
const p=initialPlayer(),A=p.X.slice(),B=p.U.slice(),energy=telemetry(p).energy;
advance(p,0);close(p.t,0);advance(p,-.01);close(p.t,0);
for(let i=0;i<20000;i++)advance(p,.001);
constraints(p);p.X.forEach((v,i)=>close(v,A[i]*Math.cos(20)+B[i]*Math.sin(20)));close(telemetry(p).energy,energy);assert.ok(p.t>19&&p.t<21);
for(const n of [100,200,400]){const q=initialPlayer();for(let i=0;i<n;i++){rotate(q,.001,-.0008,.0007);advance(q,1/n,1.5)}constraints(q)}
function burn(n){const q=initialPlayer();for(let i=0;i<n;i++)advance(q,1/n,1.5);return q}
const fine=burn(3200),coarse=burn(100),medium=burn(200),err=q=>Math.hypot(...q.X.map((v,i)=>v-fine.X[i]));assert.ok(err(coarse)/err(medium)>3.9);
const low=initialPlayer(),high=initialPlayer();advance(low,.004,0,.3);advance(high,.004,0,3);assert.ok(telemetry(high).beta<telemetry(low).beta);
const fleet=makeFleet(72);
for(const ship of fleet){
 const e=ship.A[0]*ship.B[1]-ship.A[1]*ship.B[0];let jsq=0;
 for(let i=2;i<5;i++)for(let j=i+1;j<5;j++)jsq+=(ship.A[i]*ship.B[j]-ship.A[j]*ship.B[i])**2;assert.ok(jsq>1e-8);
 for(const t of [-20,0,.3,4,25]){const z=geodesicAt(ship,t);close(dot(z.X,z.X),-1);close(dot(z.U,z.U),-1);close(z.X[0]*z.U[1]-z.X[1]*z.U[0],e);close(Math.atan2(z.X[1],z.X[0])-Math.atan2(Math.sin(t),Math.cos(t)),0)}
 const v=retarded(ship,initialPlayer());assert.ok(v);close(dot(add(initialPlayer().X,v.X,1,-1),add(initialPlayer().X,v.X,1,-1)),0);assert.ok(v.delay>0&&v.delay<Math.PI);close(Math.hypot(...v.dir),1);assert.ok(v.shift>0);
 const b=shipBounds(ship,initialPlayer());assert.ok(b.every(Number.isFinite));
}
for(const r of [0,.5,2,50]){
 const X=eventAt([0,0,r]),m=movingFrame(X,[0,0,0]),q={X,U:m.U,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1)};
 close(telemetry(q).clock,Math.hypot(1,r));
 const K=add(q.F,q.U,1,-1);close(dot(K,K),0);close(dot(K,X),0);close(1/(X[1]*K[0]-X[0]*K[1]),1/Math.hypot(1,r));
 if(r===0)close(Math.atan2(-(X[0]*K[1]-X[1]*K[0]),X[0]*K[0]+X[1]*K[1]),Math.PI/2);
}
console.log('PASS: free geodesics, angular momentum, accelerated frames, second-order convergence, braking strength, retarded rays, boundary frequency, and clocks.');
