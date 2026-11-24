import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RecorderStore} from './dist/recorder-store.js';
import {verifyOutcome} from './dist/outcome.js';
test('journal survives restart and ignores interrupted temporary replacement',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lighthouse-journal-'));const file=path.join(dir,'state');
 const encrypt=s=>Buffer.from(s).map(b=>b^121);const decrypt=b=>b.map(v=>v^121).toString();
 try{const value={schemaVersion:1,groupId:'group',recordingId:'recording',queue:[{eventId:'event',enrichment:false}],captured:1,uploaded:0,elapsedMs:400,stopRequested:true};
 new RecorderStore(file,encrypt,decrypt).save(value);
 assert.ok(!readFileSync(file).toString().includes('recording'));
 writeFileSync(file+'.tmp','incomplete');assert.deepEqual(new RecorderStore(file,encrypt,decrypt).load(),value);
 new RecorderStore(file,encrypt,decrypt).save({...value,queue:[],uploaded:1});assert.equal(new RecorderStore(file,encrypt,decrypt).load().uploaded,1);
 writeFileSync(file,encrypt(JSON.stringify({...value,elapsedMs:-1})));assert.throws(()=>new RecorderStore(file,encrypt,decrypt).load());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('click alone never verifies outcome; only changed observed state does',()=>{
 const e={automationId:'toggle',role:'CheckBox',name:'Enable',enabled:true,selected:null,checkedValue:false,expanded:null};
 const pre={elements:[e]},post={elements:[{...e,checkedValue:true}]};
 assert.equal(verifyOutcome(pre,pre,pre),'unverifiable');
 assert.equal(verifyOutcome(null,post,post),'unverifiable');
 assert.equal(verifyOutcome(pre,post,pre),'not-observed');
 assert.equal(verifyOutcome(pre,post,post),'observed');
});

import {portableSchema,mergeEvent} from './dist/portable.js';
test('portable files validate before import and merge enrichments without secrets',()=>{
 const step={eventId:'c1c5a0d1-cfa1-42b8-8d18-3b34d2c054f1',event:'dragDrop',target:{automationId:'canvas',name:'Canvas',controlType:'Pane'},window:{process:'fixture',title:'Practice'},timestamp:1,motion:{start:[.2,.2],end:[.8,.8]},enrichment:false};
 const data={format:'lighthouse-recording',version:1,name:'Lesson',createdAt:1,steps:[step]};
 assert.equal(portableSchema.parse(JSON.parse(JSON.stringify(data))).steps[0].event,'dragDrop');
 assert.equal(portableSchema.safeParse({...data,token:'secret'}).success,false);
 assert.equal(portableSchema.safeParse({...data,steps:[step,step]}).success,false);
 assert.equal(portableSchema.safeParse({...data,steps:[{...step,typedText:'secret'}]}).success,false);
 assert.equal(portableSchema.safeParse({...data,steps:[{...step,motion:{start:[-1,0],end:[1,1]}}]}).success,false);
 const events=[];mergeEvent(events,step);mergeEvent(events,{...step,enrichment:true,capture:{postState:{elements:[]}}});assert.equal(events.length,1);assert.equal(events[0].enrichment,false);assert.deepEqual(events[0].capture.postState.elements,[]);
});
