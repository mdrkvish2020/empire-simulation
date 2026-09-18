// --- RENDER ENGINE WITH DYNAMIC RELATIONSHIP BORDERS & ALLIANCE LEADERBOARD ---

// Global array to track active floating world notifications
window.floatingTexts = [];

function addFloatingText(text, x, y, color = "#ffd700") {
    window.floatingTexts.push({
        text: text,
        x: x,
        y: y,
        color: color,
        life: 60, // Visible for 60 frames (~1 sec)
        opacity: 1.0
    });
}

function renderFloatingTexts(ctx, cellW, cellH) {
    for (let i = window.floatingTexts.length - 1; i >= 0; i--) {
        let ft = window.floatingTexts[i];
        
        ctx.save();
        ctx.globalAlpha = ft.opacity;
        ctx.fillStyle = ft.color;
        ctx.font = "bold 12px sans-serif";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        
        // Draw text centered above the tile position
        ctx.fillText(ft.text, ft.x * cellW, ft.y * cellH - (60 - ft.life) * 0.5);
        ctx.restore();

        // Animate floating upward & fade out
        ft.life--;
        ft.opacity = ft.life / 60;

        if (ft.life <= 0) {
            window.floatingTexts.splice(i, 1);
        }
    }
}

function getIncomeColor(val) {
    let min = currentMinIncome;
    let max = currentMaxIncome;
    let t = (max === min) ? 0 : (val - min) / (max - min);
    t = Math.min(1.0, Math.max(0.0, t));

    let r, g, b;
    if (t < 0.25) {
        let k = t / 0.25;
        r = 255; g = Math.round(255 + (68 - 255) * k); b = Math.round(255 + (68 - 255) * k);
    } else if (t < 0.50) {
        let k = (t - 0.25) / 0.25;
        r = Math.round(239 + (34 - 239) * k); g = Math.round(68 + (197 - 68) * k); b = Math.round(68 + (94 - 68) * k);
    } else if (t < 0.75) {
        let k = (t - 0.50) / 0.25;
        r = Math.round(34 + (59 - 34) * k); g = Math.round(197 + (130 - 197) * k); b = Math.round(59 + (246 - 59) * k);
    } else {
        let k = (t - 0.75) / 0.25;
        r = Math.round(59 + (234 - 59) * k); g = Math.round(130 + (179 - 130) * k); b = Math.round(246 + (8 - 246) * k);
    }
    return `rgb(${r},${g},${b})`;
}

// Border Color Evaluator based on Diplomatic Status
function getBorderColor(nationA, nationB) {
    if (!nationA || !nationB) return "#000000";

    // 1. Enemy at War -> RED
    if (nationA.wars && nationA.wars[nationB.id] !== undefined) return "#e74c3c";

    // 2. Allied Nations -> BLUE
    if (nationA.allianceId !== null && nationA.allianceId === nationB.allianceId) return "#2980b9";

    // 3. Peace Treaty -> GREEN
    if (nationA.peaceTreaties && nationA.peaceTreaties[nationB.id] && nationA.peaceTreaties[nationB.id] > 0) return "#2ecc71";

    // 4. Neutral / No Relation -> BLACK
    return "#000000";
}

// Render UI Leaderboard Overlay for Active Alliances
function renderAllianceLeaderboard(ctx) {
    if (typeof alliances === "undefined") return;

    let allianceData = Object.values(alliances).map(a => {
        let totalTiles = 0;
        let activeMembers = 0;

        a.members.forEach(memberId => {
            let n = nations[memberId];
            if (n) {
                totalTiles += n.tiles.length;
                activeMembers++;
            }
        });

        return {
            name: a.name,
            color: a.color,
            tiles: totalTiles,
            membersCount: activeMembers
        };
    }).filter(a => a.membersCount > 0);

    // Sort by combined territory size
    allianceData.sort((a, b) => b.tiles - a.tiles);

    if (allianceData.length === 0) return;

    let panelX = 15;
    let panelY = 15;
    let panelW = 200;
    let rowH = 22;
    let panelH = 32 + Math.min(5, allianceData.length) * rowH;

    ctx.save();
    
    // Background Overlay
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 8);
    ctx.fill();
    ctx.stroke();

    // Title Header
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("👑 Top Alliances", panelX + 12, panelY + 22);

    // Top 5 Alliances List
    let maxEntries = Math.min(5, allianceData.length);
    for (let i = 0; i < maxEntries; i++) {
        let entry = allianceData[i];
        let yPos = panelY + 45 + (i * rowH);

        // Alliance Indicator Circle
        ctx.fillStyle = entry.color;
        ctx.beginPath();
        ctx.arc(panelX + 18, yPos - 4, 5, 0, Math.PI * 2);
        ctx.fill();

        // Name & Tile Count
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "11px sans-serif";
        let truncatedName = entry.name.length > 15 ? entry.name.substring(0, 14) + "…" : entry.name;
        ctx.fillText(`${i + 1}. ${truncatedName}`, panelX + 30, yPos);

        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "right";
        ctx.fillText(`${entry.tiles} tiles`, panelX + panelW - 12, yPos);
        ctx.textAlign = "left";
    }

    ctx.restore();
}

function render() {
    CANVAS.width = CANVAS.clientWidth;
    CANVAS.height = CANVAS.clientHeight;

    const baseCellW = CANVAS.width / WIDTH;
    const baseCellH = CANVAS.height / HEIGHT;

    CTR.fillStyle = "#030712"; 
    CTR.fillRect(0, 0, CANVAS.width, CANVAS.height);

    CTR.save();
    CTR.translate(panX, panY);
    CTR.scale(zoom, zoom);

    const cellW = baseCellW;
    const cellH = baseCellH;

    // 1. Terrain & Country Fills
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 1) {
                if (mapMode === 'income') {
                    let totalVal = getBaseTerrainValue(x, y) * tileMultiplier[y][x];
                    CTR.fillStyle = getIncomeColor(totalVal);
                } else if (mapMode === 'alliances') {
                    let ownerId = territory[y][x];
                    let owner = nations[ownerId];
                    if (owner && owner.allianceId && alliances[owner.allianceId]) {
                        CTR.fillStyle = alliances[owner.allianceId].color;
                    } else if (owner) {
                        CTR.fillStyle = owner.color;
                    } else {
                        CTR.fillStyle = terrainType[y][x] === 3 ? "#334155" : (terrainType[y][x] === 2 ? "#1e3a29" : "#1e293b");
                    }
                } else {
                    let ownerId = territory[y][x];
                    if (ownerId && nations[ownerId]) {
                        CTR.fillStyle = nations[ownerId].color;
                    } else {
                        CTR.fillStyle = terrainType[y][x] === 3 ? "#334155" : (terrainType[y][x] === 2 ? "#1e3a29" : "#1e293b");
                    }
                }
                CTR.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }

    // 2. DYNAMIC DIPLOMATIC BORDER LINES (THICK BORDERS)
    CTR.lineWidth = Math.max(1.0, 2.0 / zoom);
    CTR.lineCap = "round";
    CTR.lineJoin = "round";

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            let ownerId = territory[y][x];
            if (ownerId !== null && nations[ownerId]) {
                let nation = nations[ownerId];
                let px = x * cellW;
                let py = y * cellH;

                // Right Border Check
                if (x + 1 < WIDTH) {
                    let rightOwnerId = territory[y][x + 1];
                    if (rightOwnerId !== null && rightOwnerId !== ownerId) {
                        CTR.strokeStyle = getBorderColor(nation, nations[rightOwnerId]);
                        CTR.beginPath();
                        CTR.moveTo(px + cellW, py);
                        CTR.lineTo(px + cellW, py + cellH);
                        CTR.stroke();
                    }
                }

                // Bottom Border Check
                if (y + 1 < HEIGHT) {
                    let bottomOwnerId = territory[y + 1][x];
                    if (bottomOwnerId !== null && bottomOwnerId !== ownerId) {
                        CTR.strokeStyle = getBorderColor(nation, nations[bottomOwnerId]);
                        CTR.beginPath();
                        CTR.moveTo(px, py + cellH);
                        CTR.lineTo(px + cellW, py + cellH);
                        CTR.stroke();
                    }
                }

                // Map Edge Checks (Default to Black Border)
                if (x - 1 < 0 || territory[y][x - 1] === null) {
                    CTR.strokeStyle = "#000000";
                    CTR.beginPath();
                    CTR.moveTo(px, py);
                    CTR.lineTo(px, py + cellH);
                    CTR.stroke();
                }
                if (y - 1 < 0 || territory[y - 1][x] === null) {
                    CTR.strokeStyle = "#000000";
                    CTR.beginPath();
                    CTR.moveTo(px, py);
                    CTR.lineTo(px + cellW, py);
                    CTR.stroke();
                }
            }
        }
    }

    // 3. Render Cities
    cities.forEach(c => {
        let cx = c.x * cellW + cellW / 2;
        let cy = c.y * cellH + cellH / 2;
        let baseRadius = Math.max(2.0, cellW * 0.9);

        CTR.fillStyle = c.level >= 80 ? "#ffd700" : "#ffffff";
        CTR.strokeStyle = "#000000";
        CTR.lineWidth = 1.0;
        CTR.beginPath();
        CTR.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        CTR.fill();
        CTR.stroke();
    });

    // 4. Render Ships
    ships.forEach(ship => {
        let n = nations[ship.nationId];
        if (!n || ship.path.length < 2) return;

        let p = Math.min(ship.progress, ship.path.length - 1);
        let idx = Math.floor(p);
        let t = p - idx;

        let p1 = ship.path[idx];
        let p2 = ship.path[Math.min(idx + 1, ship.path.length - 1)];

        let interpolatedX = p1.x + (p2.x - p1.x) * t;
        let interpolatedY = p1.y + (p2.y - p1.y) * t;

        let sx = interpolatedX * cellW + cellW / 2;
        let sy = interpolatedY * cellH + cellH / 2;

        CTR.fillStyle = n.color;
        CTR.strokeStyle = "#ffffff";
        CTR.lineWidth = 1.2;
        CTR.beginPath();
        CTR.arc(sx, sy, Math.max(2.5, cellW * 0.8), 0, Math.PI * 2);
        CTR.fill();
        CTR.stroke();
    });

    // 5. Country Name Labels
    if (mapMode !== 'income') {
        Object.values(nations).forEach(n => {
            if (n.tiles.length < 30) return;

            let sumX = 0, sumY = 0;
            n.tiles.forEach(t => { sumX += t.x; sumY += t.y; });
            let centroidX = (sumX / n.tiles.length) * cellW + cellW / 2;
            let centroidY = (sumY / n.tiles.length) * cellH + cellH / 2;

            let labelText = mapMode === 'alliances' && n.allianceId && alliances[n.allianceId] ? 
                `${n.name} [${alliances[n.allianceId].name}]` : n.name;

            let fontSize = Math.max(8, Math.min(14, 11 / Math.sqrt(zoom)));
            CTR.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
            CTR.textAlign = "center";
            CTR.textBaseline = "middle";

            CTR.strokeStyle = "#000000";
            CTR.lineWidth = 2.5;
            CTR.strokeText(labelText, centroidX, centroidY);

            CTR.fillStyle = "#ffffff";
            CTR.fillText(labelText, centroidX, centroidY);
        });
    }

    // 6. Floating World Notifications
    renderFloatingTexts(CTR, cellW, cellH);

    CTR.restore();

    // 7. Render UI Overlay (Unscaled Canvas UI - Top-Left Leaderboard)
    renderAllianceLeaderboard(CTR);
}