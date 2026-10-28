import {fleetPhysicists} from './fleet-names.js?v=21';
// Schwarzschild–AdS4, c=L=1. Ingoing Eddington–Finkelstein coordinates
// (v,x,y,z): ds²=-f dv²+2 dv dr+dx²-dr², f=1+r²-mu/r.
export const MU=.32;
export const lapse=(r,mu=MU)=>1+r*r-mu/r;
export const lapsePrime=(r,mu=MU)=>2*r+mu/(r*r);
export function horizon(mu=MU){let lo=0,hi=Math.max(1,mu);for(let i=0;i<70;i++){const r=(lo+hi)/2;if(r+r*r*r>mu)hi=r;else lo=r}return (lo+hi)/2}
export const HORIZON=horizon(),PHOTON_SPHERE=1.5*MU;
export const dot3=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const length=a=>Math.hypot(...a);
export const unit=a=>{const m=length(a);return a.map(x=>x/(m||1))};
export const plus=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]);
export const times=(a,s)=>a.map(x=>x*s);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function inner(x,A,B){const r=length(x),n=times(x,1/r),a=dot3(n,A.slice(1)),b=dot3(n,B.slice(1));return -lapse(r)*A[0]*B[0]+A[0]*b+B[0]*a+dot3(A.slice(1),B.slice(1))-a*b}
export function staticFrame(x){const r=length(x),n=times(x,1/r),s=Math.sqrt(lapse(r));return {T:[1/s,0,0,0],E:[0,1,2].map(i=>[n[i]/s,...n.map((v,j)=>(i===j?1:0)+(s-1)*n[i]*v)])}}
export function movingFrame(x,velocity){const {T,E}=staticFrame(x),b2=dot3(velocity,velocity),g=1/Math.sqrt(1-b2),w=times(velocity,g),P=E.reduce((p,e,i)=>plus(p,e,w[i]),[0,0,0,0]);return {U:plus(times(T,g),P),E:E.map((e,i)=>plus(plus(e,P,w[i]/(g+1)),T,w[i]))}}
export function circularSpeed(r){return Math.sqrt(r*lapsePrime(r)/(2*lapse(r)))}
export function initialPlayer(){const x=[0,0,1.8],m=movingFrame(x,[circularSpeed(1.8),0,0]);const p={x,v:0,t:0,tau:0,U:m.U,R:m.E[0],V:m.E[1],F:times(m.E[2],-1)};rotate(p,Math.asin(circularSpeed(1.8)),0,0);return p}
// Christoffel contraction, valid across the future horizon. Angular momentum
// conservation makes the Cartesian spatial contraction purely radial.
export function connection(x,A,B){const r=length(x),n=times(x,1/r),a=dot3(n,A.slice(1)),b=dot3(n,B.slice(1)),q=(dot3(A.slice(1),B.slice(1))-a*b)/r,f=lapse(r),fp=lapsePrime(r);return [.5*fp*A[0]*B[0]-q,...times(n,.5*f*fp*A[0]*B[0]-.5*fp*(A[0]*b+B[0]*a)-(f-1)*q)]}
function pack(p){return [p.v,...p.x,...p.U,...p.R,...p.V,...p.F,p.t]}
function unpack(p,y){p.v=y[0];p.x=y.slice(1,4);p.U=y.slice(4,8);p.R=y.slice(8,12);p.V=y.slice(12,16);p.F=y.slice(16,20);p.t=y[20]}
function derivative(y,thrust,brake){const x=y.slice(1,4),U=y.slice(4,8),E=[y.slice(8,12),y.slice(12,16),y.slice(16,20)],r=length(x),f=lapse(r);let a=times(E[2],thrust);
 if(brake){const {T}=staticFrame(x),g=Math.max(1,-inner(x,U,T)),s=Math.sqrt(g*g-1);a=s>1e-9?times(plus(T,U,-g),brake/s):[0,0,0,0]}
 const dU=plus(times(connection(x,U,U),-1),a),dE=E.flatMap(e=>plus(times(connection(x,U,e),-1),U,inner(x,a,e)));
 return [...U,...dU,...dE,U[0]-dot3(x,U.slice(1))/(r*f)];
}
export function normalizeFrame(p){p.U=times(p.U,1/Math.sqrt(-inner(p.x,p.U,p.U)));const prior=[];for(const k of ['R','V','F']){let e=plus(p[k],p.U,inner(p.x,p[k],p.U));for(const q of prior)e=plus(e,q,-inner(p.x,e,q));p[k]=times(e,1/Math.sqrt(inner(p.x,e,e)));prior.push(p[k])}}
export function advance(p,h,thrust=0,brake=0){if(h<=0)return;let left=h;while(left>1e-12){if(length(p.x)<=HORIZON*1.004)return;const r=length(p.x),s=Math.min(left,.002,Math.max(.00002,(r-HORIZON)/Math.max(1,length(p.U.slice(1)))*.12));const y=pack(p),k1=derivative(y,thrust,brake),k2=derivative(plus(y,k1,s/2),thrust,brake),k3=derivative(plus(y,k2,s/2),thrust,brake),k4=derivative(plus(y,k3,s),thrust,brake);unpack(p,y.map((v,i)=>v+s*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6));p.tau+=s;normalizeFrame(p);left-=s}}
export function rotate(p,yaw,pitch,roll){for(const [a,b,v] of [['F','R',yaw],['F','V',pitch],['R','V',roll]]){const A=p[a],B=p[b];p[a]=plus(times(A,Math.cos(v)),B,Math.sin(v));p[b]=plus(times(B,Math.cos(v)),A,-Math.sin(v))}}
export function telemetry(p){const r=length(p.x),{T,E}=staticFrame(p.x),gamma=Math.max(1,-inner(p.x,p.U,T)),velocity=E.map(e=>inner(p.x,p.U,e)/gamma);return {r,gamma,beta:length(velocity),velocity,clock:Math.sqrt(lapse(r))/gamma,energy:lapse(r)*p.U[0]-dot3(p.x,p.U.slice(1))/r,angularMomentum:length(cross(p.x,p.U.slice(1)))}}
export function mapVectors(p){const {beta}=telemetry(p),n=unit(p.x),f=lapse(length(p.x)),dt=w=>w[0]-dot3(n,w.slice(1))/f,N=plus(p.F,p.U,-dt(p.F)/dt(p.U)),a=Math.hypot(1,...p.x),project=w=>times(plus(w,p.x,-dot3(p.x,w)/(a*(a+1))),1/(a+1));return {velocity:times(unit(project(p.U.slice(1))),beta),nose:unit(project(N.slice(1)))}}
export function makeFleet(){let seed=58204;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const radii=[.85,1.1,1.5,2.2,3.5,5,10,20];return Array.from({length:48},(_,i)=>{const band=i>=46?i-40:i%6,slot=i>=46?band:band+8*Math.floor(i/6),r=radii[band],a=random()*Math.PI*2,z=(random()-.5)*1.7,n=[Math.cos(a)*Math.sqrt(1-z*z),z,Math.sin(a)*Math.sqrt(1-z*z)],A=unit(cross(n,[0,1,0])),B=cross(n,A);return {id:fleetPhysicists[i].ship,slot,r,A,B,phase:random()*Math.PI*2,omega:Math.sqrt(1+MU/(2*r*r*r)),ut:1/Math.sqrt(1-1.5*MU/r),kind:i%4,size:1.15+random()*.55,band,nextFire:3+random()*5}})}
export function shipAt(ship,t){const angle=ship.phase+ship.omega*t,c=Math.cos(angle),s=Math.sin(angle),n=plus(times(ship.A,c),ship.B,s),tangent=plus(times(ship.B,c),ship.A,-s),x=times(n,ship.r),spatial=times(tangent,ship.r*ship.omega*ship.ut);return {x,U:[ship.ut,...spatial],n,tangent}}
// Conformally rescaled null affine parameter eta. u=1/r, phi'=b,
// u''=-b²u+3mu b²u²/2; (u')²+b²(1+u²-mu u³)=1.
// u=0 is the actual AdS boundary; reflecting flips the radial derivative.
export function createPhoton(p,direction=p.F){const K=plus(p.U,direction),r=length(p.x),n=unit(p.x),kr=dot3(n,K.slice(1)),energy=lapse(r)*K[0]-kr,tangent=plus(K.slice(1),n,-kr),angular=length(tangent);return {u:1/r,p:-kr/energy,phi:0,b:r*angular/energy,n,e:angular>1e-12?times(tangent,1/angular):unit(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0])),t:p.t,bounces:0,captured:false,energy}}
export function photonPosition(ray){return times(plus(times(ray.n,Math.cos(ray.phi)),ray.e,Math.sin(ray.phi)),1/Math.max(1e-12,ray.u))}
function photonDerivative(y,b){const [u,p]=y,G=1+u*u-MU*u*u*u;return [p*G,b*b*(-u+1.5*MU*u*u)*G,b*G]}
export function advancePhoton(ray,dt){if(ray.captured||dt<=0)return;let left=dt;while(left>1e-12){const h=Math.min(left,.002),y=[ray.u,ray.p,ray.phi],a=photonDerivative(y,ray.b),b=photonDerivative(plus(y,a,h/2),ray.b),c=photonDerivative(plus(y,b,h/2),ray.b),d=photonDerivative(plus(y,c,h),ray.b),next=y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);[ray.u,ray.p,ray.phi]=next;if(ray.u<0){ray.u=-ray.u;ray.p=-ray.p;ray.bounces++}ray.t+=h;left-=h;if(ray.u>=1/(HORIZON*1.004)){ray.captured=true;return}}}
// Moving spherical collision proxy, measured in the local static spatial metric.
// Endpoint interpolation converges with the fixed <=.002 global-time step.
export function segmentHit(a,b,xa,xb,radius){const center=times(plus(xa,xb),.5),r=length(center),n=unit(center),s=1/Math.sqrt(Math.max(.001,lapse(r))),transform=v=>plus(v,n,(s-1)*dot3(v,n)),q=transform(plus(a,xa,-1)),d=transform(plus(plus(b,xb,-1),plus(a,xa,-1),-1)),A=dot3(d,d),B=dot3(q,d),C=dot3(q,q)-radius*radius;if(C<=0)return 0;const disc=B*B-A*C;if(A<1e-20||disc<0)return null;const f=(-B-Math.sqrt(disc))/A;return f>=0&&f<=1?f:null}
