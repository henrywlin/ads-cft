import {seeded,TAU} from './physics.js?v=21';
import {engineNozzles} from './ship-upgrades.js?v=29';

// Shared presentation for both metrics; these routines do not advance physics.
export const hullRootsGLSL=` vec2 hullRoots(vec3 origin,vec3 dir,vec3 center,vec3 radii){
   vec3 o=(origin-center)/radii,d=dir/radii;
   float dl=length(d);vec3 unitD=d/dl;
   float b=dot(o,unitD);vec3 transverse=cross(o,unitD);
   float disc=1.0-dot(transverse,transverse);
   if(disc<0.0)return vec2(1e25);
   float root=sqrt(disc);
   return vec2((-b-root)/dl,(-b+root)/dl);
 }
`;

export const shiftGLSL=` vec3 shifted(vec3 color,float g){
   float z=clamp(log(max(g,0.0001)),-3.0,3.0);
   // Display response to the exact frequency ratio; broadband colors are stylized.
   return color*vec3(exp(-1.10*z),exp(-.12*abs(z)),exp(1.10*z));
 }
`;

export const hullPaintGLSL=`vec3 hullPaint(int kind,int part,vec3 q,vec3 local,vec3 radii,vec3 nc,float size,float hue,bool own,vec3 playerColor,float engineBurn){
 vec3 normal=normalize(local/(radii*radii));
   float lighting=.22+.7*max(0.0,dot(normal,normalize(vec3(-.7,1.0,.3))));
   vec3 base=kind==4?vec3(.72,.80,.85):kind==1?vec3(.82,.80,.72):kind==2?vec3(.37,.32,.25):kind==3?vec3(.67,.73,.79):mix(vec3(.31,.39,.47),vec3(.57,.62,.67),hue);
   if(own)base=playerColor;
   vec3 hull=base*lighting;
   float edge=pow(1.0-abs(dot(normal,normalize(nc))),2.0);
   hull+=vec3(.04,.20,.28)*edge;
   if(kind==5){
    // Swept interceptor: pilot-colored body, metallic fins and two hot engines.
    hull=mix(vec3(.12,.19,.25),playerColor,.65)*lighting;
    if(part==1||part==5||part==6){hull=vec3(.70,.76,.82)*lighting;if(abs(local.x)>radii.x*.72)hull=vec3(.14,.85,1.0)*1.3;}
    if(part==7)hull=vec3(.14,.52,.90)*1.4+vec3(.20,.10,.36)*edge;
    if(part==3||part==4){hull=vec3(.32,.42,.51)*lighting;if(local.z<-radii.z*.78)hull=mix(vec3(.10,.20,.35),vec3(.25,.70,1.0)*2.2,engineBurn);}
    if(part==8)hull=vec3(.95,.64,.24)*lighting;
    if(part==0&&abs(local.x)>.012*size)hull+=vec3(.30,.19,.06);
   }else if(kind==0){
    if(part==0&&local.z>radii.z*.36&&abs(local.x)<radii.x*.7)hull=vec3(.10,.55,.72)*(.7+.3*lighting);
    if(part==0&&local.z<-radii.z*.79)hull=own?mix(vec3(.05,.07,.09),vec3(1.0,.48,.12)*1.8,engineBurn):vec3(1.0,.39,.11)*1.4;
    if(part==1&&abs(local.x)>radii.x*.82)hull=vec3(.25,.94,.98);
   }else if(kind==1){
    if(part==0&&abs(local.y)<radii.y*.16&&local.z>0.0)hull=vec3(.045,.13,.18);
    if(part==2&&local.z<-radii.z*.8)hull=vec3(.28,.57,1.0);
   }else if(kind==2){
    if(part==0&&local.z>radii.z*.85)hull=vec3(.015,.020,.026);
    if(part==0&&abs(local.y)<.002*size&&abs(local.z)<.085*size)hull=vec3(.42,.32,.10);
   }else if(kind==4){
    // Pearl-metal crowns, gold seams, luminous windows and violet drive petals.
    float angle=atan(q.y,q.x),radial=length(q.xy);
    float panels=step(.86,fract(angle*24.0/PI+q.z*110.0));
    hull=mix(hull,vec3(.86,.54,.18)*(.6+lighting),panels*.75);
    if(part<32){
     float windows=step(.35,fract(angle*56.0/PI));
     if(abs(local.z)<radii.z*.6&&windows>.5)hull=vec3(.15,.86,1.0)*1.6;
     if(radial<(part<16?.144:.110))hull=vec3(.30,.95,1.0)*1.8;
     if(local.z>radii.z*.83)hull+=vec3(.14,.20,.26);
    }else if(part<40){hull+=vec3(.18,.48,.56)*.7;}
    else{
     if(local.z<-.115)hull=vec3(.52,.26,1.0)*2.0;
     if(abs(local.x)<.009&&abs(local.y)<.009&&local.z>.11)hull=vec3(1.0,.74,.32)*1.8;
    }
   }else{
    if((part==2||part==3)&&local.z>radii.z*.77)hull=vec3(1.0,.19,.10);
    if((part==2||part==3)&&abs(local.x)>radii.x*.65)hull=vec3(.15,.46,1.0);
    if(part==0&&abs(local.y)<.004*size&&local.z>.018*size)hull=vec3(.25,.45,.63);
   }
 return hull;
}
`;

export const displayGLSL=`vec3 arcadeDisplay(vec3 color,vec2 screen,vec2 pixel){
 float vignette=1.0-.27*pow(length(screen)/1.1,1.4);
 color*=max(.55,vignette);
 vec3 displayColor=pow(color,vec3(.85));
 float dither=mod(floor(pixel.x)+2.0*floor(pixel.y),4.0)/4.0;
 return floor(clamp(displayColor,0.0,1.0)*63.0+dither)/63.0;
}
`;

export function createStarField(width=2048){
  const sky=document.createElement('canvas');sky.width=width;sky.height=sky.width/2;const ctx=sky.getContext('2d'),rand=seeded(914982);
  ctx.fillStyle='#000';ctx.fillRect(0,0,sky.width,sky.height);
  for(let i=0;i<6000;i++){
   // cos(theta), not theta, is uniform: these are uniform points on S².
   const cosTheta=rand()*2-1,x=rand()*sky.width,y=Math.acos(cosTheta)/Math.PI*sky.height,b=rand(),r=(b>.995?2.8:b>.96?1.7:.45+rand()*.65)*sky.width/4096;
   const palette=rand(),color=palette<.13?'255,180,135':palette>.76?'143,192,255':'210,228,255';
   for(const xx of [x-sky.width,x,x+sky.width]){
    if(r>1.4){const glow=ctx.createRadialGradient(xx,y,0,xx,y,r*5);glow.addColorStop(0,`rgba(${color},.7)`);glow.addColorStop(.2,`rgba(${color},.22)`);glow.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=glow;ctx.fillRect(xx-r*5,y-r*5,r*10,r*10)}
    ctx.beginPath();ctx.arc(xx,y,r,0,TAU);ctx.fillStyle=`rgba(${color},${.38+rand()*.62})`;ctx.fill();
   }
  }
 return sky;
}

export function paintEnginePlume(ctx,{project,level:engineLevel,mode:engineMode,exhaust,ship={},time:effectTime}){
 if(engineLevel<.015)return;
 const flicker=.86+.1*Math.sin(effectTime*81)+.06*Math.sin(effectTime*137),length=(.012+.045*engineLevel)*flicker;
 const nozzles=engineNozzles(ship,engineMode,exhaust);
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
 for(const origin of nozzles){
  const start=project(origin),end=project(origin.map((v,i)=>v+exhaust[i]*length));if(!start||!end)continue;
  const span=Math.hypot(end[0]-start[0],end[1]-start[1]),radius=Math.min(22,Math.max(3,span*.16));
  const glow=ctx.createRadialGradient(...start,0,...start,radius*2.8);glow.addColorStop(0,'#fff5d3');glow.addColorStop(.3,'#ffb64d99');glow.addColorStop(1,'#ff842000');ctx.fillStyle=glow;ctx.fillRect(start[0]-radius*3,start[1]-radius*3,radius*6,radius*6);
  const dx=end[0]-start[0],dy=end[1]-start[1],nx=-dy/Math.max(.001,span),ny=dx/Math.max(.001,span);
  for(const [thickness,fraction,head,tail] of [[radius,.98,'#ff7b32cc','#ff501000'],[radius*.57,.85,'#ffde87','#ff8c3000'],[radius*.23,.65,'#fffef4','#ffdb8600']]){
   const tip=[start[0]+dx*fraction,start[1]+dy*fraction],gradient=ctx.createLinearGradient(...start,...tip);gradient.addColorStop(0,head);gradient.addColorStop(.45,head);gradient.addColorStop(1,tail);ctx.fillStyle=gradient;ctx.shadowColor='#ff9239';ctx.shadowBlur=radius;
   ctx.beginPath();ctx.moveTo(start[0]+nx*thickness,start[1]+ny*thickness);ctx.quadraticCurveTo(start[0]+dx*.35+nx*thickness*.65,start[1]+dy*.35+ny*thickness*.65,...tip);ctx.quadraticCurveTo(start[0]+dx*.35-nx*thickness*.65,start[1]+dy*.35-ny*thickness*.65,start[0]-nx*thickness,start[1]-ny*thickness);ctx.closePath();ctx.fill();
  }
  ctx.shadowBlur=0;
  for(let j=0;j<24;j++){
   const age=(effectTime*(1.5+engineLevel)+j*.6180339)%1,spread=.002+age*.012;
   const point=project(origin.map((v,i)=>v+exhaust[i]*length*(.3+age*1.5)+(i<2?Math.sin(j*17.3+i*7)*spread:0)));if(!point)continue;
   ctx.globalAlpha=engineLevel*(1-age)**2;ctx.fillStyle=j%3?'#ffb761':'#fff2ad';const r=.7+(1-age)*1.4;ctx.fillRect(point[0]-r,point[1]-r,r*2,r*2);
  }
  ctx.globalAlpha=1;
 }
 ctx.restore();
}

export function paintExplosion(ctx,{x,y,age,extent=100,width,height,seed=2301}){
 if(x<-250||x>width+250||y<-250||y>height+250)return;
 const r=extent*(.25+1.35*Math.sqrt(age)),fade=Math.pow(1-age,1.4);
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=fade;
 const glow=ctx.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,'#fffbe6');glow.addColorStop(.15,'#fff0a0');glow.addColorStop(.4,'#ff742acc');glow.addColorStop(1,'#ff321000');ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);
 ctx.strokeStyle='#ffcd7c';ctx.lineWidth=3*(1-age)+1;ctx.beginPath();ctx.ellipse(x,y,r*.9,r*.4,0,0,TAU);ctx.stroke();
 const rand=seeded(seed);
 for(let j=0;j<42;j++){
  const theta=rand()*TAU,travel=r*(.35+rand()*.85),xx=x+Math.cos(theta)*travel,yy=y+Math.sin(theta)*travel,px=3+rand()*7*(1-age);
  ctx.strokeStyle=j%3?'#ff8539':'#fff3b5';ctx.lineWidth=px*.55;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx-Math.cos(theta)*px*3,yy-Math.sin(theta)*px*3);ctx.stroke();ctx.fillStyle=j%3?'#ffb954':'#fffbe1';ctx.fillRect(xx-px/2,yy-px/2,px,px);
 }
 if(age<.12){ctx.globalAlpha=(1-age/.12)*.13;ctx.fillStyle='#ffbc6b';ctx.fillRect(0,0,width,height)}ctx.restore();
}

export function paintLaserTrail(ctx,{points,x,y,traffic=false,height}){
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
 const glow=traffic?'#35ff9a':'#ff3356';
 for(const [lineWidth,color,blur] of traffic?[[15,'#24ff914d',24],[7,'#50ffa5',16],[2.5,'#effff4',7]]:[[15,'#ff24434d',24],[7,'#ff4a67',16],[2.5,'#fff4ee',7]]){
  ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.shadowBlur=blur;ctx.shadowColor=glow;ctx.beginPath();let previous=null;
  for(const p of points){if(!p){previous=null;continue}if(!previous||Math.hypot(p[0]-previous[0],p[1]-previous[1])>height*.5)ctx.moveTo(...p);else ctx.lineTo(...p);previous=p}ctx.stroke();
 }
 ctx.fillStyle='#fff9ef';ctx.shadowBlur=25;ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.fill();ctx.restore();
}
export function paintMuzzleFlash(ctx,{x,y,age}){
 if(age<0||age>=.24)return;
 ctx.save();ctx.globalAlpha=1-age/.24;ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#ff6179';ctx.lineWidth=6;ctx.shadowBlur=25;ctx.shadowColor='#ff2049';ctx.beginPath();ctx.moveTo(x-26,y);ctx.lineTo(x+26,y);ctx.moveTo(x,y-26);ctx.lineTo(x,y+26);ctx.stroke();ctx.strokeStyle='#fff3e9';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
