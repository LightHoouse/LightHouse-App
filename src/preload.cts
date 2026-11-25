import {contextBridge,ipcRenderer} from 'electron';
const call=(name:string)=>(input?:unknown)=>ipcRenderer.invoke(name,input);
contextBridge.exposeInMainWorld('lighthouse',{
 cursor:call('lab:cursor'),setCursor:call('lab:set-cursor'),onCursor:(fn:(s:unknown)=>void)=>ipcRenderer.on('lab:cursor',(_e,s)=>fn(s)),
 chooseImport:call('lab:choose-import'),confirmImport:call('lab:confirm-import'),onImportPreview:(fn:()=>void)=>ipcRenderer.on('lab:import-preview',fn),
 management:call('lab:management'),recordings:call('lab:recordings'),deleteRecording:call('lab:delete-recording'),previewRecording:call('lab:preview-recording'),onPanel:(fn:()=>void)=>ipcRenderer.on('lab:panel-open',fn),onManagement:(fn:()=>void)=>ipcRenderer.on('lab:management-open',fn),importRecording:call('lab:import'),openRecordings:call('lab:open-recordings'),shortcuts:call('lab:shortcuts'),onShortcuts:(fn:()=>void)=>ipcRenderer.on('lab:shortcuts',fn),
 state:call('lab:state'),checkUpdate:call('lab:check-update'),openUpdate:call('lab:open-update'),group:call('lab:group'),create:call('lab:create'),join:call('lab:join'),leave:call('lab:leave'),close:call('lab:close'),settings:call('lab:settings'),copy:call('lab:copy'),
 record:call('lab:record'),pause:call('lab:pause'),resume:call('lab:resume'),stop:call('lab:stop'),guide:call('lab:guide'),expandChat:call('lab:chat-size'),openChat:call('lab:open-chat'),hideChat:call('lab:hide-chat'),showPanel:call('lab:show-panel'),hidePanel:call('lab:hide-panel'),quit:call('lab:quit'),
 onPlacement:(fn:(s:unknown)=>void)=>ipcRenderer.on('chat:placement',(_e,s)=>fn(s)),
 onTarget:(fn:(s:unknown)=>void)=>ipcRenderer.on('chat:target',(_e,s)=>fn(s)),
 onDelta:(fn:(s:unknown)=>void)=>ipcRenderer.on('chat:delta',(_e,s)=>fn(s)),
 onState:(fn:(s:unknown)=>void)=>ipcRenderer.on('lab:state',(_e,s)=>fn(s)),onChatOpen:(fn:(s:unknown)=>void)=>ipcRenderer.on('chat:open',(_e,s)=>fn(s)),
});
