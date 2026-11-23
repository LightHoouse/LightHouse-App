import {test,expect,_electron as electron} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

let backend, fixturePath;
const backendUrl=process.env.LIGHTHOUSE_E2E_URL || 'http://127.0.0.1:43129';
test.beforeAll(async()=>{
 test.setTimeout(180000);
 const framework=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319');
 fixturePath=path.resolve('native/bin/LighthouseFixture.exe');mkdirSync(path.dirname(fixturePath),{recursive:true});
 execFileSync(path.join(framework,'csc.exe'),['/nologo',`/out:${fixturePath}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',`/reference:${path.join(framework,'WPF/UIAutomationClient.dll')}`,`/reference:${path.join(framework,'WPF/UIAutomationTypes.dll')}`,`/reference:${path.join(framework,'WPF/WindowsBase.dll')}`,path.resolve('native/TestFixture.cs')]);
 if(!process.env.LIGHTHOUSE_E2E_URL){
  const backendDir=path.resolve(process.env.LIGHTHOUSE_E2E_BACKEND_DIR||'../backend');
  backend=spawn(process.execPath,['scripts/e2e-server.mjs'],{cwd:backendDir,env:{...process.env,PORT:'43129'},stdio:['pipe','pipe','pipe']});
  backend.stderr.on('data',d=>process.stderr.write(d));
 }
 await expect.poll(async()=>{try{return (await fetch(backendUrl+'/health')).ok;}catch{return false;}},{timeout:150000}).toBe(true);
});
test.afterAll(async()=>{if(backend){backend.stdin.write('stop');await new Promise(resolve=>{backend.once('exit',resolve);setTimeout(()=>{if(backend.exitCode===null)execFileSync('taskkill',['/pid',String(backend.pid),'/t','/f']);resolve();},10000).unref();});}});
async function launch(){
 const profile=mkdtempSync(path.join(tmpdir(),'lighthouse-e2e-'));
 const env={...process.env,LIGHTHOUSE_PROFILE_DIR:profile,LIGHTHOUSE_BACKEND_URL:backendUrl};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.LIGHTHOUSE_TEST_EXE;
 const application=await electron.launch({...(executablePath?{executablePath}:{}),args:executablePath?[]:[path.resolve('.')],env});
 let panel;await expect.poll(async()=>{panel=application.windows().find(p=>p.url().endsWith('/panel.html'));return !!panel;}).toBe(true);
 await expect(panel.locator('#create')).toBeEnabled();return {application,panel};
}
async function fixture(title){
 const child=spawn(fixturePath,['app',title],{windowsHide:false,stdio:['ignore','pipe','pipe']});
 const handle=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Fixture did not open')),15000);createInterface({input:child.stdout}).once('line',line=>{clearTimeout(timeout);resolve(line.trim());});child.once('error',reject);});
 return {child,handle};
}
const drive=(action,handle,id='saveButton')=>execFileSync(fixturePath,[action,handle,id],{windowsHide:true,timeout:15000});
test('two desktop clients: create, join, record native clicks, pause, guide relocated target, missing target and close',async()=>{
 const owner=await launch(),student=await launch();let target,copy;
 try{
  const a=owner.panel,s=student.panel;
  await a.locator('#name').fill('Asisten E2E');await a.locator('#group-name').fill('Praktikum E2E');await a.locator('#create').click();
  await expect(a.locator('#room')).toBeVisible();await expect(a.locator('#error')).toHaveText('');
  const code=await a.locator('#group-code').innerText();expect(code).toMatch(/^[A-Z0-9]{8}$/);
  await s.locator('#name').fill('Mahasiswa E2E');await s.locator('#code').fill('ZZZZZZZZ');await s.locator('#join').click();await expect(s.locator('#error')).toContainText('tidak ditemukan');
  await s.locator('#code').fill(code);await s.locator('#join').click();await expect(s.locator('#role')).toHaveText('Mahasiswa');await expect(s.locator('#assistant')).toBeHidden();
  target=await fixture('Lighthouse Test Assistant');copy=await fixture('Lighthouse Test Student');
  await a.locator('#refresh-windows').click();await a.locator('#window').selectOption(target.handle);await a.locator('#record-name').fill('Simpan dokumen');await a.locator('#record').click();await expect(a.locator('#record-status')).toContainText('Merekam');
  drive('click',target.handle);await expect(a.locator('#record-status')).toContainText('click: Simpan');
  await expect.poll(()=>a.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded>0 && s.uploaded===s.captured))).toBe(true);
  const captured=await a.evaluate(()=>window.lighthouse.state().then(s=>s.captured));
  await a.locator('#pause').click();await expect(a.locator('#record-status')).toContainText('Dijeda');drive('click',target.handle);
  expect(await a.evaluate(()=>window.lighthouse.state().then(s=>s.captured))).toBe(captured);
  await a.locator('#resume').click();await expect(a.locator('#record-status')).toContainText('Merekam');drive('type',target.handle,'studentInput');
  await expect(a.locator('#record-status')).toContainText('type: studentInput');
  await expect.poll(()=>a.evaluate(()=>window.lighthouse.state().then(s=>s.uploaded>1 && s.uploaded===s.captured))).toBe(true);
  await a.locator('#stop').click();await expect(a.locator('#record')).toBeVisible();await expect(a.locator('#error')).toHaveText('');
  drive('move',copy.handle);
  await s.locator('#refresh-windows').click();await s.locator('#window').selectOption(copy.handle);await s.locator('#refresh-recordings').click();await s.locator('#question').fill(process.env.LIGHTHOUSE_E2E_URL?'Bagaimana caranya menyimpan dokumen saya?':'Simpan');await s.locator('#ask').click();
  await expect(s.locator('#answer')).toContainText('Elemen ditemukan dan disorot',{timeout:70000});
  if(process.env.LIGHTHOUSE_E2E_URL)await expect(s.locator('#answer')).toContainText('AI ·');
  const marker=await student.application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Highlight');return {visible:w.isVisible(),bounds:w.getBounds()};});
  expect(marker.visible).toBe(true);expect(marker.bounds.x).toBeGreaterThan(500);
  await s.screenshot({path:'test-results/student-guidance.png'});
  drive('hide',copy.handle);await s.locator('#ask').click();await expect(s.locator('#answer')).toContainText('belum terlihat',{timeout:70000});
  expect(await student.application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Lighthouse Highlight').isVisible())).toBe(false);
  a.once('dialog',d=>d.accept());await a.locator('#close-group').click();await expect(a.locator('#welcome')).toBeVisible();
  await s.locator('#refresh-recordings').click();await expect(s.locator('#error')).toContainText('ditutup');
 }finally{
  await owner.application.evaluate(({app})=>app.exit());await student.application.evaluate(({app})=>app.exit());
  target?.child.kill();copy?.child.kill();
 }
});
