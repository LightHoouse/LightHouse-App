import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
if(process.platform==='win32') {
  const framework=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319');
  mkdirSync('native/bin',{recursive:true});
  execFileSync(path.join(framework,'csc.exe'),['/nologo','/target:exe',`/out:${path.resolve('native/bin/LighthouseBridge.exe')}`,
    `/reference:${path.join(framework,'WPF','UIAutomationClient.dll')}`,`/reference:${path.join(framework,'WPF','UIAutomationTypes.dll')}`,`/reference:${path.join(framework,'WPF','WindowsBase.dll')}`,
    '/reference:System.Security.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',path.resolve('native/Bridge.cs')],{stdio:'inherit'});
}
