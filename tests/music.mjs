import assert from 'node:assert/strict';
import {ArcadeScore} from '../dist/music.js';
for(const now of [.1,10,600,3600]){
 const score=new ArcadeScore(),events=[];score.context={currentTime:now};score.next=0;score.step=0;
 score.tone=(note,t)=>events.push(t);score.drum=t=>events.push(t);score.schedule();
 assert.ok(events.length>0&&events.length<20,'Resuming must schedule only the short look-ahead, not expired voices');
 assert.ok(events.every(t=>t>=Math.max(0,now-.18)&&t<now+.18));assert.ok(score.next>=now+.18);
 const next=score.next,step=score.step;score.schedule();assert.equal(score.next,next);assert.equal(score.step,step);
 score.context.currentTime+=.2;score.schedule();assert.ok(score.step>step,'The score must continue after recovery');
}
console.log('PASS: delayed music scheduling skips expired voices and continues the score.');
