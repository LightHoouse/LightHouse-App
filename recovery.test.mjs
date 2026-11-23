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
