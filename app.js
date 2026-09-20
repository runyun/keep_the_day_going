const STORAGE_KEY = 'dailyQuestState';
const HOUR_HEIGHT = 60;
const PASTEL_COLORS = ['#fff59d','#ffccbc','#c8e6c9','#bbdefb','#e1bee7','#ffe0b2'];

// ---------- State ----------
function loadState(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){ try { return JSON.parse(saved); } catch(e){} }
  return {
    level:1, xp:0, xpToNext:70,
    momentum:50, points:0,
    lastActiveDate: todayStr(),
    activities: [], rules: [], redemptions: [], rewardPresets: [], todos: []
  };
}
let state = loadState();
if(!state.rewardPresets) state.rewardPresets = [];
if(!state.todos) state.todos = [];
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ---------- Helpers ----------
function todayStr(){ return new Date().toISOString().slice(0,10); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }

function formatTime12(hhmm){
  if(!hhmm) return '';
  const [h,m] = hhmm.split(':').map(Number);
  const period = h>=12 ? 'pm':'am';
  const h12 = h%12===0 ? 12 : h%12;
  return `${h12}:${String(m).padStart(2,'0')}${period}`;
}

function formatDateShort(dateStr){
  const [y,m,d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function fmtDate(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function getTodayCompletions(a){ return a.completions.filter(c=>c.date===todayStr()); }

function getCardMemo(a){
  const todays = getTodayCompletions(a);
  if(todays.length>0) return todays[todays.length-1].memo;
  return a.memo;
}

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
    if(action==='todo'){ renderTodoBoard(); openModal('todoModal'); }
    if(action==='reset'){
      if(confirm('This will erase ALL data (activities, history, points, rules, to-dos). Are you sure?')){
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

// ---------- Rendering: Stats / Rules Tip / Todo Tags ----------
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

function renderTodoTags(){
  const container = document.getElementById('todoTagRow');
  const dates = [...new Set(state.todos.map(t=>t.date))].sort();
  if(dates.length===0){ container.classList.add('hidden'); container.innerHTML=''; return; }
  container.classList.remove('hidden');
  container.innerHTML = `<span class="todo-label">📅</span>` + dates.map(d=>{
    const overdue = d < todayStr();
    return `<span class="todo-tag ${overdue?'overdue':''}" data-date="${d}">${formatDateShort(d)}</span>`;
  }).join('');
  container.querySelectorAll('.todo-tag').forEach(tag=>{
    tag.addEventListener('click', ()=>{ renderTodoBoard(); openModal('todoModal'); });
  });
}

// ---------- Unscheduled / Timeline ----------
function renderUnscheduled(){
  const container = document.getElementById('unscheduledList');
  container.innerHTML='';
  const items = state.activities.filter(a=>!a.time);
  if(items.length===0){
    container.innerHTML = '<div style="color:#aaa;font-size:13px;">Nothing unscheduled 🎉</div>';
    return;
  }
  items.forEach(a=>{
    const todays = getTodayCompletions(a);
    const memo = getCardMemo(a);
    const div = document.createElement('div');
    div.className = 'unscheduled-item' + (todays.length>0 ? ' done':'');
    div.innerHTML = `<span>${todays.length>0?'✓ ':''}${a.name}${memo?' — '+memo:''}${todays.length>0?' ×'+todays.length:''}</span>`;
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
    const todays = getTodayCompletions(a);
    const done = todays.length>0;
    const overdue = !done && (timeToMinutes(a.time)+a.duration) < nowMinutes;
    const memo = getCardMemo(a);
    const streak = getStreak(a);
    const card = document.createElement('div');
    card.className = 'activity-card' + (done?' done':'') + (overdue?' overdue':'');
    card.style.top = top+'px';
    card.style.height = height+'px';
    card.innerHTML = `<span class="name">${done?'✓ ':''}${a.name}</span>${memo?' — '+memo:''}${done?' ×'+todays.length:''}${streak>0?`<span class="streak-badge">🔥${streak}</span>`:''}`;
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
  renderTodoTags();
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
  document.getElementById('detailName').textContent = a.name;
  document.getElementById('detailStreak').textContent = `🔥 ${getStreak(a)} day streak`;
  document.getElementById('detailMemo').value = a.memo || '';
  document.getElementById('editTime').value = a.time || '';
  document.getElementById('editDuration').value = a.duration;
  document.getElementById('starPicker').classList.add('hidden');

  renderDetailToday(a);
  renderDetailHistory(a);
  document.getElementById('detailMoreMenu').classList.add('hidden');
  openModal('detailModal');
}

document.getElementById('detailMemo').addEventListener('blur', ()=>{
  const a = state.activities.find(x=>x.id===currentDetailId);
  if(!a) return;
  a.memo = document.getElementById('detailMemo').value.trim();
  saveState();
  renderUnscheduled();
  renderTimeline();
});

function renderDetailToday(a){
  const container = document.getElementById('detailToday');
  const todays = a.completions.filter(c=>c.date===todayStr());
  if(todays.length===0){
    container.innerHTML = '<div style="color:#aaa;font-size:13px;">Not completed yet today</div>';
    return;
  }
  container.innerHTML='';
  todays.forEach(c=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${formatTime12(c.at)} — ${c.memo||''} ${'⭐'.repeat(c.stars)}</span><span>${c.points}pt <button class="del-completion" data-id="${c.id}">✕</button></span>`;
    container.appendChild(div);
  });
  container.querySelectorAll('.del-completion').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      deleteCompletion(a.id, btn.dataset.id);
    });
  });
}

function renderDetailHistory(a){
  const list = document.getElementById('detailHistory');
  list.innerHTML='';
  const past = a.completions.filter(c=>c.date!==todayStr());
  if(past.length===0){
    list.innerHTML = '<div style="color:#aaa;font-size:13px;">No history yet</div>';
    return;
  }
  past.slice().sort((x,y)=>y.date.localeCompare(x.date)).forEach(c=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${c.date} — ${c.memo||''}</span><span>${'⭐'.repeat(c.stars)} (${c.points}pt)</span>`;
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
  const now = new Date();
  const at = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const xpGained = stars*10;
  const oldMomentum = state.momentum;
  const newMomentum = Math.min(100, oldMomentum+8);
  const momentumGained = newMomentum - oldMomentum;

  a.completions.push({
    id: uid(), date: todayStr(), at, memo: a.memo || '',
    stars, points: stars, xpGained, momentumGained
  });

  state.momentum = newMomentum;
  state.lastActiveDate = todayStr();

  recalcPoints();
  recalcLevel();
  saveState();

  document.getElementById('starPicker').classList.add('hidden');
  openDetail(id);
  renderStats();
  renderUnscheduled();
  renderTimeline();
}

function deleteCompletion(activityId, completionId){
  const a = state.activities.find(x=>x.id===activityId);
  if(!a) return;
  const c = a.completions.find(x=>x.id===completionId);
  if(!c) return;
  state.momentum = Math.max(0, state.momentum - (c.momentumGained || 0));
  a.completions = a.completions.filter(x=>x.id!==completionId);
  recalcPoints();
  recalcLevel();
  saveState();
  openDetail(activityId);
  renderStats();
  renderUnscheduled();
  renderTimeline();
}

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

// ---------- History Modal (global, all-time) ----------
function renderHistoryModal(){
  const list = document.getElementById('historyList');
  list.innerHTML='';
  const all = [];
  state.activities.forEach(a=>{ a.completions.forEach(c=>all.push({name:a.name, ...c})); });
  if(all.length===0){ list.innerHTML = '<div style="color:#aaa;">No history yet</div>'; return; }
  all.sort((x,y)=> (y.date+y.at).localeCompare(x.date+x.at)).forEach(c=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${c.date} — ${c.name}${c.memo?' ('+c.memo+')':''}</span><span>${'⭐'.repeat(c.stars)} (${c.points}pt)</span>`;
    list.appendChild(div);
  });
}

// ---------- Rewards Modal ----------
function renderRewardPresets(){
  const list = document.getElementById('rewardPresetList');
  list.innerHTML='';
  if(state.rewardPresets.length===0){
    list.innerHTML = '<div style="color:#aaa;font-size:13px;">No saved rewards yet — add one below</div>';
    return;
  }
  state.rewardPresets.forEach(p=>{
    const div = document.createElement('div');
    div.className='preset-item';
    div.innerHTML = `<span>${p.name} — ${p.cost}pt</span>
      <div class="preset-actions">
        <button class="btn-primary" data-redeem="${p.id}">Redeem</button>
        <button class="btn-secondary" data-delpreset="${p.id}">✕</button>
      </div>`;
    list.appendChild(div);
  });
  list.querySelectorAll('[data-redeem]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const preset = state.rewardPresets.find(p=>p.id===btn.dataset.redeem);
      redeemReward(preset.name, preset.cost);
    });
  });
  list.querySelectorAll('[data-delpreset]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.rewardPresets = state.rewardPresets.filter(p=>p.id!==btn.dataset.delpreset);
      saveState();
      renderRewardPresets();
    });
  });
}

function redeemReward(name, cost){
  if(cost > state.points){ alert('Not enough points'); return; }
  state.points -= cost;
  state.redemptions.push({id: uid(), date: todayStr(), name, cost});
  saveState();
  renderRewardsModal();
  renderStats();
}

document.getElementById('addPresetBtn').addEventListener('click', ()=>{
  const name = document.getElementById('presetName').value.trim();
  const cost = Number(document.getElementById('presetCost').value);
  if(!name || !cost || cost<=0){ alert('Enter a valid name and cost'); return; }
  state.rewardPresets.push({id: uid(), name, cost});
  saveState();
  document.getElementById('presetName').value='';
  document.getElementById('presetCost').value='';
  renderRewardPresets();
});

function groupRedemptions(list){
  const map = {};
  list.forEach(r=>{
    if(!map[r.name]) map[r.name] = {name:r.name, count:0, total:0};
    map[r.name].count++;
    map[r.name].total += r.cost;
  });
  return Object.values(map).sort((a,b)=>b.count-a.count);
}

function getWeekRangeStrings(){
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day===0 ? -6 : 1-day);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate()+diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+6);
  return { startStr: fmtDate(monday), endStr: fmtDate(sunday) };
}

function getRedemptionsInRange(startStr, endStr){
  return state.redemptions.filter(r=> r.date>=startStr && r.date<=endStr);
}

let rewardStatsTab = 'week';
let rewardStatsExpanded = false;

function renderRewardStats(){
  let list;
  if(rewardStatsTab==='week'){
    const { startStr, endStr } = getWeekRangeStrings();
    list = getRedemptionsInRange(startStr, endStr);
  } else {
    list = state.redemptions;
  }
  const grouped = groupRedemptions(list);
  const container = document.getElementById('rewardStatsList');
  const moreBtn = document.getElementById('rewardStatsMore');
  container.innerHTML = '';
  if(grouped.length===0){
    container.innerHTML = '<div style="color:#aaa;font-size:13px;">No redemptions yet</div>';
    moreBtn.classList.add('hidden');
    return;
  }
  const shown = rewardStatsExpanded ? grouped : grouped.slice(0,3);
  shown.forEach(g=>{
    const div = document.createElement('div');
    div.className='history-item';
    div.innerHTML = `<span>${g.name}</span><span>×${g.count} (${g.total}pt)</span>`;
    container.appendChild(div);
  });
  if(grouped.length > 3){
    moreBtn.classList.remove('hidden');
    moreBtn.textContent = rewardStatsExpanded ? '▴ Show less' : `▾ Show ${grouped.length-3} more`;
  } else {
    moreBtn.classList.add('hidden');
  }
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    rewardStatsTab = btn.dataset.tab;
    rewardStatsExpanded = false;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    renderRewardStats();
  });
});

document.getElementById('rewardStatsMore').addEventListener('click', ()=>{
  rewardStatsExpanded = !rewardStatsExpanded;
  renderRewardStats();
});

function renderRewardsModal(){
  document.getElementById('rewardsSummary').textContent = `🎁 ${state.points}pt available`;
  renderRewardPresets();
  rewardStatsTab = 'week';
  rewardStatsExpanded = false;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab==='week'));
  renderRewardStats();
}


// ---------- Rules Board ----------
function renderRulesBoard(){
  const board = document.getElementById('rulesBoard');
  board.innerHTML = '';
  if(state.rules.length===0){
    board.innerHTML = '<div style="color:#fff;opacity:.8;">No rules yet — add one below</div>';
    return;
  }
  state.rules.forEach((r,i)=>{
    const note = document.createElement('div');
    note.className = 'sticky-note';
    note.style.background = PASTEL_COLORS[i % PASTEL_COLORS.length];
    note.innerHTML = `<span class="pin">📌</span><span class="todo-text">${r.text}</span><button class="del-note" data-id="${r.id}">✕</button>`;
    board.appendChild(note);
  });
  board.querySelectorAll('.del-note').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.rules = state.rules.filter(r=>r.id!==btn.dataset.id);
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
  state.rules.push({ id: uid(), text });
  saveState();
  input.value = '';
  renderRulesBoard();
  renderRulesTip();
});
document.getElementById('newRuleInput').addEventListener('keydown', (e)=>{
  if(e.key==='Enter') document.getElementById('addRuleBtn').click();
});

// ---------- To-Do Board ----------
function renderTodoBoard(){
  const board = document.getElementById('todoBoard');
  board.innerHTML = '';
  if(state.todos.length===0){
    board.innerHTML = '<div style="color:#fff;opacity:.8;">No to-dos yet — add one below</div>';
    return;
  }
  const sorted = state.todos.slice().sort((a,b)=>{
    const ak = a.date + (a.time || '99:99');
    const bk = b.date + (b.time || '99:99');
    return ak.localeCompare(bk);
  });
  sorted.forEach((t,i)=>{
    const overdue = t.date < todayStr();
    const note = document.createElement('div');
    note.className = 'sticky-note' + (overdue ? ' overdue-note' : '');
    note.style.background = overdue ? '#ddd' : PASTEL_COLORS[i % PASTEL_COLORS.length];
    note.innerHTML = `<span class="pin">📌</span>
      <div class="todo-date">${formatDateShort(t.date)}${t.time ? ' · '+formatTime12(t.time) : ''}</div>
      <div class="todo-text">${t.text}</div>
      <button class="del-note" data-id="${t.id}">✕</button>`;
    board.appendChild(note);
  });
  board.querySelectorAll('.del-note').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.todos = state.todos.filter(t=>t.id!==btn.dataset.id);
      saveState();
      renderTodoBoard();
      renderTodoTags();
    });
  });
}

document.getElementById('addTodoBtn').addEventListener('click', ()=>{
  const date = document.getElementById('newTodoDate').value;
  const time = document.getElementById('newTodoTime').value || null;
  const text = document.getElementById('newTodoText').value.trim();
  if(!date || !text){ alert('Please enter a date and description'); return; }
  state.todos.push({ id: uid(), date, time, text });
  saveState();
  document.getElementById('newTodoDate').value = '';
  document.getElementById('newTodoTime').value = '';
  document.getElementById('newTodoText').value = '';
  renderTodoBoard();
  renderTodoTags();
});

// ---------- What Now ----------
let whatNowCurrentId = null;

function getWhatNowCandidates(){
  return state.activities.filter(a=> getTodayCompletions(a).length === 0);
}

function renderWhatNowCard(pickNew){
  const card = document.getElementById('whatNowCard');
  let candidates = getWhatNowCandidates();
  if(candidates.length===0) candidates = state.activities.slice();
  if(candidates.length===0){
    card.innerHTML = '😴 No activities yet — add one first!';
    whatNowCurrentId = null;
    document.getElementById('doItBtn').disabled = true;
    return;
  }
  document.getElementById('doItBtn').disabled = false;

  card.classList.add('spinning');
  card.innerHTML = `
    <div id="whatNowName"></div>
    <div id="whatNowTime" style="font-size:13px;color:#666;visibility:hidden;">placeholder</div>
    <div id="whatNowMemo" style="font-size:13px;color:#888;visibility:hidden;">placeholder</div>
  `;
  const nameEl = document.getElementById('whatNowName');
  const timeEl = document.getElementById('whatNowTime');
  const memoEl = document.getElementById('whatNowMemo');

  let ticks = 0;
  const spin = setInterval(()=>{
    const random = candidates[Math.floor(Math.random()*candidates.length)];
    nameEl.textContent = random.name;
    ticks++;
    if(ticks > 10){
      clearInterval(spin);
      card.classList.remove('spinning');
      const chosen = candidates[Math.floor(Math.random()*candidates.length)];
      whatNowCurrentId = chosen.id;
      nameEl.textContent = chosen.name;

      if(chosen.time){
        timeEl.textContent = `⏰ ${formatTime12(chosen.time)} · ${chosen.duration} min`;
        timeEl.style.visibility = 'visible';
      } else {
        timeEl.style.visibility = 'hidden';
      }

      if(chosen.memo){
        memoEl.textContent = chosen.memo;
        memoEl.style.visibility = 'visible';
      } else {
        memoEl.style.visibility = 'hidden';
      }
    }
  }, 80);
}


document.getElementById('whatNowBtn').addEventListener('click', ()=>{
  openModal('whatNowModal');
  renderWhatNowCard(true);
});
document.getElementById('shuffleBtn').addEventListener('click', ()=>{
  renderWhatNowCard(true);
});
document.getElementById('doItBtn').addEventListener('click', ()=>{
  if(!whatNowCurrentId) return;
  closeModal('whatNowModal');
  openDetail(whatNowCurrentId);
});

// ---------- Init ----------
applyMomentumDecay();
recalcPoints();
recalcLevel();
renderAll();
scrollToNow();

setInterval(()=>{ updateNowLine(); }, 30000);

// Refresh todo tags/overdue status at midnight-ish check every few minutes
setInterval(()=>{
  renderTodoTags();
  renderTimeline();
}, 60000);