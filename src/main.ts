import { app, BrowserWindow, ipcMain, screen } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mqtt from "mqtt";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let overlay: BrowserWindow | undefined;
function overlayAsset() { return app.isPackaged ? path.join(process.resourcesPath, "overlay.html") : path.join(__dirname, "../src/overlay.html"); }
function createOverlay() {
  overlay = new BrowserWindow({ width:260, height:110, transparent:true, frame:false, alwaysOnTop:true, resizable:false, show:false, webPreferences:{ preload:path.join(__dirname,"preload.js"), contextIsolation:true, sandbox:true } });
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(overlayAsset());
}
function showGuide(point: {x:number;y:number;label:string}) { if (!overlay) return; overlay.setPosition(Math.round(point.x), Math.round(point.y)); overlay.webContents.send("overlay:point", point); overlay.showInactive(); }
ipcMain.handle("overlay:show", (_event, point: {x:number;y:number;label:string}) => showGuide(point));
ipcMain.handle("overlay:hide", () => overlay?.hide());
function pointFromCommand(command: any) {
  const visual = command.locators?.find((item:any) => item.kind === "visual" && Array.isArray(item.relativeBox));
  const display = overlay ? screen.getPrimaryDisplay() : undefined;
  const area = display?.workArea ?? {x:100,y:100,width:800,height:600};
  const box = visual?.relativeBox ?? [0.5,0.45,0,0];
  return { x:area.x + box[0] * area.width, y:area.y + box[1] * area.height, label:command.say || "Ikuti langkah ini" };
}
function connectMqtt() {
  const url = process.env.MQTT_URL; const sessionId = process.env.LIGHTHOUSE_SESSION_ID; const studentId = process.env.LIGHTHOUSE_STUDENT_ID;
  if (!url || !sessionId || !studentId) return;
  const client = mqtt.connect(url, { username:process.env.MQTT_USERNAME, password:process.env.MQTT_PASSWORD, rejectUnauthorized:true, clientId:`lighthouse-app-${studentId}` });
  client.on("connect", () => client.subscribe(`lab/${sessionId}/student/${studentId}/cmd`, { qos:1 }));
  client.on("message", (_topic, payload) => { try { const command = JSON.parse(payload.toString()); if (command.action === "say") { showGuide({x:120,y:120,label:command.say}); } else { showGuide(pointFromCommand(command)); } client.publish(`lab/${sessionId}/student/${studentId}/ack`, JSON.stringify({ schemaVersion:1, cmdId:command.cmdId, studentId, ts:Date.now(), ok:true, status:"shown", verified:false, resolution:{strategyUsed:null,strategyKind:null,surface:null,attempts:[]}, verification:{visible:true,insideContainer:false,nameMatches:false,postConditionMet:false}, matchedElement:null,error:null,snapshotRef:null,latencyMs:0 }), {qos:1}); } catch {} });
}
app.whenReady().then(() => { createOverlay(); connectMqtt(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

