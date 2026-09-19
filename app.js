let db;
let currentDetail = null;

const request = indexedDB.open("StreakDB", 2);

request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("activities")) {
        db.createObjectStore("activities", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("rewards")) {
        db.createObjectStore("rewards", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("redeemHistory")) {
        db.createObjectStore("redeemHistory", { keyPath: "id" });
    }
};

request.onsuccess = e => {
    db = e.target.result;
    render();
};

request.onerror = e => {
    console.error("DB Error:", e.target.error);
    alert("資料庫開啟失敗，請重新整理頁面");
};

/* ===================== 小工具函式 ===================== */

function formatDate(d) {
    let y = d.getFullYear();
    let m = String(d.getMonth() + 1).padStart(2, "0");
    let day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function todayString() {
    return formatDate(new Date());
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function diffEmoji(d) {
    return { easy: "😌", medium: "💪", hard: "😖" }[d] || "";
}

/* ===================== 資料存取：activities ===================== */

function getActivities() {
    return new Promise(resolve => {
        let tx = db.transaction("activities", "readonly");
        let store = tx.objectStore("activities");
        let req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

function saveActivity(data) {
    let tx = db.transaction("activities", "readwrite");
    tx.objectStore("activities").put(data);
}

function deleteActivityDB(id) {
    let tx = db.transaction("activities", "readwrite");
    tx.objectStore("activities").delete(id);
}

/* ===================== 資料存取：rewards ===================== */

function getRewards() {
    return new Promise(resolve => {
        let tx = db.transaction("rewards", "readonly");
        let req = tx.objectStore("rewards").getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

function saveReward(data) {
    let tx = db.transaction("rewards", "readwrite");
    tx.objectStore("rewards").put(data);
}

function deleteRewardDB(id) {
    let tx = db.transaction("rewards", "readwrite");
    tx.objectStore("rewards").delete(id);
}

/* ===================== 資料存取：redeemHistory ===================== */

function getRedeemHistory() {
    return new Promise(resolve => {
        let tx = db.transaction("redeemHistory", "readonly");
        let req = tx.objectStore("redeemHistory").getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

function saveRedeem(data) {
    let tx = db.transaction("redeemHistory", "readwrite");
    tx.objectStore("redeemHistory").put(data);
}

/* ===================== Streak 計算 ===================== */

function getStreak(records) {
    if (records.length === 0) return 0;

    let dates = records.map(r => r.date).sort().reverse();
    let streak = 0;
    let check = new Date();
    check.setHours(0, 0, 0, 0);

    for (let date of dates) {
        let d = new Date(date);
        d.setHours(0, 0, 0, 0);
        let diff = (check - d) / (1000 * 60 * 60 * 24);

        if (diff === 0 || diff === 1) {
            streak++;
            check = d;
        } else {
            break;
        }
    }

    return streak;
}

function getBestStreak(records) {
    if (records.length === 0) return 0;

    let dates = records.map(r => r.date).sort();
    let best = 1;
    let current = 1;

    for (let i = 1; i < dates.length; i++) {
        let prev = new Date(dates[i - 1]);
        let now = new Date(dates[i]);
        let diff = (now - prev) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
            current++;
        } else {
            current = 1;
        }

        if (current > best) best = current;
    }

    return best;
}

/* ===================== 成長值 / 等級 ===================== */

async function computeTotalGrowth() {
    let list = await getActivities();
    let total = 0;
    list.forEach(item => {
        item.records.forEach(r => {
            total += (r.bonus ? 2 : 1);
        });
    });
    return total;
}

function getLevelInfo(growth) {
    let level = 1;
    let required = 50;
    let cumulative = 0;

    while (growth >= cumulative + required) {
        cumulative += required;
        level++;
        required = 50 + (level - 1) * 20;
    }

    return {
        level,
        cumulative,
        required,
        progress: growth - cumulative
    };
}

/* ===================== 動力值（Momentum） ===================== */

async function getMomentum() {
    let list = await getActivities();
    let momentum = 50;

    let base = new Date();
    base.setHours(0, 0, 0, 0);

    for (let i = 30; i >= 1; i--) {
        let d = new Date(base);
        d.setDate(d.getDate() - i);
        let dateStr = formatDate(d);

        let anyDone = list.some(item =>
            item.records.some(r => r.date === dateStr)
        );

        momentum += anyDone ? 8 : -8;
        momentum = Math.max(0, Math.min(100, momentum));
    }

    let todayStr = todayString();
    let todayDone = list.some(item =>
        item.records.some(r => r.date === todayStr)
    );

    if (todayDone) {
        momentum = Math.min(100, momentum + 8);
    }

    return momentum;
}

/* ===================== 每週點數 / 歷史累計 ===================== */

function getWeekStart(date) {
    let d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

async function getWeeklyPoints() {
    let list = await getActivities();
    let redemptions = await getRedeemHistory();
    let weekStart = getWeekStart(new Date());

    let earned = 0;
    list.forEach(item => {
        item.records.forEach(r => {
            let d = new Date(r.date);
            if (d >= weekStart) earned += (r.points || 0);
        });
    });

    let spent = 0;
    redemptions.forEach(r => {
        let d = new Date(r.date);
        if (d >= weekStart) spent += r.cost;
    });

    return Math.max(0, earned - spent);
}

async function getLifetimeStats() {
    let list = await getActivities();
    let redemptions = await getRedeemHistory();

    let earned = 0;
    list.forEach(item => {
        item.records.forEach(r => earned += (r.points || 0));
    });

    let spent = redemptions.reduce((s, r) => s + r.cost, 0);

    return { earned, spent };
}

/* ===================== Header 統計更新 ===================== */

async function updateHeaderStats() {
    let growth = await computeTotalGrowth();
    let info = getLevelInfo(growth);

    document.getElementById("levelDisplay").innerText =
        `🌱 Lv.${info.level} · ${growth}`;

    let weekly = await getWeeklyPoints();
    let pointsEl = document.getElementById("pointsDisplay");
    pointsEl.innerText = `🎁 ${weekly} pt`;

    pointsEl.classList.remove("points-warn", "points-danger");
    let day = new Date().getDay();
    if (day === 6) {
        pointsEl.classList.add("points-danger");
    } else if (day === 5) {
        pointsEl.classList.add("points-warn");
    }

    let momentum = await getMomentum();
    document.getElementById("momentumBar").style.width = momentum + "%";
}

/* ===================== 背景色（今日完成度） ===================== */

async function updateBackground() {
    let list = await getActivities();
    document.body.classList.remove("progress-low", "progress-mid", "progress-high");

    if (list.length === 0) return;

    let today = todayString();
    let doneCount = list.filter(item =>
        item.records.some(r => r.date === today)
    ).length;

    let ratio = doneCount / list.length;

    if (ratio >= 0.8) {
        document.body.classList.add("progress-high");
    } else if (ratio >= 0.4) {
        document.body.classList.add("progress-mid");
    } else {
        document.body.classList.add("progress-low");
    }
}

/* ===================== 主渲染 ===================== */

async function render() {

    let list = await getActivities();
    let today = todayString();

    let unfinished = list.filter(item => {
        return !item.records.some(r => r.date === today);
    });

    let finished = list.filter(item => {
        return item.records.some(r => r.date === today);
    });

    shuffle(unfinished);
    shuffle(finished);

    list = [...unfinished, ...finished];

    activityContainer.innerHTML = "";

    list.forEach(item => {

        let done = item.records.some(r => r.date === today);

        let div = document.createElement("div");
        div.className = "activity";

        div.innerHTML = `
<div class="circle ${done ? "complete" : ""}">
${getStreak(item.records)}
</div>
<div class="difficulty-picker hidden">
    <button data-diff="easy" title="簡單">😌</button>
    <button data-diff="medium" title="中等">💪</button>
    <button data-diff="hard" title="困難">😖</button>
</div>
${done ? '<div class="done-icon">✓</div>' : ""}
<div class="activity-name">${item.name}</div>
<input class="memo" value="${item.memo || ""}" placeholder="memo">
`;

        let circle = div.querySelector(".circle");
        let picker = div.querySelector(".difficulty-picker");

        circle.onclick = () => {
            if (done) return;
            picker.classList.remove("hidden");
        };

        picker.querySelectorAll("button").forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                picker.classList.add("hidden");
                await completeActivity(item, btn.dataset.diff, div, circle);
            };
        });

        div.querySelector(".memo").onchange = e => {
            item.memo = e.target.value;

            let rec = item.records.find(r => r.date === today);
            if (rec) rec.memo = e.target.value;

            saveActivity(item);
        };

        div.querySelector(".activity-name").onclick = () => {
            openDetail(item);
        };

        activityContainer.appendChild(div);
    });

    updateBackground();
    updateHeaderStats();
}

/* ===================== 打卡完成邏輯 ===================== */

async function completeActivity(item, diff, div, circle) {

    const pointsMap = { easy: 1, medium: 2, hard: 3 };
    const chanceMap = { easy: .10, medium: .20, hard: .30 };

    let beforeGrowth = await computeTotalGrowth();
    let momentum = await getMomentum();

    let chance = chanceMap[diff] + (momentum >= 80 ? 0.10 : 0);
    let bonus = Math.random() < chance;

    let basePoints = pointsMap[diff];
    let points = bonus ? basePoints * 2 : basePoints;

    let today = todayString();

    item.records.push({
        date: today,
        memo: item.memo || "",
        difficulty: diff,
        points: points,
        bonus: bonus
    });

    saveActivity(item);

    let growthGain = bonus ? 2 : 1;
    let afterGrowth = beforeGrowth + growthGain;

    circle.classList.add("animate");
    createParticles(circle);

    if (bonus) {
        showBonusText(div);
    }

    let beforeLevel = getLevelInfo(beforeGrowth).level;
    let afterLevel = getLevelInfo(afterGrowth).level;
    let beforeMilestone = Math.floor(beforeGrowth / 100);
    let afterMilestone = Math.floor(afterGrowth / 100);

    setTimeout(() => {
        if (afterLevel > beforeLevel) {
            showLevelUpCelebration(afterLevel);
        } else if (afterMilestone > beforeMilestone) {
            showMilestoneCelebration(afterGrowth);
        }
    }, 750);

    setTimeout(() => {
        render();
    }, 700);
}

/* ===================== Bonus / 慶祝動畫 ===================== */

function showBonusText(div) {
    let el = document.createElement("div");
    el.className = "bonus-text";
    el.innerText = "✨ Bonus x2!";
    div.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function showLevelUpCelebration(level) {
    let overlay = document.createElement("div");
    overlay.className = "celebration-overlay";
    overlay.innerHTML = `<div class="celebration-box">🌟<br>Level Up!<br>Lv.${level}</div>`;
    document.body.appendChild(overlay);
    createConfetti();
    setTimeout(() => overlay.remove(), 2200);
}

function showMilestoneCelebration(growth) {
    let overlay = document.createElement("div");
    overlay.className = "celebration-overlay";
    overlay.innerHTML = `<div class="celebration-box">🎉<br>Milestone!<br>${growth} Growth</div>`;
    document.body.appendChild(overlay);
    createConfetti();
    setTimeout(() => overlay.remove(), 2200);
}

function createConfetti() {
    let icons = ["🎉", "✨", "🌟", "🎊"];

    for (let i = 0; i < 30; i++) {
        let p = document.createElement("div");
        p.className = "particle";
        p.innerText = icons[Math.floor(Math.random() * icons.length)];
        p.style.left = window.innerWidth / 2 + "px";
        p.style.top = window.innerHeight / 2 + "px";
        p.style.setProperty("--x", (Math.random() - 0.5) * 600 + "px");
        p.style.setProperty("--y", (Math.random() - 0.5) * 600 + "px");
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1500);
    }
}

function createParticles(element) {
    let rect = element.getBoundingClientRect();
    let icons = ["⭐", "✨", "🎉", "🌸"];

    for (let i = 0; i < 15; i++) {
        let p = document.createElement("div");
        p.className = "particle";
        p.innerText = icons[Math.floor(Math.random() * icons.length)];
        p.style.left = rect.left + rect.width / 2 + window.scrollX + "px";
        p.style.top = rect.top + rect.height / 2 + window.scrollY + "px";
        p.style.setProperty("--x", (Math.random() - 0.5) * 200 + "px");
        p.style.setProperty("--y", (Math.random() - 0.5) * 200 + "px");
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }
}

/* ===================== 新增活動 ===================== */

addBtn.onclick = () => {
    modal.classList.remove("hidden");
};

cancelBtn.onclick = () => {
    modal.classList.add("hidden");
};

createBtn.onclick = () => {

    let name = activityName.value.trim();

    if (!name) return;

    let newItem = {
        id: Date.now().toString(),
        name: name,
        memo: "",
        records: []
    };

    saveActivity(newItem);
    activityName.value = "";
    modal.classList.add("hidden");
    render();
};

/* ===================== 詳情 Modal ===================== */

function openDetail(item) {
    currentDetail = item;

    let best = getBestStreak(item.records);

    detailTitle.innerHTML = `
        <span>${item.name}</span>
        <span class="best-streak">🔥 ${best} days</span>
    `;

    let sorted = [...item.records].sort((a, b) => b.date.localeCompare(a.date));

    historyList.innerHTML = sorted.map(r => `
        <div class="history-item">
            <strong>${r.date}</strong>
            ${r.difficulty ? diffEmoji(r.difficulty) : ""}
            ${r.points ? "+" + r.points + "pt" : ""}
            ${r.bonus ? "✨" : ""}
            <br>
            <span style="color:#777;font-size:13px">${r.memo || ""}</span>
        </div>
    `).join("") || "<p>No records yet</p>";

    detailModal.classList.remove("hidden");
}

deleteTodayBtn.onclick = () => {
    if (!currentDetail) return;
    if (!confirm("確定要刪除今天的紀錄嗎？")) return;

    let today = todayString();
    currentDetail.records = currentDetail.records.filter(r => r.date !== today);
    saveActivity(currentDetail);

    detailModal.classList.add("hidden");
    render();
};

deleteActivityBtn.onclick = () => {
    if (!currentDetail) return;
    if (!confirm("確定要刪除這個活動嗎？此動作無法復原")) return;

    deleteActivityDB(currentDetail.id);
    detailModal.classList.add("hidden");
    render();
};

closeDetailBtn.onclick = () => {
    detailModal.classList.add("hidden");
    currentDetail = null;
};

/* ===================== What Now（隨機選擇） ===================== */

randomBtn.onclick = () => {
    randomModal.classList.remove("hidden");
    randomName.classList.remove("hidden");
    randomName.classList.remove("random-winner");
    randomName.innerText = "Ready";
    randomResult.classList.add("hidden");
    randomResult.innerText = "";
};

spinBtn.onclick = async () => {
    let list = await getActivities();
    let today = todayString();

    let unfinished = list.filter(item => !item.records.some(r => r.date === today));

    if (unfinished.length === 0) {
        randomName.innerText = "🎉 All done today!";
        return;
    }

    let names = unfinished.map(i => i.name);
    let spins = 15;
    let idx = 0;

    randomName.classList.remove("random-winner");

    let interval = setInterval(() => {
        randomName.innerText = names[idx % names.length];
        idx++;
        spins--;

        if (spins <= 0) {
            clearInterval(interval);
            let winner = names[Math.floor(Math.random() * names.length)];
            randomName.innerText = winner;
            randomName.classList.add("random-winner");
        }
    }, 100);
};

closeRandomBtn.onclick = () => {
    randomModal.classList.add("hidden");
};

/* ===================== History Heatmap ===================== */

historyBtn.onclick = async () => {
    await renderHeatmap();
    historyModal.classList.remove("hidden");
};

closeHistoryBtn.onclick = () => {
    historyModal.classList.add("hidden");
};

async function renderHeatmap() {
    let list = await getActivities();
    let allDates = new Set();
    list.forEach(item => item.records.forEach(r => allDates.add(r.date)));

    let today = new Date();
    today.setHours(0, 0, 0, 0);

    let days = [];
    for (let i = 364; i >= 0; i--) {
        let d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d);
    }

    let startPad = days[0].getDay();
    for (let i = 0; i < startPad; i++) {
        days.unshift(null);
    }

    let weeks = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }

    let monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let monthHtml = '<div class="month-row">';
    let lastMonth = -1;

    weeks.forEach(week => {
        let firstValidDay = week.find(d => d !== null);
        if (firstValidDay && firstValidDay.getMonth() !== lastMonth && firstValidDay.getDate() <= 7) {
            monthHtml += `<div class="month">${monthNames[firstValidDay.getMonth()]}</div>`;
            lastMonth = firstValidDay.getMonth();
        } else {
            monthHtml += '<div class="month"></div>';
        }
    });
    monthHtml += "</div>";

    let heatmapHtml = '<div class="heatmap">';
    weeks.forEach(week => {
        heatmapHtml += '<div class="week">';
        week.forEach(day => {
            if (!day) {
                heatmapHtml += '<div class="heat-cell" style="background:transparent"></div>';
            } else {
                let dateStr = formatDate(day);
                let done = allDates.has(dateStr);
                heatmapHtml += `<div class="heat-cell ${done ? "done" : ""}" title="${dateStr}"></div>`;
            }
        });
        heatmapHtml += "</div>";
    });
    heatmapHtml += "</div>";

    let container = document.getElementById("heatmapContainer");
    container.innerHTML = `
        <div class="heatmap-title">Past Year Activity</div>
        <div class="heatmap-wrapper">
            <div class="week-label-area">
                <div class="week-labels">
                    <div>Sun</div><div></div><div>Tue</div><div></div><div>Thu</div><div></div><div>Sat</div>
                </div>
            </div>
            <div class="heatmap-scroll">
                <div class="heatmap-inner">
                    ${monthHtml}
                    ${heatmapHtml}
                </div>
            </div>
        </div>
    `;
}

/* ===================== 獎賞商店 ===================== */

rewardBtn.onclick = async () => {
    await renderRewards();
    rewardModal.classList.remove("hidden");
};

closeRewardBtn.onclick = () => {
    rewardModal.classList.add("hidden");
};

addRewardBtn.onclick = async () => {
    let name = rewardName.value.trim();
    let cost = parseInt(rewardCost.value);

    if (!name || !cost || cost <= 0) return;

    let reward = {
        id: Date.now().toString(),
        name: name,
        cost: cost
    };

    saveReward(reward);
    rewardName.value = "";
    rewardCost.value = "";
    await renderRewards();
};

async function renderRewards() {
    let rewards = await getRewards();
    let weekly = await getWeeklyPoints();
    let lifetime = await getLifetimeStats();

    document.getElementById("rewardWeeklyInfo").innerHTML =
        `本週剩餘點數：<strong>${weekly} pt</strong>`;

    let listEl = document.getElementById("rewardList");

    if (rewards.length === 0) {
        listEl.innerHTML = '<p style="color:#999">還沒有獎賞，新增一個吧！</p>';
    } else {
        listEl.innerHTML = rewards.map(r => `
            <div class="reward-item">
                <span>${r.name} — ${r.cost}pt</span>
                <button class="redeemBtn" data-id="${r.id}" data-cost="${r.cost}" data-name="${r.name}" ${weekly < r.cost ? "disabled" : ""}>兌換</button>
                <button class="deleteRewardBtn" data-id="${r.id}">刪除</button>
            </div>
        `).join("");

        listEl.querySelectorAll(".redeemBtn").forEach(btn => {
            btn.onclick = async () => {
                let cost = parseInt(btn.dataset.cost);
                let currentWeekly = await getWeeklyPoints();

                if (currentWeekly < cost) {
                    alert("點數不足");
                    return;
                }

                if (!confirm(`確定要兌換「${btn.dataset.name}」嗎？(-${cost}pt)`)) return;

                saveRedeem({
                    id: Date.now().toString(),
                    name: btn.dataset.name,
                    cost: cost,
                    date: todayString()
                });

                await renderRewards();
                updateHeaderStats();
            };
        });

        listEl.querySelectorAll(".deleteRewardBtn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("確定要刪除這個獎賞項目嗎？")) return;
                deleteRewardDB(btn.dataset.id);
                await renderRewards();
            };
        });
    }

    document.getElementById("rewardLifetimeStats").innerHTML =
        `歷史累積：賺取 ${lifetime.earned}pt · 花費 ${lifetime.spent}pt`;
}