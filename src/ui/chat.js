const $ = id => document.getElementById(id);
const api = window.lighthouse;
const measure = document.createElement('canvas').getContext('2d');
let busy = false, activeRequest;
const plain = text => String(text || '').replace(/\*\*([^*]+)\*\*/g, '$1');
function fit() {
  measure.font = getComputedStyle($('question')).font;
  const width = Math.ceil(Math.min(260, Math.max(36, measure.measureText($('question').value || $('question').placeholder).width + 22)));
  document.documentElement.style.setProperty('--pill-width', width + 'px');
  const contentHeight = [...$('messages').children].reduce((sum, el) => sum + el.getBoundingClientRect().height + 12, 0);
  return api.expandChat({expanded: !document.body.classList.contains('compact'), width, height: contentHeight + 105});
}
function message(text, kind) {
  const row = document.createElement('div'); row.className = `message ${kind}`;
  row.textContent = plain(text); $('messages').append(row); row.scrollIntoView({block:'end'}); return row;
}
function targetHint(result) {
  return result.event === 'dragDrop' ? 'Tekan, tahan, lalu tarik mengikuti kursor biru' : result.event === 'keypress' ? 'Tekan ' + result.shortcut : result.event === 'scroll' ? (result.shortcut ? result.shortcut + ' + scroll mengikuti kursor biru' : 'Scroll mengikuti arah kursor biru') : 'Klik target yang ditunjuk kursor biru';
}
async function ask() {
  const question = $('question').value.trim(); if (busy || !question) return;
  busy = true; $('send').disabled = true; document.body.classList.remove('compact');
  message(question, 'user'); $('question').value = '';
  const pending = message('', 'assistant pending');pending.setAttribute('aria-label','Lighthouse sedang berpikir');const dots=document.createElement('span');dots.className='thinking-dots';dots.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)dots.append(document.createElement('i'));pending.append(dots);
  const requestId = crypto.randomUUID(); activeRequest = {requestId, pending, text:''};
  try {
    await fit();
    const result = await api.guide({question, requestId});
    pending.removeAttribute('aria-label');pending.classList.remove('pending'); pending.textContent = plain(result.message || result.instruction);
    if (result.reason) { const note=document.createElement('div'); note.className='response-note'; note.textContent=result.reason; pending.append(note); }
    let resolved = !!result.resolved;
    if (resolved) { const label=document.createElement('span'); label.className='target-found'; label.textContent=targetHint(result); pending.append(label); }
    else if (result.answerMode === 'explain') {
      try {
        const guided = await api.guide({next: true});
        if (guided && guided.resolved) { resolved = true; const label=document.createElement('span'); label.className='target-found'; label.textContent=targetHint(guided); pending.append(label); }
        else if (guided && guided.reason) { const note=document.createElement('div'); note.className='response-note'; note.textContent=guided.reason; pending.append(note); }
      } catch {}
    }
    pending.dataset.source = result.source || ''; pending.dataset.resolved = String(resolved);
  } catch (error) {
    pending.removeAttribute('aria-label');pending.classList.remove('pending'); pending.classList.add('failed');
    pending.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally {
    pending.dataset.streaming='false'; activeRequest=undefined; busy=false; $('send').disabled=false;
    void fit(); pending.scrollIntoView({block:'end'}); $('question').focus();
  }
}
api.onDelta(event => {
  if (!activeRequest || event.requestId !== activeRequest.requestId) return;
  const current=activeRequest; current.text+=event.text; current.pending.textContent=plain(current.text);
  current.pending.removeAttribute('aria-label');current.pending.classList.remove('pending'); current.pending.dataset.streaming='true';
  current.pending.dataset.deltas=String(Number(current.pending.dataset.deltas || 0)+1);
  void fit(); current.pending.scrollIntoView({block:'end'});
});
$('question').addEventListener('input',()=>{void fit();});
$('ask-form').onsubmit=event=>{event.preventDefault();void ask();};
$('question').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void ask();}};
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')void api.hideChat();
  else if(event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){
    event.preventDefault();
    const box=$('messages');
    if(box&&box.children.length){
      document.body.classList.remove('compact');
      void fit();
      box.scrollBy({top:event.key==='ArrowUp'?-140:140,behavior:'smooth'});
    }
  }
});
api.onChatOpen(state=>{document.body.classList.toggle('compact',$('messages').children.length===0);$('context').textContent=state.context;void fit();$('question').focus();setTimeout(()=>$('question').focus(),60);});
window.addEventListener('focus',()=>{$('question').focus();});
document.fonts.ready.then(fit);

api.onTarget(event=>{const label=[...document.querySelectorAll('.target-found')].at(-1);if(label)label.textContent=event.status==='clicked'?'Target sudah diklik':event.status==='gesture'?'Gerakan sudah teramati':'Target berubah. Tanya lagi untuk menunjuk ulang.';});

api.onPlacement(position=>{document.body.classList.toggle('above',position.above);document.body.classList.toggle('left',position.left);});
