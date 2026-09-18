// --- GLOBAL GAME STATE & CANVAS SETUP ---
const CANVAS = document.getElementById('mapCanvas');
const CTR = CANVAS.getContext('2d');

let grid = [];          // 0 = Deep Water, 1 = Land
let terrainType = [];   // 1 = Plains, 2 = Fertile/Hills, 3 = Mountain
let popGrid = [];       
let territory = [];     // Nation ID or null
let cityGrid = [];      
let cities = [];        
let nations = {};
let alliances = {};
let ships = [];
let nextNationId = 1;
let nextAllianceId = 1;
let nextCityId = 1;
let year = 1000;
let simSpeed = 1;
let tickInterval = null;

let lastLeaderboardUpdate = 0;

let currentMinIncome = 0.5;
let currentMaxIncome = 2.0;

let mapMode = 'nations';
let lbSortCategory = 'tiles';

let tileMultiplier = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(1.0));

// Pan & Zoom State
let zoom = 1.0;
let panX = 0;
let panY = 0;
let isDragging = false;
let hasDragged = false;
let dragStart = { x: 0, y: 0 };