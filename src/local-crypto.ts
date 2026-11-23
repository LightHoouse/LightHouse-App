import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,openSync,fsyncSync,closeSync,renameSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
// DPAPI protects a durable profile key; Chromium's asynchronously saved key can be lost on first-run crashes.
export function localCrypto(directory:string,helper:string){
 const file=path.join(directory,'storage-key.dpapi');mkdirSync(directory,{recursive:true});
 const transform=(mode:string,value:Buffer)=>Buffer.from(execFileSync(helper,[mode],{input:value.toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000}).trim(),'base64');
 let key:Buffer;
 if(existsSync(file))key=transform('unprotect',readFileSync(file));
 else{key=randomBytes(32);const tmp=file+'.tmp';writeFileSync(tmp,transform('protect',key));const fd=openSync(tmp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,file);}
 if(key.length!==32)throw new Error('Invalid protected profile key');
 return {
 encrypt(text:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([Buffer.from('LH1'),iv,cipher.getAuthTag(),data]);},
 decrypt(data:Buffer){if(data.subarray(0,3).toString()!=='LH1')throw new Error('Legacy encryption');const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(3,15));decipher.setAuthTag(data.subarray(15,31));return Buffer.concat([decipher.update(data.subarray(31)),decipher.final()]).toString('utf8');}
 };
}
