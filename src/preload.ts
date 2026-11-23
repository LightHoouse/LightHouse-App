import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("lighthouse", { showGuide:(point:{x:number;y:number;label:string}) => ipcRenderer.invoke("overlay:show", point), hideGuide:() => ipcRenderer.invoke("overlay:hide") });
