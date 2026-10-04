import {dot,add,scale,TAU,hullParts,retarded,rotate,shipBounds} from './physics.js?v=21';

// Match the renderer's past-null-ray intersections, including opaque hulls in
// front of a reflection. The supplied observer/fleet belong to the shown frame.
export function pickShipImage(observer,ships,x,y,width,height){
 if(width<=0||height<=0||x<0||y<0||x>width||y>height)return null;
 const screen=[(x-width/2)/height*1.4,(height/2-y)/height*1.4,1],length=Math.hypot(...screen);
 let K=scale(observer.U,-1);[observer.R,observer.V,observer.F].forEach((e,i)=>K=add(K,e,1,screen[i]/length));
 let nearest=null;
 for(const ship of ships){
  const origin=ship.C.map(e=>dot(observer.X,e)),direction=ship.C.map(e=>dot(K,e));
  for(const [radii,center] of ship.parts??hullParts(ship.kind))for(const eta of ship.own?[1]:[1,-1]){
   const o=origin.map((v,i)=>(eta*v-center[i]*ship.size)/(radii[i]*ship.size));
   const d=direction.map((v,i)=>eta*v/(radii[i]*ship.size)),length=Math.hypot(...d);
   if(!Number.isFinite(length)||length===0)continue;
   const n=d.map(v=>v/length),b=o.reduce((sum,v,i)=>sum+v*n[i],0);
   const cross=[o[1]*n[2]-o[2]*n[1],o[2]*n[0]-o[0]*n[2],o[0]*n[1]-o[1]*n[0]],disc=1-cross.reduce((sum,v)=>sum+v*v,0);
   if(disc<0)continue;
   for(const mu of [(-b-Math.sqrt(disc))/length,(-b+Math.sqrt(disc))/length]){
    if(!Number.isFinite(mu)||(ship.own&&mu<=.00001))continue;
    const t=Math.atan2(eta*(observer.X[1]+mu*K[1]),eta*(observer.X[0]+mu*K[0]));
    const delay=((Math.atan2(observer.X[1],observer.X[0])-t)%TAU+TAU)%TAU;
    if(delay<.00001||delay>=(nearest?.delay??Infinity))continue;
    if(Number.isFinite(ship.deathTime)&&observer.t-delay>=ship.deathTime)continue;
    nearest={ship,reflected:eta===-1,delay};
   }
  }
 }
 return nearest;
}

// Rotate only the spatial tetrad: position, velocity and both clocks are intact.
export function faceDirectImage(player,ship){
 const view=retarded(ship,player);if(!view||!view.dir.every(Number.isFinite))return false;
 const [x,y,z]=view.dir;rotate(player,Math.atan2(x,z),Math.atan2(y,Math.hypot(x,z)),0);return true;
}

export function directImageBox(ship,observer,width,height){
 const view=retarded(ship,observer);if(!view||view.dir[2]<=.03)return null;
 const [bx,by,radius]=shipBounds(ship,observer,0,false),padding=6;
 const x=width/2+bx*height,y=height/2-by*height,half=Math.max(12,radius*height+padding);
 if(x+half<0||y+half<0||x-half>width||y-half>height)return null;
 const left=Math.max(3,x-half),top=Math.max(3,y-half),right=Math.min(width-3,x+half),bottom=Math.min(height-3,y+half);
 if(right<=left||bottom<=top)return null;
 return {left,top,width:right-left,height:bottom-top};
}
