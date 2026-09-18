// --- HIGH RESOLUTION GRID CONFIGURATION ---
const WIDTH = 480;
const HEIGHT = 270;

const ARCHETYPES = [
    { type: 'Warlord', icon: '⚔️', aggressiveness: 0.12, recruitPref: 'attack' },
    { type: 'Diplomat', icon: '🕊️', aggressiveness: 0.02, recruitPref: 'defend' },
    { type: 'Imperialist', icon: '🏰', aggressiveness: 0.07, recruitPref: 'balanced' },
    { type: 'Merchant', icon: '💰', aggressiveness: 0.03, recruitPref: 'balanced' }
];

const NATION_NAMES = [
    "Valoria", "Ironreach", "Sunspire", "Oakhaven", "Verdantia", 
    "Frostpeak", "Drakenhold", "Sylvaria", "Korvosa", "Cinderland", 
    "Eldoria", "Aethelgard", "Stormwatch", "Shadowfen", "Ravenloft",
    "Thalassia", "Atlantis", "Aethelsea", "Corsair Coast", "Isleholm",
    "Gondor", "Rohan", "Erebor", "Lothlorien", "Belerand", "Numenor"
];

const ALLIANCE_PREFIXES = ["League of", "Alliance of", "Pact of", "Covenant of", "Entente of", "Union of"];
const CITY_PREFIXES = ["New", "Fort", "Port", "Mount", "Grand", "Saint", "High", "Old"];
const CITY_SUFFIXES = ["burg", "ton", "ville", "hold", "ford", "haven", "shire", "crest"];

const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", 
    "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#84cc16", "#38bdf8"
];

// Perlin Noise Generator
function createPerlin(seed) {
    let p = new Uint8Array(512);
    let grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    let perm = new Uint8Array(256);
    for(let i=0; i<256; i++) perm[i] = i;
    
    let s = seed;
    for(let i=255; i>0; i--) {
        s = (s * 16807 + 11) % 2147483647;
        let j = Math.floor((s / 2147483647) * (i + 1));
        let t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for(let i=0; i<512; i++) p[i] = perm[i & 255];

    function dot(g, x, y) { return g[0]*x + g[1]*y; }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    return function(x, y) {
        let X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        let u = fade(x), v = fade(y);
        let g00 = grad2[p[X + p[Y]] % 8];
        let g10 = grad2[p[X + 1 + p[Y]] % 8];
        let g01 = grad2[p[X + p[Y + 1]] % 8];
        let g11 = grad2[p[X + 1 + p[Y + 1]] % 8];
        let n00 = dot(g00, x, y), n10 = dot(g10, x - 1, y);
        let n01 = dot(g01, x, y - 1), n11 = dot(g11, x - 1, y - 1);
        let nx0 = n00 + u * (n10 - n00), nx1 = n01 + u * (n11 - n01);
        return nx0 + v * (nx1 - nx0);
    };
}

function fbm(noise, x, y, octaves) {
    let val = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {
        val += noise(x * freq, y * freq) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return val;
}