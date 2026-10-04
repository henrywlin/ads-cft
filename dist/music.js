// Original procedural arcade score: D minor, 92 BPM, layered arpeggio and drums.
export class ArcadeScore{
 constructor(){this.context=null;this.master=null;this.timer=null;this.step=0;this.playing=false;this.suspendTimer=null;this.thrustLevel=0;this.startId=0}
 async start(){
  const request=++this.startId;clearTimeout(this.suspendTimer);
  if(!this.context){
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
   this.context=new Audio();const c=this.context;this.master=c.createGain();this.master.gain.value=0;
   this.music=c.createGain();this.music.gain.value=.4;this.music.connect(this.master);this.effects=c.createGain();this.effects.gain.value=1;this.effects.connect(this.master);
   const compressor=c.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=3;this.master.connect(compressor);compressor.connect(c.destination);
   this.delay=c.createDelay(1);this.delay.delayTime.value=.326;const feedback=c.createGain();feedback.gain.value=.25;const wet=c.createGain();wet.gain.value=.22;this.delay.connect(feedback);feedback.connect(this.delay);this.delay.connect(wet);wet.connect(this.music);
   const n=c.sampleRate;this.noise=c.createBuffer(1,n,c.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<n;i++)a[i]=Math.random()*2-1;
   this.initEngine();
  }
  await this.context.resume();if(request!==this.startId)return false;if(this.playing)return true;this.playing=true;
  this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setTargetAtTime(.6,this.context.currentTime,.15);this.next=this.context.currentTime+.06;
  this.timer=setInterval(()=>this.schedule(),35);this.schedule();return true;
 }
 stop(){this.startId++;this.setThrust(0);if(!this.context)return;this.playing=false;clearInterval(this.timer);this.timer=null;this.master.gain.setTargetAtTime(0,this.context.currentTime,.06);this.suspendTimer=setTimeout(()=>{if(!this.playing)this.context.suspend()},350)}
 initEngine(){
  const c=this.context;this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engineGain.connect(this.effects);
  const noise=c.createBufferSource();noise.buffer=this.noise;noise.loop=true;
  this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=550;this.engineFilter.Q.value=.8;
  const rumble=c.createGain();rumble.gain.value=.48;noise.connect(this.engineFilter);this.engineFilter.connect(rumble);rumble.connect(this.engineGain);noise.start();
  this.engineTone=c.createOscillator();this.engineTone.type='triangle';this.engineTone.frequency.value=48;
  const tone=c.createGain();tone.gain.value=.26;this.engineTone.connect(tone);tone.connect(this.engineGain);this.engineTone.start();
 }
 setThrust(level,mode='forward'){
  level=this.playing?Math.max(0,Math.min(1,level)):0;
  if(level===this.thrustLevel&&mode===this.thrustMode)return;
  this.thrustLevel=level;this.thrustMode=mode;if(!this.context)return;
  const now=this.context.currentTime;
  this.engineGain.gain.setTargetAtTime(level?(.2+.55*level):0,now,level?.055:.035);
  this.engineFilter.frequency.setTargetAtTime(350+level*1550,now,.08);
  this.engineTone.frequency.setTargetAtTime((mode==='reverse'?40:mode==='brake'?58:48)+level*48,now,.08);
 }
 incoming(){
  if(!this.playing)return;const c=this.context,t=c.currentTime;
  // A short rising two-tone radio chime, shared with the other muted effects.
  for(const [offset,frequency] of [[0,880],[.14,1320]]){
   const o=c.createOscillator(),g=c.createGain(),start=t+offset;o.type='sine';o.frequency.value=frequency;
   g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.18,start+.008);g.gain.exponentialRampToValueAtTime(.0001,start+.18);
   o.connect(g);g.connect(this.effects);o.onended=()=>{o.disconnect();g.disconnect()};o.start(start);o.stop(start+.2);
  }
 }
 laser(){
  if(!this.playing)return;const c=this.context,t=c.currentTime,o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
  o.type='sawtooth';o.frequency.setValueAtTime(1500,t);o.frequency.exponentialRampToValueAtTime(95,t+.25);
  f.type='lowpass';f.frequency.setValueAtTime(5200,t);f.frequency.exponentialRampToValueAtTime(450,t+.26);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.32,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.28);
  o.connect(f);f.connect(g);g.connect(this.effects);o.start(t);o.stop(t+.30);
 }
 explosion(){
  if(!this.playing)return;const c=this.context,t=c.currentTime,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
  s.buffer=this.noise;f.type='lowpass';f.frequency.setValueAtTime(4200,t);f.frequency.exponentialRampToValueAtTime(160,t+.9);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(1.1,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.95);
  s.connect(f);f.connect(g);g.connect(this.effects);s.start(t);s.stop(t+1);
  const boom=c.createOscillator(),bass=c.createGain();boom.frequency.setValueAtTime(130,t);boom.frequency.exponentialRampToValueAtTime(28,t+.65);
  bass.gain.setValueAtTime(.0001,t);bass.gain.linearRampToValueAtTime(.65,t+.01);bass.gain.exponentialRampToValueAtTime(.0001,t+.8);
  boom.connect(bass);bass.connect(this.effects);boom.start(t);boom.stop(t+.85);
 }
 tone(note,time,duration,level,type='triangle',cutoff=1800){
  const c=this.context,o=c.createOscillator(),g=c.createGain(),filter=c.createBiquadFilter();o.type=type;o.frequency.value=440*2**((note-69)/12);filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,time);filter.frequency.exponentialRampToValueAtTime(Math.max(150,cutoff*.35),time+duration);
  g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(level,time+.015);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(filter);filter.connect(g);g.connect(this.music);g.connect(this.delay);o.start(time);o.stop(time+duration+.02);
 }
 drum(time,kind){
  const c=this.context,g=c.createGain();g.connect(this.music);
  if(kind==='kick'){const o=c.createOscillator();o.frequency.setValueAtTime(135,time);o.frequency.exponentialRampToValueAtTime(43,time+.13);g.gain.setValueAtTime(.37,time);g.gain.exponentialRampToValueAtTime(.0001,time+.17);o.connect(g);o.start(time);o.stop(time+.18)}
  else{const s=c.createBufferSource(),f=c.createBiquadFilter();s.buffer=this.noise;f.type='highpass';f.frequency.value=kind==='hat'?6500:1800;s.connect(f);f.connect(g);g.gain.setValueAtTime(kind==='hat'?.045:.14,time);g.gain.exponentialRampToValueAtTime(.0001,time+(kind==='hat'?.035:.13));s.start(time);s.stop(time+.14)}
 }
 schedule(){
  const sixteenth=60/92/4,now=this.context.currentTime;
  // Skip missed beats after tab throttling instead of allocating expired voices.
  if(this.next<now-.18){const missed=Math.ceil((now-this.next)/sixteenth);this.step+=missed;this.next+=missed*sixteenth}

  while(this.next<this.context.currentTime+.18){
   const step=this.step,beat=step%16,chord=Math.floor(step/32)%4;
   const chords=[[50,53,57,64,69],[46,50,53,57,65],[48,53,57,64,67],[48,55,58,62,67]],roots=[38,34,41,36],pattern=[0,2,1,3,2,4,1,3];
   if(beat%2===0)this.tone(chords[chord][pattern[(step/2)%8]]+12,this.next,.30,.09,'square',1700);
   if(beat%4===0)this.tone(roots[chord]+(beat===12?12:0),this.next,.43,.21,'triangle',600);
   if(beat===0||beat===8)this.drum(this.next,'kick');if(beat===4||beat===12)this.drum(this.next,'snare');if(beat%2===1)this.drum(this.next,'hat');
   if(step%32===0){for(const note of chords[chord].slice(0,3))this.tone(note,this.next,3.6,.035,'sine',1200)}
   if(Math.floor(step/64)%2===1&&beat===14)this.tone(chords[chord][4]+12,this.next,.75,.09,'triangle',2800);
   this.step++;this.next+=sixteenth;
  }
 }
}
