import {hullParts} from './physics.js?v=21';

export const interceptorHull=[
 [[.019,.012,.058],[0,0,.004]],
 [[.067,.0035,.034],[0,-.004,-.014]],
 [[.026,.011,.017],[0,-.002,-.047]],
 [[.009,.010,.039],[-.037,-.004,-.030]],
 [[.009,.010,.039],[.037,-.004,-.030]],
 [[.016,.005,.029],[-.047,-.002,-.018]],
 [[.016,.005,.029],[.047,-.002,-.018]],
 [[.014,.008,.024],[0,.011,.024]],
 [[.0035,.020,.021],[0,.007,-.025]]
];
export const cannonHull=[
 [[.010,.007,.011],[0,.021,-.001]],
 [[.0035,.0035,.035],[0,.024,.043]],
 [[.006,.006,.008],[0,.024,.075]]
];
const stock=hullParts(0),outfits=[stock,[...stock,...cannonHull],interceptorHull,[...interceptorHull,...cannonHull]];
const vec=v=>`vec3(${v.map(x=>x.toFixed(8)).join(',')})`;
const shader=(parts,index)=>parts.map(([r,c],i)=>`${i?'else ':''}if(${index}==${i}){rr=${vec(r)};cc=${vec(c)};}`).join('\n');
export const interceptorShader=shader(interceptorHull,'piece'),cannonShader=shader(cannonHull,'modulePart');

export function awardUpgrade(player,mission){
 const key=mission==='center-rest'?'frame':mission==='trick-shot'?'cannon':null;
 if(!key||player.upgrades?.[key])return null;
 player.upgrades={frame:false,cannon:false,...player.upgrades,[key]:true};
 return key;
}
export function playerHull(player){
 const outfit=(player.upgrades?.frame?2:0)+(player.upgrades?.cannon?1:0);
 return {id:'YOUR ROCKET',A:player.X,B:player.U,C:[player.R,player.V,player.F],kind:outfit>=2?5:0,size:.8,hue:.95,boundRadius:outfit ? .11 : .065,parts:outfits[outfit],outfit,own:true,isPlayer:true};
}
export const laserMuzzle=player=>player.upgrades?.cannon?[0,.024*.8,.084*.8]:[0,0,.04];
export function engineNozzles(player,mode,exhaust){
 if(mode==='forward')return player.upgrades?.frame?[[-.0296,-.0032,-.0552],[.0296,-.0032,-.0552]]:[[0,0,-.039]];
 if(mode==='reverse')return player.upgrades?.frame?[[-.03,0,.027],[.03,0,.027]]:[[-.017,0,.022],[.017,0,.022]];
 return [exhaust.map(v=>v*(player.upgrades?.frame ? .038 : .021))];
}
