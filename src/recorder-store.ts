import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
export type RecorderJournal={schemaVersion:1;groupId:string;recordingId:string;queue:any[];captured:number;uploaded:number;elapsedMs:number;stopRequested:boolean};
export class RecorderStore {
 constructor(private file:string,private encrypt:(text:string)=>Buffer,private decrypt:(data:Buffer)=>string){}
 save(value:RecorderJournal){mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';writeFileSync(tmp,this.encrypt(JSON.stringify(value)));const fd=openSync(tmp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,this.file);}
 load():RecorderJournal|undefined{if(!existsSync(this.file))return;const value=JSON.parse(this.decrypt(readFileSync(this.file)));if(value.schemaVersion!==1||!Array.isArray(value.queue)||typeof value.groupId!=='string'||typeof value.recordingId!=='string'||typeof value.stopRequested!=='boolean'||![value.captured,value.uploaded,value.elapsedMs].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||value.uploaded>value.captured||value.queue.some((e:any)=>!e||typeof e.eventId!=='string'||typeof e.enrichment!=='boolean'))throw new Error('Invalid recording journal');return value;}
}
