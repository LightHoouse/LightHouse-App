import { app, BrowserWindow, ipcMain, screen, safeStorage, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const apiBase=process.env.LIGHTHOUSE_BACKEND_URL || 'https://lighthouse-be.yanzz.dev';
const endpoint=new URL(apiBase);
if(endpoint.protocol!=='https:' && !['127.0.0.1','localhost'].includes(endpoint.hostname)) throw new Error('Backend requires HTTPS');
if(process.env.LIGHTHOUSE_PROFILE_DIR)app.setPath('userData',process.env.LIGHTHOUSE_PROFILE_DIR);
type Session={token:string;memberId:string;role:string;group:{groupId:string;name:string;code:string}};
type WindowInfo={handle:string;title:string;process:string};
let session:Session|undefined, panel:BrowserWindow, overlay:BrowserWindow, marker:BrowserWindow;
let recorder:ChildProcess|undefined, recordingId='', selectedWindow:WindowInfo|undefined;
let queue:unknown[]=[], upload:Promise<void>|undefined, captured=0, uploaded=0, recordError='', recording=false, quitting=false;
let markerTimer:ReturnType<typeof setTimeout>|undefined;
let lastStep='';
const execute=promisify(execFile);
const nativePath=()=>app.isPackaged?path.join(process.resourcesPath,'native/LighthouseBridge.exe'):path.join(dir,'../native/bin/LighthouseBridge.exe');
const preferences={preload:path.join(dir,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false};
function secure(w:BrowserWindow){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
function saveSession(){if(!safeStorage.isEncryptionAvailable())return;const file=path.join(app.getPath('userData'),'membership.enc');if(session)writeFileSync(file,safeStorage.encryptString(JSON.stringify(session)));else if(existsSync(file))unlinkSync(file);}
async function api(route:string,body?:unknown){
  const r=await fetch(`${apiBase}${route}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{authorization:`Bearer ${session.token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(route==='/v1/guide'?75000:15000)});
  const data=await r.json() as any;if(!r.ok)throw new Error(data.error || 'Server tidak tersedia.');return data;
}
async function native(args:string[]){const {stdout}=await execute(nativePath(),args,{windowsHide:true,timeout:15000,maxBuffer:2_000_000});return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));}
async function windows():Promise<WindowInfo[]>{return native(['windows']);}
async function getWindow(handle:string){const found=(await windows()).find(w=>w.handle===handle);if(!found)throw new Error('Jendela sudah tertutup. Muat ulang daftar aplikasi.');return found;}
function local(){return {session:session?{role:session.role,group:session.group}:null,recording,recordingId,captured,uploaded,pending:queue.length,recordError,lastStep};}
function update(){if(panel && !panel.isDestroyed())panel.webContents.send('lab:state',local());}
async function flush(){
  if(upload)return upload;
  upload=(async()=>{while(queue.length){await api(`/v1/recordings/${recordingId}/steps`,queue[0]);queue.shift();uploaded++;recordError='';update();}})();
  try{await upload;}catch(e){recordError='Upload tertunda. Klik Stop / Simpan lagi untuk mencoba ulang.';update();throw e;}finally{upload=undefined;}
}
async function startRecorder(){
  if(!selectedWindow)throw new Error('Pilih aplikasi dulu.');
  recordError='';recorder=spawn(nativePath(),['record',selectedWindow.handle],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const child=recorder;
  await new Promise<void>((resolve,reject)=>{
    let ready=false;const timer=setTimeout(()=>{child.kill();reject(new Error('Recorder tidak merespons.'));},10000);
    createInterface({input:child.stdout!}).on('line',line=>{try{
      const row=JSON.parse(line.replace(/^\uFEFF/,''));
      if(row.kind==='ready'){ready=true;clearTimeout(timer);recording=true;update();resolve();}
      if(row.kind==='step'){queue.push(row.step);captured++;lastStep=`${row.step.event}: ${row.step.target.name || row.step.target.automationId}`;update();void flush().catch(()=>{});}
      if(row.kind==='error'){recordError=row.error;update();if(!ready){clearTimeout(timer);reject(new Error(row.error));}}
    }catch{}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Recorder Windows tidak tersedia.'));});
    child.on('exit',()=>{if(recorder===child){recorder=undefined;recording=false;if(ready)recordError='Recorder berhenti. Pilih Resume atau simpan langkah yang sudah ada.';update();}if(!ready){clearTimeout(timer);reject(new Error('Recorder gagal dimulai.'));}});
  });
}
function pause(){const child=recorder;recorder=undefined;child?.kill();recording=false;update();}
async function stop(){pause();await flush();if(recordingId)await api(`/v1/recordings/${recordingId}/stop`,{});recordingId='';recordError='';update();}
async function show(label:string){const area=screen.getPrimaryDisplay().workArea;overlay.setPosition(area.x+area.width-410,area.y+35);overlay.webContents.send('guide:text',label.slice(0,2000));overlay.showInactive();}
function hide(){overlay.hide();marker.hide();if(markerTimer)clearTimeout(markerTimer);}
async function guide(input:any){
  if(!input || typeof input.handle!=='string')throw new Error('Pilih jendela aplikasi milikmu.');
  const w=await getWindow(input.handle);
  const snapshot=await native(['snapshot',w.handle]);
  const command=await api('/v1/guide',{recordingId:input.recordingId,question:String(input.question||'').slice(0,1000),afterSeq:input.afterSeq||0,visibleNames:snapshot.visibleNames||[]});
  hide();if(command.done)return command;
  if(w.process!==command.step.window.process)throw new Error(`Buka aplikasi ${command.step.window.process} seperti rekaman asisten.`);
  const resolution=await native(['resolve',w.handle,Buffer.from(JSON.stringify(command.step.target)).toString('base64')]);
  if(resolution.resolved){
    const b=resolution.bounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.width<=0 || b.height<=0)throw new Error('Batas elemen tidak valid.');
    const rect=screen.screenToDipRect(null,{x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)});
    marker.setBounds({x:rect.x-4,y:rect.y-4,width:rect.width+8,height:rect.height+8});marker.showInactive();
    markerTimer=setTimeout(()=>marker.hide(),8000);
  }
  await show(command.say+(resolution.resolved?'':' '+resolution.reason));
  await api('/v1/ack',{cmdId:command.cmdId,stepId:command.step.stepId,resolved:Boolean(resolution.resolved),strategy:resolution.strategy||null});
  return {...command,resolution};
}
app.whenReady().then(async()=>{
  try{const file=path.join(app.getPath('userData'),'membership.enc');if(existsSync(file)&&safeStorage.isEncryptionAvailable())session=JSON.parse(safeStorage.decryptString(readFileSync(file)));}catch{}
  overlay=new BrowserWindow({width:380,height:190,transparent:true,frame:false,alwaysOnTop:true,focusable:false,show:false,webPreferences:preferences});overlay.setIgnoreMouseEvents(true);
  marker=new BrowserWindow({width:100,height:50,transparent:true,frame:false,alwaysOnTop:true,focusable:false,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});marker.setIgnoreMouseEvents(true);
  panel=new BrowserWindow({width:480,height:720,minWidth:430,minHeight:580,show:false,webPreferences:preferences});
  [panel,overlay,marker].forEach(secure);
  const handle=(name:string,fn:(input:any)=>unknown)=>ipcMain.handle(name,async(e,input)=>{if(e.sender!==panel.webContents || e.senderFrame!==panel.webContents.mainFrame)throw new Error('Invalid sender');return fn(input);});
  handle('lab:state',()=>local());handle('lab:windows',windows);
  handle('lab:create',async input=>{if(session)throw new Error('Keluar dari group dulu.');session=await api('/v1/groups',input);saveSession();update();return local();});
  handle('lab:join',async input=>{if(session)throw new Error('Keluar dari group dulu.');session=await api('/v1/join',input);saveSession();update();return local();});
  handle('lab:group',()=>api('/v1/group'));
  handle('lab:leave',()=>{if(recordingId)throw new Error('Stop dan simpan rekaman terlebih dahulu.');session=undefined;saveSession();hide();return local();});
  handle('lab:close',async()=>{if(recordingId)await stop();await api('/v1/group/close',{});session=undefined;saveSession();return local();});
  handle('lab:record',async input=>{
    if(session?.role!=='assistant')throw new Error('Hanya asisten yang dapat merekam.');if(recordingId)throw new Error('Simpan rekaman yang sedang berjalan dulu.');
    selectedWindow=await getWindow(input.handle);const r=await api('/v1/recordings',{name:input.name,process:selectedWindow.process});recordingId=r.recordingId;captured=uploaded=0;queue=[];await startRecorder();return local();
  });
  handle('lab:pause',()=>{pause();return local();});
  handle('lab:resume',async()=>{if(!recordingId||recording)throw new Error('Tidak ada rekaman yang dijeda.');await startRecorder();return local();});
  handle('lab:stop',async()=>{await stop();return local();});
  handle('lab:guide',guide);
  handle('guide:demo',()=>show('Ini panduan demo Lighthouse. Mouse tetap bisa digunakan.'));
  handle('guide:hide',hide);
  await Promise.all([panel.loadFile(path.join(dir,'ui/panel.html')),overlay.loadFile(path.join(dir,'ui/overlay.html')),marker.loadFile(path.join(dir,'ui/marker.html'))]);
  panel.on('close',e=>{if(recordingId&&!quitting){e.preventDefault();dialog.showMessageBox(panel,{type:'info',message:'Klik Stop / Simpan sebelum menutup Lighthouse agar semua langkah tersimpan.'});}});
  panel.on('closed',()=>{quitting=true;app.quit();});panel.show();
});
app.on('before-quit',()=>{quitting=true;pause();});
