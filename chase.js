import {dot,add,TAU} from './physics.js?v=15';
// Small, critically damped camera travel reveals acceleration in chase view.
// It does not modify the rocket. Units are L and the rocket's proper time L/c.
export class ChaseCamera {
 constructor(){this.reset()}
 reset(){this.lag=0;this.rate=0;this.force=[0,0,0]}
 advance(h,force){
  this.force=force.slice();const n=Math.max(1,Math.ceil(h/.002)),dt=h/n;
  for(let i=0;i<n;i++){
   this.rate=Math.max(-.12,Math.min(.12,this.rate+(force[2]-80*this.lag-18*this.rate)*dt));
   this.lag=Math.max(-.04,Math.min(.04,this.lag+this.rate*dt));
  }
 }
 observer(p){
  const local=[0,.055,-.18-this.lag],rho=Math.hypot(...local),n=local.map(v=>v/rho),axis=[p.R,p.V,p.F];
  let N=[0,0,0,0,0];axis.forEach((e,i)=>N=add(N,e,1,n[i]));
  const c=Math.cosh(rho),s=Math.sinh(rho),X=add(p.X,N,c,s),transport=add(N,p.X,c-1,s);
  const E=axis.map((e,i)=>add(e,transport,1,n[i]));
  // Chase framing uses instantaneous comoving observers, not a camera worldline.
  const out={...p,X,U:p.U};
  ['R','V','F'].forEach((name,i)=>out[name]=E[i]);
  const a=Math.atan2(X[1],X[0])-Math.atan2(p.X[1],p.X[0]);out.t=p.t+Math.atan2(Math.sin(a),Math.cos(a));return out;
 }
}
// Retarded points on the same instantaneous free-geodesic hull used by the GPU.
// This keeps exhaust and thrust cues attached as the chase framing changes.
export function rocketPoint(ship,observer,local){
 let offset=[0,0,0,0,0];[ship.R,ship.V,ship.F].forEach((e,i)=>offset=add(offset,e,1,local[i]));
 const c=Math.hypot(1,...local),a=dot(observer.X,ship.X),b=dot(observer.X,ship.U),r=Math.hypot(a,b),target=(-1-dot(observer.X,offset))/c;
 if(Math.abs(target)>r+1e-10)return null;
 const theta=Math.atan2(b,a),angle=Math.acos(Math.max(-1,Math.min(1,target/r)));
 const phases=[theta-angle,theta+angle].map(v=>((v%TAU)+TAU)%TAU-TAU),phase=Math.max(...phases);
 const X=add(add(ship.X,ship.U,Math.cos(phase)*c,Math.sin(phase)*c),offset);
 return {X,phase,dir:[dot(X,observer.R),dot(X,observer.V),dot(X,observer.F)]};
}
