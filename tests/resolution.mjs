import assert from 'node:assert/strict';
import {ResolutionController} from '../dist/resolution.js';
const q=new ResolutionController();q.configure(1738,1016,2,false);const initial=q.budget;
// A long launch screen, paused game, hidden tab or delayed callback is not a slow GPU.
for(let i=0;i<100;i++)q.observe(30000,{active:false});assert.equal(q.budget,initial);
for(let i=0;i<100;i++)q.observe(30000,{continuous:false});assert.equal(q.budget,initial);
// Even genuinely slow frames cannot collapse a hardware viewport to the old 45k floor.
for(let i=0;i<200;i++)q.observe(100);assert.equal(q.budget,q.floor);const low=q.dimensions();assert.ok(low.width>=1738*.64&&low.height>=1016*.64);assert.ok(q.budget>45000*10);
// Fast frames restore detail after load passes, without needing a reload.
for(let i=0;i<1000;i++)q.observe(16);assert.equal(q.budget,q.ceiling);
q.setMode('high');q.configure(1738,1016,2);const high=q.budget;for(let i=0;i<200;i++)q.observe(100);assert.equal(q.budget,high);assert.ok(high>initial);
q.setMode('performance');q.configure(1738,1016,2);assert.ok(q.budget<initial);assert.equal(q.floor,q.ceiling);
const mobile=new ResolutionController({coarse:true});mobile.configure(390,458,2,true);for(let i=0;i<200;i++)mobile.observe(100);assert.ok(mobile.dimensions().width>=390*.5);assert.ok(mobile.dimensions().height>=458*.5);
const software=new ResolutionController({software:true});software.configure(1738,1016,2);assert.equal(software.budget,45000);for(let i=0;i<200;i++)software.observe(100);assert.equal(software.budget,45000);
const interrupted=new ResolutionController();interrupted.configure(1280,800);for(let i=0;i<3;i++)interrupted.observe(100);interrupted.observe(2000,{active:false});interrupted.observe(100);assert.equal(interrupted.budget,interrupted.ceiling);
console.log('PASS: idle gaps ignored, resolution floor, automatic recovery, fixed graphics presets, mobile and software budgets.');

const paced=new ResolutionController();paced.configure(1280,800);const start=paced.budget;
for(let i=0;i<5;i++)paced.observe(50);assert.equal(paced.budget,start,'Ignore short rendering spikes');
paced.observe(50);assert.ok(paced.budget<start,'Respond to sustained sub-24-fps frames');
const reduced=paced.budget;for(let i=0;i<120;i++)paced.observe(30);assert.equal(paced.budget,reduced,'Require headroom before restoring detail');
for(let i=0;i<60;i++)paced.observe(16);assert.ok(paced.budget>reduced);
