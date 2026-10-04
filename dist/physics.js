// Dimensionless units c = L = 1; ambient signature (-,-,+,+,+).
export const dot=(a,b)=>-a[0]*b[0]-a[1]*b[1]+a[2]*b[2]+a[3]*b[3]+a[4]*b[4];
export const add=(a,b,sa=1,sb=1)=>a.map((v,i)=>sa*v+sb*b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const norm3=a=>Math.hypot(...a);
export const unit3=a=>{const n=norm3(a);return a.map(v=>v/n)};
export const TAU=2*Math.PI;
export function eventAt(x,t=0){const s=Math.hypot(1,...x);return [s*Math.cos(t),s*Math.sin(t),...x]}
export function staticFrame(X){
  const t=Math.atan2(X[1],X[0]),s=Math.hypot(X[0],X[1]),x=X.slice(2);
  return {T:[-Math.sin(t),Math.cos(t),0,0,0],E:[0,1,2].map(i=>[x[i]*Math.cos(t),x[i]*Math.sin(t),...x.map((v,j)=>(i===j?1:0)+v*x[i]/(s+1))])};
}
export function movingFrame(X,v){
  const {T,E}=staticFrame(X),b2=v.reduce((s,x)=>s+x*x,0),g=1/Math.sqrt(1-b2),w=v.map(x=>x*g);
  let P=[0,0,0,0,0];E.forEach((e,i)=>P=add(P,e,1,w[i]));
  return {U:add(T,P,g,1),E:E.map((e,i)=>add(add(e,P,1,w[i]/(g+1)),T,1,w[i]))};
}
export function initialPlayer(){
  const X=eventAt([0,0,.78]),m=movingFrame(X,[.20,0,0]);
  return {X,U:m.U,R:m.E[0],V:m.E[1],F:scale(m.E[2],-1),t:0,tau:0};
}
export function chaseObserver(p){
  const offset=add(p.F,p.V,-.16,.065),rho=Math.sqrt(dot(offset,offset)),n=scale(offset,1/rho),c=Math.cosh(rho),s=Math.sinh(rho);
  const X=add(p.X,n,c,s),out={...p,X};
  for(const k of ['R','V','F'])out[k]=add(p[k],add(n,p.X,c-1,s),1,dot(p[k],n));
  const a=Math.atan2(X[1],X[0])-Math.atan2(p.X[1],p.X[0]);out.t=p.t+Math.atan2(Math.sin(a),Math.cos(a));return out;
}
export function snapshot(p){return {X:p.X.slice(),U:p.U.slice(),R:p.R.slice(),V:p.V.slice(),F:p.F.slice(),t:p.t,tau:p.tau}}
export function initialHistory(p){
  const history=[];for(let i=150;i>=0;i--){const s=-i*.004,X=add(p.X,p.U,Math.cos(s),Math.sin(s)),U=add(p.U,p.X,Math.cos(s),-Math.sin(s));history.push({...snapshot(p),X,U,t:Math.atan2(X[1],X[0]),tau:s})}return history;
}
function interpolateState(a,b,f){
  const p={t:a.t+(b.t-a.t)*f,tau:a.tau+(b.tau-a.tau)*f};
  for(const k of ['X','U','R','V','F'])p[k]=add(a[k],b[k],1-f,f);
  p.X=scale(p.X,1/Math.sqrt(-dot(p.X,p.X)));p.U=add(p.U,p.X,1,dot(p.U,p.X));p.U=scale(p.U,1/Math.sqrt(-dot(p.U,p.U)));
  const prior=[];for(const k of ['R','V','F']){let e=add(add(p[k],p.X,1,dot(p[k],p.X)),p.U,1,dot(p[k],p.U));for(const other of prior)e=add(e,other,1,-dot(e,other));p[k]=scale(e,1/Math.sqrt(dot(e,e)));prior.push(p[k])}return p;
}
export function retardedRocket(history,observer){
  for(let i=history.length-2;i>=0;i--){const a=history[i],b=history[i+1];if(dot(observer.X,a.X)+1<0)continue;if(dot(observer.X,b.X)+1>0)continue;let lo=0,hi=1;
   for(let j=0;j<35;j++){const mid=(lo+hi)/2,p=interpolateState(a,b,mid);if(dot(observer.X,p.X)+1>0)lo=mid;else hi=mid}
   return interpolateState(a,b,(lo+hi)/2);
  }
  return history.at(-1);
}
export function boost(p,direction,rapidity){
  if(Math.abs(rapidity)<1e-14)return;
  const oldU=p.U,c=Math.cosh(rapidity),s=Math.sinh(rapidity);
  p.U=add(oldU,direction,c,s);
  for(const k of ['R','V','F']){const a=dot(p[k],direction);p[k]=add(p[k],add(direction,oldU,c-1,s),1,a)}
}
export function rotate(p,yaw,pitch,roll){
  function pair(a,b,v){if(!v)return;const A=p[a],B=p[b];p[a]=add(A,B,Math.cos(v),Math.sin(v));p[b]=add(B,A,Math.cos(v),-Math.sin(v))}
  pair('F','R',yaw);pair('F','V',pitch);pair('R','V',roll);
}
export function advance(p,h,thrust=0,brake=false,onDrift=null){
  if(h<=0)return;
  const before=Math.atan2(p.X[1],p.X[0]);
  function kick(amount){
    if(brake){
      const {T}=staticFrame(p.X),g=-dot(p.U,T),w=Math.sqrt(Math.max(0,g*g-1));
      if(w>1e-8)boost(p,scale(add(T,p.U,1,-g),1/w),Math.min(amount*Number(brake),Math.acosh(Math.max(1,g))));
    }else if(thrust)boost(p,p.F,amount*thrust);
  }
  kick(h/2);
  const drift=onDrift?{...p}:null;
  const X=p.X,U=p.U;p.X=add(X,U,Math.cos(h),Math.sin(h));p.U=add(U,X,Math.cos(h),-Math.sin(h));
  let dt=Math.atan2(p.X[1],p.X[0])-before;if(dt<0)dt+=TAU;
  if(h>=Math.PI){
    const periods=Math.floor(h/Math.PI),remainder=h-periods*Math.PI,Y=add(X,U,Math.cos(remainder),Math.sin(remainder));
    let part=Math.atan2(Y[1],Y[0])-before;if(part<0)part+=TAU;dt=periods*Math.PI+part;
  }
  if(onDrift){
    const endTime=p.t+dt,stop=onDrift(drift,endTime)?.stopAt;
    // Stop on the physical impact, without the remainder of the drift or burn.
    if(typeof stop==='number'&&Number.isFinite(stop)&&stop>=drift.t&&stop<=endTime){
      const phase=geodesicAt({A:X,B:U},stop).s;
      const ds=stop===drift.t?0:stop===endTime?h:Math.min(h,((phase%Math.PI)+Math.PI)%Math.PI+Math.floor((stop-drift.t)/Math.PI)*Math.PI);
      p.X=add(X,U,Math.cos(ds),Math.sin(ds));p.U=add(U,X,Math.cos(ds),-Math.sin(ds));p.t=stop;p.tau+=ds;return;
    }
  }
  kick(h/2);p.tau+=h;
  p.t+=dt;
}
export function telemetry(p){
  const s=Math.hypot(p.X[0],p.X[1]),{T}=staticFrame(p.X),gamma=Math.max(1,-dot(p.U,T));
  return {r:norm3(p.X.slice(2)),chi:Math.acos(Math.min(1,1/s)),gamma,beta:Math.sqrt(1-1/(gamma*gamma)),clock:s/gamma,energy:p.X[0]*p.U[1]-p.X[1]*p.U[0]};
}
export function geodesicAt(ship,t){
  const st=Math.sin(t),ct=Math.cos(t),a=ship.A[0]*st-ship.A[1]*ct,b=ship.B[0]*st-ship.B[1]*ct;
  let s=Math.atan2(-a,b),X=add(ship.A,ship.B,Math.cos(s),Math.sin(s));
  if(X[0]*ct+X[1]*st<0){s+=Math.PI;X=scale(X,-1)}
  return {X,U:add(ship.B,ship.A,Math.cos(s),-Math.sin(s)),s};
}
export function retarded(ship,p){
  const a=dot(p.X,ship.A),b=dot(p.X,ship.B),r=Math.hypot(a,b);
  if(r<1-1e-10)return null;
  const theta=Math.atan2(b,a),d=Math.acos(Math.max(-1,Math.min(1,-1/r)));
  for(const s of [theta+d,theta-d]){
    const X=add(ship.A,ship.B,Math.cos(s),Math.sin(s)),U=add(ship.B,ship.A,Math.cos(s),-Math.sin(s)),K=add(p.X,X,1,-1),freq=-dot(K,p.U);
    const delay=((Math.atan2(p.X[1],p.X[0])-Math.atan2(X[1],X[0]))%TAU+TAU)%TAU;
    if(freq>1e-10&&delay<Math.PI+1e-8){return {X,U,delay,dir:[-dot(K,p.R)/freq,-dot(K,p.V)/freq,-dot(K,p.F)/freq],shift:freq/(-dot(K,U)),distance:Math.hypot(dot(p.X,ship.C[0]),dot(p.X,ship.C[1]),dot(p.X,ship.C[2]))}}
  }
  return null;
}
// Exact aberrated silhouette of a sphere enclosing the ship's complete worldtube.
export function shipBounds(ship,p,pixelPadding=.003,reflected=false){
  const radius=ship.boundRadius*ship.size,r=Math.hypot(...ship.C.map(c=>dot(p.X,c)));
  if(r<=radius)return [0,0,100,0];
  const R=Math.hypot(1,r),a=-dot(p.X,ship.A),b=-dot(p.X,ship.B);
  const G=add(ship.A,ship.B,a/R,b/R),Z=add(ship.A,ship.B,-b/R,a/R);
  const H=add(p.X,G,R/r,-1/r),sa=radius*R/(r*Math.hypot(1,radius)),ca=Math.sqrt(Math.max(0,1-sa*sa));
  function cap(sign){
   const M=add(H,Z,sign,ca),m=[-dot(p.R,M),-dot(p.V,M),-dot(p.F,M)],length=Math.hypot(...m);
   const axis=m.map(v=>v/length),cos=-dot(p.U,M)/length,sin=sa/length;
   if(cos<=0)return [0,0,100,0];if(axis[2]<-sin)return [1000,1000,0,0];if(axis[2]<=sin+1e-8)return [0,0,100,0];
   const den=axis[2]*axis[2]-sin*sin;
   const limits=i=>{const mid=axis[i]*axis[2]/den/1.4,half=sin*Math.sqrt(Math.max(0,axis[i]*axis[i]+axis[2]*axis[2]-sin*sin))/den/1.4;return [mid,half]};
   const x=limits(0),y=limits(1);return [x[0],y[0],Math.max(x[1],y[1])+pixelPadding,0];
  }
  const first=cap(1);if(!reflected)return first;const second=cap(-1);
  if(first[2]>=100||second[2]>=100)return [0,0,100,0];if(first[0]===1000)return second;if(second[0]===1000)return first;
  const xmin=Math.min(first[0]-first[2],second[0]-second[2]),xmax=Math.max(first[0]+first[2],second[0]+second[2]),ymin=Math.min(first[1]-first[2],second[1]-second[2]),ymax=Math.max(first[1]+first[2],second[1]+second[2]);
  return [(xmin+xmax)/2,(ymin+ymax)/2,Math.max(xmax-xmin,ymax-ymin)/2,0];
}
export function seeded(seed=92717){let n=seed;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
export function hullParts(kind){
  if(kind===1)return [ [[.024,.024,.024],[0,0,.068]], [[.005,.005,.071],[0,0,-.005]], [[.026,.018,.023],[0,0,-.078]], [[.012,.014,.023],[0,0,.022]] ];
  if(kind===2)return [ [[.041,.042,.106],[0,0,0]], [[.053,.016,.044],[0,-.022,-.050]] ];
  if(kind===3)return [ [[.054,.007,.043],[0,.015,.032]], [[.015,.015,.048],[0,-.018,-.030]], [[.009,.009,.055],[-.041,.006,-.050]], [[.009,.009,.055],[.041,.006,-.050]], [[.044,.004,.008],[0,-.002,-.045]], [[.007,.020,.014],[0,0,.007]] ];
  return [ [[.013,.014,.047],[0,0,0]], [[.043,.0035,.020],[0,-.005,-.008]] ];
}
export function makeFleet(count=72){
  const rand=seeded(58204),fleet=[];
  for(let i=0;i<count;i++){
    const boundaryOrbit=i>=count-2,r=boundaryOrbit?(i===count-2?10:20):(.18+rand()*2.2)*1.5,z=rand()*2-1,a=rand()*TAU,n=[Math.sqrt(1-z*z)*Math.cos(a),z,Math.sqrt(1-z*z)*Math.sin(a)],x=n.map(v=>v*r);
    let u=unit3([n[2],0,-n[0]]);if(norm3(u)<.01)u=[1,0,0];
    const cross=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]],angle=rand()*TAU;
    const tangent=u.map((v,j)=>v*Math.cos(angle)+cross[j]*Math.sin(angle));
    // Circular-orbit speed is r/sqrt(1+r^2); vary it for eccentric orbits.
    const speed=boundaryOrbit?r/Math.hypot(1,r):Math.min(.91,r/Math.hypot(1,r)*(.65+rand()*.7)),radial=boundaryOrbit?0:(rand()-.5)*.17;
    let vel=tangent.map((v,j)=>v*speed+n[j]*radial);if(!boundaryOrbit&&norm3(vel)>.93)vel=vel.map(v=>v*.93/norm3(vel));
    const A=eventAt(x),frame=movingFrame(A,vel),f=unit3(vel),right=unit3([f[2],0,-f[0]]),up=[f[1]*right[2]-f[2]*right[1],f[2]*right[0]-f[0]*right[2],f[0]*right[1]-f[1]*right[0]];
    const combine=v=>frame.E.reduce((acc,e,j)=>add(acc,e,1,v[j]),[0,0,0,0,0]);
    const kind=i%4;
    fleet.push({id:boundaryOrbit?`BOUNDARY ${i===count-2?'01':'02'}`:`VESSEL ${String(i+1).padStart(2,'0')}`,A,B:frame.U,C:[combine(right),combine(up),combine(f)],size:.7+rand()*.7,hue:rand(),kind,boundRadius:[.065,.115,.13,.145][kind],boundaryOrbit});
  }
  return fleet;
}
