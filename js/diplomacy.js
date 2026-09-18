// --- DIPLOMACY, DYNAMIC BORDERS, PEACE TREATIES & ALLIANCES ---

window.floatingTexts = [];

// Helper function exported globally for simulation.js and other modules
window.isCoastal = function(x, y) {
    if (typeof grid === "undefined" || !grid[y] || grid[y][x] === 0) return false;
    if (typeof getNeighbors !== "function") return false;
    let nbs = getNeighbors(x, y);
    return nbs.some(nb => grid[nb.y] && grid[nb.y][nb.x] === 0);
};

// Optimized Floating Text for Major Events (War & Peace)
function addFloatingText(text, x, y, color = "#ffd700") {
    if (window.floatingTexts.length > 15) {
        window.floatingTexts.shift();
    }

    window.floatingTexts.push({
        text: text,
        x: x,
        y: y,
        color: color,
        life: 60,
        opacity: 1.0
    });
}

function generateUniqueAllianceColor() {
    let usedHues = Object.values(alliances).map(a => a.hue);
    let bestHue = Math.floor(Math.random() * 360);
    let maxMinDist = -1;

    for (let i = 0; i < 35; i++) {
        let candidate = Math.floor(Math.random() * 360);
        if (usedHues.length === 0) { bestHue = candidate; break; }

        let minDist = Math.min(...usedHues.map(h => {
            let d = Math.abs(h - candidate);
            return Math.min(d, 360 - d);
        }));

        if (minDist > maxMinDist) {
            maxMinDist = minDist;
            bestHue = candidate;
        }
    }

    return { color: `hsl(${bestHue}, 85%, 60%)`, hue: bestHue };
}

function initializeNationDiplomacy() {
    let keys = Object.keys(nations);

    keys.forEach(id => {
        let n = nations[id];
        if (!n) return;
        if (!n.opinions) n.opinions = {};
        if (!n.peaceTreaties) n.peaceTreaties = {};

        keys.forEach(otherId => {
            if (id === otherId) return;
            n.opinions[otherId] = Math.floor(35 + Math.random() * 30);
        });

        let potentialRivals = keys.filter(k => k !== id);
        let rivalCount = Math.min(2, potentialRivals.length);
        
        for (let i = 0; i < rivalCount; i++) {
            let rivalId = potentialRivals[Math.floor(Math.random() * potentialRivals.length)];
            n.opinions[rivalId] = Math.floor(20 + Math.random() * 15);
        }
    });
}

// --- PEACE TREATIES & STALEMATE PREVENTION ---

function canSignPeaceTreaty(nationA_Id, nationB_Id) {
    let a = nations[nationA_Id];
    let b = nations[nationB_Id];
    if (!a || !b) return false;

    // Prevent Stalemates: Maximum 2 peace treaties allowed per nation at a time
    let activePeacesA = Object.keys(a.peaceTreaties || {}).length;
    let activePeacesB = Object.keys(b.peaceTreaties || {}).length;
    if (activePeacesA >= 2 || activePeacesB >= 2) return false;

    let neighborsA = Array.from(getNeighborNations(nationA_Id));
    if (neighborsA.includes(nationB_Id)) {
        let peaceCountA = neighborsA.filter(id => a.peaceTreaties[id] && a.peaceTreaties[id] > 0).length;
        if (neighborsA.length > 1 && (peaceCountA + 1) >= neighborsA.length) {
            return false;
        }
    }

    let neighborsB = Array.from(getNeighborNations(nationB_Id));
    if (neighborsB.includes(nationA_Id)) {
        let peaceCountB = neighborsB.filter(id => b.peaceTreaties[id] && b.peaceTreaties[id] > 0).length;
        if (neighborsB.length > 1 && (peaceCountB + 1) >= neighborsB.length) {
            return false;
        }
    }

    return true;
}

function signPeaceTreaty(nationA_Id, nationB_Id, reason = "diplomatic pact") {
    if (!canSignPeaceTreaty(nationA_Id, nationB_Id)) return false;

    let a = nations[nationA_Id];
    let b = nations[nationB_Id];
    if (!a || !b) return false;

    if (a.wars[nationB_Id] !== undefined) delete a.wars[nationB_Id];
    if (b.wars[nationA_Id] !== undefined) delete b.wars[nationA_Id];

    a.peaceTreaties[nationB_Id] = 400;
    b.peaceTreaties[nationA_Id] = 400;

    logNews(`🕊️ <b>${a.name}</b> and <b>${b.name}</b> signed a short <b>Peace Treaty</b> (${reason})!`);

    if (a.tiles.length > 0) {
        let centerA = a.tiles[Math.floor(a.tiles.length / 2)];
        addFloatingText(`🕊️ Peace w/ ${b.name}`, centerA.x, centerA.y, "#2ecc71");
    }

    return true;
}

function endWarToNeutral(nationA_Id, nationB_Id, reason = "ceasefire") {
    let a = nations[nationA_Id];
    let b = nations[nationB_Id];

    if (a && a.wars[nationB_Id] !== undefined) delete a.wars[nationB_Id];
    if (b && b.wars[nationA_Id] !== undefined) delete b.wars[nationA_Id];

    if (a && b) {
        logNews(`🤝 <b>${a.name}</b> and <b>${b.name}</b> agreed to a <b>Ceasefire</b>.`);
    }
}

function processMultiWarPeaceOffers(nation) {
    let activeWarIds = Object.keys(nation.wars);
    
    if (activeWarIds.length >= 2 && Math.random() < 0.08) {
        let targetEnemyId = activeWarIds[Math.floor(Math.random() * activeWarIds.length)];
        let enemy = nations[targetEnemyId];

        if (!enemy) return;

        let mySize = nation.tiles.length;
        let enemySize = enemy.tiles.length;
        let ratio = mySize / Math.max(1, enemySize);

        let acceptanceChance = 0.35; 
        if (ratio < 0.6) {
            acceptanceChance = 0.15;
        } else if (ratio > 1.2) {
            acceptanceChance = 0.75;
        }

        if (Math.random() < acceptanceChance) {
            signPeaceTreaty(nation.id, enemy.id, "avoiding multi-front war");
        }
    }
}

// --- ENCLAVE ANNEXATION LOGIC (SILENT) ---

function checkEnclaveAnnexation() {
    if (typeof territory === "undefined" || typeof getNeighbors !== "function") return;

    Object.keys(nations).forEach(id => {
        let n = nations[id];
        if (!n || n.tiles.length === 0) return;

        let unvisited = new Set(n.tiles.map(t => `${t.x},${t.y}`));
        let clusters = [];

        while (unvisited.size > 0) {
            let startKey = unvisited.values().next().value;
            let [sx, sy] = startKey.split(',').map(Number);
            let queue = [{x: sx, y: sy}];
            let cluster = [];
            unvisited.delete(startKey);

            while (queue.length > 0) {
                let curr = queue.shift();
                cluster.push(curr);

                let nbs = getNeighbors(curr.x, curr.y);
                for (let nb of nbs) {
                    let key = `${nb.x},${nb.y}`;
                    if (unvisited.has(key)) {
                        unvisited.delete(key);
                        queue.push(nb);
                    }
                }
            }
            clusters.push(cluster);
        }

        clusters.forEach(cluster => {
            let surroundingOwners = new Set();
            let touchesWaterOrUnclaimed = false;

            for (let tile of cluster) {
                let nbs = getNeighbors(tile.x, tile.y);
                for (let nb of nbs) {
                    if (grid[nb.y] && grid[nb.y][nb.x] === 0) {
                        touchesWaterOrUnclaimed = true;
                        break;
                    }
                    let owner = territory[nb.y][nb.x];
                    if (owner === null) {
                        touchesWaterOrUnclaimed = true;
                        break;
                    }
                    if (owner !== n.id) {
                        surroundingOwners.add(owner);
                    }
                }
                if (touchesWaterOrUnclaimed) break;
            }

            // Silent annexation without news log or floating text
            if (!touchesWaterOrUnclaimed && surroundingOwners.size === 1) {
                let conquerorId = surroundingOwners.values().next().value;
                let conqueror = nations[conquerorId];

                if (conqueror) {
                    cluster.forEach(tile => {
                        territory[tile.y][tile.x] = conquerorId;
                    });

                    n.tiles = n.tiles.filter(t => !cluster.some(ct => ct.x === t.x && ct.y === t.y));
                    conqueror.tiles.push(...cluster);
                }
            }
        });
    });
}

// --- WAR DECLARATIONS ---

function declareWar(attackerId, defenderId) {
    let attacker = nations[attackerId];
    let defender = nations[defenderId];
    if (!attacker || !defender) return;

    if (Object.keys(attacker.wars).length >= 2) return;

    if (attacker.wars[defenderId] !== undefined) return;
    if (attacker.peaceTreaties[defenderId] && attacker.peaceTreaties[defenderId] > 0) return;
    if (attacker.allianceId && defender.allianceId && attacker.allianceId === defender.allianceId) return;

    attacker.wars[defenderId] = 0;
    defender.wars[attackerId] = 0;

    logNews(`⚔️ <b>${attacker.name}</b> declared war on <b>${defender.name}</b>!`);

    if (attacker.tiles.length > 0) {
        let center = attacker.tiles[Math.floor(attacker.tiles.length / 2)];
        addFloatingText(`⚔️ War w/ ${defender.name}`, center.x, center.y, "#e74c3c");
    }

    if (attacker.allianceId && alliances[attacker.allianceId]) {
        let alliance = alliances[attacker.allianceId];
        alliance.members.forEach(allyId => {
            if (allyId !== attackerId && nations[allyId]) {
                let ally = nations[allyId];
                if (ally.wars[defenderId] === undefined && (!ally.peaceTreaties[defenderId] || ally.peaceTreaties[defenderId] <= 0)) {
                    ally.wars[defenderId] = 0;
                    defender.wars[allyId] = 0;
                    logNews(`🗡️ <b>${ally.name}</b> joined <b>${attacker.name}</b>'s offensive against <b>${defender.name}</b>!`);
                }
            }
        });
    }

    if (defender.allianceId && alliances[defender.allianceId]) {
        let alliance = alliances[defender.allianceId];
        alliance.members.forEach(allyId => {
            if (allyId !== defenderId && nations[allyId]) {
                let ally = nations[allyId];
                if (ally.wars[attackerId] === undefined && (!ally.peaceTreaties[attackerId] || ally.peaceTreaties[attackerId] <= 0)) {
                    ally.wars[attackerId] = 0;
                    attacker.wars[allyId] = 0;
                    logNews(`🛡️ <b>${ally.name}</b> declared war on <b>${attacker.name}</b> to defend ally <b>${defender.name}</b>!`);
                }
            }
        });
    }
}

function updateDiplomacyAndFriction() {
    let nationKeys = Object.keys(nations);

    checkEnclaveAnnexation();

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        if (!n.opinions) n.opinions = {};
        if (!n.peaceTreaties) n.peaceTreaties = {};

        processMultiWarPeaceOffers(n);

        nationKeys.forEach(otherId => {
            if (otherId !== n.id && n.opinions[otherId] === undefined) {
                n.opinions[otherId] = Math.floor(35 + Math.random() * 30);
            }
        });

        let neighbors = Array.from(getNeighborNations(n.id));

        neighbors.forEach(neighborId => {
            let neighbor = nations[neighborId];
            if (!neighbor) return;

            let isAlly = (n.allianceId && n.allianceId === neighbor.allianceId);
            if (!isAlly && n.opinions[neighborId] > 0) {
                n.opinions[neighborId] = Math.max(0, n.opinions[neighborId] - 0.03);
            }
        });

        Object.keys(n.opinions).forEach(otherId => {
            let oId = parseInt(otherId);
            if (!neighbors.includes(oId) && n.wars[otherId] === undefined) {
                if (n.opinions[otherId] < 50) n.opinions[otherId] = Math.min(50, n.opinions[otherId] + 0.05);
                else if (n.opinions[otherId] > 50) n.opinions[otherId] = Math.max(50, n.opinions[otherId] - 0.05);
            }
        });

        Object.keys(n.peaceTreaties).forEach(otherId => {
            if (n.peaceTreaties[otherId] > 0) n.peaceTreaties[otherId]--;
            else delete n.peaceTreaties[otherId];
        });
    });
}

function updateAlliancesAndCoalitions(totalLandTiles) {
    const ALLIANCE_DURATION = 150;
    let nationKeys = Object.keys(nations);

    let hegemon = null;
    nationKeys.forEach(id => {
        let n = nations[id];
        if (n && totalLandTiles > 0 && (n.tiles.length / totalLandTiles) >= 0.50) {
            hegemon = n;
        }
    });

    if (hegemon) {
        let hegemonControl = ((hegemon.tiles.length / totalLandTiles) * 100).toFixed(1);

        nationKeys.forEach(id => {
            let n = nations[id];
            if (!n || n.id === hegemon.id) return;

            let isHegemonAlly = (n.allianceId !== null && hegemon.allianceId !== null && n.allianceId === hegemon.allianceId);
            let hasPeaceWithHegemon = (n.peaceTreaties[hegemon.id] && n.peaceTreaties[hegemon.id] > 0);

            if (!isHegemonAlly && !hasPeaceWithHegemon) {
                if (n.wars[hegemon.id] === undefined && Math.random() < 0.12) {
                    declareWar(n.id, hegemon.id);
                    logNews(`🚨 <b>${n.name}</b> joined Containment War against <b>${hegemon.name}</b> (${hegemonControl}% map share)!`);
                }
            }
        });
    }

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        if (n.allianceTimer === undefined) n.allianceTimer = 0;

        if (n.allianceId === null && Math.random() < 0.05) {
            let potentialPartners = Object.values(nations).filter(other => 
                other.id !== n.id && 
                n.wars[other.id] === undefined && 
                other.allianceId === null &&
                (n.opinions[other.id] || 50) >= 45 &&
                (other.opinions[n.id] || 50) >= 45
            );

            if (potentialPartners.length > 0) {
                let partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
                let allianceId = nextAllianceId++;
                let allianceName = ALLIANCE_PREFIXES[Math.floor(Math.random() * ALLIANCE_PREFIXES.length)] + " " + n.name;
                let allianceColorObj = generateUniqueAllianceColor();

                alliances[allianceId] = {
                    id: allianceId,
                    name: allianceName,
                    leaderId: n.id,
                    color: allianceColorObj.color,
                    hue: allianceColorObj.hue,
                    members: [n.id, partner.id]
                };

                n.allianceId = allianceId;
                n.allianceTimer = ALLIANCE_DURATION;
                partner.allianceId = allianceId;
                partner.allianceTimer = ALLIANCE_DURATION;

                n.peaceTreaties[partner.id] = 400;
                partner.peaceTreaties[partner.id] = 400;

                logNews(`👑 <b>${n.name}</b> and <b>${partner.name}</b> formed the <b>${allianceName}</b>!`);

                if (n.tiles.length > 0) {
                    let center = n.tiles[Math.floor(n.tiles.length / 2)];
                    addFloatingText(`👑 ${allianceName}`, center.x, center.y, allianceColorObj.color);
                }
            }
        }
    });
}

function checkWarDeclarations() {
    let nationKeys = Object.keys(nations);

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        if (Object.keys(n.wars).length >= 2) return;

        let neighborNations = Array.from(getNeighborNations(n.id));
        neighborNations.forEach(targetId => {
            let target = nations[targetId];
            if (!target) return;

            let isSameAlliance = (n.allianceId !== null && n.allianceId === target.allianceId);
            let isAtWar = n.wars[targetId] !== undefined;
            let hasPeaceTreaty = n.peaceTreaties[targetId] && n.peaceTreaties[targetId] > 0;

            if (!isSameAlliance && !isAtWar && !hasPeaceTreaty) {
                let currentOpinion = n.opinions[targetId] || 50;
                let isAggressive = (n.archetype.type === 'Warlord' || n.archetype.type === 'Expansionist');
                let warThreshold = isAggressive ? 55 : 40;

                if (currentOpinion < warThreshold) {
                    let aggressChance = (warThreshold - currentOpinion) * 0.002 * n.archetype.aggressiveness;
                    if (Math.random() < aggressChance) {
                        declareWar(n.id, targetId);
                    }
                }
            }
        });
    });
}

// ANTI-SNAKE BORDER LOGIC
function canAttackTile(attacker, targetX, targetY) {
    let targetOwnerId = territory[targetY][targetX];
    if (targetOwnerId === attacker.id) return false;

    if (targetOwnerId !== null) {
        let targetNation = nations[targetOwnerId];
        if (targetNation) {
            if (attacker.allianceId !== null && attacker.allianceId === targetNation.allianceId) return false;
            if (attacker.peaceTreaties[targetOwnerId] && attacker.peaceTreaties[targetOwnerId] > 0) return false;
            if (attacker.wars[targetOwnerId] === undefined) return false;
        }
    }

    if (typeof getNeighbors === "function") {
        let nbs = getNeighbors(targetX, targetY);
        let friendlyNeighborCount = 0;

        for (let nb of nbs) {
            if (territory[nb.y] && territory[nb.y][nb.x] === attacker.id) {
                friendlyNeighborCount++;
            }
        }

        if (friendlyNeighborCount < 2 && Math.random() > 0.15) {
            return false;
        }
    }

    return true;
}

function findSeaExpedition(nationId, maxDist = 45) {
    let nation = nations[nationId];
    if (!nation) return null;

    let coastalTiles = nation.tiles.filter(t => window.isCoastal(t.x, t.y));
    if (coastalTiles.length === 0) return null;

    let start = coastalTiles[Math.floor(Math.random() * coastalTiles.length)];
    let queue = [{x: start.x, y: start.y, path: [{x: start.x, y: start.y}], dist: 0}];
    let visited = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(false));
    visited[start.y][start.x] = true;

    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr.dist > maxDist) continue;

        let nbs = getNeighbors(curr.x, curr.y);
        for (let nb of nbs) {
            if (visited[nb.y][nb.x]) continue;
            visited[nb.y][nb.x] = true;

            if (grid[nb.y][nb.x] === 1) {
                let owner = territory[nb.y][nb.x];
                if (owner === null && curr.dist > 3) {
                    return { type: 'colonize', start, target: nb, path: curr.path };
                } else if (owner !== null && owner !== nationId && nation.wars[owner] !== undefined && curr.dist > 4) {
                    return { type: 'invasion', start, target: nb, enemyId: owner, path: curr.path };
                }
            } else if (grid[nb.y][nb.x] === 0) {
                queue.push({ x: nb.x, y: nb.y, path: [...curr.path, nb], dist: curr.dist + 1 });
            }
        }
    }
    return null;
}