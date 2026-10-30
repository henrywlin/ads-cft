import {hullParts} from './physics.js?v=21';
import {hullRootsGLSL,hullPaintGLSL,displayGLSL} from './flight-visuals.js?v=37';

// A current-frame chase display, using level 1's stock 3D hull and materials.
// Kept at HUD resolution independently of the more expensive curved-space sky.
const parts=hullParts(0),size=.8;
const eyeAt=lag=>[0,.055,-.18-lag];
export function projectRocket(local,width,height,lag=0){
 const eye=eyeAt(lag),q=local.map((x,i)=>x-eye[i]);
 return q[2]>.005?[width/2+q[0]/q[2]/1.4*height,height/2-q[1]/q[2]/1.4*height]:null;
}
const vec=v=>`vec3(${v.map(x=>x.toFixed(9)).join(',')})`;
const vertex=`#version 300 es
in vec2 position;void main(){gl_Position=vec4(position,0,1);}`;
const fragment=`#version 300 es
precision highp float;
uniform vec2 viewport,crop;uniform float pixelRatio,engineBurn;uniform vec3 eye,playerColor;
out vec4 color;
const float PI=3.141592653589793;
${hullRootsGLSL}
${hullPaintGLSL}
${displayGLSL}
void main(){
 vec2 pixel=crop+gl_FragCoord.xy/pixelRatio,screen=(pixel-.5*viewport)/viewport.y;
 vec3 d=normalize(vec3(screen*1.4,1)),radii=vec3(1),center=vec3(0);float nearest=1e20;int part=0;
 ${parts.map(([r,c],i)=>`{vec3 rr=${vec(r.map(x=>x*size))},cc=${vec(c.map(x=>x*size))};vec2 roots=hullRoots(eye,d,cc,rr);for(int j=0;j<2;j++){float t=roots[j];if(t>.00001&&t<nearest){nearest=t;radii=rr;center=cc;part=${i};}}}`).join('\n')}
 if(nearest>1e19){color=vec4(0);return;}
 vec3 q=eye+nearest*d,paint=hullPaint(0,part,q,q-center,radii,d,.8,.95,true,playerColor,engineBurn);
 color=vec4(arcadeDisplay(paint,screen,pixel*pixelRatio),1);
}`;
export class RocketModel{
 constructor(){
  this.canvas=document.createElement('canvas');
  this.gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!this.gl)throw Error('The chase model requires WebGL 2');
  this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true});
  this.canvas.addEventListener('webglcontextrestored',()=>{this.initialize();this.lost=false});
  this.initialize();
 }
 initialize(){
  const gl=this.gl,compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  gl.useProgram(this.program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const a=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  this.locations={};for(const key of ['viewport','crop','pixelRatio','engineBurn','eye','playerColor'])this.locations[key]=gl.getUniformLocation(this.program,key);
 }
 paint(ctx,width,height,{lag=0,color='#55dce8',burn=0}={}){
  if(this.lost)return;
  // Project the actual hull bounds; do not scale an icon into a fixed screen box.
  const bounds=[];for(const [r,c] of parts)for(let i=0;i<8;i++){const q=projectRocket(c.map((v,j)=>(v+r[j]*(i&(1<<j)?1:-1))*size),width,height,lag);if(q)bounds.push(q)}
  const left=Math.max(0,Math.floor(Math.min(...bounds.map(p=>p[0])))-2),right=Math.min(width,Math.ceil(Math.max(...bounds.map(p=>p[0])))+2),top=Math.max(0,Math.floor(Math.min(...bounds.map(p=>p[1])))-2),bottom=Math.min(height,Math.ceil(Math.max(...bounds.map(p=>p[1])))+2);
  if(right<=left||bottom<=top)return;
  const ratio=Math.min(2,globalThis.devicePixelRatio||1),w=Math.ceil((right-left)*ratio),h=Math.ceil((bottom-top)*ratio),gl=this.gl;
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
  gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.uniform2f(this.locations.viewport,width,height);gl.uniform2f(this.locations.crop,left,height-bottom);gl.uniform1f(this.locations.pixelRatio,ratio);gl.uniform1f(this.locations.engineBurn,burn);gl.uniform3fv(this.locations.eye,eyeAt(lag));gl.uniform3fv(this.locations.playerColor,[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255));gl.drawArrays(gl.TRIANGLES,0,3);
  ctx.drawImage(this.canvas,left,top,right-left,bottom-top);
 }
}
