import {MU,HORIZON,length,unit,plus,times,dot3,staticFrame,inner} from './schwarzschild.js?v=36';
import {hullAtlas} from './hull-atlas.js?v=32';
import {hullRootsGLSL,hullPaintGLSL,shiftGLSL,displayGLSL,createStarField} from './flight-visuals.js?v=37';
const vertex=`#version 300 es
in vec2 position;out vec2 uv;void main(){uv=position;gl_Position=vec4(position,0,1);}`;
const fragment=`#version 300 es
precision highp float;precision highp int;
in vec2 uv;out vec4 color;
uniform vec3 eye;uniform vec4 U,R,V,F;uniform float aspect,now;uniform bool grid;
uniform int count,steps;uniform sampler2D ships,stars,hullGeometry;
const float mu=.32,rh=${HORIZON.toFixed(12)},PI=3.141592653589793;
const int hullCounts[6]=int[6](${hullAtlas.counts.join(',')});
const int hullOffsets[6]=int[6](${hullAtlas.offsets.join(',')});
${hullRootsGLSL}
${hullPaintGLSL}
${shiftGLSL}
${displayGLSL}
float G(float u){return 1.+u*u-mu*u*u*u;}
vec3 boundaryColor(vec3 n,float energy){
 vec2 p=vec2(atan(n.z,n.x)/(2.*PI)+.5,acos(clamp(n.y,-1.,1.))/PI);
 float gain=1./max(energy,.00001);vec3 c=vec3(.006,.011,.025)+shifted(texture(stars,p).rgb,gain)*clamp(pow(gain,.8),.14,2.5);
 vec2 gridUv=p*vec2(16,8),aa=max(fwidth(gridUv),vec2(.00001)),line=(.5-abs(fract(gridUv)-.5))/aa;
 float g=1.-smoothstep(.35,1.3,min(line.x,line.y));if(grid)c+=vec3(.028,.070,.115)*g;
 return c;
}
// Short numerical ray segments against the same ellipsoid hulls as level 1.
// Orbital-radius bins keep the expensive geometry tests near relevant ships.
struct HullHit{vec3 q;vec3 local;vec3 radii;vec3 direction;float size;float hue;float gain;int kind;int part;};
bool hitShip(vec3 a,vec3 z,float ta,float tz,float ua,float uz,float impact,float energy,out HullHit hit){
 float low=min(ua,uz),high=max(ua,uz),best=2.;bool found=false;
 const float radii[8]=float[8](.85,1.1,1.5,2.2,3.5,5.,10.,20.);
 for(int band=0;band<8;band++){float shell=radii[band],margin=.30*sqrt(1.+shell*shell-mu/shell)/(shell*shell);if(1./shell<low-margin||1./shell>high+margin)continue;
  for(int k=0;k<8;k++){int j=band+8*k;if(j>=count)break;vec4 data=texelFetch(ships,ivec2(0,j),0);float r=data.x;if(r<=0.)continue;
   vec4 aa=texelFetch(ships,ivec2(1,j),0),bb=texelFetch(ships,ivec2(2,j),0);float omega=sqrt(1.+mu/(2.*r*r*r));
   float pa=data.y+omega*ta,pz=data.y+omega*tz;vec3 sa=r*(aa.xyz*cos(pa)+bb.xyz*sin(pa)),sz=r*(aa.xyz*cos(pz)+bb.xyz*sin(pz));
   vec3 q=a-sa,d=z-sz-q;float ff=clamp(-dot(q,d)/max(1e-14,dot(d,d)),0.,1.);
   vec3 radial=normalize(mix(sa,sz,ff)),tangent=normalize(-aa.xyz*sin(mix(pa,pz,ff))+bb.xyz*cos(mix(pa,pz,ff))),right=normalize(cross(tangent,radial));float f=1.+r*r-mu/r;
   vec3 origin=vec3(dot(q,right),dot(q,radial)/sqrt(f),dot(q,tangent)),direction=vec3(dot(d,right),dot(d,radial)/sqrt(f),dot(d,tangent));int kind=int(data.w);float dd=dot(direction,direction);if(dd<1e-20)continue;float nearest=clamp(-dot(origin,direction)/dd,0.,1.);vec3 close=origin+nearest*direction;const float bounds[4]=float[4](.065,.115,.13,.145);float bound=bounds[kind]*data.z;if(dot(close,close)>bound*bound)continue;
   for(int piece=0;piece<6;piece++){if(piece>=hullCounts[kind])break;int row=hullOffsets[kind]+piece;vec3 rr=texelFetch(hullGeometry,ivec2(0,row),0).xyz*data.z,cc=texelFetch(hullGeometry,ivec2(1,row),0).xyz*data.z;
    vec2 roots=hullRoots(origin,direction,cc,rr);
    for(int root=0;root<2;root++){float at=roots[root];if(at<0.||at>1.||at>=best)continue;best=at;found=true;vec3 point=origin+at*direction;
     hit.q=point;hit.local=point-cc;hit.radii=rr;hit.direction=direction;hit.size=data.z;hit.hue=aa.w;hit.kind=kind;hit.part=piece;
     vec3 normal=cross(a,z),wave=length(normal)>1e-10?normalize(cross(normal,radial)):vec3(0);float emitted=energy/sqrt(1.-1.5*mu/r)*(1.+impact*omega*dot(wave,tangent)),gain=1./max(.0001,emitted);
     hit.gain=gain;
    }
   }
  }
 }return found;
}
void main(){
 vec2 screen=uv*vec2(aspect,1.)*.5;vec3 d=normalize(vec3(screen*1.4,1));vec4 K=-U+d.x*R+d.y*V+d.z*F;float r=length(eye),f=1.+r*r-mu/r;vec3 n=eye/r;float kr=dot(K.yzw,n),energy=-(f*K.x-kr);vec3 angular=K.yzw-kr*n;float b=r*length(angular)/energy;vec3 e=length(angular)>1e-8?normalize(angular):normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
 float u=1./r,p=-kr/energy,phi=0.,delay=0.;vec3 scene=vec3(.003,.006,.012),boundary=n;int bounces=0;bool boundarySeen=false,hullSeen=false;HullHit hit;
 for(int i=0;i<512;i++){if(i>=steps)break;if(u>1./(rh*1.006))break;
  float h=.05/(1.+.25*mu*u*u+.4*b),a1=b*b*(-u+1.5*mu*u*u),u2=u+.5*h*p,p2=p+.5*h*a1,a2=b*b*(-u2+1.5*mu*u2*u2),u3=u+.5*h*p2,p3=p+.5*h*a2,a3=b*b*(-u3+1.5*mu*u3*u3),u4=u+h*p3,p4=p+h*a3,a4=b*b*(-u4+1.5*mu*u4*u4);
  float nextU=u+h*(p+2.*p2+2.*p3+p4)/6.,nextP=p+h*(a1+2.*a2+2.*a3+a4)/6.,nextPhi=phi+h*b;
  float nextDelay=delay+h*(1./max(.00005,G(u))+2./max(.00005,G(u2))+2./max(.00005,G(u3))+1./max(.00005,G(u4)))/6.;
  bool wrapped=nextU<0.;if(wrapped){float fraction=u/max(1e-9,u-nextU);if(!boundarySeen){boundary=n*cos(mix(phi,nextPhi,fraction))+e*sin(mix(phi,nextPhi,fraction));boundarySeen=true;}nextU=-nextU;nextP=-nextP;bounces++;}
  if(!wrapped&&u>.0001&&nextU>.0001&&bounces<3){vec3 a=(n*cos(phi)+e*sin(phi))/u,z=(n*cos(nextPhi)+e*sin(nextPhi))/nextU;
   if(hitShip(a,z,now-delay,now-nextDelay,u,nextU,b,energy,hit)){hullSeen=true;break;}}
  u=nextU;p=nextP;phi=nextPhi;delay=nextDelay;if(bounces>=3)break;
 }
 // Derivatives for the grid/mipmaps are evaluated after the varying ray loop.
 vec3 sky=boundaryColor(boundary,energy);if(!hullSeen&&boundarySeen)scene=sky;
 if(hullSeen){vec3 hull=hullPaint(hit.kind,hit.part,hit.q,hit.local,hit.radii,hit.direction,hit.size,hit.hue,false,vec3(0),0.);scene=shifted(hull,hit.gain)*clamp(pow(hit.gain,.8),.25,2.);}
 color=vec4(arcadeDisplay(scene,screen,gl_FragCoord.xy),1);
}`;
export class BlackHoleRenderer{
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL 2 is required');const debug=this.gl.getExtension('WEBGL_debug_renderer_info');this.software=!!debug&&/SwiftShader|llvmpipe|Software|softpipe/i.test(this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));this.autoWidth=this.software?160:360;this.slowFrames=0;this.fastFrames=0;this.initialize()}
 initialize(){this.fence=null;const gl=this.gl;const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);this.locations={};for(const key of ['eye','U','R','V','F','aspect','now','grid','count','steps','ships','stars','hullGeometry'])this.locations[key]=gl.getUniformLocation(this.program,key);
 this.shipTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shipTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,3,64,0,gl.RGBA,gl.FLOAT,new Float32Array(3*64*4));gl.uniform1i(this.locations.ships,0);
 const stars=createStarField(Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE)));this.starTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.starTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,stars);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(this.locations.stars,1);
 this.hullTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.hullTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,2,hullAtlas.rows,0,gl.RGBA,gl.FLOAT,hullAtlas.data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.uniform1i(this.locations.hullGeometry,2);this.ready=true;
 }
 isComplete(){if(!this.fence)return true;const s=this.gl.clientWaitSync(this.fence,0,0);return s===this.gl.ALREADY_SIGNALED||s===this.gl.CONDITION_SATISFIED}
 draw(p,fleet,{grid=true,quality='auto'}={}){const gl=this.gl;if(this.fence){const status=gl.clientWaitSync(this.fence,0,0);if(status===gl.TIMEOUT_EXPIRED)return false;gl.deleteSync(this.fence);this.fence=null;const elapsed=performance.now()-this.submittedAt;this.slowFrames=elapsed>100&&elapsed<1000?this.slowFrames+1:0;this.fastFrames=elapsed<45?this.fastFrames+1:0;if(this.slowFrames>=3){this.autoWidth=Math.max(160,Math.floor(this.autoWidth*.8));this.slowFrames=0}if(this.fastFrames>=90&&!this.software){this.autoWidth=Math.min(360,this.autoWidth+24);this.fastFrames=0}}gl.useProgram(this.program);const box=this.canvas.getBoundingClientRect(),w=quality==='auto'?this.autoWidth:this.software?(quality==='high'?320:160):(quality==='high'?600:260),scale=Math.min(1,w/Math.max(1,box.width));const width=Math.max(1,Math.round(box.width*scale)),height=Math.max(1,Math.round(box.height*scale));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height}gl.viewport(0,0,width,height);const data=new Float32Array(3*64*4);fleet.forEach(s=>{const i=s.slot;data.set([Number.isFinite(s.deathTime)?-1:s.r,s.phase,s.size,s.kind],i*12);data.set([...s.A,(s.slot*.61803398875)%1],i*12+4);data.set([...s.B,0],i*12+8)});gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shipTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,3,64,gl.RGBA,gl.FLOAT,data);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.starTexture);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.hullTexture);for(const k of ['U','R','V','F'])gl.uniform4fv(this.locations[k],p[k]);gl.uniform3fv(this.locations.eye,p.x);gl.uniform1f(this.locations.aspect,box.width/Math.max(1,box.height));gl.uniform1f(this.locations.now,p.t);gl.uniform1i(this.locations.grid,grid);gl.uniform1i(this.locations.count,64);gl.uniform1i(this.locations.steps,quality==='high'?384:224);gl.drawArrays(gl.TRIANGLES,0,3);this.submittedAt=performance.now();this.fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();return true}
 project(p,point){const x=p.x,delta=plus(point,x,-1),r=length(x),n=unit(x),f=1+r*r-MU/r,spatial=plus(delta,n,(1/Math.sqrt(f)-1)*dot3(delta,n)),distance=length(spatial),local=unit(spatial),{T,E}=staticFrame(x),K=E.reduce((v,e,i)=>plus(v,e,local[i]),times(T,-1)),den=inner(x,K,p.F),box=this.canvas.getBoundingClientRect();if(den<=.001)return null;return {x:box.width*(.5+inner(x,K,p.R)/den/(1.4*box.width/box.height)),y:box.height*(.5-inner(x,K,p.V)/den/1.4),distance}}
}
