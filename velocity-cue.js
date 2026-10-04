import {dot,staticFrame} from './physics.js?v=21';
import {rocketPoint} from './chase.js?v=15';

// Motion relative to the local static observer, expressed in the rocket's
// orthonormal rest-frame axes. U itself has no spatial part in that frame.
export function velocityDirection(p){
 const {T}=staticFrame(p.X),gamma=Math.max(1,-dot(p.U,T));
 const components=[p.R,p.V,p.F].map(e=>-dot(T,e)),length=Math.hypot(...components);
 if(length<1e-5)return null;
 return {direction:components.map(v=>v/length),beta:Math.sqrt(1-1/(gamma*gamma))};
}

export function velocityCue(p,width,height,observer=null){
 const motion=velocityDirection(p);if(!motion)return null;
 const [dx,dy,dz]=motion.direction,front=dz>.02;
 if(observer){
  const origin=[0,.012,0],end=origin.map((v,i)=>v+.07*motion.direction[i]);
  const project=local=>{const view=rocketPoint(p,observer,local);if(!view||view.dir[2]<=.005)return null;return [width/2+view.dir[0]/view.dir[2]/1.4*height,height/2-view.dir[1]/view.dir[2]/1.4*height]};
  const start=project(origin),tip=project(end);
  if(start&&tip){
   const vx=tip[0]-start[0],vy=tip[1]-start[1],length=Math.hypot(vx,vy);
   const angle=length>1e-8?Math.atan2(vy,vx):dz<0?Math.PI/2:-Math.PI/2;
   const extent=Math.max(36,Math.min(66,length));
   return {...motion,tailX:start[0],tailY:start[1],x:start[0]+Math.cos(angle)*extent,y:start[1]+Math.sin(angle)*extent,angle,aft:dz<0,attached:true};
  }
 }
 const marginX=Math.min(66,width*.25),marginY=Math.min(96,height*.25);
 let x=front?width/2+dx/dz/1.4*height:width/2+Math.atan2(dx,dz)*height;
 let y=front?height/2-dy/dz/1.4*height:height/2-Math.asin(Math.max(-1,Math.min(1,dy)))*height;
 // An exactly aft heading has no left/right bearing: use the lower rim.
 if(!front&&Math.hypot(dx,dy)<1e-8){x=width/2;y=height}
 x=Math.max(marginX,Math.min(width-marginX,x));y=Math.max(marginY,Math.min(height-marginY,y));
 const angle=Math.hypot(x-width/2,y-height/2)>1?Math.atan2(y-height/2,x-width/2):-Math.PI/2;
 return {...motion,x,y,tailX:x-30*Math.cos(angle),tailY:y-30*Math.sin(angle),angle,aft:dz<0,attached:false};
}
