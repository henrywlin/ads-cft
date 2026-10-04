import {dot,add,scale,staticFrame} from './physics.js?v=21';

// A stationary central geodesic, with an open berth through the two crowns.
// Share every hull piece between the ray tracer, image picking and laser hits.
export const centralHull=[];
for(const [radius,z,thickness] of [[.165,.025,.036],[.125,-.085,.027]]){
 for(let i=0;i<16;i++){const a=i*Math.PI/8;centralHull.push([[thickness,thickness,.021],[radius*Math.cos(a),radius*Math.sin(a),z]])}
}
for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4;centralHull.push([[.012,.012,.065],[.143*Math.cos(a),.143*Math.sin(a),-.03]])}
for(let i=0;i<4;i++){const a=i*Math.PI/2;centralHull.push([[.028,.028,.13],[.19*Math.cos(a),.19*Math.sin(a),-.035]])}
export const centralShip={id:'AXIOM',A:[1,0,0,0,0],B:[0,1,0,0,0],C:[[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]],kind:4,size:1,hue:.5,boundRadius:.34,parts:centralHull,indestructible:true};
const vec=v=>`vec3(${v.map(x=>x.toFixed(8)).join(',')})`;
export const centralHullShader=centralHull.map(([r,c],i)=>`${i?'else ':''}if(piece==${i}){rr=${vec(r)};cc=${vec(c)};}`).join('\n');

// Unit proper-acceleration direction that reduces local static-frame speed.
// It is a nose/thrust cue; the engine exhaust points the other way.
export function brakingAim(player){
 const {T}=staticFrame(player.X),gamma=-dot(T,player.U),speed=Math.sqrt(Math.max(0,gamma*gamma-1));
 if(speed<.003)return null;
 return {direction:scale(add(T,player.U,1,-gamma),1/speed)};
}
