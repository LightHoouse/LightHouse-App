import {test,expect,_electron as electron} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
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
 const env={...process.env,LIGHTHOUSE_PROFILE_DIR:profile,LIGHTHOUSE_RECORDINGS_DIR:path.join(profile,'recordings'),LIGHTHOUSE_BACKEND_URL:backendUrl};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.LIGHTHOUSE_TEST_EXE;
 const application=await electron.launch({...(executablePath?{executablePath}:{}),args:executablePath?[]:[path.resolve('.')],env});
 let panel;await expect.poll(async()=>{panel=application.windows().find(p=>p.url().endsWith('/panel.html'));return !!panel;}).toBe(true);
 await expect(panel.locator('#enter')).toBeEnabled();return {application,panel,profile};
}
async function fixture(title,executable=fixturePath,mode){
 const child=spawn(executable,['app',title,...(mode?[mode]:[])],{windowsHide:false,stdio:['ignore','pipe','pipe']});
 const handle=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Fixture did not open')),15000);createInterface({input:child.stdout}).once('line',line=>{clearTimeout(timeout);resolve(line.trim());});child.once('error',reject);});
 return {child,handle};
}
const drive=(action,handle,id='saveButton')=>execFileSync(fixturePath,[action,handle,id],{windowsHide:true,timeout:15000});
test('cursor-first session: full recording, role isolation, Alt+L context, live target and close',async()=>{
 test.setTimeout(180000);
 const owner=await launch(),student=await launch();let target,other,copy;
 try{
  const a=owner.panel,s=student.panel;
  await a.locator('#create-tab').click();await a.locator('#name').fill('Asisten E2E');await a.locator('#group-name').fill('Praktikum E2E');await a.locator('#enter').click();
  const bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));
  await expect(bar.locator('#record')).toBeVisible();
  await expect(bar.locator('#copy')).toHaveText(/^[A-Z0-9]{8}$/);
  const code=await bar.locator('#copy').innerText();
  await s.locator('#name').fill('Mahasiswa E2E');await s.locator('#code').fill('ZZZZZZZZ');await s.locator('#enter').click();await expect(s.locator('#error')).toContainText('tidak ditemukan');
  await s.locator('#code').fill(code);await s.locator('#enter').click();
  await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.hotkey))).toBe(true);
  expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse').isVisible())).toBe(false);
  target=await fixture('Lighthouse Test Assistant');other=await fixture('Lighthouse Other Application',otherFixturePath);copy=await fixture('Lighthouse Test Student');
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');
  drive('click',target.handle);await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded))).toBeGreaterThan(0);
  const first=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.captured));
  drive('click',other.handle);await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded))).toBeGreaterThan(first);
  await bar.locator('#pause').click();await expect(bar.locator('#record-label')).toHaveText('Dijeda');
  const pausedTime=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordElapsedMs));
  const pausedClock=await bar.locator('#clock').innerText();
  await bar.waitForTimeout(2200);
  expect(await bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordElapsedMs))).toBe(pausedTime);
  await expect(bar.locator('#clock')).toHaveText(pausedClock);
  await bar.screenshot({path:'test-results/recorder-paused.png'});
  const paused=await bar.evaluate(()=>window.lighthouse.state().then(s=>s.captured));drive('click',target.handle);expect(await bar.evaluate(()=>window.lighthouse.state().then(s=>s.captured))).toBe(paused);
  await bar.locator('#resume').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');drive('type',target.handle,'studentInput');await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.lastEvent))).toBe('type');
  await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.recordElapsedMs))).toBeGreaterThan(pausedTime);
  await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();
  await student.application.evaluate(({BrowserWindow,screen})=>{
   const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat');
   w.once('show',()=>{globalThis.chatOpeningPosition={bounds:w.getBounds(),cursor:screen.getCursorScreenPoint(),area:screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea};});
  });
  drive('move',copy.handle);drive('click',copy.handle);drive('hotkey','0');
  const c=student.application.windows().find(p=>p.url().endsWith('/chat.html'));
  await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>({triggered:s.hotkeyAt>0,error:s.chatError})))).toEqual({triggered:true,error:''});
  await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').isVisible())).toBe(true);
  await expect(c.locator('#context')).toHaveText('LighthouseFixture');await expect(c.locator('#question')).toBeFocused();
  await expect(c.locator('body')).toHaveClass(/compact/);
  await expect(c.locator('.reply-card')).toBeHidden();
  await c.screenshot({path:'test-results/cursor-pill.png'});
  await c.locator('#question').fill('te');
  await expect.poll(()=>c.locator('#ask-form').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(60);
  await c.screenshot({path:'test-results/cursor-pill-typed.png'});
  await c.locator('#question').fill('Bagaimana langkah selanjutnya?');
  await expect.poll(()=>c.locator('#ask-form').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);
  const pos=await student.application.evaluate(()=>globalThis.chatOpeningPosition);
  expect(pos.bounds.x).toBeGreaterThanOrEqual(pos.area.x);expect(pos.bounds.x+pos.bounds.width).toBeLessThanOrEqual(pos.area.x+pos.area.width);expect(Math.abs(pos.bounds.x-pos.cursor.x)).toBeLessThan(400);
  await c.locator('#question').fill(process.env.LIGHTHOUSE_E2E_URL?'Bagaimana caranya menyimpan dokumen saya?':'Simpan');await c.locator('#question').press('Enter');
  await expect(c.locator('.target-found')).toBeVisible({timeout:70000});if(process.env.LIGHTHOUSE_E2E_URL)await expect(c.locator('.message.assistant').last()).toHaveAttribute('data-source','ai');
  if(process.env.LIGHTHOUSE_E2E_URL){expect(Number(await c.locator('.message.assistant').last().getAttribute('data-deltas'))).toBeGreaterThan(0);await expect(c.locator('.message.assistant').last()).toHaveAttribute('data-streaming','false');}
  await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>!!s.guidePoint))).toBe(true);
  await expect.poll(()=>student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Buddy').isVisible())).toBe(true);
  expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Highlight').isVisible())).toBe(false);

  await c.screenshot({path:'test-results/cursor-chat.png'});await bar.screenshot({path:'test-results/recorder-toolbar.png'});
  await c.keyboard.press('Escape');expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Chat').isVisible())).toBe(false);
  drive('hide',target.handle);drive('hide',other.handle);drive('hide',copy.handle);drive('focus',copy.handle);drive('hotkey','0');await expect(c.locator('#question')).toBeFocused();
  await c.locator('#question').fill('Simpan');await c.locator('#question').press('Enter');await expect(c.locator('.message.assistant').last()).toHaveAttribute('data-streaming','false',{timeout:100000});
  expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Highlight').isVisible())).toBe(false);
  await bar.locator('#group').click();await expect(a.locator('#group-code')).toHaveText(code);a.once('dialog',d=>d.accept());await a.locator('#close-group').click();await expect(a.locator('#welcome')).toBeVisible();
  await c.locator('#question').fill('Simpan');await c.locator('#question').press('Enter');await expect(c.locator('.message.failed').last()).toContainText('ditutup');
 }finally{for(const client of [owner,student]){const p=client.application.process();if(p.exitCode===null)try{execFileSync('taskkill',['/pid',String(p.pid),'/t','/f'],{stdio:'ignore'});}catch{}}target?.child.kill();other?.child.kill();copy?.child.kill();}
});


test('offline action queue survives process crash and uploads once after restart',async()=>{
 let owner=await launch(),target;
 try{
  await owner.panel.locator('#create-tab').click();await owner.panel.locator('#name').fill('Recovery');await owner.panel.locator('#group-name').fill('Recovery E2E');await owner.panel.locator('#enter').click();
  let bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));
  target=await fixture('Lighthouse Recovery Fixture');
  await owner.application.evaluate(()=>{const original=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).endsWith('/steps')?Promise.reject(new Error('Simulated offline')):original(url,options);});
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');drive('click',target.handle);
  await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.captured))).toBeGreaterThan(0);
  await bar.evaluate(()=>window.lighthouse.pause());
  const saved=await bar.evaluate(()=>window.lighthouse.state());expect(saved.pending).toBeGreaterThan(0);expect(saved.uploaded).toBe(0);
  const profile=owner.profile;execFileSync('taskkill',['/pid',String(owner.application.process().pid),'/t','/f'],{stdio:'ignore'});
  owner=await launch(profile);bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));
  const restored=await bar.evaluate(()=>window.lighthouse.state());console.log('Recovery status',JSON.stringify({error:restored.recordError,captured:restored.captured,pending:restored.pending,role:restored.session?.role}));expect(restored.recording).toBe(false);expect(restored.recordingId).toBe(saved.recordingId);expect(restored.captured).toBe(saved.captured);
  await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.pending)),{timeout:20000}).toBe(0);
  expect((await bar.evaluate(()=>window.lighthouse.state())).uploaded).toBe(saved.captured);
  await bar.evaluate(()=>window.lighthouse.stop());
 }finally{target?.child.kill();const proc=owner.application.process();if(proc.exitCode===null)try{execFileSync('taskkill',['/pid',String(proc.pid),'/t','/f'],{stdio:'ignore'});}catch{}}
});


test('portable session, local management, shortcuts and native drag/scroll guidance',async()=>{
 test.setTimeout(180000);let owner=await launch(),student=await launch(),target,copy;
 try{
  const a=owner.panel,s=student.panel;await a.evaluate(()=>document.fonts.ready);expect(await a.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Quicksand');await a.screenshot({path:'test-results/welcome.png'});await a.locator('#create-tab').click();await a.locator('#name').fill('Gesture assistant');await a.locator('#enter').click();
  const bar=owner.application.windows().find(p=>p.url().endsWith('/toolbar.html'));const code=await bar.locator('#copy').innerText();
  await s.locator('#name').fill('Gesture student');await s.locator('#code').fill(code);await s.locator('#enter').click();
  target=await fixture('Gesture assistant',fixturePath,'canvas');copy=await fixture('Gesture student',fixturePath,'canvas');
  await bar.locator('#record').click();await expect(bar.locator('#record-label')).toHaveText('Merekam');
  drive('drag',target.handle,'practiceCanvas');await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.lastEvent))).toBe('dragDrop');
  drive('scroll',target.handle,'practiceCanvas');await expect.poll(()=>bar.evaluate(()=>window.lighthouse.state().then(s=>s.lastEvent))).toBe('scroll');
  await bar.locator('#stop').click();await expect(bar.locator('#record')).toBeVisible();
  const archive=(await bar.evaluate(()=>window.lighthouse.state())).lastExport;const file=JSON.parse(readFileSync(archive,'utf8'));expect(file.format).toBe('lighthouse-recording');expect(file.steps.map(s=>s.event)).toEqual(['dragDrop','scroll']);expect(file.steps[0].motion.start[0]).toBeCloseTo(.25,1);
  drive('focus',copy.handle);drive('hotkey','0');const c=student.application.windows().find(p=>p.url().endsWith('/chat.html'));await expect(c.locator('#question')).toBeFocused();
  await c.locator('#question').fill('Practice canvas');await c.locator('#question').press('Enter');await expect(c.locator('.target-found')).toContainText('tarik');
  drive('click',copy.handle,'saveButton');expect(await s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).not.toBeNull();
  drive('drag',copy.handle,'practiceCanvas');await expect(c.locator('.target-found')).toHaveText('Gerakan sudah teramati');
  await c.evaluate(()=>window.lighthouse.guide({next:true}));await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).not.toBeNull();
  drive('scroll',copy.handle,'practiceCanvas');await expect.poll(()=>s.evaluate(()=>window.lighthouse.state().then(s=>s.guidePoint))).toBeNull();
  await a.evaluate(()=>window.lighthouse.showPanel());await a.locator('#manage-nav').click();await expect(a.locator('#management-members')).toContainText('Gesture student');await expect(a.locator('#management-questions')).toContainText('Practice canvas');await a.screenshot({path:'test-results/management.png'});
  await a.locator('#shortcuts-nav').click();await expect(a.locator('#shortcut-list')).toContainText('Alt + Shift + R');await a.screenshot({path:'test-results/shortcuts.png'});await a.locator('#shortcuts-back').click();
  await owner.application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},archive);
  await a.evaluate(()=>window.lighthouse.importRecording());expect((await bar.evaluate(()=>window.lighthouse.state())).uploaded).toBe(2);
  await owner.application.evaluate(()=>{globalThis.fetch=()=>Promise.reject(new Error('Offline'));});const cache=await a.evaluate(()=>window.lighthouse.management());expect(cache.offline).toBe(true);expect(cache.questions.some(q=>q.question==='Practice canvas')).toBe(true);
 }finally{for(const client of [owner,student]){const p=client.application.process();if(p.exitCode===null)try{execFileSync('taskkill',['/pid',String(p.pid),'/t','/f'],{stdio:'ignore'});}catch{}}target?.child.kill();copy?.child.kill();}
});
