import {hullParts} from './physics.js?v=21';
import {centralHull} from './docking.js?v=26';
import {interceptorHull,cannonHull} from './ship-upgrades.js?v=29';

// Upload immutable hull geometry once. Each part occupies two RGBA texels:
// radii followed by center. These are the same ellipsoids used for collisions.
const shapes=[hullParts(0),hullParts(1),hullParts(2),hullParts(3),centralHull,interceptorHull];
const offsets=[],counts=shapes.map(parts=>parts.length),parts=[];
for(const shape of shapes){offsets.push(parts.length);parts.push(...shape)}
const cannonOffset=parts.length;parts.push(...cannonHull);
const data=new Float32Array(parts.length*8);
parts.forEach(([r,c],i)=>{data.set(r,i*8);data.set(c,i*8+4)});
export const hullAtlas={data,offsets,counts,cannonOffset,rows:parts.length,cannonParts:cannonHull.length};
