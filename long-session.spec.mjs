import {localCrypto} from './dist/local-crypto.js';
import {test,expect,_electron as electron} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

let backend, fixturePath, otherFixturePath;
const backendUrl=process.env.LIGHTHOUSE_E2E_URL || 'http://127.0.0.1:43129';
test.beforeAll(async()=>{
 test.setTimeout(180000);
 const framework=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319');
 fixturePath=path.resolve('native/bin/LighthouseFixture.exe');mkdirSync(path.dirname(fixturePath),{recursive:true});
 execFileSync(path.join(framework,'csc.exe'),['/nologo',`/out:${fixturePath}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',`/reference:${path.join(framework,'WPF/UIAutomationClient.dll')}`,`/reference:${path.join(framework,'WPF/UIAutomationTypes.dll')}`,`/reference:${path.join(framework,'WPF/WindowsBase.dll')}`,path.resolve('native/TestFixture.cs')]);
 otherFixturePath=path.resolve('native/bin/LighthouseOtherFixture.exe');copyFileSync(fixturePath,otherFixturePath);
 if(!process.env.LIGHTHOUSE_E2E_URL){
  const backendDir=path.resolve(process.env.LIGHTHOUSE_E2E_BACKEND_DIR||'../backend');
  backend=spawn(process.execPath,['scripts/e2e-server.mjs'],{cwd:backendDir,env:{...process.env,PORT:'43129'},stdio:['pipe','pipe','pipe']});
  backend.stderr.on('data',d=>process.stderr.write(d));
 }
 await expect.poll(async()=>{try{return (await fetch(backendUrl+'/health')).ok;}catch{return false;}},{timeout:150000}).toBe(true);
});
test.afterAll(async()=>{if(backend){backend.stdin.write('stop');await new Promise(resolve=>{backend.once('exit',resolve);setTimeout(()=>{if(backend.exitCode===null)execFileSync('taskkill',['/pid',String(backend.pid),'/t','/f']);resolve();},10000).unref();});}});
async function launch(existingProfile){
 const profile=existingProfile||mkdtempSync(path.join(tmpdir(),'lighthouse-e2e-'));
 const env={...process.env,LIGHTHOUSE_PROFILE_DIR:profile,LIGHTHOUSE_BACKEND_URL:backendUrl};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.LIGHTHOUSE_TEST_EXE;
 const application=await electron.launch({...(executablePath?{executablePath}:{}),args:executablePath?[]:[path.resolve('.')],env});
 let panel;await expect.poll(async()=>{panel=application.windows().find(p=>p.url().endsWith('/panel.html'));return !!panel;}).toBe(true);
 await expect(panel.locator('#enter')).toBeEnabled();return {application,panel,profile};
}
async function fixture(title,executable=fixturePath){
 const child=spawn(executable,['app',title],{windowsHide:false,stdio:['ignore','pipe','pipe']});
 const handle=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Fixture did not open')),15000);createInterface({input:child.stdout}).once('line',line=>{clearTimeout(timeout);resolve(line.trim());});child.once('error',reject);});
 return {child,handle};
}
const drive=(action,handle,id='saveButton')=>execFileSync(fixturePath,[action,handle,id],{windowsHide:true,timeout:15000});
const killClient=client=>{const p=client?.application.process();if(p&&p.exitCode===null)try{execFileSync('taskkill',['/pid',String(p.pid),'/t','/f'],{stdio:'ignore'});}catch{}};
async function memberApi(client,route){
 const encrypted=readFileSync(path.join(client.profile,'membership.enc'));
 const token=JSON.parse(localCrypto(client.profile,path.resolve('native/bin/LighthouseBridge.exe')).decrypt(encrypted)).token;
 const response=await fetch(backendUrl+route,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Test read failed: '+response.status);return response.json();
}

test('long live session: 120 actions, three pauses, repeat questions and reconnect',async()=>{
 test.setTimeout(600000);
 const started=Date.now(),report={startedAt:new Date().toISOString(),backend:backendUrl,executable:process.env.LIGHTHOUSE_TEST_EXE||'source',pauses:[],questions:[],checkpoints:[]};
 let owner,student,target,other,copy,code,bar,recordingId;
 const actions=['openProject','addData','calculateTotal','reviewResult','exportReport','saveButton'];
 try{
  owner=await launch();student=await launch();const a=owner.panel,s=student.panel;
  await a.locator('#create-tab').click();await a.locator('#name').fill('Asisten Long E2E');await a.locator('#group-name').fill('Long session automated test');await a.locator('#enter').click();
  bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));await expect(bar.locator('#copy')).toHaveText(/^[A-Z0-9]{8}$/);code=await bar.locator('#copy').innerText();
  await s.locator('#name').fill('Mahasiswa Long E2E');await s.locator('#code').fill(code);await s.locator('#enter').click();await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.hotkey))).toBe(true);
  target=await fixture('Long E2E Assistant');other=await fixture('Long E2E Other Application',otherFixturePath);copy=await fixture('Long E2E Student');
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');recordingId=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordingId));
  for(let block=0;block<4;block++){
   for(let i=0;i<30;i++){const f=(i+block)%2?other:target;drive(i%10===9?'type':'click',f.handle,i%10===9?'studentInput':actions[i%actions.length]);}
   await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.pending)),{timeout:30000}).toBe(0);
   const state=await bar.evaluate(()=>window.lighthouse.state());report.checkpoints.push({block:block+1,captured:state.captured,uploaded:state.uploaded,elapsedMs:state.recordElapsedMs});console.log('Recording checkpoint',JSON.stringify(report.checkpoints.at(-1)));
   if(block<3){
    await bar.locator('#pause').click();await expect(bar.locator('#record-label')).toHaveText('Dijeda');const paused=await bar.evaluate(()=>window.lighthouse.state());const clock=await bar.locator('#clock').innerText();
    drive('click',target.handle,'exportReport');drive('type',other.handle,'studentInput');await bar.waitForTimeout(2500);
    const after=await bar.evaluate(()=>window.lighthouse.state());expect(after.captured).toBe(paused.captured);expect(after.recordElapsedMs).toBe(paused.recordElapsedMs);await expect(bar.locator('#clock')).toHaveText(clock);
    report.pauses.push({number:block+1,frozenMs:after.recordElapsedMs,capturedUnchanged:true});await bar.locator('#resume').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');
   }
  }
  await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();
  const finalState=await bar.evaluate(()=>window.lighthouse.state());const data=await memberApi(owner,`/v1/recordings/${recordingId}/steps`);const steps=data.steps;
  expect(steps.length).toBe(finalState.captured);expect(finalState.uploaded).toBe(steps.length);expect(finalState.pending).toBe(0);expect(steps.length).toBeGreaterThanOrEqual(120);
  expect(new Set(steps.map(s=>s.eventId)).size).toBe(steps.length);expect(steps.map(s=>s.seq)).toEqual(steps.map((_,i)=>i+1));expect(new Set(steps.map(s=>s.window.process)).size).toBeGreaterThanOrEqual(2);
  const typing=steps.filter(s=>s.event==='type');expect(typing.length).toBeGreaterThan(0);expect(typing.every(s=>s.typedText===null&&s.typedTextSensitive===true)).toBe(true);
  report.recording={events:steps.length,typedEvents:typing.length,uniqueIds:true,contiguousSequence:true,pending:0,processes:[...new Set(steps.map(s=>s.window.process))],activeDurationMs:finalState.recordElapsedMs};
  drive('move',copy.handle);
  async function ask(question,targetId,{missing=false,failed=false,targetWindow=copy}={}){
   const c=student.application.windows().find(p=>p.url().endsWith('/chat.html'));
   if(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').isVisible())){await c.keyboard.press('Escape');await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').isVisible())).toBe(false);}
   drive('focus',copy.handle);drive('hotkey','0');await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').isVisible())).toBe(true);await expect(c.locator('#question')).toBeFocused();await expect(c.locator('.reply-card')).toBeHidden();
   const index=await c.locator('.message.assistant').count();await c.locator('#question').fill(question);const began=Date.now();await c.locator('#question').press('Enter');
   const answer=c.locator('.message.assistant').nth(index);await expect(answer).toHaveAttribute('data-streaming','false',{timeout:100000});
   const deltas=Number(await answer.getAttribute('data-deltas'));const text=await answer.innerText();
   if(failed){await expect(answer).toHaveClass(/failed/);}else{await expect(answer).not.toHaveClass(/failed/);await expect(answer).toHaveAttribute('data-source',process.env.LIGHTHOUSE_E2E_URL?'ai':'recording');if(process.env.LIGHTHOUSE_E2E_URL)expect(deltas).toBeGreaterThan(0);}
   const point=await student.panel.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint));
   if(missing||failed){expect(point).toBeNull();}else{
    await expect(answer.locator('.target-found')).toBeVisible();expect(point).not.toBeNull();
    const raw=JSON.parse(drive('bounds',targetWindow.handle,targetId).toString());const expected=await student.application.evaluate(({screen},r)=>screen.screenToDipRect(null,r),raw);
    expect(Math.abs(point.x-(expected.x+expected.width/2-16))).toBeLessThanOrEqual(2);expect(Math.abs(point.y-(expected.y+expected.height/2-16))).toBeLessThanOrEqual(2);
   }
   report.questions.push({question,targetId,deltas,elapsedMs:Date.now()-began,matched:!missing&&!failed,expectedFailure:failed,missingTarget:missing,answer:text});console.log('Question checkpoint',JSON.stringify(report.questions.at(-1)));
   await c.screenshot({path:`test-results/long-chat-${report.questions.length}.png`});
  }
  const questions=[['Bagaimana membuka proyek?','openProject'],['Bagaimana menambahkan data?','addData'],['Bagaimana menghitung total?','calculateTotal'],['Bagaimana meninjau hasil?','reviewResult'],['Bagaimana mengekspor laporan?','exportReport'],['Bagaimana menyimpan dokumen?','saveButton']];
  for(let i=0;i<questions.length;i++){
   if(i===3){const profile=student.profile;killClient(student);student=await launch(profile);await expect.poll(()=>student.panel.evaluate(()=>window.lighthouse.state().then(s=>s.hotkey))).toBe(true);expect((await student.panel.evaluate(()=>window.lighthouse.state())).session.group.code).toBe(code);report.reconnected=true;console.log('Student restarted; encrypted membership restored');}
   await ask(...questions[i]);
  }
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');
  drive('click',other.handle,'exportReport');await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded))).toBeGreaterThan(0);
  await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();
  await ask('Bagaimana mengekspor laporan?','exportReport',{targetWindow:other});report.crossAppUniqueTarget=true;
  drive('hide',target.handle,'exportReport');drive('hide',other.handle,'exportReport');drive('hide',copy.handle,'exportReport');await ask('Bagaimana mengekspor laporan?','exportReport',{missing:true});
  await bar.locator('#group').click();await expect(a.locator('#ask-enabled')).toBeChecked();await a.locator('#ask-enabled').uncheck();await expect.poll(()=>memberApi(owner,'/v1/group').then(g=>g.group.askEnabled)).toBe(false);await ask('Bagaimana membuka proyek?','openProject',{failed:true});await a.locator('#ask-enabled').check();await expect.poll(()=>memberApi(owner,'/v1/group').then(g=>g.group.askEnabled)).toBe(true);
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');const secondId=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordingId));expect(secondId).not.toBe(recordingId);expect((await bar.evaluate(()=>window.lighthouse.state())).recordElapsedMs).toBeLessThan(2000);
  for(let i=0;i<5;i++)drive('click',target.handle,'openProject');await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();const second=await memberApi(owner,`/v1/recordings/${secondId}/steps`);expect(second.steps.length).toBe(5);expect(second.steps[0].seq).toBe(1);expect((await memberApi(owner,`/v1/recordings/${recordingId}/steps`)).steps.length).toBe(steps.length);report.secondRecordingEvents=second.steps.length;
  await ask('Bagaimana membuka proyek?','openProject');
  a.once('dialog',d=>d.accept());await a.locator('#close-group').click();await expect(a.locator('#welcome')).toBeVisible();await ask('Bagaimana membuka proyek?','openProject',{failed:true});report.closed=true;report.passed=true;
 }catch(error){report.passed=false;report.error=error.message;throw error;}
 finally{
  report.wallTimeMs=Date.now()-started;mkdirSync('test-results',{recursive:true});writeFileSync('test-results/long-session-report.json',JSON.stringify(report,null,2));
  // Close only this test's group; never print or persist its bearer token.
  if(owner)try{await owner.panel.evaluate(()=>window.lighthouse.close());}catch{}
  killClient(owner);killClient(student);target?.child.kill();other?.child.kill();copy?.child.kill();
 }
});
