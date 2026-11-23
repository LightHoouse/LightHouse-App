import {app,BrowserWindow,ipcMain,screen,safeStorage,globalShortcut,Tray,Menu,nativeImage,clipboard} from 'electron';
import {localCrypto} from './local-crypto.js';
import {verifyOutcome} from './outcome.js';
import {RecorderStore} from './recorder-store.js';
import {placeChat} from './chat-placement.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn,execFile,execFileSync,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const apiBase=process.env.LIGHTHOUSE_BACKEND_URL||'https://lighthouse-be.yanzz.dev';
const endpoint=new URL(apiBase);
if(endpoint.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(endpoint.hostname))throw new Error('Backend requires HTTPS');
if(process.env.LIGHTHOUSE_PROFILE_DIR)app.setPath('userData',process.env.LIGHTHOUSE_PROFILE_DIR);
type Session={token:string;role:string;group:{groupId:string;name:string;code:string}};
type WindowInfo={handle:string;title:string;process:string};
let session:Session|undefined,panel:BrowserWindow,toolbar:BrowserWindow,chat:BrowserWindow,marker:BrowserWindow,buddy:BrowserWindow,tray:Tray;
let recorder:ChildProcess|undefined,recordingId='',recording=false,queue:unknown[]=[],upload:Promise<void>|undefined,captured=0,uploaded=0,recordError='',recordElapsedMs=0,recordActiveSince=0;
let quitting=false,hotkey=false,studentContext:WindowInfo|undefined,lastSeq=0,lastRecording='',markerTimer:ReturnType<typeof setTimeout>|undefined;
let lastEvent='',guideStatus='idle',stopRequested=false;
let journal:RecorderStore;
let storage:ReturnType<typeof localCrypto>;
function decryptLocal(data:Buffer){return data.subarray(0,3).toString()==='LH1'?storage.decrypt(data):safeStorage.decryptString(data);}
let stopping:Promise<void>|undefined;
function persistRecorder(){if(!session||!journal)return;journal.save({schemaVersion:1,groupId:session.group.groupId,recordingId,queue,captured,uploaded,elapsedMs:elapsedRecording(),stopRequested});}
let hotkeyAt=0,chatError='';
let shortcutHelper:ChildProcess|undefined;
let chatAnchor={x:0,y:0};
let guidePoint:{x:number;y:number}|undefined,guideWatcher:ChildProcess|undefined,buddyPosition:{x:number;y:number}|undefined;
let chatSize={expanded:false,width:116,height:180};
let chatPlacement='';
function sizeChat(expanded:boolean,composerWidth=116,replyHeight=180){
 chatSize={expanded,width:composerWidth,height:replyHeight};
 const area=screen.getDisplayNearestPoint(chatAnchor).workArea;
 const placed=placeChat(chatAnchor,area,{width:expanded?350:Math.max(52,Math.min(280,composerWidth+16)),height:expanded?Math.max(120,Math.min(330,replyHeight)):50});
 chat.setBounds(placed.bounds);
 const key=`${placed.above}:${placed.left}`;
 if(key!==chatPlacement){chatPlacement=key;chat.webContents.send('chat:placement',{above:placed.above,left:placed.left});}
}

const execute=promisify(execFile);
const nativePath=()=>app.isPackaged?path.join(process.resourcesPath,'native/LighthouseBridge.exe'):path.join(dir,'../native/bin/LighthouseBridge.exe');
const webPreferences={preload:path.join(dir,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false};
function secure(w:BrowserWindow){w.setMenu(null);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());}
function save(){const p=path.join(app.getPath('userData'),'membership.enc');if(session)writeFileSync(p,storage.encrypt(JSON.stringify(session)));else if(existsSync(p))unlinkSync(p);}
async function api(route:string,body?:unknown){const r=await fetch(apiBase+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{authorization:`Bearer ${session.token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(route==='/v1/guide'?75000:15000)});const data=await r.json() as any;if(!r.ok)throw new Error(data.error||'Koneksi terputus. Coba lagi.');return data;}
async function native(args:string[]){const {stdout}=await execute(nativePath(),args,{windowsHide:true,timeout:15000,maxBuffer:2_000_000});return JSON.parse(stdout.trim().replace(/^\uFEFF/,''));}
function elapsedRecording(){return recordElapsedMs+(recording?Math.max(0,performance.now()-recordActiveSince):0);}
function freezeRecording(){recordElapsedMs=elapsedRecording();recording=false;}
function state(){return {session:session?{role:session.role,group:session.group}:null,recording,recordingId,captured,uploaded,pending:queue.length,recordError,recordElapsedMs:elapsedRecording(),hotkey,lastEvent,hotkeyAt,chatError,guideStatus,guidePoint:guidePoint||null};}
function update(){for(const w of [panel,toolbar,chat])if(w&&!w.isDestroyed())w.webContents.send('lab:state',state());}
function hideGuide(){guideStatus='dismissed';guidePoint=undefined;const observer=guideWatcher;guideWatcher=undefined;observer?.kill();marker.hide();if(markerTimer)clearTimeout(markerTimer);}
function hideChat(){chat.hide();hideGuide();}
function showPanel(){panel.show();panel.focus();update();}
async function flush(){if(upload)return upload;upload=(async()=>{while(queue.length){await api(`/v1/recordings/${recordingId}/steps`,queue[0]);const sent=queue.shift() as any;if(!sent?.enrichment)uploaded++;recordError='';persistRecorder();update();}})();try{await upload;}catch(e){recordError='Menghubungkan ulang?';update();throw e;}finally{upload=undefined;}}
async function startRecorder(){
 recordError='';recorder=spawn(nativePath(),['record-all'],{windowsHide:true,stdio:['pipe','pipe','pipe']});const child=recorder;
 await new Promise<void>((resolve,reject)=>{let ready=false;const timer=setTimeout(()=>{child.kill();reject(new Error('Recorder tidak merespons.'));},10000);
 createInterface({input:child.stdout!}).on('line',line=>{try{const row=JSON.parse(line.replace(/^\uFEFF/,''));if(row.kind==='ready'){ready=true;clearTimeout(timer);recordActiveSince=performance.now();recording=true;update();resolve();}if(row.kind==='step'||row.kind==='enrichment'){queue.push({...row.step,enrichment:row.kind==='enrichment'});if(row.kind==='step')captured++;lastEvent=row.step.event;persistRecorder();update();void flush().catch(()=>{});}if(row.kind==='error'){recordError=row.error;update();if(!ready){clearTimeout(timer);reject(new Error(row.error));}}}catch{recordError='Penyimpanan lokal gagal. Rekaman dijeda.';void pause().catch(()=>{});update();}});
 child.on('error',()=>{clearTimeout(timer);reject(new Error('Recorder Windows tidak tersedia.'));});child.on('exit',()=>{if(recorder===child){recorder=undefined;freezeRecording();if(ready)recordError='Rekaman terjeda. Tekan lanjut.';update();}if(!ready){clearTimeout(timer);reject(new Error('Recorder gagal dimulai.'));}});
 });
}
async function pause(){const child=recorder;recorder=undefined;freezeRecording();update();if(child){await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},2000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin?.on('error',()=>{});child.stdin?.write('stop\n');});}persistRecorder();}
async function stop(){if(stopping)return stopping;stopping=(async()=>{stopRequested=true;await pause();persistRecorder();await flush();if(recordingId)await api(`/v1/recordings/${recordingId}/stop`,{});recordingId='';stopRequested=false;recordError='';persistRecorder();update();})();try{await stopping;}finally{stopping=undefined;}}
async function record(){if(session?.role!=='assistant')throw new Error('Hanya asisten yang bisa merekam.');if(recordingId)throw new Error('Hentikan rekaman sebelumnya dulu.');const name='Sesi '+new Date().toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});const r=await api('/v1/recordings',{name,process:'*'});recordingId=r.recordingId;recordElapsedMs=0;recordActiveSince=0;captured=uploaded=0;queue=[];stopRequested=false;persistRecorder();await startRecorder();return state();}
async function openChat(capturedContext?:WindowInfo){
 if(!session){showPanel();return;}if(session.role!=='student'){showPanel();return;}if(chat.isVisible()){hideChat();return;}
 const pointer=screen.getCursorScreenPoint();
 // Capture the foreground window before opening chat, within the hotkey callback.
 if(capturedContext)studentContext=capturedContext;
 else try{const current=JSON.parse(execFileSync(nativePath(),['foreground'],{windowsHide:true,timeout:2000,encoding:'utf8'}).trim().replace(/^\uFEFF/,''));if(current)studentContext=current;}catch{}
 chatAnchor=pointer;sizeChat(false);
 chat.webContents.send('chat:open',{context:studentContext?.process||'Desktop'});chat.show();chat.focus();chat.webContents.focus();chat.webContents.send('chat:open',{context:studentContext?.process||'Desktop'});update();
}
function syncRole(){
 globalShortcut.unregisterAll();shortcutHelper?.kill();shortcutHelper=undefined;hotkey=false;
 if(session?.role==='student'){
  const child=spawn(nativePath(),['hotkey'],{windowsHide:true,stdio:['ignore','pipe','pipe']});shortcutHelper=child;
  createInterface({input:child.stdout!}).on('line',line=>{try{const row=JSON.parse(line.replace(/^\uFEFF/,''));if(row.kind==='ready'){hotkey=true;update();}if(row.kind==='hotkey'){hotkeyAt=Date.now();void openChat(row.context||undefined).catch(error=>{chatError=error.message;update();});}}catch{}});
  child.on('error',()=>{hotkey=false;update();});child.on('exit',()=>{if(shortcutHelper===child){hotkey=false;update();}});
 }
 toolbar.hide();chat.hide();buddy.hide();hideGuide();
 if(session?.role==='assistant'){panel.hide();toolbar.showInactive();}
 else if(session?.role==='student'){panel.hide();}
 else showPanel();
 tray.setToolTip(session?`Lighthouse · ${session.group.name}`:'Lighthouse');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'Lighthouse',enabled:false},{label:'Group',click:showPanel},...(session?.role==='student'?[{label:'Tanya Lighthouse · Alt+L',click:()=>{void openChat();}}]:[]),{type:'separator'},{label:'Tutup Lighthouse',click:()=>{void quit();}}]));update();
}
async function quit(){if(recordingId){try{await stop();}catch{persistRecorder();}}quitting=true;app.quit();}
async function guideStream(body:unknown,requestId:string){
 const response=await fetch(apiBase+'/v1/guide',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session!.token}`},body:JSON.stringify({...body as object,stream:true}),signal:AbortSignal.timeout(150000)});
 if(!response.ok){const data=await response.json() as any;throw new Error(data.error||'Jawaban belum tersedia.');}
 if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return response.json();
 if(!response.body)throw new Error('Jawaban kosong.');
 const decoder=new TextDecoder();let buffer='',result:any,total=0;
 const consume=(line:string)=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='delta'){if(typeof event.text!=='string'||(total+=event.text.length)>4000)throw new Error('Jawaban tidak valid.');chat.webContents.send('chat:delta',{requestId,text:event.text});}else if(event.type==='result')result=event.command;else if(event.type==='error')throw new Error(event.message||'Jawaban terputus.');};
 for await(const chunk of response.body as any){buffer+=decoder.decode(chunk,{stream:true});if(buffer.length>65536)throw new Error('Jawaban terlalu besar.');let end;while((end=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
 buffer+=decoder.decode();consume(buffer);if(!result)throw new Error('Jawaban terputus. Coba lagi.');return result;
}
async function observeOutcome(target:WindowInfo,command:any){
 let outcome:'observed'|'not-observed'|'unverifiable'='unverifiable';
 for(let attempt=0;attempt<3;attempt++){
  await new Promise(resolve=>setTimeout(resolve,400));
  try{outcome=verifyOutcome(command.step.capture?.preState,command.step.capture?.postState,await native(['snapshot',target.handle]));}catch{outcome='unverifiable';}
  if(outcome!=='not-observed')break;
 }
 await api('/v1/ack',{cmdId:command.cmdId,stepId:command.step.stepId,resolved:true,strategy:null,interaction:'target-clicked',outcome});
}
function watchTarget(target:WindowInfo,locator:unknown,action:string,command:any){
 const child=spawn(nativePath(),['watch',target.handle,Buffer.from(JSON.stringify(locator)).toString('base64'),action],{windowsHide:true,stdio:['ignore','pipe','pipe']});guideWatcher=child;guideStatus='watching';
 createInterface({input:child.stdout!}).on('line',line=>{try{if(guideWatcher!==child)return;const event=JSON.parse(line.replace(/^\uFEFF/,''));if(event.kind==='target-position'){const b=event.bounds;if([b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0){const r=screen.screenToDipRect(null,{x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)});guidePoint={x:r.x+r.width/2-16,y:r.y+r.height/2-16};}}else if(event.kind==='target-clicked'||event.kind==='target-lost'||event.kind==='error'){hideGuide();guideStatus=event.kind;if(event.kind==='target-clicked')void observeOutcome(target,command).catch(()=>{});chat.webContents.send('chat:target',{status:event.kind==='target-clicked'?'clicked':'lost'});}}catch{}});
 child.on('error',()=>{if(guideWatcher===child){hideGuide();guideStatus='watch-error';}});child.on('exit',(code)=>{if(guideWatcher===child){hideGuide();guideStatus='watch-exit-'+code;}});
}
async function guide(input:any){
 if(session?.role!=='student')throw new Error('Bergabung sebagai mahasiswa untuk bertanya.');
 let context=studentContext;
 if(context){const windows:WindowInfo[]=await native(['windows']);if(!windows.some(w=>w.handle===context!.handle))context=undefined;}
 const snapshot=context?await native(['snapshot',context.handle]):{visibleNames:[]};
 const question=typeof input?.question==='string'?input.question.trim().slice(0,1000):'';
 if(!question&&!input?.next)throw new Error('Tulis pertanyaanmu dulu.');
 hideGuide();
 const command=await guideStream({...(input?.next&&lastRecording?{recordingId:lastRecording}:{}),question,afterSeq:input?.next?lastSeq:0,visibleNames:snapshot.visibleNames||[],activeProcess:context?.process||''},typeof input?.requestId==='string'?input.requestId.slice(0,80):'');
 hideGuide();if(command.done)return {done:true,message:'Kamu sudah sampai di akhir rekaman.'};
 const windows:WindowInfo[]=await native(['windows']);const matches=windows.filter(w=>w.process===command.step.window.process);
 const target=context?.process===command.step.window.process?context:matches.length===1?matches[0]:undefined;
 const resolution=target?await native(['resolve',target.handle,Buffer.from(JSON.stringify(command.step.target)).toString('base64')]):{resolved:false,reason:matches.length>1?'Ada beberapa jendela aplikasi. Buka jendela yang kamu pakai, lalu tekan Alt+L lagi.':`Buka ${command.step.window.process} dulu, lalu tekan Alt+L lagi.`};
 if(resolution.resolved){const b=resolution.bounds;if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)throw new Error('Elemen belum bisa ditunjuk.');const r=screen.screenToDipRect(null,{x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)});guidePoint={x:r.x+r.width/2-16,y:r.y+r.height/2-16};watchTarget(target!,command.step.target,command.step.event,command);lastSeq=command.step.seq;lastRecording=command.step.recordingId;}
 await api('/v1/ack',{cmdId:command.cmdId,stepId:command.step.stepId,resolved:Boolean(resolution.resolved),strategy:resolution.strategy||null});
 return {message:command.explanation||command.say,instruction:command.say,resolved:Boolean(resolution.resolved),reason:resolution.reason||'',source:command.source,seq:command.step.seq,total:command.total};
}
app.whenReady().then(async()=>{
 storage=localCrypto(app.getPath('userData'),nativePath());
 try{const p=path.join(app.getPath('userData'),'membership.enc');if(existsSync(p)&&safeStorage.isEncryptionAvailable())session=JSON.parse(decryptLocal(readFileSync(p)));}catch{}
 if(!safeStorage.isEncryptionAvailable())throw new Error('Encrypted local storage is unavailable');
 journal=new RecorderStore(path.join(app.getPath('userData'),'recorder.enc'),s=>storage.encrypt(s),b=>decryptLocal(b));
 try{const saved=journal.load();if(saved&&session?.role==='assistant'&&saved.groupId===session.group.groupId){recordingId=saved.recordingId;queue=saved.queue;captured=saved.captured;uploaded=saved.uploaded;recordElapsedMs=saved.elapsedMs;stopRequested=saved.stopRequested;if(recordingId)recordError='Rekaman dipulihkan. Lanjutkan saat siap.';}}catch{recordError='Rekaman lokal tidak dapat dibaca.';}
 const shared={frame:false,show:false,webPreferences};
 panel=new BrowserWindow({...shared,width:480,height:550,resizable:false,backgroundColor:'#f7f8fa'});
 toolbar=new BrowserWindow({...shared,width:400,height:76,resizable:false,transparent:true,alwaysOnTop:true,skipTaskbar:true});
 chat=new BrowserWindow({...shared,width:380,height:430,resizable:false,transparent:true,alwaysOnTop:true,skipTaskbar:true});
 marker=new BrowserWindow({...shared,width:100,height:50,transparent:true,alwaysOnTop:true,focusable:false,skipTaskbar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});marker.setIgnoreMouseEvents(true);
 buddy=new BrowserWindow({...shared,width:32,height:32,transparent:true,alwaysOnTop:true,focusable:false,skipTaskbar:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});buddy.setIgnoreMouseEvents(true);
 [panel,toolbar,chat,marker,buddy].forEach(secure);
 for(const w of [panel,toolbar,chat])w.on('close',e=>{if(!quitting){e.preventDefault();w.hide();}});
 const handle=(name:string,allowed:()=>BrowserWindow[],fn:(input:any)=>unknown)=>ipcMain.handle(name,async(e,input)=>{if(!allowed().some(w=>w.webContents===e.sender)||e.senderFrame!==e.sender.mainFrame)throw new Error('Invalid sender');return fn(input);});
 const all=()=>[panel,toolbar,chat],manage=()=>[panel,toolbar];
 handle('lab:state',all,state);handle('lab:group',all,()=>api('/v1/group'));
 handle('lab:create',()=>[panel],async input=>{if(session)throw new Error('Keluar dari group sebelumnya dulu.');session=await api('/v1/groups',input);save();syncRole();return state();});
 handle('lab:join',()=>[panel],async input=>{if(session)throw new Error('Keluar dari group sebelumnya dulu.');session=await api('/v1/join',input);save();lastSeq=0;lastRecording='';syncRole();return state();});
 handle('lab:leave',manage,async()=>{if(recordingId)await stop();try{await api('/v1/leave',{});}catch{}session=undefined;save();syncRole();return state();});
 handle('lab:close',manage,async()=>{if(recordingId)await stop();await api('/v1/group/close',{});session=undefined;save();syncRole();return state();});
 handle('lab:settings',manage,input=>api('/v1/group/settings',input));
 handle('lab:copy',manage,()=>{if(session)clipboard.writeText(session.group.code);});
 handle('lab:record',()=>[toolbar],record);handle('lab:pause',()=>[toolbar],async()=>{await pause();return state();});
 handle('lab:resume',()=>[toolbar],async()=>{if(stopRequested)throw new Error('Sesi sedang diselesaikan. Tunggu sinkronisasi.');if(!recordingId||recording)throw new Error('Tidak ada rekaman yang dijeda.');await startRecorder();return state();});
 handle('lab:stop',()=>[toolbar],async()=>{await stop();return state();});
 handle('lab:chat-size',()=>[chat],input=>sizeChat(input?.expanded===true,Number.isFinite(input?.width)?input.width:116,Number.isFinite(input?.height)?input.height:180));
 handle('lab:guide',()=>[chat],guide);handle('lab:open-chat',()=>[panel],()=>openChat());handle('lab:hide-chat',()=>[chat],hideChat);
 handle('lab:show-panel',all,showPanel);handle('lab:hide-panel',()=>[panel],()=>panel.hide());handle('lab:quit',manage,quit);
 await Promise.all([panel.loadFile(path.join(dir,'ui/panel.html')),toolbar.loadFile(path.join(dir,'ui/toolbar.html')),chat.loadFile(path.join(dir,'ui/chat.html')),marker.loadFile(path.join(dir,'ui/marker.html')),buddy.loadFile(path.join(dir,'ui/buddy.html'))]);
 const work=screen.getPrimaryDisplay().workArea;toolbar.setPosition(Math.round(work.x+(work.width-400)/2),work.y+18);
 tray=new Tray(nativeImage.createFromPath(path.join(dir,'ui/tray.png')));tray.on('click',()=>{if(session?.role==='assistant')toolbar.show();else showPanel();});
 syncRole();
 setInterval(()=>{if(recordingId&&!upload){persistRecorder();if(stopRequested)void stop().catch(()=>{});else if(queue.length)void flush().catch(()=>{});}},5000).unref();
 setInterval(()=>{
  if(session?.role!=='student'||panel.isVisible()){buddy.hide();buddyPosition=undefined;return;}
  const p=screen.getCursorScreenPoint();
  if(chat.isVisible()&&(p.x!==chatAnchor.x||p.y!==chatAnchor.y)){chatAnchor=p;sizeChat(chatSize.expanded,chatSize.width,chatSize.height);}
  const a=screen.getDisplayNearestPoint(guidePoint||p).workArea;
  const point=guidePoint||{x:p.x+19,y:p.y+9};
  const target={x:Math.max(a.x,Math.min(point.x,a.x+a.width-32)),y:Math.max(a.y,Math.min(point.y,a.y+a.height-32))};
  if(!buddyPosition)buddyPosition={x:p.x+19,y:p.y+9};
  if(!guidePoint&&Math.hypot(target.x-buddyPosition.x,target.y-buddyPosition.y)>600)buddyPosition=target;
  else{buddyPosition.x+=(target.x-buddyPosition.x)*.22;buddyPosition.y+=(target.y-buddyPosition.y)*.22;}
  buddy.setPosition(Math.round(buddyPosition.x),Math.round(buddyPosition.y));buddy.showInactive();
 },16).unref();
});
app.on('window-all-closed',()=>{});
app.on('before-quit',event=>{if(!quitting){event.preventDefault();void quit();return;}globalShortcut.unregisterAll();shortcutHelper?.kill();guideWatcher?.kill();recorder?.kill();});
