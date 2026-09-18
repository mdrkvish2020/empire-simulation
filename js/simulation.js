// --- MAIN SIMULATION ENGINE ---

// Global Parameters
window.simSpeed = 4;
window.VICTORY_THRESHOLD = 0.75;

// Dynamic Camera & Smooth Pan/Zoom Configuration
window.camera = window.camera || { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 };

function updateCameraSmoothly() {
    let lerpFactor = 0.15; // Smooth interpolation rate
    window.camera.x += (window.camera.targetX - window.camera.x) * lerpFactor;
    window.camera.y += (window.camera.targetY - window.camera.y) * lerpFactor;
    window.camera.zoom += (window.camera.targetZoom - window.camera.zoom) * lerpFactor;
}

// 1. Calculate Pure Power Score (Strictly Army + Conquered Tiles)
function calculateNationPower(nation) {
    if (!nation || !nation.tiles || nation.tiles.length === 0) return 1.0;

    let tileCount = nation.tiles.length;
    let armySize = typeof nation.army === 'object' 
        ? ((nation.army.attack || 0) + (nation.army.defend || 0) + (nation.army.balanced || 0))
        : (nation.army !== undefined ? nation.army : (tileCount * 1.5));

    let rawPower = (tileCount * 1.0) + (armySize * 1.0);
    let powerMultiplier = 1.0 + Math.log10(1 + (rawPower / 100));

    return Math.min(2.5, Math.max(1.0, powerMultiplier));
}

// 2. Battle Resolution Helper
function resolveBattle(attackerId, defenderId, targetX, targetY) {
    let attacker = nations[attackerId];
    let defender = nations[defenderId];
    if (!attacker) return;

    let attackerPower = calculateNationPower(attacker);
    let defenderPower = defender ? calculateNationPower(defender) : 1.0;

    let powerRatio = attackerPower / defenderPower;
    let baseCasualties = 1;
    let attackerCasualties = Math.max(0, Math.round(baseCasualties / powerRatio));

    if (typeof attacker.army === 'object') {
        if (attacker.army.attack > 0) attacker.army.attack -= Math.min(attacker.army.attack, attackerCasualties);
        else attacker.army.balanced = Math.max(0, attacker.army.balanced - attackerCasualties);
    }

    if (defender && typeof defender.army === 'object') {
        let defenderCasualties = Math.round(baseCasualties * powerRatio);
        if (defender.army.defend > 0) defender.army.defend -= Math.min(defender.army.defend, defenderCasualties);
    }

    territory[targetY][targetX] = attackerId;
    attacker.tiles.push({ x: targetX, y: targetY });

    if (defender) {
        defender.tiles = defender.tiles.filter(t => !(t.x === targetX && t.y === targetY));
        defender.opinions[attacker.id] = Math.max(0, (defender.opinions[attacker.id] || 0) - 2.5);
    }
}

// 3. Main Tick Function
function tick() {
    year++;
    updateCameraSmoothly();
    
    let nationKeys = Object.keys(nations);
    recalculateCityMultipliers();

    let totalLandTiles = 0;
    nationKeys.forEach(id => { if (nations[id]) totalLandTiles += nations[id].tiles.length; });

    // 1. DIPLOMACY & FRICTION CHECKS
    updateDiplomacyAndFriction();
    updateAlliancesAndCoalitions(totalLandTiles);

    // Dynamic Diplomatic Alliance Invitations (>80% Relation) & Union Mergers (100% Relation + Long-time Peace)
    processAllianceAndUnionDiplomacy();

    // 2. DOMESTIC ECONOMY, EXPANSION & RECRUITMENT
    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        let coastalCount = 0;
        let newTiles = [];
        let totalIncome = 0;
        let totalPop = 0;

        let frontier = [];
        let seenFrontier = new Set();
        let borderTiles = [];
        let interiorTiles = [];

        n.tiles.forEach(t => {
            popGrid[t.y][t.x] += Math.floor(1 + Math.random() * 2 * tileMultiplier[t.y][t.x]);
            totalPop += popGrid[t.y][t.x];

            let baseTerrain = getBaseTerrainValue(t.x, t.y);
            totalIncome += baseTerrain * tileMultiplier[t.y][t.x];

            if (isCoastal(t.x, t.y)) coastalCount++;

            let nbs = getNeighbors(t.x, t.y);
            let isInterior = true;

            nbs.forEach(nb => {
                let owner = territory[nb.y][nb.x];
                if (owner !== n.id) isInterior = false;
                if (grid[nb.y][nb.x] === 1 && owner === null) {
                    let key = `${nb.x},${nb.y}`;
                    if (!seenFrontier.has(key)) {
                        seenFrontier.add(key);
                        let tType = terrainType[nb.y][nb.x];
                        frontier.push({x: nb.x, y: nb.y, type: tType});
                    }
                }
            });

            if (isInterior) interiorTiles.push(t);
            else borderTiles.push(t);
        });

        // Land Expansion
        if (frontier.length > 0) {
            let expansionBudget = Math.min(8, Math.floor(2 + n.tiles.length * 0.02));

            for (let i = 0; i < expansionBudget && frontier.length > 0; i++) {
                frontier.forEach(f => {
                    let friendlyNeighbors = 0;
                    let exposedBorder = 0;

                    getNeighbors(f.x, f.y).forEach(nb => {
                        let owner = territory[nb.y][nb.x];
                        if (owner === n.id) friendlyNeighbors++;
                        else if (owner === null) exposedBorder++;
                    });

                    let compactnessScore = (friendlyNeighbors * 2.5) - (exposedBorder * 1.2);
                    let terrainWeight = (f.type === 2) ? 15 : (f.type === 1 ? 4 : 1);
                    f.weight = Math.max(0.1, terrainWeight + compactnessScore);
                });

                let totalWeight = frontier.reduce((sum, f) => sum + f.weight, 0);
                let randVal = Math.random() * totalWeight;
                let cumulative = 0;
                let selectedIdx = 0;

                for (let j = 0; j < frontier.length; j++) {
                    cumulative += frontier[j].weight;
                    if (randVal <= cumulative) {
                        selectedIdx = j;
                        break;
                    }
                }

                let picked = frontier[selectedIdx];
                frontier.splice(selectedIdx, 1);

                let speedChance = (picked.type === 2) ? 1.0 : ((picked.type === 1) ? 0.60 : 0.12);

                if (Math.random() < speedChance) {
                    if (territory[picked.y][picked.x] === null) {
                        territory[picked.y][picked.x] = n.id;
                        newTiles.push({x: picked.x, y: picked.y});
                    }
                }
            }
        }

        n.population = totalPop;
        n.tiles.push(...newTiles);
        n.ports = coastalCount;

        // Financial Maintenance
        let threatenedSectorsCount = Object.keys(n.threatMarkers || {}).length;
        let cityDirectIncome = cities.filter(c => c.nationId === n.id).reduce((sum, c) => sum + (c.level * 4), 0);
        
        n.grossIncome = Math.floor((totalIncome * 0.25) + cityDirectIncome);
        let cityMaintenance = cities.filter(c => c.nationId === n.id).length * 0.2; 
        let perimeterDefBonus = threatenedSectorsCount > 0 ? 0.012 : 0.005;
        let troopMaintenance = (n.army.attack * 0.008) + (n.army.defend * perimeterDefBonus) + (n.army.balanced * 0.01);
        
        n.maintenance = Math.floor(cityMaintenance + troopMaintenance);
        n.netIncome = n.grossIncome - n.maintenance;
        n.gold += n.netIncome;

        if (n.gold < 0) {
            n.gold = 0;
            if (n.army.attack > 5) n.army.attack = Math.floor(n.army.attack * 0.90);
            if (n.army.defend > 5) n.army.defend = Math.floor(n.army.defend * 0.90);
        }

        // Army Recruitment & Subsidizing Allies
        let isAtWar = Object.keys(n.wars).length > 0;
        let isUnderThreat = threatenedSectorsCount > 0;
        let recruitRatio = (isAtWar || isUnderThreat) ? 0.65 : 0.20; 

        if (n.gold > 15) {
            // Donate excess wealth to fighting allies who cannot border the target
            if (!isAtWar && n.allianceId) {
                let fightingAlly = Object.values(nations).find(ally => ally.allianceId === n.allianceId && Object.keys(ally.wars).length > 0);
                if (fightingAlly && n.gold > 50) {
                    let donation = Math.floor(n.gold * 0.3);
                    n.gold -= donation;
                    fightingAlly.gold += donation;
                }
            }

            let budget = Math.floor(n.gold * recruitRatio);
            if (isUnderThreat && !isAtWar) {
                let count = Math.floor(budget / 3);
                n.army.defend += count;
                n.gold -= count * 3;
            } else if (isAtWar) {
                let count = Math.floor(budget / 3);
                n.army.attack += Math.floor(count * 0.6);
                n.army.balanced += Math.floor(count * 0.4);
                n.gold -= count * 3;
            } else {
                let pref = n.archetype.recruitPref;
                if (pref === 'attack' && n.gold >= 8) { n.army.attack += 3; n.gold -= 5; }
                else if (pref === 'defend' && n.gold >= 8) { n.army.defend += 3; n.gold -= 5; }
                else if (n.gold >= 10) { n.army.balanced += 2; n.gold -= 6; }
            }
        }

        // Cities
        let myCities = cities.filter(c => c.nationId === n.id);
        let requiredTilesPerCity = 200;
        let minDistanceBetweenCities = 30;
        let newCityCost = Math.floor(400 + Math.pow(myCities.length, 2) * 350);

        if (!isAtWar && n.tiles.length >= (myCities.length + 1) * requiredTilesPerCity && Math.random() < 0.03) {
            if (n.gold >= newCityCost) {
                let candidates = n.tiles.filter(t => {
                    if (cityGrid[t.y][t.x]) return false;
                    for (let c of cities) {
                        if (Math.hypot(c.x - t.x, c.y - t.y) < minDistanceBetweenCities) return false;
                    }
                    return true;
                });

                if (candidates.length > 0) {
                    let spot = candidates[Math.floor(Math.random() * candidates.length)];
                    n.gold -= newCityCost;
                    buildCity(n.id, spot.x, spot.y);
                }
            }
        } else if (!isAtWar && myCities.length > 0) {
            let upgradeable = myCities.filter(c => c.level < 100);
            if (upgradeable.length > 0) {
                upgradeable.sort((a, b) => a.level - b.level);
                let targetCity = upgradeable[0];
                let upgradeCost = Math.floor(15 + targetCity.level * 5);

                if (n.gold >= upgradeCost) {
                    n.gold -= upgradeCost;
                    targetCity.level++;
                }
            }
        }
    });

    // 3. WARFARE DECISIONS & COORDINATED ALLIANCE TARGETING
    checkWarDeclarations();
    processCoordinatedAllianceWarfare();

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        Object.keys(n.wars).forEach(enemyId => {
            n.wars[enemyId]++;
            let enemy = nations[enemyId];

            if (!enemy) {
                delete n.wars[enemyId];
                return;
            }

            n.opinions[enemyId] = Math.max(0, n.opinions[enemyId] - 0.2);

            let warLength = n.wars[enemyId];
            let totalMyArmy = n.army.attack + n.army.defend + n.army.balanced;
            let totalEnemyArmy = enemy.army.attack + enemy.army.defend + enemy.army.balanced;

            if (warLength > 100) {
                if (totalMyArmy < 15 && totalEnemyArmy < 15 && n.gold < 40 && enemy.gold < 40 && Math.random() < 0.05) {
                    if (!signPeaceTreaty(n.id, enemy.id, "war exhaustion")) {
                        endWarToNeutral(n.id, enemy.id, "exhaustion ceasefire");
                    }
                } else if (warLength > 250 && Math.abs(totalMyArmy - totalEnemyArmy) < 10 && Math.random() < 0.02) {
                    if (!signPeaceTreaty(n.id, enemy.id, "stalemate")) {
                        endWarToNeutral(n.id, enemy.id, "stalemate ceasefire");
                    }
                }
            }
        });
    });

    // 4. NAVAL EXPEDITIONS
    const MAX_SHIPS_PER_NATION = 4;
    const LAUNCH_COOLDOWN_TICKS = 25;

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n || n.ports === 0 || (n.army.attack + n.army.balanced) < 8) return;

        let activeNationShips = ships.filter(s => s.nationId === n.id).length;
        if (activeNationShips >= MAX_SHIPS_PER_NATION) return;
        if (n.lastNavalLaunch && (year - n.lastNavalLaunch) < LAUNCH_COOLDOWN_TICKS) return;

        if (Math.random() < 0.10) {
            let exp = findSeaExpedition(n.id);
            if (exp) {
                if (n.army.attack >= 8) n.army.attack -= 8;
                else n.army.balanced -= 8;

                n.lastNavalLaunch = year;

                ships.push({
                    nationId: n.id,
                    path: exp.path,
                    progress: 0,
                    type: exp.type,
                    target: exp.target,
                    enemyId: exp.enemyId || null
                });
            }
        }
    });

    let activeShips = [];
    ships.forEach(ship => {
        ship.progress += 0.50; 
        let owner = nations[ship.nationId];
        if (!owner) return;

        if (ship.progress >= ship.path.length - 1) {
            let tx = ship.target.x, ty = ship.target.y;
            if (ship.type === 'colonize' && territory[ty][tx] === null && grid[ty][tx] === 1) {
                territory[ty][tx] = owner.id;
                owner.tiles.push({x: tx, y: ty});
                owner.army.balanced += 5;
            } else if (ship.type === 'invasion') {
                let enemy = nations[ship.enemyId];
                if (enemy && territory[ty][tx] === enemy.id) {
                    resolveBattle(owner.id, enemy.id, tx, ty);

                    let sectorKey = `${Math.floor(tx / 10)},${Math.floor(ty / 10)}`;
                    if (!enemy.threatMarkers) enemy.threatMarkers = {};
                    enemy.threatMarkers[sectorKey] = 25;

                    if (enemy.tiles.length === 0) {
                        logNews(`💥 <b>${owner.name}</b> conquered and annexed <b>${enemy.name}</b> via naval invasion!`);
                        removeNation(enemy.id);
                    }
                }
            }
        } else {
            activeShips.push(ship);
        }
    });
    ships = activeShips;

    // 5. COMBAT RESOLUTION
    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n || Object.keys(n.wars).length === 0 || (n.army.attack + n.army.balanced) < 2) return;

        let frontlines = buildFrontlines(n.id);
        if (frontlines.length === 0) return;

        if (!n.objectiveQueue || n.objectiveQueue.length === 0) {
            selectClusterObjective(n, frontlines);
        }

        if (n.objectiveQueue) {
            n.objectiveQueue = n.objectiveQueue.filter(t => territory[t.y][t.x] !== n.id);
        }

        let candidateAttacks = [];

        if (n.objectiveQueue && n.objectiveQueue.length > 0) {
            n.objectiveQueue.forEach(target => {
                getNeighbors(target.x, target.y).forEach(nb => {
                    if (territory[nb.y][nb.x] === n.id) {
                        let enemyId = territory[target.y][target.x];
                        if (enemyId && n.wars[enemyId] !== undefined && (n.allianceId === null || n.allianceId !== nations[enemyId]?.allianceId)) {
                            candidateAttacks.push({ attackerTile: nb, targetTile: target, enemyId: enemyId, isPrimary: true });
                        }
                    }
                });
            });
        }

        if (candidateAttacks.length === 0) {
            frontlines.forEach((front, index) => {
                let isPrimary = (index === 0);
                front.tiles.forEach(fTile => {
                    let enemyId = territory[fTile.y][fTile.x];
                    if (enemyId && n.wars[enemyId] !== undefined && (n.allianceId === null || n.allianceId !== nations[enemyId]?.allianceId)) {
                        getNeighbors(fTile.x, fTile.y).forEach(nb => {
                            if (territory[nb.y][nb.x] === n.id) {
                                candidateAttacks.push({ attackerTile: nb, targetTile: fTile, enemyId: enemyId, isPrimary: isPrimary });
                            }
                        });
                    }
                });
            });
        }

        if (candidateAttacks.length > 0) {
            let myPower = calculateNationPower(n);
            let offensivePower = n.army.attack + n.army.balanced;
            let maxAttacks = Math.max(1, Math.min(12, Math.floor((offensivePower / 10) * myPower)));

            for (let a = 0; a < maxAttacks && candidateAttacks.length > 0; a++) {
                candidateAttacks.forEach(c => {
                    let friendlyNeighbors = 0;
                    let exposedBorder = 0;

                    getNeighbors(c.targetTile.x, c.targetTile.y).forEach(nb => {
                        let owner = territory[nb.y][nb.x];
                        if (owner === n.id) friendlyNeighbors++;
                        else if (owner === null || (owner !== n.id && n.wars[owner] === undefined)) exposedBorder++;
                    });

                    let compactnessScore = (friendlyNeighbors * 2.5) - (exposedBorder * 1.2);
                    let priorityMultiplier = c.isPrimary ? 2.0 : 0.5;
                    c.score = Math.max(0.1, compactnessScore * priorityMultiplier);
                });

                let totalScore = candidateAttacks.reduce((sum, c) => sum + c.score, 0);
                let randVal = Math.random() * totalScore;
                let cumulative = 0;
                let combatIdx = 0;

                for (let j = 0; j < candidateAttacks.length; j++) {
                    cumulative += candidateAttacks[j].score;
                    if (randVal <= cumulative) {
                        combatIdx = j;
                        break;
                    }
                }

                let combat = candidateAttacks[combatIdx];
                candidateAttacks.splice(combatIdx, 1);

                let enemy = nations[combat.enemyId];
                if (!enemy) continue;

                let tx = combat.targetTile.x, ty = combat.targetTile.y;
                resolveBattle(n.id, combat.enemyId, tx, ty);

                let sectorKey = `${Math.floor(tx / 10)},${Math.floor(ty / 10)}`;
                if (!enemy.threatMarkers) enemy.threatMarkers = {};
                enemy.threatMarkers[sectorKey] = 30;

                if (cityGrid[ty][tx]) cityGrid[ty][tx].nationId = n.id;

                if (enemy.tiles.length === 0) {
                    logNews(`💥 <b>${n.name}</b> completely conquered and annexed <b>${enemy.name}</b>!`);
                    removeNation(enemy.id);
                    n.objectiveQueue = [];
                    break;
                }
            }
        }
    });

    checkDominationVictory(totalLandTiles);
    render();

    let now = Date.now();
    if (now - lastLeaderboardUpdate >= 2000) {
        updateLeaderboard();
        lastLeaderboardUpdate = now;
    }
}

// 4. COORDINATED ALLIANCE WARFARE & WEAKEST BORDER SELECTION
function processCoordinatedAllianceWarfare() {
    let allianceGroups = {};

    Object.values(nations).forEach(n => {
        if (!n) return;
        let groupKey = n.allianceId ? `alliance_${n.allianceId}` : `solo_${n.id}`;
        if (!allianceGroups[groupKey]) allianceGroups[groupKey] = [];
        allianceGroups[groupKey].push(n);
    });

    Object.values(allianceGroups).forEach(members => {
        let activelyAtWar = members.some(m => Object.keys(m.wars).length > 0);

        // Alliance Rule: Focus on exactly 1 country at a time, wait until war ends
        if (activelyAtWar) {
            let activeEnemyId = null;
            members.forEach(m => {
                let enemyKeys = Object.keys(m.wars);
                if (enemyKeys.length > 0) activeEnemyId = enemyKeys[0];
            });

            if (activeEnemyId && nations[activeEnemyId]) {
                members.forEach(m => {
                    if (m.wars[activeEnemyId] === undefined) {
                        m.wars[activeEnemyId] = 1; // Join ally in war at the same time
                    }
                });
            }
            return; 
        }

        // If at peace, allies check bordering nations and target the WEAKEST mutually bordering country
        let collectiveBorderingEnemies = new Set();
        members.forEach(m => {
            getNeighboringNations(m.id).forEach(enemyId => {
                if (!m.allianceId || nations[enemyId].allianceId !== m.allianceId) {
                    collectiveBorderingEnemies.add(enemyId);
                }
            });
        });

        if (collectiveBorderingEnemies.size === 0) return;

        // Select the weakest surrounding country
        let targets = Array.from(collectiveBorderingEnemies).map(eId => nations[eId]).filter(e => e);
        targets.sort((a, b) => calculateNationPower(a) - calculateNationPower(b));

        let selectedTarget = targets[0];
        if (!selectedTarget) return;

        // Declare simultaneous coordinated war
        members.forEach(m => {
            let bordersTarget = getNeighboringNations(m.id).includes(selectedTarget.id);
            if (bordersTarget) {
                m.wars[selectedTarget.id] = 1;
            } else {
                // If member doesn't border, it subsidizes allies via gold donations
                let primaryAttacker = members.find(ally => getNeighboringNations(ally.id).includes(selectedTarget.id));
                if (primaryAttacker && m.gold > 30) {
                    let donation = Math.floor(m.gold * 0.4);
                    m.gold -= donation;
                    primaryAttacker.gold += donation;
                }
            }
        });
    });
}

// 5. DIPLOMATIC ALLIANCE INVITATIONS (>80%) & UNION FORMATION (100% + Historical Peace)
function processAllianceAndUnionDiplomacy() {
    let nationList = Object.values(nations);

    for (let i = 0; i < nationList.length; i++) {
        for (let j = i + 1; j < nationList.length; j++) {
            let n1 = nationList[i];
            let n2 = nationList[j];
            if (!n1 || !n2) continue;

            let relation1 = n1.opinions[n2.id] || 50;
            let relation2 = n2.opinions[n1.id] || 50;

            // Alliance Invites: Relations > 80% to avoid fighting
            if (relation1 > 80 && relation2 > 80 && !n1.allianceId && !n2.allianceId) {
                let newAllianceId = `alliance_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                n1.allianceId = newAllianceId;
                n2.allianceId = newAllianceId;
                logNews(`🤝 <b>${n1.name}</b> and <b>${n2.name}</b> formed an Alliance to prevent war!`);
            }

            // Union Formation: 100% Relations + Long-time Allies + Never at war
            let hasBeenAtWar = (n1.warHistory && n1.warHistory[n2.id]) || (n2.warHistory && n2.warHistory[n1.id]);
            if (relation1 >= 100 && relation2 >= 100 && n1.allianceId && n1.allianceId === n2.allianceId && !hasBeenAtWar) {
                if (Math.random() < 0.01) { 
                    mergeNationsIntoUnion(n1, n2);
                    return;
                }
            }
        }
    }
}

// 6. Merge Two Countries Into a Single Union
function mergeNationsIntoUnion(n1, n2) {
    let primary = n1.tiles.length >= n2.tiles.length ? n1 : n2;
    let absorbed = n1.tiles.length >= n2.tiles.length ? n2 : n1;

    logNews(`👑 <b>${primary.name}</b> and <b>${absorbed.name}</b> merged into a unified Union!`);

    primary.tiles.push(...absorbed.tiles);
    absorbed.tiles.forEach(t => { territory[t.y][t.x] = primary.id; });

    primary.gold += absorbed.gold;
    primary.army.attack += absorbed.army.attack;
    primary.army.defend += absorbed.army.defend;
    primary.army.balanced += absorbed.army.balanced;

    delete nations[absorbed.id];
}

// Helper: Get Neighboring Nations
function getNeighboringNations(nationId) {
    let neighborIds = new Set();
    let nation = nations[nationId];
    if (!nation || !nation.tiles) return [];

    nation.tiles.forEach(t => {
        const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
        dirs.forEach(([dx, dy]) => {
            let nx = t.x + dx;
            let ny = t.y + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
                let neighborOwner = territory[ny][nx];
                if (neighborOwner !== null && neighborOwner !== nationId) {
                    neighborIds.add(neighborOwner);
                }
            }
        });
    });
    return Array.from(neighborIds);
}

// Check Victory Conditions
function checkDominationVictory(totalLandTiles) {
    if (!totalLandTiles || totalLandTiles === 0) return;

    Object.values(nations).forEach(n => {
        if (!n || !n.tiles) return;
        let controlRatio = n.tiles.length / totalLandTiles;

        if (controlRatio >= window.VICTORY_THRESHOLD && !window.gameWon) {
            window.gameWon = true;
            if (typeof addFloatingText === "function") {
                addFloatingText(`👑 ${n.name} achieved 75% Domination Victory!`, WIDTH / 2, HEIGHT / 2, "#ffd700");
            }
            if (typeof logNews === "function") {
                logNews(`🏆 <b>${n.name}</b> has reached 75% land control and achieved <b>Domination Victory</b>!`);
            }
        }
    });
}

// Exports
window.tick = tick;
window.calculateNationPower = calculateNationPower;