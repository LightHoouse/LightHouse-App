import { contextBridge, ipcRenderer } from 'electron';
const call=(name:string)=>(input?:unknown)=>ipcRenderer.invoke(name,input);
contextBridge.exposeInMainWorld('lighthouse',{
  state:call('lab:state'),windows:call('lab:windows'),create:call('lab:create'),join:call('lab:join'),group:call('lab:group'),leave:call('lab:leave'),close:call('lab:close'),
  record:call('lab:record'),pause:call('lab:pause'),resume:call('lab:resume'),stop:call('lab:stop'),guide:call('lab:guide'),demo:call('guide:demo'),hide:call('guide:hide'),
  onState:(cb:(state:unknown)=>void)=>ipcRenderer.on('lab:state',(_e,value)=>cb(value)),
  onGuide:(cb:(text:string)=>void)=>ipcRenderer.on('guide:text',(_e,value)=>cb(value)),
});
