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
