import {contextBridge,ipcRenderer} from 'electron';
const call=(name:string)=>(input?:unknown)=>ipcRenderer.invoke(name,input);
contextBridge.exposeInMainWorld('lighthouse',{
 state:call('lab:state'),group:call('lab:group'),create:call('lab:create'),join:call('lab:join'),leave:call('lab:leave'),close:call('lab:close'),settings:call('lab:settings'),copy:call('lab:copy'),
 record:call('lab:record'),pause:call('lab:pause'),resume:call('lab:resume'),stop:call('lab:stop'),guide:call('lab:guide'),openChat:call('lab:open-chat'),hideChat:call('lab:hide-chat'),showPanel:call('lab:show-panel'),hidePanel:call('lab:hide-panel'),quit:call('lab:quit'),
 onState:(fn:(s:unknown)=>void)=>ipcRenderer.on('lab:state',(_e,s)=>fn(s)),onChatOpen:(fn:(s:unknown)=>void)=>ipcRenderer.on('chat:open',(_e,s)=>fn(s)),
});
