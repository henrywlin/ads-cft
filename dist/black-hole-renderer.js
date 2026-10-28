import {MU,HORIZON,length,unit,plus,times,dot3,staticFrame,inner} from './schwarzschild.js?v=36';
const vertex=`#version 300 es
in vec2 position;out vec2 uv;void main(){uv=position;gl_Position=vec4(position,0,1);}`;
const fragment=`#version 300 es
precision highp float;precision highp int;
in vec2 uv;out vec4 color;
uniform vec3 eye;uniform vec4 U,R,V,F;uniform float aspect,now;uniform bool grid;
uniform int count,steps;uniform sampler2D ships,stars;
const float mu=.32,rh=${HORIZON.toFixed(12)},PI=3.141592653589793;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 tint(vec3 c,float g){float z=clamp(log(max(.001,g)),-2.5,2.5);return c*exp(vec3(-.48,-.07,.57)*z)*clamp(pow(g,.8),.2,2.2);}
float G(float u){return 1.+u*u-mu*u*u*u;}
vec3 sky(vec3 n,float energy){vec2 p=vec2(atan(n.z,n.x)/(2.*PI)+.5,acos(clamp(n.y,-1.,1.))/PI);vec3 c=texture(stars,p).rgb;float lines=0.;if(grid){vec2 z=abs(fract(p*vec2(24,12)+.5)-.5);lines=(1.-smoothstep(.004,.014,min(z.x,z.y)))*.026;}return tint(c,1./energy)+vec3(.009,.021,.035)+vec3(.07,.25,.36)*lines;}
// A finite-difference null-worldtube intersection. Each shell test is cheap;
// trigonometry and hull tests run only near that ship's orbital radius.
bool hitShip(vec3 a,vec3 z,float ta,float tz,float ua,float uz,float impact,float energy,out vec3 paint){
 float low=min(ua,uz),high=max(ua,uz),best=2.;bool found=false;
 const float radii[8]=float[8](.85,1.1,1.5,2.2,3.5,5.,10.,20.);
 for(int band=0;band<8;band++){float shell=radii[band],margin=.34/(shell*shell);if(1./shell<low-margin||1./shell>high+margin)continue;
 for(int k=0;k<8;k++){int j=band+8*k;if(j>=count)break;vec4 data=texelFetch(ships,ivec2(0,j),0);float r=data.x;if(r<=0.)continue;
  vec4 aa=texelFetch(ships,ivec2(1,j),0),bb=texelFetch(ships,ivec2(2,j),0);float omega=sqrt(1.+mu/(2.*r*r*r));
  float pa=data.y+omega*ta,pz=data.y+omega*tz;vec3 sa=r*(aa.xyz*cos(pa)+bb.xyz*sin(pa)),sz=r*(aa.xyz*cos(pz)+bb.xyz*sin(pz));
  vec3 q=a-sa,d=z-sz-q;float ff=clamp(-dot(q,d)/max(1e-14,dot(d,d)),0.,1.);vec3 radial=normalize(mix(sa,sz,ff)),tangent=normalize(-aa.xyz*sin(mix(pa,pz,ff))+bb.xyz*cos(mix(pa,pz,ff))),right=normalize(cross(tangent,radial));
  vec3 delta=q+ff*d;float f=1.+r*r-mu/r;vec3 local=vec3(dot(delta,right),dot(delta,radial)/sqrt(f),dot(delta,tangent))/data.z;
  // Original rocket, Discovery spine, carrier, and saucer/nacelle proxies.
  int kind=int(data.w);bool hit=false;vec3 base=vec3(.35,.58,.75);
  if(kind==0)hit=dot(local/vec3(.025,.026,.072),local/vec3(.025,.026,.072))<1.||all(lessThan(abs(local-vec3(0,-.005,-.015)),vec3(.065,.008,.024)));
  if(kind==1)hit=length(local-vec3(0,0,.07))<.037||all(lessThan(abs(local-vec3(0,0,-.025)),vec3(.009,.01,.085)))||length(local-vec3(0,0,-.10))<.03;
  if(kind==2){hit=dot(local/vec3(.065,.052,.15),local/vec3(.065,.052,.15))<1.;base=vec3(.53,.41,.26);}
  if(kind==3)hit=dot((local-vec3(0,.02,.035))/vec3(.078,.012,.055),(local-vec3(0,.02,.035))/vec3(.078,.012,.055))<1.||all(lessThan(abs(local-vec3(0,-.015,-.03)),vec3(.018,.02,.065)))||(abs(abs(local.x)-.06)<.012&&abs(local.y-.007)<.015&&abs(local.z+.065)<.07);
  if(hit&&ff<best){best=ff;found=true;
   paint=base*(.7+.3*clamp(dot(normalize(local+vec3(.001)),normalize(vec3(.3,.8,.5))),0.,1.));
   if(abs(local.x)>.048&&kind==3||kind==0&&local.z>.04)paint=vec3(.15,.9,1.);vec3 normal=cross(a,z),wave=length(normal)>1e-10?normalize(cross(normal,radial)):vec3(0);float emitted=energy/sqrt(1.-1.5*mu/r)*(1.+impact*omega*dot(wave,tangent));paint=tint(paint,1./max(.001,emitted));}
 }}return found;
}
void main(){
 vec3 d=normalize(vec3(uv.x*aspect*1.05,uv.y*1.05,1));vec4 K=-U+d.x*R+d.y*V+d.z*F;float r=length(eye),f=1.+r*r-mu/r;vec3 n=eye/r;float kr=dot(K.yzw,n),energy=-(f*K.x-kr);vec3 angular=K.yzw-kr*n;float b=r*length(angular)/energy;vec3 e=length(angular)>1e-8?normalize(angular):normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
 float u=1./r,p=-kr/energy,phi=0.,delay=0.;vec3 background=vec3(.003,.006,.012);int bounces=0;bool boundarySeen=false;
 for(int i=0;i<512;i++){if(i>=steps)break;if(u>1./(rh*1.006))break;
  float h=.05/(1.+.25*mu*u*u+.4*b),a1=b*b*(-u+1.5*mu*u*u),u2=u+.5*h*p,p2=p+.5*h*a1,a2=b*b*(-u2+1.5*mu*u2*u2),u3=u+.5*h*p2,p3=p+.5*h*a2,a3=b*b*(-u3+1.5*mu*u3*u3),u4=u+h*p3,p4=p+h*a3,a4=b*b*(-u4+1.5*mu*u4*u4);
  float nextU=u+h*(p+2.*p2+2.*p3+p4)/6.,nextP=p+h*(a1+2.*a2+2.*a3+a4)/6.,nextPhi=phi+h*b;
  float nextDelay=delay+h*(1./max(.00005,G(u))+2./max(.00005,G(u2))+2./max(.00005,G(u3))+1./max(.00005,G(u4)))/6.;
  bool wrapped=nextU<0.;if(wrapped){float fraction=u/max(1e-9,u-nextU);vec3 bn=n*cos(mix(phi,nextPhi,fraction))+e*sin(mix(phi,nextPhi,fraction));if(!boundarySeen){background=sky(bn,energy);boundarySeen=true;}nextU=-nextU;nextP=-nextP;bounces++;}
  if(!wrapped&&u>.0001&&nextU>.0001&&bounces<3){vec3 a=(n*cos(phi)+e*sin(phi))/u,z=(n*cos(nextPhi)+e*sin(nextPhi))/nextU,paint;
   if(hitShip(a,z,now-delay,now-nextDelay,u,nextU,b,energy,paint)){color=vec4(paint*.9,1);return;}}
  u=nextU;p=nextP;phi=nextPhi;delay=nextDelay;if(bounces>=3)break;
 }
 float vignette=1.-.13*dot(uv,uv);vec3 c=background*vignette;float dith=(hash(gl_FragCoord.xy)-.5)/52.;c=floor(clamp(pow(c,vec3(.86))+dith,0.,1.)*63.+.5)/63.;c*=.97+.03*cos(gl_FragCoord.y*PI);color=vec4(c,1);
}`;
export class BlackHoleRenderer{
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL 2 is required');const debug=this.gl.getExtension('WEBGL_debug_renderer_info');this.software=!!debug&&/SwiftShader|llvmpipe|Software|softpipe/i.test(this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));this.autoWidth=this.software?160:360;this.slowFrames=0;this.fastFrames=0;this.initialize()}
 initialize(){this.fence=null;const gl=this.gl;const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);this.locations={};for(const key of ['eye','U','R','V','F','aspect','now','grid','count','steps','ships','stars'])this.locations[key]=gl.getUniformLocation(this.program,key);
 this.shipTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shipTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,3,64,0,gl.RGBA,gl.FLOAT,new Float32Array(3*64*4));gl.uniform1i(this.locations.ships,0);
 const stars=document.createElement('canvas');stars.width=2048;stars.height=1024;const c=stars.getContext('2d');c.fillStyle='#010208';c.fillRect(0,0,2048,1024);let seed=76491;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};for(let i=0;i<6000;i++){const x=rand()*2048,y=Math.acos(2*rand()-1)/Math.PI*1024,brightness=.4+.6*rand();c.fillStyle=`rgba(${190+Math.floor(rand()*65)},${200+Math.floor(rand()*55)},255,${brightness})`;c.fillRect(x,y,1.3+rand(),1.3+rand());}this.starTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.starTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,stars);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(this.locations.stars,1);this.ready=true;
 }
 isComplete(){if(!this.fence)return true;const s=this.gl.clientWaitSync(this.fence,0,0);return s===this.gl.ALREADY_SIGNALED||s===this.gl.CONDITION_SATISFIED}
 draw(p,fleet,{grid=true,quality='auto'}={}){const gl=this.gl;if(this.fence){const status=gl.clientWaitSync(this.fence,0,0);if(status===gl.TIMEOUT_EXPIRED)return false;gl.deleteSync(this.fence);this.fence=null;const elapsed=performance.now()-this.submittedAt;this.slowFrames=elapsed>100&&elapsed<1000?this.slowFrames+1:0;this.fastFrames=elapsed<45?this.fastFrames+1:0;if(this.slowFrames>=3){this.autoWidth=Math.max(160,Math.floor(this.autoWidth*.8));this.slowFrames=0}if(this.fastFrames>=90&&!this.software){this.autoWidth=Math.min(360,this.autoWidth+24);this.fastFrames=0}}gl.useProgram(this.program);const box=this.canvas.getBoundingClientRect(),w=quality==='auto'?this.autoWidth:this.software?(quality==='high'?320:160):(quality==='high'?600:260),scale=Math.min(1,w/Math.max(1,box.width));const width=Math.max(1,Math.round(box.width*scale)),height=Math.max(1,Math.round(box.height*scale));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height}gl.viewport(0,0,width,height);const data=new Float32Array(3*64*4);fleet.forEach(s=>{const i=s.slot;data.set([Number.isFinite(s.deathTime)?-1:s.r,s.phase,s.size,s.kind],i*12);data.set([...s.A,0],i*12+4);data.set([...s.B,0],i*12+8)});gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shipTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,3,64,gl.RGBA,gl.FLOAT,data);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.starTexture);for(const k of ['U','R','V','F'])gl.uniform4fv(this.locations[k],p[k]);gl.uniform3fv(this.locations.eye,p.x);gl.uniform1f(this.locations.aspect,box.width/Math.max(1,box.height));gl.uniform1f(this.locations.now,p.t);gl.uniform1i(this.locations.grid,grid);gl.uniform1i(this.locations.count,64);gl.uniform1i(this.locations.steps,quality==='high'?384:224);gl.drawArrays(gl.TRIANGLES,0,3);this.submittedAt=performance.now();this.fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();return true}
 project(p,point){const x=p.x,delta=plus(point,x,-1),r=length(x),n=unit(x),f=1+r*r-MU/r,spatial=plus(delta,n,(1/Math.sqrt(f)-1)*dot3(delta,n)),distance=length(spatial),local=unit(spatial),{T,E}=staticFrame(x),K=E.reduce((v,e,i)=>plus(v,e,local[i]),times(T,-1)),den=inner(x,K,p.F),box=this.canvas.getBoundingClientRect();if(den<=.001)return null;return {x:box.width*(.5+inner(x,K,p.R)/den/(2.1*box.width/box.height)),y:box.height*(.5-inner(x,K,p.V)/den/2.1),distance}}
}
