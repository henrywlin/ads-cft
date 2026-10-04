// Stereographic radius in the conformal ball, normalized to its boundary.
// A 2D projection drops a coordinate: its plotted radius is a lower bound.
export const compactRadius=r=>r/(Math.hypot(1,r)+1);
export function mapCoordinates(X,axes=[0,2]){
 const spatial=X.slice(2),r=Math.hypot(...spatial),factor=1/(Math.hypot(1,r)+1);
 return {point:axes.map(i=>spatial[i]*factor),radius:r,compact:compactRadius(r)};
}
