// Rendering quality changes sampling density, never the spacetime or ray equations.
export class ResolutionController{
 constructor({software=false,coarse=false}={}){this.software=software;this.coarse=coarse;this.mode='auto';this.budget=null;this.slow=0;this.fast=0;this.configure(1,1,1)}
 configure(width,height,dpr=1,coarse=this.coarse){
  const area=Math.max(1,width*height);this.coarse=coarse;this.width=width;this.height=height;this.dpr=Math.min(dpr,this.mode==='high'?2:this.mode==='performance'?1:1.5);
  const cap=this.mode==='high'?2500000:this.software?45000:this.mode==='performance'?(coarse?180000:300000):(coarse?450000:1200000);
  const previousCeiling=this.ceiling;this.ceiling=Math.min(cap,area*this.dpr*this.dpr);
  this.floor=this.mode==='auto'&&!this.software?Math.min(this.ceiling,Math.max(coarse?140000:240000,area*(coarse?.5:.65)**2)):this.ceiling;
  // Keep the current budget within the new viewport limits.
  this.budget=this.budget===null||previousCeiling===1?this.ceiling:Math.max(this.floor,Math.min(this.ceiling,this.budget));
  return this.dimensions();
 }
 setMode(mode){if(!['auto','high','performance'].includes(mode))throw Error('Unknown graphics quality');this.mode=mode;this.budget=null;this.resetSamples()}
 resetSamples(){this.slow=0;this.fast=0}
 observe(milliseconds,{active=true,continuous=true}={}){
  if(this.mode!=='auto'||!active||!continuous||!Number.isFinite(milliseconds)){this.resetSamples();return false}
  // Respond to sustained sub-24-fps rendering, and restore detail only with
  // headroom. Ignore isolated spikes so a shot or explosion does not resize.
  this.slow=milliseconds>42?this.slow+1:0;this.fast=milliseconds<22?this.fast+1:0;
  const before=this.budget;
  if(this.slow>=6){this.budget=Math.max(this.floor,this.budget*.85);this.resetSamples()}
  else if(this.fast>=60){this.budget=Math.min(this.ceiling,this.budget*1.15);this.resetSamples()}
  return Math.abs(this.budget-before)>.5;
 }
 dimensions(){const factor=Math.min(1,Math.sqrt(this.budget/Math.max(1,this.width*this.height*this.dpr*this.dpr)));return {width:Math.max(1,Math.round(this.width*this.dpr*factor)),height:Math.max(1,Math.round(this.height*this.dpr*factor))}}
}
