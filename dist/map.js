import {geodesicAt,TAU} from './physics.js?v=21';
// Stereographic radius in the conformal ball, normalized to its boundary.
// A 2D projection drops a coordinate: its plotted radius is a lower bound.
export const compactRadius=r=>r/(Math.hypot(1,r)+1);
export function mapCoordinates(X,axes=[0,2]){
 const spatial=X.slice(2),r=Math.hypot(...spatial),factor=1/(Math.hypot(1,r)+1);
 return {point:axes.map(i=>spatial[i]*factor),radius:r,compact:compactRadius(r)};
}
// A projection can hide radial distance along its omitted axis. This separate
// gauge uses the full 3D position, on exactly the same scale as the map rings.
export function mapRadiusGauge(X){
 const radius=Math.hypot(...X.slice(2));
 return {radius,compact:compactRadius(radius),ticks:[0,1,3,10].map(r=>({radius:r,compact:compactRadius(r)}))};
}
function mapTangent(X,W){
 const spatial=X.slice(2),a=Math.hypot(1,...spatial),radial=spatial.reduce((sum,x,i)=>sum+x*W[i+2],0)/a;
 return spatial.map((x,i)=>(W[i+2]-x*radial/(a+1))/(a+1));
}
// Differentiate the compactified position with respect to global time.
export function mapVelocity(X,U){
 const a=Math.hypot(1,...X.slice(2)),timeRate=(X[0]*U[1]-X[1]*U[0])/(a*a);
 return mapTangent(X,U).map(v=>v/timeRate);
}
export function mapVectors(p){
 const {X,U,F}=p,a=Math.hypot(1,...X.slice(2));
 // Undo the stereographic scale: the vector's norm is the optical/global
 // speed beta, matching the Global velocity gauge at every radius.
 const velocity=mapVelocity(X,U).map(v=>v*(a+1)/a),speed=Math.hypot(...velocity);
 // Locate the nose on the same global-time slice as the ship marker. F is
 // simultaneous in the moving ship frame, so its time component matters.
 const ratio=(X[0]*F[1]-X[1]*F[0])/(X[0]*U[1]-X[1]*U[0]);
 const tangent=mapTangent(X,F.map((v,i)=>v-ratio*U[i])),length=Math.hypot(...tangent);
 const nose=tangent.map(v=>v/length);
 return {velocity,nose,speed};
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
