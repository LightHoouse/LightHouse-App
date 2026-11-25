import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
if(process.platform==='win32') {
  const framework=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319');
  mkdirSync('native/bin',{recursive:true});
  execFileSync(path.join(framework,'csc.exe'),['/nologo','/target:exe',`/out:${path.resolve('native/bin/LighthouseBridge.exe')}`,
    `/reference:${path.join(framework,'WPF','UIAutomationClient.dll')}`,`/reference:${path.join(framework,'WPF','UIAutomationTypes.dll')}`,`/reference:${path.join(framework,'WPF','WindowsBase.dll')}`,
    '/reference:System.Security.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',path.resolve('native/Bridge.cs')],{stdio:'inherit'});
} else if(process.platform==='darwin') {
  mkdirSync('native/bin',{recursive:true});
  const bridge=path.resolve('native/bin/LighthouseBridge');
  const compile=(target,output)=>execFileSync('swiftc',[
    '-swift-version','5','-O','-target',target,
    '-framework','AppKit','-framework','ApplicationServices','-framework','CoreGraphics',
    path.resolve('native/macos/LighthouseBridge.swift'),'-o',output
  ],{stdio:'inherit'});
  if(process.env.LIGHTHOUSE_MAC_ARCH==='universal'){
    const x64=path.resolve('native/bin/LighthouseBridge-x64');
    const arm64=path.resolve('native/bin/LighthouseBridge-arm64');
    try{
      compile('x86_64-apple-macosx10.13',x64);
      compile('arm64-apple-macosx11.0',arm64);
      execFileSync('lipo',['-create',x64,arm64,'-output',bridge],{stdio:'inherit'});
    }finally{
      rmSync(x64,{force:true});rmSync(arm64,{force:true});
    }
  }else{
    const arch=process.env.LIGHTHOUSE_MAC_ARCH||process.arch;
    const target=arch==='arm64'?'arm64-apple-macosx11.0':'x86_64-apple-macosx10.13';
    compile(target,bridge);
  }
}
