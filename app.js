let db;
let currentDetail = null;

const request = indexedDB.open("StreakDB", 1);

request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("activities")) {
        db.createObjectStore("activities", { keyPath: "id" });
    }
};

request.onsuccess = e => {
    db = e.target.result;
    render();
};

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

    let dates = records
        .map(r => r.date)
        .sort();

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

        if (current > best) {
            best = current;
        }

    }

    return best;
}


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

        let today = todayString();

        let done = item.records.some(r => r.date === today);

        let div = document.createElement("div");

        div.className = "activity";

        div.innerHTML = `
<div class="circle ${done ? "complete" : ""}">
${getStreak(item.records)}
</div>
${done ? '<div class="done-icon">✓</div>' : ""}
<div class="activity-name">${item.name}</div>
<input class="memo" value="${item.memo || ""}" placeholder="memo">
`;

        let circle = div.querySelector(".circle");

        circle.onclick = () => {

            if (done) return;

            item.records.push({
                date: today,
                memo: item.memo || ""
            });

            saveActivity(item);

            circle.classList.add("animate");

            createParticles(circle);

            setTimeout(() => {
                render();
                updateBackground();
            }, 700);

        };

        div.querySelector(".memo").onchange = e => {
            item.memo = e.target.value;
            saveActivity(item);
        };

        div.querySelector(".activity-name").onclick = () => {
            openDetail(item);
        };

        activityContainer.appendChild(div);
    });

    updateBackground();
}

addBtn.onclick = () => {
    modal.classList.remove("hidden");
};

cancelBtn.onclick = () => {
    modal.classList.add("hidden");
};

createBtn.onclick = () => {

    let name = activityName.value.trim();

    if (!name) return;

    saveActivity({
        id: Date.now(),
        name,
        memo: "",
        records: []
    });

    activityName.value = "";
    modal.classList.add("hidden");

    render();

};

function openDetail(item) {

    currentDetail = item;

    detailTitle.innerHTML = `
        <span>${item.name}</span>
        <span class="best-streak">🔥 ${getBestStreak(item.records)} days</span>
    `;

    historyList.innerHTML = "";

    item.records.slice().reverse().forEach(r => {
        historyList.innerHTML += `
<div class="history-item">
📅 ${r.date}<br>
📝 ${r.memo || "no memo"}
</div>`;
    });

    detailModal.classList.remove("hidden");
}

closeDetailBtn.onclick = () => {
    detailModal.classList.add("hidden");
};

deleteTodayBtn.onclick = () => {

    let today = todayString();;

    currentDetail.records = currentDetail.records.filter(r => r.date !== today);

    saveActivity(currentDetail);

    openDetail(currentDetail);

    render();

    updateBackground();
};

deleteActivityBtn.onclick = () => {

    deleteActivityDB(currentDetail.id);

    detailModal.classList.add("hidden");

    render();

};

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

function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

let randomTimer = null;
let randomRunning = false;
let randomSelected = null;

randomBtn.onclick = async () => {
    let list = await getActivities();
    let today = todayString();

    let available = list.filter(item => {
        return !item.records.some(r => r.date === today);
    });

    if (list.length === 0) {
        alert("Go add activity");
        return;
    }

    if (available.length === 0) {
        alert("🎉 Already completed all activities!");
        return;
    }

    spinBtn.classList.remove("hidden");
    randomModal.classList.remove("hidden");
    randomName.classList.remove("hidden");
    randomName.innerText = "Ready";
    randomResult.classList.add("hidden");
    randomSelected = null;
};


spinBtn.onclick = async () => {

    if (randomRunning) return;

    let list = await getActivities();
    let today = todayString();

    let available = list.filter(item => {
        return !item.records.some(r => r.date === today);
    });

    if (available.length === 0) {
        randomName.innerText = "🎉 All Completed！";
        return;
    }

    randomRunning = true;
    spinBtn.classList.add("hidden");

    let startTime = Date.now();
    let duration = 3000;
    let speed = 80;

    function randomPick() {
        let index = Math.floor(Math.random() * available.length);
        return available[index];

    }

    function run() {
        let elapsed = Date.now() - startTime;
        let item = randomPick();

        randomName.innerText = item.name;
        randomSelected = item;

        if (elapsed >= duration) {
            randomRunning = false;
            spinBtn.disabled = false;

            showRandomResult(randomSelected);
            return;
        }

        let progress = elapsed / duration;
        speed = 80 + (progress * 250);
        randomTimer = setTimeout(run, speed);
    }
    run();
};


function showRandomResult(item) {
    randomName.classList.add("hidden");
    randomResult.classList.add("random-winner");
    randomResult.classList.remove("hidden");
    randomResult.innerText = "🎉 " + item.name;
    randomResult.classList.add("random-winner");
}



closeRandomBtn.onclick = () => {
    if (randomTimer) {
        clearTimeout(randomTimer);
    }

    randomModal.classList.add("hidden");
    randomRunning = false;
    spinBtn.disabled = false;
};


async function updateBackground() {
    let list = await getActivities();

    if (list.length === 0) {
        document.body.className = "progress-low";
        return;
    }

    let today = todayString();

    let completed = list.filter(item => {
        return item.records.some(r => r.date === today);
    }).length;

    let rate = completed / list.length;

    document.body.className = "";

    if (rate === 0) {
        document.body.classList.add("progress-low");
    }
    else if (rate >= 0.8) {
        document.body.classList.add("progress-high");
    }
    else if (rate >= 0.5) {
        document.body.classList.add("progress-mid");
    }
    else {
        document.body.classList.add("progress-low");
    }

}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}


historyBtn.onclick = async () => {
    let list = await getActivities();

    heatmapContainer.innerHTML = "";

    list.forEach(item => {
        heatmapContainer.innerHTML += createHeatmap(item);
    });

    historyModal.classList.remove("hidden");
    setTimeout(()=>{
        document.querySelectorAll(".heatmap-scroll").forEach(el=>{
        el.scrollLeft=el.scrollWidth;
        });
    },100);
};


closeHistoryBtn.onclick = () => {
    historyModal.classList.add("hidden");
};


function createHeatmap(activity) {
    let weeks = createWeeks();

    let html = `
        <div class="heatmap-title">
        ${activity.name}
        </div>

        <div class="heatmap-wrapper">
            <div class="week-label-area">
                <div class="week-labels">
                    <div>一</div>
                    <div></div>
                    <div>三</div>
                    <div></div>
                    <div>五</div>
                    <div></div>
                    <div>日</div>
                </div>
            </div>

        <div class="heatmap-scroll">
        <div class="heatmap-inner">

        <div class="month-row">
        ${createMonths(weeks)}
        </div>

        <div class="heatmap">
        `;


    weeks.forEach(week => {
        html += `<div class="week">`;
        week.forEach(day => {
            if (!day) {
                html += `<div class="heat-cell"></div>`;
                return;
            }

            let date = formatDate(day);
            let done = activity.records.some(r => r.date === date);

            html += `<div class="heat-cell ${done ? "done" : ""}"></div>`;
        });

        html += `</div>`;
    });

    html += `
        </div>
        </div>
        </div>
        </div>
        `;

    return html;
}


function createWeeks() {
    let result = [];
    let today = new Date();
    let start = new Date();

    start.setMonth(start.getMonth() - 6);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    let current = new Date(start);
    let week = [];

    while (current <= today) {
        week.push(new Date(current));
        if (week.length === 7) {
            result.push(week);
            week = [];
        }

        current.setDate(current.getDate() + 1);
    }

    if (week.length) {
        while (week.length < 7) {
            week.push(null);
        }
        result.push(week);
    }

    return result;
}

function createMonths(weeks) {
    let html = "";
    let lastMonth = -1;

    weeks.forEach(week => {
        let date = week.find(d => d);
        let month = date.getMonth();

        if (month !== lastMonth) {
            html += `<div class="month">${month + 1}月</div>`;
            lastMonth = month;
        } else {
            html += `<div class="month"></div>`;
        }
    });
    return html;

}

function formatDate(date) {
    let y = date.getFullYear();
    let m = String(date.getMonth() + 1).padStart(2, "0");
    let d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}