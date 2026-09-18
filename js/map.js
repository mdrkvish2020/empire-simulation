// --- CLUSTER AI & FRONTLINE HELPER FUNCTIONS ---

// Neighbor Grid Helper
function getNeighbors(x, y) {
    let list = [];
    if (x > 0) list.push({x: x - 1, y: y});
    if (x < WIDTH - 1) list.push({x: x + 1, y: y});
    if (y > 0) list.push({x: x, y: y - 1});
    if (y < HEIGHT - 1) list.push({x: x, y: y + 1});
    return list;
}

// Run once during map/nation initialization
function initializeNationDiplomacy() {
    let keys = Object.keys(nations);

    keys.forEach(id => {
        let n = nations[id];
        if (!n.opinions) n.opinions = {};

        keys.forEach(otherId => {
            if (id === otherId) return;

            // Baseline variance around neutral (35 to 65)
            let baseOpinion = Math.floor(35 + Math.random() * 30);
            n.opinions[otherId] = baseOpinion;
        });

        // Seed 1-2 Natural Historical Rivals (Low opinion: 20-35)
        let potentialRivals = keys.filter(k => k !== id);
        let rivalCount = Math.min(2, potentialRivals.length);
        
        for (let i = 0; i < rivalCount; i++) {
            let rivalId = potentialRivals[Math.floor(Math.random() * potentialRivals.length)];
            n.opinions[rivalId] = Math.floor(20 + Math.random() * 15);
        }
    });
}

// Get set of neighboring nation IDs for a nation
function getNeighborNations(nationId) {
    let n = nations[nationId];
    if (!n) return new Set();
    let neighbors = new Set();
    n.tiles.forEach(t => {
        getNeighbors(t.x, t.y).forEach(nb => {
            let oId = territory[nb.y][nb.x];
            if (oId && oId !== nationId && nations[oId]) {
                neighbors.add(oId);
            }
        });
    });
    return neighbors;
}

function getBaseTerrainValue(x, y) {
    let type = terrainType[y][x];
    if (type === 2) return 2.0;
    if (type === 3) return 0.5;
    return 1.0;
}

// Group enemy-facing border tiles into continuous Frontlines
function buildFrontlines(nationId) {
    let n = nations[nationId];
    if (!n) return [];

    let enemyBorders = [];
    let visited = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(false));

    n.tiles.forEach(t => {
        getNeighbors(t.x, t.y).forEach(nb => {
            let enemyId = territory[nb.y][nb.x];
            if (enemyId && n.wars[enemyId] !== undefined) {
                if (!visited[nb.y][nb.x]) {
                    visited[nb.y][nb.x] = true;
                    enemyBorders.push({x: nb.x, y: nb.y, enemyId: enemyId});
                }
            }
        });
    });

    if (enemyBorders.length === 0) return [];

    // Group adjacent border tiles into contiguous segments
    let segments = [];
    let processed = new Set();

    enemyBorders.forEach(bTile => {
        let key = `${bTile.x},${bTile.y}`;
        if (processed.has(key)) return;

        let segment = [];
        let queue = [bTile];
        processed.add(key);

        while (queue.length > 0) {
            let curr = queue.shift();
            segment.push(curr);

            getNeighbors(curr.x, curr.y).forEach(nb => {
                let nbKey = `${nb.x},${nb.y}`;
                let match = enemyBorders.find(eb => eb.x === nb.x && eb.y === nb.y);
                if (match && !processed.has(nbKey)) {
                    processed.add(nbKey);
                    queue.push(match);
                }
            });
        }

        segments.push({
            tiles: segment,
            enemyId: segment[0].enemyId,
            size: segment.length
        });
    });

    // Sort frontlines by size (Primary Attack Front first)
    segments.sort((a, b) => b.size - a.size);
    return segments;
}

// Select a 3x3 or 5x5 Target Cluster Objective
function selectClusterObjective(nation, frontlines) {
    if (!frontlines || frontlines.length === 0) return;

    let primaryFront = frontlines[0];
    let centerTile = primaryFront.tiles[Math.floor(primaryFront.tiles.length / 2)];

    let clusterRadius = Math.random() < 0.5 ? 1 : 2; // 3x3 or 5x5 region
    let targetCluster = [];

    for (let dy = -clusterRadius; dy <= clusterRadius; dy++) {
        for (let dx = -clusterRadius; dx <= clusterRadius; dx++) {
            let cx = centerTile.x + dx;
            let cy = centerTile.y + dy;

            if (cx >= 0 && cx < WIDTH && cy >= 0 && cy < HEIGHT) {
                let owner = territory[cy][cx];
                if (owner !== null && owner !== nation.id && nation.wars[owner] !== undefined) {
                    targetCluster.push({x: cx, y: cy});
                }
            }
        }
    }

    nation.objectiveQueue = targetCluster;
}

// Map Presets Generator
function loadSelectedPreset() {
    let presetName = document.getElementById('mapPresetSelect').value;
    generatePresetMap(presetName);
}

function generatePresetMap(presetName) {
    grid = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(0));
    terrainType = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(1));
    popGrid = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(0));
    territory = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(null));
    cityGrid = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(null));
    tileMultiplier = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(1.0));
    cities = [];
    nations = {};
    alliances = {};
    ships = [];
    nextNationId = 1;
    nextAllianceId = 1;
    nextCityId = 1;
    year = 1000;
    
    document.getElementById('news-ticker').innerHTML = '';
    logNews(`Loaded Preloaded Map: <b>${presetName.toUpperCase()}</b>`);

    let seed = Math.floor(Math.random() * 1000000);
    let noise = createPerlin(seed);

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            let nx = x / WIDTH;
            let ny = y / HEIGHT;
            let isLand = false;

            let nVal = fbm(noise, x * 0.02, y * 0.02, 3) * 0.22;

            if (presetName === 'earth') {
                if (Math.hypot((nx - 0.22) * 1.5, ny - 0.28) < 0.14 + nVal) isLand = true;
                if (Math.hypot((nx - 0.32) * 1.8, ny - 0.65) < 0.13 + nVal) isLand = true;
                if (Math.hypot((nx - 0.50) * 1.5, ny - 0.25) < 0.09 + nVal) isLand = true;
                if (Math.hypot((nx - 0.52) * 1.4, ny - 0.55) < 0.15 + nVal) isLand = true;
                if (Math.hypot((nx - 0.72) * 1.1, ny - 0.32) < 0.22 + nVal) isLand = true;
                if (Math.hypot((nx - 0.82) * 1.5, ny - 0.75) < 0.08 + nVal) isLand = true;
            } else if (presetName === 'two_continents') {
                if (Math.hypot((nx - 0.25) * 1.2, ny - 0.5) < 0.25 + nVal) isLand = true;
                if (Math.hypot((nx - 0.75) * 1.2, ny - 0.5) < 0.25 + nVal) isLand = true;
            } else if (presetName === 'ring') {
                let dist = Math.hypot(nx - 0.5, (ny - 0.5) * 1.5);
                if (dist > 0.18 + nVal && dist < 0.40 + nVal) isLand = true;
            } else if (presetName === 'mediterranean') {
                let inBox = nx > 0.1 && nx < 0.9 && ny > 0.1 && ny < 0.9;
                let isSea = Math.hypot((nx - 0.5) * 1.4, ny - 0.5) < 0.20 + nVal;
                if (inBox && !isSea) isLand = true;
            } else if (presetName === 'archipelago') {
                let aVal = fbm(noise, x * 0.04, y * 0.04, 4);
                if (aVal > 0.12) isLand = true;
            } else { // 'random'
                let borderMarginX = Math.min(x, WIDTH - x) / (WIDTH * 0.10);
                let borderMarginY = Math.min(y, HEIGHT - y) / (HEIGHT * 0.10);
                let edgeMask = Math.min(1.0, Math.min(borderMarginX, borderMarginY));
                let qx = fbm(noise, x * 0.012, y * 0.012, 4);
                let qy = fbm(noise, x * 0.012 + 5.2, y * 0.012 + 1.3, 4);
                let landVal = fbm(noise, x * 0.010 + 4.0 * qx, y * 0.010 + 4.0 * qy, 5);
                if ((landVal + 0.05) * edgeMask > 0.08) isLand = true;
            }

            grid[y][x] = isLand ? 1 : 0;
        }
    }

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 1) {
                let elev = fbm(noise, x * 0.025 + 10.0, y * 0.025 + 10.0, 3);
                if (elev > 0.28) {
                    terrainType[y][x] = 3; // Mountain
                    popGrid[y][x] = Math.floor(5 + Math.random() * 10);
                } else if (elev > 0.05) {
                    terrainType[y][x] = 2; // Fertile Plains
                    popGrid[y][x] = Math.floor(40 + Math.random() * 30);
                } else {
                    terrainType[y][x] = 1; // Standard Plains
                    popGrid[y][x] = Math.floor(20 + Math.random() * 20);
                }
            }
        }
    }

    for (let i = 0; i < 18; i++) {
        spawnRandomNation();
    }

    recalculateCityMultipliers();
    resetCamera();
    render();
    updateLeaderboard();
}

// City Multipliers & Management
function buildCity(nationId, x, y) {
    let n = nations[nationId];
    if (!n) return;

    let cityName = CITY_PREFIXES[Math.floor(Math.random() * CITY_PREFIXES.length)] + " " + CITY_SUFFIXES[Math.floor(Math.random() * CITY_SUFFIXES.length)];
    let city = {
        id: nextCityId++,
        x: x,
        y: y,
        nationId: nationId,
        name: cityName,
        level: 1
    };
    
    cities.push(city);
    cityGrid[y][x] = city;
    logNews(`🏛️ <b>${n.name}</b> founded the city of <b>${cityName}</b>!`);
}

function recalculateCityMultipliers() {
    tileMultiplier = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(1.0));

    cities.forEach(c => {
        let radius = 7;
        let incMult = 1.0 + (c.level * 0.08);

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                let tx = c.x + dx;
                let ty = c.y + dy;
                if (tx >= 0 && tx < WIDTH && ty >= 0 && ty < HEIGHT) {
                    if (Math.hypot(dx, dy) <= radius) {
                        if (incMult > tileMultiplier[ty][tx]) tileMultiplier[ty][tx] = incMult;
                    }
                }
            }
        }
    });

    let minVal = Infinity, maxVal = -Infinity;
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (grid[y][x] === 1) {
                let val = getBaseTerrainValue(x, y) * tileMultiplier[y][x];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
        }
    }
    currentMinIncome = minVal === Infinity ? 0.5 : minVal;
    currentMaxIncome = maxVal === -Infinity ? 2.0 : maxVal;
}

// Nation Lifecycle
function spawnRandomNation(spawnX = null, spawnY = null) {
    let x = spawnX, y = spawnY;
    
    if (x === null || y === null) {
        let attempts = 0;
        while (attempts < 1200) {
            let rx = Math.floor(Math.random() * WIDTH);
            let ry = Math.floor(Math.random() * HEIGHT);
            if (grid[ry][rx] === 1 && territory[ry][rx] === null) {
                x = rx;
                y = ry;
                break;
            }
            attempts++;
        }
    }

    if (x === null || grid[y][x] === 0 || territory[y][x] !== null) return;

    let id = nextNationId++;
    let name = NATION_NAMES[Math.floor(Math.random() * NATION_NAMES.length)];
    if (Object.values(nations).some(n => n.name === name)) name += " II";

    let color = COLORS[Math.floor(Math.random() * COLORS.length)];
    let archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];

    nations[id] = {
        id: id,
        name: name,
        color: color,
        archetype: archetype,
        tiles: [{x, y}],
        gold: 400,
        grossIncome: 0,
        maintenance: 0,
        netIncome: 0,
        population: 0,
        army: { attack: 25, defend: 25, balanced: 20 },
        wars: {},
        peaceTreaties: {},
        allianceId: null,
        ports: 0,
        objectiveQueue: [],
        threatMarkers: {}
    };

    territory[y][x] = id;
    logNews(`${archetype.icon} The nation of <b>${name}</b> was founded!`);
}

function clearNations() {
    territory = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(null));
    cityGrid = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(null));
    cities = [];
    nations = {};
    alliances = {};
    ships = [];
    logNews("All nations and cities were cleared.");
    render();
    updateLeaderboard();
}

function removeNation(nationId) {
    let n = nations[nationId];
    if (!n) return;

    if (n.allianceId && alliances[n.allianceId]) {
        let alliance = alliances[n.allianceId];
        alliance.members = alliance.members.filter(mId => mId !== nationId);
        if (alliance.members.length < 2) {
            logNews(`🛡️ The <b>${alliance.name}</b> collapsed.`);
            alliance.members.forEach(mId => { if (nations[mId]) nations[mId].allianceId = null; });
            delete alliances[alliance.id];
        }
    }

    Object.values(nations).forEach(other => {
        delete other.wars[nationId];
        delete other.peaceTreaties[nationId];
    });

    delete nations[nationId];
}