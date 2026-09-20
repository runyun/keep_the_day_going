const STORAGE_KEY = 'dailyQuestState';
const HOUR_HEIGHT = 60;
const PASTEL_COLORS = ['#fff59d','#ffccbc','#c8e6c9','#bbdefb','#e1bee7','#ffe0b2'];

// ---------- State ----------
function loadState(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){ try { return JSON.parse(saved); } catch(e){} }
  return {
    level:1, xp:0, xpToNext:70,
    momentum:70, points:0,
    lastActiveDate: todayStr(),
    activities: [], rules: [], redemptions: []
  };
}
let state = loadState();
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ---------- Helpers ----------
function todayStr(){ return new Date().toISOString().slice(0,10); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }

function isDoneToday(a){ return a.completions.some(c=>c.date===todayStr()); }

function getStreak(a){
  const set = new Set(a.completions.map(c=>c.date));
  let streak=0;
  let d = new Date();
  if(!set.has(todayStr())) d.setDate(d.getDate()-1);
  while(true){
    const ds = d.toISOString().slice(0,10);
    if(set.has(ds)){ streak++; d.setDate(d.getDate()-1); } else break;
  }
  return streak;
}

function applyMomentumDecay(){
  const last = new Date(state.lastActiveDate);
  const today = new Date(todayStr());
  const diffDays = Math.round((today-last)/86400000);
  if(diffDays>0){
    state.momentum = Math.max(0, state.momentum - diffDays*15);
    state.lastActiveDate = todayStr();
    saveState();
  }
}

function recalcPoints(){
  let earned = 0;
  state.activities.forEach(a=>a.completions.forEach(c=>earned += c.points));
  const spent = state.redemptions.reduce((s,r)=>s+r.cost, 0);
  state.points = earned - spent;
}

function recalcLevel(){
  let totalXP = 0;
  state.activities.forEach(a=>a.completions.forEach(c=>{
    totalXP += (c.xpGained !== undefined) ? c.xpGained : c.stars*10;
  }));
  let level = 1, xpToNext = 70, remaining = totalXP;
  while(remaining >= xpToNext){
    remaining -= xpToNext;
    level++;
    xpToNext = Math.round(xpToNext*1.2);
  }
  state.level = level;
  state.xp = remaining;
  state.xpToNext = xpToNext;
}

// ---------- Modal generic ----------
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=>closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.add('hidden'); });
});

// ---------- Header menu ----------
document.getElementById('menuBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('menuDropdown').classList.toggle('hidden');
});
document.getElementById('detailMoreBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('detailMoreMenu').classList.toggle('hidden');
});
document.addEventListener('click', ()=>{
  document.getElementById('menuDropdown').classList.add('hidden');
  document.getElementById('detailMoreMenu').classList.add('hidden');
});
document.querySelectorAll('#menuDropdown button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const action = btn.dataset.action;
    if(action==='add') openModal('addModal');
    if(action==='history'){ renderHistoryModal(); openModal('historyModal'); }
    if(action==='rewards'){ renderRewardsModal(); openModal('rewardsModal'); }
    if(action==='rules'){ renderRulesBoard(); openModal('rulesModal'); }
    if(action==='reset'){
      if(confirm('This will erase ALL data (activities, history, points, rules). Are you sure?')){
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      }
    }
  });
});
document.getElementById('rulesTip').addEventListener('click', ()=>{
  renderRulesBoard();
  openModal('rulesModal');
});

// ---------- Rendering ----------
function renderStats(){
  document.getElementById('levelNum').textContent = state.level;
  document.getElementById('xpFill').style.width = Math.min(100, state.xp/state.xpToNext*100)+'%';
  document.getElementById('xpText').textContent = `${state.xp}/${state.xpToNext}`;
  document.getElementById('momentumFill').style.width = state.momentum+'%';
  document.getElementById('momentumText').textContent = state.momentum+'%';
  document.getElementById('pointsText').textContent = state.points+'pt';
}

let ruleTipIndex = 0;
function renderRulesTip(){
  const el = document.getElementById('rulesTipText');
  if(state.rules.length===0){ el.textContent = 'No rules yet — tap to add one!'; return; }
  ruleTipIndex = ruleTipIndex % state.rules.length;
  el.textContent = '📌 ' + state.rules[ruleTipIndex].text;
}
setInterval(()=>{
  if(state.rules.length>0){
    ruleTipIndex = (ruleTipIndex+1) % state.rules.length;
    renderRulesTip();
  }
}, 4000);

function renderUnscheduled(){
  const container = document.getElementById('unscheduledList');
  container.innerHTML='';
  const items = state.activities.filter(a=>!a.time);
  if(items.length===0){
    container.innerHTML = '<div style="color:#aaa;font-size:13px;">Nothing unscheduled 🎉</div>';
    return;
  }
  items.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'unscheduled-item' + (isDoneToday(a) ? ' done':'');
    div.innerHTML = `<span>${a.memo ? a.name+' — '+a.memo : a.name}</span>` + (isDoneToday(a) ? '<span>✓</span>' : '');
    div.addEventListener('click', ()=>openDetail(a.id));
    container.appendChild(div);
  });
}

function renderTimeline(){
  const timeline = document.getElementById('timeline');
  timeline.innerHTML='';
  for(let h=0; h<24; h++){
    const row = document.createElement('div');
    row.className='hour-row';
    row.style.top = (h*HOUR_HEIGHT)+'px';
    row.innerHTML = `<div class="hour-label">${String(h).padStart(2,'0')}:00</div><div class="hour-line"></div>`;
    timeline.appendChild(row);
  }
  const nowLine = document.createElement('div');
  nowLine.id='nowLine';
  nowLine.className='now-line';
  timeline.appendChild(nowLine);

  const nowMinutes = new Date().getHours()*60+new Date().getMinutes();

  state.activities.filter(a=>a.time).forEach(a=>{
    const top = (timeToMinutes(a.time)/60)*HOUR_HEIGHT;
    const height = Math.max(28, (a.duration/60)*HOUR_HEIGHT);
    const done = isDoneToday(a);
    const overdue = !done && (timeToMinutes(a.time)+a.duration) < nowMinutes;
    const card = document.createElement('div');
    card.className = 'activity-card' + (done?' done':'') + (overdue?' overdue':'');
    card.style.top = top+'px';
    card.style.height = height+'px';
    const streak = getStreak(a);
    card.innerHTML = `<span class="name">${done?'✓ ':''}${a.name}</span>${a.memo?' — '+a.memo:''}${streak>0?`<span class="streak-badge">🔥${streak}</span>`:''}`;
    card.addEventListener('click', ()=>openDetail(a.id));
    timeline.appendChild(card);
  });

  updateNowLine();
}

function updateNowLine(){
  const nowLine = document.getElementById('nowLine');
  if(!nowLine) return;
  const now = new Date();
  const minutes = now.getHours()*60+now.getMinutes();
  nowLine.style.top = (minutes/60*HOUR_HEIGHT)+'px';
  nowLine.setAttribute('data-time', now.toTimeString().slice(0,5));
}

function scrollToNow(){
  const container = document.getElementById('timelineContainer');
  const minutes = new Date().getHours()*60+new Date().getMinutes();
  const top = minutes/60*HOUR_HEIGHT;
  container.scrollTop = Math.max(0, top - container.clientHeight/2);
}

function renderAll(){
  renderStats();
  renderRulesTip();
  renderUnscheduled();
  renderTimeline();
}

// ---------- Add Activity ----------
document.getElementById('addConfirmBtn').addEventListener('click', ()=>{
  const name = document.getElementById('addName').value.trim();
  if(!name){ alert('Please enter a name'); return; }
  const memo = document.getElementById('addMemo').value.trim();
  const time = document.getElementById('addTime').value || null;
  const duration = Number(document.getElementById('addDuration').value) || 30;
  state.activities.push({ id: uid(), name, memo, time, duration, completions: [] });
  saveState();
  document.getElementById('addName').value='';
  document.getElementById('addMemo').value='';
  document.getElementById('addTime').value='';
  document.getElementById('addDuration').value=30;
  closeModal('addModal');
  renderAll();
});

// ---------- Detail Modal ----------
let currentDetailId = null;

function openDetail(id){
  currentDetailId = id;
  const a = state.activities.find(x=>x.id===id);
  if(!a) return;
  document.getElementById('detailName').textContent = a.name + (a.memo ? ' — '+a.memo : '');
  document.getElementById('detailStreak').textContent = `🔥 ${getStreak(a)} day streak`;
  document.getElementById('editTime').value = a.time || '';
  document.getElementById('editDuration').value = a.duration;
  document.getElementById('starPicker').classList.add('hidden');

  const completeBtn = document.getElementById('completeBtn');
  if(isDoneToday(a)){
    completeBtn.textContent = '✓ Completed Today';
    completeBtn.disabled = true;
  } else {
    completeBtn.textContent = '✓ Mark Complete';
    completeBtn.disabled = false;
  }

  renderDetailHistory(a);
  document.getElementById('detailMoreMenu').classList.add('hidden');
  openModal('detailModal');
}

function renderDetailHistory(a){
  const list = document.getElementById('detailHistory');
  list.innerHTML='';
  if(a.completions.length===0){
    list.innerHTML = '<div style="color:#aaa;font-size:13px;">No history yet</div>';
    return;
  }
  a.completions.slice().sort((x,y)=>y.date.localeCompare(x.date)).forEach(c=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${c.date}</span><span>${'⭐'.repeat(c.stars)} (+${c.points}pt)</span>`;
    list.appendChild(div);
  });
}

document.getElementById('completeBtn').addEventListener('click', ()=>{
  document.getElementById('starPicker').classList.remove('hidden');
});

document.querySelectorAll('.star-opt').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    completeActivity(currentDetailId, Number(btn.dataset.stars));
  });
});

function completeActivity(id, stars){
  const a = state.activities.find(x=>x.id===id);
  if(!a) return;
  const xpGained = stars*10;
  const oldMomentum = state.momentum;
  const newMomentum = Math.min(100, oldMomentum+8);
  const momentumGained = newMomentum - oldMomentum;

  a.completions.push({
    date: todayStr(), stars, points: stars,
    xpGained, momentumGained
  });

  state.momentum = newMomentum;
  state.lastActiveDate = todayStr();

  recalcPoints();
  recalcLevel();

  saveState();
  closeModal('detailModal');
  renderAll();
}

document.getElementById('deleteTodayBtn').addEventListener('click', ()=>{
  const a = state.activities.find(x=>x.id===currentDetailId);
  if(!a) return;

  const todaysCompletions = a.completions.filter(c=>c.date===todayStr());
  todaysCompletions.forEach(c=>{
    state.momentum = Math.max(0, state.momentum - (c.momentumGained || 0));
  });

  a.completions = a.completions.filter(c=>c.date!==todayStr());

  recalcPoints();
  recalcLevel();

  saveState();
  closeModal('detailModal');
  renderAll();
});

document.getElementById('deleteActivityBtn').addEventListener('click', ()=>{
  if(!confirm('Delete this activity permanently?')) return;

  const a = state.activities.find(x=>x.id===currentDetailId);
  if(a){
    a.completions.filter(c=>c.date===todayStr()).forEach(c=>{
      state.momentum = Math.max(0, state.momentum - (c.momentumGained || 0));
    });
  }

  state.activities = state.activities.filter(x=>x.id!==currentDetailId);

  recalcPoints();
  recalcLevel();

  saveState();
  closeModal('detailModal');
  renderAll();
});

document.getElementById('saveScheduleBtn').addEventListener('click', ()=>{
  const a = state.activities.find(x=>x.id===currentDetailId);
  if(!a) return;
  a.time = document.getElementById('editTime').value || null;
  a.duration = Number(document.getElementById('editDuration').value) || 30;
  saveState();
  closeModal('detailModal');
  renderAll();
});

// ---------- History Modal ----------
function renderHistoryModal(){
  const list = document.getElementById('historyList');
  list.innerHTML='';
  const all = [];
  state.activities.forEach(a=>{ a.completions.forEach(c=>all.push({name:a.name, ...c})); });
  if(all.length===0){ list.innerHTML = '<div style="color:#aaa;">No history yet</div>'; return; }
  all.sort((x,y)=>y.date.localeCompare(x.date)).forEach(c=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${c.date} — ${c.name}</span><span>${'⭐'.repeat(c.stars)} (+${c.points}pt)</span>`;
    list.appendChild(div);
  });
}

// ---------- Rewards Modal ----------
function renderRewardsModal(){
  const earned = state.activities.reduce((sum,a)=>sum+a.completions.reduce((s,c)=>s+c.points,0),0);
  const spent = state.redemptions.reduce((s,r)=>s+r.cost,0);
  document.getElementById('rewardsSummary').textContent =
    `🎁 ${state.points}pt available · Lifetime: +${earned}pt earned / -${spent}pt spent`;

  const list = document.getElementById('redeemHistory');
  list.innerHTML='';
  if(state.redemptions.length===0){ list.innerHTML = '<div style="color:#aaa;font-size:13px;">No redemptions yet</div>'; return; }
  state.redemptions.slice().sort((x,y)=>y.date.localeCompare(x.date)).forEach(r=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${r.date} — ${r.name}</span><span>-${r.cost}pt</span>`;
    list.appendChild(div);
  });
}

document.getElementById('redeemBtn').addEventListener('click', ()=>{
  const name = document.getElementById('rewardName').value.trim();
  const cost = Number(document.getElementById('rewardCost').value);
  if(!name || !cost || cost<=0){ alert('Enter a valid reward name and cost'); return; }
  if(cost > state.points){ alert('Not enough points'); return; }
  state.points -= cost;
  state.redemptions.push({date: todayStr(), name, cost});
  saveState();
  document.getElementById('rewardName').value='';
  document.getElementById('rewardCost').value='';
  renderRewardsModal();
  renderStats();
});

// ---------- Rules Board ----------
function renderRulesBoard(){
  const board = document.getElementById('rulesBoard');
  board.innerHTML='';
  if(state.rules.length===0){
    board.innerHTML = '<div style="color:#fff;opacity:.85;">No rules yet. Add your first one below 👇</div>';
    return;
  }
  state.rules.forEach(r=>{
    const note = document.createElement('div');
    note.className='sticky-note';
    note.style.background = r.color;
    note.style.transform = `rotate(${r.rotate}deg)`;
    note.innerHTML = `<div class="pin">📌</div>${r.text}<button class="del-note" data-id="${r.id}">✕</button>`;
    board.appendChild(note);
  });
  board.querySelectorAll('.del-note').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.dataset.id;
      state.rules = state.rules.filter(r=>r.id!==id);
      saveState();
      renderRulesBoard();
      renderRulesTip();
    });
  });
}

document.getElementById('addRuleBtn').addEventListener('click', ()=>{
  const input = document.getElementById('newRuleInput');
  const text = input.value.trim();
  if(!text) return;
  state.rules.push({
    id: uid(), text,
    color: PASTEL_COLORS[Math.floor(Math.random()*PASTEL_COLORS.length)],
    rotate: Math.floor(Math.random()*8)-4
  });
  input.value='';
  saveState();
  renderRulesBoard();
  renderRulesTip();
});

// ---------- What Now ----------
let whatNowCurrentId = null;

document.getElementById('whatNowBtn').addEventListener('click', ()=>{
  showWhatNow();
  openModal('whatNowModal');
});

function showWhatNow(){
  const candidates = state.activities.filter(a=>!isDoneToday(a));
  const card = document.getElementById('whatNowCard');
  const doItBtn = document.getElementById('doItBtn');
  if(candidates.length===0){
    card.textContent = '🎉 Everything is done for today!';
    whatNowCurrentId = null;
    doItBtn.disabled = true;
    return;
  }
  const pick = candidates[Math.floor(Math.random()*candidates.length)];
  whatNowCurrentId = pick.id;
  card.textContent = pick.memo ? `${pick.name} — ${pick.memo}` : pick.name;
  doItBtn.disabled = false;
}

document.getElementById('shuffleBtn').addEventListener('click', showWhatNow);
document.getElementById('doItBtn').addEventListener('click', ()=>{
  if(!whatNowCurrentId) return;
  closeModal('whatNowModal');
  openDetail(whatNowCurrentId);
});

// ---------- Init ----------
applyMomentumDecay();
renderAll();
scrollToNow();
setInterval(updateNowLine, 30000);