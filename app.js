const STORAGE_KEY = 'dailyQuestState';
const HOUR_HEIGHT = 60;
const PASTEL_COLORS = ['#fff59d','#ffccbc','#c8e6c9','#bbdefb','#e1bee7','#ffe0b2'];

// ---------- Spin Config ----------
const SPIN_BONUS = {
  small:   { points: 2,  xp: 0  },
  mediumR: { points: 5,  xp: 0  },
  mediumG: { points: 0,  xp: 15 },
  largeR:  { points: 10, xp: 0  },
  largeG:  { points: 0,  xp: 30 },
};

const SPIN_LABELS = {
  miss:    { emoji:'💨', text:'No luck this time', cls:'tier-miss' },
  small:   { emoji:'✨', text:'Small Win!', cls:'tier-small' },
  mediumR: { emoji:'💰', text:'Medium Win! (Reward)', cls:'tier-medium-r' },
  mediumG: { emoji:'🌟', text:'Medium Win! (Growth)', cls:'tier-medium-g' },
  largeR:  { emoji:'💎', text:'JACKPOT! (Reward)', cls:'tier-large-r' },
  largeG:  { emoji:'🚀', text:'JACKPOT! (Growth)', cls:'tier-large-g' },
};

/**
 * New spin probability model.
 * winChance = taskScale * momentumBase(momentum) + starBonus(stars)
 *
 * taskScale   = max(1/sqrt(taskCount), 0.4)   -> fewer tasks = higher win odds (keeps the game exciting
 *                                                 for users with few activities, and prevents users who
 *                                                 pile up tons of tasks from farming an unfairly high win rate)
 * momentumBase = 0.12 + 0.18 * (momentum/100) -> ranges 12% ~ 30% as momentum goes 0 -> 100
 * starBonus    = (stars - 1) * 0.04           -> harder tasks (more stars) give a flat bonus to win chance,
 *                                                 rewarding people for taking on tougher challenges
 */
function getSpinProbabilities(momentum, taskCount, stars){
  const safeTaskCount = Math.max(1, taskCount || 1);
  const taskScale = Math.max(1 / Math.sqrt(safeTaskCount), 0.4);
  const momentumBase = 0.12 + (momentum/100) * 0.18;
  const starBonus = ((stars || 1) - 1) * 0.04;

  let winChance = taskScale * momentumBase + starBonus;
  winChance = Math.max(0, Math.min(1, winChance));

  return {
    miss:    1 - winChance,
    small:   winChance * 0.50,
    mediumR: winChance * 0.175,
    mediumG: winChance * 0.175,
    largeR:  winChance * 0.075,
    largeG:  winChance * 0.075,
  };
}

function pickSpinTier(momentum, taskCount, stars){
  const probs = getSpinProbabilities(momentum, taskCount, stars);
  const r = Math.random();
  let cum = 0;
  for(const tier of Object.keys(probs)){
    cum += probs[tier];
    if(r <= cum) return tier;
  }
  return 'miss';
}

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

function getHeaderDateText(){
  const now = new Date();
  const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][now.getDay()];
  return `${now.getMonth()+1}/${now.getDate()} ${weekday}`;
}

function renderHeaderDate(){
  const el = document.getElementById('todayHeaderDate');
  if(el) el.textContent = getHeaderDateText();
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

/**
 * Daily momentum adjustment based on YESTERDAY's completion ratio
 * (activities completed yesterday / total current activities).
 *
 * Tiered, "addictive" design (like a mini game each morning):
 *  - Perfect day (100%)      -> big reward (+25) to reinforce the winning streak feeling
 *  - Good day (>=70%)        -> solid reward (+15)
 *  - Okay day (>=40%)        -> small reward (+5)
 *  - Weak day (>0% but <40%) -> mild penalty (-10), softer than total inactivity
 *  - Zero completions (0%)   -> harsh penalty (-20) to create loss-aversion and pull the user back in
 */
function computeMomentumShift(ratio){
  if(ratio >= 1) return 25;
  if(ratio <= 0) return -20;
  if(ratio >= 0.7) return 15;
  if(ratio >= 0.4) return 5;
  return -10;
}

function showMomentumPopup(change, ratio, completedYesterday, totalTasks){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'momentumPopupOverlay';
  overlay.style.position = 'fixed';
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.right = 0;
  overlay.style.bottom = 0;
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 9999;

  const positive = change >= 0;
  const pct = Math.round(ratio*100);

  overlay.innerHTML = `
    <div class="modal-content" style="max-width:320px;width:90%;text-align:center;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,0.25);">
      <div style="font-size:32px;margin-bottom:8px;">${positive ? '⚡' : '⚠️'}</div>
      <h3 style="margin:0 0 8px;">${positive ? 'Momentum Boost!' : 'Momentum Drop'}</h3>
      <p style="margin:0 0 4px;color:#555;font-size:14px;">
        Yesterday: ${completedYesterday}/${totalTasks} tasks completed (${pct}%)
      </p>
      <p style="font-size:28px;font-weight:bold;margin:12px 0;color:${positive ? '#2e7d32' : '#c62828'};">
        ${positive ? '+' : ''}${change}%
      </p>
      <button id="momentumPopupCloseBtn" class="btn-primary" style="margin-top:8px;">OK</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = ()=> overlay.remove();
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  document.getElementById('momentumPopupCloseBtn').addEventListener('click', close);
}

function applyDailyMomentumUpdate(){
  const today = todayStr();
  if(state.lastActiveDate === today) return; // already handled today

  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate()-1);
  const yesterdayStr = fmtDate(yestDate);

  const totalTasks = state.activities.length;

  if(totalTasks === 0){
    // Nothing to judge yet — just move the date forward, no penalty/reward.
    state.lastActiveDate = today;
    saveState();
    return;
  }

  const completedYesterday = state.activities.filter(a =>
    a.completions.some(c => c.date === yesterdayStr)
  ).length;

  const ratio = completedYesterday / totalTasks;
  const change = computeMomentumShift(ratio);

  state.momentum = Math.max(0, Math.min(100, state.momentum + change));
  state.lastActiveDate = today;
  saveState();

  showMomentumPopup(change, ratio, completedYesterday, totalTasks);
}

function recalcPoints(){
  let earned = 0;
  state.activities.forEach(a=>a.completions.forEach(c=>{
    earned += c.points;
    if(c.spin && c.spin.bonusPoints) earned += c.spin.bonusPoints;
  }));
  const spent = state.redemptions.reduce((s,r)=>s+r.cost, 0);
  state.points = earned - spent;
}

function recalcLevel(){
  let totalXP = 0;
  state.activities.forEach(a=>a.completions.forEach(c=>{
    totalXP += (c.xpGained !== undefined) ? c.xpGained : c.stars*10;
    if(c.spin && c.spin.bonusXP) totalXP += c.spin.bonusXP;
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

function spinBadgeHTML(c){
  if(!c.spin || c.spin.tier==='miss') return '';
  const parts = [];
  if(c.spin.bonusPoints>0) parts.push(`+${c.spin.bonusPoints}pt`);
  if(c.spin.bonusXP>0) parts.push(`+${c.spin.bonusXP}xp`);
  return ` <span class="spin-badge">🎰${parts.join('')}</span>`;
}

// ---------- Modal generic ----------
function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=>closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click', (e)=>{
    if(e.target===overlay && overlay.dataset.noOutsideClose !== 'true'){
      overlay.classList.add('hidden');
    }
  });
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
    div.innerHTML = `<span>${formatTime12(c.at)} — ${c.memo||''} ${'⭐'.repeat(c.stars)}</span><span>${c.points}pt${spinBadgeHTML(c)} <button class="del-completion" data-id="${c.id}">✕</button></span>`;
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
    div.innerHTML = `<span>${c.date} — ${c.memo||''}</span><span>${'⭐'.repeat(c.stars)} (${c.points}pt)${spinBadgeHTML(c)}</span>`;
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

// ---------- Complete Activity -> Spin -> Summary Flow ----------
let pendingSpin = null; // { activityId, completionId, stars, taskCount }

function completeActivity(id, stars){
  const a = state.activities.find(x=>x.id===id);
  if(!a) return;
  const now = new Date();
  const at = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const xpGained = stars*10;
  const oldMomentum = state.momentum;
  const newMomentum = Math.min(100, oldMomentum+8);
  const momentumGained = newMomentum - oldMomentum;

  const completion = {
    id: uid(), date: todayStr(), at, memo: a.memo || '',
    stars, points: stars, xpGained, momentumGained,
    spin: { tier: 'miss', bonusPoints: 0, bonusXP: 0 }
  };
  a.completions.push(completion);

  state.momentum = newMomentum;
  state.lastActiveDate = todayStr();

  recalcPoints();
  recalcLevel();
  saveState();

  document.getElementById('starPicker').classList.add('hidden');

  pendingSpin = { activityId: id, completionId: completion.id, stars, taskCount: state.activities.length };

  closeModal('detailModal');
  openSpinFlow();
}

function openSpinFlow(){
  openModal('spinModal');
  const symbolEl = document.getElementById('spinSymbol');
  const labelEl = document.getElementById('spinLabel');
  const confirmBtn = document.getElementById('spinConfirmBtn');
  const fxEl = document.getElementById('spinFx');

  fxEl.innerHTML = '';
  labelEl.textContent = '';
  labelEl.className = 'spin-label';
  confirmBtn.classList.add('hidden');
  symbolEl.textContent = '🎰';
  symbolEl.className = 'spin-symbol spinning';

  const spinEmojis = ['🎰','⭐','💰','🌟','💎','✨'];
  const shakeInterval = setInterval(()=>{
    symbolEl.textContent = spinEmojis[Math.floor(Math.random()*spinEmojis.length)];
  }, 90);

  setTimeout(()=>{
    clearInterval(shakeInterval);
    const tier = pickSpinTier(state.momentum, pendingSpin.taskCount, pendingSpin.stars);
    resolveSpinResult(tier);
  }, 1200);
}

function resolveSpinResult(tier){
  const a = state.activities.find(x=>x.id===pendingSpin.activityId);
  const completion = a.completions.find(c=>c.id===pendingSpin.completionId);
  const bonus = SPIN_BONUS[tier] || { points:0, xp:0 };
  completion.spin = { tier, bonusPoints: bonus.points, bonusXP: bonus.xp };

  recalcPoints();
  recalcLevel();
  saveState();

  const symbolEl = document.getElementById('spinSymbol');
  const labelEl = document.getElementById('spinLabel');
  const confirmBtn = document.getElementById('spinConfirmBtn');
  const info = SPIN_LABELS[tier];

  symbolEl.textContent = info.emoji;
  symbolEl.className = 'spin-symbol landed';
  labelEl.textContent = info.text;
  labelEl.classList.add(info.cls);
  confirmBtn.classList.remove('hidden');

  if(tier !== 'miss'){
    launchFirework();
  }
}

function launchFirework(){
  const fx = document.getElementById('spinFx');
  fx.innerHTML = '';
  const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4a6cf7','#e1bee7','#ff9f43'];
  for(let i=0;i<18;i++){
    const p = document.createElement('div');
    p.className = 'fx-particle burst';
    const angle = (Math.PI*2*i)/18 + Math.random()*0.3;
    const dist = 60 + Math.random()*40;
    p.style.setProperty('--dx', Math.cos(angle)*dist+'px');
    p.style.setProperty('--dy', Math.sin(angle)*dist+'px');
    p.style.background = colors[i % colors.length];
    fx.appendChild(p);
  }
}

document.getElementById('spinConfirmBtn').addEventListener('click', ()=>{
  closeModal('spinModal');
  openSummaryModal();
});

function openSummaryModal(){
  const a = state.activities.find(x=>x.id===pendingSpin.activityId);
  const completion = a.completions.find(c=>c.id===pendingSpin.completionId);

  document.getElementById('summaryName').textContent = a.name;
  document.getElementById('summaryMemo').textContent = completion.memo || '—';
  document.getElementById('summaryStars').textContent = '⭐'.repeat(completion.stars);

  document.getElementById('summaryBaseReward').textContent = `+${completion.points}pt · +${completion.xpGained}xp`;
  document.getElementById('summaryMomentum').textContent = `⚡ Momentum +${completion.momentumGained}%`;

  const spinEl = document.getElementById('summarySpinResult');
  const info = SPIN_LABELS[completion.spin.tier];
  if(completion.spin.tier === 'miss'){
    spinEl.className = 'summary-detail miss';
    spinEl.textContent = `${info.emoji} ${info.text}`;
  } else {
    spinEl.className = 'summary-detail win';
    const parts = [];
    if(completion.spin.bonusPoints>0) parts.push(`+${completion.spin.bonusPoints}pt`);
    if(completion.spin.bonusXP>0) parts.push(`+${completion.spin.bonusXP}xp`);
    spinEl.textContent = `${info.emoji} ${info.text} — ${parts.join(' ')}`;
  }

  openModal('summaryModal');
}

document.getElementById('summaryCloseBtn').addEventListener('click', ()=>{
  closeModal('summaryModal');
  const activityId = pendingSpin ? pendingSpin.activityId : currentDetailId;
  pendingSpin = null;
  if(activityId) openDetail(activityId);
  renderStats();
  renderUnscheduled();
  renderTimeline();
});

// ---------- Delete Completion ----------
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
    div.innerHTML = `<span>${c.date} — ${c.name}${c.memo?' ('+c.memo+')':''}</span><span>${'⭐'.repeat(c.stars)} (${c.points}pt)${spinBadgeHTML(c)}</span>`;
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
applyDailyMomentumUpdate();
recalcPoints();
recalcLevel();
renderHeaderDate();
renderAll();
scrollToNow();

setInterval(()=>{ updateNowLine(); }, 30000);
setInterval(()=>{ renderHeaderDate(); }, 60000);

setInterval(()=>{
  renderTodoTags();
  renderTimeline();
}, 60000);