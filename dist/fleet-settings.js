import {makeFleet} from './physics.js?v=32';

export const shipCounts=[2,12,24,48];
export const defaultShipCount=24;

// Reuse the same worldlines across settings. The two distant circular orbiters
// stay present even at the minimum; changing density never moves another ship.
export function makeTrafficRoster(){
 const all=makeFleet(),ordinary=all.filter(s=>!s.boundaryOrbit),outer=all.filter(s=>s.boundaryOrbit);
 return {all,ships(count){
  if(!shipCounts.includes(count))throw Error('Unknown ship count');
  return [...ordinary.slice(0,count-outer.length),...outer];
 }};
}
