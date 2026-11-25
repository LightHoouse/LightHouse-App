import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'docs/screenshots');mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
try {
const page=await browser.newPage({viewport:{width:500,height:700}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const noop=()=>{};
 const group={name:'Praktikum desain',code:'DEMO1234',askEnabled:true};
 const member={memberId:'demo',name:'Mahasiswa Demo',role:'student',device:{localIps:['192.168.1.24']}};
 const demo={session:null,version:'0.3.3',uploaded:18,lastExport:'demo.lighthouse',importPreview:{name:'Latihan bentuk',fileName:'latihan.lighthouse',actions:18,apps:['Paint'],createdAt:1795521600000}};
 window.demo=demo;window.demoGroup=group;
 window.lighthouse={state:async()=>demo,group:async()=>({group,members:[member]}),management:async()=>({members:[member],questions:[{memberId:'demo',question:'ID input ini apa?',answer:'ID belum tersedia di rekaman ini. Input mana yang dimaksud?',at:1795521600000}],savedAt:1795521600000}),recordings:async()=>[{name:'Latihan bentuk',fileName:'latihan.lighthouse',actions:18,sizeBytes:24576,createdAt:1795521600000}],cursor:async()=>({shape:'arrow',color:'#3380ff'}),setCursor:async value=>value,shortcuts:async()=>[{label:'Buka chat mahasiswa',key:'Alt + L'},{label:'Mulai / jeda / lanjut',key:'Alt + Shift + R'},{label:'Stop dan simpan',key:'Alt + Shift + S'}],onState:noop,onPanel:noop,onManagement:noop,onImportPreview:noop,onShortcuts:noop,onCursor:noop};
});
await page.goto(pathToFileURL(path.join(root,'src/ui/panel.html')).href);
await page.evaluate(()=>document.fonts.ready);
const shot=async name=>{
 if(errors.length)throw Error(errors.join('\n'));
 if(await page.locator('img').evaluateAll(imgs=>imgs.some(i=>!i.complete||!i.naturalWidth)))throw Error('Broken image');
 await page.screenshot({path:path.join(output,name),fullPage:true});
};
await shot('01-welcome.png');
await page.locator('#create-tab').click();await shot('02-create-group.png');
await page.evaluate(()=>{demo.session={role:'assistant',group:demoGroup};state(demo);});
await page.locator('#manage-nav').click();await page.locator('.member-row').waitFor();await shot('03-classroom.png');
await page.locator('.member-row').click();await page.locator('.question-item').click();await shot('04-question-detail.png');
await page.locator('#settings-header').click();await page.locator('#cursor-shapes button').first().waitFor();await shot('05-settings-cursor.png');
await page.locator('#settings-back').click();await page.locator('#recordings-nav').click();await page.locator('.recording-card').waitFor();await shot('06-recordings.png');
await page.locator('#shortcuts-nav').click();await page.locator('.shortcut-row').first().waitFor();await shot('07-shortcuts.png');
await page.locator('.window-tools').screenshot({path:path.join(output,'window-controls.png')});
const helper=await browser.newPage({viewport:{width:32,height:32},deviceScaleFactor:2});
await helper.addInitScript(()=>{window.lighthouse={cursor:async()=>({shape:'arrow',color:'#3380ff'}),onCursor:()=>{}};});
await helper.goto(pathToFileURL(path.join(root,'src/ui/buddy.html')).href);
await helper.locator('#cursor-shape').waitFor();
await helper.screenshot({path:path.join(output,'mouse-helper.png'),omitBackground:true});
} finally {await browser.close();}
