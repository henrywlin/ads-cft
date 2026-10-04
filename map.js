import {geodesicAt,TAU} from './physics.js?v=21';
// Stereographic radius in the conformal ball, normalized to its boundary.
// A 2D projection drops a coordinate: its plotted radius is a lower bound.
export const compactRadius=r=>r/(Math.hypot(1,r)+1);
export function mapCoordinates(X,axes=[0,2]){
 const spatial=X.slice(2),r=Math.hypot(...spatial),factor=1/(Math.hypot(1,r)+1);
 return {point:axes.map(i=>spatial[i]*factor),radius:r,compact:compactRadius(r)};
}
// Differentiate the compactified position with respect to global time.
export function mapVelocity(X,U){
 const spatial=X.slice(2),a=Math.hypot(1,...spatial),radial=spatial.reduce((sum,x,i)=>sum+x*U[i+2],0)/a;
 const timeRate=(X[0]*U[1]-X[1]*U[0])/(a*a);
 return spatial.map((x,i)=>(U[i+2]-x*radial/(a+1))/((a+1)*timeRate));
}

// A complete geodesic orbit has a fixed shape and repeats every 2π of global
// time. Cache its compactified 3D polyline; only the ship marker moves each tick.
const orbitCache=new WeakMap();
export function orbitPolyline(ship,segments=90){
 const cached=orbitCache.get(ship);
 if(cached&&cached.A===ship.A&&cached.B===ship.B&&cached.segments===segments)return cached.points;
 const points=new Float64Array((segments+1)*3);
 for(let j=0;j<=segments;j++){
  const X=geodesicAt(ship,TAU*j/segments).X,r=Math.hypot(X[2],X[3],X[4]),factor=1/(Math.hypot(1,r)+1);
  for(let i=0;i<3;i++)points[j*3+i]=X[i+2]*factor;
 }
 orbitCache.set(ship,{A:ship.A,B:ship.B,segments,points});return points;
}
