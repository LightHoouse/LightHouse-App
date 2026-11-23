const $=id=>document.getElementById(id),api=window.lighthouse;
let current,seq=0,busy=false;
function state(s){current=s;$('welcome').hidden=!!s.session;$('room').hidden=!s.session;if(!s.session)return;
 $('group-title').textContent=s.session.group.name;$('group-code').textContent=s.session.group.code;$('role').textContent=s.session.role==='assistant'?'Asisten':'Mahasiswa';
 $('assistant').hidden=s.session.role!=='assistant';$('close-group').hidden=s.session.role!=='assistant';
 $('record').hidden=!!s.recordingId;$('pause').hidden=!s.recording;$('resume').hidden=!s.recordingId||s.recording;$('stop').hidden=!s.recordingId;
 $('record-status').textContent=s.recordError || (s.recordingId?`${s.recording?'● Merekam':'Dijeda'} · ${s.uploaded}/${s.captured} langkah tersimpan${s.lastStep?' · '+s.lastStep:''}`:'Siap merekam');
 $('window').disabled=!!s.recordingId;
}
async function action(fn){if(busy)return;busy=true;$('error').textContent='';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){$('error').textContent=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function refreshWindows(){const old=$('window').value;const list=await api.windows();$('window').replaceChildren(new Option('Pilih jendela aplikasi',''),...list.map(w=>new Option(`${w.title} · ${w.process}`,w.handle)));if(list.some(w=>w.handle===old))$('window').value=old;}
async function refreshGroup(){if(!current?.session)return;const g=await api.group();$('members').textContent=`${g.members.length} anggota · ${g.members.map(m=>m.name).join(', ')}`;const old=$('recordings').value;$('recordings').replaceChildren(new Option(g.recordings.length?'Pilih rekaman':'Belum ada rekaman',''),...g.recordings.map(r=>new Option(`${r.name}${r.status==='recording'?' · berlangsung':''}`,r.recordingId)));if(g.recordings.some(r=>r.recordingId===old))$('recordings').value=old;else if(g.recordings.length===1)$('recordings').value=g.recordings[0].recordingId;$('connection').textContent='Group terhubung';}
async function entered(s){state(s);seq=0;await refreshWindows();await refreshGroup();}
$('create').onclick=()=>action(async()=>{await entered(await api.create({name:$('name').value,groupName:$('group-name').value||'Praktikum'}));});
$('join').onclick=()=>action(async()=>{await entered(await api.join({name:$('name').value,code:$('code').value.trim().toUpperCase()}));});
$('leave').onclick=()=>action(async()=>{state(await api.leave());seq=0;});
$('close-group').onclick=()=>action(async()=>{if(confirm('Tutup group? Semua anggota akan keluar dari sesi ini.'))state(await api.close());});
$('refresh-windows').onclick=()=>action(refreshWindows);$('refresh-recordings').onclick=()=>action(refreshGroup);
$('record').onclick=()=>action(async()=>state(await api.record({handle:$('window').value,name:$('record-name').value||'Demonstrasi'})));
for(const name of ['pause','resume','stop'])$(name).onclick=()=>action(async()=>{state(await api[name]());if(name==='stop')await refreshGroup();});
async function guide(question){if(!$('recordings').value)throw new Error('Pilih rekaman terlebih dahulu.');$('answer').textContent='Mencari langkah yang sesuai…';const r=await api.guide({handle:$('window').value,recordingId:$('recordings').value,question,afterSeq:seq});if(r.done){$('answer').textContent='Semua langkah sudah ditampilkan.';return;}if(r.resolution.resolved)seq=r.step.seq;$('answer').textContent=`${r.source==='ai'?'AI · ':''}Langkah ${r.step.seq}/${r.total}: ${r.say} ${r.resolution.resolved?'Elemen ditemukan dan disorot.':r.resolution.reason} ${r.explanation||''}`;}
$('ask').onclick=()=>action(()=>{if(!$('question').value.trim())throw new Error('Tulis nama elemen yang dicari.');return guide($('question').value);});$('next').onclick=()=>action(()=>guide(''));
$('restart').onclick=()=>{seq=0;$('answer').textContent='Panduan diulang dari langkah pertama.';api.hide();};$('recordings').onchange=()=>{seq=0;$('answer').textContent='';api.hide();};$('hide').onclick=()=>api.hide();
api.onState(state);action(async()=>{state(await api.state());if(current.session)await entered(current);});
setInterval(()=>{if(current?.session&&!busy)refreshGroup().catch(()=>{$('connection').textContent='Koneksi terputus atau group ditutup. Coba muat ulang.';});},5000);
