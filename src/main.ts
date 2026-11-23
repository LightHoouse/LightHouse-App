import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mqtt, { type MqttClient } from 'mqtt';
const dir = path.dirname(fileURLToPath(import.meta.url));
let overlay: BrowserWindow;
let panel: BrowserWindow;
let client: MqttClient | undefined;
const seen = new Set<string>();
let connection = 'MQTT belum dikonfigurasi. Demo tampilan tersedia.';
const webPreferences = { preload: path.join(dir, 'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false };
function secure(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}
async function show(label: string) {
  const area = screen.getPrimaryDisplay().workArea;
  overlay.setPosition(area.x + area.width - 400, area.y + 40);
  overlay.webContents.send('guide:text', label.slice(0, 2000));
  overlay.showInactive();
}
function connect() {
  const { MQTT_URL:url, LIGHTHOUSE_SESSION_ID:sessionId, LIGHTHOUSE_STUDENT_ID:studentId } = process.env;
  if (!url || !sessionId || !studentId) return;
  if (!/^[\w-]+$/.test(sessionId) || !/^[\w-]+$/.test(studentId) || !url.startsWith('mqtts://')) {
    connection = 'Konfigurasi MQTT tidak valid (perlu TLS dan ID tanpa pemisah topic).'; return;
  }
  client = mqtt.connect(url, { username:process.env.MQTT_USERNAME, password:process.env.MQTT_PASSWORD, rejectUnauthorized:true, ca:process.env.MQTT_CA_CERT || undefined, clientId:`lighthouse-${studentId}-${process.pid}` });
  const base = `lab/${sessionId}/student/${studentId}`;
  client.on('error', () => { connection = 'Koneksi MQTT gagal. Periksa konfigurasi.'; });
  client.on('connect', () => { connection = 'MQTT terhubung.'; client!.subscribe(`${base}/cmd`, {qos:1}); });
  client.on('message', async (topic, payload) => {
    if (topic !== `${base}/cmd` || payload.length > 1_000_000) return;
    try {
      const c = JSON.parse(payload.toString());
      if (c.schemaVersion !== 1 || c.mode !== 'guide' || c.sessionId !== sessionId || c.studentId !== studentId || typeof c.cmdId !== 'string' || typeof c.say !== 'string' || !Number.isFinite(c.issuedAt) || !Number.isInteger(c.ttlMs) || c.ttlMs <= 0 || c.ttlMs > 300000 || !['say','pointTo','highlight','scrollTo'].includes(c.action)) return;
      if (seen.has(c.cmdId)) return;
      seen.add(c.cmdId);
      if (seen.size > 10000) seen.delete(seen.values().next().value!);
      const expired = Date.now() > c.issuedAt + c.ttlMs;
      // Coordinate guesses must never be presented as a resolved live element.
      const supported = c.action === 'say';
      if (!expired && supported) await show(c.say);
      const status = expired ? 'expired' : supported ? 'shown' : 'failed';
      client!.publish(`${base}/ack`, JSON.stringify({schemaVersion:1,cmdId:c.cmdId,studentId,ts:Date.now(),ok:status === 'shown',status,verified:false,resolution:{strategyUsed:null,strategyKind:null,surface:null,attempts:[]},verification:{visible:status === 'shown',insideContainer:false,nameMatches:false,postConditionMet:false},matchedElement:null,error:status === 'shown' ? null : {code:expired ? 'EXPIRED' : 'LOCATOR_RESOLVER_UNAVAILABLE',message:expired ? 'Command expired' : 'Live locator resolution is not implemented'},snapshotRef:null,latencyMs:0}), {qos:1});
    } catch { connection = 'Pesan MQTT tidak valid ditolak.'; }
  });
}
app.whenReady().then(async () => {
  overlay = new BrowserWindow({width:360,height:160,transparent:true,frame:false,alwaysOnTop:true,focusable:false,show:false,webPreferences});
  overlay.setIgnoreMouseEvents(true);
  panel = new BrowserWindow({width:720,height:540,show:false,webPreferences});
  secure(panel); secure(overlay);
  ipcMain.handle('guide:status', event => event.sender === panel.webContents ? connection : null);
  ipcMain.handle('guide:demo', async event => { if (event.sender === panel.webContents) await show('Ini panduan demo Lighthouse. Mouse tetap bisa digunakan.'); });
  ipcMain.handle('guide:hide', event => { if (event.sender === panel.webContents) overlay.hide(); });
  await Promise.all([panel.loadFile(path.join(dir,'ui/panel.html')), overlay.loadFile(path.join(dir,'ui/overlay.html'))]);
  connect(); panel.show();
  panel.on('closed', () => app.quit());
});
app.on('before-quit', () => client?.end(true));

