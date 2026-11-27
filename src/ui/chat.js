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
function addGuideAction(container, text) {
  const existing = container.querySelector('.guide-next-btn');
  if (existing) existing.remove();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'guide-next-btn';
  btn.textContent = text;
  btn.onclick = () => { btn.remove(); void runNext(); };
  container.append(btn);
}
async function runNext() {
  if (busy) return;
  busy = true; $('send').disabled = true; document.body.classList.remove('compact');
  const pending = message('', 'assistant pending'); pending.setAttribute('aria-label', 'Lighthouse sedang menunjuk langkah');
  const dots = document.createElement('span'); dots.className = 'thinking-dots'; dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
  pending.append(dots);
  const requestId = crypto.randomUUID(); activeRequest = {requestId, pending, text: ''};
  try {
    await fit();
    const result = await api.guide({next: true, requestId});
    pending.removeAttribute('aria-label'); pending.classList.remove('pending'); pending.textContent = plain(result.message || result.instruction);
    if (result.reason) { const note = document.createElement('div'); note.className = 'response-note'; note.textContent = result.reason; pending.append(note); }
    if (result.resolved) { const label = document.createElement('span'); label.className = 'target-found'; label.textContent = result.event === 'dragDrop' ? 'Tekan, tahan, lalu tarik mengikuti kursor biru' : result.event === 'keypress' ? 'Tekan ' + result.shortcut : result.event === 'scroll' ? (result.shortcut ? result.shortcut + ' + scroll mengikuti kursor biru' : 'Scroll mengikuti arah kursor biru') : 'Klik target yang ditunjuk kursor biru'; pending.append(label); }
    pending.dataset.source = result.source || ''; pending.dataset.resolved = String(!!result.resolved);
  } catch (error) {
    pending.removeAttribute('aria-label'); pending.classList.remove('pending'); pending.classList.add('failed');
    pending.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally {
    pending.dataset.streaming = 'false'; activeRequest = undefined; busy = false; $('send').disabled = false;
    void fit(); pending.scrollIntoView({block: 'end'}); $('question').focus();
  }
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
    if (result.resolved) { const label=document.createElement('span'); label.className='target-found'; label.textContent=result.event==='dragDrop'?'Tekan, tahan, lalu tarik mengikuti kursor biru':result.event==='keypress'?'Tekan '+result.shortcut:result.event==='scroll'?(result.shortcut?result.shortcut+' + scroll mengikuti kursor biru':'Scroll mengikuti arah kursor biru'):'Klik target yang ditunjuk kursor biru'; pending.append(label); }
    else if (result.answerMode === 'explain') { addGuideAction(pending, 'Tunjukkan langkah di layar'); }
    pending.dataset.source = result.source || ''; pending.dataset.resolved = String(!!result.resolved);
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
document.addEventListener('keydown',event=>{if(event.key==='Escape')void api.hideChat();});
api.onChatOpen(state=>{document.body.classList.add('compact');$('context').textContent=state.context;void fit();$('question').focus();});
document.fonts.ready.then(fit);

api.onTarget(event=>{const label=[...document.querySelectorAll('.target-found')].at(-1);if(label){label.textContent=event.status==='clicked'?'Target sudah diklik':event.status==='gesture'?'Gerakan sudah teramati':'Target berubah. Tanya lagi untuk menunjuk ulang.';if((event.status==='clicked'||event.status==='gesture')&&label.parentElement){addGuideAction(label.parentElement,'Langkah berikutnya');void fit();}}});

api.onPlacement(position=>{document.body.classList.toggle('above',position.above);document.body.classList.toggle('left',position.left);});
