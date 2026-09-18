// --- UI, CONTROLS, LEADERBOARD, & EVENTS ---

function logNews(text) {
    const ticker = document.getElementById('news-ticker');
    if (!ticker) return;
    const entry = document.createElement('div');
    entry.className = 'news-entry';
    entry.innerHTML = `<span class="year">Year ${year}:</span> ${text}`;
    ticker.appendChild(entry);
}

function userSendAid(nationId, type) {
    let n = nations[nationId];
    if (!n) return;

    if (type === 'gold') {
        n.gold += 100;
        logNews(`✨ <b>You donated $100 Gold</b> to <b>${n.name}</b>!`);
    } else if (type === 'troops') {
        n.army.attack += 15;
        logNews(`✨ <b>You sent +15 Troops</b> to <b>${n.name}</b>!`);
    }
    updateLeaderboard();
}

function focusNation(nationId) {
    nationId = parseInt(nationId, 10);
    let n = nations[nationId];
    if (!n || !n.tiles || n.tiles.length === 0) return;

    let sumX = 0, sumY = 0;
    n.tiles.forEach(t => { sumX += t.x; sumY += t.y; });
    let avgX = sumX / n.tiles.length;
    let avgY = sumY / n.tiles.length;

    const baseCellW = CANVAS.width / WIDTH;
    const baseCellH = CANVAS.height / HEIGHT;

    let targetPixelX = avgX * baseCellW + baseCellW / 2;
    let targetPixelY = avgY * baseCellH + baseCellH / 2;

    let targetZoom = Math.max(1.8, Math.min(5.0, 40 / Math.sqrt(n.tiles.length)));
    zoom = targetZoom;

    panX = (CANVAS.width / 2) - (targetPixelX * zoom);
    panY = (CANVAS.height / 2) - (targetPixelY * zoom);

    render();
}

function setMapMode(mode) {
    mapMode = mode;
    document.getElementById('btn-view-nations').classList.toggle('active', mode === 'nations');
    document.getElementById('btn-view-alliances').classList.toggle('active', mode === 'alliances');
    document.getElementById('btn-view-income').classList.toggle('active', mode === 'income');
    render();
}

function toggleLeaderboard() {
    let modal = document.getElementById('leaderboard-modal');
    modal.style.display = (modal.style.display === 'none' || modal.style.display === '') ? 'flex' : 'none';
    if (modal.style.display === 'flex') updateLeaderboard();
}

function setLeaderboardSort(category) {
    lbSortCategory = category;
    ['tiles', 'gold', 'military', 'income', 'cities'].forEach(cat => {
        document.getElementById(`lb-sort-${cat}`).classList.toggle('active', cat === category);
    });
    updateLeaderboard();
}

function updateLeaderboard() {
    const list = document.getElementById('modal-leaderboard-list');
    const count = document.getElementById('lb-nation-count');
    if (!list) return;
    
    let sorted = Object.values(nations);

    if (lbSortCategory === 'tiles') {
        sorted.sort((a, b) => b.tiles.length - a.tiles.length);
    } else if (lbSortCategory === 'gold') {
        sorted.sort((a, b) => b.gold - a.gold);
    } else if (lbSortCategory === 'military') {
        sorted.sort((a, b) => (b.army.attack + b.army.defend + b.army.balanced) - (a.army.attack + a.army.defend + a.army.balanced));
    } else if (lbSortCategory === 'income') {
        sorted.sort((a, b) => b.netIncome - a.netIncome);
    } else if (lbSortCategory === 'cities') {
        sorted.sort((a, b) => {
            let cA = cities.filter(c => c.nationId === a.id).length;
            let cB = cities.filter(c => c.nationId === b.id).length;
            return cB - cA;
        });
    }

    count.textContent = sorted.length;

    list.innerHTML = sorted.map((n, idx) => {
        let alliance = n.allianceId && alliances[n.allianceId] ? alliances[n.allianceId] : null;
        let myCitiesCount = cities.filter(c => c.nationId === n.id).length;
        let totalArmy = n.army.attack + n.army.defend + n.army.balanced;

        let statDisplay = "";
        if (lbSortCategory === 'tiles') statDisplay = `${n.tiles.length} tiles`;
        if (lbSortCategory === 'gold') statDisplay = `$${n.gold}`;
        if (lbSortCategory === 'military') statDisplay = `${totalArmy} troops`;
        if (lbSortCategory === 'income') statDisplay = `${n.netIncome >= 0 ? '+' : ''}${n.netIncome}/yr`;
        if (lbSortCategory === 'cities') statDisplay = `${myCitiesCount} cities`;

        return `
            <div class="lb-card" style="border-left-color: ${mapMode === 'alliances' && alliance ? alliance.color : n.color}">
                <span class="lb-rank">#${idx + 1}</span>
                <div class="lb-info">
                    <div class="lb-name" data-id="${n.id}" title="Click to zoom to ${n.name}">
                        ${n.name}
                        <span style="font-size:0.65rem;">${n.archetype.icon}</span>
                    </div>
                    <span style="font-size:0.65rem; color: var(--text-muted);">
                        💰$${n.gold} • 👥${(n.population/1000).toFixed(1)}k
                    </span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <span class="lb-val">${statDisplay}</span>
                    <div class="lb-actions">
                        <button class="lb-action-btn" data-id="${n.id}" data-type="gold">+$100</button>
                        <button class="lb-action-btn" data-id="${n.id}" data-type="troops">+15</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Delegated click handler for Leaderboard
document.getElementById('modal-leaderboard-list').addEventListener('click', (e) => {
    let nameEl = e.target.closest('.lb-name');
    if (nameEl && nameEl.dataset.id) {
        focusNation(nameEl.dataset.id);
        return;
    }
    let aidBtn = e.target.closest('.lb-action-btn');
    if (aidBtn && aidBtn.dataset.id && aidBtn.dataset.type) {
        userSendAid(aidBtn.dataset.id, aidBtn.dataset.type);
        return;
    }
});

// Draggable Modal Logic
const dragModal = document.getElementById('leaderboard-modal');
const dragHandle = document.getElementById('modal-drag-handle');
let isModalDragging = false;
let modalOffsetX = 0, modalOffsetY = 0;

dragHandle.addEventListener('mousedown', (e) => {
    isModalDragging = true;
    modalOffsetX = e.clientX - dragModal.offsetLeft;
    modalOffsetY = e.clientY - dragModal.offsetTop;
});

window.addEventListener('mousemove', (e) => {
    if (isModalDragging) {
        dragModal.style.left = (e.clientX - modalOffsetX) + 'px';
        dragModal.style.top = (e.clientY - modalOffsetY) + 'px';
    }
});

window.addEventListener('mouseup', () => {
    isModalDragging = false;
});

// Pan & Zoom Control Handlers
function adjustZoom(factor) {
    let newZoom = Math.max(0.5, Math.min(8.0, zoom * factor));
    let centerX = CANVAS.width / 2;
    let centerY = CANVAS.height / 2;

    panX = centerX - (centerX - panX) * (newZoom / zoom);
    panY = centerY - (centerY - panY) * (newZoom / zoom);
    zoom = newZoom;
    render();
}

function resetCamera() {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    render();
}

CANVAS.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const rect = CANVAS.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.max(0.5, Math.min(8.0, zoom * zoomFactor));

    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;
    render();
}, { passive: false });

CANVAS.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasDragged = false;
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        let dx = e.clientX - panX - dragStart.x;
        let dy = e.clientY - panY - dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;

        panX = e.clientX - dragStart.x;
        panY = e.clientY - dragStart.y;
        render();
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDragging && !hasDragged) {
        const rect = CANVAS.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const baseCellW = CANVAS.width / WIDTH;
        const baseCellH = CANVAS.height / HEIGHT;

        const mapX = Math.floor((screenX - panX) / (baseCellW * zoom));
        const mapY = Math.floor((screenY - panY) / (baseCellH * zoom));

        if (mapX >= 0 && mapX < WIDTH && mapY >= 0 && mapY < HEIGHT) {
            if (grid[mapY][mapX] === 1) {
                spawnRandomNation(mapX, mapY);
                render();
                updateLeaderboard();
            }
        }
    }
    isDragging = false;
});

// Speed Controls
function setSpeed(speed) {
    simSpeed = speed;
    clearInterval(tickInterval);
    
    document.querySelectorAll('.btn-group .btn').forEach(b => {
        if (b.id && b.id.startsWith('btn-')) b.classList.remove('active');
    });

    let btn = document.getElementById(`btn-${speed}x`);
    if (btn) btn.classList.add('active');
    
    if (speed > 0) {
        let intervalMs = 150 / speed;
        tickInterval = setInterval(tick, intervalMs);
    }
}

window.addEventListener('resize', render);

// Initial Game Startup
generatePresetMap('earth');
setSpeed(1);