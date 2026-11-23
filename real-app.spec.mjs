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
 const encrypted=readFileSync(path.join(client.profile,'membership.enc')).toString('base64');
 const token=await client.application.evaluate(({safeStorage},data)=>JSON.parse(safeStorage.decryptString(Buffer.from(data,'base64'))).token,encrypted);
 const response=await fetch(backendUrl+route,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Test read failed: '+response.status);return response.json();
}

test('Windows Calculator: real capture, streaming, moving chat and companion target',async()=>{
 test.setTimeout(180000);const owner=await launch(),student=await launch();
 const report={application:'Windows Calculator',startedAt:new Date().toISOString()};
 try{
 const windows=JSON.parse(execFileSync(path.resolve('native/bin/LighthouseBridge.exe'),['windows'],{encoding:'utf8'}));const calc=windows.find(w=>w.title==='Calculator');expect(calc).toBeTruthy();
 const a=owner.panel,s=student.panel;await a.locator('#create-tab').click();await a.locator('#name').fill('Real app test');await a.locator('#group-name').fill('Calculator test');await a.locator('#enter').click();
 const bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));await expect(bar.locator('#copy')).toHaveText(/^[A-Z0-9]{8}$/);const code=await bar.locator('#copy').innerText();
 await s.locator('#name').fill('Calculator student');await s.locator('#code').fill(code);await s.locator('#enter').click();await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.hotkey))).toBe(true);
 await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');const rid=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordingId));
 for(const id of ['clearButton','num7Button','plusButton','num8Button','equalButton'])drive('click',calc.handle,id);
 await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded))).toBeGreaterThanOrEqual(5);await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();
 const data=await memberApi(owner,`/v1/recordings/${rid}/steps`);report.targets=data.steps.map(x=>x.target.automationId);expect(report.targets).toContain('equalButton');
 drive('focus',calc.handle);drive('hotkey','0');const c=student.application.windows().find(p=>p.url().endsWith('/chat.html'));await expect(c.locator('#question')).toBeFocused();await expect(c.locator('.reply-card')).toBeHidden();
 const before=await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').getBounds());
 drive('pointer','300','250');await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').getBounds().x)).not.toBe(before.x);report.chatFollowsMouse=true;
 await c.evaluate(()=>{window.observedStream=false;new MutationObserver(()=>{if(document.querySelector('[data-streaming="true"]'))window.observedStream=true;}).observe(document.getElementById('messages'),{subtree:true,attributes:true,childList:true,characterData:true});});
 await c.locator('#question').fill('Tombol mana untuk menampilkan hasil penjumlahan?');await c.locator('#question').press('Enter');const answer=c.locator('.message.assistant').last();await expect(answer.locator('.thinking-dots')).toBeVisible();await expect(answer).toHaveAttribute('data-streaming','false',{timeout:100000});await expect(answer).not.toHaveClass(/failed/);await expect(answer).toHaveAttribute('data-source','ai');expect(await c.evaluate(()=>window.observedStream)).toBe(true);report.intermediateTextVisible=true;report.deltas=Number(await answer.getAttribute('data-deltas'));expect(report.deltas).toBeGreaterThan(0);
 const raw=JSON.parse(drive('bounds',calc.handle,'equalButton').toString());const expected=await student.application.evaluate(({screen},r)=>screen.screenToDipRect(null,r),raw);const point=await s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint));expect(point).not.toBeNull();expect(Math.abs(point.x-(expected.x+expected.width/2-16))).toBeLessThanOrEqual(2);
 await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>{const b=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Buddy').getBounds();return b.x;})).toBe(Math.round(point.x));
 expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Highlight').isVisible())).toBe(false);report.companionPointsAtEquals=true;
 const mouseBefore=await student.application.evaluate(({screen})=>screen.getCursorScreenPoint());await c.waitForTimeout(1000);expect(await student.application.evaluate(({screen})=>screen.getCursorScreenPoint())).toEqual(mouseBefore);report.realMouseUnchanged=true;
 await c.waitForTimeout(11000);console.log('Watch status after waiting',await s.evaluate(()=>window.lighthouse.state().then(s=>({status:s.guideStatus,point:s.guidePoint}))));expect(await s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).not.toBeNull();report.waitsBeyondOldTimeout=true;drive('click',calc.handle,'num1Button');await c.waitForTimeout(400);console.log('Watch status after other click',await s.evaluate(()=>window.lighthouse.state().then(s=>({status:s.guideStatus,point:s.guidePoint}))));expect(await s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).not.toBeNull();report.otherClickDoesNotDismiss=true;drive('click',calc.handle,'equalButton');await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).toBeNull();await expect(c.locator('.target-found')).toHaveText('Target sudah diklik');report.targetClickDismisses=true;
 await c.screenshot({path:'test-results/calculator-chat.png'});report.answer=await answer.innerText();report.passed=true;
 }catch(e){report.passed=false;report.error=e.message;throw e;}finally{mkdirSync('test-results',{recursive:true});writeFileSync('test-results/real-app-report.json',JSON.stringify(report,null,2));try{await owner.panel.evaluate(()=>window.lighthouse.close());}catch{}killClient(owner);killClient(student);}
});
