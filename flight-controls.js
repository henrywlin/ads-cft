import {dot,staticFrame} from './physics.js?v=15';
// Exhaust is always the negative of the proper-acceleration direction.
export function burnCommand(p,forward,reverse,braking,accel){
 const signed=Number(forward)-Number(reverse),force=[0,0,0];let thrust=0,brake=false,mode='forward';
 if(braking){
  mode='brake';const {T}=staticFrame(p.X),components=[p.R,p.V,p.F].map(e=>dot(T,e)),speed=Math.hypot(...components);
  if(speed>1e-8){brake=accel;for(let i=0;i<3;i++)force[i]=components[i]/speed*accel}
 }else if(signed){thrust=signed*accel;force[2]=thrust;mode=signed>0?'forward':'reverse'}
 const magnitude=Math.hypot(...force),exhaust=magnitude?force.map(v=>-v/magnitude):[0,0,-1];
 return {thrust,brake,force,exhaust,mode,level:magnitude/3};
}
