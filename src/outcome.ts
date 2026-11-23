type Element={automationId:string;role:string;name:string;enabled:boolean;selected:boolean|null;checkedValue:boolean|null;expanded:boolean|null};
type State={elements:Element[]};
const identity=(e:Element)=>JSON.stringify([e.automationId,e.role,e.name]);
const values=(e:Element)=>JSON.stringify([e.enabled,e.selected,e.checkedValue,e.expanded]);
/** Verify only observable recorded changes, never infer overall task completion. */
export function verifyOutcome(pre:State|null|undefined,post:State|null|undefined,live:State|null|undefined):'observed'|'not-observed'|'unverifiable'{
 if(!pre||!post||!live)return 'unverifiable';
 const before=new Map(pre.elements.map(e=>[identity(e),e]));
 const changes=post.elements.filter(e=>!before.has(identity(e))||values(before.get(identity(e))!)!==values(e));
 if(!changes.length)return 'unverifiable';
 const current=new Map(live.elements.map(e=>[identity(e),e]));
 return changes.every(e=>current.has(identity(e))&&values(current.get(identity(e))!)===values(e))?'observed':'not-observed';
}
