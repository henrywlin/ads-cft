import {dot,staticFrame} from './physics.js?v=21';

// Motion relative to the local static observer, expressed in the rocket's
// orthonormal rest-frame axes. U itself has no spatial part in that frame.
export function velocityDirection(p){
 const {T}=staticFrame(p.X),gamma=Math.max(1,-dot(p.U,T));
 const components=[p.R,p.V,p.F].map(e=>-dot(T,e)),length=Math.hypot(...components);
 if(length<1e-5)return null;
 return {direction:components.map(v=>v/length),beta:Math.sqrt(1-1/(gamma*gamma))};
}

export function velocityCue(p,width,height){
 const motion=velocityDirection(p);if(!motion)return null;
 const [dx,dy,dz]=motion.direction,front=dz>.02;
 const marginX=Math.min(34,width*.2),marginY=Math.min(96,height*.25);
 let x=front?width/2+dx/dz/1.4*height:width/2+Math.atan2(dx,dz)*height;
 let y=front?height/2-dy/dz/1.4*height:height/2-Math.asin(Math.max(-1,Math.min(1,dy)))*height;
 // An exactly aft heading has no left/right bearing: use the lower rim.
 if(!front&&Math.hypot(dx,dy)<1e-8){x=width/2;y=height}
 x=Math.max(marginX,Math.min(width-marginX,x));y=Math.max(marginY,Math.min(height-marginY,y));
 const angle=Math.hypot(x-width/2,y-height/2)>1?Math.atan2(y-height/2,x-width/2):-Math.PI/2;
 return {...motion,x,y,angle,aft:dz<0};
}
