import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let overlay: BrowserWindow | undefined;
function createOverlay() {
  overlay = new BrowserWindow({width:220,height:90, transparent:true, frame:false, alwaysOnTop:true, resizable:false, show:false, webPreferences:{preload:path.join(__dirname,"preload.js")}});
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(__dirname,"overlay.html"));
}
ipcMain.handle("overlay:show", (_event, point:{x:number;y:number;label:string}) => { if (!overlay) return; overlay.setPosition(Math.round(point.x), Math.round(point.y)); overlay.webContents.send("overlay:point", point); overlay.showInactive(); });
ipcMain.handle("overlay:hide", () => overlay?.hide());
app.whenReady().then(() => { createOverlay(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });


