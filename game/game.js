// FINAL BOSS: Boss Rush. A 2.5D No-Sting dodgeball module inspired by the Super Dodge Ball family.
// Original art and code. Three.js orthographic camera at 32 degrees, procedural toon athletes.
// API: window.FBGame = { mount(el, opts), setLook(look), setMode('fb'|'vc'), setSquad(names, control), start(), pause(), resume(), state() }
// Test hook: window.__bossrush = { state(), start() }
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.min.js';

const BASE = new URL('.', import.meta.url).href;
const EMBED = {};        // classic bundle fills this with data URIs so file:// works (no tainted WebGL textures)
const EMBED_CSS = null;  // classic bundle inlines game.css here
function assetURL(base, name) { return EMBED[name] || (base + 'assets/' + name); }
const DEG = Math.PI / 180;
const PITCH = 27 * DEG;            // spec said 32; lowered to match Gordon's approved mockups
const SINP = Math.sin(PITCH), COSP = Math.cos(PITCH);
const DT = 1 / 60;
const TRAIL_N = 14;               // ball ribbon trail length in ticks
// court half extents: 18 m long; COURT_W is the one tunable width (Gordon 2026-10-26: "feel a little bit wider"; was 9 m)
const COURT_W = 10.4;
const HX = 9, HZ = COURT_W / 2;
const OUTX = 10.25;                // back outfield lane x
const SIDEZ = HZ + 0.85;           // side outfield lane z
const GRAV = 22;
const CHAR = 1.14;               // chunky Kunio-style scale, tuned so 16 athletes read at once
const TUNE = {
  walk: 3.2, run: 6.5, stepF: 7, powMin: 4, powMax: 7, feverMin: 3, feverMax: 8,
  airF: 40, airPowA: 14, airPowB: 24,
  wind: 6, rel: 2, rec: 10, pWind: 9, pRel: 3, pRec: 14,
  vNormal: 14, vDash: 17, vJump: 15, vPass: 12,
  catchClean: 10, catchBobble: 16, catchLate: 3, catchCool: 24,
  hsNormal: 4, hsPower: 8, hsKO: 12,
  clock: 90, fever: 30, shot: 8,
  turnF: 10, duckAfter: 16, duckMax: 30,
};
const AI_LEVEL = { easy: { c: 0.15, p: 0.10, r: 20 }, normal: { c: 0.40, p: 0.35, r: 12 }, hard: { c: 0.65, p: 0.70, r: 8 } };

// ---------------------------------------------------------------- roster
const ROSTER = [
  { key: 'FIORE', num: '1', skin: '#e3ad88', hair: '#3b2418', style: 'pony', build: 0.96 },
  { key: 'YOU', num: '?', label: 'YOU', skin: '#c68a62', hair: '#1b1210', style: 'cap', build: 1.0, open: true },
  { key: 'HAWKINS', num: '3', skin: '#c58c66', hair: '#2a1b12', style: 'short', build: 1.0 },
  { key: 'BELLAMY', num: '4', skin: '#6a4029', hair: '#1b1210', style: 'crop', build: 1.12, shots: ['comet', 'moon'] },
  { key: 'BELLAMY III', num: '5', skin: '#8a5a3c', hair: '#17100c', style: 'short', build: 1.04 },
  { key: 'REED', num: '6', skin: '#e9b997', hair: '#5a3a22', style: 'short', build: 0.98 },
  { key: 'KRAMER', num: '31', skin: '#eec3a0', hair: '#6b4a2a', style: 'short', build: 1.03 },
  { key: 'KETCHUM', num: '83', skin: '#d6a07a', hair: '#24170f', style: 'short', build: 1.02 },
];
const SHOTS_BY = { FIORE: ['hook', 'hop'], YOU: ['comet', 'hop'], HAWKINS: ['comet', 'hop'], 'BELLAMY III': ['hook', 'hop'], REED: ['comet', 'moon'], KRAMER: ['comet', 'hop'], KETCHUM: ['hook', 'moon'] };
const BOSS_TEAM = {
  name: 'THE GLITCHES', short: 'GLITCHES',
  colors: ['#17131f', '#a6f23a', '#a6f23a', '#ff3fa1'],
  players: [
    { key: 'NERF', num: '0', skin: '#b98a6a', build: 1.0, shots: ['hook', 'hop'] },
    { key: 'LAG', num: '404', skin: '#e2b08c', build: 1.05, shots: ['comet', 'moon'] },
    { key: 'PATCH', num: '99', skin: '#8f5f40', build: 0.98, shots: ['hook', 'moon'] },
    { key: 'PING', num: '8', skin: '#d9a481', build: 0.97, shots: ['comet', 'hop'] },
    { key: 'BUG', num: '13', skin: '#c99272', build: 0.99, shots: ['hook', 'hop'] },
    { key: 'CRASH', num: '7', skin: '#7d5236', build: 1.06, shots: ['comet', 'moon'] },
    { key: 'SPAM', num: '21', skin: '#e8b996', build: 0.97, shots: ['hook', 'moon'] },
  ],
  boss: { key: 'GLITCH KING', num: '00', skin: '#6f4a8a', build: 1.0, shots: ['hook', 'zig'] },
};
// ---------------------------------------------------------------- P0d: player rating profiles (0..1) and team styles
// FINAL BOSS players are real people: strength-forward profiles only, from receipts in the Kramer camp docs
// (~/work/dodgeball-kramer-20261004/season/index.html); nobody on FINAL BOSS gets an invented weakness, and ratings are never shown
const FB_BASE = { aware: 0.7, catch: 0.68, acc: 0.68, power: 0.64, foot: 0.68, comp: 0.68 };
const FB_STRENGTH = {
  KETCHUM: { power: 0.94, acc: 0.74, arch: 'power arm' },          // "the most feared arm in dodgeball, even in foam"; Team USA gold 2015
  FIORE: { catch: 0.93, comp: 0.92, aware: 0.8, arch: 'clutch catcher' }, // US Women's National Team; "among the tournament's best clutch catchers"
  REED: { power: 0.85, aware: 0.78, comp: 0.75, arch: 'strong arm' },  // "Strong arms... combined with the smarts and experience"
  KRAMER: { acc: 0.93, arch: 'command' },                             // former pro pitcher: accuracy and command
};
// opponents are fictional, so their profiles can vary freely; the GLITCH KING stays the strongest player on the floor
const OPP_STYLES = {
  glitches: { scout: 'Scrappy and chaotic: big arms, wandering eyes, a few slippery dodgers.', base: { aware: 0.6, catch: 0.6, acc: 0.56, power: 0.74, foot: 0.62, comp: 0.54 }, spread: 0.13, spreadK: { foot: 0.3, aware: 0.2 }, sync: 0.16 },
  catchfirst: { scout: 'Catch-first: patient hands, soft throws.', base: { aware: 0.72, catch: 0.76, acc: 0.6, power: 0.5, foot: 0.62, comp: 0.68 }, spread: 0.07, sync: 0.1 },
  powerarm: { scout: 'Power arms: heat from the back line, and they love a double.', base: { aware: 0.56, catch: 0.5, acc: 0.62, power: 0.86, foot: 0.56, comp: 0.6 }, spread: 0.09, sync: 0.3 },
};
// Opponent schema (teams.json). Teams differ by style, strategy weights, ratings and signature abilities, NEVER by rules (every match uses the same real rules):
//   { name, short, colors[4], emblem, style, intro, tactic: { patience, push, fake, flank, calls, lastBall },
//     players: [{ key, num, skin, build, shots, rt: { aware, catch, acc, power, foot, comp } }] (7), boss: {...},
//     abilities: [{ id, kind, amount, tell: { text, sfx } }] }
// ability kinds act only through existing systems, each with a visible and audible tell so it is readable and counterable:
//   throwSpeed (faster throws), throwCurve (chance a throw curves), catchWindow (better catch timing and choice), dodgeBias (better footwork),
//   fakeBait (stronger pump fakes), moveSpeed (quicker feet)
const ABILITY_KINDS = new Set(['throwSpeed', 'throwCurve', 'catchWindow', 'dodgeBias', 'fakeBait', 'moveSpeed']);
function oppFrom(o) {
  // a new opponent can come straight from teams.json; THE GLITCHES stay the default and the final boss
  if (o && o.built) return o;   // Phase 2: a weekend team already in engine shape
  if (!o || !Array.isArray(o.players) || !o.players.length) return BOSS_TEAM;
  return { name: String(o.name || 'OPPONENT').toUpperCase(), short: String(o.short || o.name || 'OPPONENT').toUpperCase(), colors: o.colors || BOSS_TEAM.colors, emblem: o.emblem || 'pixel', style: o.style || null, intro: o.intro || null, tactic: o.tactic || null,
    abilities: (Array.isArray(o.abilities) ? o.abilities : []).filter(x => x && ABILITY_KINDS.has(x.kind)).map(x => ({ id: String(x.id || x.kind), kind: x.kind, amount: Math.max(0, Math.min(0.5, +x.amount || 0)), tell: x.tell || { text: String(x.id || x.kind).toUpperCase() } })),
    players: o.players.slice(0, 7).map((p, i) => Object.assign({ num: String(i + 1), skin: '#c99272', build: 1, shots: ['hook', 'hop'] }, p, { key: String(p.key || p.name || 'P' + i).toUpperCase() })),
    boss: Object.assign({ num: '00', skin: '#6f4a8a', build: 1, shots: ['hook', 'zig'] }, o.boss || BOSS_TEAM.boss, { key: String((o.boss && (o.boss.key || o.boss.name)) || BOSS_TEAM.boss.key).toUpperCase() }) };
}
// P0i: team tactics (Gordon's strategy points 13 to 17): how often a team waits for control, pushes together, fakes, flanks, calls, and keeps its last ball
const TACTICS = {
  finalboss: { patience: 0.35, push: 0.7, fake: 0.5, flank: 0.6, calls: 0.5, lastBall: 0.85 },
  glitches: { patience: 0.12, push: 0.45, fake: 0.35, flank: 0.3, calls: 0.25, lastBall: 0.5 },    // aggressive and scrappy
  catchfirst: { patience: 0.8, push: 0.55, fake: 0.65, flank: 0.4, calls: 0.4, lastBall: 0.95 },  // patient
  powerarm: { patience: 0.3, push: 0.85, fake: 0.2, flank: 0.7, calls: 0.3, lastBall: 0.7 },      // pushers and flankers
};
const BOSS_RT = { aware: 0.9, catch: 0.88, acc: 0.86, power: 0.96, foot: 0.84, comp: 0.92 };
const DIFF_OFF = { easy: -0.14, normal: 0, hard: 0.1 };
function hash01(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; }
function clampR(v) { return Math.max(0.05, Math.min(0.97, v)); }

const DEFAULT_LOOK = { id: 'fb01', name: 'Chosen Family', mode: 'fb', colors: ['#14523f', '#2ab3b8', '#f3e6c8', '#c9a24a'] };
const ATK = 3;                     // attack lines, 3 m from center
// control: 15 s, per the WeHo/Sin City rulebook: "Once a team gains ball control, that team has 15 seconds to relinquish majority possession"
// (https://www.wehododgeball.com/rules); Gordon 2026-10-26: "oh i am wrong clearly on the 15 second rule"
// saveOnTeammateCatch: a teammate catching a body-hit pop-up before the floor saves the hit player (league convention; NEEDS GORDON'S CONFIRMATION, the rulebook text states it only for dropped blocks)
const RULES = { saveOnTeammateCatch: true, match: 180, ot: 60, mercy: 8, control: 15, oob: 10, back: 5, timeout: 30, balls: 5, rushF: 300 };
// the open slot: a recruit puts their own name, number and skin tone on the back (saved on their device only)
const YOU_SKINS = ['#f3d2b8', '#e3ad88', '#c68a62', '#8a5a3c', '#5a3826'];
const TAKEN_NUMS = new Set(['1', '3', '4', '5', '6', '31', '83']);
function youDef() { return ROSTER.find(r => r.key === 'YOU'); }
function cleanYouName(v) { return String(v || '').toUpperCase().replace(/[^A-Z .'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 11); }
function loadYou() {
  const d = youDef(); if (!d) return;
  let v = null; try { v = JSON.parse(localStorage.getItem('fbg-you') || 'null'); } catch (e) { }
  if (!v) return;
  const nm = cleanYouName(v.name); if (nm) d.label = nm;
  const n = String(v.num || '').replace(/\D/g, '').slice(0, 2); if (n && !TAKEN_NUMS.has(String(+n))) d.num = String(+n);
  if (YOU_SKINS.includes(v.skin)) d.skin = v.skin;
}
function saveYou() { const d = youDef(); if (!d) return; try { localStorage.setItem('fbg-you', JSON.stringify({ name: d.label === 'YOU' ? '' : d.label, num: d.num === '?' ? '' : d.num, skin: d.skin })); } catch (e) { } }
loadYou();
function rosterKey(v) { if (!v) return null; const pk = String(v).toUpperCase().trim().replace('#', ''); const hit = ROSTER.find(r => r.key === pk) || ROSTER.find(r => r.num === pk) || ROSTER.find(r => r.key.startsWith(pk)); return hit ? hit.key : null; }
function rpsIcon(i) {
  const s = ['<circle cx="24" cy="26" r="14"/><path d="M14 22h20M15 29h18" stroke="#120818" stroke-width="2.5" fill="none"/>',
    '<rect x="11" y="8" width="26" height="32" rx="2"/><path d="M16 16h16M16 22h16M16 28h12" stroke="#120818" stroke-width="2.5" fill="none"/>',
    '<circle cx="15" cy="34" r="6"/><circle cx="33" cy="34" r="6"/><path d="M18 29L34 8M30 29L14 8" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'][i];
  return `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="currentColor">${s}</svg>`;
}
function ruleIcon(k) {
  const p = {
    rush: '<path d="M6 24h28M26 14l10 10-10 10" stroke-width="5"/><circle cx="42" cy="24" r="4" fill="currentColor"/>',
    line: '<path d="M24 4v40" stroke-dasharray="0" stroke-width="4"/><circle cx="12" cy="24" r="6" fill="currentColor"/><path d="M30 24h12M36 18l6 6-6 6" stroke-width="4"/>',
    catch: '<path d="M10 30c0-10 6-16 14-16s14 6 14 16" stroke-width="5"/><circle cx="24" cy="12" r="6" fill="currentColor"/><path d="M8 40h32" stroke-width="4"/>',
    head: '<circle cx="24" cy="18" r="10" stroke-width="4"/><path d="M8 42l32-32" stroke-width="5"/>',
    clock: '<circle cx="24" cy="26" r="16" stroke-width="4"/><path d="M24 26V16M24 26l7 5" stroke-width="4"/><path d="M18 4h12" stroke-width="4"/>',
    back: '<path d="M8 8v32" stroke-width="5"/><path d="M40 24H18M26 16l-8 8 8 8" stroke-width="4"/>',
  }[k];
  return `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}
const SIGNS = [
  { t: ['COACH NINA', '#1'], who: 'FIORE' }, { t: ['NEW CHALLENGER', 'THAT\'S YOU!'], who: 'YOU' }, { t: ['HAWKINS 3', 'HYPE'], who: 'HAWKINS' },
  { t: ['BELLAMY 4', 'FINAL BOSS'], who: 'BELLAMY' }, { t: ['BELLAMY III', '#5'], who: 'BELLAMY III' }, { t: ['REED 6', 'ALL DAY'], who: 'REED' },
  { t: ['KRAMER 31', 'ARM CANNON'], who: 'KRAMER' }, { t: ['KETCHUM 83', 'GOLDEN BOY'], who: 'KETCHUM' }, { t: ['ALL HEART', 'no sting'], who: '*go' }, { t: ['PHASE TWO!'], who: '*p2' },
  { t: ['THANK YOU', 'STAFF!'], who: '*a0', style: 'bb' }, { t: ['FINAL', 'BOSS'], who: '*a1', style: 'gold' }, { t: ['COMEBACK'], who: '*a2', style: 'bb' }, { t: [''], who: '*opp0', style: 'opp' }, { t: [''], who: '*opp1', style: 'opp' },
];
const CREST_FB = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z" fill="var(--fbg-tb)" stroke="#ffc83d" stroke-width="3"/><path d="M13 30V17l6 6 5-9 5 9 6-6v13z" fill="#ffc83d" stroke="#3a1a00" stroke-width="1.5"/></svg>';
const CREST_GL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z" fill="#17131f" stroke="#a6f23a" stroke-width="3"/><g fill="#a6f23a"><rect x="16" y="13" width="16" height="4"/><rect x="13" y="17" width="22" height="8"/><rect x="16" y="25" width="16" height="4"/><rect x="18" y="29" width="3" height="4"/><rect x="27" y="29" width="3" height="4"/></g><g fill="#17131f"><rect x="16" y="19" width="5" height="4"/><rect x="27" y="19" width="5" height="4"/></g></svg>';
const SHOT_NAME = { comet: 'COMET!', hook: 'HOOK!', hop: 'HOP-SCOTCH!', moon: 'MOONBALL!', zig: 'GLITCH CURVE!' };

// @@P2-DATA-BEGIN generated by gen_weekend.py from teams.json 2026-10-26b and cards.json; do not edit by hand
const WK_TEAMS = [{"id":"shellebrities","name":"THE SHELLEBRITIES","short":"SHELLEBRITIES","lvl":"easy","rank":1,"pool":"A","who":"Mermaid royalty of the deep end who would rather sing than sting.","colors":["#00A6A6","#D6FBF4","#FF7A59","#04363A"],"sig":"#00A6A6","dark":"#04363A","shape":"fin","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#04363A\" stroke=\"#00A6A6\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M24 35 L22 22 C16 22 12 18 11 12 C16 14 20 14 24 17 C28 14 32 14 37 12 C36 18 32 22 26 22 Z\" fill=\"#00A6A6\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M24 35 L22 22 C16 22 12 18 11 12 C16 14 20 14 24 17 C28 14 32 14 37 12 C36 18 32 22 26 22 Z\" fill=\"#00A6A6\"/></g>","boss":{"key":"SEAFOAM","stage":"LADY SEAFOAM","num":"8","skin":"#c99272","build":0.97,"shots":["moon","hop"],"look":{"g":"f","hs":"long","hc":"#bff5ec","skin":"#c99272","ht":0.97,"bw":0.92}},"players":[{"key":"SCALES","num":"2","skin":"#e3ad88","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"long","hc":"#bff5ec","skin":"#e3ad88","ht":0.95,"bw":0.9}},{"key":"CORAL","num":"11","skin":"#8a5a3c","build":1.0,"shots":["moon","hook"],"look":{"g":"f","hs":"afro","hc":"#ff8fa3","skin":"#8a5a3c","ht":0.96,"bw":0.92}},{"key":"PEARL","num":"7","skin":"#f1c7a5","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"bun","hc":"#f4f0ff","skin":"#f1c7a5","ht":0.94,"bw":0.88}},{"key":"KELP","num":"4","skin":"#6a4029","build":1.0,"shots":["moon","hook"],"look":{"g":"m","hs":"locs","hc":"#2a1a10","skin":"#6a4029","ht":1.04,"bw":1.06}},{"key":"TIDE","num":"14","skin":"#d6a07a","build":1.0,"shots":["moon","hop"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#d6a07a","ht":1.0,"bw":1.0}},{"key":"SHIMMER","num":"22","skin":"#c68a62","build":1.0,"shots":["moon","hook"],"look":{"g":"m","hs":"mohawk","hc":"#a88bff","skin":"#c68a62","ht":1.02,"bw":1.0}},{"key":"GUPPY","num":"1","skin":"#eec3a0","build":1.0,"shots":["moon","hop"],"look":{"g":"m","hs":"short","hc":"#6b4a2a","skin":"#eec3a0","ht":0.98,"bw":0.96}}],"w":{"patience":0.9,"push":0.15,"fake":0.1,"flank":0.15,"calls":0.1,"lastBall":0.95,"multi":0.0,"catchFirst":0.8,"aimLow":0.4},"sync":0.05,"ab":[{"name":"RIPTIDE","hook":"shot","k":{"base":"moon","speed":0.8,"curve":0.6},"sfx":"tell_riptide","say":"RIPTIDE!","tell":"Teal water swirl around the ball on the windup and a rising whoosh.","counter":"Step in and catch it at chest height before it curves. It is slow, so a clean catch is easy.","effect":"A slow lob that curves late toward the target's back foot (moon arc plus a sideways curve, 0.8x speed)."},{"name":"SCHOOL OF FISH","hook":"school","k":{"n":2,"lag":9},"sfx":"tell_school","say":"SCHOOL OF FISH!","tell":"Short bubble trail under the players who drift.","counter":"Throw at the end of the wave: the last player in the drift moves late.","effect":"When one Shellebrity dodges, the nearest two drift the same way. The line keeps spacing, so one ball rarely threatens two."}],"rt":{"aware":0.52,"catch":0.62,"acc":0.5,"power":0.34,"foot":0.52,"comp":0.48},"brt":{"aware":0.66,"catch":0.74,"acc":0.6,"power":0.44,"foot":0.6,"comp":0.66},"weak":{"stat":"power","text":"Soft arms: every throw is catchable.","teaches":"STRATEGY 2 and 3: catch, then answer right away."},"scout":"Patient lobbers with soft arms: catch the Riptide before it curves and throw at the end of the wave.","signs":["SHELL YES","FIN-TASTIC","SPLASH ZONE"],"intro":["From the deep end of the pool, make some waves for... the Shellebrities!","Lady Seafoam has entered the arena, and she brought the whole tide!"],"taunt":"Sink or swim, sweetie!","style":"Glide in waves: the line drifts side to side together like a school of fish, hair flips on every windup."},{"id":"rolling-pins","name":"THE ROLLING PINS","short":"ROLLING PINS","lvl":"easy","rank":2,"pool":"A","who":"A bakery crew that is sweet on the court and patient as rising dough.","colors":["#8D6E63","#FFF4E0","#A8E6CF","#3E2723"],"sig":"#8D6E63","dark":"#3E2723","shape":"cupcake","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#3E2723\" stroke=\"#8D6E63\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M15 24 H33 L30 37 H18 Z\" fill=\"#8D6E63\"/><path d=\"M20 24 L21 37M24 24V37M28 24L27 37\" stroke=\"#3E2723\" stroke-width=\"1.4\"/><path d=\"M13 24 C13 17 18 14 24 14 C30 14 35 17 35 24 Z\" fill=\"#8D6E63\"/><circle cx=\"24\" cy=\"11\" r=\"2.6\" fill=\"#8D6E63\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M15 24 H33 L30 37 H18 Z\" fill=\"#8D6E63\"/><path d=\"M20 24 L21 37M24 24V37M28 24L27 37\" stroke=\"#3E2723\" stroke-width=\"1.4\"/><path d=\"M13 24 C13 17 18 14 24 14 C30 14 35 17 35 24 Z\" fill=\"#8D6E63\"/><circle cx=\"24\" cy=\"11\" r=\"2.6\" fill=\"#8D6E63\"/></g>","boss":{"key":"BUNDT","stage":"BARON VON BUNDT","num":"24","skin":"#c58c66","build":1.06,"shots":["moon","comet"],"look":{"g":"m","hs":"cap","hc":"#fff4e0","skin":"#c58c66","ht":1.0,"bw":1.12}},"players":[{"key":"CRUMB","num":"3","skin":"#f1c7a5","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"bun","hc":"#3b2418","skin":"#f1c7a5","ht":0.94,"bw":0.9}},{"key":"BRIOCHE","num":"8","skin":"#6a4029","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#6a4029","ht":1.03,"bw":1.12}},{"key":"MACARON","num":"11","skin":"#d9a481","build":1.0,"shots":["moon","hook"],"look":{"g":"f","hs":"curly","hc":"#5a3a22","skin":"#d9a481","ht":0.95,"bw":0.92}},{"key":"SCONE","num":"5","skin":"#eec3a0","build":1.0,"shots":["moon","hop"],"look":{"g":"m","hs":"short","hc":"#8a5a2a","skin":"#eec3a0","ht":1.0,"bw":1.06}},{"key":"ECLAIR","num":"14","skin":"#8a5a3c","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#8a5a3c","ht":0.97,"bw":0.94}},{"key":"STRUDEL","num":"19","skin":"#c99272","build":1.0,"shots":["moon","comet"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#c99272","ht":1.02,"bw":1.1}},{"key":"SPRINKLES","num":"1","skin":"#e3ad88","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"pony","hc":"#ff8fb1","skin":"#e3ad88","ht":0.95,"bw":0.9}}],"w":{"patience":0.85,"push":0.2,"fake":0.1,"flank":0.2,"calls":0.3,"lastBall":0.9,"multi":0.05,"catchFirst":0.6,"aimLow":0.85},"sync":0.06,"ab":[{"name":"ROLLING PIN","hook":"shot","k":{"base":"normal","aim":0.32,"speed":0.85,"flat":1},"sfx":"tell_rollpin","say":"ROLLING PIN!","tell":"A flour puff on release and a rolling rumble.","counter":"Hop it: it never rises above the knees.","effect":"A low, skimming throw along the floor at feet. Legal, and hard to catch."},{"name":"PROOFING","hook":"proof","k":{"sec":4,"max":1.3},"sfx":"tell_proof","say":"PROOFING!","tell":"The ball glows warm and puffs up as it proofs.","counter":"Pressure the holder early, or dodge late once the glow peaks.","effect":"A held ball rises like dough: throw power grows over 4 s, up to 1.3x. They still have to spend balls inside the 15 s control clock."}],"rt":{"aware":0.5,"catch":0.56,"acc":0.52,"power":0.52,"foot":0.36,"comp":0.54},"brt":{"aware":0.62,"catch":0.68,"acc":0.62,"power":0.66,"foot":0.46,"comp":0.66},"weak":{"stat":"foot","text":"Heavy on their feet: slow dodgers, especially after a throw.","teaches":"STRATEGY 3: catch, then answer right away while they are slow."},"scout":"Slow but patient bakers: hop the Rolling Pin, then answer fast before they can move.","signs":["BREAD WINNERS","WHISK IT ALL","RISE UP"],"intro":["Fresh out of the oven... the Rolling Pins!","Baron Von Bundt has been proofing all morning, and that ball is ready to rise!"],"taunt":"You just got served, with sprinkles!","style":"A bustling kitchen shuffle: apron twirls, flour puffs, and a little bow when they catch."},{"id":"cosmic-cowpokes","name":"THE COSMIC COWPOKES","short":"COSMIC COWPOKES","lvl":"easy","rank":3,"pool":"A","who":"Space cowfolk who ride in from three galaxies over and never land a jump the same way twice.","colors":["#E0601F","#1B1F4A","#FFE8C2","#7FB2FF"],"sig":"#E0601F","dark":"#1B1F4A","shape":"crescent","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#1B1F4A\" stroke=\"#E0601F\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M29 12.5 A11 11 0 1 0 29 33.5 A8.5 8.5 0 0 1 29 12.5 Z\" fill=\"#E0601F\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M29 12.5 A11 11 0 1 0 29 33.5 A8.5 8.5 0 0 1 29 12.5 Z\" fill=\"#E0601F\"/></g>","boss":{"key":"NEBULA","stage":"SHERIFF NEBULA","num":"77","skin":"#5e3b26","build":1.06,"shots":["moon","hook"],"look":{"g":"m","hs":"cap","hc":"#1b1f4a","skin":"#5e3b26","ht":1.05,"bw":1.1}},"players":[{"key":"LASSO","num":"3","skin":"#c58c66","build":1.0,"shots":["moon","hook"],"look":{"g":"m","hs":"cap","hc":"#2a1b12","skin":"#c58c66","ht":1.02,"bw":1.04}},{"key":"DUSTY","num":"12","skin":"#e9b997","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"pony","hc":"#7a4a24","skin":"#e9b997","ht":0.95,"bw":0.9}},{"key":"ORBIT","num":"5","skin":"#7d5236","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#7d5236","ht":0.97,"bw":0.92}},{"key":"YEEHAW","num":"10","skin":"#d9a481","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"spiky","hc":"#8a5a2a","skin":"#d9a481","ht":1.0,"bw":1.0}},{"key":"RODEO","num":"18","skin":"#9a6a48","build":1.0,"shots":["hook","moon"],"look":{"g":"m","hs":"fade","hc":"#1a1210","skin":"#9a6a48","ht":1.04,"bw":1.12}},{"key":"STARDUST","num":"6","skin":"#f3d2b8","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"long","hc":"#e8c070","skin":"#f3d2b8","ht":0.96,"bw":0.9}},{"key":"TUMBLEWEED","num":"21","skin":"#b98a6a","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#b98a6a","ht":1.0,"bw":1.0}}],"w":{"patience":0.4,"push":0.45,"fake":0.15,"flank":0.85,"calls":0.6,"lastBall":0.7,"multi":0.1,"catchFirst":0.4,"aimLow":0.5},"sync":0.08,"ab":[{"name":"LASSO REACH","hook":"reach","k":{"mul":1.3},"sfx":"tell_lasso","say":"LASSO REACH!","tell":"A glowing ring flickers around the catcher's hands and a rope swish.","counter":"Throw at feet and hips. The lasso cannot reach low balls.","effect":"Catch window 30% wider for balls at arm's length and above the waist."},{"name":"MOON HOP","hook":"moonhop","k":{"p":0.5,"land":21},"sfx":"tell_moonhop","say":"MOON HOP!","tell":"Boots puff a little stardust on takeoff.","counter":"Aim at the landing spot: they cannot move again for a beat.","effect":"A high, floaty jump dodge that clears almost any low throw, followed by a slow landing."}],"rt":{"aware":0.44,"catch":0.6,"acc":0.52,"power":0.5,"foot":0.72,"comp":0.5},"brt":{"aware":0.6,"catch":0.72,"acc":0.64,"power":0.6,"foot":0.8,"comp":0.62},"weak":{"stat":"aware","text":"Eyes on the wings: they lose track of the middle of the court.","teaches":"STRATEGY 1: dodge on the load. Attack from center while they watch the flanks."},"scout":"Wing flankers with a long lasso: throw low and from the middle, and hit the Moon Hop on the landing.","signs":["GIDDY UP","HOWDY, GALAXY","LASSO THE MOON"],"intro":["Saddle up, Sin City! Riding in from three galaxies over... the Cosmic Cowpokes!","Sheriff Nebula is in town, and that lasso catches everything!"],"taunt":"This court ain't big enough for the both of us!","style":"Bow-legged swagger, big floaty hop dodges, and a lasso twirl on every windup."},{"id":"plus-ones","name":"THE PLUS ONES","short":"PLUS ONES","lvl":"easy","rank":4,"pool":"B","who":"A whole wedding party, two grooms, two brides and every best person, who came for the cake and stayed for the dodgeball.","colors":["#DDE3E8","#37474F","#90A4AE","#F8BBD0"],"sig":"#90A4AE","dark":"#37474F","shape":"rings","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#37474F\" stroke=\"#90A4AE\" stroke-width=\"3\"/><g fill=\"none\" stroke=\"#90A4AE\" stroke-width=\"3.6\"><circle cx=\"19.5\" cy=\"24\" r=\"8\"/><circle cx=\"28.5\" cy=\"24\" r=\"8\"/></g></svg>","emblem":"<g fill=\"none\" stroke=\"#90A4AE\" stroke-width=\"3.6\"><circle cx=\"19.5\" cy=\"24\" r=\"8\"/><circle cx=\"28.5\" cy=\"24\" r=\"8\"/></g>","boss":{"key":"BESTPERSON","stage":"THE BEST PERSON","num":"2","skin":"#e9b997","build":1.0,"shots":["moon","comet"],"look":{"g":"m","hs":"fade","hc":"#5a3a22","skin":"#e9b997","ht":1.02,"bw":1.0}},"players":[{"key":"GROOM","num":"1","skin":"#c68a62","build":1.0,"shots":["moon","comet"],"look":{"g":"m","hs":"short","hc":"#2a1b12","skin":"#c68a62","ht":1.02,"bw":1.04}},{"key":"BRIDE","num":"3","skin":"#f1c7a5","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"long","hc":"#3b2418","skin":"#f1c7a5","ht":0.95,"bw":0.9}},{"key":"GROOM II","num":"4","skin":"#6a4029","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#6a4029","ht":1.04,"bw":1.06}},{"key":"BRIDE II","num":"5","skin":"#8a5a3c","build":1.0,"shots":["moon","hook"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#8a5a3c","ht":0.96,"bw":0.92}},{"key":"FLOWER","num":"8","skin":"#eec3a0","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"bun","hc":"#f8bbd0","skin":"#eec3a0","ht":0.94,"bw":0.88}},{"key":"RINGBEARER","num":"9","skin":"#d9a481","build":1.0,"shots":["moon","hop"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#d9a481","ht":0.98,"bw":0.98}},{"key":"OFFICIANT","num":"12","skin":"#9a6a48","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"fade","hc":"#1a1210","skin":"#9a6a48","ht":1.0,"bw":1.02}}],"w":{"patience":0.7,"push":0.3,"fake":0.2,"flank":0.45,"calls":0.95,"lastBall":0.8,"multi":0.1,"catchFirst":0.4,"aimLow":0.4},"sync":0.1,"ab":[{"name":"BOUQUET TOSS","hook":"shot","k":{"base":"moon","back":1},"sfx":"tell_bouquet","say":"BOUQUET TOSS!","tell":"Petals swirl and wedding bells chime.","counter":"Back-row players step up and catch it: it is slow.","effect":"A high lob over your front line that drops on the back row."},{"name":"PLUS ONE PASS","hook":"passthrow","k":{"wind":0.9},"sfx":"tell_plusone","say":"PLUS ONE PASS!","tell":"A glass clink as the pass leaves.","counter":"Watch the receiver, not the passer.","effect":"A quick pass to a teammate who throws on arrival."}],"rt":{"aware":0.56,"catch":0.54,"acc":0.52,"power":0.36,"foot":0.54,"comp":0.6},"brt":{"aware":0.7,"catch":0.66,"acc":0.64,"power":0.5,"foot":0.66,"comp":0.76},"weak":{"stat":"power","text":"Gentle tossers: every throw is soft and catchable.","teaches":"STRATEGY 2: catching is the superpower."},"scout":"A pass-happy wedding party with soft arms: watch the receiver and catch the Bouquet Toss.","signs":["I DO DODGE","SAVE THE DATE","JUST MARRIED"],"intro":["Dearly beloved, we are gathered here for... the Plus Ones!","The Best Person just caught the bouquet, and the whole party is on the court!"],"taunt":"You are not on the guest list!","style":"A processional: arm in arm, a slow-dance sway between plays, confetti on every catch."},{"id":"sidekicks","name":"THE SIDEKICKS","short":"SIDEKICKS","lvl":"normal","rank":5,"pool":"B","who":"Superhero camp graduates who would rather save a teammate than save themselves.","colors":["#1A2350","#FF6D00","#FFF3D6","#FF9E40"],"sig":"#FF6D00","dark":"#1A2350","shape":"burst","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#1A2350\" stroke=\"#FF6D00\" stroke-width=\"3\"/><path d=\"M24.0 9.0 L26.3 14.3 L31.0 10.9 L30.4 16.6 L36.1 16.0 L32.7 20.7 L38.0 23.0 L32.7 25.3 L36.1 30.0 L30.4 29.4 L31.0 35.1 L26.3 31.7 L24.0 37.0 L21.7 31.7 L17.0 35.1 L17.6 29.4 L11.9 30.0 L15.3 25.3 L10.0 23.0 L15.3 20.7 L11.9 16.0 L17.6 16.6 L17.0 10.9 L21.7 14.3 Z\" fill=\"#FF6D00\"/></svg>","emblem":"<path d=\"M24.0 9.0 L26.3 14.3 L31.0 10.9 L30.4 16.6 L36.1 16.0 L32.7 20.7 L38.0 23.0 L32.7 25.3 L36.1 30.0 L30.4 29.4 L31.0 35.1 L26.3 31.7 L24.0 37.0 L21.7 31.7 L17.0 35.1 L17.6 29.4 L11.9 30.0 L15.3 25.3 L10.0 23.0 L15.3 20.7 L11.9 16.0 L17.6 16.6 L17.0 10.9 L21.7 14.3 Z\" fill=\"#FF6D00\"/>","boss":{"key":"ALLY","stage":"THE AMAZING ALLY","num":"5","skin":"#7d5236","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#7d5236","ht":1.0,"bw":0.96}},"players":[{"key":"CAPE","num":"1","skin":"#c68a62","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"short","hc":"#2a1b12","skin":"#c68a62","ht":1.02,"bw":1.04}},{"key":"GADGET","num":"10","skin":"#f3d2b8","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"pony","hc":"#e8c070","skin":"#f3d2b8","ht":0.95,"bw":0.9}},{"key":"ROOKIE","num":"3","skin":"#8a5a3c","build":1.0,"shots":["comet","hop"],"look":{"g":"m","hs":"mohawk","hc":"#ff6d00","skin":"#8a5a3c","ht":1.0,"bw":0.98}},{"key":"BEACON","num":"7","skin":"#e9b997","build":1.0,"shots":["comet","moon"],"look":{"g":"f","hs":"long","hc":"#7a4a24","skin":"#e9b997","ht":0.96,"bw":0.9}},{"key":"SHIELD","num":"22","skin":"#5a3826","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#5a3826","ht":1.06,"bw":1.14}},{"key":"ZOOM","num":"9","skin":"#d6a07a","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"curly","hc":"#3a2414","skin":"#d6a07a","ht":0.97,"bw":0.92}},{"key":"BUDDY","num":"13","skin":"#eec3a0","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"curly","hc":"#6b4a2a","skin":"#eec3a0","ht":1.0,"bw":1.0}}],"w":{"patience":0.25,"push":0.75,"fake":0.15,"flank":0.3,"calls":0.3,"lastBall":0.6,"multi":0.2,"catchFirst":0.85,"aimLow":0.5},"sync":0.15,"ab":[{"name":"TO THE RESCUE","hook":"rescue","k":{"r":1.6},"sfx":"tell_side_got","say":"I GOT IT!","tell":"A cape whoosh and an \"I got it!\" shout.","counter":"Throw at an isolated player, or send two balls at once.","effect":"Dives across to catch a ball aimed at a nearby teammate."},{"name":"HERO ANSWER","hook":"answer","k":{"power":1.15,"wind":0.85},"sfx":"tell_hero","say":"HERO ANSWER!","tell":"A quick hero pose with a glow.","counter":"Expect the answer the moment they catch: be set to dodge or catch.","effect":"After any catch, their next throw is quicker and 15% stronger."}],"rt":{"aware":0.42,"catch":0.64,"acc":0.54,"power":0.62,"foot":0.62,"comp":0.56},"brt":{"aware":0.58,"catch":0.82,"acc":0.7,"power":0.78,"foot":0.74,"comp":0.72},"weak":{"stat":"aware","text":"They chase every rescue and leave gaps behind them.","teaches":"STRATEGY 6: throw at the player who is busy or out of position."},"scout":"Rescue-diving catchers: throw at loners and into the gaps they leave, and expect a fast answer after every catch.","signs":["NOT ALL HEROES","CAPES ON","SIDEKICK SQUAD"],"intro":["Capes on, Sin City! Here come... the Sidekicks!","The Amazing Ally never leaves a teammate behind!"],"taunt":"Never fear, the sidekicks are here!","style":"Hero poses between plays, capes flapping, and sprints across the court to \"save\" a teammate."},{"id":"jazz-handlers","name":"THE JAZZ HANDLERS","short":"JAZZ HANDLERS","lvl":"normal","rank":6,"pool":"B","who":"Theater kids in stage blacks and white gloves who rehearse every throw on a count of eight.","colors":["#3B3550","#FFFFFF","#D4C6FF","#FFFFFF"],"sig":"#FFFFFF","dark":"#26222E","shape":"hand","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#26222E\" stroke=\"#FFFFFF\" stroke-width=\"3\"/><g fill=\"#FFFFFF\"><rect x=\"16\" y=\"21\" width=\"15\" height=\"13\" rx=\"5\"/><rect x=\"16\" y=\"11\" width=\"3.4\" height=\"13\" rx=\"1.7\"/><rect x=\"20.2\" y=\"9\" width=\"3.4\" height=\"14\" rx=\"1.7\"/><rect x=\"24.4\" y=\"9.5\" width=\"3.4\" height=\"14\" rx=\"1.7\"/><rect x=\"28.4\" y=\"12\" width=\"3.2\" height=\"12\" rx=\"1.6\"/><rect x=\"9\" y=\"20\" width=\"10\" height=\"3.4\" rx=\"1.7\" transform=\"rotate(-30 14 22)\"/></g></svg>","emblem":"<g fill=\"#FFFFFF\"><rect x=\"16\" y=\"21\" width=\"15\" height=\"13\" rx=\"5\"/><rect x=\"16\" y=\"11\" width=\"3.4\" height=\"13\" rx=\"1.7\"/><rect x=\"20.2\" y=\"9\" width=\"3.4\" height=\"14\" rx=\"1.7\"/><rect x=\"24.4\" y=\"9.5\" width=\"3.4\" height=\"14\" rx=\"1.7\"/><rect x=\"28.4\" y=\"12\" width=\"3.2\" height=\"12\" rx=\"1.6\"/><rect x=\"9\" y=\"20\" width=\"10\" height=\"3.4\" rx=\"1.7\" transform=\"rotate(-30 14 22)\"/></g>","boss":{"key":"CRESCENDO","stage":"MAESTRO CRESCENDO","num":"42","skin":"#e3ad88","build":1.0,"shots":["comet","hop"],"look":{"g":"m","hs":"cap","hc":"#111111","skin":"#e3ad88","ht":1.0,"bw":1.0}},"players":[{"key":"UNDERSTUDY","num":"2","skin":"#f1c7a5","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"bun","hc":"#1a1210","skin":"#f1c7a5","ht":0.95,"bw":0.88}},{"key":"CUE","num":"8","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#8a5a3c","ht":1.03,"bw":1.04}},{"key":"SPOTLIGHT","num":"16","skin":"#d6a07a","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"long","hc":"#5a3a22","skin":"#d6a07a","ht":0.96,"bw":0.9}},{"key":"MATINEE","num":"5","skin":"#c68a62","build":1.0,"shots":["comet","moon"],"look":{"g":"f","hs":"curly","hc":"#2a1b12","skin":"#c68a62","ht":0.97,"bw":0.92}},{"key":"BRAVO","num":"13","skin":"#6a4029","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#6a4029","ht":1.04,"bw":1.1}},{"key":"CHORUS","num":"24","skin":"#e9b997","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"spiky","hc":"#b9a6ff","skin":"#e9b997","ht":1.0,"bw":0.98}},{"key":"DOWNSTAGE","num":"9","skin":"#5a3826","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#5a3826","ht":0.98,"bw":0.94}}],"w":{"patience":0.75,"push":0.45,"fake":0.75,"flank":0.3,"calls":0.35,"lastBall":0.85,"multi":0.6,"catchFirst":0.3,"aimLow":0.5},"sync":0.35,"ab":[{"name":"JAZZ HANDS FAKE","hook":"fake","k":{"bait":0.3},"sfx":"tell_jazzhands","say":"JAZZ HANDS FAKE!","tell":"Only the real thrower's glove sparkles a beat before release.","counter":"Ignore the fakes and watch for the sparkling glove. Dodge that one.","effect":"All ball holders pump-fake in sync to pull your dodge early, then one real throw follows."},{"name":"FIVE, SIX, SEVEN, EIGHT","hook":"multi","k":{"n":2,"count":54},"sfx":"tell_jazz_count","say":"5, 6, 7, 8!","tell":"You hear the count out loud before the release.","counter":"On \"five, six\" get small or set to catch one. Both throwers are empty-handed after.","effect":"Two throwers release together at one target on their count."}],"rt":{"aware":0.62,"catch":0.52,"acc":0.64,"power":0.58,"foot":0.58,"comp":0.4},"brt":{"aware":0.72,"catch":0.64,"acc":0.76,"power":0.68,"foot":0.66,"comp":0.6},"weak":{"stat":"comp","text":"Off-script panic: if their push misses, the whole line is empty-handed and slow to reset.","teaches":"STRATEGY 3 and 11: survive the push, then punish right away."},"scout":"A pump-fake chorus: watch the sparkling glove, survive the push, then hit them while every hand is empty.","signs":["JAZZ HANDS!","FROM THE TOP","BRAVO, BRAVO"],"intro":["Five, six, seven, eight! Give it up for... the Jazz Handlers!","Maestro Crescendo takes center stage, and every throw is choreographed!"],"taunt":"You missed your cue!","style":"A chorus line: they move in step, step-ball-change into position, and flash jazz hands on every catch."},{"id":"key-changes","name":"THE KEY CHANGES","short":"KEY CHANGES","lvl":"normal","rank":7,"pool":"B","who":"A karaoke diva choir who save their best for the last chorus, one step higher.","colors":["#FF4081","#FFFFFF","#1A1A1A","#FFC1D9"],"sig":"#FF4081","dark":"#5A0F2E","shape":"mic","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#5A0F2E\" stroke=\"#FF4081\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><circle cx=\"24\" cy=\"16\" r=\"7.5\" fill=\"#FF4081\"/><path d=\"M18 14.5H30M18 17.5H30\" stroke=\"#5A0F2E\" stroke-width=\"1.4\"/><rect x=\"21.5\" y=\"22\" width=\"5\" height=\"14\" rx=\"2.2\" fill=\"#FF4081\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><circle cx=\"24\" cy=\"16\" r=\"7.5\" fill=\"#FF4081\"/><path d=\"M18 14.5H30M18 17.5H30\" stroke=\"#5A0F2E\" stroke-width=\"1.4\"/><rect x=\"21.5\" y=\"22\" width=\"5\" height=\"14\" rx=\"2.2\" fill=\"#FF4081\"/></g>","boss":{"key":"HIGHC","stage":"DIVA HIGH C","num":"44","skin":"#6a4029","build":1.04,"shots":["comet","moon"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#6a4029","ht":1.0,"bw":0.98}},"players":[{"key":"ALTO","num":"2","skin":"#c68a62","build":1.0,"shots":["comet","moon"],"look":{"g":"f","hs":"curly","hc":"#2a1b12","skin":"#c68a62","ht":0.96,"bw":0.92}},{"key":"TENOR","num":"7","skin":"#f1c7a5","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"short","hc":"#5a3a22","skin":"#f1c7a5","ht":1.02,"bw":1.04}},{"key":"SOPRANO","num":"1","skin":"#8a5a3c","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"long","hc":"#1a1210","skin":"#8a5a3c","ht":0.95,"bw":0.88}},{"key":"BARITONE","num":"22","skin":"#5e3b26","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#5e3b26","ht":1.06,"bw":1.14}},{"key":"ENCORE","num":"9","skin":"#e9b997","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#ff4081","skin":"#e9b997","ht":0.94,"bw":0.88}},{"key":"FALSETTO","num":"11","skin":"#d6a07a","build":1.0,"shots":["hook","comet"],"look":{"g":"m","hs":"spiky","hc":"#3a2414","skin":"#d6a07a","ht":1.0,"bw":0.98}},{"key":"HARMONY","num":"5","skin":"#eec3a0","build":1.0,"shots":["moon","comet"],"look":{"g":"f","hs":"pony","hc":"#6b4a2a","skin":"#eec3a0","ht":0.96,"bw":0.9}}],"w":{"patience":0.55,"push":0.55,"fake":0.3,"flank":0.3,"calls":0.4,"lastBall":0.7,"multi":0.7,"catchFirst":0.3,"aimLow":0.45},"sync":0.3,"ab":[{"name":"THREE-PART HARMONY","hook":"multi","k":{"n":3,"stagger":15,"count":30},"sfx":"tell_harmony","say":"HARMONY!","tell":"An ascending three-note chord.","counter":"Dodge the first two, and set to catch the third.","effect":"Three throwers release one after another, 0.25 s apart, at one target."},{"name":"KEY CHANGE","hook":"keychange","k":{"comp":0.15,"power":1.1},"sfx":"tell_keychange","say":"KEY CHANGE!","tell":"The music modulates up a step and a spotlight sweeps their side.","counter":"Close it out fast and keep throwing low at feet.","effect":"When they fall 2 or more players behind, the team gains composure and 10% power until the score is level."}],"rt":{"aware":0.58,"catch":0.58,"acc":0.44,"power":0.66,"foot":0.56,"comp":0.64},"brt":{"aware":0.7,"catch":0.7,"acc":0.58,"power":0.86,"foot":0.66,"comp":0.84},"weak":{"stat":"acc","text":"Pitchy: their throws drift wide.","teaches":"STRATEGY 10: stay in bounds and let wide throws go."},"scout":"Pitchy but powerful harmonizers: dodge two, catch the third, and finish before the key change.","signs":["HIT THAT NOTE","ONE MORE CHORUS","MIC DROP"],"intro":["Take it up a key... the Key Changes!","Diva High C is holding the high note, and the whole choir is coming in!"],"taunt":"That was the warm-up!","style":"Choir-riser sway and step-touch, a hand on the heart for every catch, and a mic drop when they win a point."},{"id":"feather-weights","name":"THE FEATHER WEIGHTS","short":"FEATHER WEIGHTS","lvl":"normal","rank":8,"pool":"C","who":"A Vegas showgirl homage in plumes and rhinestones, too light to hit and too bright to miss.","colors":["#FF8CC0","#4A0F38","#FFFFFF","#FFD6E8"],"sig":"#FF8CC0","dark":"#4A0F38","shape":"feather","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#4A0F38\" stroke=\"#FF8CC0\" stroke-width=\"3\"/><path d=\"M31 9 C20 13 15 23 17 33 C27 32 34 22 31 9 Z\" fill=\"#FF8CC0\"/><path d=\"M29 13 L15 38\" stroke=\"#4A0F38\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>","emblem":"<path d=\"M31 9 C20 13 15 23 17 33 C27 32 34 22 31 9 Z\" fill=\"#FF8CC0\"/><path d=\"M29 13 L15 38\" stroke=\"#4A0F38\" stroke-width=\"2\" stroke-linecap=\"round\"/>","boss":{"key":"PLUMAGE","stage":"MADAME PLUMAGE","num":"10","skin":"#8a5a3c","build":0.96,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#ffd6e8","skin":"#8a5a3c","ht":1.02,"bw":0.88}},"players":[{"key":"BOA","num":"4","skin":"#f1c7a5","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"long","hc":"#ff8cc0","skin":"#f1c7a5","ht":0.96,"bw":0.88}},{"key":"MARABOU","num":"11","skin":"#6a4029","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#6a4029","ht":0.97,"bw":0.9}},{"key":"RHINESTONE","num":"2","skin":"#c68a62","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#c68a62","ht":1.02,"bw":1.0}},{"key":"SEQUIN","num":"19","skin":"#e9b997","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"pony","hc":"#ffd6e8","skin":"#e9b997","ht":0.95,"bw":0.88}},{"key":"KICKLINE","num":"8","skin":"#d6a07a","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#5a3a22","skin":"#d6a07a","ht":1.0,"bw":0.9}},{"key":"OSTRICH","num":"15","skin":"#9a6a48","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#1a1210","skin":"#9a6a48","ht":1.05,"bw":1.02}},{"key":"CANCAN","num":"7","skin":"#e3ad88","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"spiky","hc":"#ff8cc0","skin":"#e3ad88","ht":1.0,"bw":0.98}}],"w":{"patience":0.6,"push":0.4,"fake":0.8,"flank":0.35,"calls":0.3,"lastBall":0.8,"multi":0.15,"catchFirst":0.2,"aimLow":0.6},"sync":0.12,"ab":[{"name":"FEATHER-LIGHT DODGE","hook":"evade","k":{"p":0.5,"cd":180,"state":"spin"},"sfx":"tell_twirl","say":"TWIRL!","tell":"Plumes flare and a twirl chime.","counter":"Two balls beat any dodger: throw a second ball right after the twirl, or double them.","effect":"A twirl dodge with a smaller hitbox for 0.3 s. The best single dodge in the bracket, with a 3 s cooldown."},{"name":"BOA FAKE","hook":"boa","k":{"p":0.3},"sfx":"tell_boa","say":"BOA FAKE!","tell":"The boa swings wide before the fake.","counter":"Do not jump on the boa swing. The real throw is soft and low, so step and catch.","effect":"A big showy pump fake that makes defenders flinch, then a quick soft throw at feet."}],"rt":{"aware":0.66,"catch":0.5,"acc":0.58,"power":0.36,"foot":0.86,"comp":0.58},"brt":{"aware":0.78,"catch":0.62,"acc":0.72,"power":0.48,"foot":0.84,"comp":0.72},"weak":{"stat":"power","text":"Feather arms: their throws are soft and easy to catch.","teaches":"STRATEGY 7: two balls beat any dodger."},"scout":"Feather-light dodgers who fake a lot: throw two balls at once, and catch their soft returns.","signs":["FEATHERS UP","ALL PLUME","KICKLINE QUEENS"],"intro":["Feathers up, sequins on! Welcome... the Feather Weights!","Madame Plumage is here, light as air and twice as fabulous!"],"taunt":"Too light to hit, too bright to miss!","style":"A kickline: high steps, twirls and plumes that flutter on every dodge."},{"id":"pyramid-schemers","name":"THE PYRAMID SCHEMERS","short":"PYRAMID SCHEMERS","lvl":"normal","rank":9,"pool":"C","who":"A cheer squad with a plan for everything, and the plan is always a pyramid.","colors":["#FF7A59","#FFFFFF","#1B2A49","#FFD3C4"],"sig":"#FF7A59","dark":"#5A1E0E","shape":"pyramid","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#5A1E0E\" stroke=\"#FF7A59\" stroke-width=\"3\"/><path d=\"M24 9 L39 36 H9 Z\" fill=\"#FF7A59\"/><path d=\"M15.7 24 H32.3 M19.8 24 L24 36 L28.2 24\" fill=\"none\" stroke=\"#5A1E0E\" stroke-width=\"1.6\"/></svg>","emblem":"<path d=\"M24 9 L39 36 H9 Z\" fill=\"#FF7A59\"/><path d=\"M15.7 24 H32.3 M19.8 24 L24 36 L28.2 24\" fill=\"none\" stroke=\"#5A1E0E\" stroke-width=\"1.6\"/>","boss":{"key":"SPIRIT","stage":"CAPTAIN SPIRIT","num":"15","skin":"#8a5a3c","build":1.0,"shots":["moon","comet"],"look":{"g":"f","hs":"pony","hc":"#1a1210","skin":"#8a5a3c","ht":0.97,"bw":0.9}},"players":[{"key":"POMPOM","num":"1","skin":"#e3ad88","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"pony","hc":"#3b2418","skin":"#e3ad88","ht":0.95,"bw":0.88}},{"key":"HERKIE","num":"7","skin":"#5e3b26","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#1a1210","skin":"#5e3b26","ht":1.05,"bw":1.08}},{"key":"TOETOUCH","num":"4","skin":"#f3d2b8","build":1.0,"shots":["moon","hop"],"look":{"g":"f","hs":"bun","hc":"#e8c070","skin":"#f3d2b8","ht":0.94,"bw":0.88}},{"key":"FLYER","num":"2","skin":"#c68a62","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"long","hc":"#2a1b12","skin":"#c68a62","ht":0.93,"bw":0.86}},{"key":"BASE","num":"30","skin":"#7d5236","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#7d5236","ht":1.06,"bw":1.16}},{"key":"SPOTTER","num":"12","skin":"#d9a481","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#d9a481","ht":1.02,"bw":1.04}},{"key":"HYPE","num":"9","skin":"#9a6a48","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#9a6a48","ht":0.97,"bw":0.92}}],"w":{"patience":0.6,"push":0.5,"fake":0.3,"flank":0.4,"calls":0.9,"lastBall":0.8,"multi":0.6,"catchFirst":0.8,"aimLow":0.5},"sync":0.25,"ab":[{"name":"PYRAMID CATCH","hook":"highcatch","k":{"p":0.6},"sfx":"tell_pyr_ready","say":"READY? OK!","tell":"A \"Ready? OK!\" call and the bases crouch.","counter":"Throw low at the bases: they cannot dodge while stunting.","effect":"Two bases boost a flyer who can catch high lobs and over-the-top throws."},{"name":"BASKET TOSS THROW","hook":"shot","k":{"base":"normal","release":2.4,"hard":1},"sfx":"tell_pyr_hit","say":"HIT IT!","tell":"\"Hit it!\" and the bases dip before the toss.","counter":"The setup is slow: step back from the line, or throw at the bases first.","effect":"A boosted thrower releases from height at a steep downward angle that is hard to catch."}],"rt":{"aware":0.48,"catch":0.72,"acc":0.56,"power":0.56,"foot":0.5,"comp":0.66},"brt":{"aware":0.62,"catch":0.86,"acc":0.7,"power":0.7,"foot":0.66,"comp":0.8},"weak":{"stat":"aware","text":"All eyes on the flyer: throws from the side catch them looking up.","teaches":"STRATEGY 6: throw at the player who is busy."},"scout":"Catchers who stunt for high balls: throw low at the bases and hit them from the side while they look up.","signs":["READY? OK!","GO, FIGHT, CATCH","SPIRIT FINGERS"],"intro":["Ready? OK! Give it up for... the Pyramid Schemers!","Captain Spirit is on the floor, and that pyramid catches everything up high!"],"taunt":"Two, four, six, eight, who do we eliminate?","style":"Bouncy and loud: they hit formations, wave spirit fingers, and stunt up to catch high balls."},{"id":"skate-expectations","name":"SKATE EXPECTATIONS","short":"SKATE EXPECTATIONS","lvl":"normal","rank":10,"pool":"C","who":"A roller derby crew that wins the opening rush before the whistle finishes.","colors":["#1F5BFF","#FFFFFF","#0A1440","#2F5BFF"],"sig":"#2F5BFF","dark":"#0A1440","shape":"bolt","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#0A1440\" stroke=\"#2F5BFF\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M28 9 L15 26 H23 L19 38 L33 20 H25 L30 9 Z\" fill=\"#2F5BFF\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M28 9 L15 26 H23 L19 38 L33 20 H25 L30 9 Z\" fill=\"#2F5BFF\"/></g>","boss":{"key":"JUSTICE","stage":"JAMMER JUSTICE","num":"88","skin":"#7d5236","build":1.02,"shots":["comet","hop"],"look":{"g":"f","hs":"pony","hc":"#1a1210","skin":"#7d5236","ht":0.98,"bw":0.94}},"players":[{"key":"PIVOT","num":"1","skin":"#e3ad88","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"pony","hc":"#3b2418","skin":"#e3ad88","ht":0.95,"bw":0.9}},{"key":"WHIP","num":"17","skin":"#c58c66","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"short","hc":"#2a1b12","skin":"#c58c66","ht":1.0,"bw":1.02}},{"key":"BLOCKADE","num":"30","skin":"#5e3b26","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"locs","hc":"#1a1210","skin":"#5e3b26","ht":1.06,"bw":1.16}},{"key":"KICKFLIP","num":"6","skin":"#eec3a0","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"mohawk","hc":"#9fe8ff","skin":"#eec3a0","ht":1.0,"bw":0.98}},{"key":"TOESTOP","num":"25","skin":"#d9a481","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"bun","hc":"#24170f","skin":"#d9a481","ht":0.96,"bw":0.9}},{"key":"APEX","num":"3","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"fade","hc":"#120c0a","skin":"#8a5a3c","ht":0.98,"bw":0.94}},{"key":"SKIDS","num":"12","skin":"#f3d2b8","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"curly","hc":"#6b4a2a","skin":"#f3d2b8","ht":1.02,"bw":1.0}}],"w":{"patience":0.1,"push":0.85,"fake":0.1,"flank":0.4,"calls":0.2,"lastBall":0.45,"multi":0.2,"catchFirst":0.2,"aimLow":0.5},"sync":0.15,"ab":[{"name":"JAMMER BURST","hook":"burst","k":{"mul":1.3,"frames":60},"sfx":"tell_jammer","say":"JAMMER BURST!","tell":"Sparks off the wheels and a skate screech.","counter":"Let the burst finish. They coast right after, and that is the moment to throw.","effect":"A 1 second speed burst (1.3x) on the opening rush and once per rally for a dodge."},{"name":"WHIP ASSIST","hook":"passthrow","k":{"wind":0.8},"sfx":"tell_whip","say":"WHIP ASSIST!","tell":"Two players link arms and swing.","counter":"The whipped player is out of position after the throw. Target them next.","effect":"A teammate whips the receiver forward: the receiver gets a quicker release (0.8x windup)."}],"rt":{"aware":0.58,"catch":0.4,"acc":0.58,"power":0.66,"foot":0.84,"comp":0.56},"brt":{"aware":0.7,"catch":0.5,"acc":0.72,"power":0.8,"foot":0.84,"comp":0.66},"weak":{"stat":"catch","text":"All speed, no hands: they rarely catch, and momentum carries them toward the lines.","teaches":"STRATEGY 6 and 10: throw where they are going, and make them dodge toward the sideline."},"scout":"Speed rushers with no hands: let the Jammer Burst finish, then throw where they are skating.","signs":["ROLL WITH IT","JAM ON","WHEELS UP"],"intro":["Clear the track! Rolling in hot, it's... Skate Expectations!","Jammer Justice is on the floor, so keep your head up and your feet moving!"],"taunt":"Catch us if you can!","style":"They weave in figure eights, low and fast, with whips and hip checks off each other."},{"id":"triple-axels","name":"THE TRIPLE AXELS","short":"TRIPLE AXELS","lvl":"normal","rank":11,"pool":"C","who":"Figure skaters who treat the court like a rink and every dodge like a free skate.","colors":["#E8F7FF","#0D2A4A","#3FA9F5","#BFE6FF"],"sig":"#3FA9F5","dark":"#0D2A4A","shape":"snowflake","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#0D2A4A\" stroke=\"#3FA9F5\" stroke-width=\"3\"/><g stroke=\"#3FA9F5\" stroke-width=\"3.2\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M24 10V36M12.7 16.5L35.3 29.5M12.7 29.5L35.3 16.5\"/><path d=\"M20 12l4 4 4-4M20 34l4-4 4 4M13 21l5-1-2-5M35 25l-5 1 2 5M13 25l5 1-2 5M35 21l-5-1 2-5\"/></g></svg>","emblem":"<g stroke=\"#3FA9F5\" stroke-width=\"3.2\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M24 10V36M12.7 16.5L35.3 29.5M12.7 29.5L35.3 16.5\"/><path d=\"M20 12l4 4 4-4M20 34l4-4 4 4M13 21l5-1-2-5M35 25l-5 1 2 5M13 25l5 1-2 5M35 21l-5-1 2-5\"/></g>","boss":{"key":"LAMOUR","stage":"LUTZ LAMOUR","num":"6","skin":"#e3ad88","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#3b2418","skin":"#e3ad88","ht":0.98,"bw":0.9}},"players":[{"key":"SALCHOW","num":"2","skin":"#f1c7a5","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"pony","hc":"#3b2418","skin":"#f1c7a5","ht":0.95,"bw":0.88}},{"key":"CAMEL","num":"8","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#8a5a3c","ht":1.03,"bw":1.0}},{"key":"SPIRAL","num":"11","skin":"#d6a07a","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"bun","hc":"#24170f","skin":"#d6a07a","ht":0.96,"bw":0.88}},{"key":"TWIZZLE","num":"4","skin":"#eec3a0","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"short","hc":"#6b4a2a","skin":"#eec3a0","ht":1.0,"bw":0.98}},{"key":"FLIP","num":"17","skin":"#6a4029","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#6a4029","ht":0.97,"bw":0.9}},{"key":"LOOP","num":"9","skin":"#c58c66","build":1.0,"shots":["hook","moon"],"look":{"g":"m","hs":"curly","hc":"#2a1b12","skin":"#c58c66","ht":1.02,"bw":1.0}},{"key":"AXEL","num":"3","skin":"#e9b997","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"spiky","hc":"#bfe6ff","skin":"#e9b997","ht":1.0,"bw":0.96}}],"w":{"patience":0.5,"push":0.45,"fake":0.2,"flank":0.55,"calls":0.3,"lastBall":0.75,"multi":0.15,"catchFirst":0.3,"aimLow":0.7},"sync":0.12,"ab":[{"name":"TOE PICK STOP","hook":"evade","k":{"p":0.4,"cd":150,"state":"lean"},"sfx":"tell_toepick","say":"TOE PICK STOP!","tell":"A spray of ice and a blade scrape.","counter":"Throw a second ball right after the stop: it is on cooldown.","effect":"An instant stop and reverse with no momentum, once every 2.5 s."},{"name":"SPIRAL THROW","hook":"shot","k":{"base":"hook","acc":1.15},"sfx":"tell_spiral","say":"SPIRAL THROW!","tell":"A frost trail and a blade hiss on the windup.","counter":"It is medium speed: square up and catch it.","effect":"An accurate throw released while gliding backward, from a wide angle."}],"rt":{"aware":0.64,"catch":0.56,"acc":0.62,"power":0.5,"foot":0.8,"comp":0.4},"brt":{"aware":0.74,"catch":0.66,"acc":0.74,"power":0.62,"foot":0.84,"comp":0.52},"weak":{"stat":"comp","text":"Big-stage nerves: when they fall 2 or more behind, their throws wobble.","teaches":"STRATEGY 9: use your control clock to keep the pressure on."},"scout":"Graceful dodgers who stop on a dime: double them after the toe pick and keep the pressure on their nerves.","signs":["STICK THE LANDING","PERFECT TENS","ICE ICE MAYBE"],"intro":["Lace up, Sin City! Gliding onto the court... the Triple Axels!","Lutz Lamour just spun three times before the whistle. Show-off!"],"taunt":"Try to keep up, we are on ice!","style":"Long gliding curves, a spin between plays, and a pairs lift on every celebration."},{"id":"mirror-ballers","name":"THE MIRROR BALLERS","short":"MIRROR BALLERS","lvl":"hard","rank":12,"pool":"D","who":"A disco squad that turns every game into a dance floor, and brings its own extra ball.","colors":["#C3C9D6","#2B1B5E","#D500F9","#FFFFFF"],"sig":"#D500F9","dark":"#2B1B5E","shape":"sphere","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#2B1B5E\" stroke=\"#D500F9\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><circle cx=\"24\" cy=\"23\" r=\"12\" fill=\"#D500F9\"/><g stroke=\"#2B1B5E\" stroke-width=\"1.6\" fill=\"none\"><path d=\"M12.6 19h22.8M12 23h24M12.6 27h22.8\"/><path d=\"M24 11v24M18 12.5c-2 6-2 15 0 21M30 12.5c2 6 2 15 0 21\"/></g></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><circle cx=\"24\" cy=\"23\" r=\"12\" fill=\"#D500F9\"/><g stroke=\"#2B1B5E\" stroke-width=\"1.6\" fill=\"none\"><path d=\"M12.6 19h22.8M12 23h24M12.6 27h22.8\"/><path d=\"M24 11v24M18 12.5c-2 6-2 15 0 21M30 12.5c2 6 2 15 0 21\"/></g></g>","boss":{"key":"DYNAMO","stage":"DISCO DYNAMO","num":"70","skin":"#c58c66","build":1.08,"shots":["hook","comet"],"look":{"g":"m","hs":"afro","hc":"#1a1210","skin":"#c58c66","ht":1.04,"bw":1.12}},"players":[{"key":"GROOVE","num":"1","skin":"#eec3a0","build":1.0,"shots":["hook","comet"],"look":{"g":"f","hs":"long","hc":"#e8c070","skin":"#eec3a0","ht":0.96,"bw":0.9}},{"key":"HUSTLE","num":"7","skin":"#7d5236","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"afro","hc":"#1a1210","skin":"#7d5236","ht":1.04,"bw":1.1}},{"key":"BOOGIE","num":"12","skin":"#d9a481","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"curly","hc":"#3a2414","skin":"#d9a481","ht":0.97,"bw":0.92}},{"key":"FUNKY","num":"33","skin":"#5a3826","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"locs","hc":"#1a1210","skin":"#5a3826","ht":1.06,"bw":1.14}},{"key":"STROBE","num":"9","skin":"#f3d2b8","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"spiky","hc":"#ff3fd0","skin":"#f3d2b8","ht":1.0,"bw":0.98}},{"key":"SPARKLE","num":"22","skin":"#c99272","build":1.0,"shots":["comet","hop"],"look":{"g":"f","hs":"bun","hc":"#c3c9d6","skin":"#c99272","ht":0.95,"bw":0.9}},{"key":"BASSLINE","num":"4","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#8a5a3c","ht":1.05,"bw":1.08}}],"w":{"patience":0.15,"push":0.85,"fake":0.25,"flank":0.2,"calls":0.15,"lastBall":0.25,"multi":0.2,"catchFirst":0.2,"aimLow":0.3},"sync":0.18,"ab":[{"name":"GLITTER SPIN","hook":"shot","k":{"base":"comet","wobble":0.25,"acc":0.85},"sfx":"tell_glitter","say":"GLITTER SPIN!","tell":"A sparkle burst and a record scratch on the spin.","counter":"Stay set and square up to catch. The wobble makes it drift toward your chest.","effect":"A spinning power throw that hides the release point and wobbles in flight. Hard to read, hard to dodge, but not very accurate."},{"name":"STROBE STEP","hook":"strobe","k":{"p":0.35,"cd":240},"sfx":"tell_strobe","say":"STROBE STEP!","tell":"A strobe flash on their outline.","counter":"Aim at the player, not the flash. The afterimage fades in 0.2 s.","effect":"A quick side step that leaves a short afterimage, which can pull a throw to where they were."}],"rt":{"aware":0.54,"catch":0.58,"acc":0.5,"power":0.8,"foot":0.62,"comp":0.38},"brt":{"aware":0.66,"catch":0.7,"acc":0.62,"power":0.92,"foot":0.72,"comp":0.5},"weak":{"stat":"comp","text":"No last-ball discipline: they throw their last ball and hand you every ball.","teaches":"STRATEGY 17 and 11: bait the last ball, dodge it, punish with all of them."},"scout":"Wild power with no discipline: catch the Glitter Spin, bait their last ball, then answer with everything.","signs":["DISCO FOREVER","SPIN IT","MIRROR, MIRROR"],"intro":["Dim the lights and drop the beat! It's... the Mirror Ballers!","Disco Dynamo is spinning, and nobody can read that glitter throw!"],"taunt":"Everybody out on the dance floor!","style":"They groove in place, point at the ceiling, and spin into every throw."},{"id":"house-of-catch","name":"THE HOUSE OF CATCH","short":"HOUSE OF CATCH","lvl":"hard","rank":13,"pool":"D","who":"A ballroom house that walks every category, and the category is always catch.","colors":["#9BE7BE","#0B3D2A","#2ECC71","#F4FFF8"],"sig":"#2ECC71","dark":"#0B3D2A","shape":"trophy","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#0B3D2A\" stroke=\"#2ECC71\" stroke-width=\"3\"/><g fill=\"#2ECC71\"><path d=\"M16 11 H32 V17 C32 23 28 26 24 26 C20 26 16 23 16 17 Z\"/><rect x=\"22\" y=\"25\" width=\"4\" height=\"6\"/><rect x=\"17\" y=\"31\" width=\"14\" height=\"5\" rx=\"1\"/></g><g fill=\"none\" stroke=\"#2ECC71\" stroke-width=\"2.4\"><path d=\"M16 13 H11.5 V16 C11.5 19 13.5 21 16.5 21\"/><path d=\"M32 13 H36.5 V16 C36.5 19 34.5 21 31.5 21\"/></g></svg>","emblem":"<g fill=\"#2ECC71\"><path d=\"M16 11 H32 V17 C32 23 28 26 24 26 C20 26 16 23 16 17 Z\"/><rect x=\"22\" y=\"25\" width=\"4\" height=\"6\"/><rect x=\"17\" y=\"31\" width=\"14\" height=\"5\" rx=\"1\"/></g><g fill=\"none\" stroke=\"#2ECC71\" stroke-width=\"2.4\"><path d=\"M16 13 H11.5 V16 C11.5 19 13.5 21 16.5 21\"/><path d=\"M32 13 H36.5 V16 C36.5 19 34.5 21 31.5 21\"/></g>","boss":{"key":"CATCHERINE","stage":"MOTHER CATCHERINE","num":"9","skin":"#6a4029","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"long","hc":"#141010","skin":"#6a4029","ht":1.03,"bw":0.94}},"players":[{"key":"LEGENDARY","num":"1","skin":"#c68a62","build":1.0,"shots":["hook","moon"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#c68a62","ht":1.04,"bw":1.02}},{"key":"DIP","num":"2","skin":"#f1c7a5","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"pony","hc":"#3b2418","skin":"#f1c7a5","ht":0.96,"bw":0.9}},{"key":"HANDS","num":"3","skin":"#5e3b26","build":1.0,"shots":["moon","hook"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#5e3b26","ht":0.97,"bw":0.92}},{"key":"DUCKWALK","num":"5","skin":"#e3ad88","build":1.0,"shots":["hook","hop"],"look":{"g":"m","hs":"crop","hc":"#2a1b12","skin":"#e3ad88","ht":1.0,"bw":1.0}},{"key":"FIERCE","num":"13","skin":"#9a6a48","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"long","hc":"#c2187a","skin":"#9a6a48","ht":0.98,"bw":0.9}},{"key":"RUNWAY","num":"16","skin":"#d6a07a","build":1.0,"shots":["hook","moon"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#d6a07a","ht":1.06,"bw":1.0}},{"key":"CHOP","num":"8","skin":"#7d5236","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"short","hc":"#1a1210","skin":"#7d5236","ht":1.02,"bw":1.04}}],"w":{"patience":0.85,"push":0.25,"fake":0.6,"flank":0.3,"calls":0.6,"lastBall":0.95,"multi":0.1,"catchFirst":0.95,"aimLow":0.6},"sync":0.1,"ab":[{"name":"DIP AND PARTNER CATCH","hook":"rescue","k":{"r":1.6,"partner":1},"sfx":"tell_house_dip","say":"DIP!","tell":"A glowing link between the pair and a \"Dip!\" call.","counter":"Throw at feet (no low catches), target the back partner, or split the pair with two balls.","effect":"The front partner dips under a throw and the partner behind gets a free catch try on the same ball."},{"name":"TENS ACROSS THE BOARD","hook":"tens","k":{},"sfx":"tell_tens","say":"10, 10, 10!","tell":"Tiny \"10\" scorecards pop when they set to catch.","counter":"Accuracy beats heat: aim hips and legs, and never throw chest-high at a set catcher.","effect":"Clean catches at chest height almost never bobble (best hands in the bracket)."}],"rt":{"aware":0.68,"catch":0.8,"acc":0.58,"power":0.36,"foot":0.62,"comp":0.6},"brt":{"aware":0.82,"catch":0.88,"acc":0.7,"power":0.5,"foot":0.72,"comp":0.8},"weak":{"stat":"power","text":"Gloves, not cannons: their throws are slow, and a lone partner loses composure.","teaches":"STRATEGY 5 and 6: aim low, accuracy beats heat."},"scout":"Best hands in the building, moving in pairs: aim at feet, split the pairs, and never feed their chests.","signs":["CATEGORY IS CATCH","TENS ACROSS","MOTHER IS MOTHERING"],"intro":["Category is... catch! Walking for... the House of Catch!","Mother Catcherine is in the building, and the judges are already holding up tens!"],"taunt":"Ten, ten, ten... and you are out!","style":"They move in partnered pairs, dip on the dodge, and vogue between plays."},{"id":"count-downs","name":"THE COUNT-DOWNS","short":"COUNT-DOWNS","lvl":"hard","rank":14,"pool":"D","who":"A goth vampire cabaret, spooky-cute and all-ages, who strike as the clock runs down.","colors":["#2A2233","#B39DDB","#1A1320","#E6DDF7"],"sig":"#B39DDB","dark":"#1A1320","shape":"bat","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#1A1320\" stroke=\"#B39DDB\" stroke-width=\"3\"/><path d=\"M24 17 L22.6 12.5 L21.2 16.8 C17.5 14.6 12.5 13.8 6.5 15.5 C8.6 18.6 9.4 22 8.6 26 C11.2 24.4 14 24.8 15.6 27.4 C17.2 25.2 19.7 25.2 21.2 27.8 C22.2 26.6 23.1 26.4 24 27.2 C24.9 26.4 25.8 26.6 26.8 27.8 C28.3 25.2 30.8 25.2 32.4 27.4 C34 24.8 36.8 24.4 39.4 26 C38.6 22 39.4 18.6 41.5 15.5 C35.5 13.8 30.5 14.6 26.8 16.8 L25.4 12.5 Z\" fill=\"#B39DDB\"/><circle cx=\"24\" cy=\"21.5\" r=\"3.4\" fill=\"#B39DDB\"/></svg>","emblem":"<path d=\"M24 17 L22.6 12.5 L21.2 16.8 C17.5 14.6 12.5 13.8 6.5 15.5 C8.6 18.6 9.4 22 8.6 26 C11.2 24.4 14 24.8 15.6 27.4 C17.2 25.2 19.7 25.2 21.2 27.8 C22.2 26.6 23.1 26.4 24 27.2 C24.9 26.4 25.8 26.6 26.8 27.8 C28.3 25.2 30.8 25.2 32.4 27.4 C34 24.8 36.8 24.4 39.4 26 C38.6 22 39.4 18.6 41.5 15.5 C35.5 13.8 30.5 14.6 26.8 16.8 L25.4 12.5 Z\" fill=\"#B39DDB\"/><circle cx=\"24\" cy=\"21.5\" r=\"3.4\" fill=\"#B39DDB\"/>","boss":{"key":"NOCTURNE","stage":"COUNTESS NOCTURNE","num":"13","skin":"#f3d2b8","build":1.0,"shots":["hook","comet"],"look":{"g":"f","hs":"long","hc":"#141010","skin":"#f3d2b8","ht":1.02,"bw":0.92}},"players":[{"key":"BELFRY","num":"3","skin":"#e9b997","build":1.0,"shots":["hook","comet"],"look":{"g":"m","hs":"spiky","hc":"#141010","skin":"#e9b997","ht":1.02,"bw":0.98}},{"key":"VELVETINE","num":"6","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"long","hc":"#1a1210","skin":"#8a5a3c","ht":0.96,"bw":0.9}},{"key":"MIDNIGHT","num":"12","skin":"#f1c7a5","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#f1c7a5","ht":1.04,"bw":1.06}},{"key":"CANDELABRA","num":"9","skin":"#c68a62","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#b39ddb","skin":"#c68a62","ht":0.95,"bw":0.88}},{"key":"ECHO","num":"1","skin":"#5e3b26","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"locs","hc":"#1a1210","skin":"#5e3b26","ht":1.04,"bw":1.1}},{"key":"GLOOM","num":"7","skin":"#d6a07a","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"pony","hc":"#141010","skin":"#d6a07a","ht":0.96,"bw":0.9}},{"key":"NIGHTSHADE","num":"4","skin":"#eec3a0","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"fade","hc":"#120c0a","skin":"#eec3a0","ht":1.0,"bw":1.0}}],"w":{"patience":0.85,"push":0.6,"fake":0.5,"flank":0.35,"calls":0.3,"lastBall":0.85,"multi":0.75,"catchFirst":0.2,"aimLow":0.5},"sync":0.35,"ab":[{"name":"CAPE SWIRL","hook":"cape","k":{"p":0.6,"cd":180},"sfx":"tell_cape","say":"CAPE SWIRL!","tell":"A cape flap and an organ chord.","counter":"Aim at the legs: the cape only covers the top.","effect":"The cape covers the upper body for 0.3 s, so high throws whiff."},{"name":"MIDNIGHT STRIKE","hook":"midnight","k":{},"sfx":"tell_midnight","say":"MIDNIGHT STRIKE!","tell":"A clock chime that grows louder, and their eyes glow lavender.","counter":"When the chime starts, face the throwers and set to catch one ball.","effect":"Near the end of their 15 s ball control, every holder throws together at a player who is not facing them."}],"rt":{"aware":0.7,"catch":0.4,"acc":0.66,"power":0.7,"foot":0.66,"comp":0.52},"brt":{"aware":0.84,"catch":0.52,"acc":0.8,"power":0.86,"foot":0.8,"comp":0.78},"weak":{"stat":"catch","text":"Capes tangle: they rarely catch, so every ball they face is a dodge.","teaches":"STRATEGY 11: bait the strike, dodge it, then punish while their hands are empty."},"scout":"Midnight strikers who cannot catch: face them when the chime starts, aim at legs, and throw freely.","signs":["FANGS FOR COMING","FANG-TASTIC","GO BATTY"],"intro":["Lights down, capes up... the Count-Downs!","Countess Nocturne is counting down, and when the clock chimes, watch out!"],"taunt":"Three, two, one... you are out!","style":"Cape swirls, gliding out of the shadows, and a cabaret pose before every throw."},{"id":"prickly-pears","name":"THE PRICKLY PEARS","short":"PRICKLY PEARS","lvl":"hard","rank":15,"pool":"D","who":"A desert crew from just outside the Strip: rooted, patient, and sharp when it counts.","colors":["#E7B98F","#2F4F1A","#558B2F","#FF8FB1"],"sig":"#558B2F","dark":"#1F3A12","shape":"cactus","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#1F3A12\" stroke=\"#558B2F\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><g fill=\"#558B2F\"><rect x=\"20\" y=\"9\" width=\"8\" height=\"28\" rx=\"4\"/><rect x=\"11\" y=\"15\" width=\"5\" height=\"12\" rx=\"2.5\"/><rect x=\"11\" y=\"23\" width=\"11\" height=\"4.5\" rx=\"2.2\"/><rect x=\"32\" y=\"13\" width=\"5\" height=\"12\" rx=\"2.5\"/><rect x=\"26\" y=\"21\" width=\"11\" height=\"4.5\" rx=\"2.2\"/></g></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><g fill=\"#558B2F\"><rect x=\"20\" y=\"9\" width=\"8\" height=\"28\" rx=\"4\"/><rect x=\"11\" y=\"15\" width=\"5\" height=\"12\" rx=\"2.5\"/><rect x=\"11\" y=\"23\" width=\"11\" height=\"4.5\" rx=\"2.2\"/><rect x=\"32\" y=\"13\" width=\"5\" height=\"12\" rx=\"2.5\"/><rect x=\"26\" y=\"21\" width=\"11\" height=\"4.5\" rx=\"2.2\"/></g></g>","boss":{"key":"AGAVE","stage":"AUNTIE AGAVE","num":"7","skin":"#9a6a48","build":1.04,"shots":["comet","moon"],"look":{"g":"f","hs":"bun","hc":"#ff8fb1","skin":"#9a6a48","ht":1.0,"bw":1.0}},"players":[{"key":"SAGUARO","num":"1","skin":"#c58c66","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"crop","hc":"#141010","skin":"#c58c66","ht":1.06,"bw":1.1}},{"key":"YUCCA","num":"4","skin":"#f1c7a5","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"long","hc":"#3b2418","skin":"#f1c7a5","ht":0.96,"bw":0.9}},{"key":"JOSHUA","num":"8","skin":"#8a5a3c","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"locs","hc":"#1a1210","skin":"#8a5a3c","ht":1.04,"bw":1.06}},{"key":"OCOTILLO","num":"11","skin":"#d9a481","build":1.0,"shots":["comet","moon"],"look":{"g":"f","hs":"bun","hc":"#ff8fb1","skin":"#d9a481","ht":0.95,"bw":0.9}},{"key":"CHOLLA","num":"13","skin":"#6a4029","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#6a4029","ht":0.97,"bw":0.94}},{"key":"MESQUITE","num":"21","skin":"#e3ad88","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"curly","hc":"#5a3a22","skin":"#e3ad88","ht":1.02,"bw":1.04}},{"key":"SUCCULENT","num":"2","skin":"#eec3a0","build":1.0,"shots":["hook","moon"],"look":{"g":"f","hs":"pony","hc":"#6b4a2a","skin":"#eec3a0","ht":0.95,"bw":0.9}}],"w":{"patience":0.95,"push":0.3,"fake":0.2,"flank":0.3,"calls":0.3,"lastBall":0.98,"multi":0.3,"catchFirst":0.7,"aimLow":0.9},"sync":0.15,"ab":[{"name":"NEEDLE SHOT","hook":"shot","k":{"base":"comet","aim":0.35,"acc":1.2,"speed":1.05},"sfx":"tell_needle","say":"NEEDLE SHOT!","tell":"Spines bristle and a short \"tsst\".","counter":"Jump it, then answer at once: they are rooted and cannot move to dodge.","effect":"A fast, flat, precise throw at the feet."},{"name":"DESERT BLOOM","hook":"bloom","k":{"uses":2,"acc":1.2},"sfx":"tell_bloom","say":"DESERT BLOOM!","tell":"A pink flower opens on their head.","counter":"Do not feed them catchable balls; dodge the bloomed player's next two throws.","effect":"A catcher blooms: their next 2 throws are more accurate."}],"rt":{"aware":0.66,"catch":0.76,"acc":0.7,"power":0.56,"foot":0.3,"comp":0.66},"brt":{"aware":0.8,"catch":0.88,"acc":0.84,"power":0.7,"foot":0.44,"comp":0.86},"weak":{"stat":"foot","text":"Rooted: the slowest dodgers in the bracket.","teaches":"STRATEGY 6: accuracy beats heat, a well-placed throw is enough."},"scout":"Rooted, patient snipers: jump the Needle Shot and punish right away, because they cannot dodge.","signs":["DESERT ROSE","LOOK SHARP","STAY PRICKLY"],"intro":["Straight from the desert, looking sharp... the Prickly Pears!","Auntie Agave has not moved an inch, and she does not need to!"],"taunt":"Hug a cactus, why don't you!","style":"Rooted in place, swaying like cacti in a desert wind; a flower blooms on every catch."},{"id":"duchesses-of-dodge","name":"THE DUCHESSES OF DODGE","short":"DUCHESSES OF DODGE","lvl":"hard","rank":16,"pool":"seed","who":"Drag royalty who rule the court by decree, with big arms and bigger hair.","colors":["#3A1478","#E3D6FF","#9B5CFF","#FF8CC0"],"sig":"#9B5CFF","dark":"#1E0A42","shape":"gem","crest":"<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\"><path d=\"M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z\" fill=\"#1E0A42\" stroke=\"#9B5CFF\" stroke-width=\"3\"/><g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M24 10 L36 21 L24 38 L12 21 Z\" fill=\"#9B5CFF\"/><path d=\"M12 21 H36 M19 21 L24 10 L29 21 L24 38 L19 21\" fill=\"none\" stroke=\"#1E0A42\" stroke-width=\"1.4\"/></g></svg>","emblem":"<g stroke=\"#F4EFE6\" stroke-width=\"1.6\" stroke-linejoin=\"round\" paint-order=\"stroke\"><path d=\"M24 10 L36 21 L24 38 L12 21 Z\" fill=\"#9B5CFF\"/><path d=\"M12 21 H36 M19 21 L24 10 L29 21 L24 38 L19 21\" fill=\"none\" stroke=\"#1E0A42\" stroke-width=\"1.4\"/></g>","boss":{"key":"DODGEWORTH","stage":"HER GRACE, DUCHESS DODGEWORTH","num":"1","skin":"#8f5f40","build":1.1,"shots":["comet","hook"],"look":{"g":"f","hs":"bun","hc":"#c9b6ff","skin":"#8f5f40","ht":1.08,"bw":1.06}},"players":[{"key":"TIARA","num":"2","skin":"#e9b997","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"long","hc":"#c9b6ff","skin":"#e9b997","ht":0.96,"bw":0.9}},{"key":"VELVET","num":"3","skin":"#6a4029","build":1.0,"shots":["comet","moon"],"look":{"g":"m","hs":"fade","hc":"#141010","skin":"#6a4029","ht":1.06,"bw":1.14}},{"key":"ERMINE","num":"5","skin":"#f3d2b8","build":1.0,"shots":["hook","hop"],"look":{"g":"f","hs":"bun","hc":"#e3d6ff","skin":"#f3d2b8","ht":0.95,"bw":0.9}},{"key":"SCEPTER","num":"7","skin":"#c58c66","build":1.0,"shots":["comet","hook"],"look":{"g":"m","hs":"crop","hc":"#2a1b12","skin":"#c58c66","ht":1.05,"bw":1.12}},{"key":"CONTESSA","num":"11","skin":"#5a3826","build":1.0,"shots":["comet","hook"],"look":{"g":"f","hs":"afro","hc":"#1a1210","skin":"#5a3826","ht":0.98,"bw":0.94}},{"key":"MONARCH","num":"12","skin":"#d9a481","build":1.0,"shots":["comet","hop"],"look":{"g":"m","hs":"spiky","hc":"#7a3cff","skin":"#d9a481","ht":1.02,"bw":1.04}},{"key":"VISCOUNT","num":"8","skin":"#b98a6a","build":1.0,"shots":["hook","moon"],"look":{"g":"m","hs":"curly","hc":"#3a2414","skin":"#b98a6a","ht":1.0,"bw":1.02}}],"w":{"patience":0.6,"push":0.65,"fake":0.4,"flank":0.6,"calls":0.5,"lastBall":0.85,"multi":0.6,"catchFirst":0.3,"aimLow":0.5},"sync":0.3,"ab":[{"name":"ROYAL BLOCK-AND-HOLD","hook":"royal","k":{},"sfx":"tell_gem","say":"ROYAL BLOCK!","tell":"A gem glint flashes across the held ball.","counter":"Throw at the Duchess who is NOT holding a ball, or at her feet.","effect":"A Duchess holding a ball blocks incoming throws with it and almost never drops it (two-hand grip, deflect down)."},{"name":"DECREE DOUBLE","hook":"multi","k":{"n":2,"count":24},"sfx":"tell_fan","say":"DECREE DOUBLE!","tell":"A sharp fan snap right before the release.","counter":"On the fan snap, block with a held ball or set to catch one of the two.","effect":"Two big-arm throws at one target together."}],"rt":{"aware":0.6,"catch":0.62,"acc":0.64,"power":0.8,"foot":0.4,"comp":0.58},"brt":{"aware":0.8,"catch":0.8,"acc":0.8,"power":0.94,"foot":0.56,"comp":0.84},"weak":{"stat":"foot","text":"Too regal to run: slow dodgers once their hands are empty.","teaches":"STRATEGY 4 and 7: do not throw into a held ball, wait until they are empty-handed."},"scout":"Big arms and a block that never drops: flank-then-push on the fan snap. Hit them when their hands are empty; they are slow.","signs":["ALL HAIL","CURTSY, DARLING","LONG LIVE DODGE"],"intro":["All rise for royalty! Her Grace... and the Duchesses of Dodge!","Duchess Dodgeworth has arrived, and she never, ever drops the ball, darling!"],"taunt":"Curtsy, then sit down!","style":"A slow, regal glide with gown sweeps and fan flicks. They do not run; they arrive."}];
const WK_BRACKET = {"pools":{"A":["shellebrities","rolling-pins","cosmic-cowpokes"],"B":["plus-ones","sidekicks","jazz-handlers","key-changes"],"C":["feather-weights","skate-expectations","pyramid-schemers","triple-axels"],"D":["mirror-ballers","count-downs","house-of-catch","prickly-pears"]},"seeded":"duchesses-of-dodge"};
const FACT_CARDS = [{"id":"A01","deck":"A","layout":"big","num":"20","count":20,"text":"The 2027 festival celebrates its twentieth anniversary with a weekend of sport in Las Vegas.","spot":"family-hug","vo":"A01","status":"SAFE","voSecs":4.96},{"id":"A02","deck":"A","layout":"big","num":"15","count":15,"text":"2027 marks 15 years of Sin City dodgeball, and the catches keep getting better.","spot":"catch-marquee","vo":"A02","status":"SAFE","voSecs":4.95},{"id":"A03","deck":"A","layout":"big","num":"10,000+","count":10000,"text":"The festival advertises more than 10,000 athletes and 24 sports for one fabulous weekend.","spot":"costume-parade","vo":"A03","status":"SAFE","voSecs":5.46},{"id":"A04","deck":"A","layout":"big","num":"100+","count":100,"text":"Organizers describe over a hundred teams, with past appearances from Canada, England, Australia and Denmark.","spot":"family-hug","vo":"A04","status":"SAFE","voSecs":5.95},{"id":"A05","deck":"A","layout":"big","num":"70","count":70,"text":"It all began in 2008 as a softball weekend with 70 teams.","spot":"dodge-neon","vo":"A05","status":"SAFE","voSecs":3.52},{"id":"A06","deck":"A","layout":"dyk","head":"MLK weekend","text":"Sin City dodgeball lands on MLK weekend every January. Plan your whole winter around it.","spot":"family-hug","vo":"A06","status":"SAFE","voSecs":4.13},{"id":"A07","deck":"A","layout":"quote","quote":"Your integrity is not worth a point.","text":"Hit? Hand up, walk it off.","by":"The league rulebook","spot":"honor-walk","vo":"A07","status":"SAFE","voSecs":3.65},{"id":"A08","deck":"A","layout":"dyk","head":"Catch = back in","text":"A valid catch eliminates the thrower and lets an eligible queued teammate return.","spot":"catch-marquee","vo":"A08","status":"SAFE","voSecs":4.28},{"id":"A09","deck":"A","layout":"dyk","head":"No sting","text":"The rulebook calls for soft rubber balls. Bring your best catching hands.","spot":"dodge-neon","vo":"A09","status":"SAFE","voSecs":4.54},{"id":"A10","deck":"A","layout":"quote","quote":"Put on a statement outfit and take aim.","text":"Costumes are part of the game.","by":"The festival's dodgeball page","spot":"costume-parade","vo":"A10","status":"SAFE","voSecs":3.72},{"id":"A11","deck":"A","layout":"dyk","head":"Three divisions","text":"Three divisions share the courts: Women's, Mixed No Sting, and the all-queer Remix.","spot":"family-hug","vo":"A11","status":"SAFE","voSecs":3.91},{"id":"A12","deck":"A","layout":"quote","quote":"Disco karaoke welcome party","text":"The 2026 welcome-party listing advertised disco karaoke, bringing a musical warmup to the festival weekend.","by":"From the festival's 2026 events list","spot":"disco-karaoke","vo":"A12","exp":true,"status":"SAFE","voSecs":6.27},{"id":"B02","deck":"B","layout":"dyk","head":"BEAREA 51","text":"Co-captained with Robert Rea, 2016 to 2018: bears plus Area 51 aliens.","spot":"family-hug","vo":"B02","status":"GORDON-OK","voSecs":6.0},{"id":"B05","deck":"B","layout":"quote","quote":"For one moment, my universe slowed down","text":"2017, last man on the court, 3 v 1.","by":"Gordon, January 14, 2017","spot":"dodge-neon","vo":"B05","status":"GORDON-OK","voSecs":7.87},{"id":"B07","deck":"B","layout":"quote","quote":"1 minute to spare. I can do anything.","text":"2020: an airport sprint to make the Vegas flight.","by":"Gordon, January 18, 2020","spot":"catch-marquee","vo":"B07","status":"GORDON-OK","voSecs":5.69},{"id":"B10","deck":"B","layout":"big","num":"5th","count":5,"suffix":"th","text":"Smurfin finished 5th out of 72 teams in 2023, after a #2 seed on Day 1.","spot":"costume-parade","vo":"B10","status":"GORDON-OK","voSecs":3.85},{"id":"B13","deck":"B","layout":"quote","quote":"I'm Gordon and I'm trying my best.","text":"2024, age 53. Then they won the match.","by":"Gordon, January 14, 2024","spot":"honor-walk","vo":"B13","status":"GORDON-OK","voSecs":5.54},{"id":"B14","deck":"B","layout":"big","num":"#1","count":1,"prefix":"#","text":"2025: the #1 seed after an undefeated Day 1, then a top 8 run.","spot":"catch-marquee","vo":"B14","status":"GORDON-OK","voSecs":4.04},{"id":"S01","deck":"A","layout":"dyk","head":"Thank you, Staff!","text":"Thank you, Alexandra Bustamante, Jamell Dorton, Casey Flammond, Val Horton, Jake Mason, Anh Phan, Brendan Tickner, Chris Yeh and the whole Sin City Dodgeball staff. They plan the brackets, run the courts and welcome everyone in.","spot":"staff-thanks","vo":"S01","status":"GORDON-OK","voSecs":12.17}];
// @@P2-DATA-END
// ---------------------------------------------------------------- color utils
function hex2rgb(h) { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) { const c = hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function shade(h, f) { const c = hex2rgb(h).map(v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function kitFrom(colors) {
  const c = (colors && colors.length ? colors : DEFAULT_LOOK.colors).slice();
  while (c.length < 4) c.push(c[c.length - 1]);
  const base = c[0];
  const others = [c[1], c[2], c[3]];
  let num = c[1];
  // Numbers need stronger contrast than decorative kit panels at gameplay scale.
  if (contrast(num, base) < 4.5) num = others.concat(['#fff8e8', '#151922']).sort((a, b) => contrast(b, base) - contrast(a, base))[0];
  let trim = c[1]; if (contrast(trim, base) < 1.4) trim = c[3];
  let shorts = c[1]; if (contrast(shorts, base) < 1.3) shorts = c[3];
  let accent = c[2]; if (contrast(accent, base) < 1.3) accent = c[3];
  const outline = lum(base) > 0.5 ? shade(trim, -0.35) : '#120818';
  return { base, trim, num, shorts, accent, extra: c[3], outline, all: c };
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw, q = 1) {
  // q > 1 backs the texture with a denser canvas (PC native: crowd signs and banners stay sharp at 1440p and 4K); draw code keeps logical w x h
  const cv = document.createElement('canvas'); cv.width = Math.round(w * q); cv.height = Math.round(h * q);
  const ctx = cv.getContext('2d'); if (q !== 1) ctx.scale(q, q); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = q > 1 ? 8 : 4;
  t.userData.redraw = (fn) => { fn(ctx, w, h); t.needsUpdate = true; };
  return t;
}
const DISP = "700 {s}px Teko, 'Arial Narrow', Impact, sans-serif";
function font(s) { return DISP.replace('{s}', s); }
function drawJersey(ctx, w, h, kit, name, num, boss) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = kit.base; ctx.fillRect(0, 0, w, h);
  // subtle sublimated texture: diagonal pinstripes
  ctx.save(); ctx.globalAlpha = 0.035; ctx.strokeStyle = lum(kit.base) > 0.5 ? '#000' : '#fff'; ctx.lineWidth = 3;
  for (let x = -h; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke(); }
  ctx.restore();
  // side panels at u=0.25 and 0.75
  ctx.fillStyle = kit.trim;
  for (const cx of [w * 0.25, w * 0.75]) { ctx.fillRect(cx - 22, 0, 44, h); }
  ctx.fillStyle = kit.accent;
  for (const cx of [w * 0.25, w * 0.75]) { ctx.fillRect(cx - 4, 0, 8, h); }
  // collar and hem
  ctx.fillStyle = kit.trim; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = kit.accent; ctx.fillRect(0, 14, w, 4); ctx.fillRect(0, h - 20, w, 4);
  // Fine seams and an inset collar remain in the existing jersey texture.
  ctx.strokeStyle = kit.accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
  for (const cx of [w * 0.25, w * 0.75]) { ctx.strokeRect(cx - 26, 24, 52, h - 52); }
  ctx.globalAlpha = 1;
  // back: nameplate (arched, auto-fit) and big number, centered at u = 0.5
  const cx = w * 0.5;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const nm = name.toUpperCase();
  let fs = 36; ctx.font = font(fs);
  const maxW = w * 0.34;
  let tw = ctx.measureText(nm).width;
  const sx = tw > maxW ? maxW / tw : 1;
  // arc the letters
  const arc = Math.min(0.5, nm.length * 0.035);
  ctx.save(); ctx.translate(cx, 100);
  const letters = nm.split('');
  const widths = letters.map(l => ctx.measureText(l).width * sx);
  const total = widths.reduce((a, b) => a + b, 0);
  let acc = -total / 2;
  letters.forEach((l, i) => {
    const mid = acc + widths[i] / 2; acc += widths[i];
    const t = total ? mid / (total / 2) : 0;
    ctx.save(); ctx.translate(mid, -Math.cos(t * arc * 2) * 10 + 10); ctx.rotate(t * arc * 0.35); ctx.scale(sx, 1);
    ctx.lineWidth = 5; ctx.strokeStyle = kit.outline; ctx.strokeText(l, 0, 0);
    ctx.fillStyle = kit.num; ctx.fillText(l, 0, 0); ctx.restore();
  });
  ctx.restore();
  fs = num.length > 2 ? 108 : 128; ctx.font = font(fs);
  let nw = ctx.measureText(num).width; const nsx = nw > w * 0.3 ? (w * 0.3) / nw : 1;
  ctx.save(); ctx.translate(cx, h - 25); ctx.scale(nsx, 1);
  ctx.lineWidth = 12; ctx.strokeStyle = kit.outline; ctx.strokeText(num, 0, 0);
  ctx.lineWidth = 5; ctx.strokeStyle = kit.accent; ctx.strokeText(num, 0, 0);
  ctx.fillStyle = kit.num; ctx.fillText(num, 0, 0);
  ctx.restore();
  // front (u = 0 and 1): readable chest number plus crown mark
  ctx.font = font(num.length > 2 ? 90 : 106);
  for (const fx of [0, w]) {
    ctx.lineWidth = 7; ctx.strokeStyle = kit.outline; ctx.strokeText(num, fx, h - 66);
    ctx.fillStyle = kit.num; ctx.fillText(num, fx, h - 66);
    crown(ctx, fx, 58, 18, kit.accent, kit.outline);
  }
  if (boss) { ctx.fillStyle = '#ff3fa1'; ctx.globalAlpha = 0.85; for (let i = 0; i < 9; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 18 + Math.random() * 40, 4); ctx.globalAlpha = 1; }
}
function crown(ctx, x, y, s, fill, stroke) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  ctx.moveTo(-s, s * 0.6); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.5, s * 0.1); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s, s * 0.6); ctx.closePath();
  ctx.lineWidth = Math.max(3, s * 0.18); ctx.strokeStyle = stroke; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
function drawSock(ctx, w, h, kit) {
  ctx.fillStyle = kit.base === '#ffffff' || lum(kit.base) > 0.8 ? '#ffffff' : kit.base; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = kit.trim; ctx.fillRect(0, h * 0.18, w, h * 0.16);
  ctx.fillStyle = kit.accent; ctx.fillRect(0, h * 0.42, w, h * 0.1);
  ctx.fillStyle = kit.trim; ctx.fillRect(0, h * 0.6, w, h * 0.08);
}
function radialTex(stops, size = 128) {
  return canvasTex(size, size, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col)); c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}
function starTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    const spikes = 12;
    const path = (R, r, jit) => { c.beginPath(); for (let i = 0; i < spikes * 2; i++) { const a = i / (spikes * 2) * Math.PI * 2; const rr = (i % 2 ? r : R * (1 - jit * ((i * 37) % 7) / 7)); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); };
    path(124, 52, 0.35); c.fillStyle = '#ffc83d'; c.fill();
    path(96, 40, 0.3); c.fillStyle = '#ffffff'; c.fill();
    c.lineWidth = 6; c.strokeStyle = '#ff3b2f'; path(124, 52, 0.35); c.stroke();
  });
}
function sparkleTex() {
  return canvasTex(64, 64, (c, w, h) => {
    c.translate(32, 32); c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(4, -4, 30, 0); c.quadraticCurveTo(4, 4, 0, 30); c.quadraticCurveTo(-4, 4, -30, 0); c.quadraticCurveTo(-4, -4, 0, -30); c.fill();
  });
}
function crownTex() { return canvasTex(64, 64, (c) => { crown(c, 32, 40, 30, '#ffffff', '#ffffff'); }); }
function pixelTex() { return canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; for (const [x, y] of [[8, 8], [28, 8], [48, 8], [18, 28], [38, 28], [8, 48], [28, 48], [48, 48]]) c.fillRect(x, y, 12, 12); }); }
function teamFootTex(team) {
  // the ground marker carries the team shape: a crown-notched ring for FINAL BOSS, a stepped pixel ring for the Glitches
  return canvasTex(128, 128, (c) => {
    c.strokeStyle = '#fff'; c.fillStyle = '#fff';
    if (team === 0) { c.lineWidth = 9; c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.stroke(); for (const a of [-0.55, 0, 0.55]) { const x = 64 + Math.sin(a) * 46, y = 64 - Math.cos(a) * 46; c.beginPath(); c.moveTo(x - 9, y + 4); c.lineTo(x, y - 14); c.lineTo(x + 9, y + 4); c.closePath(); c.fill(); } }
    else { const st = [[44, 14], [30, 22], [22, 30], [14, 44]]; c.lineWidth = 0; for (let k = 0; k < 4; k++) { const sx = k % 2 ? 1 : -1, sy = k < 2 ? 1 : -1; for (const [dx, dy] of st) { c.fillRect(64 + sx * dx - 5, 64 + sy * dy - 5, 10, 10); } c.fillRect(64 - 5 + sx * 48, 59, 10, 10); c.fillRect(59, 64 - 5 + sy * 48, 10, 10); } }
  });
}
function ringTex() {
  return canvasTex(128, 128, (c, w, h) => { c.strokeStyle = '#fff'; c.lineWidth = 10; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke(); });
}
function ballTex() {
  return canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#e0262b'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 2.2; c.fillStyle = Math.random() < 0.5 ? 'rgba(120,0,10,.35)' : 'rgba(255,140,140,.25)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(80,0,20,.55)'; c.fillRect(0, h / 2 - 3, w, 6);
    // Broad ivory seams make the red ball readable in motion and against the maple.
    c.fillStyle = '#fff6dc'; c.fillRect(0, h * .23, w, 6); c.fillRect(0, h * .72, w, 6);
    c.fillRect(w * .18, h / 2 - 16, 36, 8);
  });
}

// ---------------------------------------------------------------- shaders: toon rim + outline
const RIM = { color: { value: new THREE.Color('#8f5cff') }, strength: { value: 0.9 } };
const GRAD = (() => { const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
function toon(color, map) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, map: map || null });
  m.onBeforeCompile = (s) => {
    s.uniforms.rimColor = RIM.color; s.uniforms.rimStrength = RIM.strength;
    s.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
      'float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);\n outgoingLight += rimColor * rimF * rimStrength * smoothstep(0.0, 1.0, normal.y * 0.5 + 0.6);\n#include <opaque_fragment>');
  };
  return m;
}
const OUTLINE_W = { value: 0.022 };
const OUTLINE_MATS = {};
function outlineMat(col) {
  if (OUTLINE_MATS[col]) return OUTLINE_MATS[col];
  const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.uniforms.uOut = OUTLINE_W; s.vertexShader = 'uniform float uOut;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * uOut;'); };
  OUTLINE_MATS[col] = m; return m;
}
function part(geo, mat, parent, pos, outline = '#120818') {
  const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  if (outline) { const o = new THREE.Mesh(geo, outlineMat(outline)); m.add(o); }
  return m;
}

// ---------------------------------------------------------------- shared geometry
const GEO = {};
function geos() {
  if (GEO.ok) return GEO;
  GEO.torso = new THREE.CylinderGeometry(0.31, 0.25, 0.64, 16, 1); GEO.torso.translate(0, 0.32, 0);
  GEO.shorts = new THREE.CylinderGeometry(0.27, 0.29, 0.28, 14, 1); GEO.shorts.translate(0, -0.08, 0);
  GEO.head = new THREE.SphereGeometry(0.25, 18, 14);
  GEO.hair = new THREE.SphereGeometry(0.262, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  GEO.crop = new THREE.SphereGeometry(0.256, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  GEO.band = new THREE.CylinderGeometry(0.258, 0.258, 0.07, 18, 1, true);
  GEO.pony = new THREE.CapsuleGeometry(0.07, 0.22, 4, 8);
  GEO.visor = new THREE.BoxGeometry(0.42, 0.11, 0.2);
  GEO.neck = new THREE.CylinderGeometry(0.09, 0.1, 0.12, 10);
  GEO.shoulder = new THREE.SphereGeometry(0.135, 12, 10);
  GEO.upper = new THREE.CapsuleGeometry(0.085, 0.2, 4, 10); GEO.upper.translate(0, -0.15, 0);
  GEO.sleeve = new THREE.CylinderGeometry(0.11, 0.1, 0.14, 12); GEO.sleeve.translate(0, -0.06, 0);
  GEO.fore = new THREE.CapsuleGeometry(0.075, 0.18, 4, 10); GEO.fore.translate(0, -0.13, 0);
  GEO.hand = new THREE.SphereGeometry(0.09, 10, 8);
  GEO.thigh = new THREE.CapsuleGeometry(0.11, 0.2, 4, 10); GEO.thigh.translate(0, -0.18, 0);
  GEO.shin = new THREE.CapsuleGeometry(0.085, 0.22, 4, 10); GEO.shin.translate(0, -0.17, 0);
  GEO.sock = new THREE.CylinderGeometry(0.093, 0.088, 0.2, 12, 1, true); GEO.sock.translate(0, -0.25, 0);
  GEO.shoe = new THREE.BoxGeometry(0.16, 0.1, 0.3); GEO.shoe.translate(0, -0.37, 0.05);
  GEO.crown = (() => { const g = new THREE.CylinderGeometry(0.2, 0.17, 0.16, 5, 1, true); return g; })();
  GEO.cape = (() => { const g = new THREE.PlaneGeometry(0.62, 0.95, 4, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + (0.475 - y) * 0.45; p.setX(i, p.getX(i) * k); p.setZ(i, -Math.pow(p.getX(i) * 1.4, 2) * 0.25 - (0.475 - y) * 0.05); } g.translate(0, -0.47, 0); g.computeVertexNormals(); return g; })();
  GEO.ball = new THREE.SphereGeometry(0.22, 64, 40);
  GEO.plane = new THREE.PlaneGeometry(1, 1);
  GEO.ok = true; return GEO;
}

// ---------------------------------------------------------------- character

function drawWater(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2fd0e8'); g.addColorStop(1, '#1aa8d8'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; const ts = w / 8;
  for (let x = 0; x <= w; x += ts) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y <= h; y += ts) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
}
function causticTexture() {
  // tileable cellular (F2 - F1) web: bright caustic lines
  const n = 256, cells = 7, pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + Math.random()) / cells, (j + Math.random()) / cells]);
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d'); const img = c.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n; let f1 = 9, f2 = 9;
    for (const p of pts) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const dx = p[0] + ox - u, dy = p[1] + oy - v; const d = dx * dx + dy * dy; if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
    const e = Math.sqrt(f2) - Math.sqrt(f1); const k = Math.max(0, 1 - e * 22); const a = Math.pow(k, 2.2) * 255; const i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function speedTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + (i % 3) * 0.05; const r0 = 40 + (i % 4) * 8, r1 = 124 - (i % 5) * 6; const wd = 3 + (i % 3) * 2;
      c.save(); c.rotate(a); const g = c.createLinearGradient(r0, 0, r1, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.4, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(r0, 0); c.lineTo(r1, -wd); c.lineTo(r1, wd); c.closePath(); c.fill(); c.restore(); }
  });
}
function glitchGlyph(c, x, y, s, col) {
  // a pixel skull-ish glitch mark (fictional team emblem)
  const px = s / 4, rows = ['.####.', '######', '#.##.#', '######', '.#..#.', '.####.'];
  c.save(); c.translate(x - px * 3, y - px * 3); c.fillStyle = col;
  rows.forEach((r, j) => r.split('').forEach((ch, i) => { if (ch === '#') c.fillRect(i * px, j * px, px - 0.5, px - 0.5); }));
  c.restore();
}

// ---------------------------------------------------------------- hi-fi athletes (merged per-bone meshes, faces, expressions)
const APPEAR = {
  FIORE: { g: 'f', hs: 'pony', hc: '#3b2418', skin: '#e3ad88', ht: 0.95, bw: 0.9, eye: '#5a3a1a' },
  YOU: { g: 'f', hs: 'cap', hc: '#1b1210', skin: '#c68a62', ht: 0.99, bw: 0.97, eye: '#3a2412' },
  HAWKINS: { g: 'm', hs: 'curly', hc: '#3a2414', skin: '#c58c66', ht: 1.0, bw: 1.0, eye: '#4a2a12' },
  BELLAMY: { g: 'm', hs: 'crop', hc: '#141010', skin: '#6a4029', ht: 1.03, bw: 1.14, eye: '#2a1608' },
  'BELLAMY III': { g: 'm', hs: 'fade', hc: '#120c0a', skin: '#8a5a3c', ht: 1.05, bw: 1.04, eye: '#2a1608' },
  REED: { g: 'f', hs: 'long', hc: '#7a4a24', skin: '#e9b997', ht: 0.96, bw: 0.9, eye: '#4a6a3a' },
  KRAMER: { g: 'm', hs: 'spiky', hc: '#8a5a2a', skin: '#eec3a0', ht: 1.02, bw: 1.06, eye: '#3d5a7a' },
  KETCHUM: { g: 'm', hs: 'cap', hc: '#2a1a10', skin: '#d6a07a', ht: 1.01, bw: 1.02, eye: '#3a2412' },
  NERF: { g: 'm', hs: 'mohawk', hc: '#a6f23a', skin: '#b98a6a', ht: 1.0, bw: 1.02 },
  LAG: { g: 'm', hs: 'locs', hc: '#1a1210', skin: '#5e3b26', ht: 1.06, bw: 1.12 },
  PATCH: { g: 'f', hs: 'pony', hc: '#5fd3e0', skin: '#e8b996', ht: 0.95, bw: 0.9 },
  'GLITCH KING': { g: 'm', hs: 'spiky', hc: '#e8e8f0', skin: '#7a5a9a', ht: 1.0, bw: 1.18 },
  PING: { g: 'f', hs: 'afro', hc: '#1a1210', skin: '#7d5236', ht: 0.97, bw: 0.92 },
  BUG: { g: 'm', hs: 'cap', hc: '#2a1a10', skin: '#c99272', ht: 1.0, bw: 1.0 },
  CRASH: { g: 'm', hs: 'fade', hc: '#1a1210', skin: '#9a6a48', ht: 1.04, bw: 1.16 },
  SPAM: { g: 'f', hs: 'bun', hc: '#ff3fa1', skin: '#f1c7a5', ht: 0.94, bw: 0.88 },
};
const FACE_W = 512, FACE_H = 256, JERSEY_H = 272;
const WHITE_UV = [0.5, 6 / JERSEY_H];
const FACE_WHITE_UV = [3 / FACE_W, 1 - 3 / FACE_H];
const RIM_U = { color: { value: new THREE.Color('#9a6bff') }, strength: { value: 0.75 }, warm: { value: new THREE.Color('#ffb070') } };
// per-team rim light: the home side keeps the arena's warm rim, the Glitches get a cool lime edge, so the two teams separate at a glance
const RIM_T1 = { color: { value: new THREE.Color('#b6ff5a') }, strength: { value: 0.8 } };
function rimify(m, U = RIM_U) {
  m.onBeforeCompile = (s) => {
    s.uniforms.rimColor = U.color; s.uniforms.rimStrength = U.strength;
    s.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
      'float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);\noutgoingLight += rimColor * rimF * rimStrength;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'rim1';
  return m;
}
let FABRIC = null;
function fabricNormal() {
  if (FABRIC) return FABRIC;
  // athletic mesh: a grid of tiny dimples encoded as a tangent-space normal map
  const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d'); const img = c.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = (x % 8) - 3.5, cy = (y % 8) - 3.5, r = Math.hypot(cx, cy); const k = r < 2.6 ? (2.6 - r) / 2.6 : 0;
    const nx = -cx / 3.5 * k * 0.8, ny = cy / 3.5 * k * 0.8; const i = (y * n + x) * 4;
    img.data[i] = 128 + nx * 127; img.data[i + 1] = 128 + ny * 127; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  FABRIC = new THREE.CanvasTexture(cv); FABRIC.wrapS = FABRIC.wrapT = THREE.RepeatWrapping; FABRIC.repeat.set(10, 5);
  return FABRIC;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _n3 = new THREE.Matrix3();
function P(list, geo, o) {
  _e.set(...(o.rot || [0, 0, 0])); _q.setFromEuler(_e);
  _m4.compose(_v.set(...(o.pos || [0, 0, 0])), _q, _s.set(...(o.scl || [1, 1, 1])));
  list.push({ geo, m: _m4.clone(), key: o.key, uv: o.uv || 'white', uvMap: o.uvMap });
}
function mergeParts(list, whiteUV) {
  let nv = 0, ni = 0;
  for (const p of list) { nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const ranges = []; let vo = 0, io = 0;
  for (const p of list) {
    const g = p.geo, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; const cnt = pa.count;
    _n3.getNormalMatrix(p.m);
    for (let i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos.set([_v.x, _v.y, _v.z], (vo + i) * 3);
      _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize(); nor.set([_v.x, _v.y, _v.z], (vo + i) * 3);
      if (p.uv === 'own' && ua) { let u = ua.getX(i), w = ua.getY(i); if (p.uvMap) [u, w] = p.uvMap(u, w); uv[(vo + i) * 2] = u; uv[(vo + i) * 2 + 1] = w; }
      else { uv[(vo + i) * 2] = whiteUV[0]; uv[(vo + i) * 2 + 1] = whiteUV[1]; }
    }
    if (g.index) { const ia = g.index.array; for (let k = 0; k < ia.length; k++) idx[io + k] = ia[k] + vo; io += ia.length; }
    else { for (let k = 0; k < cnt; k++) idx[io + k] = vo + k; io += cnt; }
    ranges.push({ key: p.key, start: vo, count: cnt }); vo += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.userData.ranges = ranges;
  return out;
}
const _c = new THREE.Color();
function paintGeo(geo, pal) {
  const col = geo.attributes.color;
  for (const r of geo.userData.ranges) { _c.set(pal[r.key] || '#ff00ff'); for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, _c.r, _c.g, _c.b); }
  col.needsUpdate = true;
}
const HG = {};
function hifiGeos() {
  if (HG.ok) return HG;
  const lathe = (pts, seg = 44) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  HG.torsoM = lathe([[0.001, -0.03], [0.255, -0.02], [0.265, 0.1], [0.285, 0.24], [0.33, 0.4], [0.36, 0.52], [0.335, 0.6], [0.22, 0.67], [0.1, 0.705], [0.001, 0.71]]);
  HG.torsoF = lathe([[0.001, -0.03], [0.27, -0.02], [0.25, 0.12], [0.255, 0.26], [0.3, 0.4], [0.32, 0.5], [0.3, 0.6], [0.2, 0.665], [0.09, 0.7], [0.001, 0.705]]);
  HG.shorts = lathe([[0.001, 0.045], [0.26, 0.045], [0.27, -0.015], [0.26, -0.075], [0.001, -0.075]].reverse(), 32);
  // Continuous anatomical contours replace overlapping capsule bulges. Shared geometry, same merged draw calls.
  HG.upperArm = lathe([[0.001, -0.08], [0.085, -0.10], [0.092, -0.17], [0.078, -0.24], [0.068, -0.31], [0.001, -0.325]].reverse(), 20);
  HG.forearm = lathe([[0.001, 0.015], [0.075, 0], [0.086, -0.075], [0.065, -0.17], [0.053, -0.25], [0.001, -0.265]].reverse(), 20);
  HG.sph = new THREE.SphereGeometry(1, 40, 28);
  HG.sphLo = new THREE.SphereGeometry(1, 12, 9);
  HG.head = new THREE.SphereGeometry(0.27, 56, 40);
  HG.cap = (t) => new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI * t);
  HG.cyl = new THREE.CylinderGeometry(1, 1, 1, 36, 1);
  HG.cylT = new THREE.CylinderGeometry(1, 0.86, 1, 36, 1);
  HG.cap1 = new THREE.CapsuleGeometry(1, 1, 10, 28);
  HG.cone = new THREE.ConeGeometry(1, 1, 8);
  HG.box = new THREE.BoxGeometry(1, 1, 1);
  HG.crown = new THREE.CylinderGeometry(1, 0.86, 1, 5, 1);
  HG.ok = true; return HG;
}
// face drawing: expression keys neutral, focus, happy, ouch, ko, shout
function drawFace(c, a, expr) {
  const W = FACE_W, H = FACE_H, A = a.look;
  c.fillStyle = A.skin; c.fillRect(0, 0, W, H);
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 6, 6);
  const cx = W * 0.25, ey = 120, dx = 22;
  c.save(); c.translate(cx, 124); c.scale(1.48, 1.48); c.translate(-cx, -124);
  const dark = shade(A.skin, -0.55), lip = shade(A.skin, -0.32);
  // cheeks
  c.fillStyle = 'rgba(255,90,90,.16)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 30, 150, 11, 7, 0, 0, 7); c.fill(); }
  const eye = (x, s) => {
    if (expr === 'ko') { c.strokeStyle = dark; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x - 7, ey - 7); c.lineTo(x + 7, ey + 7); c.moveTo(x + 7, ey - 7); c.lineTo(x - 7, ey + 7); c.stroke(); return; }
    if (expr === 'ouch') { c.strokeStyle = dark; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 8 * s, ey - 6); c.lineTo(x + 6 * s, ey); c.lineTo(x - 8 * s, ey + 6); c.stroke(); return; }
    if (expr === 'happy') { c.strokeStyle = dark; c.lineWidth = 4; c.beginPath(); c.arc(x, ey + 4, 8, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); return; }
    const ry = expr === 'focus' ? 6.5 : 9.5;
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, ey, 8.5, ry, 0, 0, 7); c.fill();
    c.fillStyle = A.eye || '#3a2412'; c.beginPath(); c.arc(x + 1.5 * s * 0 + (expr === 'shout' ? 0 : 1), ey + 1, 5.6, 0, 7); c.fill();
    c.fillStyle = '#120808'; c.beginPath(); c.arc(x + 1, ey + 1, 2.8, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - 1.5, ey - 2.5, 1.8, 0, 7); c.fill();
    c.strokeStyle = dark; c.lineWidth = A.g === 'f' ? 3.4 : 2.4; c.beginPath(); c.ellipse(x, ey, 9, ry + 0.5, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    if (A.g === 'f') { c.beginPath(); c.moveTo(x + 8 * s, ey - 4); c.lineTo(x + 12 * s, ey - 8); c.stroke(); }
    if (expr === 'focus') { c.fillStyle = A.skin; c.fillRect(x - 10, ey - 12, 20, 6); }
  };
  eye(cx - dx, -1); eye(cx + dx, 1);
  // brows
  const bTilt = { neutral: 0, focus: 0.38, happy: -0.2, ouch: 0.15, ko: -0.25, shout: 0.3 }[expr] || 0;
  c.strokeStyle = shade(A.hc || '#2a1a10', -0.2); c.lineWidth = A.g === 'f' ? 3.5 : 5; c.lineCap = 'round';
  for (const s of [-1, 1]) { const bx = cx + s * dx; const by = (expr === 'happy' ? 98 : 102); c.beginPath(); c.moveTo(bx - 9 * s, by - bTilt * -8 * 0 + (s < 0 ? 0 : 0) + bTilt * 6); c.lineTo(bx + 10 * s, by - bTilt * 6); c.stroke(); }
  // nose shade
  c.strokeStyle = shade(A.skin, -0.25); c.lineWidth = 2.5; c.beginPath(); c.arc(cx, 140, 5, 0.2, Math.PI - 0.2); c.stroke();
  // beard (Commissioner Jake Mason) and glasses, drawn before the mouth so the smile stays on top
  if (A.beard) { c.fillStyle = A.beard; c.beginPath(); c.moveTo(cx - 44, 126); c.quadraticCurveTo(cx - 48, 192, cx, 200); c.quadraticCurveTo(cx + 48, 192, cx + 44, 126); c.quadraticCurveTo(cx + 30, 150, cx, 151); c.quadraticCurveTo(cx - 30, 150, cx - 44, 126); c.fill(); c.beginPath(); c.ellipse(cx, 152, 18, 5.5, 0, 0, 7); c.fill(); }
  if (A.specs) { c.strokeStyle = A.specs; c.lineWidth = 3.2; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * dx, ey, 14, 0, 7); c.stroke(); } c.beginPath(); c.moveTo(cx - dx + 14, ey - 2); c.lineTo(cx + dx - 14, ey - 2); c.stroke(); }
  // mouth
  const my = 162; c.lineWidth = 3.5; c.strokeStyle = dark;
  if (expr === 'happy' || expr === 'shout') {
    const w = expr === 'happy' ? 17 : 12;
    c.fillStyle = '#5a1418'; c.beginPath(); c.moveTo(cx - w, my - 3); c.quadraticCurveTo(cx, my + (expr === 'happy' ? 20 : 22), cx + w, my - 3); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(cx - w + 4, my - 3, (w - 4) * 2, 5);
    if (expr === 'happy') { c.fillStyle = '#e0606a'; c.beginPath(); c.ellipse(cx, my + 9, 7, 3.5, 0, 0, 7); c.fill(); }
  } else if (expr === 'focus') {
    c.fillStyle = '#ffffff'; c.fillRect(cx - 12, my - 4, 24, 8); c.strokeRect(cx - 12, my - 4, 24, 8); c.beginPath(); c.moveTo(cx - 12, my); c.lineTo(cx + 12, my); c.stroke();
  } else if (expr === 'ouch') {
    c.fillStyle = '#5a1418'; c.beginPath(); c.ellipse(cx, my + 2, 7, 9, 0, 0, 7); c.fill();
  } else if (expr === 'ko') {
    c.beginPath(); for (let i = 0; i <= 6; i++) c.lineTo(cx - 13 + i * 4.3, my + (i % 2 ? -3 : 3)); c.stroke();
  } else { c.strokeStyle = lip; c.lineWidth = 4; c.beginPath(); c.arc(cx, my - 10, 13, 0.35 * Math.PI, 0.65 * Math.PI); c.stroke(); }
  c.restore();
}
class Athlete {
  constructor(game, def, team) {
    this.g = game; this.def = def; this.team = team; this.key = def.key; this.name = def.label || def.key; this.num = def.num;   // key: stable id for ratings and tactics; name: what the jersey says
    this.boss = !!def.isBoss;
    const L = Object.assign({ g: 'm', hs: 'cap', hc: '#2a1a10', skin: def.skin || '#d9a07a', ht: 1, bw: 1 }, APPEAR[def.key] || {});
    if (def.look) Object.assign(L, def.look);   // weekend teams carry their own look (teams.json)
    if (def.skin && (!APPEAR[def.key] || def.open)) L.skin = def.skin;
    this.look = L;
    this.scale = CHAR * L.ht * (this.boss ? 1.22 : 1);
    this.shots = def.shots || SHOTS_BY[def.key] || ['comet', 'moon'];
    const G = hifiGeos();
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const bw = L.bw, fem = L.g === 'f', sh = fem ? 0.9 : 1;
    // canvases
    this.jerseyTex = canvasTex(512, JERSEY_H, () => { });
    this.faceTex = canvasTex(FACE_W, FACE_H, () => { });
    this.mats = {
      torso: rimify(new THREE.MeshStandardMaterial({ map: this.jerseyTex, vertexColors: true, roughness: 0.88, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.12, 0.12) }), team === 1 ? RIM_T1 : RIM_U),
      head: rimify(new THREE.MeshStandardMaterial({ map: this.faceTex, vertexColors: true, roughness: 0.78 }), team === 1 ? RIM_T1 : RIM_U),
      limb: team === 1 ? game.limbMat1 : game.limbMat,
    };
    const mk = (parts, mat, parent, white) => { const geo = mergeParts(parts, white || WHITE_UV); const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); this.geos.push(geo); return m; };
    this.geos = [];
    // hips and shorts
    this.hips = new THREE.Group(); this.hips.position.y = 0.96; this.body.add(this.hips);
    let L1 = []; P(L1, G.shorts, { scl: [bw * (fem ? 1.04 : 1), 1, 0.82], key: 'shorts' }); P(L1, G.cyl, { pos: [0, 0.115, 0], scl: [0.272 * bw, 0.03, 0.225], key: 'trim' });
    mk(L1, this.mats.limb, this.hips);
    // torso, neck, shoulder caps (jersey uses the canvas, everything else samples its white strip)
    this.torso = new THREE.Group(); this.torso.position.y = 0.06; this.hips.add(this.torso);
    const jv = (u, v) => [u, 16 / JERSEY_H + v * 256 / JERSEY_H];
    L1 = []; P(L1, fem ? G.torsoF : G.torsoM, { scl: [bw * sh, 1, 0.72], key: 'white', uv: 'own', uvMap: jv });
    P(L1, G.cyl, { pos: [0, 0.68, 0.0], scl: [0.1, 0.16, 0.1], key: 'skin' });
    P(L1, G.cyl, { pos: [0, 0.66, 0], scl: [0.135, 0.035, 0.105], key: 'trim' });
    for (const s of [-1, 1]) P(L1, G.sph, { pos: [s * 0.31 * bw * sh, 0.55, 0], scl: [0.15, 0.12, 0.14], key: 'sleeve' });
    mk(L1, this.mats.torso, this.torso);
    // head with face canvas, hair, ears, nose, band or glasses
    this.headG = new THREE.Group(); this.headG.position.y = 0.73; this.headG.scale.setScalar(0.94); this.torso.add(this.headG);
    L1 = []; P(L1, G.head, { pos: [0, 0.22, 0], scl: [1, 1.06, 1], key: 'white', uv: 'own' });
    for (const s of [-1, 1]) P(L1, G.sphLo, { pos: [s * 0.265, 0.2, -0.01], scl: [0.028, 0.06, 0.045], key: 'skin' });
    P(L1, G.sphLo, { pos: [0, 0.175, 0.272], scl: [0.03, 0.034, 0.03], key: 'skinD' });
    this.hairParts(L1, L.hs, fem);
    if (team === 1 && game.opp.visor !== false) { P(L1, G.box, { pos: [0, 0.245, 0.235], scl: [0.46, 0.085, 0.07], key: 'glass' }); for (const s of [-1, 1]) P(L1, G.box, { pos: [s * 0.075, 0.245, 0.272], scl: [0.12, 0.06, 0.012], key: 'lens' }); }
    else if (L.hs !== 'cap') P(L1, G.cyl, { pos: [0, 0.385, -0.02], rot: [-0.18, 0, 0], scl: [0.262, 0.05, 0.27], key: 'band' });
    if (this.boss && game.opp.crown !== false) P(L1, G.crown, { pos: [0, 0.52, 0], scl: [0.2, 0.17, 0.2], key: 'gold' });
    mk(L1, this.mats.head, this.headG, FACE_WHITE_UV);
    if (L.hs === 'pony') { const pl = []; P(pl, G.cap1, { pos: [0, -0.13, 0], scl: [0.07, 0.15, 0.06], key: 'hair' }); P(pl, G.cyl, { pos: [0, 0.0, 0], scl: [0.045, 0.04, 0.045], key: 'band' }); const pg = new THREE.Group(); pg.position.set(0, 0.36, -0.26); this.headG.add(pg); mk(pl, this.mats.limb, pg); this.pony = pg; }
    if (this.boss) {
      const cmat = new THREE.MeshStandardMaterial({ color: game.opp.crown === false ? shade(game.opp.sig || '#7b2ad6', -0.1) : '#7b2ad6', roughness: 0.5, side: THREE.DoubleSide, emissive: game.opp.crown === false ? shade(game.opp.dark || '#2a0a4a', -0.4) : '#2a0a4a' });
      const cg = new THREE.PlaneGeometry(0.7, 1.0, 4, 8); const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + (0.5 - y) * 0.6; p.setX(i, p.getX(i) * k); p.setZ(i, -Math.pow(p.getX(i) * 1.3, 2) * 0.3 - (0.5 - y) * 0.08); } cg.translate(0, -0.5, 0); cg.computeVertexNormals();
      this.cape = new THREE.Mesh(cg, cmat); this.cape.position.set(0, 0.64, -0.24); this.cape.rotation.x = 0.15; this.cape.castShadow = true; this.torso.add(this.cape);
    }
    // arms
    this.arm = [];
    for (const s of [-1, 1]) {
      const shg = new THREE.Group(); shg.position.set(s * 0.36 * bw * sh, 0.53, 0); this.torso.add(shg);
      L1 = []; P(L1, G.cylT, { pos: [0, -0.05, 0], scl: [0.122, 0.15, 0.118], key: 'sleeve' }); P(L1, G.cyl, { pos: [0, -0.125, 0], scl: [0.11, 0.022, 0.106], key: 'trim' });
      const am = (fem ? 0.9 : 1.08) * Math.sqrt(bw); P(L1, G.upperArm, { scl: [am, 1, am], key: 'skin' });
      mk(L1, this.mats.limb, shg);
      const el = new THREE.Group(); el.position.y = -0.31; shg.add(el);
      const fm = (fem ? 0.92 : 1.06) * Math.sqrt(bw); L1 = []; P(L1, G.forearm, { scl: [fm, 1, fm], key: 'skin' }); P(L1, G.sphLo, { scl: [0.071 * fm, 0.064, 0.071 * fm], key: 'skin' });
      P(L1, G.cyl, { pos: [0, -0.235, 0], scl: [0.064, 0.052, 0.064], key: 'band' });
      P(L1, G.sph, { pos: [0, -0.325, 0.005], scl: [0.072, 0.095, 0.045], key: 'skin' });
      P(L1, G.sphLo, { pos: [s * -0.058, -0.30, 0.012], rot: [0, 0, -s * 0.35], scl: [0.029, 0.049, 0.03], key: 'skin' });
      mk(L1, this.mats.limb, el);
      const hand = new THREE.Object3D(); hand.position.set(0, -0.34, 0.01); el.add(hand);
      this.arm.push({ sh: shg, el, hand });
    }
    // legs
    this.leg = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(s * 0.135 * bw, -0.06, 0); this.hips.add(hp);
      L1 = []; P(L1, G.cylT, { pos: [0, -0.08, 0], scl: [0.15 * (fem ? 1.04 : 1), 0.24, 0.145], key: 'shorts' }); P(L1, G.cyl, { pos: [0, -0.2, 0], scl: [0.132, 0.022, 0.128], key: 'trim' });
      P(L1, G.cap1, { pos: [0, -0.31, 0], scl: [0.11, 0.13, 0.112], key: 'skin' });
      mk(L1, this.mats.limb, hp);
      const kn = new THREE.Group(); kn.position.y = -0.46; hp.add(kn);
      L1 = []; P(L1, G.sph, { pos: [0, 0.0, 0.035], scl: [0.098, 0.105, 0.085], key: 'pad' });
      P(L1, G.cap1, { pos: [0, -0.15, 0], scl: [0.078, 0.09, 0.08], key: 'skin' }); P(L1, G.sph, { pos: [0, -0.11, -0.03], scl: [0.082, 0.12, 0.082], key: 'skin' });
      P(L1, G.cyl, { pos: [0, -0.29, 0], scl: [0.08, 0.15, 0.08], key: 'sock' }); P(L1, G.cyl, { pos: [0, -0.23, 0], scl: [0.083, 0.025, 0.083], key: 'trim' });
      P(L1, G.sph, { pos: [0, -0.37, 0.045], scl: [0.1, 0.07, 0.165], key: 'shoe' }); P(L1, G.sph, { pos: [0, -0.385, 0.155], scl: [0.09, 0.056, 0.072], key: 'shoeT' });
      P(L1, G.box, { pos: [0, -0.42, 0.05], scl: [0.2, 0.045, 0.35], key: 'sole' });
      mk(L1, this.mats.limb, kn);
      this.leg.push({ hp, kn });
    }
    this.shadow = new THREE.Mesh(GEO.plane, game.shadowMat); this.shadow.rotation.x = -Math.PI / 2; this.shadow.renderOrder = 1; game.scene.add(this.shadow);
    this.root.scale.setScalar(this.scale);
    game.scene.add(this.root);
    this.pose = this.blankPose(); this.tgt = this.blankPose();
    this.expr = ''; this.setExpr('neutral');
    this.reset();
  }
  hairParts(L1, hs, fem) {
    const G = hifiGeos(), y0 = 0.22;
    const cap = (t, r, rx = -0.28, dz = -0.015) => P(L1, G.cap(t), { pos: [0, y0, dz], rot: [rx, 0, 0], scl: [r, r * 1.04, r * 1.04], key: 'hair' });
    switch (hs) {
      case 'crop': cap(0.4, 0.276); break;
      case 'fade': cap(0.36, 0.278); P(L1, G.cap(0.2), { pos: [0, y0 + 0.08, 0], scl: [0.25, 0.14, 0.25], key: 'hair' }); break;
      case 'curly': cap(0.46, 0.285); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; P(L1, G.sphLo, { pos: [Math.cos(a) * 0.17, y0 + 0.19 + (i % 2) * 0.03, Math.sin(a) * 0.17 - 0.03], scl: [0.09, 0.08, 0.09], key: 'hair' }); } break;
      case 'afro': P(L1, G.sph, { pos: [0, y0 + 0.09, -0.05], scl: [0.37, 0.33, 0.35], key: 'hair' }); break;
      case 'rainbow': for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P(L1, G.sph, { pos: [Math.cos(a) * 0.2, y0 + 0.13 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.2 - 0.04], scl: [0.17, 0.16, 0.17], key: 'rb' + (i % 6) }); } P(L1, G.sph, { pos: [0, y0 + 0.24, -0.04], scl: [0.22, 0.17, 0.22], key: 'rb' + 2 }); break;   // the staff's rainbow wig
      case 'pony': cap(0.5, 0.285); break;
      case 'bun': cap(0.5, 0.284); P(L1, G.sph, { pos: [0, y0 + 0.23, -0.16], scl: [0.11, 0.1, 0.11], key: 'hair' }); break;
      case 'long': cap(0.52, 0.288); P(L1, G.cap1, { pos: [0, y0 - 0.12, -0.13], rot: [0.2, 0, 0], scl: [0.24, 0.14, 0.1], key: 'hair' }); break;
      case 'spiky': cap(0.44, 0.282); for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2; P(L1, G.cone, { pos: [Math.sin(a) * 0.16, y0 + 0.24 - Math.abs(a) * 0.04, Math.cos(a) * 0.04 - 0.05], rot: [-0.3, 0, -a * 0.5], scl: [0.06, 0.16, 0.06], key: 'hair' }); } break;
      case 'mohawk': cap(0.3, 0.274, -0.2); for (let i = 0; i < 6; i++) P(L1, G.cone, { pos: [0, y0 + 0.27 - Math.abs(i - 2.5) * 0.02, 0.15 - i * 0.07], rot: [-0.4 + i * 0.14, 0, 0], scl: [0.045, 0.16, 0.07], key: 'hair' }); break;
      case 'locs': cap(0.46, 0.286); for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + 0.7 * i / 8) + Math.PI; P(L1, G.cap1, { pos: [Math.cos(a) * 0.24, y0 - 0.08, Math.sin(a) * 0.24 * 0.9 - 0.02], scl: [0.035, 0.12, 0.035], key: 'hair' }); } break;
      default: // ball cap (forward) for 'cap'
        P(L1, G.cap(0.45), { pos: [0, y0 + 0.01, -0.01], rot: [-0.15, 0, 0], scl: [0.29, 0.3, 0.3], key: 'band' });
        P(L1, G.box, { pos: [0, y0 + 0.1, 0.27], rot: [0.25, 0, 0], scl: [0.3, 0.025, 0.2], key: 'band' });
    }
  }
  setExpr(e) { if (e === this.expr) return; this.expr = e; this.faceTex.userData.redraw((c) => drawFace(c, this, e)); }
  palette(kit) {
    const L = this.look;
    const base = { skin: L.skin, skinD: shade(L.skin, -0.12), hair: L.hc, white: '#ffffff', gold: '#ffc83d', rb0: '#e8333a', rb1: '#ff8a1f', rb2: '#ffd23a', rb3: '#2fb84a', rb4: '#2f7de8', rb5: '#8a3fd8' };
    if (this.team === 1 && this.g.opp.visor !== false) return Object.assign(base, { sleeve: '#17131f', trim: '#a6f23a', shorts: '#0e0b14', sock: '#17131f', band: '#a6f23a', shoe: '#a6f23a', shoeT: '#17131f', sole: '#101010', pad: '#101010', glass: '#a6f23a', lens: '#0c1418' });
    const lightBase = lum(kit.base) > 0.75;
    return Object.assign(base, { sleeve: kit.base, trim: kit.trim, shorts: kit.shorts, sock: lightBase ? '#ffffff' : kit.base, band: kit.accent, shoe: '#f4f2ee', shoeT: kit.trim, sole: lightBase ? kit.trim : '#ffffff', pad: '#1c1a20', glass: '#222', lens: '#111' });
  }
  drawKit(kit) {
    this.jerseyTex.userData.redraw((c, w, h) => { drawJersey(c, w, 256, kit, this.name, this.num, this.boss); c.fillStyle = '#ffffff'; c.fillRect(0, 256, w, 16); });
    const pal = this.palette(kit); for (const g of this.geos) paintGeo(g, pal);
  }
  blankPose() { return { lean: 0.08, twist: 0, side: 0, head: 0, hipY: 0, sh: [0.15, 0.1, 0.15, 0.1], el: [-0.5, -0.5], hp: [0, 0], kn: [0.2, 0.2], spread: [0.08, 0.08], sq: 1, roll: 0, flip: 0 }; }
  reset() {
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vh = 0;
    this.role = 'in'; this.held = null; this.oob = 0; this.backF = 0; this.qx = 0; this.qz = 0; this.forceHead = false;
    this.state = 'idle'; this.st = 0; this.ko = false;
    this.yaw = this.team === 0 ? 120 * DEG : -120 * DEG; this.runDir = 0; this.runF = 0; this.steps = 0; this.airF = 0; this.airSteps = 0; this.airPowerOK = false;
    this.catchF = -999; this.catchCool = 0; this.catchHeld = 0; this.shake = 0; this.shakeMax = 0; this.invuln = 0; this.tired = 0;
    this.ai = { t: 0, plan: null, delay: 0, press: -1, dodge: 0, dz: 0, home: null, think: 0, claimBall: null, dodgeAt: 0 };
    this.wantPower = false; this.throwType = 'normal'; this.throwTarget = null; this.passTarget = null;
    this.visible = true; this.root.visible = true; this.shadow.visible = true; this.popScale = 1;
    this.lane = null; this.knock = null; this.happyT = 0; this.pendingOut = null; this.pendWhy = null; this.rushCarry = false; this.rushThrow = false; this.xAim = null; this.noLook = false; this.ninaPlay = null;
    this.boundaryRisk = null; this.balanceNX = this.balanceNZ = 0; this.stumbleT = 0; this.outOrder = null; this.greetT = 0;
    if (this.faceTex) this.setExpr('neutral');
  }
  get infield() { return this.role === 'in'; }
  get hasBall() { return !!this.held; }
  get side() { return this.team === 0 ? -1 : 1; }
  facingVec() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  locked() { return LOCKED.has(this.state); }
  set(state) { this.state = state; this.st = 0; }
}

const NOI = { mx: 0, mz: 0, dash: 0, holdRun: false, throw: false, catch: false, catchHeld: false, jump: false, pass: false };
const DODGE_HIT = { lean: { r: 0.62, top: 1.7 }, dive: { r: 0.95, top: 0.62 }, spin: { r: 0.8, top: 1.9 }, matador: { r: 0.5, top: 1.75 }, getup: { r: 1, top: 0.9 } };
const DODGES = new Set(['lean', 'dive', 'spin', 'matador']);
const LOCKED = new Set(['lean', 'dive', 'spin', 'matador', 'getup', 'pump', 'teeter', 'stagger', 'balance', 'windup', 'release', 'recover', 'catch', 'bobble', 'hitstun', 'knock', 'down', 'getup', 'ko', 'tired', 'squat', 'land', 'walkin', 'drop', 'pwind', 'prel', 'prec', 'block']);

// ---------------------------------------------------------------- editions (PC native and Mobile native are two builds; the picker routes between them)
const ED_KEY = 'fbg-edition';
const ED_URLS = { pc: 'https://gordonusc.github.io/final-boss-pc/play/', mobile: 'https://gordonusc.github.io/final-boss/play/' };
function readEd() { try { const v = localStorage.getItem(ED_KEY); return v === 'pc' || v === 'mobile' ? v : null; } catch (e) { return null; } }
function saveEd(v) { try { localStorage.setItem(ED_KEY, v); } catch (e) { } }
function guessEdition() {
  // a mouse or trackpad on a laptop-or-larger screen suggests PC; touch-first or a small screen suggests Mobile
  const mm = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const fine = mm('(pointer: fine)'), coarse = mm('(pointer: coarse)');
  const big = Math.min(screen.width || 0, screen.height || 0) >= 700 && Math.max(screen.width || 0, screen.height || 0) >= 1000;
  return fine && !coarse && big ? 'pc' : 'mobile';
}
function readSnd() { try { return localStorage.getItem('fbg-sound'); } catch (e) { return null; } }
// Gordon 2026-10-26: "IN FIELD MOVEMENT" moves you relative to the court as you face the other team: W toward the center line,
// A your left, D your right, S back toward your own back line (S confirmed by Gordon). Arrow keys follow the same scheme. STANDARD stays the default.
const KM_KEY = 'fbg-keys';
function readKM() { try { return localStorage.getItem(KM_KEY) === 'infield' ? 'infield' : 'standard'; } catch (e) { return 'standard'; } }
function saveKM(v) { try { localStorage.setItem(KM_KEY, v === 'infield' ? 'infield' : 'standard'); } catch (e) { } }
function saveSnd(v) { try { localStorage.setItem('fbg-sound', v ? 'on' : 'off'); } catch (e) { } }

// ---------------------------------------------------------------- audio
class Sfx {
  constructor() { this.on = false; this.ctx = null; }
  enable(v) { this.on = v; if (!v && this.mus) { try { this.mus.s.stop(); } catch (e) { } this.mus = null; this.musName = null; } if (v && !this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); this.noiseBuf = this.makeNoise(); } catch (e) { this.on = false; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  makeNoise() { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.5, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  // synthesized tones and noise are retired (2026-10-26): every sound is an ElevenLabs or Kenney sample; WebAudio only mixes
  tone() { }
  noise() { }
  _toneRetired(type, f0, f1, dur, vol = 0.3, delay = 0) {
    if (!this.on || !this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  _noiseRetired(dur, f0, f1, q = 1, vol = 0.3, delay = 0, type = 'bandpass') {
    if (!this.on || !this.ctx) return; const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  _throw(p) { this.noise(p ? 0.45 : 0.22, p ? 500 : 900, p ? 4000 : 2400, 2, p ? 0.5 : 0.3); if (p) this.tone('sawtooth', 220, 880, 0.4, 0.08); }
  _hit(p) { this.tone('sine', p ? 150 : 190, 45, p ? 0.35 : 0.2, 0.7); this.noise(0.12, 1800, 300, 0.8, 0.5); }
  _catch() { this.tone('square', 660, 990, 0.08, 0.18); this.tone('square', 990, 1320, 0.1, 0.14, 0.06); this.noise(0.06, 3000, 2000, 1, 0.25); }
  bobble() { this.smp('catch', 0.5, 0.8); }
  _crowd(big) { this.noise(big ? 1.4 : 0.9, 600, 1400, 0.4, big ? 0.35 : 0.2); }
  _step() { this.tone('sine', 120, 80, 0.04, 0.12); }
  ko() { this.smp('ko_sting', 0.55); }
  _buzz() { this.tone('square', 140, 120, 0.7, 0.18); }
  tick() { this.smp('ui_move', 0.35); }
  _roar(l = 1) {
    this.noise(0.9 + 1.6 * l, 520, 1300, 0.5, 0.18 + 0.2 * l); this.noise(0.8 + 1.2 * l, 160, 240, 0.7, 0.12 * l, 0, 'lowpass');
    for (let k = 0; k < Math.round(l * 3); k++) this.tone('sine', 1800 + Math.random() * 500, 2500 + Math.random() * 400, 0.3, 0.04, 0.15 + k * 0.32);
    for (let i = 0; i < Math.round(10 * l); i++) this.noise(0.05, 2100, 1500, 1.3, 0.14, 0.1 + Math.random() * (0.6 + l));
  }
  _groan(l = 1) { this.noise(0.6 + 1.2 * l, 640, 190, 0.6, 0.1 + 0.18 * l); this.tone('sawtooth', 200, 125, 0.4 + 0.9 * l, 0.03); }
  _ooh() { this.noise(0.9, 300, 950, 0.8, 0.2); }
  _chant() { for (const r of [0, 1.2]) for (const t of [0, 0.3, 0.6, 0.78, 0.96]) this.noise(0.06, 2300, 1600, 1.4, 0.3, r + t); }
  // ---- recorded audio (ElevenLabs + Kenney CC0), loaded from assets/audio/ once sound is on; the synth versions above are the fallback
  ensure() {
    if (this.loading || !this.ctx || !this.base) return; this.loading = true; this.buf = this.buf || {};
    const C = this.ctx;
    this.sfxBus = C.createGain(); this.sfxBus.connect(this.master);
    this.bedBus = C.createGain(); this.bedBus.connect(this.master);
    this.vBus = C.createGain(); this.vBus.gain.value = 1.15; this.vBus.connect(this.master);
    const names = ['crowd_bed', 'crowd_hype', 'crowd_roar', 'crowd_groan', 'crowd_ooh', 'crowd_chant', 'hit', 'catch', 'throw', 'whistle', 'buzzer', 'squeak', 'bounce',
      'ui_move', 'ui_select', 'ui_back', 'big_hit', 'ko_sting', 'vo_choose', 'vo_pc', 'vo_mobile', 'vo_ko', 'vo_boss',
      'vo_three', 'vo_two', 'vo_one', 'tick_3', 'tick_2', 'tick_1', 'call_fb', 'call_gl', 'vo_double', 'vo_triple', 'vo_save', 'vo_mo1', 'vo_mo2', 'vo_mo3', 'vo_mo4', 'deflect_pop', 'ball_left_1', 'ball_left_2', 'ball_left_3', 'ball_right_1', 'ball_right_2', 'ball_right_3',
      'vo_open', 'vo_rps', 'vo_ready', 'vo_set', 'vo_go', 'vo_next', 'vo_catch', 'vo_headshot', 'vo_tide', 'vo_opptide', 'vo_lead', 'vo_point_fb', 'vo_point_gl', 'vo_phase2', 'vo_ot', 'vo_win', 'vo_lose', 'vo_clutch', 'vo_falsestart'];
    for (let i = 0; i < 5; i++) names.push('k_hit' + i, 'k_power' + i, 'k_step' + i, 'k_bounce' + i);
    setTimeout(() => this.flushWant(), 0);
    for (const n of names) {
      fetch(this.base + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(ab => { if (ab) C.decodeAudioData(ab, b => { this.buf[n] = b; }, () => {}); }).catch(() => {});
    }
  }
  smp(n, vol = 1, rate = 1, delay = 0, bus) {
    if (!this.on || !this.ctx) return null; this.ensure();
    const b = this.buf && this.buf[n]; if (!b) return null;
    const C = this.ctx, s = C.createBufferSource(), g = C.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(bus || this.sfxBus); s.start(C.currentTime + delay); return s;
  }
  any(prefix, vol, rate) { return this.smp(prefix + ((Math.random() * 5) | 0), vol, rate * (0.94 + Math.random() * 0.12)); }
  vo(n, prio = 1) {
    // one announcer line at a time; a higher-priority call may talk over a lower one; the crowd ducks under the voice
    if (!this.on || !this.ctx) return; const now = this.ctx.currentTime;
    if (now < (this.voUntil || 0) && prio <= (this.voPrio || 0)) return;
    const s = this.smp(n, 1, 1, 0, this.vBus); if (!s) return;
    const d = s.buffer.duration; this.voUntil = now + d; this.voPrio = prio;
    if (this.onVo) this.onVo(n);
    this.bedBus.gain.cancelScheduledValues(now); this.bedBus.gain.setTargetAtTime(0.4, now, 0.04); this.bedBus.gain.setTargetAtTime(1, now + d, 0.35);
    if (this.musBus) { this.musBus.gain.cancelScheduledValues(now); this.musBus.gain.setTargetAtTime(0.14, now, 0.05); this.musBus.gain.setTargetAtTime(0.3, now + d, 0.4); }
  }
  mood(m, e, live) {
    // crowd beds: a steady murmur that swells with excitement, plus a cheering loop that rises with a happy crowd
    if (!this.ctx) return;
    const want = this.on && live && this.buf && this.buf.crowd_bed && this.buf.crowd_hype;
    if (want && !this.beds) {
      const C = this.ctx; this.beds = ['crowd_bed', 'crowd_hype'].map(n => { const s = C.createBufferSource(), g = C.createGain(); s.buffer = this.buf[n]; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(this.bedBus); s.start(); return { s, g }; });
    }
    if (!want && this.beds) { const t = this.ctx.currentTime; for (const b of this.beds) { b.g.gain.setTargetAtTime(0, t, 0.2); b.s.stop(t + 1.2); } this.beds = null; }
    if (!this.beds) return;
    const t = this.ctx.currentTime, up = Math.max(0, m), dn = Math.max(0, -m);
    this.beds[0].g.gain.setTargetAtTime(0.55 + 0.35 * e - 0.25 * dn, t, 0.3);
    this.beds[1].g.gain.setTargetAtTime(Math.min(0.85, up * (0.25 + 0.75 * e)), t, 0.35);
  }
  throw(p) { if (this.smp('throw', p ? 0.95 : 0.6, p ? 0.82 : 1 + Math.random() * 0.12)) { if (p) this.tone('sawtooth', 220, 880, 0.4, 0.04); } else this._throw(p); }
  hit(p) { if (this.any(p ? 'k_power' : 'k_hit', p ? 1 : 0.8, p ? 0.9 : 1)) { this.smp('hit', p ? 0.9 : 0.55, p ? 0.85 : 1.05); } else this._hit(p); }
  catch() { if (!this.smp('catch', 0.95, 0.97 + Math.random() * 0.08)) this._catch(); }
  crowd(big) { if (!this.smp('crowd_roar', big ? 0.9 : 0.5)) this._crowd(big); }
  step() { if (!this.any('k_step', 0.22, 1.1)) this._step(); }
  buzz() { if (!this.smp('buzzer', 0.75)) this._buzz(); }
  roar(l = 1) { if (!this.smp('crowd_roar', 0.45 + 0.5 * l)) this._roar(l); }
  groan(l = 1) { if (!this.smp('crowd_groan', 0.35 + 0.55 * l)) this._groan(l); }
  ooh() { if (!this.smp('crowd_ooh', 0.75)) this._ooh(); }
  chant() { if (!this.smp(this.buf && this.buf.crowd_fb_chant && Math.random() < 0.5 ? 'crowd_fb_chant' : 'crowd_chant', 0.8)) this._chant(); }
  whistle() { this.smp('whistle', 0.35, 1 + Math.random() * 0.05); }
  squeak() { const t = this.ctx ? this.ctx.currentTime : 0; if (t - (this.lastSq || 0) < 0.25) return; this.lastSq = t; this.smp('squeak', 0.4, 0.9 + Math.random() * 0.25); }
  bounce(k) { const t = this.ctx ? this.ctx.currentTime : 0; if (t - (this.lastBn || 0) < 0.05) return; this.lastBn = t; if (!this.any('k_bounce', 0.25 + 0.5 * k, 1.15)) this.smp('bounce', 0.3 + 0.5 * k); }
  stinger() { this.smp('ui_select', 0.8); }
  ui(n) { this.smp('ui_' + n, n === 'move' ? 0.45 : 0.8); }
  bigHit() { this.smp('big_hit', 0.85); }
  unlock() {
    // iOS: create and resume the context inside the first tap, and play one silent frame so later sounds are allowed
    try {
      if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.unlocked = true;
    } catch (e) { }
  }
  music(name) {
    // one music loop at a time (menu or match), streamed in only when sound is on; crossfades and ducks under the announcer
    this.wantMusic = name;
    if (!this.on || !this.ctx || !this.base) return;
    const C = this.ctx;
    if (!this.musBus) { this.musBus = C.createGain(); this.musBus.gain.value = 0.3; this.musBus.connect(this.master); }
    if (this.musName === name) return;
    const t = C.currentTime;
    if (this.mus) { const o = this.mus; o.g.gain.setTargetAtTime(0, t, 0.25); try { o.s.stop(t + 1.5); } catch (e) { } this.mus = null; }
    this.musName = name; if (!name) return;
    this.buf = this.buf || {};
    const go = (b) => { if (this.musName !== name || !this.on) return; const s = C.createBufferSource(), g = C.createGain(); s.buffer = b; s.loop = true;
      // exact bar lengths, so MP3 padding never leaves a gap in Safari
      const L = { music_menu: 30.0, music_match: 46.286, music_weekend: 43.279 }[name]; if (L && b.duration > L) { s.loopStart = 0; s.loopEnd = L; } g.gain.value = 0; s.connect(g); g.connect(this.musBus); s.start(); g.gain.setTargetAtTime(1, C.currentTime, 0.4); this.mus = { s, g }; };
    if (this.buf[name]) return go(this.buf[name]);
    fetch(this.base + name + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(ab => { if (ab) C.decodeAudioData(ab, b => { this.buf[name] = b; go(b); }, () => { }); }).catch(() => { });
  }
}

// ---------------------------------------------------------------- the game
class Game {
  constructor(el, opts) {
    this.opts = Object.assign({ mode: 'fb', difficulty: 'normal', sound: false, look: null, control: 'BELLAMY', basePath: BASE }, opts || {});
    this.base = this.opts.basePath;
    this.ruleRandom = Math.random; // Replace only in deterministic scenario tests; no per-frame rerolls.
    this.el = el;
    this.rm = this.opts.reducedMotion != null ? !!this.opts.reducedMotion : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.level = AI_LEVEL[this.opts.difficulty] || AI_LEVEL.normal;
    this.look = this.opts.look || DEFAULT_LOOK; this.mode = this.opts.mode === 'vc' ? 'vc' : 'fb';
    this.controlKey = rosterKey(this.opts.player) || rosterKey(this.opts.control) || 'BELLAMY';
    this.squad = ROSTER.map(r => r.key);
    this.opp = oppFrom(this.opts.opponent);   // data-driven opponent (teams.json); THE GLITCHES by default
    this.sfx = new Sfx(); this.sfx.base = this.base + 'assets/audio/';
    // QA ring buffer: countdown and announcer events with sim time, so automated playtests can measure timing
    this.qa = []; this.qaLog = (ev, o) => { this.qa.push(Object.assign({ ev, frame: this.frame, ctlT: +(this.ctlT || 0).toFixed(3), ms: Math.round(performance.now()) }, o || {})); if (this.qa.length > 80) this.qa.shift(); };
    this.sfx.onVo = (n) => this.qaLog('vo', { n });
    this.keys = {}; this.edge = {}; this.lastTap = { dir: 0, f: -99 }; this.km = readKM();
    this.touch = { mx: 0, mz: 0, run: false, btn: {} };
    this.frame = 0; this.phase = 'title'; this.paused = false; this.visible = true; this.hitstop = 0;
    this.shakeAmp = 0; this.shakeF = 0; this.shakeMax = 1; this.fever = false;
    this.fx = []; this.queue = [[], []]; this.rushT = 999;
    this.stats = { hits: 0, catches: 0, power: 0, kos: 0, bestCombo: 0, headshots: 0, backIn: 0, blocks: 0 };
    // PC native: a page opts in with { native: true }; it only takes effect with a fine pointer (mouse or trackpad), never on touch
    const finePtr = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);
    this.native = !!this.opts.native && finePtr && !this.opts.touch;
    this.edition = this.opts.edition === 'mobile' ? 'mobile' : 'pc'; // this build is the PC native edition
    this.edUrls = Object.assign({}, ED_URLS, this.opts.editions || {});
    this.mobile = this.edition === 'mobile' && (!finePtr || !!this.opts.touch || !!(window.matchMedia && matchMedia('(pointer: coarse)').matches));
    this.texQ = this.native ? 2 : 1; this.full = false; this.rs = 1; this.dts = [];
    this.buildDOM();
    if (this.km === 'infield') this.setKM('infield');
    if (!this.initGL()) return;
    this.buildWorld();
    this.buildStands();
    this.makeBalls();
    this.buildTeams();
    this.applyLook(this.look);
    this.applyMode(this.mode);
    this.bindInput();
    this.resetMatch();
    this.showTitle();
    if (this.wantPicker()) this.showPicker();
    this.last = performance.now(); this.acc = 0;
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    if (document.fonts && document.fonts.load) {
      const redo = () => { if (this.dead) return; this.applyLook(this.look); this.drawBanner(); };
      Promise.all([document.fonts.load(font(60)), document.fonts.load("600 14px 'Chakra Petch'"), document.fonts.load("40px 'Permanent Marker'"), document.fonts.load('60px Yellowtail')]).then(redo).catch(() => { });
      let fq = 0; document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { clearTimeout(fq); fq = setTimeout(redo, 120); });
      setTimeout(redo, 2500);
    }
  }

  buildDOM() {
    if (EMBED_CSS && !document.querySelector('[data-fbg-css]')) {
      const st = document.createElement('style'); st.dataset.fbgCss = '1'; st.textContent = EMBED_CSS; document.head.appendChild(st);
    } else if (!document.querySelector('[data-fbg-css]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = this.base + 'game.css'; l.dataset.fbgCss = '1'; document.head.appendChild(l);
    }
    if (!document.querySelector('link[href*="Permanent+Marker"]')) {
      const f3 = document.createElement('link'); f3.rel = 'stylesheet'; f3.href = 'https://fonts.googleapis.com/css2?family=Knewave&display=swap'; document.head.appendChild(f3);
      const f2 = document.createElement('link'); f2.rel = 'stylesheet'; f2.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Yellowtail&display=swap'; document.head.appendChild(f2);
    }
    if (!document.querySelector('link[href*="family=Archivo"]')) {
      const fa = document.createElement('link'); fa.rel = 'stylesheet'; fa.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800;125,900&display=swap'; document.head.appendChild(fa);
    }
    if (!document.querySelector('link[href*="family=Teko"]')) {
      const f = document.createElement('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Chakra+Petch:wght@400;600;700&display=swap'; document.head.appendChild(f);
    }
    const r = document.createElement('div'); r.className = 'fbg-root'; this.root = r;
    r.innerHTML = `
<div class="fbg-stage" tabindex="0" role="application" aria-label="Boss Rush dodgeball game. Keyboard or touch controls.">
  <canvas class="fbg-canvas" aria-hidden="true"></canvas>
  <div class="fbg-vignette"></div>
  <div class="fbg-world"></div>
  <div class="fbg-flash"></div>
  <div class="fbg-hud">
    <div class="fbg-team l"><div class="fbg-tname"><span class="fbg-crest">${CREST_FB}</span><span>FINAL BOSS</span></div><div class="fbg-live" data-t="0"></div><i class="fbg-mom" aria-hidden="true"><b class="m0"></b></i><div class="fbg-q" data-t="0"></div></div>
    <div class="fbg-mid"><div class="fbg-games"><b class="fbg-g0">0</b><div class="fbg-clock">3:00</div><b class="fbg-g1">0</b></div><div class="fbg-sub">GAME 1</div><div class="fbg-score">0</div></div>
    <div class="fbg-team r"><div class="fbg-tname"><span>${this.opp.name}</span><span class="fbg-crest g">${CREST_GL}</span></div><div class="fbg-live" data-t="1"></div><i class="fbg-mom" aria-hidden="true"><b class="m1"></b></i><div class="fbg-q" data-t="1"></div></div>
  </div>
  <div class="fbg-crowd" aria-hidden="true"><span>CROWD WATCHING</span><i><b></b></i></div>
  <div class="fbg-ctl" hidden></div>
  <div class="fbg-bossbar"><span>GLITCH KING</span><i></i></div>
  <div class="fbg-coach" aria-live="polite"><i class="fbg-coach-c" aria-hidden="true"></i><span>COACH FIORE</span><b></b></div>
  <div class="fbg-next" aria-live="polite" hidden></div>
  <div class="fbg-cd" hidden aria-hidden="true"><div class="fbg-cd-disc"><b class="fbg-cd-n"></b></div><span class="fbg-cd-t"></span></div>
  <div class="fbg-meter"><b>DASH</b><div class="fbg-steps"></div><span class="fbg-mhint"></span></div>
  <div class="fbg-keys" aria-hidden="true"><span class="fbg-kmkeys"><i>WASD</i>Move</span><span class="k-throw"><i>J</i><i class="m">LMB</i>Throw</span><span class="k-catch"><i>K</i><i class="m">RMB</i>Catch</span><span class="k-dash"><i>U</i>Dash</span><span><i>L</i>Jump</span><span class="k-pass"><i>Shift</i><i>E</i>Pass</span><span><i>Q</i>Switch</span><span><i>Esc</i>Time out</span><span><i>M</i>Menu</span></div>
  <div class="fbg-btns"><button class="fbg-btn ghost fbg-qual" type="button">Quality: Auto</button><button class="fbg-btn ghost fbg-menu" type="button" hidden>Menu <span class="fbg-kbd">M</span></button><button class="fbg-btn ghost fbg-sound" type="button" aria-pressed="false">Sound off</button><button class="fbg-btn ghost fbg-pause" type="button">Time out</button></div>
  <div class="fbg-vs" hidden></div>
  <div class="fbg-poster"><p>Boss Rush needs WebGL. This is a still from the game.</p></div>
  <div class="fbg-sr" aria-live="polite"></div>
  <div class="fbg-rotate" hidden role="dialog" aria-label="Turn your phone sideways"><div class="fbg-rot-card"><i class="fbg-rot-phone" aria-hidden="true"></i><b>TURN IT SIDEWAYS</b><span>Boss Rush plays best in landscape: the whole court, thumbs on both sides.</span><button type="button" class="fbg-btn ghost fbg-rot-tall">Play tall anyway</button></div></div>
</div>
<div class="fbg-touch" aria-label="Touch controls">
  <div class="fbg-stickzone"><div class="fbg-stick"><div class="fbg-knob"></div></div></div>
  <button class="fbg-tb dash" data-b="sprint" type="button" aria-label="Dash, hold">DASH</button>
  <div class="fbg-tbtns">
    <button class="fbg-tb catch" data-b="catch" type="button">CATCH</button>
    <button class="fbg-tb throw" data-b="throw" type="button">THROW</button>
    <button class="fbg-tb" data-b="pass" type="button">PASS</button>
    <button class="fbg-tb" data-b="jump" type="button">JUMP</button>
  </div>
  <button class="fbg-tb sw" data-b="switch" type="button" aria-label="Switch player">SWITCH</button>
</div>
<div class="fbg-ov" hidden><div class="fbg-card"></div></div>`;
    this.el.appendChild(r);
    const q = (s) => r.querySelector(s);
    this.$ = { stage: q('.fbg-stage'), canvas: q('.fbg-canvas'), world: q('.fbg-world'), flash: q('.fbg-flash'), clock: q('.fbg-clock'), score: q('.fbg-score'), crowd: q('.fbg-crowd'), crowdL: q('.fbg-crowd span'), crowdB: q('.fbg-crowd b'),
      looknm: q('.fbg-looknm') || document.createElement('div'), chip: q('.fbg-chip'), l0: q('.fbg-live[data-t="0"]'), l1: q('.fbg-live[data-t="1"]'), q0: q('.fbg-q[data-t="0"]'), q1: q('.fbg-q[data-t="1"]'),
      mom0: q('.fbg-mom .m0'), mom1: q('.fbg-mom .m1'), g0: q('.fbg-g0'), g1: q('.fbg-g1'), sub: q('.fbg-sub'), ctl: q('.fbg-ctl'), boss: q('.fbg-bossbar'), bossI: q('.fbg-bossbar i'),
      meter: q('.fbg-meter'), meterB: q('.fbg-meter b'), mhint: q('.fbg-mhint'), steps: q('.fbg-steps'), vs: q('.fbg-vs'), ov: q('.fbg-ov'), card: q('.fbg-card'), sound: q('.fbg-sound'), qual: q('.fbg-qual'), pause: q('.fbg-pause'), sr: q('.fbg-sr'),
      poster: q('.fbg-poster'), coach: q('.fbg-coach'), coachB: q('.fbg-coach b'), cd: q('.fbg-cd'), cdN: q('.fbg-cd-n'), cdT: q('.fbg-cd-t'), touch: q('.fbg-touch'), knob: q('.fbg-knob'), stick: q('.fbg-stick'), keys: q('.fbg-keys'), menu: q('.fbg-menu') };
    this.$.poster.style.backgroundImage = `url(${assetURL(this.base, 'poster.jpg')})`;
    for (let i = 1; i <= 9; i++) { const c = document.createElement('i'); this.$.steps.appendChild(c); }
    if (this.rm) r.classList.add('rm');
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse || this.opts.touch) r.classList.add('has-touch');
    if (this.native) { r.classList.add('is-native'); this.$.menu.hidden = false; this.$.qual.hidden = true; }
    r.classList.add('ed-' + this.edition);
    if (this.mobile) {
      // Mobile native: no page scroll or pinch zoom inside the game, and the first tap unlocks audio on iOS
      r.classList.add('is-mobile'); this.$.qual.hidden = true;
      const stop = (e) => { if (e.cancelable) e.preventDefault(); };
      r.addEventListener('gesturestart', stop); r.addEventListener('dblclick', stop);
      r.addEventListener('touchmove', (e) => { if (!(e.target.closest && e.target.closest('.fbg-card'))) stop(e); }, { passive: false });
      try { this.tallOK = sessionStorage.getItem('fbg-tall') === '1'; } catch (e) { }
      r.querySelector('.fbg-rot-tall').addEventListener('click', () => { this.tallOK = true; try { sessionStorage.setItem('fbg-tall', '1'); } catch (e) { } this.checkRotate(); });
    }
    this.onFirstTap = () => { this.sfx.unlock(); r.removeEventListener('pointerdown', this.onFirstTap, true); };
    r.addEventListener('pointerdown', this.onFirstTap, true);
    if (this.opts.fill) r.classList.add('is-fill');
    // settings buttons live inside whichever card is open (title, menu, results); one delegated handler serves them all
    this.$.card.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-q],[data-d],[data-km]'); if (!b) return;
      if (b.dataset.km) this.setKM(b.dataset.km);
      else if (b.dataset.q) this.setQuality(b.dataset.q);
      else if (b.dataset.d === 'full') this.setFull(!this.full);
      else if (b.dataset.d === 'fs') this.toggleFullscreen();
      this.syncMenu();
    });
    this.$.menu.addEventListener('click', () => { if (this.paused) this.resume(); else this.pause('menu'); });
    this.onFs = () => { this.syncMenu(); if (!(document.fullscreenElement || document.webkitFullscreenElement)) this.$.stage.focus({ preventScroll: true }); };
    document.addEventListener('fullscreenchange', this.onFs); document.addEventListener('webkitfullscreenchange', this.onFs);
    this.$.sound.addEventListener('click', () => this.toggleSound());
    this.$.qual.addEventListener('click', () => { const order = ['auto', 'ultra', 'high', 'med', 'low']; this.setQuality(order[(order.indexOf(this.qMode) + 1) % 5]); });
    this.$.pause.addEventListener('click', () => { if (this.phase === 'title' || this.phase === 'result') return; this.paused ? this.resume() : this.pause(); });
  }
  settingsHTML() {
    if (!this.native) return '';
    const q = (k, n) => `<button type="button" class="fbg-sb" data-q="${k}" aria-pressed="${this.qMode === k}">${n}</button>`;
    return `<div class="fbg-set"><div class="fbg-seg" role="group" aria-label="Quality"><span>Quality</span>${q('auto', 'Auto')}${q('high', 'High')}${q('ultra', 'Ultra')}</div>
      <div class="fbg-seg fbg-kmseg" role="group" aria-label="Keyboard movement"><span>Keys</span><button type="button" class="fbg-sb" data-km="standard" aria-pressed="${this.km !== 'infield'}">STANDARD</button><button type="button" class="fbg-sb" data-km="infield" aria-pressed="${this.km === 'infield'}">IN FIELD MOVEMENT</button></div>
      <div class="fbg-seg" role="group" aria-label="Display"><span>Display</span><button type="button" class="fbg-sb" data-d="full"></button><button type="button" class="fbg-sb" data-d="fs"></button></div>
      <p class="fbg-setnote"></p></div>`;
  }
  kmAxes(a, k) {
    // world move from the keys: STANDARD follows the screen; IN FIELD MOVEMENT follows the court as this player faces the other team
    if (this.km !== 'infield') return { mx: (k.right ? 1 : 0) - (k.left ? 1 : 0), mz: (k.down ? 1 : 0) - (k.up ? 1 : 0), run: !!(k.left || k.right) };
    const side = a ? a.side : -1, fwd = (k.up ? 1 : 0) - (k.down ? 1 : 0), lat = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    // facing the other team, forward is -side in x; your left is +side in z (FINAL BOSS faces +x, so its left is -z)
    return { mx: fwd * -side, mz: lat * side, run: !!(k.up || k.down) };
  }
  kmLine() { return this.km === 'infield' ? 'IN FIELD MOVEMENT: <span class="fbg-kbd">W</span> toward the center line, <span class="fbg-kbd">A</span> left, <span class="fbg-kbd">D</span> right, <span class="fbg-kbd">S</span> back (arrows too)' : '<span class="fbg-kbd">Arrows</span> or <span class="fbg-kbd">WASD</span> move'; }
  kmHow() { return 'IN FIELD MOVEMENT is on: you move as you face the other team. W or Up runs toward the center line, A or Left moves to your left on the court, D or Right to your right, S or Down back toward your own back line. Double-tap W to dash at the line.'; }
  setKM(v) {
    this.km = v === 'infield' ? 'infield' : 'standard'; saveKM(this.km);
    this.root.querySelectorAll('.fbg-kmtext').forEach(el => { el.innerHTML = this.kmLine(); });
    this.root.querySelectorAll('.fbg-kmp').forEach(el => { el.hidden = this.km !== 'infield'; el.innerHTML = this.kmHow(); });
    const kk = this.root.querySelector('.fbg-kmkeys'); if (kk) kk.innerHTML = this.km === 'infield' ? '<i>W</i>Center <i>A</i><i>D</i>Left/Right <i>S</i>Back' : '<i>WASD</i>Move';
    this.qaLog('km', { km: this.km }); this.syncMenu();
  }
  syncMenu() {
    const c = this.$ && this.$.card; if (!c || !this.native) return;
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    c.querySelectorAll('[data-q]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === this.qMode)));
    c.querySelectorAll('[data-km]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.km === this.km)));
    c.querySelectorAll('[data-d="full"]').forEach(b => { b.textContent = this.full ? 'Back to the page' : 'Full window'; });
    c.querySelectorAll('[data-d="fs"]').forEach(b => { b.setAttribute('aria-pressed', String(fs)); b.innerHTML = (fs ? 'Exit fullscreen' : 'Fullscreen') + ' <span class="fbg-kbd">F</span>'; });
    const n = c.querySelector('.fbg-setnote'), cv = this.$.canvas;
    if (n && cv) { const dev = window.devicePixelRatio || 1; n.textContent = `Drawing ${cv.width} x ${cv.height} for a ${Math.round(this.W * dev)} x ${Math.round(this.H * dev)} view. ${this.qMode === 'auto' ? 'Auto is on ' + this.tier + (this.rs < 1 ? ' at ' + Math.round(this.rs * 100) + '% scale' : '') + ' and adapts to hold 60 fps.' : this.tier[0].toUpperCase() + this.tier.slice(1) + ' is fixed.'}`; }
  }
  setFull(on) {
    // full window: the arena takes the whole browser window like a desktop game; the page keeps a placeholder so nothing jumps
    on = !!on && this.native && !this.dead; if (this.full === on) return; this.full = on;
    if (on) {
      this.ph = this.ph || document.createElement('div'); this.ph.className = 'fbg-ph'; this.ph.style.height = this.root.offsetHeight + 'px';
      this.root.parentNode.insertBefore(this.ph, this.root); document.body.appendChild(this.root);
    } else {
      const d = document; if (d.fullscreenElement || d.webkitFullscreenElement) { const p = (d.exitFullscreen || d.webkitExitFullscreen).call(d); if (p && p.catch) p.catch(() => {}); }
      if (this.ph && this.ph.parentNode) { this.ph.parentNode.insertBefore(this.root, this.ph); this.ph.remove(); }
    }
    this.root.classList.toggle('is-full', on); document.documentElement.classList.toggle('fbg-lock', on);
    this.resize(); this.syncMenu();
    try { this.$.stage.focus({ preventScroll: true }); } catch (e) {}
    if (!on) try { this.root.scrollIntoView({ block: 'center' }); } catch (e) {}
  }
  toggleFullscreen() {
    if (!this.native) return;
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { const p = (d.exitFullscreen || d.webkitExitFullscreen).call(d); if (p && p.catch) p.catch(() => {}); return; }
    this.setFull(true);
    const req = this.root.requestFullscreen || this.root.webkitRequestFullscreen;
    if (req) { try { const p = req.call(this.root, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
  toggleSound(v) {
    const on = v != null ? v : !this.sfx.on; this.sfx.enable(on); saveSnd(on);
    if (on) this.sfx.music(this.phase === 'title' || this.phase === 'result' ? 'music_menu' : 'music_match');
    this.$.sound.setAttribute('aria-pressed', String(on)); this.$.sound.textContent = on ? 'Sound on' : 'Sound off';
    const b = this.$.card.querySelector('.fbg-snd'); if (b) b.textContent = on ? 'Sound on' : 'Sound off';
  }

  initGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.$.canvas, antialias: !this.mobile, alpha: false, powerPreference: 'high-performance' });
      if (!this.renderer.getContext()) throw new Error('no gl');
    } catch (e) { this.graphicsFallback('WebGL is unavailable. The team file still works; try another browser to play.'); return false; }
    const R = this.renderer;
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 220);
    this.view = { cx: 0, d: 20, tz: -1.8, fov: 34, wide: true, punch: 0, px: 0, pz: 0 };
    this.limbMat = rimify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
    this.limbMat1 = rimify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }), RIM_T1);
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    this.qMode = this.opts.quality || 'auto';
    this.tier = this.qMode === 'auto' ? (coarse ? 'med' : 'high') : this.qMode;
    this.frameMs = 16; this.qFrames = 0; this.qDrops = 0;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.root);
    this.io = new IntersectionObserver((es) => { for (const e of es) this.visible = e.isIntersecting; if (!this.visible && this.phase === 'play' && !this.paused) this.pause(true); }, { threshold: 0.05 });
    this.io.observe(this.root);
    this.$.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.graphicsFallback('The graphics connection was interrupted. Reload to return to the court.'); });
    return true;
  }
  graphicsFallback(message) {
    if (this.full) this.setFull(false); // hand recovery back to the page, where its status line and Low-quality retry live
    this.dead = true; this.paused = true;
    cancelAnimationFrame(this.raf);
    this.sfx.enable(false); this.sfx.mood(0, 0, false);
    if (this.sfx.ctx) this.sfx.ctx.suspend().catch(() => {});
    this.root.classList.add('no-webgl');
    this.$.poster.querySelector('p').textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'fbg-btn fbg-reload'; retry.textContent = 'Reload game';
    retry.addEventListener('click', () => location.reload());
    this.$.poster.appendChild(retry);
    this.say(message);
  }
  resize() {
    if (this.dead) return;
    const w = this.root.clientWidth;
    // small landscape phones (iPhone SE 667x375) keep the wide 16:9 layout: narrow means a narrow AND tall view, not every view under 700 px
    const narrow = w < 700 && !((window.innerWidth || 0) > (window.innerHeight || 0) * 1.2);
    this.root.classList.toggle('is-short', Math.min(this.root.clientHeight || 999, window.innerHeight || 999) < 680 && !narrow);
    this.root.classList.toggle('is-narrow', narrow); this.root.classList.toggle('is-wide', !narrow);
    const st = this.$.stage; const W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
    this.W = W; this.H = H;
    this.applyTier(true);
    const aspect = W / H, v = this.view;
    v.wide = aspect >= 1.25;
    v.fov = v.wide ? 27 : 40;
    const halfW = v.wide ? 10.6 : 8.2;
    v.d = halfW / (Math.tan(v.fov / 2 * DEG) * aspect);
    // wide screens keep a 16:9 safe frame: on 21:9 or 32:9 the court depth sets the distance, so nothing is cropped top or bottom
    if (v.wide && aspect > 16 / 9) v.d = Math.max(v.d, halfW / (Math.tan(v.fov / 2 * DEG) * (16 / 9)));
    v.tz = v.wide ? -2.3 : -1.4;
    v.d *= 1 + 0.7 * (HZ - 4.5) / 4.5; v.tz += v.wide ? 0.55 * (HZ - 4.5) : -2.2;   // re-frame for the wider court (COURT_W): pull back and center the extra width
    // desktop HUD type scale: the HUD was drawn for a ~600 px tall stage; in full window it grows with the screen (1080p about 1.45x, 1440p about 1.9x)
    const z = this.full ? Math.max(1, Math.min(2.4, H / 745)) : 1;
    this.root.style.setProperty('--fbg-z', z.toFixed(3));
    this.camera.fov = v.fov; this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.pxPerUnit = H / (2 * v.d * Math.tan(v.fov / 2 * DEG));
    this.placeBackdrop();
    if (this.layoutStands) this.layoutStands();
    this.checkRotate();
  }
  buildWorld() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffe8d4', '#5a3424', 1.5); S.add(this.hemi);
    this.key = new THREE.DirectionalLight('#fff0dc', 2.8); this.key.position.set(-5, 15, 9); this.key.target.position.set(0, 0, -1); S.add(this.key); S.add(this.key.target);
    const sc = this.key.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 10; sc.bottom = -10; sc.near = 2; sc.far = 45; this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.025; this.key.shadow.mapSize.set(2048, 2048);
    this.rimL = new THREE.DirectionalLight('#ff7a3a', 1.6); this.rimL.position.set(-12, 6, -12); S.add(this.rimL);
    this.rimR = new THREE.DirectionalLight('#9a6bff', 1.5); this.rimR.position.set(12, 6, -12); S.add(this.rimR);
    this.fill = new THREE.DirectionalLight('#ffd7b0', 1.1); this.fill.position.set(0, 6, 14); S.add(this.fill);
    const loader = new THREE.TextureLoader();
    // dark base under everything
    const base = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshBasicMaterial({ color: '#0b0608' })); base.rotation.x = -Math.PI / 2; base.position.set(0, -0.02, -4); S.add(base);
    const floorTex = loader.load(assetURL(this.base, 'floor-maple.jpg')); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(34 / 2.6, 24 / 2.6); floorTex.anisotropy = 8;
    this.mapleTex = floorTex;
    this.waterTex = canvasTex(512, 512, (c, w, h) => drawWater(c, w, h)); this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping; this.waterTex.repeat.set(8, 5.6);
    this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.0, color: '#ffe0bc' });
    { const lm = loader.load(assetURL(this.base, 'court-light.jpg')); lm.colorSpace = THREE.SRGBColorSpace; this.floorMat.lightMap = lm; this.floorMat.lightMapIntensity = 0.5; }   // Blender light bake (court_light_bake.py): pooled gym light, darker corners
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), this.floorMat); floor.position.z = 1.5; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; S.add(floor); this.floor = floor;
    this.courtTex = canvasTex(2080, 1200, () => { });
    this.courtMat = new THREE.MeshStandardMaterial({ map: this.courtTex, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
    const court = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), this.courtMat); court.rotation.x = -Math.PI / 2; court.position.y = 0.003; court.receiveShadow = true; S.add(court); this.court = court;
    // pool caustics (Miami night): two scrolling layers, additive
    this.causticTex = causticTexture(); this.causticTex.wrapS = this.causticTex.wrapT = THREE.RepeatWrapping;
    this.caustics = [0, 1].map(i => { const t = this.causticTex.clone(); t.needsUpdate = true; t.repeat.set(5 + i * 1.3, 3 + i * 0.8); const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.28, color: '#bff8ff' })); m.rotation.x = -Math.PI / 2; m.position.y = 0.005 + i * 0.001; m.renderOrder = 1; m.visible = false; S.add(m); return m; });
    this.glowTex = canvasTex(1000, 560, () => { });
    this.glowMat = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(25, 14), this.glowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.006; glow.renderOrder = 1; S.add(glow); this.glowPlane = glow;
    // light pools and reflected light streaks
    this.poolTex = radialTex([[0, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
    this.pools = [];
    for (const [x, z, s] of [[-5.5, -0.5, 9], [5.5, -0.5, 9], [0, 1.5, 7]]) {
      const m = new THREE.Mesh(GEO.plane || geos().plane, new THREE.MeshBasicMaterial({ map: this.poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe6c8', opacity: 0.09 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.008, z); m.scale.set(s, s * 0.7, 1); m.renderOrder = 1; S.add(m); this.pools.push(m);
    }
    const streakTex = canvasTex(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; const hg = c.createLinearGradient(0, 0, w, 0); c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'destination-in'; hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.5, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = hg; c.fillRect(0, 0, w, h); });
    this.streaks = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0', opacity: 0.11 })); m.rotation.x = -Math.PI / 2; const x = -11.7 + i * 2.6; m.position.set(x, 0.01, -3.0); m.scale.set(0.9, 8.5, 1); m.renderOrder = 2; S.add(m); this.streaks.push(m); }
    // planar reflection gloss layer
    this.buildGloss();
    // backdrop plate (Blender), tilted to face the camera like rising stands, with a cheap crowd bounce
    this.bdTex = { fb: loader.load(assetURL(this.base, 'backdrop-fb.jpg')), vc: loader.load(assetURL(this.base, 'backdrop-vc.jpg')) };
    for (const k in this.bdTex) { this.bdTex[k].colorSpace = THREE.SRGBColorSpace; this.bdTex[k].anisotropy = 4; }
    this.crowdT = { value: 0 }; this.crowdAmp = { value: 1 }; this.crowdMood = { value: 0 }; this.crowdExc = { value: 0 };
    this.bdMat = new THREE.MeshBasicMaterial({ map: this.bdTex.fb, color: '#d8ccd0' });
    this.bdMat.onBeforeCompile = (s) => {
      s.uniforms.uT = this.crowdT; s.uniforms.uAmp = this.crowdAmp; s.uniforms.uMood = this.crowdMood; s.uniforms.uExc = this.crowdExc;
      s.fragmentShader = 'uniform float uT; uniform float uAmp; uniform float uMood; uniform float uExc;\n' + s.fragmentShader.replace('#include <map_fragment>',
        `vec2 cuv = vMapUv; float fy = 1.0 - cuv.y; float band = step(0.11, fy) * step(fy, 0.68) * (1.0 - step(0.365, cuv.x) * step(cuv.x, 0.635) * step(fy, 0.37));   // rec gym plate: running-track crowd and bleachers bounce, the Strip window stays still
         float col = floor(cuv.x * 220.0); float h = fract(sin(col * 12.9898) * 43758.5453);
         float up = max(uMood, 0.0), dn = max(-uMood, 0.0);
         cuv.y += band * uAmp * (0.006 + 0.022 * uExc * up) * (1.0 - 0.8 * dn) * max(0.0, sin(uT * (6.0 + h * 5.0 + 6.0 * uExc * up) + h * 30.0));
         vec4 sampledDiffuseColor = texture2D(map, cuv); diffuseColor *= sampledDiffuseColor;
         diffuseColor.rgb *= 1.0 + 0.2 * up - 0.38 * dn;
         float fl = fract(sin(dot(floor(vMapUv * vec2(260.0, 70.0)) + floor(uT * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
         diffuseColor.rgb += band * uAmp * step(1.0 - 0.016 * uExc * up, fl) * vec3(1.3);`);
    };
    this.backdrop = new THREE.Mesh(GEO.plane, this.bdMat); S.add(this.backdrop);
    // light shafts and haze in front of the stands
    const shaftTex = canvasTex(128, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(w * 0.42, 0); c.lineTo(w * 0.58, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill(); });
    this.shafts = [];
    for (const [x, r] of [[-9, 0.35], [-3, 0.1], [3, -0.1], [9, -0.35]]) { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd6a0', opacity: 0.1 })); m.scale.set(4.5, 7, 1); m.position.set(x, 3.6, -7.3); m.rotation.set(-PITCH, 0, r); m.userData.r0 = r; m.renderOrder = 3; S.add(m); this.shafts.push(m); }
    this.hazeTex = radialTex([[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    this.haze = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.hazeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb070', opacity: 0.12 })); this.haze.scale.set(40, 5, 1); this.haze.position.set(0, 1.2, -7.4); this.haze.rotation.x = -PITCH; this.haze.renderOrder = 3; S.add(this.haze);
    // LED ribbon boards along the far edge
    this.ribbonTex = canvasTex(2048, 64, () => { }, this.texQ);
    this.ribbonMat = new THREE.MeshBasicMaterial({ map: this.ribbonTex });
    const rb = new THREE.Mesh(new THREE.BoxGeometry(26, 0.85, 0.14), [this.darkMat = new THREE.MeshStandardMaterial({ color: '#111' }), this.darkMat, this.darkMat, this.darkMat, this.ribbonMat, this.darkMat]);
    rb.position.set(0, 0.43, -7.15); S.add(rb); this.ribbon = rb;
    // palms for Miami night (neon outline signs at the sides)
    this.palmTex = canvasTex(512, 1024, (c, w, h) => drawPalm(c, w, h));
    this.palms = [];
    for (const [x, s, flip] of [[-13.2, 6.5, 1], [13.2, 6.5, -1]]) {
      const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.palmTex, transparent: true, color: '#1a0f2e', depthWrite: false }));
      m.scale.set(s * 0.5 * flip, s, 1); m.position.set(x, s / 2 - 0.2, -6.9); m.rotation.x = -PITCH * 0.5; S.add(m); this.palms.push(m);
    }
    this.shadowTex = radialTex([[0, 'rgba(10,4,16,0.6)'], [0.55, 'rgba(10,4,16,0.32)'], [1, 'rgba(10,4,16,0)']]);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    this.tex = { crown: crownTex(), pixel: pixelTex(), star: starTex(), sparkle: sparkleTex(), ring: ringTex(), speed: speedTex(), glow: radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 64), dust: radialTex([[0, 'rgba(255,240,220,0.9)'], [1, 'rgba(255,240,220,0)']], 64) };
    this.spritePool = [];
    for (let i = 0; i < 180; i++) { const m = new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 5; S.add(s); this.spritePool.push(s); }
    // floor decals: shock rings that spread from hits and catches (laid flat on the court, not camera-facing sprites)
    this.decals = [];
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.tex.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; S.add(m); this.decals.push({ m, t: 0, life: 1, s0: 1, s1: 1, a0: 1 }); }
    // readable lines: the center line and both side lines brighten as a player nears them (P0f), never always on
    this.lineStrips = [[0, 0, 0.16, 2 * HZ + 0.1], [0, -HZ, 18.2, 0.16], [0, HZ, 18.2, 0.16]].map(([x, z, w, d]) => { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.011, z); m.scale.set(w, d, 1); m.renderOrder = 2; S.add(m); return m; });
    this.initPost();
    this.resize();
  }
  paintCourt() {
    const kit = this.kit, vc = this.mode === 'vc';
    const P = 80, X = (x) => (x + 13) * P, Z = (z) => (z + 7.5) * P;
    const tb = kit.base === '#ffffff' || lum(kit.base) > 0.8 ? kit.trim : kit.base;
    this.courtTex.userData.redraw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      const cx0 = X(-HX), cz0 = Z(-HZ), cw = 18 * P, ch = 9 * P;
      c.save(); c.beginPath(); c.rect(0, 0, w, h); c.rect(cx0, cz0, cw, ch); c.clip('evenodd');
      if (vc) {
        // pool deck tiles and a navy tile band hugging the court
        const ts = 0.5 * P; c.fillStyle = '#123a6a'; c.fillRect(0, 0, w, h);
        for (let y = 0, j = 0; y < h; y += ts, j++) for (let x = 0, i = 0; x < w; x += ts, i++) {
          const inBand = x > cx0 - 0.9 * P && x < cx0 + cw + 0.9 * P && y > cz0 - 0.9 * P && y < cz0 + ch + 0.9 * P;
          c.fillStyle = inBand ? ((i + j) % 2 ? '#1d5aa8' : '#2468c0') : ((i + j) % 2 ? '#7fd6e8' : '#9fe3ef');
          c.fillRect(x + 2, y + 2, ts - 4, ts - 4);
        }
        c.fillStyle = 'rgba(10,6,40,.25)'; c.fillRect(0, 0, w, h);
      } else {
        c.fillStyle = 'rgba(20,6,8,.30)'; c.fillRect(0, 0, w, h);
        c.globalAlpha = 0.92; c.fillStyle = shade(tb, -0.15);
        c.fillRect(cx0 - 0.7 * P, cz0 - 0.7 * P, cw + 1.4 * P, 0.7 * P); c.fillRect(cx0 - 0.7 * P, cz0 + ch, cw + 1.4 * P, 0.7 * P);
        c.fillRect(cx0 - 2.2 * P, cz0 - 0.7 * P, 2.2 * P, ch + 1.4 * P); c.fillStyle = '#2a4a10'; c.fillRect(cx0 + cw, cz0 - 0.7 * P, 2.2 * P, ch + 1.4 * P);
        c.globalAlpha = 1;
      }
      c.restore();
      if (!vc) {
        c.fillStyle = 'rgba(13,58,67,.22)'; c.fillRect(cx0, cz0, cw/2, ch);
        c.fillStyle = 'rgba(24,37,55,.15)'; c.fillRect(X(0), cz0, cw/2, ch);
        // Baseline hash marks read as a sporting surface at oblique camera angles.
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 3;
        for (let z = -3; z <= 3; z++) for (const x of [-HX, HX]) {
          c.beginPath(); c.moveTo(X(x), Z(z)); c.lineTo(X(x + (x < 0 ? .18 : -.18)), Z(z)); c.stroke();
        }
      }
      const line = '#fbf6ee';
      c.strokeStyle = line; c.lineWidth = 9; c.strokeRect(cx0, cz0, cw, ch);
      c.beginPath(); c.moveTo(X(0), cz0); c.lineTo(X(0), cz0 + ch); c.stroke();
      c.lineWidth = 9;
      for (const ax of [-ATK, ATK]) { c.strokeStyle = vc ? (ax < 0 ? '#ff6fc0' : '#7ff3ff') : (ax < 0 ? tb : OPPC.sig); c.beginPath(); c.moveTo(X(ax), cz0); c.lineTo(X(ax), cz0 + ch); c.stroke(); }
      c.save(); c.font = font(0.34 * P); c.textAlign = 'center';
      for (const ax of [-ATK, ATK]) { c.fillStyle = vc ? '#ffffff' : (ax < 0 ? tb : shade(OPPC.sig, -0.45)); c.save(); c.translate(X(ax) + (ax < 0 ? -14 : 14), Z(HZ) - 0.6 * P); c.rotate(-Math.PI / 2); c.fillText('ATTACK', 0, 0); c.restore(); }
      c.restore();
      if (vc) {
        c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.beginPath(); c.arc(X(0), Z(0), 1.9 * P, 0, Math.PI * 2); c.stroke();
        c.save(); c.beginPath(); c.arc(X(0), Z(0), 1.75 * P, 0, Math.PI * 2); c.clip();
        for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? 'rgba(255,111,192,.75)' : 'rgba(255,255,255,.55)'; c.fillRect(X(0) - 2 * P, Z(0) + 0.25 * P + k * 0.28 * P, 4 * P, 0.16 * P); }
        c.restore();
        c.save(); c.translate(X(0) - 0.55 * P, Z(0) - 1.55 * P); c.scale(1.1 * P / 512, 1.9 * P / 1024); c.globalAlpha = 0.9; c.drawImage(this.palmTex.image, 0, 0); c.restore();
      } else {
        c.beginPath(); c.arc(X(0), Z(0), 2.05 * P, 0, Math.PI * 2); c.fillStyle = shade(tb, -0.1); c.fill();
        c.lineWidth = 10; c.strokeStyle = '#ffc83d'; c.stroke();
        c.beginPath(); c.arc(X(0), Z(0), 1.8 * P, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = line; c.stroke();
        c.save(); c.translate(X(0), Z(0)); c.scale(1, 0.92); crown(c, 0, -0.08 * P, 1.05 * P, '#ffc83d', shade(tb, -0.55)); c.restore();
      }
    });
    this.glowTex.userData.redraw((c, w, h) => {
      c.clearRect(0, 0, w, h);
      const p = 40, X2 = (x) => (x + 12.5) * p, Z2 = (z) => (z + 7) * p;
      c.shadowBlur = 18; c.shadowColor = vc ? '#ff3fa1' : '#ffb060'; c.strokeStyle = vc ? '#ff6fc0' : '#ffcf8a'; c.lineWidth = 5;
      c.strokeRect(X2(-HX), Z2(-HZ), 18 * p, 9 * p);
      c.shadowColor = vc ? '#5fd3e0' : '#ffc83d'; c.strokeStyle = vc ? '#7ff3ff' : '#ffd36e';
      c.beginPath(); c.moveTo(X2(0), Z2(-HZ)); c.lineTo(X2(0), Z2(HZ)); c.stroke();
    });
  }
  applyLook(look) {
    this.look = look || this.look;
    this.kit = kitFrom(this.look.colors);
    const kit = this.kit;
    for (const p of this.teams[0]) p.drawKit(kit);
    const r = this.root.style;
    r.setProperty('--fbg-c0', kit.all[0]); r.setProperty('--fbg-c1', kit.all[1]); r.setProperty('--fbg-c2', kit.all[2]); r.setProperty('--fbg-c3', kit.all[3]);
    r.setProperty('--fbg-tb', kit.base === '#ffffff' || lum(kit.base) > 0.8 ? kit.trim : kit.base); r.setProperty('--fbg-tt', kit.trim); r.setProperty('--fbg-ta', kit.accent);
    if (this.$.chip) this.$.chip.querySelectorAll('i').forEach((i, k) => i.style.background = kit.all[k]);
    this.$.looknm.textContent = this.look.name || '';
    this.paintCourt();
    if (this.ribbonTex) this.paintRibbon();
    if (this.drawSigns) this.drawSigns();
  }
  applyMode(mode) {
    this.mode = mode === 'vc' ? 'vc' : 'fb';
    const vc = this.mode === 'vc';
    this.root.classList.toggle('mode-vc', vc);
    // the crowd is depth, not content: one value step under the court and players
    this.bdMat.map = this.bdTex[this.mode]; this.bdMat.color.set(vc ? '#b8aec0' : '#a89ca2'); this.bdMat.needsUpdate = true;
    if (this.signs) for (const sg of this.signs) sg.mat.color.set('#b3aaae'); if (this.bannerMat) this.bannerMat.color.set('#c2b8bc'); if (this.ribbonMat) this.ribbonMat.color.set('#a8a0a4');
    this.scene.background = new THREE.Color(vc ? '#0a0618' : '#0b0608');
    this.palms.forEach(p => p.visible = false);
    this.floorMat.map = vc ? this.waterTex : this.mapleTex; this.floorMat.color.set(vc ? '#ffffff' : '#dce0d4'); this.floorMat.roughness = vc ? 0.28 : 0.58; this.floorMat.needsUpdate = true;
    this.caustics.forEach(c => c.visible = vc);
    this.hemi.color.set(vc ? '#d8b8ff' : '#e4f1ff'); this.hemi.groundColor.set(vc ? '#1a4a6a' : '#263b47'); this.hemi.intensity = vc ? 1.35 : 1.5;
    this.key.color.set(vc ? '#ffe6f4' : '#fff7ea'); this.key.intensity = vc ? 2.4 : 2.35;
    this.rimL.color.set(vc ? '#ff3fa1' : '#ff7a3a'); this.rimR.color.set(vc ? '#3ff0ff' : '#77b9e8');
    this.rimL.intensity = vc ? 1.6 : 0.85; this.rimR.intensity = vc ? 1.5 : 1.0;
    RIM_U.color.value.set(vc ? '#ff6fd0' : '#ffb070'); RIM_U.strength.value = 0.85;
    RIM_T1.color.value.set(vc ? '#6ff3ff' : (OPPC.id === 'glitches' ? '#c8ff6a' : shade(OPPC.sig, 0.3))); RIM_T1.strength.value = vc ? 0.85 : 0.95;   // the Glitches' dark kits need a brighter edge to read over court and crowd
    this.pools.forEach((p, i) => p.material.color.set(vc ? (i % 2 ? '#ff8cc2' : '#7ff3ff') : '#ffe6c8'));
    this.streaks.forEach((s, i) => s.material.color.set(vc ? (i % 2 ? '#ff6fd0' : '#6ff3ff') : '#ffd9a0'));
    this.shafts.forEach(s => s.material.color.set(vc ? '#c48cff' : '#ffd6a0'));
    this.haze.material.color.set(vc ? '#b06cff' : '#ffb070');
    this.glossMat.uniforms.tint.value.set(vc ? '#e0f6ff' : '#ffe8d0'); this.glossMat.uniforms.strength.value = vc ? 0.24 : 0.12;
    this.glowMat.opacity = vc ? 0.4 : 0.16;
    if (this.kit) { this.paintCourt(); this.paintRibbon(); }
    if (this.drawBanner) this.drawBanner();
  }
  bindInput() {
    const map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', j: 'throw', J: 'throw', ' ': 'throw', u: 'sprint', U: 'sprint', k: 'catch', K: 'catch', l: 'jump', L: 'jump', Shift: 'pass', e: 'pass', E: 'pass', q: 'switch', Q: 'switch', Escape: 'pause', p: 'pause', P: 'pause', Enter: 'enter', '1': 'rock', '2': 'paper', '3': 'scissors', f: 'fs', F: 'fs', m: 'menu', M: 'menu' };
    this.onKeyDown = (e) => {
      const k = map[e.key]; if (!k) return;
      const inGame = this.phase !== 'title' && this.phase !== 'result';
      const focusOK = this.root.contains(document.activeElement) || document.activeElement === document.body;
      if (!this.visible || !focusOK) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (k === 'fs' || k === 'menu') {
        if (!this.native) return; e.preventDefault(); if (e.repeat) return;
        if (k === 'fs') this.toggleFullscreen(); else if (inGame && this.phase !== 'handshake') { this.paused ? this.resume() : this.pause('menu'); }
        return;
      }
      // in full window, Esc on the title or results card goes back to the page
      if (!inGame && k === 'pause' && this.full) { this.setFull(false); e.preventDefault(); return; }
      if (!inGame) { if (k === 'enter' && this.phase === 'title' && document.activeElement === this.$.stage && !this.picking) { if (this.wkView) this.startWeekendMatch(); else this.showBracket(); e.preventDefault(); } return; }
      if (this.phase === 'handshake') { if (k === 'enter' || k === 'throw' || k === 'pause') this.finishHandshake(); e.preventDefault(); return; }
      if (k === 'pause') { this.paused ? this.resume() : this.pause(); e.preventDefault(); return; }
      if (this.paused) return;
      e.preventDefault();
      if (!this.keys[k]) {
        this.edge[k] = true;
        const ax = this.km === 'infield' ? (k === 'up' || k === 'down') : (k === 'left' || k === 'right');
        if (ax) {
          const fw = this.user ? -this.user.side : 1, dir = this.km === 'infield' ? (k === 'up' ? fw : -fw) : (k === 'left' ? -1 : 1);
          if (this.lastTap.dir === dir && this.frame - this.lastTap.f <= 14) this.edge.dash = dir;
          this.lastTap = { dir, f: this.frame };
        }
      }
      this.keys[k] = true;
    };
    this.onKeyUp = (e) => { const k = map[e.key]; if (k) this.keys[k] = false; };
    window.addEventListener('keydown', this.onKeyDown); window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => { this.keys = {}; });
    // touch stick
    const zone = this.root.querySelector('.fbg-stickzone'); let sid = null, ox = 0, oy = 0;
    const R = 46;
    const move = (e) => {
      const dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy); const k = d > R ? R / d : 1;
      this.$.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      this.touch.mx = Math.abs(dx) > 10 ? Math.max(-1, Math.min(1, dx / R)) : 0; this.touch.mz = Math.abs(dy) > 10 ? Math.max(-1, Math.min(1, dy / R)) : 0;
      const fr = d / R;
      if (fr > 0.85 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (!this.touch.run) { this.touch.run = true; this.edge.dash = dx < 0 ? -1 : 1; } } else if (fr < 0.6) this.touch.run = false;
    };
    zone.addEventListener('pointerdown', (e) => {
      sid = e.pointerId; try { zone.setPointerCapture(sid); } catch (er) { }
      if (this.mobile) {
        // floating pad: it centers under the thumb wherever it lands in the left zone
        const rr = this.root.getBoundingClientRect(), st = this.$.stick, h = st.offsetHeight || 112;
        st.classList.add('free'); st.style.left = (e.clientX - rr.left) + 'px'; st.style.bottom = (rr.bottom - e.clientY) + 'px'; st.style.margin = `0 0 ${-h / 2}px ${-h / 2}px`;
        ox = e.clientX; oy = e.clientY;
      } else { const r = this.$.stick.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; }
      move(e); e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const up = (e) => { if (e.pointerId !== sid) return; sid = null; this.touch.mx = 0; this.touch.mz = 0; this.touch.run = false; this.$.knob.style.transform = ''; const st = this.$.stick; st.classList.remove('free'); st.style.left = st.style.bottom = st.style.margin = ''; };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    this.root.querySelectorAll('.fbg-tb').forEach(b => {
      const k = b.dataset.b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) { } this.touch.btn[k] = true; this.edge[k] = true; b.classList.add('on'); if (this.phase === 'title') return; });
      const off = () => { this.touch.btn[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('contextmenu', e => e.preventDefault());
    });
    this.$.stage.addEventListener('pointerdown', () => { this.$.stage.focus({ preventScroll: true }); });
    // PC native mouse: left button throws, right button catches (hold to duck), mirroring J and K
    this.$.stage.addEventListener('mousedown', (e) => {
      if (!this.native || this.paused || this.phase !== 'play' || (e.target.closest && e.target.closest('button,.fbg-ov,.fbg-vs,.fbg-btns'))) return;
      if (e.button === 0) { this.edge.throw = true; e.preventDefault(); } else if (e.button === 2) { this.edge.catch = true; this.keys.catch = true; e.preventDefault(); }
    });
    this.onMouseUp = (e) => { if (e.button === 2) this.keys.catch = false; };
    window.addEventListener('mouseup', this.onMouseUp);
    this.$.stage.addEventListener('contextmenu', (e) => { e.preventDefault(); });   // right button is CATCH; never a browser menu over the court
    // Gordon 10/26 (PC): Shift is PASS and the mouse throws, and Shift+click on a link opens a new window. During a match nothing on the page may
    // open a window or tab: modified clicks (Shift, Ctrl, Cmd, Alt) and middle clicks are cancelled page-wide while play is live; the game still gets its mousedown
    this.onGuardClick = (e) => {
      const live = !this.dead && this.phase !== 'title' && this.phase !== 'result' && !this.paused;
      if (!live || !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.button === 1)) return;
      e.preventDefault(); if (e.type !== 'mousedown') e.stopPropagation();
    };
    for (const ev of ['mousedown', 'click', 'auxclick']) document.addEventListener(ev, this.onGuardClick, true);
    this.onGuardCtx = (e) => { if (this.root.contains(e.target) && !this.dead && this.phase !== 'title' && this.phase !== 'result') e.preventDefault(); };
    document.addEventListener('contextmenu', this.onGuardCtx, true);
  }
  userIntent() {
    const k = this.keys, t = this.touch, e = this.edge;
    // P0e: holding Dash (U, or the DASH button) sprints toward the center line; double-tap and the pad flick still work
    const fwd = this.user ? -this.user.side : 1, sprint = !!(k.sprint || t.btn.sprint);
    const km = this.kmAxes(this.user, k);
    let mx = km.mx + t.mx;
    if (sprint && !(mx * fwd > 0.3)) mx = (this.user && this.user.x * this.user.side < 1.0 && this.rushT >= RULES.rushF) ? 0 : fwd;   // DASH alone never carries you over the center line
    let mz = km.mz + t.mz;
    mx = Math.max(-1, Math.min(1, mx)); mz = Math.max(-1, Math.min(1, mz));
    const it = { mx, mz, dash: e.dash || (e.sprint ? fwd : 0), holdRun: (km.run || t.run || sprint), throw: !!e.throw, catch: !!e.catch, catchHeld: !!(k.catch || t.btn.catch), jump: !!e.jump, pass: !!e.pass, sw: !!e.switch };
    this.edge = {};
    return it;
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.dead) return;
    if (!this.visible) {
      // offscreen: keep pre-play phases moving (ro-sham-bo auto-pick, lineup), skip rendering; play itself auto-pauses
      if (this.phase !== 'play' && this.phase !== 'title' && !this.paused) { this.acc += dt; let n = 0; while (this.acc >= DT && n < 6) { this.acc -= DT; this.tick(); n++; } if (n >= 6) this.acc = 0; }
      return;
    }
    this.fpsS = (this.fpsS || 60) * 0.95 + (1 / Math.max(0.001, dt)) * 0.05; this.autoQuality(dt);
    this.acc += dt; let n = 0;
    while (this.acc >= DT && n < 6) { this.acc -= DT; this.tick(); n++; }
    if (n >= 6) this.acc = 0;
    this.render();
  }
  animate(a) {
    if (!a.active) return;
    let k = 0.35;
    const s = a.state, t = a.st;
    let P;
    switch (s) {
      case 'idle': P = a.role === 'outline' ? this.poseBench(a) : (a.hasBall ? this.poseHold(a) : this.poseIdle(a)); k = 0.25; break;
      case 'balance': P = this.poseBalance(a); k = 0.5; break;
      case 'block': P = this.poseCatch(a); k = a.st < 4 ? 0.9 : 0.3; break;
      case 'walk': P = this.poseWalk(a); k = 0.3; break;
      case 'run': P = this.poseRun(a); k = 0.45; break;
      case 'squat': P = this.poseSquat(a); k = 0.6; break;
      case 'air': P = this.poseAir(a); k = 0.35; break;
      case 'land': P = this.poseSquat(a, 1 - t / 6); k = 0.6; break;
      case 'windup': case 'pwind': P = this.poseWind(a, s === 'pwind'); k = s === 'pwind' ? 0.35 : 0.5; break;
      case 'release': case 'prel': P = this.poseRelease(a, s === 'prel'); k = 0.85; break;
      case 'recover': case 'prec': P = this.poseRecover(a); k = 0.25; break;
      case 'catchready': P = this.poseCatchReady(a); k = 0.6; break;
      case 'catch': P = this.poseCatch(a); k = t < 4 ? 0.9 : 0.3; break;
      case 'bobble': P = this.poseBobble(a); k = 0.5; break;
      case 'duck': P = this.poseDuck(a); k = 0.5; break;
      case 'hitstun': P = this.poseHit(a); k = t < 3 ? 0.9 : 0.25; break;
      case 'knock': P = this.poseKnock(a); k = 0.4; break;
      case 'down': P = this.poseDown(a); k = 0.4; break;
      case 'getup': P = this.poseGetup(a); k = 0.3; break;
      case 'tired': P = this.poseTired(a); k = 0.2; break;
      case 'ko': P = this.poseKO(a); k = 0.2; break;
      case 'walkin': P = this.poseWalk(a); k = 0.3; break;
      case 'drop': P = this.poseHit(a); k = 0.3; break;
      case 'teeter': P = this.poseTeeter(a); k = 0.5; break;
      case 'pump': P = a.st < 8 ? this.poseWind(a, false) : this.poseHold(a); k = 0.55; break;
      case 'lean': P = this.poseLean(a); k = t < 3 ? 0.7 : 0.4; break;
      case 'spin': P = this.poseRun(a); P.twist = Math.sin(t * 0.8) * 0.6; P.lean = 0.25; k = 0.5; break;
      case 'matador': P = this.poseLean(a); P.sh = [-2.6, 0.9, -2.6, 0.9]; P.twist = 0.7; k = 0.8; break;
      case 'dive': P = this.poseKnock(a); P.roll = (a.diveDir || 1) * -Math.min(1.3, t * 0.16); P.lean = 0.6; k = 0.5; break;
      case 'stagger': P = this.poseHit(a); k = 0.3; break;
      default: P = this.poseIdle(a);
    }
    a.setExpr(exprFor(a, this));
    if (a.stumbleT > 0) { a.stumbleT--; P.side += Math.sin(a.stumbleT * 0.5) * 0.12; P.sh[1] = P.sh[3] = 0.8; }
    a.tgt = P; this.blend(a, k); this.place(a);
  }
  bp(a) { return a.blankPose(); }
  poseIdle(a) { const p = this.bp(a); const t = (this.frame + a.num.length * 17) * 0.09; if (a.role !== 'in') { p.hipY = -0.02; p.kn = [0.25, 0.25]; p.hp = [-0.12, -0.12]; p.sh = [-0.5, 0.2, -0.5, 0.2]; p.el = [-1.0, -1.0]; return p; } p.hipY = Math.sin(t) * 0.02 - 0.13; p.kn = [0.95, 0.95]; p.hp = [-0.62, -0.62]; p.spread = [0.2, 0.2]; p.lean = 0.30 + Math.sin(t) * 0.025; p.sh = [-0.85, 0.38, -0.85, 0.38]; p.el = [-0.95, -0.95]; p.head = -0.25 + Math.sin(t * 0.5) * 0.05; return p; }
  poseBalance(a) { const p = this.poseIdle(a); p.lean = 0.12; p.side = Math.sin(a.st * 0.32) * 0.14; p.sh = [-0.7, 0.95, -0.7, 0.95]; p.el = [-0.45, -0.45]; p.spread = [0.25, 0.25]; p.kn = [0.75, 0.9]; return p; }
  poseHold(a) { const p = this.poseIdle(a); p.sh[2] = -0.9; p.sh[3] = 0.35; p.el[1] = -1.5; p.twist = -0.15; return p; }
  poseWalk(a) { const p = this.bp(a); const ph = a.st * 0.32 + (a.num.length); const s = Math.sin(ph); p.hp = [s * 0.55 - 0.1, -s * 0.55 - 0.1]; p.kn = [Math.max(0, -Math.cos(ph)) * 0.8 + 0.15, Math.max(0, Math.cos(ph)) * 0.8 + 0.15]; p.sh = [-s * 0.5 - 0.1, 0.15, s * 0.5 - 0.1, 0.15]; p.el = [-0.7, -0.7]; p.hipY = Math.abs(Math.cos(ph)) * 0.04 - 0.02; p.lean = 0.14; if (a.hasBall) { p.sh[2] = -0.9; p.el[1] = -1.5; } return p; }
  poseRun(a) { const p = this.bp(a); const ph = (a.runF / TUNE.stepF) * Math.PI; const s = Math.sin(ph); p.hp = [s * 1.0 - 0.25, -s * 1.0 - 0.25]; p.kn = [Math.max(0, -Math.cos(ph)) * 1.5 + 0.3, Math.max(0, Math.cos(ph)) * 1.5 + 0.3]; p.sh = [-s * 1.1, 0.12, s * 1.1, 0.12]; p.el = [-1.5, -1.5]; p.hipY = Math.abs(Math.sin(ph)) * 0.08 - 0.05; p.lean = 0.42; p.sq = 1 + Math.abs(Math.cos(ph)) * 0.04; if (a.hasBall) { p.sh[2] = -0.7 + s * 0.3; p.el[1] = -1.7; } return p; }
  poseSquat(a, f = 1) { const p = this.bp(a); p.hipY = -0.2 * f; p.kn = [1.3 * f, 1.3 * f]; p.hp = [-0.9 * f, -0.9 * f]; p.lean = 0.45 * f; p.sh = [0.5 * f, 0.2, 0.5 * f, 0.2]; p.sq = 1 - 0.14 * f; if (a.cheer) { p.sh = [-2.8, 0.3, -2.8, 0.3]; } return p; }
  poseAir(a) { const p = this.bp(a); const up = a.vh > 0; p.kn = up ? [0.4, 1.4] : [1.2, 0.6]; p.hp = up ? [-0.3, -1.0] : [-0.9, -0.3]; p.sh = [-2.4, 0.4, -2.4, 0.4]; p.el = [-0.4, -0.4]; p.lean = 0.1; p.sq = up ? 1.12 : 1.04; if (a.hasBall) { p.sh = [-1.2, 0.3, -2.1, 0.6]; p.el = [-0.5, -1.1]; p.twist = -0.6; } if (a.state === 'air' && a.airF > 26) p.sq = 1; if (a.boss && this.phase === 'p2intro') { p.sh = [-1.4, 1.2, -1.4, 1.2]; } return p; }
  poseWind(a, power) {
    const p = this.bp(a); const n = power ? TUNE.pWind : TUNE.wind; const f = Math.min(1, a.st / n);
    const e = 1 - Math.pow(1 - f, 3);
    if (a.passing) { p.sh = [-0.9 * e, 0.2, -0.9 * e, -0.2]; p.el = [-0.9, -0.9]; p.lean = 0.05; p.kn = [0.3, 0.3]; return p; }
    p.twist = -0.58 * e * (power ? 1.15 : 1); p.lean = -0.10 * e; p.side = -0.06 * e;
    p.sh = [-1.1 * e, 0.32, -2.1 * e, 0.60]; p.el = [-0.45, -1.1 * e];
    p.hp = [-0.6 * e, 0.35 * e]; p.kn = [0.3, 0.75 * e]; p.hipY = -0.08 * e; p.sq = 1 - 0.07 * e;
    if (a.state === 'air' || a.h > 0) { p.hp = [-0.8, -0.2]; p.kn = [1.0, 0.6]; }
    return p;
  }
  poseRelease(a, power) { const p = this.bp(a); if (a.passing) { p.sh = [-1.6, 0.1, -1.6, -0.1]; p.el = [-0.2, -0.2]; p.lean = 0.25; return p; } p.twist = 0.50; p.lean = 0.33; p.sh = [0.35, 0.32, -1.55, 0.12]; p.el = [-0.8, -0.18]; p.hp = [0.35, -0.85]; p.kn = [0.7, 0.2]; p.hipY = -0.05; p.sq = power ? 1.12 : 1.07; return p; }
  poseRecover(a) { const p = this.bp(a); const f = Math.min(1, a.st / 10); p.twist = 0.55 * (1 - f); p.lean = 0.30 * (1 - f) + 0.12; p.sh = [0.3, 0.3, -0.9 + 0.5 * f, -0.4 * (1 - f)]; p.el = [-0.8, -0.6]; p.hp = [0.25 * (1 - f), -0.6 * (1 - f)]; p.kn = [0.5, 0.3]; return p; }
  poseCatchReady(a) { const p = this.bp(a); p.sh = [-1.45, 0.45, -1.45, 0.45]; p.el = [-0.35, -0.35]; p.kn = [0.6, 0.6]; p.hp = [-0.4, -0.4]; p.lean = 0.28; p.hipY = -0.07; p.head = 0.15; return p; }
  poseCatch(a) { const p = this.bp(a); const f = Math.min(1, a.st / 5); p.sh = [-0.85, -0.1, -0.85, -0.1]; p.el = [-1.9, -1.9]; p.lean = -0.3 * (1 - f) + 0.1; p.kn = [0.7, 0.7]; p.hp = [-0.3, -0.3]; p.sq = a.st < 3 ? 0.88 : 1; p.hipY = -0.05; return p; }
  poseBobble(a) { const p = this.bp(a); const w = Math.sin(a.st * 0.9); p.sh = [-1.9 + w * 0.6, 0.4, -1.9 - w * 0.6, 0.4]; p.el = [-0.6, -0.6]; p.lean = -0.1; p.head = -0.25; p.kn = [0.5, 0.5]; return p; }
  poseDuck(a) { const p = this.bp(a); p.hipY = -0.36; p.kn = [1.76, 1.76]; p.hp = [-1.22, -1.22]; p.lean = 0.58; p.spread = [0.22, 0.22]; p.sh = [-0.75, 0.40, -0.75, 0.40]; p.el = [-1.15, -1.15]; p.head = 0.25; return p; }
  poseHit(a) { const p = this.bp(a); const f = Math.min(1, a.st / 10); p.lean = -0.55 * (1 - f * 0.6); p.head = -0.5 * (1 - f); p.sh = [-1.6, 0.9, -1.4, 0.9]; p.el = [-0.3, -0.5]; p.kn = [0.5, 0.2]; p.hp = [0.25, -0.3]; p.sq = a.st < 3 ? 0.9 : 1; return p; }
  poseKnock(a) { const p = this.bp(a); p.lean = -1.0; p.roll = -Math.min(1.45, a.st * 0.09); p.sh = [-2.6, 1.1, -2.2, 1.0]; p.el = [-0.2, -0.3]; p.hp = [-0.8, 0.2]; p.kn = [0.9, 0.3]; p.head = -0.4; return p; }
  poseDown(a) { const p = this.bp(a); p.roll = -1.5; p.lean = 0; p.sh = [-2.9, 1.0, -2.9, 1.1]; p.el = [-0.2, -0.2]; p.hp = [-0.1, 0.1]; p.kn = [0.2, 0.4]; p.hipY = -0.62; const b = a.st < 8 ? Math.sin(a.st / 8 * Math.PI) * 0.12 : 0; p.hipY += b; return p; }
  poseGetup(a) { const p = this.bp(a); const f = Math.min(1, a.st / 16); p.roll = -1.5 * (1 - f); p.hipY = -0.62 * (1 - f) - 0.1 * Math.sin(f * Math.PI); p.lean = 0.6 * Math.sin(f * Math.PI); p.kn = [1.4 * (1 - f) + 0.3, 1.2 * (1 - f) + 0.3]; p.hp = [-1.1 * (1 - f), -0.8 * (1 - f)]; p.sh = [0.3, 0.3, 0.3, 0.3]; return p; }
  poseTired(a) { const p = this.bp(a); const t = a.st * 0.18; p.lean = 0.7 + Math.sin(t) * 0.06; p.hipY = -0.12; p.kn = [0.55, 0.55]; p.hp = [-0.5, -0.5]; p.sh = [-0.55, 0.05, -0.55, 0.05]; p.el = [-0.2, -0.2]; p.head = 0.15 + Math.sin(t) * 0.08; if (a.st % 16 === 0) this.sweat(a); return p; }
  poseLean(a) { const p = this.bp(a); p.lean = -0.55; p.twist = 0.35 * (a.leanDir || 1); p.sh = [-1.9, 0.7, -1.9, 0.7]; p.el = [-0.5, -0.5]; p.kn = [0.8, 0.4]; p.hp = [-0.2, 0.3]; p.hipY = -0.08; p.head = 0.3; return p; }
  poseTeeter(a) { const p = this.bp(a); const t = a.st * 0.55; p.lean = -0.35 + Math.sin(t * 0.5) * 0.1; p.sh = [-2.2 + Math.sin(t) * 0.9, 0.9, -2.2 - Math.sin(t) * 0.9, 0.9]; p.el = [-0.4, -0.4]; p.kn = [0.35, 0.15]; p.hp = [-0.2, 0.25]; p.head = 0.2; return p; }
  poseKO(a) { const p = this.bp(a); p.sh = [-2.2, 1.3, -2.2, 1.3]; p.el = [-0.3, -0.3]; p.kn = [0.6, 0.2]; p.hp = [-0.2, 0.2]; p.lean = -0.2; p.flip = a.st * 0.12; return p; }
  poseBench(a) { const p = this.bp(a); const t = (this.frame + a.num.length * 23) * 0.06; p.hipY = -0.16; p.kn = [0.7, 0.7]; p.hp = [-0.6, -0.6]; p.lean = 0.45; p.sh = [-0.7, 0.1, -0.7, 0.1]; p.el = [-0.5, -0.5]; p.head = -0.2 + Math.sin(t) * 0.05; return p; }
  blend(a, k) {
    const c = a.pose, t = a.tgt;
    for (const key of ['lean', 'twist', 'side', 'head', 'hipY', 'sq', 'roll', 'flip']) c[key] += (t[key] - c[key]) * k;
    for (let i = 0; i < 4; i++) c.sh[i] += (t.sh[i] - c.sh[i]) * k;
    for (let i = 0; i < 2; i++) { c.el[i] += (t.el[i] - c.el[i]) * k; c.hp[i] += (t.hp[i] - c.hp[i]) * k; c.kn[i] += (t.kn[i] - c.kn[i]) * k; c.spread[i] += (t.spread[i] - c.spread[i]) * k; }
  }
  place(a) {
    const p = a.pose;
    a.root.position.set(a.x, a.h, a.z);
    a.root.rotation.set(0, a.yaw + p.flip, 0);
    a.hips.position.y = 0.96 + p.hipY;
    a.body.rotation.set(p.roll, 0, 0);
    a.bodyY = p.roll ? -p.roll * 0.12 : 0; a.body.position.set(0, a.bodyY, 0);
    const sq = p.sq * (a.popScale ?? 1); const sx = (a.popScale ?? 1) / Math.sqrt(Math.max(0.3, p.sq));
    a.body.scale.set(sx, sq, sx);
    a.torso.rotation.set(p.lean, p.twist, p.side);
    a.headG.rotation.set(-p.head * 0.6 - p.lean * 0.3, -p.twist * 0.4, 0);
    // arms: index 0 = left (x -), 1 = right
    a.arm[0].sh.rotation.set(p.sh[0], 0, -p.sh[1]); a.arm[1].sh.rotation.set(p.sh[2], 0, p.sh[3]);
    a.arm[0].el.rotation.x = p.el[0]; a.arm[1].el.rotation.x = p.el[1];
    a.leg[0].hp.rotation.set(p.hp[0], 0, -(p.spread ? p.spread[0] : 0)); a.leg[1].hp.rotation.set(p.hp[1], 0, (p.spread ? p.spread[1] : 0));
    a.leg[0].kn.rotation.x = p.kn[0]; a.leg[1].kn.rotation.x = p.kn[1];
    if (a.pony) a.pony.rotation.x = -0.5 - p.lean * 0.6 + Math.sin(this.frame * 0.2) * 0.08 + (a.state === 'run' ? -0.5 : 0);
    if (a.cape) { a.cape.rotation.x = 0.15 + (a.state === 'run' ? 0.6 : 0) + Math.sin(this.frame * 0.15) * 0.06 + (a.vh > 0 ? -0.3 : 0.2 * Math.min(1, Math.abs(a.vh) / 5)); }
    // shadow shrinks with height
    const hs = a.h; const r = 1.05 * a.scale * (1 - Math.min(hs / 3, 0.6));
    a.shadow.position.set(a.x, 0.012, a.z); a.shadow.scale.set(r, r * 0.62, 1); a.shadow.material.opacity = 1;
    a.shadow.visible = a.root.visible && (a.popScale ?? 1) > 0.05;
  }
  spawnSprite(o) {
    const s = this.spritePool.find(x => !x.visible); if (!s) return null;
    s.visible = true; s.material.map = o.tex || this.tex.glow; s.material.color.set(o.color || '#ffffff'); s.material.opacity = o.alpha ?? 1;
    s.material.blending = o.normal ? THREE.NormalBlending : THREE.AdditiveBlending; s.material.rotation = o.rot || 0; s.material.needsUpdate = true;
    s.position.set(o.x, o.y, o.z); s.scale.set(o.s, o.s, 1);
    this.fx.push(Object.assign({ sp: s, life: o.life || 20, t: 0, vx: 0, vy: 0, vz: 0, g: 0, s0: o.s, s1: o.s1 ?? o.s, a0: o.alpha ?? 1, spin: 0 }, o));
    return s;
  }
  decal(x, z, s0, s1, life, color, alpha) {
    const d = this.decals && (this.decals.find(o => !o.m.visible) || this.decals.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b))); if (!d) return;
    Object.assign(d, { t: 0, life, s0, s1, a0: alpha }); d.m.visible = true; d.m.position.set(x, 0.02, z); d.m.scale.set(s0, s0 * 0.62, 1); d.m.material.color.set(color); d.m.material.opacity = alpha;
  }
  impact(x, y, z, power, team) {
    // hit VFX: a white-hot core, a floor shock ring in the thrower's team color, and debris; reduced motion keeps only a soft glow
    if (this.rm) { this.spawnSprite({ tex: this.tex.glow, x, y, z, s: 1.2, s1: 1.6, life: 8, color: '#ffffff', alpha: 0.6 }); return; }
    const col = team === 1 ? OPPC.sig : '#ffc83d';
    this.spawnSprite({ tex: this.tex.glow, x, y, z, s: power ? 2.2 : 1.4, s1: power ? 4.8 : 3.0, life: power ? 9 : 7, color: '#ffffff', alpha: 1, fade: 0.8 });
    this.decal(x, z, power ? 0.6 : 0.4, power ? 5.4 : 3.4, power ? 24 : 16, col, power ? 0.95 : 0.7);
    if (power) this.decal(x, z, 0.3, 2.6, 14, '#ffffff', 0.8);
    this.burst(x, y, z, col, power ? 14 : 8);
  }
  updateFX() {
    if (this.decals) for (const d of this.decals) {
      if (!d.m.visible) continue; d.t++; const k = d.t / d.life, e = 1 - Math.pow(1 - Math.min(1, k), 3), sc = d.s0 + (d.s1 - d.s0) * e;
      d.m.scale.set(sc, sc * 0.62, 1); d.m.material.opacity = d.a0 * Math.pow(Math.max(0, 1 - k), 1.4); if (d.t >= d.life) d.m.visible = false;
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t++;
      const k = f.t / f.life;
      f.vy -= f.g * DT; f.x += f.vx * DT; f.y += f.vy * DT; f.z += f.vz * DT;
      f.sp.position.set(f.x, f.y, f.z);
      const s = f.ease === 'pop' ? (k < 0.3 ? f.s0 + (f.s1 - f.s0) * (k / 0.3) : f.s1) : f.s0 + (f.s1 - f.s0) * k;
      f.sp.scale.set(s, s, 1); f.sp.material.opacity = f.a0 * (1 - Math.pow(k, f.fade || 1.5)); f.sp.material.rotation += f.spin;
      if (f.t >= f.life) { f.sp.visible = false; this.fx.splice(i, 1); }
    }
  }
  spark(x, y, z, s) {
    this.spawnSprite({ tex: this.tex.star, x, y, z, s: s * 0.4, s1: s, life: 12, ease: 'pop', rot: Math.random() * 6, spin: 0.05, normal: true, fade: 3 });
    this.spawnSprite({ tex: this.tex.glow, x, y, z, s: s * 1.4, s1: s * 2.2, life: 10, color: '#ffd36e', alpha: 0.9 });
    for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 6; this.spawnSprite({ tex: this.tex.sparkle, x, y, z, s: 0.35, s1: 0.1, life: 14 + (Math.random() * 8 | 0), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 + 2, vz: 0, g: 18, color: i % 2 ? '#ffc83d' : '#ffffff' }); }
  }
  burst(x, y, z, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4; this.spawnSprite({ tex: i % 3 ? this.tex.sparkle : this.tex.glow, x, y, z, s: 0.4, s1: 0.05, life: 22 + (Math.random() * 10 | 0), vx: Math.cos(a) * v, vy: 2 + Math.random() * 4, vz: Math.sin(a) * v * 0.5, g: 8, color }); } }
  sparkle(x, y, z) { this.spawnSprite({ tex: this.tex.sparkle, x, y, z, s: 0.5, s1: 0.1, life: 24, vy: 0.8, color: '#fff6c8', spin: 0.1 }); }
  dust(a, n = 2) { this.dustAt(a.x, a.z, n); }
  dustAt(x, z, n = 2) { for (let i = 0; i < n; i++) this.spawnSprite({ tex: this.tex.dust, x: x + (Math.random() - 0.5) * 0.4, y: 0.15, z: z + (Math.random() - 0.5) * 0.3, s: 0.35, s1: 0.9, life: 18, vx: (Math.random() - 0.5) * 2, vy: 0.6, normal: true, alpha: 0.5, color: this.mode === 'vc' ? '#ffe8f2' : '#f3dcc0' }); }
  trail(B) { this.spawnSprite({ tex: this.tex.glow, x: B.x, y: B.h, z: B.z, s: B.type === 'comet' ? 0.9 : 0.6, s1: 0.1, life: this.rm ? 4 : 12, color: B.trailC, alpha: 0.8 }); }
  ringFx(a, color) { this.spawnSprite({ tex: this.tex.ring, x: a.x, y: a.h + 1.2 * a.scale, z: a.z, s: 0.4, s1: 2.6, life: 14, color, fade: 1 }); }
  aura(a) { for (let i = 0; i < 3; i++) this.spawnSprite({ tex: this.tex.glow, x: a.x, y: a.h + 1.1, z: a.z, s: 1.8 + i, s1: 3.2 + i, life: 14 + i * 4, color: a.team === 0 ? '#ffc83d' : OPPC.sig, alpha: 0.45 }); }
  sweat(a) { this.spawnSprite({ tex: this.tex.glow, x: a.x + (Math.random() - 0.5) * 0.3, y: a.h + 2.0 * a.scale, z: a.z, s: 0.22, s1: 0.12, life: 20, vx: (Math.random() - 0.5) * 2, vy: 2.5, g: 10, color: '#9fe8ff', normal: true }); }
  shakeScreen(px, f) { if (this.rm || !px) return; this.shakeAmp = Math.max(this.shakeAmp, px); this.shakeF = Math.max(this.shakeF, f); this.shakeMax = this.shakeF; }
  flash(a, inv) { if (this.rm) return; const el = this.$.flash; el.classList.toggle('inv', !!inv); el.style.transition = 'none'; el.style.opacity = String(a); requestAnimationFrame(() => { el.style.transition = 'opacity .18s'; el.style.opacity = '0'; }); }
  pop(a, text, cls = '') { const v = this.toScreen(a.x, a.h + 2.4 * a.scale, a.z); this.popAt(v.x, v.y, text, cls); }
  popCenter(text, cls = '', y = 0.42, dur = 1.6) { this.popAt(this.W / 2, this.H * y, text, cls, dur); }
  popAt(x, y, text, cls, dur = 0.9) {
    x = Math.max(70, Math.min((this.W || 400) - 70, x));
    const el = document.createElement('div'); el.className = 'fbg-pop ' + cls; el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px'; if (dur !== 0.9) el.style.animationDuration = dur + 's';
    this.$.world.appendChild(el); { const hw = el.offsetWidth / 2 + 8; if (x - hw < 0) el.style.left = hw + 'px'; else if (x + hw > this.W) el.style.left = (this.W - hw) + 'px'; } setTimeout(() => el.remove(), dur * 1000 + 50);
    if (/big/.test(cls)) this.say(text);
  }
  say(t) { this.$.sr.textContent = t; }
  toScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H }; }


  // ------------------------------------------------ stands: SIN CITY CLASSIC banner and fan signs (CanvasTexture planes, crisp text)
  buildStands() {
    this.standsG = new THREE.Group(); this.scene.add(this.standsG);
    const tq = this.texQ;
    this.bannerTex = [canvasTex(1024, 192, () => { }, tq), canvasTex(1024, 192, () => { }, tq)];
    this.neonTex = canvasTex(1024, 300, () => { }, tq);
    this.bannerMat = new THREE.MeshBasicMaterial({ map: this.bannerTex[0], transparent: true, depthWrite: false });
    this.banner = new THREE.Mesh(GEO.plane, this.bannerMat); this.banner.rotation.x = -PITCH; this.banner.renderOrder = 3; this.standsG.add(this.banner);
    this.signs = SIGNS.map((s, i) => {
      const tex = canvasTex(256, 216, () => { }, tq);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const g = new THREE.Group(); const m = new THREE.Mesh(GEO.plane, mat); m.position.y = -0.18; g.add(m); g.rotation.x = -PITCH;
      this.standsG.add(g);
      return { def: s, tex, mat, g, m, ph: i * 1.7 + 0.3, sp: 1.6 + (i % 3) * 0.35, wig: 0, bx: 0, by: 0 };
    });
    this.buildProps();
    this.drawBanner();
  }
  signInk() {
    // marker colors on a white card: the look's two most legible colors against white
    const cs = this.kit.all.slice().sort((a, b) => contrast(b, '#ffffff') - contrast(a, '#ffffff'));
    const ink = contrast(cs[0], '#ffffff') >= 3 ? cs[0] : shade(cs[0], -0.55);
    let ink2 = cs[1] && contrast(cs[1], '#ffffff') >= 2.4 ? cs[1] : (this.kit.accent && contrast(this.kit.accent, '#ffffff') >= 2.4 ? this.kit.accent : shade(ink, 0.25));
    if (ink2 === ink) ink2 = shade(ink, 0.3);
    return { ink, ink2, band: this.kit.base === '#ffffff' || lum(this.kit.base) > 0.85 ? this.kit.trim : this.kit.base, band2: this.kit.trim };
  }
  drawSigns() {
    if (!this.signs || !this.kit) return;
    const K = this.signInk();
    const MK = (s) => `${s}px 'Permanent Marker', 'Marker Felt', 'Comic Sans MS', cursive`;
    for (const sg of this.signs) {
      sg.tex.userData.redraw((c, w, h) => {
        c.clearRect(0, 0, w, h);
        if (sg.def.style) return this.drawStyledSign(sg, c, w, h);
        // stick
        c.fillStyle = '#5a3a22'; c.fillRect(w / 2 - 7, 150, 14, 66); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(w / 2 + 2, 150, 5, 66);
        // card with a slight hand-cut tilt
        c.save(); c.translate(w / 2, 82); c.rotate(((sg.ph * 13) % 7 - 3) * 0.006);
        c.fillStyle = 'rgba(10,4,16,.35)'; c.fillRect(-120, -72, 246, 152);
        c.fillStyle = '#fbfaf6'; c.fillRect(-124, -78, 248, 152);
        c.fillStyle = K.band; c.fillRect(-124, -78, 248, 14); c.fillStyle = K.band2; c.fillRect(-124, 60, 248, 14);
        c.lineWidth = 4; c.strokeStyle = K.band; c.strokeRect(-122, -76, 244, 148);
        const lines = sg.def.t; const one = lines.length === 1;
        lines.forEach((ln, i) => {
          let fs = one ? 64 : (i === 0 ? 46 : 38); c.font = MK(fs);
          const mw = 220; let tw = c.measureText(ln).width; const sx = tw > mw ? mw / tw : 1;
          c.save(); c.translate(0, one ? 22 : (i === 0 ? -6 : 42)); c.scale(sx, 1); c.rotate(i ? 0.02 : -0.03);
          c.textAlign = 'center'; c.fillStyle = i === 0 ? K.ink : K.ink2; c.fillText(ln, 0, 0); c.restore();
        });
        c.restore();
      });
    }
  }
  drawBanner() {
    if (!this.bannerTex) return;
    const vc = this.mode === 'vc';
    if (!vc) {
      [0, 1].forEach(phase => this.bannerTex[phase].userData.redraw((c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#120818'; c.fillRect(0, 0, w, h);
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1663'); g.addColorStop(1, '#170b22'); c.fillStyle = g; c.fillRect(22, 22, w - 44, h - 44);
        c.lineWidth = 6; c.strokeStyle = '#ffc83d'; c.strokeRect(22, 22, w - 44, h - 44);
        // chasing bulbs around the frame
        const bulbs = []; for (let x = 18; x <= w - 18; x += 30) { bulbs.push([x, 11]); bulbs.push([x, h - 11]); } for (let y = 41; y <= h - 41; y += 30) { bulbs.push([11, y]); bulbs.push([w - 11, y]); }
        bulbs.forEach(([x, y], i) => { const on = (i + phase) % 2 === 0; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fillStyle = on ? '#fff3c4' : '#6b4a1a'; if (on) { c.shadowBlur = 12; c.shadowColor = '#ffc83d'; } c.fill(); c.shadowBlur = 0; });
        c.textAlign = 'center'; c.textBaseline = 'middle';
        drawBulbText(c, this.wkMatch && this.wkMatch.day === 'sun' ? 'PLAN FOR EXTRA TIME' : MARQUEE[(this.marqI || 0) % MARQUEE.length], w / 2, h / 2 + 8, w - 170, 128);
        // diamonds as end caps
        for (const x of [52, w - 52]) { c.save(); c.translate(x, h / 2); c.rotate(Math.PI / 4); c.fillStyle = '#ff3b2f'; c.fillRect(-11, -11, 22, 22); c.restore(); }
      }));
      this.bannerMat.map = this.bannerTex[0]; this.bannerMat.blending = THREE.NormalBlending;
    } else {
      this.neonTex.userData.redraw((c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.fillStyle = 'rgba(22,8,44,.62)'; c.beginPath(); c.roundRect ? c.roundRect(40, 18, w - 80, h - 36, 40) : c.rect(40, 18, w - 80, h - 36); c.fill();
        const neon = (draw, col) => { c.save(); c.shadowColor = col; c.shadowBlur = 30; c.strokeStyle = col; c.lineWidth = 10; draw('s'); c.shadowBlur = 14; draw('s'); c.restore(); c.save(); c.strokeStyle = '#fff6fb'; c.lineWidth = 3; draw('s'); c.restore(); };
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = "150px Yellowtail, 'Brush Script MT', 'Snell Roundhand', cursive";
        const t1 = 'Welcome'; const s1 = Math.min(1, 760 / c.measureText(t1).width);
        neon((m) => { c.save(); c.translate(w / 2, 118); c.scale(s1, 1); c.rotate(-0.04); c.strokeText(t1, 0, 0); c.restore(); }, '#ff3fa1');
        c.font = font(86); const t2 = 'T O   T H E   F A M I L Y'; const s2 = Math.min(1, 620 / c.measureText(t2).width);
        neon((m) => { c.save(); c.translate(w / 2, 232); c.scale(s2, 1); c.strokeText(t2, 0, 0); c.restore(); }, '#5fd3e0');
      });
      this.bannerMat.map = this.neonTex; this.bannerMat.blending = THREE.NormalBlending;
    }
    this.bannerMat.needsUpdate = true;
    this.layoutStands();
  }
  layoutStands() {
    if (!this.standsG || !this.bd) return;
    const v = this.view, vc = this.mode === 'vc', p = new THREE.Vector3();
    // stands group is offset by parallax in render(); children use plate coordinates
    if (!vc) { const bw = 8.6; this.banner.scale.set(bw, bw * 192 / 1024, 1); this.standPoint(0, 0.6, p, 0.3); this.banner.position.copy(p); }
    else { const bw = 8.4; this.banner.scale.set(bw, bw * 300 / 1024, 1); this.standPoint(0, 0.6, p, 0.3); this.banner.position.copy(p); }
    this.banner.rotation.x = -PITCH;
    // 15 signs across the front of the stands: player signs mixed with the allusion signs and two for the visiting team
    const order = [0, 10, 1, 13, 2, 3, 11, 8, 4, 14, 5, 12, 6, 7, 9], spots = order.map((_, k) => [-0.44 + k * 0.88 / 14, k % 2 ? 0.86 : 0.8]);
    const phoneSet = [3, 10, 0, 13, 7, 11, 6];
    const narrowSpots = [[-0.27, 0.84], [-0.18, 0.87], [-0.09, 0.84], [0.0, 0.87], [0.09, 0.84], [0.18, 0.87], [0.27, 0.84]];
    const sc = v.wide ? 0.95 : 1.15;
    const show = v.wide ? this.signs.map((_, i) => i) : phoneSet;
    this.layoutProps();
    this.signs.forEach((sg, i) => {
      const k = show.indexOf(i); sg.g.visible = k >= 0; if (k < 0) return;
      if (sg.def.who === '*p2' && OPPC.id !== 'glitches') { sg.g.visible = false; return; }
      const sp = v.wide ? spots[order.indexOf(i)] : narrowSpots[k];
      this.standPoint(sp[0], sp[1], p, 0.15); sg.bx = p.x; sg.by = p.y;
      sg.m.scale.set(1.78 * sc, 1.5 * sc, 1);
      sg.g.position.copy(p);
    });
  }
  crowdReact(kind) {
    // the home crowd backs FINAL BOSS: mood -1 (stunned) .. +1 (roaring), excitement 0..1
    const K = { catch: [0.6, 0.6], oppcatch: [-0.5, 0.4], plus: [0.3, 0.35], bigplus: [0.65, 0.75], minus: [-0.25, 0.2], bigminus: [-0.5, 0.4],
      clutch: [1, 1], tide: [1, 1], bigmoment: [1, 1], oppbig: [-0.9, 0.7], opptide: [-0.85, 0.6], lead: [0.95, 0.95], opplead: [-0.75, 0.5], gamewin: [0.9, 0.9], gamelose: [-0.7, 0.4], matchwin: [1, 1], matchlose: [-1, 0.3] }[kind];
    if (!K) return;
    this.mood = Math.max(-1, Math.min(1, (this.mood || 0) * 0.35 + K[0])); this.exc = Math.max(this.exc || 0, K[1]);
    const S = this.sfx, big = Math.abs(K[0]) >= 0.85;
    if (K[0] > 0) { S.roar(K[1]); if (big) { S.chant(); if (this.signs) for (const sg of this.signs) sg.wig = 1; } if (kind === 'bigplus') S.ooh(); }
    else S.groan(Math.min(1, -K[0] + 0.2));
    const VO = { tide: ['vo_tide', 3], opptide: ['vo_opptide', 3], clutch: ['vo_clutch', 3], lead: ['vo_lead', 3] }[kind];
    if (VO) this.sfx.vo(VO[0], VO[1]); else if (kind === 'catch' && Math.random() < 0.45) this.sfx.vo('vo_catch', 1);
    if (kind === 'tide') { this.popBrush('THE TIDE TURNS!', 'THE CROWD IS ON ITS FEET', '', 0.3, 1.8); this.ref('FINAL BOSS fights back'); }
    if (kind === 'opptide') { this.popBrush('UH OH...', '' + this.opp.name + ' ARE COMING BACK', 'lime', 0.3, 1.6); }
    if (kind === 'clutch') this.popBrush('CLUTCH!', 'LAST ONE STANDING', '', 0.3, 1.6);
    if (big && K[0] > 0 && !this.rm) this.flash(0.12);
  }
  bigMoment(kind, team, who, quiet) {
    // double out, triple out and a deflection SAVE: the top crowd tier, the announcer, a camera punch and confetti in the team's color AND shape
    const home = team === 0;
    this.crowdReact(home ? 'bigmoment' : 'oppbig');
    this.sfx.vo(kind === 'save' ? 'vo_save' : kind === 'triple' ? 'vo_triple' : 'vo_double', 4);
    if (!quiet) this.popBrush(kind === 'save' ? 'SAVE!' : kind === 'triple' ? 'TRIPLE OUT!' : 'DOUBLE OUT!', kind === 'save' ? 'CAUGHT OFF THE DEFLECTION' : (home ? 'FINAL BOSS' : this.opp.short || '' + this.opp.short + '') + ' CLEAN UP', home ? 'gold' : 'lime', 0.3, 1.7);
    if (who) this.punch(who.x, who.z, kind === 'triple' ? 1.4 : 1.1);
    if (!this.rm && who) for (let i = 0; i < (kind === 'triple' ? 34 : 22); i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4.5; this.spawnSprite({ tex: home ? this.tex.crown : (this.tex.t1 || this.tex.pixel), x: who.x, y: who.h + 2, z: who.z, s: 0.32, s1: 0.22, life: 40 + (Math.random() * 20 | 0), vx: Math.cos(a) * v, vy: 4 + Math.random() * 4, vz: Math.sin(a) * v * 0.5, g: 9, color: home ? '#ffc83d' : OPPC.sig, normal: true, spin: 0.15 }); }
    this.addMomentum(team, kind === 'triple' ? 0.75 : 0.55);
    this.qaLog('big', { kind, team });
  }
  addMomentum(team, amt) {
    // one scalar: + favors FINAL BOSS, - the opponent; it decays over several seconds; a flip earns an announcer callback
    const before = this.mom || 0; this.mom = Math.max(-1, Math.min(1, before + (team === 0 ? amt : -amt)));
    if (Math.abs(this.mom) > 0.4 && Math.sign(this.mom) !== Math.sign(before) && Math.abs(before) > 0.15) {
      const lines = this.mom > 0 ? ['vo_mo1', 'vo_mo2', 'vo_mo3'] : ['vo_mo2', 'vo_mo4'];
      setTimeout(() => this.sfx.vo(lines[(Math.random() * lines.length) | 0], 3), 1200); this.awStat('momFlips');
    }
  }
  momLift(a) {
    // a small, temporary lift for the hot team and a slight dip for the other (kept modest so skill decides games)
    const m = this.mom || 0; if (Math.abs(m) < 0.4) return 0;
    const hot = (m > 0 ? 0 : 1) === a.team; return hot ? 0.08 * Math.abs(m) : -0.05 * Math.abs(m);
  }
  checkTide() {
    // a swing of 2 or more live players back to level (or better) is a tide turn
    if (this.phase !== 'play') return;
    const t = this.tide || (this.tide = { low: 0, high: 0 });
    const adv = this.liveCount(0) - this.liveCount(1);
    t.low = Math.min(t.low, adv); t.high = Math.max(t.high, adv);
    if (t.low <= -2 && adv >= 0 && this.liveCount(0) > 0) { t.low = t.high = adv; this.crowdReact('tide'); }
    else if (t.high >= 2 && adv <= 0 && this.liveCount(1) > 0) { t.low = t.high = adv; this.crowdReact('opptide'); }
  }
  crowdTick() {
    this.mood = (this.mood || 0) * 0.994; this.exc = (this.exc || 0) * 0.988;
    if (this.phase === 'play' && !this.paused) this.mom = (this.mom || 0) * 0.9965;   // about 3 s half life
    if (this.$.mom0) { const m = this.mom || 0, k = Math.round(m * 100); if (k !== this._momK) { this._momK = k; this.$.mom0.style.transform = `scaleX(${Math.max(0, m).toFixed(3)})`; this.$.mom1.style.transform = `scaleX(${Math.max(0, -m).toFixed(3)})`; this.root.classList.toggle('mom0', m > 0.4); this.root.classList.toggle('mom1', m < -0.4); RIM_U.strength.value = 0.85 + (m > 0.4 ? 0.5 * m : 0); RIM_T1.strength.value = 0.95 + (m < -0.4 ? -0.5 * m : 0); } }
    const m = this.mood, e = this.exc;
    this.crowdMood.value = m; this.crowdExc.value = e; this.crowdAmp.value = (this.rm || this.tier === 'low') ? 0 : 1;
    if (!this.$.crowd) { this.sfx.mood(m, e, this.phase !== 'title' && this.phase !== 'result' && !this.paused); return; }
    const word = m > 0.6 ? 'CROWD ROARING' : m > 0.25 ? 'CROWD CHEERING' : m < -0.5 ? 'CROWD STUNNED' : m < -0.2 ? 'CROWD GROANING' : 'CROWD WATCHING';
    if (word !== this.crowdWord) { this.crowdWord = word; this.$.crowdL.textContent = word; this.$.crowd.classList.toggle('up', m > 0.25); this.$.crowd.classList.toggle('down', m < -0.2); }
    this.$.crowdB.style.left = (50 + 46 * m).toFixed(1) + '%';
    this.sfx.mood(m, e, this.phase !== 'title' && this.phase !== 'result' && !this.paused);
  }
  cheer(name) { if (!this.signs) return; for (const sg of this.signs) if (sg.def.who === name) sg.wig = 1; }
  updateStands() {
    if (!this.standsG) return;
    const v = this.view;
    const t = this.frame / 60, rm = this.rm;
    if (this.mode !== 'vc') { if (!rm && this.frame % 14 === 0) { this.bannerPh = 1 - (this.bannerPh || 0); this.bannerMat.map = this.bannerTex[this.bannerPh]; } }
    else this.bannerMat.opacity = rm ? 1 : (Math.sin(t * 37) > 0.985 ? 0.55 : 1);
    // arena life: the rig's light shafts drift slowly and brighten with the crowd; the haze breathes with excitement
    if (this.shafts && !rm) {
      const ex = this.crowdExc ? this.crowdExc.value : 0, up = this.crowdMood ? Math.max(0, this.crowdMood.value) : 0;
      this.shafts.forEach((m, i) => { m.rotation.z = m.userData.r0 + Math.sin(t * 0.35 + i * 1.9) * 0.045; m.material.opacity = 0.085 + 0.05 * ex * (0.5 + up) + 0.015 * Math.sin(t * 0.8 + i); });
      this.haze.material.opacity = 0.11 + 0.06 * ex;
    }
    this.updateProps();
    for (const sg of this.signs) {
      if (!sg.g.visible) continue;
      if (rm) { sg.g.position.y = sg.by; sg.g.rotation.z = 0; sg.wig = 0; continue; }
      const bob = Math.sin(t * sg.sp + sg.ph) * 0.07, w = sg.wig;
      sg.g.position.y = sg.by + bob + Math.abs(Math.sin(t * 14)) * 0.42 * w;
      sg.g.rotation.z = Math.sin(t * 0.9 + sg.ph) * 0.05 + Math.sin(t * 24) * 0.28 * w;
      sg.wig = w > 0.01 ? w * 0.975 : 0;
    }
  }

  // ------------------------------------------------ balls and teams
  makeBalls() {
    this.balls = [];
    const tex = ballTex();
    for (let i = 0; i < RULES.balls; i++) {
      const mat = toon('#ffffff', tex);
      const mesh = part(geos().ball, mat, this.scene, [0, 0.22, 0]);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: '#ff8a5a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.renderOrder = 4; this.scene.add(glow);
      const shadow = new THREE.Mesh(GEO.plane, this.shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; this.scene.add(shadow);
      const b = { id: i, mesh, mat, glow, shadow, trail: this.makeTrail(), hist: [] };
      this.resetBall(b); this.balls.push(b);
    }
  }
  makeTrail() {
    // camera-facing ribbon behind a ball in flight: tapers to the tail, fades by age, additive
    const N = TRAIL_N, geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('a', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < N - 1; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color('#ffffff') }, op: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 col; uniform float op; varying float vA; void main(){ gl_FragColor = vec4(col * vA * op, 1.0);\n#include <colorspace_fragment>\n}' });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 4; m.visible = false; this.scene.add(m); return m;
  }
  updateTrails() {
    const cp = this.camera.position, tmp = this._tv || (this._tv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    for (const B of this.balls) {
      const H = B.hist, m = B.trail;
      if (B.state !== 'flight' && H.length) H.shift();
      if (H.length < 3) { m.visible = false; continue; }
      const pos = m.geometry.attributes.position, al = m.geometry.attributes.a, n = H.length, N = TRAIL_N;
      const pow = B.power || B.type === 'zig' || B.type === 'comet', w0 = (pow ? 0.3 : 0.15) * (this.rm ? 0.7 : 1);
      for (let i = 0; i < N; i++) {
        const k = Math.min(i, n - 1), p = H[k], q = H[Math.min(n - 1, k + 1)], o = H[Math.max(0, k - 1)];
        tmp[0].set(q.x - o.x, q.h - o.h, q.z - o.z); tmp[1].set(cp.x - p.x, cp.y - p.h, cp.z - p.z); tmp[2].crossVectors(tmp[0], tmp[1]).normalize();
        const f = k / (n - 1), w = w0 * (0.15 + 0.85 * f);
        pos.setXYZ(i * 2, p.x + tmp[2].x * w, p.h + tmp[2].y * w, p.z + tmp[2].z * w); pos.setXYZ(i * 2 + 1, p.x - tmp[2].x * w, p.h - tmp[2].y * w, p.z - tmp[2].z * w);
        const av = i < n ? Math.pow(f, 1.6) : 0; al.setX(i * 2, av); al.setX(i * 2 + 1, av);
      }
      pos.needsUpdate = true; al.needsUpdate = true;
      m.material.uniforms.col.value.set(pow ? B.trailC : (B.type === 'pass' ? '#bfe9ff' : '#fff1d6')); m.material.uniforms.op.value = pow ? 0.95 : (B.type === 'pass' ? 0.25 : 0.5);
      m.visible = true;
    }
  }
  settleBall(b) {
    if (b.pop) { for (const v of b.pop.victims) { if (v.pendingOut === b) { v.pendingOut = null; if (v.role === 'in' && v.state === 'stagger') v.set('idle'); } } }
    for (const a of this.all || []) { if (a.pendingOut === b) a.pendingOut = null; if (a.ai && a.ai.react && a.ai.react.B === b) { a.ai.react = null; a.ai.press = -1; } }
    b.pending = null; b.pop = null; b.land = null; b.claim = null; b.target = null; b.hitSet = new Set(); if (b.landRing) b.landRing.visible = false;
  }
  resetBall(b) {
    if (b.pop || b.pending) this.settleBall(b);
    if (b.hist) b.hist.length = 0;
    b.mesh.visible = b.shadow.visible = b.glow.visible = true;
    Object.assign(b, { state: 'rest', x: 0, z: 0, h: 0.22, vx: 0, vz: 0, vh: 0, holder: null, thrower: null, team: -1, live: false, crossed: false, cleared: true, rushTeam: -1,
      type: 'normal', power: false, age: 0, hitSet: new Set(), target: null, pending: null, squash: 0, spin: b.spin || 0, trailC: '#ffffff', bounces: 0, claim: null, outF: 0, flash: 0, grav: 0, fromSide: 0, deflected: false, defSide: 0, forceHead: false, restF: 0, sig: null, curve: null, wob: 0, hard: false, pop: null, land: null });
  }
  buildTeams() {
    this.opp = oppFrom(this.opts.opponent);
    const k0 = kitFrom(DEFAULT_LOOK.colors), k1 = kitFrom(this.opp.colors);
    this.kit1 = k1;
    this.all = []; this.teams = [[], []];
    for (const def of ROSTER) { const a = new Athlete(this, def, 0); a.drawKit(k0); this.teams[0].push(a); this.all.push(a); }
    this.makeOppTeam(); this.all.push(...this.teams[1]);
    this.oppStyle = this.opts.oppStyle && OPP_STYLES[this.opts.oppStyle] ? this.opts.oppStyle : (this.opp.style && OPP_STYLES[this.opp.style] ? this.opp.style : 'glitches');
    this.assignRatings();
    this.tactic = [TACTICS.finalboss, Object.assign({}, TACTICS[this.oppStyle] || TACTICS.glitches, this.opp.tactic || {})];
    this.coach = [{}, {}];
    this.footTex = radialTex([[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.08)'], [0.78, 'rgba(255,255,255,0.75)'], [0.9, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    this.ringTex = canvasTex(128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.arc(64, 64, 50, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 0.25; c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.fill(); });
    for (const a of this.all) this.athleteExtras(a);
    this.buildOfficials();
    this.applyOppLook();
  }
  abil(kind, team) { if (team !== 1) return 0; let v = 0; for (const x of (this.opp.abilities || [])) if (x.kind === kind) v += x.amount; return v + (this.AB ? this.abExtra(kind) : 0); }
  abilityTell(a, kind) {
    // the tell: a short call-out in the team's color and shape (plus its sound if the team provides one), at most every few seconds
    const x = (this.opp.abilities || []).find(y => y.kind === kind); if (!x || a.team !== 1) return;
    this.abilT = this.abilT || {}; if (this.frame < (this.abilT[kind] || 0)) return; this.abilT[kind] = this.frame + 180;
    this.pop(a, x.tell.text || x.id, 'small lime sh1'); if (x.tell.sfx) this.sfx.smp(x.tell.sfx, 0.8); this.awStat('ability_' + kind);
  }
  assignRatings() {
    const off = DIFF_OFF[this.opts.difficulty] || 0, st = OPP_STYLES[this.oppStyle] || OPP_STYLES.glitches;
    for (const a of this.teams[0]) { const s = FB_STRENGTH[a.key] || {}; a.rt = Object.assign({}, FB_BASE, s); a.arch = s.arch || 'balanced'; delete a.rt.arch; }
    for (const a of this.teams[1]) {
      const W = this.opp.wk && this.opp.id !== 'glitches' ? this.opp.wk : null;
      if (W) {
        // weekend team: its own ratings (teams.json), a per-round offset (WK_OFF, tuned by simulation), never above the GLITCH KING
        const wo = (WK_OFF[W.rank] || 0) + off * 0.5, src = a.boss ? W.brt : W.rt; a.rt = {};
        for (const k in BOSS_RT) a.rt[k] = Math.min(clampR(src[k] + (a.boss ? 0 : (hash01(a.key + k) - 0.5) * 0.12) + wo), BOSS_RT[k] - 0.04);
        a.arch = a.boss ? 'star' : (a.rt.power >= 0.84 ? 'power arm' : (a.rt.catch >= 0.7 ? 'catcher' : 'scrapper')); continue;
      }
      if (a.boss) { a.rt = {}; for (const k in BOSS_RT) a.rt[k] = clampR(BOSS_RT[k] + off * 0.5); a.arch = 'boss'; continue; }
      const given = a.def && a.def.rt;
      const r = {}; for (const k in st.base) r[k] = Math.min(clampR((given && given[k] != null ? given[k] : st.base[k] + (hash01(a.key + k) - 0.5) * 2 * ((st.spreadK && st.spreadK[k]) || st.spread)) + off), BOSS_RT[k] - 0.04);
      r.foot = Math.min(BOSS_RT.foot - 0.02, r.foot + this.abil('dodgeBias', 1));
      a.rt = r; a.arch = r.power >= 0.84 ? 'power arm' : (r.catch >= 0.7 ? 'catcher' : 'scrapper');
    }
  }
  inPlayers(team) { return this.teams[team].filter(a => a.active && a.role === 'in'); }
  liveCount(team) { return this.teams[team].filter(a => a.role === 'in' || a.role === 'returning').length; }

  // ------------------------------------------------ match flow
  resetMatch() {
    this.clock = RULES.match; this.points = [0, 0]; this.gameNo = 0; this.ot = false; this.otClock = RULES.ot; this.sudden = false; this.over = false;
    this.mlog = []; this.mseq = 0; this.pm = null; this.score = 0; this.combo = 0; this.stats = { hits: 0, catches: 0, power: 0, kos: 0, bestCombo: 0, headshots: 0, backIn: 0, blocks: 0 };
    this.handshake = null; this.keys = {}; this.edge = {}; this.paused = false;
    this.rushWins = [0, 0];
    this.timeoutUsed = false; this.timeoutT = 0; this.result = null; this.lastBig = -1; this.lastCtl = -1;
    this.setupGame();
    this.updateHUD(true);
  }
  setupGame() {
    this.gameNo++; this.p2 = false; this.mom = 0; this.coach = [{}, {}]; this.ctlTeam = -1; this.ctlT = 0; this.lastCtlSec = -1; this.gameEndT = 0; this.rushT = 999; this.falseStart = false;
    this.$.boss.classList.remove('on'); this.$.ctl.hidden = true;
    this.queue = [[], []]; this.outSequence = 0; this.tide = { low: 0, high: 0 };
    for (const t of [0, 1]) {
      const ps = this.teams[t];
      ps.forEach((a, i) => {
        a.reset(); a.active = true; a.root.visible = true; a.shadow.visible = true; a.role = 'in';
        a.x = a.side * (HX - 0.45); a.z = -HZ + 0.6 + i * ((2 * HZ - 1.2) / (ps.length - 1));
        a.ai.home = [a.side * (3.8 + (i % 3) * 1.7), Math.max(-(HZ - 0.6), Math.min(HZ - 0.6, a.z * 0.95))];
        a.yaw = a.team === 0 ? 100 * DEG : -100 * DEG;
      });
    }
    for (const b of this.balls) { this.resetBall(b); b.mesh.visible = true; }
    if (this.signs && this.gameNo > 1) this.rotateSigns();
    if (this.abState) { this.abState.key = false; this.abState.mid = false; this.abState.burstUsed = false; }
    this.user = this.teams[0].find(a => a.key === this.controlKey) || this.teams[0][3];
    this.renderLive();
  }
  placeRushBalls(w) {
    this.lastCtl = w;
    const z0 = w === 0 ? [1.0, 2.3, 3.6] : [1.7, 3.3];
    const z1 = w === 1 ? [-1.0, -2.3, -3.6] : [-1.7, -3.3];
    let i = 0;
    for (const z of z0) { const b = this.balls[i++]; this.resetBall(b); b.z = z; b.rushTeam = 0; }
    for (const z of z1) { const b = this.balls[i++]; this.resetBall(b); b.z = z; b.rushTeam = 1; }
  }
  start() {
    if (this.dead) return;
    if (!this.wkMatch && this.opp && (this.opp.id || 'glitches') !== 'glitches') this.setOpponent(null);   // quick match: THE GLITCHES, one tap from the title
    this.$.card.classList.remove('is-wk');
    this.sfx.enable(this.sfx.on);
    this.resetMatch();
    this.paused = false; this.$.ov.hidden = true; this.$.pause.textContent = 'Time out';
    if (this.native && this.opts.autoFull !== false) this.setFull(true);
    this.phase = 'intro'; this.introT = 0;
    this.showVS();
    this.sfx.stinger(); this.sfx.vo('vo_open', 3); this.sfx.music('music_match');
    this.$.stage.focus({ preventScroll: true });
    this.checkRotate();
  }
  showVS() {
    const t0 = this.teams[0], t1 = this.teams[1];
    this.$.vs.innerHTML = `<div class="fbg-vsp l"><small>${esc(this.look.name || '')}</small><h3>FINAL BOSS</h3><ul class="two">${t0.map(a => `<li${a === this.user ? ' class="me"' : ''}><span>#${a.num}</span>${a.name}</li>`).join('')}</ul></div>
      <div class="fbg-vsp r"><small>${this.wkMatch ? esc(this.wkMatch.label) : 'Boss team'}</small><h3>${this.opp.name}</h3><ul class="two">${t1.map(a => `<li>${a.name}<span>#${a.num}</span></li>`).join('')}</ul></div><div class="fbg-vsx">VS</div>`;
    this.$.vs.hidden = false;
    if (this.opp.wk && this.opp.id !== 'glitches') { const id = this.opp.id; setTimeout(() => { if (this.phase === 'intro' && this.opp.id === id) this.sfx.vo('intro_' + id + '_1', 4); }, 1400); }
  }
  startBrief() {
    if (this.gameNo % 2 === 1) this.preloadFact();
    if (this.opp.wk && this.opp.id !== 'glitches' && this.gameNo === 3) this.sfx.vo('intro_' + this.opp.id + '_2', 2);
    if (this.factWanted()) { this.phase = 'brief'; this.$.vs.hidden = true; return this.startFact(); }   // a Fun Fabulous Fact instead of the rules flash on games 2, 4, 6
    // the rules card before every game: what to do on GO, how you get out, and the controls
    this.phase = 'brief'; this.briefT = 0; this.briefGo = false;
    if (this.ot) this.sfx.vo('vo_ot', 3); else if (this.lastCtl >= 0) this.sfx.vo('vo_next', 1);
    const touch = this.root.classList.contains('has-touch');
    const title = this.ot ? 'OVERTIME: 60 S' : 'GAME ' + this.gameNo;
    const rules = [['rush', 'Rush right only', 'on GO, run only for the balls on your right as you face the other team'], ['line', 'Clear the line', 'carry a rushed ball past your attack line before you throw'], ['catch', 'Catch = back in', 'the thrower is out and your next teammate returns'],
      ['head', 'No headshots', 'a standing headshot puts the thrower out'], ['clock', '15 s control', '3 or more balls on your side, held or loose, starts 15 s. Drop to 2 and it resets. At 0, all 5 balls go over'], ['back', 'Back line only', 'leave only out the back, 10 s to return']];
    const ctl = touch ? 'Left pad moves (flick to dash). <b>THROW</b>, <b>CATCH</b> (hold to duck), <b>JUMP</b>, <b>PASS</b>.'
      : '<span class="fbg-kmtext">' + this.kmLine() + '</span>, double-tap to dash. <span class="fbg-kbd">J</span>' + (this.native ? '/<span class="fbg-kbd">Left click</span>' : '') + ' throw, <span class="fbg-kbd">K</span>' + (this.native ? '/<span class="fbg-kbd">Right click</span>' : '') + ' catch (hold to duck), <span class="fbg-kbd">L</span> jump, <span class="fbg-kbd">Shift</span> or <span class="fbg-kbd">E</span> pass, <span class="fbg-kbd">Q</span> switch.';
    this.$.vs.innerHTML = `<div class="fbg-rps fbg-brief" role="dialog" aria-label="${title} rules"><h3>${title}</h3>
      <p class="fbg-bwho">${this.lastCtl < 0 ? 'Ro-sham-bo decides who rushes the 3 balls. After that, the 3 balls alternate every game.' : (this.lastCtl === 1 ? 'FINAL BOSS rushes the 3 balls on its right this game. ' + this.opp.name + ' rush the 2 on theirs.' : '' + this.opp.name + ' rush the 3 balls on their right this game. FINAL BOSS rushes the 2 on its right.')}</p>
      <p>Out by a live ball, a caught throw, or crossing the center or a side line. Clear the other team to win the game.</p>
      <ul class="fbg-rules">${rules.map(r => `<li>${ruleIcon(r[0])}<b>${r[1]}</b><span>${r[2]}</span></li>`).join('')}</ul>
      <p class="fbg-bctl">${ctl}</p>
      <button type="button" class="fbg-btn fbg-bgo">READY <small>${touch ? 'tap' : 'Enter'}</small></button><i class="fbg-btime"></i></div>`;
    this.$.vs.hidden = false; this.$.vs.classList.add('live');
    const go = this.$.vs.querySelector('.fbg-bgo'); go.addEventListener('click', () => { this.briefGo = true; });
    try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  briefTick() {
    this.briefT++;
    for (const a of this.all) if (a.active) { a.tgt = this.poseIdle(a); this.blend(a, 0.2); this.place(a); }
    // READY, Enter, Space or J moves on; game 1 waits for the player, later briefs move on by themselves
    if (this.briefT > 20 && (this.briefGo || this.edge.enter || this.edge.throw)) this.briefGo = true;
    this.edge = {};
    // first game waits for READY (20 s safety); between games the card flashes for 6 s, READY skips it
    const lim = this.lastCtl < 0 ? (this.simAll ? 1200 : Infinity) : 360;   // dot 10/26: game 1's rules wait for READY; later games keep the timed flash
    if (lim === 360) { const bar = this.$.vs.querySelector('.fbg-btime'); if (bar) bar.style.transform = `scaleX(${Math.max(0, 1 - this.briefT / lim).toFixed(3)})`; }
    if (this.briefGo || this.briefT > lim) { this.$.vs.classList.remove('live'); this.afterBrief(); }
  }
  afterBrief() {
    // Sin City: ro-sham-bo for the first game only, then the 3 balls alternate every game
    if (this.lastCtl < 0) return this.startRPS();
    const w = 1 - this.lastCtl; this.rpsWinner = w;
    this.$.vs.hidden = true; this.placeRushBalls(w);
    this.phase = 'lineup'; this.lineT = 0;
    this.popCenter('READY', 'big', 0.45, 0.75); this.sfx.vo('vo_ready', 2); this.ref((w === 0 ? 'FINAL BOSS' : '' + this.opp.name + '') + ' has the 3 balls. Rush only your right'); this.showLanes(true);
  }
  startRPS() {
    this.sfx.vo('vo_rps', 2);
    this.phase = 'rps'; this.rpsT = 0; this.rpsPick = null; this.rpsCPU = null; this.rpsDone = 0;
    const names = ['ROCK', 'PAPER', 'SCISSORS'];
    this.$.vs.innerHTML = `<div class="fbg-rps"><h3>RO-SHAM-BO</h3><p>${this.gameNo === 1 && !this.ot ? 'Winner takes 3 balls on its right.' : (this.ot ? 'Overtime. Winner takes 3 balls.' : 'Game ' + this.gameNo + '. Winner takes 3 balls on its right.')}</p>
      <div class="fbg-rpsb">${names.map((n, i) => `<button type="button" data-r="${i}">${rpsIcon(i)}<b>${n}</b><small>${i + 1}</small></button>`).join('')}</div><div class="fbg-rpsr" aria-live="polite"></div>${this.gameNo > 1 || this.ot ? '<i class="fbg-btime"></i>' : ''}</div>`;
    this.$.vs.hidden = false; this.$.vs.classList.add('live');
    this.$.vs.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { if (this.rpsPick == null) this.rpsPick = +b.dataset.r; }));
  }
  rpsTick() {
    this.rpsT++;
    for (const a of this.all) if (a.active) { a.tgt = this.poseIdle(a); this.blend(a, 0.2); this.place(a); }
    if (this.rpsPick == null) {
      if (this.edge.rock) this.rpsPick = 0; else if (this.edge.paper) this.rpsPick = 1; else if (this.edge.scissors) this.rpsPick = 2; else if (this.edge.enter || this.edge.throw) this.rpsPick = (Math.random() * 3) | 0;
      // game 1 waits for the player's pick (a first-timer needs the time); later games pick for you after 2.5 s, with a visible timer
      else if ((this.gameNo > 1 || this.ot) && this.rpsT > 150) this.rpsPick = (Math.random() * 3) | 0;
      if ((this.gameNo > 1 || this.ot) && this.rpsPick == null) { const bar = this.$.vs.querySelector('.fbg-btime'); if (bar) bar.style.transform = `scaleX(${Math.max(0, 1 - this.rpsT / 150).toFixed(3)})`; }
    }
    this.edge = {};
    if (this.rpsPick != null && this.rpsCPU == null) {
      this.rpsCPU = (Math.random() * 3) | 0; this.rpsDone = this.rpsT;
      const names = ['ROCK', 'PAPER', 'SCISSORS'];
      const r = this.$.vs.querySelector('.fbg-rpsr');
      this.$.vs.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', +b.dataset.r === this.rpsPick));
      const w = this.rpsPick === this.rpsCPU ? -1 : ((this.rpsPick - this.rpsCPU + 3) % 3 === 1 ? 0 : 1);
      this.rpsWinner = w;
      if (r) r.innerHTML = `You: <b>${names[this.rpsPick]}</b>. ${this.opp.short}: <b>${names[this.rpsCPU]}</b>. ${w < 0 ? 'Tie, go again.' : (w === 0 ? 'FINAL BOSS gets 3 balls.' : '' + this.opp.name + ' get 3 balls.')}`;
      this.sfx.catch();
    }
    if (this.rpsCPU != null && this.rpsT - this.rpsDone > (this.rpsWinner < 0 ? 50 : 70)) {
      if (this.rpsWinner < 0) { this.startRPS(); return; }
      this.$.vs.hidden = true; this.$.vs.classList.remove('live');
      this.placeRushBalls(this.rpsWinner);
      this.phase = 'lineup'; this.lineT = 0;
      this.popCenter('READY', 'big', 0.45, 0.75); this.sfx.vo('vo_ready', 2); this.ref('Rush only the balls on your right'); this.showLanes(true);
    }
  }
  lineupTick() {
    this.lineT++;
    const ui = this.userIntent();
    if (!this.falseStart && this.lineT > 8 && (Math.abs(ui.mx) + Math.abs(ui.mz) > 0.3 || ui.dash)) {
      this.falseStart = true;
      for (const b of this.balls) if (b.state === 'rest' && b.rushTeam === 0) b.rushTeam = 1;
      this.popCenter('FALSE START', 'big red', 0.6); this.ref('Balls go to ' + this.opp.name + ''); this.sfx.buzz(); this.sfx.vo('vo_falsestart', 3);
    }
    for (const a of this.all) if (a.active) { a.tgt = this.poseSquat(a, 0.45); a.tgt.sq = 1; a.tgt.sh = [-0.6, 0.3, -0.6, 0.3]; this.blend(a, 0.25); this.place(a); }
    for (const b of this.balls) this.placeBallMesh(b);
    if (this.lineT === 45) { this.popCenter('SET', 'big', 0.45, 0.75); this.sfx.vo('vo_set', 2); }
    if (this.lanes && this.lanesOn) for (const m of this.lanes) m.material.opacity = 0.34 + 0.1 * Math.sin(this.lineT * 0.15);
    if (this.lineT === 90) { this.phase = 'play'; this.rushT = 0; this.ninaRushStart(); this.cheer('*go'); this.popBrush('RUSH!', (this.rpsWinner === 0 ? 'FINAL BOSS' : '' + this.opp.short + '') + ' rush 3 balls', '', 0.3, 1.3); this.sfx.crowd(true); this.sfx.vo('vo_go', 3); this.sfx.whistle(); }
  }
  pause(auto) {
    if (this.dead) return;
    if (this.phase === 'handshake') { if (!auto) this.finishHandshake(); return; }
    if (this.phase === 'title' || this.phase === 'result' || this.dead) return;
    this.paused = true; this.$.pause.textContent = 'Resume';
    const timeout = !auto && !this.timeoutUsed, menu = auto === 'menu';
    if (timeout) { this.timeoutUsed = true; this.timeoutT = RULES.timeout * 60; }
    else this.timeoutT = 0;
    this.$.card.innerHTML = `<h2>${timeout ? 'TIME <em>OUT</em>' : menu ? '<em>MENU</em>' : 'PAUSED'}</h2><p class="fbg-to">${timeout ? 'Your one 30 second time out. Play resumes on its own at 0.' : menu ? 'The clock is stopped. Your time out is saved for when you need it.' : (auto ? 'The game paused while it was off screen.' : 'Your time out is used, so this is a plain pause.')}</p>${this.settingsHTML()}<div class="fbg-row"><button class="fbg-btn fbg-res-go" type="button">RESUME</button><button class="fbg-btn ghost fbg-restart" type="button">RESTART</button><button class="fbg-btn ghost fbg-snd" type="button">${this.sfx.on ? 'Sound on' : 'Sound off'}</button></div>${this.edChip()}`;
    this.syncMenu(); this.bindEdChip('pause');
    this.$.card.querySelector('.fbg-res-go').addEventListener('click', () => this.resume());
    this.$.card.querySelector('.fbg-restart').addEventListener('click', () => this.start());
    this.$.card.querySelector('.fbg-snd').addEventListener('click', () => this.toggleSound());
    this.$.ov.hidden = false;
  }
  timeoutTick() {
    if (this.timeoutT <= 0) return;
    this.timeoutT--;
    if (this.timeoutT % 60 === 0) { const p = this.$.card.querySelector('.fbg-to'); if (p) p.textContent = `Your one 30 second time out: ${this.timeoutT / 60} s left.`; }
    if (this.timeoutT === 0) this.resume();
  }
  resume() { if (!this.paused) return; const rot = this.root.querySelector('.fbg-rotate'); if (rot && !rot.hidden) return; this.paused = false; this.timeoutT = 0; this.$.ov.hidden = true; this.$.pause.textContent = this.timeoutUsed ? 'Pause' : 'Time out'; this.$.stage.focus({ preventScroll: true }); }
  endMatch(result) {
    if (this.over) return; this.over = true; this.phase = 'handshake'; this.resultT = 0; this.result = result;
    this.paused = false; this.keys = {}; this.edge = {}; this.timeoutT = 0; this.hitstop = 0;
    this.$.ov.hidden = true; this.$.vs.hidden = true; this.$.pause.textContent = 'View result';
    this.handshake = { stage: 'assemble', frame: 0, pairs: new Set(), lines: this.teams.map(t => t.filter(a => a.active)) };
    for (const a of this.all) { a.held = null; a.h = 0; a.vx = a.vz = a.vh = 0; a.popScale = 1; a.shake = 0; a.role = 'ceremony'; a.oob = 0; a.stumbleT = 0; a.set('walk'); a.root.visible = a.active; }
    for (const b of this.balls) { this.resetBall(b); b.mesh.visible = b.shadow.visible = b.glow.visible = false; }
    if (this.lanes) this.showLanes(false);
    this.sfx.buzz(); this.crowdReact(result.win ? 'matchwin' : 'matchlose'); this.sfx.vo(result.win ? 'vo_win' : 'vo_lose', 4);
    if (this.wkMatch) this.wkRecord(result.win, this.points);
    this.pm = this.buildPost(result);
    this.popCenter('GOOD GAME', 'big gold'); this.say('Match complete. Teams form a sportsmanship line. Press Enter or View result to skip.');
  }
  handshakeTick() {
    const h = this.handshake; if (!h) return;
    h.frame++;
    const assembleFrames = this.rm ? 45 : 240, passFrames = 240;
    for (let t = 0; t < 2; t++) h.lines[t].forEach((a, i) => {
      const dir = t === 0 ? 1 : -1, lane = t === 0 ? 0.70 : -0.70;
      const startX = -dir * (1.6 + i * 0.85);
      if (h.stage === 'assemble') {
        if (this.rm) { a.x = startX; a.z = lane; a.set('idle'); }
        else this.walkTo(a, startX, lane, 5);
      } else {
        const travel = Math.min(1, h.frame / passFrames) * 9.15;
        a.x = startX + dir * travel; a.z = lane;
        if (a.state !== 'walk') a.set('walk'); else a.st++;
      }
      if (h.stage === 'pass' || a.state !== 'walk') a.yaw = dir * Math.PI / 2;
      if (h.stage === 'assemble' && a.state === 'walk') a.st++;
      a.tgt = a.state === 'walk' ? this.poseWalk(a) : a.blankPose();
      if (a.greetT > 0) { a.greetT--; a.tgt.sh[2] = -1.2; a.tgt.sh[3] = 0.85; a.tgt.el[1] = -0.5; }
      this.blend(a, 0.35); this.place(a); a.setExpr('happy');
    });
    if (h.stage === 'assemble' && h.frame >= assembleFrames) { h.stage = 'pass'; h.frame = 0; this.popCenter('GOOD GAME • WELL PLAYED', 'small gold', 0.5, 2); }
    else if (h.stage === 'pass') {
      for (let i = 0; i < h.lines[0].length; i++) for (let j = 0; j < h.lines[1].length; j++) {
        const a = h.lines[0][i], b = h.lines[1][j], key = i + ':' + j;
        if (Math.abs(a.x - b.x) < 0.22 && !h.pairs.has(key)) { h.pairs.add(key); a.greetT = b.greetT = 14; }
      }
      if (h.frame >= passFrames) this.finishHandshake();
    }
    this.edge = {};
  }
  finishHandshake() {
    if (this.dead || this.phase !== 'handshake') return;
    this.phase = 'result'; this.resultT = 0; this.$.pause.textContent = 'Time out';
    for (const a of this.all) { a.greetT = 0; a.set('idle'); }
    this.showResults();
  }
  showResults() {
    if (this.phase !== 'result') return;
    const r = this.result, s = this.stats, wk = !!this.wkMatch, w = this.wk, n = wk ? this.wkInfo(w) : null;
    this.sfx.music('music_menu');
    if (this.pm && !this.pm.seen) return this.showPost();
    let wkLine = '';
    if (wk && w) {
      wkLine = w.done ? (w.done.champion ? 'CHAMPIONS! FINAL BOSS wins the weekend.' : w.done.why) : (n ? 'Next: ' + n.label.toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ' against ' + wkTeam(n.opp).name + '.' : '');
      const sunN = w.fb.filter(x => x.day === 'sun').length;
      const vo = w.done ? (w.done.champion ? 'vo_wk_champ' : 'vo_wk_over') : (n && n.comeback ? 'vo_wk_comeback' : (w.sun && w.sun.reset && n && n.step === 4 ? 'vo_wk_reset' : (n && n.day === 'sun' && sunN === 0 ? 'vo_wk_through' : (n && n.step === 3 ? 'vo_wk_winners' : (n && n.step === 4 ? 'vo_wk_grand' : '')))));
      if (vo) { this.sfx.loadOne(vo, this.sfx.base + vo + '.mp3'); setTimeout(() => { if (this.phase === 'result' || this.phase === 'title') this.sfx.vo(vo, 4); }, 1300); }
    }
    this.$.card.innerHTML = `<h2>${r.win ? 'YOU <em>WIN</em>' : 'NICE <em>TRY</em>'}</h2><p>${esc(r.msg)}</p>${wkLine ? `<p class="fbg-wk-res">${esc(wkLine)}</p>` : ''}
      <div class="fbg-resgrid">${this.chipHTML()}<div class="fbg-res"><div><b>${this.points[0]} to ${this.points[1]}</b><span>Games</span></div><div><b>${this.score.toLocaleString()}</b><span>Score</span></div><div><b>${s.kos}</b><span>Outs you made</span></div>
      <div><b>${s.catches}</b><span>Catches</span></div><div><b>${s.backIn}</b><span>Teammates back in</span></div><div><b>${s.headshots}</b><span>Headshot calls</span></div></div></div>
      <p style="color:var(--fbg-ash)">Look: ${esc(this.look.name || '')}. Honor system, always.</p>
      <div class="fbg-row">${wk ? `<button class="fbg-btn fbg-go" type="button">${w && w.done ? 'SEE THE WEEKEND' : 'CONTINUE WEEKEND'}</button>` : '<button class="fbg-btn fbg-go" type="button">RUN IT BACK</button>'}<button class="fbg-btn ghost fbg-lineup-b" type="button">PICK A PLAYER</button>${wk && w && w.done ? '<button class="fbg-btn ghost fbg-staffb" type="button">THANK YOU, STAFF</button>' : ''}${this.full ? '<button class="fbg-btn ghost" type="button" data-d="full">Back to the page</button>' : ''}</div>`;
    this.$.card.querySelector('.fbg-go').addEventListener('click', () => { if (wk) { this.wkMatch = null; this.showBracket(); } else this.start(); });
    this.$.card.querySelector('.fbg-lineup-b').addEventListener('click', () => { this.wkMatch = null; this.resetMatch(); this.phase = 'title'; this.showTitle(); });
    { const sb = this.$.card.querySelector('.fbg-staffb'); if (sb) sb.addEventListener('click', () => this.showStaffCredits(() => this.showResults())); }
    this.$.ov.hidden = false;
    this.bindChip();
    const b = this.$.card.querySelector('.fbg-go'); if (b) b.focus({ preventScroll: true });
  }
  showTitle() {
    this.phase = 'title'; this.wkView = false; this.$.card.classList.remove('is-wk');
    const touch = this.root.classList.contains('has-touch');
    const how = touch
      ? `<li data-n="1">Drag the left pad to move. Flick it hard to <b>dash</b>.</li>
         <li data-n="2"><b>THROW</b>. Dash 4 to 7 steps first for a <b>power shot</b>.</li>
         <li data-n="3"><b>CATCH</b> right before impact (hold to duck). <b>JUMP</b>, <b>PASS</b>.</li>`
      : `<li data-n="1"><span class="fbg-kmtext">${this.kmLine()}</span>. Double-tap to <b>dash</b>. <span class="fbg-kbd">Q</span> switches player.</li>
         <li data-n="2"><span class="fbg-kbd">J</span>${this.native ? ', <span class="fbg-kbd">Left click</span>' : ''} or <span class="fbg-kbd">Space</span> throws. Throw on dash steps 4 to 7 for a <b>power shot</b>.</li>
         <li data-n="3"><span class="fbg-kbd">K</span>${this.native ? ' or <span class="fbg-kbd">Right click</span>' : ''} catches or blocks right before impact (hold to duck). <span class="fbg-kbd">L</span> jumps, <span class="fbg-kbd">Shift</span> or <span class="fbg-kbd">E</span> passes.</li>`;
    const rules = [['rush', 'Rush right', 'grab only the balls on your right'], ['line', 'Clear the line', 'carry it past your attack line first'], ['catch', 'Catch = back in', 'thrower out, your next teammate returns'],
      ['head', 'No headshots', 'a standing headshot puts the thrower out'], ['clock', '15 s control', '3+ on your side, held or loose. 2 resets it. At 0, all 5 go over'], ['back', 'Back line only', 'leave only out the back, 10 s to return']];
    this.$.card.classList.remove('is-picker'); this.$.ov.classList.remove('picker');
    this.sfx.music('music_menu');
    this.$.card.innerHTML = `${this.edChip()}
      <h2>BOSS <em>RUSH</em></h2>
      <p>Sin City style, arcade format: 8 on 8, 5 balls, no sting. Most games in 3 minutes wins.</p>
      <ul class="fbg-rules">${rules.map(r => `<li>${ruleIcon(r[0])}<b>${r[1]}</b><span>${r[2]}</span></li>`).join('')}</ul>
      <details class="fbg-more"><summary>How Sin City plays</summary>
        <p class="fbg-kmp"${this.km === 'infield' ? '' : ' hidden'}>${this.kmHow()}</p>
        <p>Both teams start on their back line. Ro-sham-bo decides the first game: the winner rushes the 3 balls on its right, the other team the 2 on its right. After that, the 3 balls alternate every game. On GO, rush only the balls on your right as you face the other team. Leave early and you lose those balls.</p>
        <p>You are out if a live ball hits you and nobody catches it, if your throw is caught, if you cross the center line or a side line, or if you stay out the back for more than 10 seconds. A ball held in your hands can block a throw. Deflected balls stay live until the floor. Catch one to put the original thrower out and return your first teammate in line.</p>
        <p>Near an illegal boundary, grounded players may try to balance. Speed and momentum can still carry you out. After the match, both teams meet in a sportsmanship line.</p>
        <p>A ball is live once it crosses the center line, and dead once it touches the floor, a wall, or another ball. A game ends when a team is out, worth 1 point. Mercy at an 8 game lead. A tie goes to a shortened 60 second overtime (the tournament plays longer), then sudden death. Play on the honor system.</p>
      </details>
      <ol class="fbg-how">${how}</ol>
      <div class="fbg-lineup"><h3>PICK YOUR PLAYER</h3><div class="fbg-pool"></div></div>
      ${this.settingsHTML()}<div class="fbg-row"><button class="fbg-btn fbg-go fbg-wkb" type="button">${(() => { const w = wkLoad(); return w && !w.done && w.fb.length ? 'CONTINUE WEEKEND' : 'SIN CITY WEEKEND'; })()}</button><button class="fbg-btn ghost fbg-quick" type="button">Quick match</button><button class="fbg-btn ghost fbg-staffb" type="button">Thank you, Staff</button><button class="fbg-btn ghost fbg-snd" type="button">${this.sfx.on ? 'Sound on' : 'Sound off'}</button></div>
      <p class="fbg-wkp">Sin City Weekend: Saturday pools, then Sunday double elimination against 16 fabulous teams. Quick match: one match against THE GLITCHES.</p>`;
    this.renderPicker(); this.syncMenu(); this.bindEdChip('title');
    // Gordon 10/26: Sin City Weekend is the default; a quick match is one tap away
    this.$.card.querySelector('.fbg-wkb').addEventListener('click', () => { this.sfx.ui('select'); this.showBracket(); });
    this.$.card.querySelector('.fbg-quick').addEventListener('click', () => { this.wkMatch = null; this.start(); });
    this.$.card.querySelector('.fbg-snd').addEventListener('click', () => this.toggleSound());
    this.$.card.querySelector('.fbg-staffb').addEventListener('click', () => this.showStaffCredits(() => this.showTitle()));
    this.$.ov.hidden = false;
  }
  wantPicker() {
    const p = this.opts.picker;
    if (p === false) return false;
    if (p === 'always') return true;
    return !readEd();
  }
  edName(k) { return k === 'pc' ? 'PC' : 'MOBILE'; }
  showPicker(from) {
    // the first screen: pick PC or MOBILE so the controls, HUD and quality fit the hands holding the game
    this.phase = 'title'; this.picking = true; this.pickFrom = from || null;
    const guess = readEd() || guessEdition();
    const art = (k) => assetURL(this.base, 'picker-' + k + (this.native ? '-2x' : '') + '.jpg');
    const tile = (k, sub, how) => `<button type="button" class="fbg-ed fbg-ed-${k}" data-ed="${k}" aria-describedby="fbg-ed-${k}-d"${k === guess ? ' data-guess="1"' : ''}>
        <span class="fbg-ed-art" style="background-image:url('${art(k)}')"></span>
        <span class="fbg-ed-name">${this.edName(k)}</span>
        <span class="fbg-ed-sub" id="fbg-ed-${k}-d">${sub}</span>
        <span class="fbg-ed-how">${how}</span>
        ${k === guess ? '<span class="fbg-ed-best">Best for this screen</span>' : ''}</button>`;
    this.$.card.innerHTML = `<div class="fbg-picker" role="group" aria-labelledby="fbg-pick-h">
      <h2 id="fbg-pick-h">CHOOSE YOUR <em>CONTROLS</em></h2>
      <p class="fbg-pick-p">Same Sin City match, two native builds. Pick the one that fits your hands.</p>
      <div class="fbg-eds">${tile('pc', 'Keyboard and mouse', 'Full window at your screen\'s resolution. Click to throw, right click to catch.')}${tile('mobile', 'Touch, landscape', 'Big thumb buttons, a floating pad, haptics, tuned for 60 fps on a phone.')}</div>
      <p class="fbg-pick-note">${from === 'pause' ? 'Switching ends this match.' : 'You can switch any time from the pause menu.'}</p></div>`;
    this.$.card.classList.add('is-picker'); this.$.ov.hidden = false; this.$.ov.classList.add('picker');
    const tiles = [...this.$.card.querySelectorAll('.fbg-ed')];
    tiles.forEach((b, i) => {
      b.addEventListener('click', () => this.chooseEdition(b.dataset.ed));
      b.addEventListener('focus', () => { tiles.forEach(t => t.classList.toggle('fbg-hot', t === b)); if (this._edFocus !== undefined && this._edFocus !== i) this.sfx.ui('move'); this._edFocus = i; });
      b.addEventListener('pointerenter', () => { if (!this.mobile) b.focus({ preventScroll: true }); });
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); tiles[1 - i].focus({ preventScroll: true }); } });
    });
    this._edFocus = undefined;
    const g = tiles.find(t => t.dataset.guess) || tiles[0];
    try { if (this.root.getBoundingClientRect().top < (window.innerHeight || 800) && this.root.getBoundingClientRect().bottom > 0) g.focus({ preventScroll: true }); } catch (e) { }
    g.classList.add('fbg-hot');
    this.sfx.music('music_menu');
    if (this.sfx.on) this.sfx.vo('vo_choose', 2);
  }
  chooseEdition(k) {
    if (!this.picking) return;
    saveEd(k);
    // the choice is a tap or click, so this is the moment sound can start on a phone (unless the player turned it off before)
    if (readSnd() !== 'off' && !this.sfx.on) this.toggleSound(true);
    this.sfx.ui('select'); this.sfx.vo(k === 'pc' ? 'vo_pc' : 'vo_mobile', 3);
    this.$.card.querySelectorAll('.fbg-ed').forEach(b => b.classList.toggle('picked', b.dataset.ed === k));
    if (k !== this.edition) {
      // the other edition is its own native build: go there (its play page skips the picker because the choice is saved)
      this.picking = false;
      const url = this.edUrls[k];
      setTimeout(() => { try { window.location.href = url; } catch (e) { } }, this.rm ? 150 : 900);
      return;
    }
    setTimeout(() => {
      this.picking = false; this.$.card.classList.remove('is-picker'); this.$.ov.classList.remove('picker');
      if (this.pickFrom === 'pause') this.pause('menu'); else this.showTitle();
      this.checkRotate();
    }, this.rm ? 60 : 420);
  }
  edChip() {
    const other = this.edition === 'pc' ? 'mobile' : 'pc';
    return `<p class="fbg-edchip"><b>${this.edName(this.edition)} EDITION</b><button type="button" class="fbg-edsw" data-other="${other}">Switch to ${this.edName(other) === 'PC' ? 'PC' : 'Mobile'}</button></p>`;
  }
  bindEdChip(from) {
    const b = this.$.card.querySelector('.fbg-edsw'); if (!b) return;
    b.addEventListener('click', () => { this.sfx.ui('back'); this.showPicker(from); });
  }
  haptic(p) {
    // short, guarded vibration on Mobile only (Android Chrome; iOS Safari ignores it); never with reduced motion
    if (!this.mobile || this.rm || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch (e) { }
  }
  checkRotate() {
    // landscape first: in portrait, a phone gets a turn-it-sideways card over the match (with a play-tall escape)
    const el = this.root.querySelector('.fbg-rotate'); if (!el) return;
    const portrait = this.mobile && (window.innerHeight || 0) > (window.innerWidth || 0) * 1.05;
    const inMatch = this.phase !== 'title' && this.phase !== 'result' && !this.picking;
    const show = portrait && inMatch && !this.tallOK;
    if (el.hidden === !show) return;
    el.hidden = !show;
    if (show && this.phase === 'play' && !this.paused) this.pause(true);
  }
  renderPicker() {
    const pool = this.$.card.querySelector('.fbg-pool'); if (!pool) return;
    pool.innerHTML = ROSTER.map(r => { const nm = r.label || r.key; const sub = r.open ? (r.label === 'YOU' ? 'open slot' : '#' + r.num + ' new') : (r.key === 'FIORE' ? '#1 coach' : '#' + r.num); return `<button class="fbg-pick${nm.length > 9 ? ' long' : ''}${r.open ? ' open' : ''}" type="button" aria-pressed="${r.key === this.controlKey}" data-k="${r.key}">${esc(nm)}<small>${sub}${r.key === this.controlKey ? ' you' : ''}</small></button>`; }).join('');
    this.renderYouEditor();
    pool.querySelectorAll('.fbg-pick').forEach(b => b.addEventListener('click', () => {
      this.controlKey = b.dataset.k; this.user = this.teams[0].find(a => a.key === this.controlKey); this.renderPicker();
      const nb = pool.querySelector(`[data-k="${CSS.escape(this.controlKey)}"]`); if (nb) nb.focus();
    }));
  }

  // ------------------------------------------------ main tick
  renderYouEditor() {
    const box = this.$.card.querySelector('.fbg-lineup'); if (!box) return;
    let ed = box.querySelector('.fbg-youed');
    if (this.controlKey !== 'YOU') { if (ed) ed.remove(); return; }
    const d = youDef(); if (!d) return;
    if (!ed) {
      ed = document.createElement('div'); ed.className = 'fbg-youed';
      ed.innerHTML = `<p class="fbg-youp">Put yourself on the court.</p>
        <label>Name on your back <input class="fbg-yn" maxlength="11" autocomplete="off" spellcheck="false" placeholder="YOUR NAME"></label>
        <label>Number <input class="fbg-yno" inputmode="numeric" maxlength="2" placeholder="?"></label>
        <div class="fbg-skins" role="group" aria-label="Skin tone">${YOU_SKINS.map((c, i) => `<button type="button" class="fbg-sk" data-c="${c}" style="background:${c}" aria-label="Skin tone ${i + 1}"></button>`).join('')}</div>
        <p class="fbg-ymsg" aria-live="polite"></p>`;
      box.appendChild(ed);
      const yn = ed.querySelector('.fbg-yn'), yno = ed.querySelector('.fbg-yno'), msg = ed.querySelector('.fbg-ymsg');
      yn.addEventListener('input', () => { const v = cleanYouName(yn.value); d.label = v || 'YOU'; this.applyYou(); });
      yno.addEventListener('input', () => {
        const raw = yno.value.replace(/\D/g, '').slice(0, 2); yno.value = raw;
        if (!raw) { d.num = '?'; msg.textContent = ''; }
        else if (TAKEN_NUMS.has(String(+raw))) { msg.textContent = '#' + (+raw) + ' is taken on this team. Try another.'; return; }
        else { d.num = String(+raw); msg.textContent = ''; }
        this.applyYou();
      });
      ed.querySelectorAll('.fbg-sk').forEach(b => b.addEventListener('click', () => { d.skin = b.dataset.c; this.applyYou(); }));
    }
    ed.querySelector('.fbg-yn').value = d.label === 'YOU' ? '' : d.label;
    ed.querySelector('.fbg-yno').value = d.num === '?' ? '' : d.num;
    ed.querySelectorAll('.fbg-sk').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === d.skin)));
  }
  applyYou() {
    const d = youDef(); saveYou();
    const a = this.teams[0].find(x => x.key === 'YOU');
    if (a) { a.name = d.label; a.num = d.num; a.look.skin = d.skin; a.drawKit(this.kit || kitFrom(DEFAULT_LOOK.colors)); const e = a.expr; a.expr = ''; a.setExpr(e || 'neutral'); }
    const pool = this.$.card.querySelector('.fbg-pool'); const btn = pool && pool.querySelector('[data-k="YOU"]');
    if (btn) { const nm = d.label; btn.firstChild.textContent = nm; btn.querySelector('small').textContent = (d.label === 'YOU' ? 'open slot' : '#' + d.num + ' new') + (this.controlKey === 'YOU' ? ' you' : ''); btn.classList.toggle('long', nm.length > 9); }
    this.$.card.querySelectorAll('.fbg-sk').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === d.skin)));
  }
  tick() {
    this.frame++;
    if (this.paused) { this.timeoutTick(); this.edge = {}; return; }
    this.updateFX(); this.staffTick();
    switch (this.phase) {
      case 'title': this.attract(); return;
      case 'intro':
        this.introT++;
        for (const a of this.all) if (a.active) this.animate(a);
        if (this.introT === 2 && this.staffFinal()) this.staffWalkout();
        if (this.introT === 112 && !this.staffWalkEl) this.popBrush('ALL HEART!', 'Sin City style, no sting', '', 0.5, 1.2);
        if (this.introT === 150) { this.$.vs.hidden = true; this.startBrief(); }
        this.edge = {}; return;
      case 'brief': this.briefTick(); return;
      case 'rps': this.rpsTick(); return;
      case 'lineup': this.lineupTick(); return;
      case 'gameover': this.gameOverTick(); return;
      case 'ot-wait': for (const a of this.all) if (a.active) { this.control(a, NOI); this.physics(a); this.animate(a); } for (const b of this.balls) this.updateBall(b); this.edge = {}; return;
      case 'handshake': this.handshakeTick(); return;
      case 'fact': this.factTick(); return;
      case 'result':
        this.resultT++;
        for (const a of this.all) if (a.active) { a.tgt = this.poseBench(a); this.blend(a, 0.2); this.place(a); }
        this.edge = {}; return;
    }
    if (this.hitstop > 0) { this.hitstop--; for (const a of this.all) if (a.shake > 0) a.shake--; return; }
    // world frames: they stop during hit-stop, so catch windows and AI reaction timing never expire while the world is frozen
    this.wf = (this.wf || 0) + 1;
    const ui = this.userIntent();
    if (ui.sw) this.switchUser(true);
    this.assignClaims();
    this.coachTick(0); this.coachTick(1);
    for (const a of this.all) {
      if (!a.active) continue;
      const it = (a === this.user && a.role === 'in') ? ui : this.lineSense(a, this.aiIntent(a));
      if (a.state === 'teeter') { a.st++; this.teeterTick(a, it); this.physics(a); this.animate(a); continue; }
      this.control(a, it);
      this.physics(a);
      this.animate(a);
    }
    for (const b of this.balls) this.updateBall(b);
    this.ballHits();
    this.rules();
    this.abTick();
  }
  attract() {
    for (const a of this.all) if (a.active) { a.tgt = this.poseIdle(a); this.blend(a, 0.2); this.place(a); }
    for (const b of this.balls) { if (b.state === 'rest' && b.rushTeam < 0) { b.z = -3.6 + b.id * 1.8; } this.placeBallMesh(b); }
  }
  gameOverTick() {
    this.gameEndT++;
    for (const a of this.all) if (a.active) { this.control(a, NOI); this.physics(a); this.animate(a); }
    for (const b of this.balls) this.updateBall(b);
    this.edge = {};
    if (this.gameEndT === 150) {
      const lead = Math.abs(this.points[0] - this.points[1]);
      if (this.ot || this.sudden) return this.endMatch({ win: this.lastGameWinner === 0, msg: this.lastGameWinner === 0 ? 'Overtime goes to FINAL BOSS.' : 'Overtime goes to ' + this.opp.name + '.' });
      if (lead >= RULES.mercy) return this.endMatch({ win: this.points[0] > this.points[1], msg: `Mercy rule at ${this.points[0]} to ${this.points[1]}.` });
      this.setupGame(); this.startBrief();
    }
  }

  // ------------------------------------------------ AI
  assignClaims() {
    const live = [this.liveCount(0), this.liveCount(1)];
    for (const b of this.balls) {
      let team = -1;
      if (b.state === 'rest' && this.rushT < RULES.rushF) team = b.rushTeam;
      else if (b.state === 'loose' && Math.abs(b.z) < HZ + 0.25 && Math.abs(b.x) > 0.25) team = b.x < 0 ? 0 : 1;
      if (team < 0) { b.claim = null; continue; }
      if (Math.abs(b.x) > HX - 0.1 && live[team] <= 1) { b.claim = null; continue; }
      const c = b.claim;
      const ok = (a) => a && a.team === team && a.role === 'in' && !a.held && a !== this.user && !a.locked() && a.oob === 0 || (a && a.oob > 0 && a.ai.claimBall === b);
      if (ok(c) && c.ai.claimBall === b) continue;
      let best = null, bd = 1e9;
      for (const a of this.teams[team]) {
        if (!ok(a) || (a.ai.claimBall && a.ai.claimBall !== b && a.ai.claimBall.claim === a)) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = a; }
      }
      if (c && c.ai.claimBall === b) c.ai.claimBall = null;
      b.claim = best; if (best) best.ai.claimBall = b;
    }
    for (const a of this.all) if (a.ai.claimBall && a.ai.claimBall.claim !== a) a.ai.claimBall = null;
  }
  seek(a, it, tx, tz, run) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz) || 1;
    if (d < 0.12) return it;
    it.mx = dx / d; it.mz = dz / d;
    if (run && d > 2.5 && Math.abs(dx) > Math.abs(dz) * 1.2) { it.holdRun = true; if (a.state !== 'run') it.dash = Math.sign(dx); }
    return it;
  }
  incomingFor(a) {
    let best = null, bt = 1e9;
    for (const b of this.balls) {
      if (b.state !== 'flight' || b.team === a.team || b.type === 'pass' || !b.live && b.x * b.fromSide > 0 && Math.abs(b.x) > 2) continue;
      const rx = a.x - b.x, rz = a.z - b.z; const sp2 = b.vx * b.vx + b.vz * b.vz; if (sp2 < 1) continue;
      const t = (rx * b.vx + rz * b.vz) / sp2; if (t < 0 || t > 1.4) continue;
      const px = b.x + b.vx * t - a.x, pz = b.z + b.vz * t - a.z; if (Math.hypot(px, pz) > 0.9) continue;
      if (t < bt) { bt = t; best = b; }
    }
    return best;
  }
  aiIntent(a) {
    const it = Object.assign({}, NOI);
    // Phase 1 fix (aware reaction >= 85%): an aware player whose catch moment arrives while finishing a throw, a landing or a catch
    // recovery cancels that tail and reacts; a catch cooldown never swallows a throw the player has seen
    { const R = a.ai.react; if (a.role === 'in' && R && R.aware && R.kind === 'catch' && R.B.state === 'flight' && a.ai.press > (this.wf || 0)) { const sp = Math.hypot(R.B.vx, R.B.vz) || 1; if (Math.hypot(R.B.x - a.x, R.B.z - a.z) < Math.max(1.2, sp * 0.14)) a.ai.press = this.wf || 0; } }   // the ball came early (a curve, a speed-up): catch now
    if (a.role === 'in' && a.ai.press >= 0 && (this.wf || 0) >= a.ai.press && a.ai.react && a.ai.react.aware && a.ai.react.B.state === 'flight') {
      if (a.state === 'recover' || a.state === 'prec' || a.state === 'land' || a.state === 'walkin' || a.state === 'pump' || (a.state === 'catch' && a.st > 6) || (a.state === 'block' && a.st > 6) || (a.state === 'bobble' && a.st > 10)) a.set('idle');
      a.catchCool = 0;
    }
    if (a.role !== 'in' || a.locked()) return it;
    const ai = a.ai; ai.t++;
    if (ai.press >= 0 && (this.wf || 0) >= ai.press && a.catchCool === 0 && a.state !== 'air') { it.catch = true; ai.press = -1; if (ai.react && ai.react.kind === 'duck') it.catchHeld = true; }
    if (this.reactIntent(a, it)) return it;
    if (a.held) return this.aiWithBall(a, it);
    if (ai.claimBall) { const b = ai.claimBall; const tx = b.state === 'rest' ? b.x + a.side * 0.35 : b.x; return this.seek(a, it, tx, b.z, true); }
    if (this.phase === 'play' && this.rushT < RULES.rushF && !a.held && a.oob === 0) return this.seek(a, it, a.side * (HX - 0.45), a.z, false);
    if (a.oob > 0) return this.seek(a, it, a.side * (HX - 0.8), Math.max(-3.5, Math.min(3.5, a.z)), false);
    // formation: drift around home, back off when the other side holds more balls
    const foeHeld = this.balls.filter(b => b.holder && b.holder.team !== a.team).length;
    const h = ai.home || [a.side * 5, 0];
    if (!ai.wander || ai.t % 100 === 0) ai.wander = [h[0] + (Math.random() - 0.5) * 2.2, Math.max(-(HZ - 0.6), Math.min(HZ - 0.6, h[1] + (Math.random() - 0.5) * 2.4))];
    let tx = ai.wander[0], tz = ai.wander[1];
    if (foeHeld >= 3) tx = a.side * Math.max(Math.abs(tx), 6.2);
    const d = Math.hypot(tx - a.x, tz - a.z);
    if (d > 0.4) { it.mx = (tx - a.x) / d * 0.6; it.mz = (tz - a.z) / d * 0.6; }
    return it;
  }
  lineSense(a, it) {
    // a soft boundary near the side lines and the center line; sharp players see it from farther, and misjudging is rare and rolled once per approach
    if (a.role !== 'in' || this.rushT < RULES.rushF) return it;
    const r = a.rt || FB_BASE, m = 0.45 + 1.1 * r.aware * (this.momLift ? 1 + this.momLift(a) : 1);
    const own = a.x * a.side, zr = HZ - Math.abs(a.z), near = own < m || zr < m;
    if (near && !a.ai.nearLine) { a.ai.nearLine = true; a.ai.lineMiss = Math.random() < 0.12 * Math.pow(1 - r.aware, 1.5); if (a.ai.lineMiss) this.awStat('lineMiss'); }
    else if (!near) a.ai.nearLine = false;
    if (a.ai.lineMiss) return it;
    if (own < m && it.mx * a.side < 0) it.mx *= Math.max(0, own / m) - 0.25;
    if (zr < m && it.mz * Math.sign(a.z) > 0) it.mz *= Math.max(0, zr / m) - 0.25;
    return it;
  }
  startTeeter(a, kind, out, speed) {
    // toe the line: arms wheel, lean back; recover or carry over (out)
    a.set('teeter'); a.vx = a.vz = 0; a.tee = { kind, out, speed, f: 0, saved: false };
    const r = a.rt || FB_BASE;
    a.tee.fall = this.aiPlays(a) ? (this.ruleRandom ? this.ruleRandom() : Math.random()) < Math.min(0.9, Math.max(0, (speed - 1.6) / 4.5)) * (1 - r.foot) * 0.9 : null;
    this.awStat('teeter'); this.lineFlash = 30;
  }
  teeterTick(a, it) {
    const T = a.tee; T.f++;
    if (a === this.user && !this.simAll) {
      // forgiveness: let go of the push (or reverse) during the teeter and you stay in
      const push = T.kind === 'center' ? it.mx * -a.side : it.mz * T.out;
      if (push < 0.2) T.saved = true;
      if (T.saved && T.f >= 6) return this.endTeeter(a, false);
      if (T.f >= 20) return this.endTeeter(a, !T.saved);
      return;
    }
    if (T.f >= 18) this.endTeeter(a, !!T.fall);
  }
  endTeeter(a, fall) {
    const T = a.tee; a.tee = null;
    if (!fall) {
      a.set('idle'); if (T.kind === 'center') a.x -= -a.side * 0.25; else a.z -= T.out * 0.25;
      this.awStat('teeterSaved'); this.ringFx(a, a.team === 0 ? '#ffc83d' : OPPC.sig);
      if (a === this.user || Math.random() < 0.4) this.sfx.ooh();
      return;
    }
    this.awStat('teeterFell');
    if (T.kind === 'center') { a.x = a.side * -0.35; this.eliminate(a, 'line'); if (a === this.user) this.popCenter('CENTER LINE: OUT', 'big red', 0.36); }
    else { a.z = T.out * (HZ + 0.35); this.eliminate(a, 'side'); if (a === this.user) this.popCenter('SIDE LINE: OUT', 'big red', 0.36); }
  }
  wings(t, except) {
    // far-left and far-right players as the team faces the other team (FINAL BOSS faces +x, so its left is -z)
    const L = t === 0 ? -1 : 1, ps = this.inPlayers(t).filter(m => m !== except && m.oob === 0 && !LOCKED.has(m.state));
    if (!ps.length) return { left: null, right: null };
    const s = ps.slice().sort((p, q) => q.z * L - p.z * L); return { left: s[0], right: s[s.length - 1] };
  }
  coachSay(label) {
    // COACH FIORE's bench card: the FINAL BOSS plan as a one or two word game label (labels, not quotes), at most every few seconds
    if (!this.$.coach || this.frame < (this.coachNext || 0) || this.coachLast === label) return;
    this.coachLast = label; this.coachNext = this.frame + 240;
    this.$.coachB.textContent = label; const el = this.$.coach; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this.coachTO); this.coachTO = setTimeout(() => el.classList.remove('on'), 2600);
    this.qaLog('coach', { label });
  }
  smartTactic() {
    // FINAL BOSS is the best-coached team: it reads the ball count, the clock, the score and how the other team plays
    const o = this.tactic[1], foes = this.inPlayers(1), aw = foes.length ? foes.reduce((s, f) => s + (f.rt || FB_BASE).aware, 0) / foes.length : 0.6;
    const behind = this.points[0] < this.points[1], late = !this.ot && this.clock < 60;
    return Object.assign({}, TACTICS.finalboss, {
      patience: Math.max(0.05, 0.12 + 0.3 * (1 - o.patience) - (behind && late ? 0.2 : 0)),   // wait out an aggressive team a little; press when behind late
      fake: Math.min(0.9, aw),                                                          // fakes only bait players who watch
      push: 0.8, flank: 0.6, calls: 0.5, lastBall: this.liveCount(0) <= 2 ? 0.4 : 0.9,
    });
  }
  coachTick(t) {
    // the coach above the players: one plan per possession, by team style
    if (this.rushT < RULES.rushF || this.phase !== 'play') return;
    const C = this.coach[t], T = this.tactic[t];
    const holders = this.inPlayers(t).filter(a => a.held && a.held.cleared && a.oob === 0), n = holders.length;
    if (n !== C.n) {
      if (t === 0) this.tactic[0] = this.smartTactic();
      if ((C.n || 0) === 0 && n >= 1) { C.patient = Math.random() < T.patience; C.lastHold = Math.random() < T.lastBall; C.flankLeft = Math.random() < T.flank ? 2 : 0; C.callAt = Math.random() < T.calls ? this.frame + 40 + ((Math.random() * 70) | 0) : 0; if (n === 1) this.awStat('oneBallPoss' + t); }
      if (n === 1 && (C.n || 0) > 1) this.awStat('oneBallPoss' + t);
      C.n = n; if (n === 0) C.flankLeft = 0;
      const ai = holders.filter(a => this.aiPlays(a) && (!a.ai.plan || a.ai.plan.k !== 'sync'));
      if (t === 0 && ai.length >= 2 && !C.plan && this.ninaCall(t, ai)) { /* Coach Nina's play is on (DELAY, SMALL X, WIDE X) */ }
      else if (n >= 3 && ai.length >= 2 && !C.plan && Math.random() < T.push) {
        const mode = Math.random() < T.fake ? 'fake' : 'multi';
        C.plan = { k: 'push', mode, members: ai.slice(0, 3), t0: this.frame }; this.awStat('plan_push_' + mode); if (t === 0) this.coachSay(mode === 'fake' ? 'PUMP FAKE' : 'PUSH');
        for (const m of C.plan.members) { m.ai.plan = { k: 'coach' }; m.ai.t = 0; }
      } else if (n >= 1 && C.patient && this.ctlTeam !== t) { this.awStat('plan_patience'); if (t === 0) this.coachSay('HOLD'); }
      else if (n === 1 && C.lastHold && t === 0) this.coachSay('LAST BALL: KEEP IT');
    }
    if (C.plan && C.plan.k === 'push') this.pushTick(t, C);
    // calls: a wing yells for the ball; the holder passes there (for the player, it is a suggestion to follow with PASS)
    if (C.callAt && this.frame >= C.callAt && n >= 1) {
      C.callAt = 0; const h = holders[(Math.random() * n) | 0], W = this.wings(t, h);
      const side = !W.left ? 'right' : !W.right ? 'left' : (Math.abs(W.left.z - h.z) > Math.abs(W.right.z - h.z) ? 'left' : 'right'), caller = W[side];
      if (caller && !caller.held && Math.abs(caller.z - h.z) > 1.5) {
        this.awStat('plan_call'); this.sfx.smp('ball_' + side + '_' + (1 + ((Math.random() * 3) | 0)), 0.85); this.qaLog('call', { side, team: t });
        this.pop(caller, 'BALL ' + side.toUpperCase() + '!', 'small ' + (t === 0 ? 'gold sh0' : 'lime sh1'));
        if (h === this.user && !this.simAll) this.callSuggest = { to: caller, until: this.frame + 150 };
        else if (this.aiPlays(h) && (!h.ai.plan || h.ai.plan.k !== 'coach')) { h.ai.plan = { k: 'pass', to: caller }; h.ai.t = 0; h.ai.delay = 6; }
      }
    }
  }
  pushTick(t, C) {
    // coordinated push: the holders walk up to the attack line together, then fake-and-throw or fire together
    const P = C.plan, M = P.members.filter(m => m.role === 'in' && m.held && m.held.cleared && m.oob === 0);
    if (M.length < 2 || this.frame - P.t0 > 200) { for (const m of M) if (m.ai.plan && m.ai.plan.k === 'coach') m.ai.plan = null; C.plan = null; return; }
    const ready = M.every(m => Math.abs(m.x - m.side * (ATK + 0.7)) < 0.45) || this.frame - P.t0 > 80 || (this.ctlTeam === t && this.ctlT > RULES.control - 4);
    if (!ready) return;
    C.plan = null;
    const foes = this.inPlayers(1 - t).filter(f => f.oob === 0); if (!foes.length) return;
    if (P.mode === 'fake') {
      const shooter = M.slice().sort((a, b) => (b.rt || FB_BASE).acc - (a.rt || FB_BASE).acc)[0];
      let baited = [];
      for (const m of M) {
        if (m === shooter) continue;
        // pump fake: a windup that stops short; an aware defender who is watching commits early
        m.ai.plan = null; m.set('pump'); this.awStat('fakes'); this.qaLog('fake', { team: t });
        const f = foes[(Math.random() * foes.length) | 0]; m.yaw = Math.atan2(f.x - m.x, f.z - m.z);
        if (this.aiPlays(f) && this.viewOf(f, m.x, m.z) === 1 && Math.random() < 0.85 * (f.rt || FB_BASE).aware * (1 + this.abil('fakeBait', t)) && !f.locked()) {
          const chest = Math.random() < 0.5; f.ai.react = { fake: true, B: { state: 'flight' }, aware: true, kind: chest ? 'catch' : 'dodge', at: (this.wf || 0) + 1, impactF: (this.wf || 0) + 16 };
          if (chest) f.ai.press = (this.wf || 0) + 6; baited.push(f); this.awStat('fakeBaited'); this.pop(f, '!', 'tiny ' + (f.team === 0 ? 'gold sh0' : 'lime sh1'));
        }
      }
      shooter.syncTarget = baited.length ? baited[0] : null; shooter.ai.plan = { k: 'throw' }; shooter.ai.t = 0; shooter.ai.delay = 9; shooter.fakeShot = !!baited.length; this.abOnFake(t, shooter);
    } else {
      const target = this.pickTarget(M[0], null); if (!target) return;
      M.forEach((m, i) => { m.ai.plan = { k: 'sync', s: { at: this.frame + 2 + (i ? ((Math.random() * 8) | 0) : 0), target, team: t } }; });
      this.awStat('sync'); this.pop(M[0], 'THREE!', 'small ' + (t === 0 ? 'gold sh0' : 'lime sh1')); this.sfx.smp(t === 0 ? 'call_fb' : 'call_gl', 0.85);
    }
  }
  trySync(a) {
    // "Two balls beat any dodger": sometimes a holder calls "Three!" and a teammate releases with them at one target
    const team = a.team; this.syncCool = this.syncCool || [0, 0];
    if (this.frame < this.syncCool[team]) return false;
    const st = team === 1 ? (this.opp.wk && this.opp.id !== 'glitches' ? this.opp.wk.sync : (OPP_STYLES[this.oppStyle] || OPP_STYLES.glitches).sync) : 0.2;
    if (Math.random() > st * 0.35) { this.syncCool[team] = this.frame + 30; return false; }
    const mate = this.inPlayers(team).find(m => m !== a && this.aiPlays(m) && m.held && m.held.cleared && m.oob === 0 && (!m.ai.plan || m.ai.plan.k === 'throw'));
    if (!mate || a.oob > 0) return false;
    const target = this.pickTarget(a, null); if (!target) return false;
    if (team === 1 && this.abMulti(a, target)) { this.syncCool[team] = this.frame + 360; return true; }
    const S = { at: this.frame + 42, target, team };
    a.ai.plan = { k: 'sync', s: S }; mate.ai.plan = { k: 'sync', s: S }; mate.ai.t = 0;
    this.syncCool[team] = this.frame + 360;
    this.awStat('sync');
    this.pop(a, 'THREE!', 'small ' + (team === 0 ? 'gold' : 'lime')); this.sfx.smp(team === 0 ? 'call_fb' : 'call_gl', 0.85);
    return true;
  }
  aiWithBall(a, it) {
    const b = a.held, ai = a.ai;
    if (ai.plan && ai.plan.k === 'pumpAt') { if (this.frame >= ai.plan.at) { ai.plan = null; if (!a.locked()) { a.set('pump'); this.awStat('ninaPumpCover'); } } return it; }
    if (a.oob > 0) return this.seek(a, it, a.side * (HX - 0.9), Math.max(-3, Math.min(3, a.z)), false);
    { const nr = this.ninaHold(a, it); if (nr) return nr; }
    if (!b.cleared) return this.seek(a, it, a.side * (ATK + 1.2), Math.max(-(HZ - 0.7), Math.min(HZ - 0.7, a.z)), false);
    const pressure = this.ctlTeam === a.team ? this.ctlT : 0;
    const foeHeld = this.balls.filter(x => x.holder && x.holder.team !== a.team).length;
    if (ai.plan == null && this.liveCount(a.team) === 1 && foeHeld > 0 && pressure < RULES.control * 0.5) { ai.plan = { k: 'bait' }; ai.t = 0; ai.delay = 0; }
    if (ai.plan == null && this.trySync(a)) ai.t = 0;
    if (ai.plan == null) {
      const C = this.coach[a.team], T = this.tactic[a.team], mine = this.balls.filter(x => x.holder && x.holder.team === a.team).length;
      const forced = this.ctlTeam === a.team || this.liveCount(a.team) <= 2 || (this.clock < 20 && !this.ot) || foeHeld === 0 && mine >= 3;
      if (!forced && mine === 1 && C.lastHold && foeHeld > 0) { ai.plan = { k: 'hold', until: ai.t + 45 }; this.awStat('plan_lastHold'); }
      else if (!forced && C.patient && mine < 3) { ai.plan = { k: 'hold', until: ai.t + 45 }; }
      else if (C.flankLeft > 0 && mine <= 2) {
        // the first two balls go to the wings
        const W = this.wings(a.team, a), wing = (W.left && !W.left.held && Math.abs(W.left.z - a.z) > 2) ? W.left : (W.right && !W.right.held && Math.abs(W.right.z - a.z) > 2 ? W.right : null);
        C.flankLeft--; if (wing && wing !== this.user) { ai.plan = { k: 'pass', to: wing }; ai.delay = 4; ai.t = 0; this.awStat('plan_flank'); if (a.team === 0) this.coachSay('FLANK'); }
      }
      if (ai.plan) ai.t = 0;
    }
    if (ai.plan && ai.plan.k === 'hold') {
      // patience and the last ball: hold, reposition, block if they throw; re-decide every so often
      if (ai.t > ai.plan.until) { ai.plan = null; return it; }
      const h = ai.home || [a.side * 5.5, 0]; const tx = a.side * Math.max(5.2, Math.abs(h[0])), tz = h[1]; const d = Math.hypot(tx - a.x, tz - a.z); if (d > 0.5) { it.mx = (tx - a.x) / d * 0.6; it.mz = (tz - a.z) / d * 0.6; }
      return it;
    }
    if (ai.plan && ai.plan.k === 'coach') { const tx = a.side * (ATK + 0.7); if (Math.abs(tx - a.x) > 0.3) it.mx = Math.sign(tx - a.x) * 0.8; return it; }
    if (ai.plan && ai.plan.k === 'pass' && ai.plan.to) { if (ai.t < (ai.delay || 0)) return it; const to = ai.plan.to; ai.plan = null; if (to.role === 'in' && !to.held && to.oob === 0) { a.passTarget = to; it.pass = true; } return it; }
    if (ai.plan == null) {
      ai.delay = pressure > RULES.control * 0.55 ? 6 + ((Math.random() * 10) | 0) : 22 + ((Math.random() * 55) | 0);
      const r = Math.random();
      const powerP = a.team === 1 ? (this.p2 && a.boss ? 0.75 : (this.opp.wk && this.opp.id !== 'glitches' ? (AI_LEVEL[this.opp.wk.lvl] || this.level).p : this.level.p)) : 0.3;
      if (r < 0.08) ai.plan = { k: 'pass' };
      else if (Math.random() < powerP && Math.abs(a.x) > 3.4) ai.plan = { k: Math.random() < 0.7 ? 'run' : 'jump', stepAt: TUNE.powMin + ((Math.random() * 4) | 0) };
      else ai.plan = { k: 'throw' };
      ai.t = 0;
    }
    const P = ai.plan;
    if (P.k === 'bait') {
      // last one standing: bait a throw, dodge it, then punish while they are empty-handed
      if (foeHeld === 0 || ai.t > 300 || pressure > RULES.control * 0.5) { it.throw = true; ai.plan = null; return it; }
      it.mz = Math.sin(ai.t * 0.07) * 0.8; const tx = a.side * 4.6; if (Math.abs(tx - a.x) > 0.5) it.mx = Math.sign(tx - a.x) * 0.5; return it;
    }
    if (P.k === 'sync') {
      const S = P.s;
      if (!S.target || S.target.role !== 'in' || this.frame > S.at + 30) { ai.plan = null; a.syncTarget = null; return it; }
      if (this.frame >= S.at) { a.syncTarget = S.target; it.throw = true; ai.plan = null; return it; }
      const tx = a.side * (ATK + 0.9); if (Math.abs(tx - a.x) > 0.4) it.mx = Math.sign(tx - a.x) * 0.7; return it;
    }
    if (ai.t < ai.delay) { const tx = a.side * 4.2; if (Math.abs(tx - a.x) > 0.6) it.mx = Math.sign(tx - a.x) * 0.5; return it; }
    if (P.k === 'pass') { const m = this.inPlayers(a.team).filter(x => x !== a && !x.held && Math.abs(x.x) > ATK); if (m.length) { a.passTarget = m[(Math.random() * m.length) | 0]; it.pass = true; } else it.throw = true; ai.plan = null; return it; }
    if (P.k === 'throw') { it.throw = true; ai.plan = null; return it; }
    if (P.k === 'run') {
      if (!P.go) { const bx = a.side * 8.3; if (Math.abs(a.x - bx) > 0.4 && ai.t < ai.delay + 60) { it.mx = Math.sign(bx - a.x); return it; } P.go = true; it.dash = -a.side; }
      it.holdRun = true; it.mx = -a.side;
      if (a.state === 'run' && (a.steps >= P.stepAt || Math.abs(a.x) < 1.4)) { it.throw = true; ai.plan = null; }
      else if (a.state !== 'run' && ai.t > ai.delay + 120) { it.throw = true; ai.plan = null; }
      return it;
    }
    if (P.k === 'jump') {
      if (!P.go) { P.go = true; it.dash = -a.side; it.holdRun = true; it.mx = -a.side; return it; }
      if (a.state === 'run' && !P.j) { it.jump = true; P.j = true; return it; }
      if (a.state === 'air' && a.airF >= 16) { it.throw = true; ai.plan = null; }
      if (ai.t > ai.delay + 100) { it.throw = true; ai.plan = null; }
      return it;
    }
    return it;
  }
  scheduleCatches(B) {
    const t = B.target; if (!t || t === this.user || t.role !== 'in') return;
    let p = t.team === 1 ? (this.p2 && t.boss ? 0.55 : this.level.c) : 0.3;
    if (['hook', 'zig', 'moon', 'hop'].includes(B.type)) p *= 0.5;
    if (t.held) p *= 0.6;
    if (Math.random() < p) {
      const d = Math.hypot(t.x - B.x, t.z - B.z); const sp = Math.hypot(B.vx, B.vz) || 10;
      const fall = B.deflected ? (B.vh + Math.sqrt(Math.max(0, B.vh * B.vh + 2 * B.grav * (B.h - 1.2 * t.scale)))) / B.grav : 0;
      const eta = Math.round(Math.max(d / sp, fall) * 60);
      t.ai.press = (this.wf || 0) + Math.max(1, eta - (2 + ((Math.random() * 7) | 0)));
    } else t.ai.press = -1;
  }
  // ------------------------------------------------ P0b/P0c: awareness. Every AI player in a throw's path may notice it (facing, time, busy, rating);
  // aware players catch, block with a held ball, dodge or duck; unaware players do not react (the honest miss)
  aiPlays(a) { return a.role === 'in' && (a !== this.user || !!this.simAll); }
  awStat(k, n = 1) { const s = this.aiStats || (this.aiStats = {}); s[k] = (s[k] || 0) + n; }
  viewOf(a, x, z) { const fv = a.facingVec(), dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz) || 1, c = (fv[0] * dx + fv[1] * dz) / d; return c > 0.34 ? 1 : (c > -0.34 ? 0.55 : 0.15); }
  busyOf(a) { return a.oob > 0 ? 0.35 : (a.ai.claimBall ? 0.55 : (a.locked() ? 0.6 : 1)); }
  windupNotice(th) {
    // "Dodge on their load, not their release": a target watching the thrower reads the windup
    const t = th.throwTarget; if (!t || t.team === th.team || !this.aiPlays(t)) return;
    if (th.noLook) { this.awStat('noLookWindups'); return; }   // Nina's X: no eye contact, so the target cannot read the load
    if (this.viewOf(t, th.x, th.z) < 1) return;
    const r = t.rt || FB_BASE; if (Math.random() < clampR(this.busyOf(t) * (0.15 + 0.8 * r.aware))) t.ai.loadRead = { th, f: (this.wf || 0) };
  }
  noticeThrow(B) {
    const th = B.thrower; const sp2 = B.vx * B.vx + B.vz * B.vz; if (!th || sp2 < 1) return;
    for (const a of this.teams[1 - th.team]) {
      if (!this.aiPlays(a)) continue;
      const rx = a.x - B.x, rz = a.z - B.z, t = (rx * B.vx + rz * B.vz) / sp2;
      if (t < 0 || t > 1.8) continue;
      if (Math.hypot(B.x + B.vx * t - a.x, B.z + B.vz * t - a.z) > (a === B.target ? 1.3 : 0.9)) continue;
      this.awStat('inPath'); if (a.held) this.awStat('holderInPath');
      const r = a.rt || FB_BASE, lr = a.ai.loadRead, read = !!(lr && lr.th === th && (this.wf || 0) - lr.f < 45); a.ai.loadRead = null;
      // contact happens about half a meter before the closest approach; a player needs about 8 frames (133 ms at 60 Hz) to notice in time
      const tc = Math.max(0, t - 0.5 / Math.sqrt(sp2)), impactF = (this.wf || 0) + Math.max(1, Math.round(tc * 60));
      const delay0 = read ? 1 : Math.round(14 - 9 * r.foot);
      const busyR = a.ai.react && a.ai.react.aware && a.ai.react.B !== B && a.ai.react.B.state === 'flight' && Math.abs(a.ai.react.impactF - impactF) < 15 || !!(a.ai.react && a.ai.react.fake);
      let aware = read && !busyR;
      if (!aware) aware = Math.random() < (busyR ? 0.3 : 1) * (1 + (this.momLift ? this.momLift(a) : 0)) * clampR(this.viewOf(a, th.x, th.z) * this.busyOf(a) * (0.3 + 0.65 * r.aware) * (t < 0.3 ? 0.45 : 1));
      if (aware && impactF - (this.wf || 0) - delay0 < 8) { aware = false; this.awStat('tooClose'); }
      // an unnoticed second ball never cancels the reaction a player already has to the first one (it used to wipe it, so the first ball hit too)
      if (!aware) { this.awStat('unaware'); if (busyR && !(a.ai.react && a.ai.react.fake)) continue; a.ai.react = { B, aware: false, kind: 'none', impactF }; a.ai.press = -1; continue; }
      this.awStat('aware'); this.awStat(read ? 'onLoad' : 'onFlight'); if (a.held) this.awStat('holderAware');
      const sc = a.scale || 1, hImp = B.h + B.vh * t - 0.5 * (B.grav || 0) * t * t;
      const trick = B.type === 'hook' || B.type === 'zig' || B.type === 'moon' || B.type === 'hop', heavy = B.power || B.heavy;
      const last = this.liveCount(a.team) === 1;
      const delay = delay0;
      let kind;
      if (a.held) kind = last ? 'dodge' : (this.abBlockKind(a) || Math.random() < 0.8 + 0.18 * r.comp ? 'block' : 'dodge');     // block and hold; the last one standing dodges, then punishes
      else {
        // no-sting balls are very catchable: catch first at chest height, then duck high balls, else sidestep
        const chest = hImp > 0.6 * sc && hImp < 1.5 * sc;
        let pc = (chest ? 0.4 + 0.55 * r.catch : 0.12 + 0.3 * r.catch) * (1 + this.abil('catchWindow', a.team)); if (trick) pc *= 0.55; if (heavy) pc *= 0.7; if (last) pc *= 0.7;
        pc *= this.abCatchMul(a, hImp, sc); if (B.hard) pc *= 0.6;
        if (Math.random() < pc || this.abHighCatch(a, hImp, sc)) kind = 'catch';
        else kind = this.pickEvade(a, hImp, sc, impactF - (this.wf || 0) - delay);
      }
      kind = this.abOnNotice(a, B, kind, impactF, hImp, sc);
      a.ai.react = { B, aware: true, kind, at: (this.wf || 0) + delay, impactF, src: read ? 'load' : 'flight' };
      this.awStat('k_' + kind); if (a.held && kind === 'block') this.awStat('holderBlock');
      if (kind !== 'catch' && kind !== 'block') { const tr = this.dodgeTier(a); this.awStat('ev_' + tr); this.awStat('ev_' + tr + '_' + kind); }
      this.awStat('aware_' + this.dodgeTier(a));
      if (kind === 'catch') { this.awStat('catchTry_' + a.arch); if (this.abil('catchWindow', a.team)) this.abilityTell(a, 'catchWindow'); this.abCatchTell(a, hImp, sc); const err = Math.round((Math.random() - 0.5) * 2 * (1 - r.catch) * 8 * (1 - this.abil('catchWindow', a.team)) * this.abErrMul(a)); a.ai.press = Math.max((this.wf || 0) + delay, impactF - (10 + Math.min(2, err))); }   // a touch earlier: contact comes before the closest approach
      else a.ai.press = -1;
      if (kind === 'duck') a.ai.press = Math.max((this.wf || 0) + delay, impactF - TUNE.duckAfter - 3);
      // the tell: a quick turn toward the throw and a tiny ! (brand gold for FINAL BOSS, lime for the Glitches)
      if (!a.locked()) a.yaw = Math.atan2(th.x - a.x, th.z - a.z);
      this.pop(a, '!', 'tiny ' + (a.team === 0 ? 'gold sh0' : 'lime sh1'));
    }
  }
  dodgeTier(a) { const f = (a.rt || FB_BASE).foot; return f < 0.55 ? 'beginner' : f < 0.78 ? 'mid' : 'elite'; }
  pickEvade(a, hImp, sc, lead) {
    // P0j athletic evasion, scaled by the dodge (footwork) rating: low balls get a hop, high balls a duck, chest-high balls a sidestep,
    // lean, spin, dive or (elite only) a late matador pull-back; beginners sometimes freeze
    const f = (a.rt || FB_BASE).foot, tier = this.dodgeTier(a);
    if (f < 0.55 && Math.random() < (0.55 - f) * 0.9) return 'freeze';
    if (hImp < 0.55 * sc && lead > 14) return Math.random() < 0.45 + 0.45 * f ? 'hop' : 'dodge';
    if (hImp > 1.3 * sc && lead > TUNE.duckAfter + 3) return Math.random() < 0.75 ? 'duck' : 'dodge';
    const nearLine = Math.abs(a.z) > HZ - 1.6;
    const W = [['dodge', 1], ['lean', 0.5 + f], ['spin', 0.2 + f * 0.8], ['dive', nearLine ? 0.05 : 0.15 + 0.6 * f], ['matador', tier === 'elite' && lead > 8 ? 1.3 : 0]];
    let r = Math.random() * W.reduce((t, w) => t + w[1], 0);
    for (const [k, w] of W) { r -= w; if (r <= 0) return k; }
    return 'dodge';
  }
  evadeDir(a, B) {
    // step off the ball's line, away from side lines, and never into a teammate who is set to catch
    const cross = B.vx * (a.z - B.z) - B.vz * (a.x - B.x); let dz = cross >= 0 ? 1 : -1;
    if (Math.abs(a.z) > HZ - 1.2 && Math.sign(a.z) === dz) dz = -dz;
    for (const m of this.teams[a.team]) if (m !== a && m.ai.react && m.ai.react.kind === 'catch' && Math.abs(m.x - a.x) < 1.4 && Math.sign(m.z - a.z) === dz && Math.abs(m.z - a.z) < 1.6) { dz = -dz; break; }
    return dz;
  }
  reactIntent(a, it) {
    // returns true when an aware reaction owns this player's input this tick
    const R = a.ai.react; if (!R) return false;
    if (R.fake) { if ((this.wf || 0) > R.impactF) { a.ai.react = null; return false; } if (R.kind === 'dodge') { if (R.dz == null) R.dz = Math.abs(a.z) > HZ - 1.2 ? -Math.sign(a.z) : (Math.random() < 0.5 ? -1 : 1); it.mz = R.dz; } return true; }
    if (R.B.state !== 'flight' || (this.wf || 0) > R.impactF + 12) { a.ai.react = null; return false; }
    if (R.kind === 'save' && !R.B.pop) { a.ai.react = null; return false; }
    if (!R.aware || (this.wf || 0) < R.at) return false;
    if (R.kind === 'block') { a.yaw = Math.atan2(R.B.x - a.x, R.B.z - a.z); return true; }
    if (R.kind === 'save') { const d = Math.hypot(R.tx - a.x, R.tz - a.z); if (d > 0.35) { it.mx = (R.tx - a.x) / d; it.mz = (R.tz - a.z) / d; } a.yaw = Math.atan2(R.B.x - a.x, R.B.z - a.z); return true; }
    if (R.kind === 'catch') { if ((this.wf || 0) < R.impactF + 4) { a.yaw = Math.atan2(R.B.x - a.x, R.B.z - a.z); return true; } return false; }
    if (R.kind === 'duck') { it.catchHeld = true; return true; }
    if (R.kind === 'freeze') { if (!R.done && (this.wf || 0) >= R.impactF - 5 && !LOCKED.has(a.state)) { R.done = 1; a.set('lean'); a.leanDir = Math.random() < 0.5 ? -1 : 1; a.vz = 0.5 * a.leanDir; } return true; }   // a beginner who freezes still flinches, late (visible, rarely enough)
    if (R.kind === 'hop') { if ((this.wf || 0) >= R.impactF - 14 && !R.done && a.h <= 0.001) { it.jump = true; R.done = 1; } return true; }
    if (R.kind === 'lean' || R.kind === 'spin' || R.kind === 'dive' || R.kind === 'matador') {
      const lead = { lean: 10, spin: 12, dive: 13, matador: 7 }[R.kind];
      if (!R.done && (this.wf || 0) >= R.impactF - lead && !LOCKED.has(a.state)) {
        R.done = 1; const dz = this.evadeDir(a, R.B), sp = { lean: 1.4, spin: 2.8, dive: 6.2, matador: 3.6 }[R.kind] * (0.7 + 0.5 * (a.rt || FB_BASE).foot);
        a.set(R.kind); a.vz = dz * sp; a.vx = R.kind === 'dive' ? 0 : a.side * 0.6; a.leanDir = dz; a.diveDir = dz;
        if (R.kind === 'dive') this.dust(a, 4);
        // elite dodgers sometimes chain a second move (a sidestep the other way)
        if ((a.rt || FB_BASE).foot > 0.8 && Math.random() < 0.35) { R.chain = { at: (this.wf || 0) + ({ lean: 14, spin: 16, matador: 11, dive: 34 }[R.kind]), dz: -dz }; this.awStat('chain'); }
      }
      if (R.chain && (this.wf || 0) >= R.chain.at && !LOCKED.has(a.state)) { it.mz = R.chain.dz; }
      return true;
    }
    if (R.kind === 'dodge') {
      if (R.dz == null) {
        // step off the ball's line, never over a side line or the center line
        const cross = R.B.vx * (a.z - R.B.z) - R.B.vz * (a.x - R.B.x); R.dz = cross >= 0 ? 1 : -1;
        if (Math.abs(R.B.vx) < Math.abs(R.B.vz)) R.dz = 0;
        if (Math.abs(a.z) > HZ - 1.1 && Math.sign(a.z) === R.dz) R.dz = -R.dz;
      }
      it.mz = R.dz; it.mx = Math.abs(a.x) < HX - 1.2 ? a.side * 0.45 : 0;
      if (R.dz === 0) { it.mz = a.z > R.B.z ? 1 : -1; }
      return true;
    }
    return false;
  }
  switchUser(manual) {
    const ins = this.inPlayers(0).filter(a => a !== this.user || !manual); if (!ins.length) return;
    // teammate nearest a ball (loose on our side or incoming), else nearest to the current one
    let best = null, bd = 1e9;
    const targets = this.balls.filter(b => (b.state === 'loose' && b.x < 0) || (b.state === 'flight' && b.team === 1) || (b.holder && b.holder.team === 0));
    for (const a of ins) { if (manual && a === this.user) continue; for (const b of targets) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = a; } } }
    if (!best) best = ins.find(a => a !== this.user) || ins[0];
    if (best && best !== this.user) { this.user = best; this.pop(best, 'YOU', 'small gold'); }
  }

  // ------------------------------------------------ athlete control
  control(a, it) {
    a.st++;
    if (a.catchCool > 0) a.catchCool--;
    if (a.role === 'outline') { this.walkTo(a, a.qx, a.qz, 3.6); return; }
    if (a.role === 'returning') {
      a.backF++;
      const tx = a.side * 6.2, tz = -HZ + 1.0;
      this.walkTo(a, tx, tz, 4.5);
      if (Math.abs(a.x - tx) < 0.35 && Math.abs(a.z - tz) < 0.35 || a.backF > RULES.back * 60) { a.role = 'in'; a.set('idle'); a.vx = a.vz = 0; this.pop(a, 'IN!', 'small gold'); this.renderLive(); }
      return;
    }
    if (a.role === 'gone' || a.state === 'ko') { this.koStep(a); return; }
    if (a.oob > 0) { a.oob++; if (a.oob > RULES.oob * 60) { this.eliminate(a, 'oob'); this.ref('OUT: 10 SECONDS'); return; } }
    const st = a.state;
    switch (st) {
      case 'balance': a.vx = a.balanceNX * 1.8; a.vz = a.balanceNZ * 1.8; if (a.st >= 18) { a.vx = a.vz = 0; a.set('idle'); } return;
      case 'squat': if (a.st >= 4) { a.set('air'); a.vh = GRAV * (TUNE.airF / 60) / 2 * (a.jumpMul || 1); a.jumpMul = 0; a.airF = 0; } return;
      case 'land': if (a.st >= 6 + (a.landHold || 0)) { a.landHold = 0; a.set('idle'); } return;
      case 'windup': case 'pwind': { const n = st === 'pwind' ? TUNE.pWind : TUNE.wind; if (a.st >= (a.passing ? 4 : Math.round(n * (a.windMul || 1)))) { a.set(st === 'pwind' ? 'prel' : 'release'); this.release(a); } return; }
      case 'release': case 'prel': if (a.st >= (st === 'prel' ? TUNE.pRel : TUNE.rel)) a.set(st === 'prel' ? 'prec' : 'recover'); return;
      case 'recover': case 'prec': if (a.st >= (a.passing ? 6 : (st === 'prec' ? TUNE.pRec : TUNE.rec))) { a.passing = false; a.set(a.h > 0 ? 'air' : 'idle'); } return;
      case 'catch': if (a.st >= 14) a.set('idle'); return;
      case 'block': if (a.st >= 12) a.set('idle'); return;
      case 'bobble': if (a.st >= 22) a.set('idle'); return;
      case 'hitstun': if (a.st >= 22) a.set('ko'); return;
      case 'knock': return;
      case 'down': if (a.st >= 24) a.set('ko'); return;
      case 'walkin': if (a.st >= 20) a.set('idle'); return;
      case 'stagger': return;
      case 'lean': if (a.st >= 14) a.set('idle'); return;
      case 'spin': a.yaw += 0.42; if (a.st >= 16) a.set('idle'); return;
      case 'matador': if (a.st >= 11) a.set('idle'); return;
      case 'dive': if (a.st >= 16) { a.set('getup'); a.vx = a.vz = 0; if (Math.abs(a.z) > HZ - 0.3 && this.startTeeter && this.phase === 'play') { a.set('idle'); this.startTeeter(a, 'side', Math.sign(a.z), 2.2); } } return;
      case 'getup': if (a.st >= 18) a.set('idle'); return;
      case 'pump': if (a.st >= 14) a.set('idle'); return;
    }
    if (it.catch && a.catchCool === 0 && st !== 'air') { a.catchF = this.wf || 0; a.set('catchready'); a.catchHeld = 0; }
    if (a.state === 'catchready') {
      a.catchHeld = it.catchHeld ? a.catchHeld + 1 : 0;
      if (a.catchHeld > TUNE.duckAfter && !a.held) a.set('duck');
      else if (a.st >= 16) { if (it.catchHeld && !a.held) a.set('duck'); else { a.set('idle'); a.catchCool = TUNE.catchCool; } }
      else return;
    }
    if (a.state === 'duck') { if (!it.catchHeld || a.st >= TUNE.duckMax) { a.set('idle'); a.catchCool = 8; } else return; }
    if (a.held && (it.throw || it.pass) && a.oob === 0) { this.beginThrow(a, it); return; }
    const ground = a.h <= 0.0001;
    if (it.jump && ground && (a.state === 'idle' || a.state === 'walk' || a.state === 'run')) { a.airSteps = a.state === 'run' ? Math.max(1, a.steps) : 0; a.set('squat'); this.sfx.step(); return; }
    if (a.state === 'air') { a.airF++; return; }
    if (it.dash && (a.state === 'idle' || a.state === 'walk')) { if (a === this.user) this.sfx.squeak(); a.set('run'); a.runDir = it.dash; a.runF = 0; a.steps = 0; }
    if (a.state === 'run') {
      const holding = it.holdRun && Math.sign(it.mx || a.runDir) === a.runDir;
      if (!holding) a.set('idle');
      else if (this.rushT >= RULES.rushF && a.x * a.side < 0.7 && a.runDir === -a.side) { a.set('idle'); a.vx = a.runDir * 2.2; }
      else { a.runF++; if (a.runF % TUNE.stepF === 0) { a.steps++; if (a === this.user) this.sfx.step(); this.dust(a); } a.vx = a.runDir * TUNE.run; a.vz = it.mz * TUNE.walk * 0.6; return; }
    }
    const mag = Math.hypot(it.mx, it.mz);
    if (mag > 0.15) { const k = Math.min(1, mag) / mag; const sp = TUNE.walk * (a.boss && this.p2 ? 1.15 : 1) * (1 + this.abil('moveSpeed', a.team)) * (a.ai.react && a.ai.react.aware && a.ai.react.kind === 'dodge' ? 0.8 + 0.7 * (a.rt || FB_BASE).foot : 1); if (a.team === 1 && mag > 0.8 && this.abil('moveSpeed', 1)) this.abilityTell(a, 'moveSpeed'); a.vx = it.mx * k * sp; a.vz = it.mz * k * sp * 0.85; if (a.state !== 'walk') a.set('walk'); }
    else { a.vx *= 0.6; a.vz *= 0.6; if (a.state !== 'idle') a.set('idle'); }
  }
  walkTo(a, tx, tz, sp) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (a.state === 'ko' || a.state === 'knock' || a.state === 'down' || a.state === 'hitstun') { this.koStep(a); return; }
    if (d > 0.08) { const s = Math.min(sp * DT, d); a.x += dx / d * s; a.z += dz / d * s; if (a.state !== 'walk') a.set('walk'); a.yaw = Math.atan2(dx, dz); }
    else if (a.state !== 'idle') { a.set('idle'); a.yaw = a.role === 'outline' ? (a.team === 0 ? 150 * DEG : -150 * DEG) : a.yaw; }
  }
  beginThrow(a, it) {
    const inAir = a.state === 'air';
    a.passing = !!it.pass;
    if (it.pass) {
      a.passTarget = a.passTarget && a.passTarget.role === 'in' ? a.passTarget : this.pickPass(a, it);
      if (!a.passTarget) { a.passing = false; return; }
      a.throwType = 'pass'; a.wantPower = false; a.set('windup'); a.vx *= 0.3; a.vz *= 0.3; return;
    }
    let power = false, type = 'normal';
    if (a.state === 'run') { if (a.steps >= TUNE.powMin && a.steps <= TUNE.powMax) { power = true; type = a.shots[0]; } else type = 'dash'; }
    else if (inAir) { const f = a.airF; if (a.airSteps >= 1 && f >= TUNE.airPowA && f <= TUNE.airPowB) { power = true; type = a.shots[1]; } else type = 'jump'; }
    if (a.boss && this.p2 && Math.random() < 0.6) { power = true; type = a.shots[(Math.random() * 2) | 0]; }
    if (a.team === 1 && !power && !inAir && Math.random() < this.abil('throwCurve', 1)) { type = 'hook'; this.abilityTell(a, 'throwCurve'); }
    if (this.abOnThrow(a, it, inAir, power)) return;
    if (a.sig) type = a.sig.k.base;
    a.wantPower = power; a.throwType = type;
    a.throwTarget = this.abTarget(a, this.pickTarget(a, it));
    this.windupNotice(a);
    a.set(power ? 'pwind' : 'windup');
    if (!inAir) { a.vx *= power ? 0.5 : 0.35; a.vz *= 0.3; }
    if (power) { this.aura(a); if (a.team === 0) this.stats.power++; if (a === this.user) { this.meterFire = this.frame + 30; this.haptic([20, 30, 40]); } }
  }
  pickTarget(a, it) {
    const foes = this.inPlayers(1 - a.team).filter(f => f.oob === 0); if (!foes.length) return null;
    if (a === this.user) {
      if (it && Math.abs(it.mz) > 0.3) { const s = foes.slice().sort((p, q) => p.z - q.z); return it.mz < 0 ? s[0] : s[s.length - 1]; }
      return foes.slice().sort((p, q) => (Math.abs(p.z - a.z) + Math.abs(p.x - a.x) * 0.25) - (Math.abs(q.z - a.z) + Math.abs(q.x - a.x) * 0.25))[0];
    }
    if (a.syncTarget && a.syncTarget.role === 'in') return a.syncTarget;
    let best = null, bs = -1e9;
    for (const f of foes) {
      const fv = f.facingVec(); const tx = a.x - f.x, tz = a.z - f.z; const away = (fv[0] * tx + fv[1] * tz) < 0;
      // throw where they are not looking, at the busy, and at rushers who linger up front; avoid a set catcher
      const linger = Math.abs(f.x) < ATK + 0.6 ? 2 : 0, set = f.state === 'catchready' ? -2.5 : 0, busy = f.ai.claimBall ? 1.5 : 0;
      const s = (away ? 3 : 0) + (f.locked() ? 2 : 0) + (f.held ? -1.5 : 0) + linger + set + busy - Math.hypot(tx, tz) * 0.25 + Math.random() * 2.5 + (f === this.user ? 0.6 : 0);
      if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  pickPass(a, it) {
    const mates = this.inPlayers(a.team).filter(m => m !== a && !m.held && !m.locked());
    if (!mates.length) return null;
    const cs = this.callSuggest; if (a === this.user && cs && this.frame < cs.until && mates.includes(cs.to) && Math.hypot(it ? it.mx : 0, it ? it.mz : 0) < 0.2) { this.callSuggest = null; return cs.to; }
    const mx = it ? it.mx : 0, mz = it ? it.mz : 0;
    if (Math.hypot(mx, mz) < 0.2) return mates.slice().sort((p, q) => Math.abs(q.x) - Math.abs(p.x))[0];
    let best = null, bs = -1e9;
    for (const m of mates) { const dx = m.x - a.x, dz = m.z - a.z, d = Math.hypot(dx, dz) || 1; const s = (dx * mx + dz * mz * 1.5) / d - d * 0.02; if (s > bs) { bs = s; best = m; } }
    return best;
  }
  release(a) {
    const B = a.held; if (!B) return;
    a.held = null; B.holder = null; B.byUser = a === this.user; B.thrower = a; B.team = a.team; B.age = 0; B.hitSet = new Set(); B.pending = null; B.bounces = 0; B.claim = null;
    B.fromSide = a.side; B.crossed = false; B.live = false; B.deflected = false; B.forceHead = !!a.forceHead; a.forceHead = false;
    const hx = a.x + Math.sin(a.yaw) * 0.4, hz = a.z + Math.cos(a.yaw) * 0.4;
    B.x = hx; B.z = hz; B.h = a.h + 1.45 * a.scale; B.state = 'flight'; B.type = a.throwType; B.power = a.wantPower; B.pierce = 0; this.abRelease0(a, B);
    if (a === this.user) this.haptic(B.power ? [14, 18, 22] : 10);
    if (B.type === 'pass') {
      const t = a.passTarget; B.target = t;
      const d = Math.hypot(t.x - B.x, t.z - B.z); const eta = Math.max(0.35, d / TUNE.vPass);
      B.vx = (t.x - B.x) / eta; B.vz = (t.z - B.z) / eta; B.vh = ((t.h + 1.2) - B.h) / eta + 0.5 * 12 * eta; B.grav = 12;
      a.passTarget = null; this.sfx.throw(false); return;
    }
    if (!B.cleared) {
      // a rushed ball must clear the attack line before it is thrown: dead ball to the other team
      B.vx = -a.side * 6; B.vz = 0; B.vh = 3; B.grav = GRAV; B.state = 'loose'; B.team = -1; B.x = a.x; B.cleared = true;
      this.pop(a, 'DEAD BALL', 'red'); this.ref('CLEAR THE LINE FIRST'); this.sfx.buzz();
      return;
    }
    const t = a.throwTarget && a.throwTarget.role === 'in' ? a.throwTarget : this.pickTarget(a, null);
    B.target = t; B.sync = !!a.syncTarget; a.syncTarget = null;
    const cpu = a !== this.user || !!this.simAll, rt = a.rt || FB_BASE;
    // a power arm's ball is heavier: faster, louder, a wider trail
    B.heavy = cpu && rt.power >= 0.84;
    const sBoost = this.abil('throwSpeed', a.team); if (sBoost) this.abilityTell(a, 'throwSpeed');
    const spd = ({ normal: TUNE.vNormal, dash: TUNE.vDash, jump: TUNE.vJump, comet: 23, hook: 20, hop: 20, moon: 13, zig: 19 }[B.type] || 14) * (cpu ? 0.9 + 0.22 * rt.power : 1) * (1 + sBoost) * ((a.sig && a.sig.k.speed) || 1) * this.abPow(a);
    let tx = t ? t.x : a.x - a.side * 9, tz = t ? t.z : a.z;
    if (t) { const d0 = Math.hypot(tx - B.x, tz - B.z); const eta0 = d0 / spd; tx += t.vx * eta0 * 0.6; tz += t.vz * eta0 * 0.6; }
    if (cpu && t) tz += (Math.random() - 0.5) * 1.5 * (1 - rt.acc) / this.abAccM(a);   // accuracy: command players hit their spot
    if (a.xAim && t) { const ux = tx - B.x, uz = tz - B.z, L = Math.hypot(ux, uz) || 1, o = a.xAim.side * 0.3 * t.scale; tx += -uz / L * o; tz += ux / L * o; }   // SMALL X: left or right shoulder (or shin)
    const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1, eta = d / spd;
    B.vx = dx / d * spd; B.vz = dz / d * spd; B.grav = 6;
    // "Hit hips and legs. Never aim at a head": CPU throwers aim between the knees and the hips
    const aimH = (a.xAim && a.xAim.h) || (a.sig && a.sig.k.aim) || (cpu ? 0.5 + Math.random() * 0.42 + (Math.random() - 0.5) * 0.5 * (1 - rt.acc) : 0.9);
    const th = (B.forceHead ? 1.78 : aimH) * (t ? t.scale : 1);
    if (cpu && B.type !== 'pass') { this.awStat('aiThrows'); this.awStat('throw_' + a.arch); if (this.balls.filter(x => x.holder && x.holder.team === a.team).length === 0 && this.balls.filter(x => x.state === 'flight' && x.team === a.team && x !== B).length === 0) this.awStat('oneBallThrow' + a.team); B.fakeShot = !!a.fakeShot; a.fakeShot = false; if (B.fakeShot) this.awStat('fakeShots'); if (aimH < 1.1) this.awStat('belowChest'); if (B.sync) this.awStat('syncBalls'); }
    B.vh = (th - B.h) / eta + 0.5 * B.grav * eta;
    if (B.type === 'hook') { const ang = (Math.random() < 0.5 ? -1 : 1) * 0.5; const c = Math.cos(ang), s = Math.sin(ang); const vx = B.vx * c - B.vz * s, vz = B.vx * s + B.vz * c; B.vx = vx; B.vz = vz; B.vh = 0.3; B.grav = 0; }
    if (B.type === 'comet') { B.vh = (1.0 * (t ? t.scale : 1) - B.h) / eta; B.grav = 0; }
    if (B.type === 'hop') { B.vh = -6; B.grav = 20; }
    if (B.type === 'moon') { const e = Math.max(0.9, eta); B.vx = dx / e; B.vz = dz / e; B.grav = 18; B.vh = ((t ? t.scale * 1.15 : 1.2) - B.h) / e + 0.5 * B.grav * e; }
    if (B.type === 'zig') { B.zigBase = { vx: B.vx, vz: B.vz }; B.vh = (1.0 - B.h) / eta; B.grav = 0; }
    B.trailC = B.power ? ({ comet: '#ffc83d', hook: '#ff6b4a', hop: '#7ff3ff', moon: '#c9a0ff', zig: OPPC.sig }[B.type] || '#ffffff') : (B.heavy ? (a.team === 0 ? '#ffc83d' : OPPC.sig) : '#ffffff');
    this.sfx.throw(B.power || B.heavy);
    if (B.power) { this.pop(a, SHOT_NAME[B.type] || 'POWER!', a.team === 0 ? 'gold' : 'lime'); B.flash = 6; }
    if (this.ctlTeam === a.team) this.ctlT = Math.max(0, this.ctlT - 0);
    this.abRelease1(a, B, t);
    if (a.ninaPlay) { B.nina = a.ninaPlay; this.awStat('ninaBall_' + a.ninaPlay); } a.xAim = null; a.noLook = false; a.ninaPlay = null; a.rushCarry = false; a.rushThrow = false;
    this.noticeThrow(B);
  }

  // ------------------------------------------------ physics
  physics(a) {
    if (!a.active || a.role !== 'in') { this.faceIdle(a); return; }
    if (a.state === 'ko') return;
    // boundary behavior now lives in clampAthlete (teeter), identical to the Mobile edition
    if (a.state === 'knock') {
      a.vh -= GRAV * DT; a.h += a.vh * DT; a.x += a.vx * DT; a.z += a.vz * DT;
      if (a.h <= 0) { a.h = 0; a.vh = 0; a.vx *= 0.3; a.vz *= 0.3; a.set('down'); this.dust(a, 5); this.shakeScreen(this.rm ? 0 : 2, 6); }
      return;
    }
    if (a.state === 'hitstun' && a.st < 12 && a.knock) { a.x += a.knock.dx / 12; a.z += a.knock.dz / 12; }
    if (a.state === 'air' || a.h > 0) {
      a.vh -= GRAV * DT; a.h += a.vh * DT; a.x += a.vx * DT; a.z += a.vz * DT;
      if (a.h <= 0) { a.h = 0; a.vh = 0; if (a.state === 'air') { a.set('land'); this.dust(a, 3); } a.vx *= 0.3; a.vz *= 0.3; }
    } else if (!a.locked() || a.state === 'walkin' || DODGES.has(a.state)) { a.x += a.vx * DT; a.z += a.vz * DT; if (DODGES.has(a.state)) { a.vx *= 0.93; a.vz *= 0.93; } }
    else { a.vx *= 0.8; a.vz *= 0.8; a.x += a.vx * DT * 0.3; a.z += a.vz * DT * 0.3; }
    this.clampAthlete(a);
    // facing
    let fx, fz;
    if (a.state === 'run') { fx = a.runDir; fz = -0.5; }
    else if (a.state === 'down' || a.state === 'getup') return;
    else if (a.held && a.throwTarget && !a.noLook && (a.state === 'windup' || a.state === 'pwind')) { fx = a.throwTarget.x - a.x; fz = a.throwTarget.z - a.z; }
    else if (a.held && a.passTarget && a.passing) { fx = a.passTarget.x - a.x; fz = a.passTarget.z - a.z; }
    else {
      const R = a.ai && a.ai.react, inc = this.aiPlays(a) ? (R && R.aware && !R.fake && R.B.state === 'flight' ? R.B : null) : this.incomingFor(a);
      if (inc) { fx = inc.x - a.x; fz = inc.z - a.z; }
      else if (a.ai.claimBall && !a.held) { fx = a.ai.claimBall.x - a.x; fz = a.ai.claimBall.z - a.z; }
      else { fx = -a.side; fz = 0; }
      const l = Math.hypot(fx, fz) || 1; fx /= l; fz = fz / l - 0.55;
    }
    const target = Math.atan2(fx, fz);
    let d = target - a.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    a.yaw += Math.max(-Math.PI / TUNE.turnF, Math.min(Math.PI / TUNE.turnF, d));
  }
  faceIdle(a) { }
  boundaryAwareness(a) {
    if (this.phase !== 'play' || a.role !== 'in' || a.oob > 0) return;
    // Only these two edges are immediate outs under the existing rules. Legal
    // opening-rush crossings and back-line retrieval do not trigger a save.
    const hazards = [];
    if (this.rushT >= RULES.rushF) hazards.push({ key: 'center', d: a.x * a.side + 0.05, nx: a.side, nz: 0, out: -a.vx * a.side });
    if (Math.abs(a.x) < HX) hazards.push({ key: 'side', d: HZ + 0.2 - Math.abs(a.z), nx: 0, nz: -Math.sign(a.z || 1), out: a.vz * Math.sign(a.z || 1) });
    if (a.boundaryRisk && !hazards.some(h => h.key === a.boundaryRisk && h.d < 0.9)) a.boundaryRisk = null;
    if (a.h > 0.02 || a.locked() || a.state === 'air') return;
    const h = hazards.filter(h => h.d >= 0 && h.d <= Math.max(0.18, h.out * 0.1) && h.out > 0.3).sort((a, b) => a.d - b.d)[0];
    if (!h || a.boundaryRisk === h.key) return;
    a.boundaryRisk = h.key;
    const foot = (a.rt || FB_BASE).foot, chance = (h.out > 4.5 ? 0.45 : 0.7) + 0.28 * foot;   // P0f: sharper footwork saves more often
    if (this.ruleRandom() < chance) {
      a.balanceNX = h.nx; a.balanceNZ = h.nz; a.vx = h.nx * 1.8; a.vz = h.nz * 1.8; a.set('balance');
      this.pop(a, 'HOLD THE LINE', 'small ' + (a.team === 0 ? 'gold sh0' : 'lime sh1')); this.awStat('teeterSaved'); if (a === this.user || Math.random() < 0.4) this.sfx.ooh(); this.lineFlash = 30;
    } else { a.stumbleT = 24; this.pop(a, 'OFF BALANCE', 'small'); this.awStat('teeterFell'); }
  }
  clampAthlete(a) {
    const s = a.side, rush = this.rushT < RULES.rushF;
    const backOK = this.backLineBallFor(a);
    const isUser = a === this.user;
    // P0f, identical in both editions: after the rush a grounded player is held at the line; reaching it with speed starts a visible teeter,
    // and only momentum that carries over is an out. Airborne players and anyone already across are not held back, so rules() calls the crossing.
    const grounded = a.h <= 0.001 && a.state !== 'knock' && a.state !== 'air', px = a.x - a.vx * DT, pz = a.z - a.vz * DT;
    const hold = !rush && grounded && px * s > -0.02;
    if (hold && a.role === 'in' && a.state !== 'teeter' && a.x * s < 0.11 && a.vx * s < -1.0 && !LOCKED.has(a.state)) this.startTeeter(a, 'center', 0, Math.abs(a.vx));
    const cen = rush ? -1.0 : (hold ? 0.06 : -9);
    if (s < 0) a.x = Math.min(-cen, a.x); else a.x = Math.max(cen, a.x);
    // back line: only to fetch a ball that is already out
    const maxX = backOK || a.oob > 0 ? HX + 1.6 : HX - 0.25;
    if (s < 0) a.x = Math.max(-maxX, a.x); else a.x = Math.min(maxX, a.x);
    const beyondBack = Math.abs(a.x) > HX;
    if (beyondBack && a.oob === 0 && a.role === 'in') { a.oob = 1; if (isUser) this.ref('OUT THE BACK: 10 S'); }
    if (!beyondBack && a.oob > 0) a.oob = 0;
    const zl = beyondBack ? HZ + 1.2 : HZ - 0.08, holdZ = !beyondBack && grounded && Math.abs(pz) <= HZ + 0.02;
    if (holdZ && a.role === 'in' && a.state !== 'teeter' && Math.abs(a.z) > zl - 0.04 && a.vz * Math.sign(a.z) > 1.0 && !LOCKED.has(a.state) && this.phase === 'play') this.startTeeter(a, 'side', Math.sign(a.z), Math.abs(a.vz));
    if (holdZ || beyondBack) a.z = Math.max(-zl, Math.min(zl, a.z));
  }
  backLineBallFor(a) {
    if (this.liveCount(a.team) <= 1) return false;
    return this.balls.some(b => b.state === 'loose' && Math.abs(b.x) > HX - 0.05 && Math.sign(b.x) === a.side && Math.abs(b.z) < HZ + 1.3);
  }

  // ------------------------------------------------ balls
  updateBall(B) {
    B.age++; if (B.flash > 0) B.flash--; if (B.squash > 0) B.squash *= 0.8;
    if (B.state === 'held') { this.placeBallMesh(B); return; }
    if (B.state === 'rest') { this.pickup(B); this.placeBallMesh(B); return; }
    if (B.pending) {
      const p = B.pending; p.f--;
      if ((this.wf || 0) - p.a.catchF <= TUNE.catchLate && p.a.catchF >= p.start) { B.pending = null; this.doCatch(p.a, B, false); return; }
      if (p.f <= 0) { B.pending = null; this.applyHit(p.a, B); }
      this.placeBallMesh(B); return;
    }
    if (B.state === 'flight') {
      if (B.type === 'hook' && B.age === 24 && B.live !== null) {
        const t = this.nearestFoe(B); if (t) { const sp = Math.hypot(B.vx, B.vz); const want = Math.atan2(t.z - B.z, t.x - B.x); const cur = Math.atan2(B.vz, B.vx); let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; d = Math.max(-60 * DEG, Math.min(60 * DEG, d)); const n = cur + d; B.vx = Math.cos(n) * sp; B.vz = Math.sin(n) * sp; B.target = t; this.burst(B.x, B.h, B.z, '#ff6b4a', 6); }
      }
      if (B.type === 'zig' && B.zigBase) { const w = Math.sin(B.age * 0.22) * 6.5; const bx = B.zigBase.vx, bz = B.zigBase.vz, l = Math.hypot(bx, bz) || 1; B.vx = bx - (bz / l) * w * 0.3; B.vz = bz + (bx / l) * w; }
      if (B.type === 'pass' && B.target) { const t = B.target; const dx = t.x - B.x, dz = t.z - B.z; if (Math.hypot(dx, dz) < 4) { B.vx += dx * 0.15; B.vz += dz * 0.15; } }
      if ((B.curve || B.wob || B.sig) && !B.deflected) this.abFlight(B);
      B.vh -= (B.grav || 0) * DT; B.x += B.vx * DT; B.z += B.vz * DT; B.h += B.vh * DT;
      // A blocked ball retains its original thrower and remains live over center.
      if (!B.crossed && B.x * B.fromSide < 0) { B.crossed = true; if (B.type !== 'pass') B.live = true; }
      // "Crossing the center line off a deflection" makes the ball dead (WeHo rulebook; P0g, same in both editions)
      if (B.deflected && B.x * B.defSide < 0) this.killBall(B, 'over');
      if (B.type === 'hop' && B.h <= 0.22) { B.h = 0.22; B.vh = 3.2 + B.bounces * 0.6; B.bounces++; B.vx *= 1.12; B.vz *= 1.12; this.dustAt(B.x, B.z, 2); }
      if ((B.power || B.type === 'dash' || B.heavy || B.pop || B.sig) && B.live) this.trail(B);
      if ((B.power || B.heavy) && B.live && B.age % 4 === 0 && !this.rm) this.spawnSprite({ tex: B.team === 0 ? this.tex.crown : (this.tex.t1 || this.tex.pixel), x: B.x, y: B.h, z: B.z, s: 0.26, s1: 0.1, life: 14, color: B.team === 0 ? '#ffc83d' : OPPC.sig, alpha: 0.9 });
      if (B.type === 'pass') {
        const t = B.target; if (t && t.role === 'in' && !t.held && Math.hypot(t.x - B.x, t.z - B.z) < 0.7 && Math.abs((t.h + 1.2) - B.h) < 1.3) { this.give(t, B); t.set('catch'); B.squash = 1; this.sfx.catch(); this.abOnPass(B.thrower || t, t); return; }
      }
      if (B.type !== 'hop' && B.h <= 0.22) { B.h = 0.22; this.killBall(B, 'floor'); this.dustAt(B.x, B.z, 2); return; }
      if (B.type === 'hop' && B.bounces > 5) { this.killBall(B, 'floor'); return; }
      if (Math.abs(B.x) > 12.3 || Math.abs(B.z) > HZ + 2.1) {
        if (!B.deflected) { this.killBall(B, 'wall'); return; }
        // Keep a lofted block in the arena until it reaches the floor.
        if (Math.abs(B.x) > 12.3) { B.x = Math.sign(B.x) * 12.3; B.vx *= -0.35; }
        if (Math.abs(B.z) > HZ + 2.1) { B.z = Math.sign(B.z) * (HZ + 2.1); B.vz *= -0.35; }
      }
      this.placeBallMesh(B); return;
    }
    // loose (dead) ball
    B.vh -= GRAV * DT; B.x += B.vx * DT; B.z += B.vz * DT; B.h += B.vh * DT;
    if (B.h <= 0.22) { B.h = 0.22; if (Math.abs(B.vh) > 1.5) { this.sfx.bounce(Math.min(1, Math.abs(B.vh) / 7)); B.vh = -B.vh * 0.5; } else B.vh = 0; B.vx *= 0.94; B.vz *= 0.94; }
    if (Math.abs(B.x) > 12) { B.x = Math.sign(B.x) * 12; B.vx = -B.vx * 0.5; }
    if (Math.abs(B.z) > HZ + 1.7) { B.z = Math.sign(B.z) * (HZ + 1.7); B.vz = -B.vz * 0.5; }
    const slow = Math.hypot(B.vx, B.vz) < 0.35 && B.h <= 0.23;
    if (slow) B.restF++; else B.restF = 0;
    // shaggers return balls that rolled out a side line, or sat out the back too long
    if (B.restF > 40 && Math.abs(B.z) > HZ + 0.15) this.shag(B);
    else if (B.restF > 360 && Math.abs(B.x) > HX) this.shag(B);
    else if (B.restF > 90 && Math.abs(B.x) < 0.3) { B.vx = (B.x === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(B.x)) * 2.2; B.restF = 0; }
    this.pickup(B);
    this.placeBallMesh(B);
  }
  shag(B) { B.z = Math.sign(B.z || 1) * Math.min(Math.abs(B.z), HZ - 0.9); B.x = Math.sign(B.x || 1) * Math.min(Math.abs(B.x), HX - 1.0); B.h = 1.4; B.vh = 2; B.vx = B.vz = 0; B.restF = 0; this.sparkle(B.x, 1.4, B.z); }
  pickup(B) {
    if (B.h > 1.1) return;
    let best = null, bd = 0.78;
    const rush = this.rushT < RULES.rushF && this.phase === 'play';
    for (const a of this.all) {
      if (!a.active || a.role !== 'in' || a.held || a.locked() || (a.state === 'air' && a.h > 1.2)) continue;
      if (B.state === 'rest') { if (!rush || B.rushTeam !== a.team) continue; }
      else if (Math.sign(B.x) !== a.side && Math.abs(B.x) > 0.3) continue;
      const d = Math.hypot(a.x - B.x, a.z - B.z); if (d < bd) { bd = d; best = a; }
    }
    if (best) { const wasRest = B.state === 'rest'; this.give(best, B); B.cleared = !wasRest; if (wasRest) this.ninaRushPick(best); if (wasRest && best === this.user) this.pop(best, 'CLEAR THE LINE', 'small cyan'); }
  }
  killBall(B, why) {
    if (B.pop) { const P = B.pop; B.state = 'loose'; this.resolvePop(B, null); B.pop = null; void P; }
    B.state = 'loose'; B.live = false; B.thrower = null; B.target = null; B.deflected = false;
    B.vx *= 0.45; B.vz *= 0.45; B.vh = Math.abs(B.vh) * 0.4 + 1.5;
  }
  nearestFoe(B) { let best = null, bd = 1e9; for (const f of this.inPlayers(1 - B.team)) { const d = Math.hypot(f.x - B.x, f.z - B.z); if (d < bd && !B.hitSet.has(f)) { bd = d; best = f; } } return best; }
  give(a, B) {
    B.state = 'held'; B.holder = a; a.held = B; B.team = a.team; B.vx = B.vz = B.vh = 0; B.live = false; B.claim = null; a.ai.plan = null; a.ai.claimBall = null;
    for (const p of this.all) if (p.ai.press >= 0 && !(p.ai.react && p.ai.react.B.state === 'flight') && !this.balls.some(b => b.state === 'flight' && b.target === p)) p.ai.press = -1;
  }
  ballHits() {
    // live balls against players, then ball against ball in the air (both go dead)
    for (const B of this.balls) {
      if (B.state !== 'flight' || B.type === 'pass' || B.pending) continue;
      for (const f of this.all) {
        if (!f.active || f.role !== 'in' || (f.team === B.team && !B.deflected) || f.oob > 0 || B.hitSet.has(f)) continue;
        if (f.state === 'knock' || f.state === 'down' || f.state === 'ko' || f.state === 'hitstun') continue;
        // evading a ball you saw: the better the footwork, the smaller the target (beginner about 1.06x, elite about 0.76x)
        const dh = DODGE_HIT[f.state], fr = f.ai && f.ai.react, ev = fr && fr.aware && fr.B === B && fr.kind !== 'catch' && fr.kind !== 'block' && fr.kind !== 'freeze';
        const r = (0.4 * f.scale + 0.22) * (dh ? dh.r : 1) * (ev ? 1.3 - 0.6 * (f.rt || FB_BASE).foot : 1);
        if (Math.hypot(f.x - B.x, f.z - B.z) > r) continue;
        const top = (f.state === 'duck' ? 1.0 : (dh ? dh.top : 1.98)) * f.scale + f.h, bot = f.h - 0.1;
        if (B.h > top + 0.12 || B.h < bot) continue;
        if (!B.live) { this.killBall(B, 'notlive'); break; }
        this.contact(f, B); break;
      }
    }
    for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
      const a = this.balls[i], b = this.balls[j];
      if (a.state !== 'flight' || b.state !== 'flight') continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.45 && Math.abs(a.h - b.h) < 0.45) {
        a.vx = -a.vx * 0.5; b.vx = -b.vx * 0.5; this.killBall(a, 'ball'); this.killBall(b, 'ball');
        this.spark((a.x + b.x) / 2, (a.h + b.h) / 2, (a.z + b.z) / 2, 1.2); this.ref('BALLS COLLIDE: DEAD'); this.sfx.bobble();
      }
    }
  }
  contact(f, B) {
    const thrower = B.thrower;
    // A returning deflection may be secured by the original throwing team,
    // but is never a friendly-fire out or a catch/reentry reward.
    if (f.team === B.team) {
      if (B.deflected && B.live && !f.held && f.state === 'catchready' && (this.wf || 0) - f.catchF <= TUNE.catchBobble) this.doCatch(f, B, true);
      return;
    }
    // P0j: a late athletic move (lean, spin, dive, matador) against a ball the player saw is a skill check at contact
    const fr = f.ai && f.ai.react;
    if (fr && fr.aware && fr.B === B && fr.done && DODGES.has(fr.kind) && f.state !== 'hitstun') {
      const base = { lean: 0.55, spin: 0.6, dive: 0.75, matador: 0.85 }[fr.kind], foot = (f.rt || FB_BASE).foot;
      if (Math.random() < base * (0.5 + 0.55 * foot)) { B.hitSet.add(f); this.awStat('evadeOK_' + this.dodgeTier(f)); this.pop(f, 'MISS', 'tiny ' + (f.team === 0 ? 'gold sh0' : 'lime sh1')); return; }
      this.awStat('evadeFail_' + this.dodgeTier(f));
    }
    if (this.abEvade(f, B)) return;
    const crouched = f.state === 'duck';
    const headLine = f.h + (crouched ? 0.8 : 1.6) * f.scale;
    if (B.pop && f.team === B.pop.team && f.state === 'catchready' && ((this.wf || 0) - f.catchF) <= TUNE.catchBobble) { return this.doCatch(f, B, true); }
    if (!B.pop && (B.h > headLine || B.forceHead)) {
      // direct headshot: dead ball, victim stays in. Standing headshot puts the thrower out.
      B.hitSet.add(f); B.vx *= -0.25; B.vz *= -0.25; B.vh = 4; this.killBall(B, 'head');
      this.spark(B.x, B.h, B.z, 1.3); this.hitstop = 4; f.shake = 8; f.shakeMax = 8;
      if (!crouched && thrower && thrower.role === 'in') {
        this.popBrush('HEADSHOT!', 'THROWER OUT', 'red'); this.stats.headshots++; this.sfx.vo('vo_headshot', 2);
        this.eliminate(thrower, 'headshot');
      } else this.pop(f, 'HEADSHOT: NO CALL', 'small');
      return;
    }
    const fv = f.facingVec(); const bl = Math.hypot(B.vx, B.vz) || 1;
    const facingOK = (fv[0] * -B.vx / bl + fv[1] * -B.vz / bl) > Math.cos(100 * DEG);
    if (facingOK && f.state === 'catchready') {
      const age = (this.wf || 0) - f.catchF;
      if (age <= TUNE.catchBobble) return f.held ? this.block(f, B, true) : this.doCatch(f, B, age <= TUNE.catchClean);
    }
    const R = f.ai && f.ai.react && f.ai.react.B === B ? f.ai.react : null;
    if (R && !R.aware && (f.state === 'catchready' || f.state === 'duck')) this.awStat('unawareReacted');
    if (f.held && this.aiPlays(f) && !(R && R.aware && R.kind === 'block')) return this.applyHit(f, B);   // an unaware holder never raised the ball
    if (f.held && facingOK && !f.locked()) {
      this.awStat('blockTry');
      const comp = (f.rt || FB_BASE).comp;
      if (Math.random() < this.abBlockP(f, this.aiPlays(f) ? 0.8 + 0.18 * comp : 0.6)) { this.awStat('blockOK'); return this.block(f, B, false); }
      // the blocking ball is knocked loose: that counts as out
      this.ref('BLOCK DROPPED'); return this.applyHit(f, B);
    }
    if (facingOK && !f.locked() && !f.held && f.state !== 'air' && f.state !== 'duck') { B.pending = { a: f, f: TUNE.catchLate, start: this.wf || 0 }; return; }
    this.applyHit(f, B);
  }
  block(f, B, timed) {
    B.hitSet.add(f); B.vx = -B.vx * 0.3 + (this.ruleRandom() - 0.5) * 2; B.vz = -B.vz * 0.3 + (this.ruleRandom() - 0.5) * 2;
    const loft = timed || this.ruleRandom() < 0.45; B.vh = loft ? 6.5 : 3; B.grav = GRAV;
    B.state = 'flight'; B.live = true; B.pending = null; B.deflected = true; B.defSide = f.side; B.type = 'normal'; B.power = false;
    B.target = this.nearestFoe(B); this.scheduleCatches(B);
    f.set('block'); this.hitstop = 4; this.spark(B.x, B.h, B.z, 1.2); this.pop(f, 'BLOCK!', f.team === 0 ? 'gold' : 'lime'); this.sfx.hit(false);
    if (f.team === 0) { this.stats.blocks++; this.addScore(60); }
  }
  doCatch(f, B, clean) {
    const thrower = B.thrower;
    if (f.team === 1 && this.AB && this.AB.tens && thrower && thrower.team !== f.team) clean = true;   // TENS ACROSS THE BOARD: the best hands never bobble
    if (thrower && thrower.team === f.team) { this.give(f, B); B.cleared = true; f.set('catch'); this.sfx.catch(); this.pop(f, 'SECURED', 'small cyan'); return; }
    if (f.team === 0) this.cheer(f.name);
    const save = !!(B.pop && B.pop.team === f.team && RULES.saveOnTeammateCatch); let saved = [];
    if (B.pop && B.pop.team === f.team) saved = this.resolvePop(B, f) || [];
    this.give(f, B); B.squash = 1; B.cleared = true;
    f.set(clean ? 'catch' : 'bobble');
    f.x += f.side * 0.2; this.clampAthlete(f);
    this.hitstop = 6; this.flash(clean ? 0.3 : 0.14); this.ringFx(f, clean ? '#ffffff' : '#ffc83d'); this.catchFlash(f); if (f.team === 0 || f === this.user) this.punch(f.x, f.z, 1);
    this.sfx.catch(); if (f === this.user) this.haptic(clean ? [18, 30, 28] : 22);
    this.abOnCatch(f);
    if (this.aiPlays(f)) { this.awStat('catchOK_' + f.arch); f.ai.react = null; f.ai.plan = { k: 'throw' }; f.ai.delay = 8 + ((Math.random() * 10) | 0); f.ai.t = 0; }   // catch, then answer right away
    this.crowdReact(f.team === 0 ? (this.liveCount(0) === 1 ? 'clutch' : 'catch') : 'oppcatch');
    // every team catch the stats count is one event (a save is recorded as the save); WebKit sim 10/27 found one catch with no event
    const cev = f.team === 0 && !save ? this.mev('catch', f, { you: f === this.user, out: thrower && thrower.role === 'in' ? thrower.name : '' }) : null;   // dot 10/27: name an out only if the thrower was in play
    if (f.team === 0) { this.stats.catches++; this.addScore(clean ? 150 : 90); } else this.breakCombo();
    if (thrower && thrower.role === 'in') { this.quietPop = save ? thrower : null; this.eliminate(thrower, 'caught'); this.quietPop = null; }
    this.addMomentum(f.team, 0.12);
    // the first teammate in the outline comes back in
    const q = this.queue[f.team];
    let back = null;
    if (q.length) {
      const r = q.shift(); back = r; r.role = 'returning'; r.backF = 0; r.h = 0; r.vh = r.vx = r.vz = 0; r.popScale = 1; r.knock = null; r.shake = 0; r.set('walk');
      if (!save) this.popBrush('CATCH!', `${r.name} ${r.num} BACK IN`, f.team === 0 ? '' : 'lime');
      if (f.team === 0) this.stats.backIn++;
      this.layoutQueue(f.team);
    } else if (save) { /* the sequence below says it */ } else if (f.team === 0) this.popBrush(clean ? 'CATCH!' : 'BOBBLE!', thrower ? `${thrower.name} OUT` : '', ''); else this.pop(f, 'CATCH!', 'lime');
    if (cev && back) { cev.kind = 'catchBack'; cev.back = back.name; }
    if (save) { const cl = f.team === 0 ? 'gold' : 'lime'; this.calloutSeq([{ t: 'SAVE!', sub: (saved.length ? saved.map(v => v.name).join(' AND ') + (saved.length > 1 ? ' STAY IN' : ' STAYS IN') : 'CAUGHT OFF THE DEFLECTION'), cls: cl, dur: 1.05 }, { t: (thrower ? thrower.name : 'THROWER') + ' OUT', sub: 'CAUGHT OFF THE DEFLECTION', cls: 'red', dur: 1.0 }].concat(back ? [{ t: 'BACK IN', sub: `${back.name} ${back.num}`, cls: cl, dur: 1.1 }] : [])); this.qaLog('saveSeq', { steps: back ? 3 : 2 }); }
    this.checkTide();
    this.renderLive();
    this.say(`${f.name} catches. ${thrower ? thrower.name + ' is out.' : ''}`);
  }
  popUp(f, B, why) {
    // "A ball that is deflected is still a live ball": it pops up off the body (or the dropped block) and stays live until the floor, a wall, an out player or the center line
    const sp = Math.hypot(B.vx, B.vz) || 1, ux = B.vx / sp, uz = B.vz / sp;
    B.state = 'flight'; B.live = true; B.crossed = true; B.deflected = true; B.defSide = f.side; B.type = 'normal'; B.power = false; B.grav = GRAV; B.pending = null;
    B.vx = ux * (1.2 + Math.random() * 1.6) + (Math.random() - 0.5) * 2.2; B.vz = uz * 0.8 + (Math.random() - 0.5) * 2.6; B.vh = 5.2 + Math.random() * 2.2; B.h = Math.max(B.h, 1.0);
    const P = B.pop || (B.pop = { team: f.team, victims: [], saved: false, t0: this.frame, thrower: B.thrower, byUser: !!B.byUser });
    if (!P.victims.includes(f)) P.victims.push(f);
    f.set('stagger'); f.vx = f.vz = 0; f.pendingOut = B; f.pendWhy = why;
    this.hitstop = Math.max(this.hitstop, this.rm ? 2 : 7); this.sfx.smp('deflect_pop', 0.9); this.spark(B.x, B.h, B.z, 1.4);
    this.pop(f, 'LIVE!', 'small ' + (f.team === 0 ? 'gold sh0' : 'lime sh1'));
    // landing spot: where the ball comes down, so players and people can read it
    const tl = (B.vh + Math.sqrt(B.vh * B.vh + 2 * GRAV * Math.max(0, B.h - 0.22))) / GRAV; B.land = { x: B.x + B.vx * tl, z: B.z + B.vz * tl, f: (this.wf || 0) + Math.round(tl * 60) };
    this.awStat('popups');
    // touch players: control jumps to the nearest teammate under a falling pop-up, so a save is one CATCH tap away (dot 10/26)
    if (f.team === 0 && !this.simAll && this.root.classList.contains('has-touch') && this.user) { const c = this.inPlayers(0).filter(m => m !== f && !m.held && m.state !== 'stagger').sort((p, q) => Math.hypot(p.x - B.land.x, p.z - B.land.z) - Math.hypot(q.x - B.land.x, q.z - B.land.z))[0]; if (c && c !== this.user && Math.hypot(c.x - B.land.x, c.z - B.land.z) < 3.4 && Math.hypot(c.x - B.land.x, c.z - B.land.z) + 0.6 < Math.hypot(this.user.x - B.land.x, this.user.z - B.land.z)) { this.user = c; this.pop(c, 'YOU: SAVE IT', 'small gold sh0'); } }
    // aware teammates near the landing spot go for the save; unaware ones do not react and can be hit by it
    for (const m of this.teams[f.team]) {
      if (m === f || !this.aiPlays(m) || m.held || m.state === 'stagger') continue;
      const d = Math.hypot(m.x - B.land.x, m.z - B.land.z); if (d > 3.4) continue;
      const r = m.rt || FB_BASE; const aware = Math.random() < clampR(this.viewOf(m, B.x, B.z) * (0.35 + 0.6 * r.aware) * (1 + (this.momLift ? this.momLift(m) : 0)));
      if (!aware) { this.awStat('popUnaware'); continue; }
      this.awStat('popAware');
      m.ai.react = { B, aware: true, kind: 'save', at: (this.wf || 0) + 3, impactF: B.land.f, tx: B.land.x, tz: B.land.z };
      m.ai.press = Math.max((this.wf || 0) + 4, B.land.f - 12 - Math.round((1 - r.catch) * 4));
      this.pop(m, '!', 'tiny ' + (m.team === 0 ? 'gold sh0' : 'lime sh1'));
    }
  }
  resolvePop(B, saver) {
    const P = B.pop; if (!P) return; B.pop = null; B.land = null;
    const victims = P.victims.filter(v => v.pendingOut === B);
    for (const v of victims) { v.pendingOut = null; }
    if (saver && RULES.saveOnTeammateCatch) {
      // confirmed by Gordon 2026-10-26 ("that is in the rules"): a teammate catching a deflection off a hit player before the floor saves that player and puts the thrower out
      for (const v of victims) { if (v.role === 'in') v.set('idle'); }
      if (saver.team === 0) this.mev('save', saver, { you: saver === this.user, saved: victims.map(v => v.name), out: P.thrower && P.thrower.role === 'in' && P.thrower.team !== saver.team ? P.thrower.name : '' }); this.awStat('saves'); if (saver.team === 0) this.stats.saves = (this.stats.saves || 0) + 1; this.bigMoment('save', saver.team, saver, true);
      return victims;
    }
    const gone = victims.filter(v => v.role === 'in');
    if (P.team === 1 && gone.length && P.thrower && P.thrower.team === 0) this.mev(gone.length >= 2 ? 'double' : 'out', P.thrower, { you: !!P.byUser, victims: gone.map(v => v.name) });
    for (const v of victims) if (v.role === 'in') this.eliminate(v, v.pendWhy || 'hit');
    if (victims.length >= 2 && P.team === 1) this.stats.doubles = (this.stats.doubles || 0) + 1;
    if (victims.length >= 2) { this.awStat(victims.length >= 3 ? 'triples' : 'doubles'); this.bigMoment(victims.length >= 3 ? 'triple' : 'double', 1 - P.team, victims[victims.length - 1]); }
  }
  applyHit(f, B) {
    if (B.thrower && B.thrower.team === 0) this.cheer(B.thrower.name);
    const power = B.power || B.type === 'zig';
    // P0g: sometimes the ball pops up off the body and stays live (more off softer hits that land high on the body, never on a headshot)
    const rel = (B.h - f.h) / (2 * (f.scale || 1)), popP = 0.06 + (power ? 0.04 : 0.1) * Math.min(1, Math.max(0, rel)) + (B.pop ? 0.05 : 0);
    if ((this.forcePop > 0 ? (this.forcePop--, true) : Math.random() < popP) && (!B.pop || B.pop.victims.length < 3)) { /* forcePop is a QA hook */ B.hitSet.add(f); if (B.thrower && B.thrower.team === 1 - f.team) { /* stats count the pop as a hit */ } this.sfx.hit(false); this.popUp(f, B, power ? 'power' : 'hit'); return; }
    if (B.pop && B.pop.team === f.team) {
      // a live pop-up hitting another teammate: that player is out too (double and triple outs)
      B.hitSet.add(f); if (!B.pop.victims.includes(f)) B.pop.victims.push(f); f.pendingOut = B; f.pendWhy = 'hit';
      this.sfx.hit(false); this.spark(B.x, B.h, B.z, 1.6); this.killBall(B, 'hit'); return;
    }
    B.hitSet.add(f);
    this.hitstop = this.rm ? 4 : (power ? TUNE.hsPower : TUNE.hsKO);
    f.shake = this.hitstop + 6; f.shakeMax = f.shake;
    if (!this.rm) { if (power) this.shakeScreen(7, 16); else this.shakeScreen(4, 10); }
    this.spark(B.x, B.h, B.z, power ? 2.6 : 1.8); this.impact(B.x, B.h, B.z, power, B.thrower ? B.thrower.team : 1 - f.team);
    if (!this.rm && power) this.flash(0.22, true);
    this.sfx.hit(power); if (power || B.heavy) this.sfx.bigHit();
    if (this.aiPlays(f)) { const tr = this.dodgeTier(f); this.awStat('hitTaken_' + tr); const R = f.ai.react; if (R && R.B === B && R.aware && R.kind !== 'catch' && R.kind !== 'block') this.awStat('evHit_' + tr); }
    if (B.thrower && this.aiPlays(B.thrower)) { this.awStat('hit_' + B.thrower.arch); if (B.sync) this.awStat('syncHits'); else this.awStat('singleHits'); if (B.fakeShot) this.awStat('fakeShotHits'); }
    if (f === this.user) this.haptic([45, 35, 70]); else if (B.thrower === this.user) this.haptic(power ? [24, 20, 30] : 16);
    const dir = Math.sign(B.vx) || -f.side;
    // the ball goes dead off the hit
    B.vx = -B.vx * 0.18 + (Math.random() - 0.5) * 2; B.vz = -B.vz * 0.18 + (Math.random() - 0.5) * 2; B.vh = 6; this.killBall(B, 'hit'); B.vh = 6;
    B.squash = 1;
    if (f.team === 1) { this.stats.hits++; this.addScore(power ? 200 : 100); } else this.breakCombo();
    if (f.team === 1 && f.role === 'in' && B.thrower && B.thrower.team === 0) this.mev('out', B.thrower, { you: !!B.byUser, victims: [f.name] });
    this.eliminate(f, power ? 'power' : 'hit', dir);
  }
  eliminate(a, why, dir) {
    if (a.role !== 'in') return;
    if (a.held) { const b = a.held; a.held = null; b.holder = null; b.state = 'loose'; b.live = false; b.vh = 4; b.vx = (dir || -a.side) * 1.5; b.vz = (Math.random() - 0.5) * 2; b.cleared = true; }
    a.outOrder = ++this.outSequence; this.queue[a.team].push(a); this.layoutQueue(a.team);
    a.role = 'gone'; a.oob = 0; a.ai.press = -1; a.ai.claimBall = null; this.sfx.whistle();
    dir = dir || -a.side;
    if (why === 'power') { a.knock = {}; a.vx = dir * 7; a.vz = (Math.random() - 0.5) * 2; a.vh = 6; a.h = 0.05; a.set('knock'); }
    else if (why === 'hit') { a.knock = { dx: dir * 0.8, dz: 0 }; a.set('hitstun'); }
    else a.set('ko');
    this.staffSignal(a);
    if (a.team === 1) { this.stats.kos++; this.addScore(why === 'caught' ? 150 : 120); }
    if (why !== 'caught') this.crowdReact(a.team === 1 ? (why === 'power' ? 'bigplus' : 'plus') : (why === 'power' ? 'bigminus' : 'minus'));
    this.checkTide();
    if ((why === 'power' || why === 'hit') && (a.team === 1 || a === this.user)) this.punch(a.x, a.z, why === 'power' ? 1.2 : 0.7);
    const call = { hit: 'OUT!', power: 'OUT!', caught: 'CAUGHT: OUT', headshot: 'THROWER OUT', line: 'LINE: OUT', side: 'OUT OF BOUNDS', oob: 'OUT: 10 S' }[why] || 'OUT!';
    if (this.quietPop !== a) this.pop(a, call, a.team === 0 ? 'red' : 'lime');
    if (a.team === 1 && (why === 'hit') && Math.random() < 0.35) setTimeout(() => { if (this.phase === 'play') { this.pop(a, 'HONOR CALL', 'small lime'); this.sfx.smp('crowd_handup', 0.45); } }, 500);
    this.sfx.ko();
    if (a === this.user) setTimeout(() => { if (this.phase === 'play' && this.user === a && a.role !== 'in') this.switchUser(false); }, 0);
    if (this.sudden && !this.over) { this.lastGameWinner = 1 - a.team; this.points[1 - a.team]++; this.phase = 'gameover'; this.gameEndT = 0; this.popCenter('SUDDEN DEATH!', 'big red'); }
    this.renderLive();
  }
  koStep(a) {
    if (a.state !== 'ko') {
      // physics for knock and hitstun while gone
      if (a.state === 'knock') { a.vh -= GRAV * DT; a.h += a.vh * DT; a.x += a.vx * DT; a.z += a.vz * DT; if (a.h <= 0) { a.h = 0; a.set('down'); this.dust(a, 5); } }
      else if (a.state === 'hitstun') { if (a.knock && a.st < 12) { a.x += a.knock.dx / 12; a.z += a.knock.dz / 12; } if (a.st >= 22) a.set('ko'); }
      else if (a.state === 'down') { if (a.st >= 24) a.set('ko'); }
      else a.set('ko');
      return;
    }
    if (a.st === 1) this.burst(a.x, 1.2, a.z, '#ffffff', 10);
    if (a.st < 36) { a.h = Math.min(2.2, a.h + 0.06); if (a.st % 4 === 0) this.sparkle(a.x + (Math.random() - 0.5) * 0.8, a.h + 1 + Math.random(), a.z); }
    if (a.st === 36) { this.burst(a.x, a.h + 1, a.z, a.team === 0 ? '#ffc83d' : OPPC.sig, 20); }
    if (a.st > 36 && a.st <= 44) a.popScale = Math.max(0, 1 - (a.st - 36) / 8);
    if (a.st === 50) {
      // The FIFO slot was reserved at elimination, before varying KO animations.
      a.role = 'outline'; a.h = 0; a.popScale = 1; a.vx = a.vz = 0;
      this.layoutQueue(a.team);
      a.x = a.qx; a.z = a.qz - 0.8; a.set('walkin'); this.burst(a.x, 1, a.z, '#ffffff', 8);
      this.renderLive();
    }
  }
  layoutQueue(team) {
    this.queue[team].forEach((a, i) => { const s = a.side; a.qx = s * (HX - 0.5 - i * 0.95); a.qz = -(HZ + 1.0); });
  }

  // ------------------------------------------------ rules per tick
  rules() {
    if (this.phase !== 'play') return;
    if (this.rushT < RULES.rushF) { this.rushT++; if (this.rushT >= RULES.rushF || !this.balls.some(b => b.state === 'rest')) this.endRush(); }
    // clocks
    if (!this.ot) {
      const before = this.clock; this.clock -= DT;
      this.bigCountdown(before, this.clock);
      if (this.clock <= 0) { this.clock = 0; return this.timeUp(); }
    } else if (!this.sudden) {
      const before = this.otClock; this.otClock -= DT;
      this.bigCountdown(before, this.otClock);
      if (this.otClock <= 0) { this.otClock = 0; return this.otExpire(); }
    }
    // attack line clearing
    for (const b of this.balls) if (b.state === 'held' && !b.cleared && b.holder.x * b.holder.side >= ATK) { b.cleared = true; if (b.holder === this.user) this.pop(b.holder, 'CLEARED', 'small cyan'); }
    // player violations: center line after the rush, side lines
    for (const a of this.all) if (a.active && a.role === 'in' && a.oob === 0) {
      if (this.rushT >= RULES.rushF && a.x * a.side < -0.05) { this.eliminate(a, 'line'); if (a === this.user) this.popCenter('CENTER LINE: OUT', 'big red', 0.36); }
      else if (Math.abs(a.z) > HZ + 0.2 && Math.abs(a.x) < HX) { this.eliminate(a, 'side'); if (a === this.user) this.popCenter('SIDE LINE: OUT', 'big red', 0.36); }
    }
    // ball control (Gordon 2026-10-26): a team has ball control while 3 or more balls are ON ITS SIDE
    // (held by its players, including out of bounds, or loose/in the air over its half); the 15 s count
    // starts the instant it reaches 3 and resets when it drops to 2 or fewer. Rush balls on the center line count for no one.
    const held = [0, 0];
    for (const b of this.balls) {
      if (b.state === 'held' && b.holder) { held[b.holder.team]++; continue; }
      if (b.state === 'rest' && Math.abs(b.x) < 0.5) continue;
      if (Math.abs(b.x) < 0.05) continue;
      held[b.x < 0 ? 0 : 1]++;
    }
    const maj = held[0] >= 3 ? 0 : (held[1] >= 3 ? 1 : -1);
    if (maj < 0 || maj !== this.ctlTeam) { if (this.ctlTeam >= 0 && maj < 0) this.$.ctl.hidden = true; this.ctlTeam = maj; this.ctlT = 0; this.lastCtlSec = -1; this.ctlCountdown(0); }
    if (maj >= 0) {
      this.ctlT += DT; const left = Math.max(0, Math.ceil(RULES.control - this.ctlT));
      if (left !== this.lastCtlSec) {
        this.lastCtlSec = left; this.$.ctl.hidden = false; this.$.ctl.className = 'fbg-ctl t' + maj; this.$.ctl.innerHTML = `${maj === 0 ? 'FINAL BOSS' : '' + this.opp.short + ''} BALL CONTROL <b>${left}</b>`;
        // 10 to 4 counts quietly on the HUD chip; 3, 2, 1 get the big brand numeral, the announcer and a rising tick
        if (left <= 3 && left > 0) this.ctlCountdown(left, maj);
      }
      if (this.ctlT >= RULES.control) this.controlViolation(maj);
    }
    // phase two: the GLITCH KING powers up when his team is down to 3
    if (!this.p2 && this.opp.p2 !== false && this.liveCount(1) <= 3 && this.boss.role === 'in') { this.p2 = true; this.cheer('*p2'); this.popBrush('PHASE TWO!', 'THE GLITCH KING POWERS UP', 'red'); this.sfx.stinger(); this.sfx.vo('vo_phase2', 3); this.$.boss.classList.add('on'); this.aura(this.boss); }
    if (this.p2) this.$.bossI.style.transform = `scaleX(${this.liveCount(1) / 8})`;
    // game over
    const l0 = this.liveCount(0), l1 = this.liveCount(1);
    if (l0 === 0 || l1 === 0) this.gameOver(l0 === 0 ? 1 : 0);
  }
  showLanes(on) {
    // each team's right-hand side as it faces the other team: FINAL BOSS (left end) is the near half, THE GLITCHES (right end) the far half
    if (!this.lanes) {
      this.lanes = [0, 1].map(t => { const m = new THREE.Mesh(new THREE.PlaneGeometry(HX, HZ - 0.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
        m.rotation.x = -Math.PI / 2; m.position.set(t === 0 ? -HX / 2 : HX / 2, 0.009, t === 0 ? (HZ + 0.3) / 2 : -(HZ + 0.3) / 2); m.renderOrder = 2; m.visible = false; this.scene.add(m); return m; });
    }
    this.lanesOn = on; this.lanes[0].material.color.set(this.kit && this.kit.accent || '#ffc83d'); this.lanes[1].material.color.set(OPPC.sig);
    for (const m of this.lanes) m.visible = on;
  }
  endRush() {
    if (this.lanes) this.showLanes(false);
    this.rushT = RULES.rushF;
    for (const b of this.balls) if (b.state === 'rest') { b.state = 'loose'; b.vx = (b.rushTeam === 0 ? -1 : 1) * 2.6; b.vh = 1.5; }
  }
  controlViolation(t) {
    this.popCenter('BALL CONTROL: VIOLATION', 'big red', 0.36); this.ref('Every ball goes to the other side'); this.sfx.buzz();
    const other = 1 - t; let k = 0;
    // dot 10/26: play stops on a violation, so every pending interaction is settled once BEFORE the balls move: a late-catch window or an airborne
    // deflection awaiting a save is void (no catch, no out, the deflected player stays in); no dead, relocated ball can resolve later
    for (const b of this.balls) this.settleBall(b);
    // Gordon 2026-10-26 + rulebook: on a violation the other team gets ALL the balls, wherever they are
    for (const b of this.balls) {
      if (b.holder) { b.holder.held = null; b.holder = null; }
      b.state = 'loose'; b.live = false; b.cleared = true; b.thrower = null; b.team = -1; b.x = (other === 0 ? -1 : 1) * (4 + (k % 3)); b.z = -3 + k * 1.5; b.h = 1.2; b.vh = 2; b.vx = b.vz = 0; k++;
    }
    this.qaLog('violation', { team: t });
    this.ctlTeam = -1; this.ctlT = 0; this.$.ctl.hidden = true; this.ctlCountdown(0);
  }
  ctlCountdown(n, team) {
    // Gordon 2026-10-26: a vocal and visual 3, 2, 1 when the ball control clock is down to 3 seconds
    const el = this.$.cd; if (!el) return;
    if (!n) { if (!el.hidden) { el.hidden = true; el.classList.remove('go'); this.root.classList.remove('cd-on'); } return; }
    this.root.classList.add('cd-on');
    const mine = team === 0; // the player is always on FINAL BOSS
    el.className = 'fbg-cd t' + team + (mine ? ' mine' : ' theirs'); el.hidden = false;
    this.$.cdN.textContent = String(n);
    this.$.cdT.textContent = mine ? 'THROW IT!' : 'THEY MUST THROW';
    void el.offsetWidth; el.classList.add('go');
    this.sfx.smp('tick_' + n, 0.9); this.sfx.vo(['', 'vo_one', 'vo_two', 'vo_three'][n], 5);
    if (mine) this.haptic(n === 1 ? [30, 40, 30] : 18);
    this.say(n + '. ' + (mine ? 'Throw it.' : 'They must throw.'));
    this.qaLog('cd', { n, team, left: +(RULES.control - this.ctlT).toFixed(3) });
  }
  bigCountdown(before, now) {
    const s = Math.ceil(now);
    if (now <= 10 && s !== Math.ceil(before) && s > 0) { this.popCenter(String(s), 'big gold', 0.5); this.sfx.tick(); }
  }
  gameOver(w) {
    if (this.phase !== 'play') return;
    this.ctlCountdown(0);
    const before = this.points[0] - this.points[1];
    this.points[w]++; this.lastGameWinner = w;
    const after = this.points[0] - this.points[1];
    this.phase = 'gameover'; this.gameEndT = 0;
    this.popBrush('GAME!', w === 0 ? 'POINT FINAL BOSS' : 'POINT ' + this.opp.short, w === 0 ? '' : 'lime');
    if (before < 0 && after >= 0) { this.crowdReact('lead'); this.ref(after > 0 ? 'FINAL BOSS takes the lead' : 'All square'); }
    else if (before > 0 && after <= 0) { this.crowdReact('opplead'); this.ref(after < 0 ? '' + this.opp.name + ' take the lead' : 'All square'); }
    else this.crowdReact(w === 0 ? 'gamewin' : 'gamelose');
    if (!(before < 0 && after >= 0)) this.sfx.vo(w === 0 ? 'vo_point_fb' : 'vo_point_gl', 2);
    this.sfx.buzz();
    this.updateHUD(true);
  }
  timeUp() {
    this.popCenter('TIME! GAME VOID', 'big red'); this.sfx.buzz();
    const [p0, p1] = this.points;
    if (p0 !== p1) return this.endMatch({ win: p0 > p1, time: true, msg: p0 > p1 ? `Time. FINAL BOSS takes the match, ${p0} games to ${p1}.` : `Time. ${this.opp.name} take it, ${p1} games to ${p0}.` });
    // tied: overtime game, then sudden death
    this.ot = true; this.otClock = RULES.ot;
    this.phase = 'gameover'; this.gameEndT = 100; this.lastGameWinner = -1;
    setTimeout(() => { if (this.over) return; this.popCenter('OVERTIME', 'big red'); this.setupGame(); this.startBrief(); }, this.rm ? 300 : 900);
    this.phase = 'ot-wait';
  }
  otExpire() {
    const l0 = this.liveCount(0), l1 = this.liveCount(1);
    if (l0 !== l1) return this.endMatch({ win: l0 > l1, msg: `Overtime ends: ${Math.max(l0, l1)} players left to ${Math.min(l0, l1)}.` });
    this.sudden = true; this.popCenter('SUDDEN DEATH', 'big red'); this.sfx.buzz();
  }
  ref(t) { this.popAt(this.W / 2, this.H * 0.26, t, 'small ref', 1.4); }

  // ------------------------------------------------ visuals per frame
  placeBallMesh(B) {
    const m = B.mesh;
    if (B.state === 'held' && B.holder) {
      const a = B.holder; a.root.updateMatrixWorld(true);
      const v = new THREE.Vector3(); a.arm[1].hand.getWorldPosition(v);
      const fv = a.facingVec(); B.x = v.x + fv[0] * 0.1; B.z = v.z + fv[1] * 0.1; B.h = v.y + 0.04;
    }
    m.position.set(B.x, B.h, B.z);
    if (B.state === 'flight') { const H = B.hist, l = H[H.length - 1]; if (!l || Math.abs(l.x - B.x) + Math.abs(l.z - B.z) + Math.abs(l.h - B.h) > 0.01) { H.push({ x: B.x, h: B.h, z: B.z }); if (H.length > TRAIL_N) H.shift(); } }
    const sp = Math.hypot(B.vx, B.vz);
    B.spin += sp * DT * 2; m.rotation.set(B.spin, 0, B.spin * 0.3);
    let sx = 1, sy = 1;
    if (B.state === 'flight' && B.type === 'comet') { sx = 1.45; sy = 0.62; } else if (B.state === 'flight' && sp > 15) { sx = 1.18; sy = 0.86; }
    if (B.squash > 0.05) { sx *= 1 + B.squash * 0.35; sy *= 1 - B.squash * 0.35; }
    m.scale.set(sx, sy, sx); if (B.state === 'flight' && sp > 0.1) m.rotation.y = -Math.atan2(B.vz, B.vx);
    const r = 0.62 * (1 - Math.min((B.h - 0.22) / 3, 0.6));
    B.shadow.position.set(B.x, 0.014, B.z); B.shadow.scale.set(r, r * 0.6, 1);
    const g = B.glow.material; B.glow.position.copy(m.position);
    if (B.state === 'flight' && B.live) { g.opacity = B.power ? 0.9 : 0.55; g.color.set(B.power ? B.trailC : '#ffffff'); B.glow.scale.setScalar(B.power ? 1.9 + Math.sin(this.frame) * 0.2 : 1.1); }
    else if (B.state === 'rest') { g.opacity = 0.5 + 0.3 * Math.sin(this.frame * 0.15 + B.id); g.color.set(B.rushTeam === 0 ? this.kit.accent : OPPC.sig); B.glow.scale.setScalar(1.3); }
    else { g.opacity = B.state === 'held' ? 0 : 0.18; g.color.set('#ff7a5a'); B.glow.scale.setScalar(0.9); }
    // a live ball reads first: bright core and glow; a dead ball goes dull
    if (B.mat.emissive) B.mat.emissive.set(B.flash > 0 && !this.rm ? '#ffffff' : (B.state === 'flight' && B.live ? '#5a1a10' : '#000000'));
    if (B.mat.color) B.mat.color.set(B.state === 'loose' ? '#b9aeb0' : '#ffffff');
    if (B.state === 'flight' && B.live) { B.shadow.material = this.shadowLive || (this.shadowLive = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, color: '#000000', opacity: 1 })); B.shadow.scale.multiplyScalar(0.8 + 0.35 * Math.min(1, (B.h - 0.22) / 2.5)); }
    else B.shadow.material = this.shadowMat;
    if (B.land && B.pop && B.state === 'flight') { if (!B.landRing) { B.landRing = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.tex.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); B.landRing.rotation.x = -Math.PI / 2; B.landRing.renderOrder = 2; this.scene.add(B.landRing); } const L = B.landRing; L.visible = true; L.position.set(B.land.x, 0.02, B.land.z); const s0 = 0.9 + 0.15 * Math.sin(this.frame * 0.4); L.scale.set(s0, s0 * 0.62, 1); L.material.color.set(B.pop.team === 0 ? '#ffc83d' : OPPC.sig); L.material.opacity = 0.85; }
    else if (B.landRing) B.landRing.visible = false;
    this.abBallFx(B);
  }
  addScore(n) { this.combo++; const m = Math.min(4, 1 + Math.floor((this.combo - 1) / 2) * 0.5); this.score += Math.round(n * m); this.stats.bestCombo = Math.max(this.stats.bestCombo, m); if (this.combo >= 3 && this.combo % 2 === 1) this.popCenter(`COMBO x${m}`, 'small cyan', 0.3); }
  breakCombo() { this.combo = 0; }
  renderLive() {
    const dots = (t) => this.teams[t].map(a => `<i class="${a.role === 'in' || a.role === 'returning' ? '' : 'off'}${a === this.user ? ' me' : ''}" title="${esc(a.name)}"></i>`).join('');
    this.$.l0.innerHTML = dots(0); this.$.l1.innerHTML = dots(1);
    this.$.l0.classList.toggle('danger', this.liveCount(0) <= 2 && this.phase === 'play'); this.$.l1.classList.toggle('danger', this.liveCount(1) <= 2 && this.phase === 'play');
    // main 10/27: a bare "NEXT #0" read like a placeholder; the next player in the outline is named, the rest keep their numbers
    const num = (a) => a.num && a.num !== '?' ? '#' + a.num : '';
    const q = (t) => this.queue[t].map((a, i) => `<span>${i === 0 ? 'NEXT ' + esc(a.name) + (num(a) ? ' ' + num(a) : '') : (num(a) || esc(a.name))}</span>`).join('');
    this.$.q0.innerHTML = this.queue[0].length ? 'Outline: ' + q(0) : '';
    { const nx = this.root.querySelector('.fbg-next'), n0 = this.queue[0][0]; if (nx) { nx.hidden = !n0 || this.phase !== 'play'; if (n0) nx.innerHTML = `<b>NEXT IN</b> ${esc(n0.name)}${n0.num && n0.num !== '?' ? ' #' + n0.num : ''}${this.queue[0].length > 1 ? ` <i>+${this.queue[0].length - 1}</i>` : ''}`; } } this.$.q1.innerHTML = this.queue[1].length ? 'Outline: ' + q(1) : '';
  }
  tutorialTick() {
    // first rally teaches one exchange: catch the incoming throw, then throw back, then the dash power window
    const u = this.user; if (this.phase !== 'play' || !u || u.role !== 'in') return;
    const touch = this.root.classList.contains('has-touch'), seen = (k) => { try { return sessionStorage.getItem(k) === '1'; } catch (e) { return false; } }, mark = (k) => { try { sessionStorage.setItem(k, '1'); } catch (e) { } };
    if (!this.tutCatch && !seen('fbg-tut-catch') && !u.held && this._kInc) { this.tutCatch = true; mark('fbg-tut-catch'); this.popBrush('CATCH IT', touch ? 'tap CATCH right before it hits you' : 'press K or right click right before it hits you', '', 0.62, 1.8); }
    if (this.tutCatch && !this.tutThrow && !seen('fbg-tut-throw') && u.held && u.held.cleared && this.stats.catches > 0) { this.tutThrow = true; mark('fbg-tut-throw'); this.popBrush('NOW THROW IT BACK', touch ? 'tap THROW: they are out of position' : 'press J or left click: they are out of position', '', 0.62, 1.8); return; }
    if (this.tutDone || !u.held || !u.held.cleared) return;
    if (seen('fbg-tut-dash')) { this.tutDone = true; return; }
    this.tutDone = true; mark('fbg-tut-dash');
    this.popBrush('DASH, THEN THROW', touch ? 'hold DASH, throw on steps 4 to 7' : 'hold U, throw on steps 4 to 7', '', 0.62, 2.4);
  }
  updateHUD(force) {
    this.tutorialTick();
    const c = this.ot ? this.otClock : this.clock; const txt = this.sudden ? 'SD' : fmtClock(Math.max(0, Math.ceil(c)));
    if (force || this.$.clock.textContent !== txt) this.$.clock.textContent = txt;
    this.$.clock.classList.toggle('fever', this.ot || c <= 10);
    const sub = this.phase === 'handshake' ? 'SPORTSMANSHIP' : this.phase === 'result' ? 'FINAL' : this.sudden ? 'SUDDEN DEATH' : (this.ot ? 'OVERTIME' : (this.phase === 'title' ? '3 MINUTES' : 'GAME ' + this.gameNo));
    if (this.$.sub.textContent !== sub) this.$.sub.textContent = sub;
    if (this.$.g0.textContent !== String(this.points[0])) this.$.g0.textContent = this.points[0];
    if (this.$.g1.textContent !== String(this.points[1])) this.$.g1.textContent = this.points[1];
    const sc = this.score.toLocaleString(); if (this.$.score.textContent !== sc) this.$.score.textContent = sc;
    {
      // the controls light up with the moment: holding a ball lights Throw (and Pass), an incoming throw lights Catch; keys on PC, thumb buttons on Mobile
      const u = this.user, live = this.phase === 'play' && !this.paused && u && u.role === 'in';
      if (this.frame % 6 === 0) this._kInc = !!(live && !u.held && this.incomingFor(u));
      const st = (live ? 'on' : '') + (live && u.held ? ' hold' : '') + (live && this._kInc ? ' inc' : '');
      if (this._kSt !== st) { this._kSt = st; if (this.$.keys) this.$.keys.className = 'fbg-keys ' + st; this.root.classList.toggle('k-hold', live && !!u.held); this.root.classList.toggle('k-inc', !!(live && this._kInc)); }
    }
  }
  render() {
    if (!this.renderer) return;
    const v = this.view;
    let tx = 0;
    if (!v.wide && this.phase !== 'handshake') {
      const u = this.user; let focus = u ? u.x * 0.55 : 0;
      const fl = this.balls.filter(b => b.state === 'flight' && b.live); if (fl.length) focus = focus * 0.6 + fl[0].x * 0.4;
      tx = Math.max(-4.6, Math.min(4.6, focus));
    }
    // render-time step: shake and punch decay in seconds, so they last the same on 60, 120 and 144 Hz screens
    const nowMs = performance.now(), rf = Math.min(3, Math.max(0, (nowMs - (this._rt || nowMs)) / (1000 / 60))); this._rt = nowMs;
    v.cx += (tx - v.cx) * (1 - Math.pow(0.92, rf));
    let sx = 0, sy = 0, roll = 0;
    if (this.shakeF > 0) {
      // smooth, decaying trauma (k squared) from layered sines instead of per-frame white noise
      this.shakeF = Math.max(0, this.shakeF - rf); const k = this.shakeF / this.shakeMax; const amp = this.shakeAmp * k * k / this.pxPerUnit; const q = nowMs / 1000 * 88;
      sx = amp * (Math.sin(q + 0.3) * 0.65 + Math.sin(q * 2.37 + 1.7) * 0.35); sy = amp * (Math.sin(q * 1.13 + 2.1) * 0.65 + Math.sin(q * 2.71 + 0.4) * 0.35);
      roll = amp * 0.02 * Math.sin(q * 0.91 + 4.0);
      if (this.shakeF <= 0) this.shakeAmp = 0;
    }
    // camera punch-in on catches and knockouts
    let d = v.d, tX = v.cx, tZ = v.tz;
    if (v.punch > 0) { v.punch = Math.max(0, v.punch - rf); const t = v.punch / 26; const e = Math.sin(Math.min(1, (1 - t) * 3) * Math.PI / 2) * Math.min(1, t * 2.2); d *= 1 - 0.3 * e * Math.min(1.3, v.pk || 1); tX += (v.px - tX) * 0.35 * e; tZ += (v.pz - tZ) * 0.35 * e; }
    const T = new THREE.Vector3(tX + sx, sy, tZ);
    this.camera.position.set(T.x, T.y + SINP * d, T.z + COSP * d); this.camera.lookAt(T); if (roll) this.camera.rotateZ(roll);
    if (this.backdrop) { this.backdrop.position.x = v.cx * 0.3; if (this.standsG) this.standsG.position.x = v.cx * 0.3; }
    this.crowdT.value = this.frame / 60; this.crowdTick();
    if (this.mode === 'vc') { const t = this.frame / 60; this.caustics[0].material.map.offset.set(t * 0.02, t * 0.013); this.caustics[1].material.map.offset.set(-t * 0.017, t * 0.021); }
    if (this.glowMat) { const base = this.mode === 'vc' ? 0.75 : 0.45; this.glowMat.opacity = (this.ctlTeam >= 0 || this.ot) ? base + 0.3 * (0.5 + 0.5 * Math.sin(this.frame * 0.15)) : base; }
    for (const a of this.all) {
      if (!a.active) continue;
      if (a.shake > 0 && !this.rm) { const k = a.shake / Math.max(1, a.shakeMax); const amp = 3 / this.pxPerUnit * k; const o = (a.shake % 2 ? 1 : -1) * amp; if (a.h > 0.2) { a.body.position.y = (a.bodyY || 0) + o; a.body.position.x = 0; } else { a.body.position.x = o; a.body.position.y = a.bodyY || 0; } }
      else { a.body.position.x = 0; a.body.position.y = a.bodyY || 0; }
      if (this.hitstop <= 0 && a.shake > 0) a.shake--;
      const you = a === this.user && a.role === 'in' && this.phase !== 'title';
      const holder = !!a.held && a.role === 'in';
      a.foot.visible = a.role === 'in' && a.root.visible && this.phase !== 'title' && !a.ring.visible;
      if (a.foot.visible) { const s = 1.05 * a.scale; a.foot.scale.set(s, s * 0.62, 1); a.foot.position.set(a.x, 0.016, a.z); }
      a.ring.visible = holder && !you && a.root.visible;   // the player you control gets the rainbow star instead (updateUserStar)
      if (a.ring.visible) {
        const pulse = you ? 1 + 0.08 * Math.sin(this.frame * 0.2) : 1;
        const s = (you ? 1.5 : 1.15) * a.scale * pulse; a.ring.scale.set(s, s * 0.62, 1); a.ring.position.set(a.x, 0.02, a.z);
        a.ring.material.color.set(you ? '#ffc83d' : (a.team === 0 ? '#ffffff' : OPPC.sig)); a.ring.material.opacity = you ? 0.95 : 0.7;
      }
    }
    if (this.lineStrips) {
      let dc = 9, ds = [9, 9];
      for (const a of this.all) if (a.active && a.role === 'in') { dc = Math.min(dc, Math.abs(a.x)); if (a.z < 0) ds[0] = Math.min(ds[0], HZ + a.z); else ds[1] = Math.min(ds[1], HZ - a.z); }
      const op = (d) => this.phase === 'play' && this.rushT >= RULES.rushF ? Math.max(0, 1 - d / 1.3) * 0.55 : 0;
      const lf = (this.lineFlash || 0) > 0 ? (this.lineFlash--, 0.25) : 0;
      this.lineStrips[0].material.opacity = Math.min(0.85, op(dc) + lf); this.lineStrips[1].material.opacity = Math.min(0.85, op(ds[0]) + lf); this.lineStrips[2].material.opacity = Math.min(0.85, op(ds[1]) + lf);
    }
    this.updateUserStar();
    this.updateStands();
    this.updateTrails();
    this.renderFrame();
    this.updateTags();
    this.updateHUD();
    this.updateMeter();
  }
  updateTags() {
    const show = this.phase !== 'title';
    for (const a of this.all) {
      const you = show && a === this.user && a.role === 'in';
      let note = '';
      if (show && a.role === 'in' && a.oob > 0) note = 'BACK IN ' + Math.max(0, Math.ceil(RULES.oob - a.oob / 60));
      else if (show && a.state === 'balance') note = 'HOLD THE LINE';
      else if (show && a.role === 'returning') note = 'IN ' + Math.max(0, Math.ceil(RULES.back - a.backF / 60));
      else if (you && a.held && !a.held.cleared) note = 'CLEAR THE LINE';
      const vis = (you || note) && a.root.visible && (a.popScale ?? 1) > 0.5;
      if (!vis) { if (a.tag.style.display !== 'none') a.tag.style.display = 'none'; continue; }
      a.tag.style.display = '';
      const v = this.toScreen(a.x, a.h + 2.2 * a.scale + (a.boss ? 0.3 : 0), a.z);
      a.tag.style.transform = `translate(${v.x}px,${v.y}px) translate(-50%,-100%)`;
      if (a.tagYou.hidden === you) a.tagYou.hidden = !you;
      if (a.tagNote.textContent !== note) a.tagNote.textContent = note;
      a.tagNote.hidden = !note;
    }
  }
  updateMeter() {
    // the meter only shows when it matters: holding a ball (idle: DASH), dashing (steps 1 to 9, power window 4 to 7), and it flashes on a power throw
    const u = this.user; if (!u) return;
    const running = u.state === 'run' || (u.state === 'air' && u.airSteps > 0);
    const steps = u.state === 'run' ? u.steps : (u.state === 'air' ? u.airSteps : 0);
    const fire = (this.meterFire || 0) > this.frame;
    const show = this.phase === 'play' && u.role === 'in' && (!!u.held || running || fire);
    const lo = TUNE.powMin, hi = TUNE.powMax, win = running && steps >= lo && steps <= hi;
    const key = [show, steps, running, fire].join('|');
    if (this._mk === key) return; this._mk = key;
    const cells = this.$.steps.children;
    for (let i = 0; i < cells.length; i++) { const n = i + 1; cells[i].className = (n >= lo && n <= hi ? 'win ' : '') + (n <= steps ? 'lit' : ''); }
    const M = this.$.meter; M.classList.toggle('show', show); M.classList.toggle('on', running); M.classList.toggle('power', win); M.classList.toggle('fire', fire);
    this.$.meterB.textContent = fire ? 'POWER!' : (running ? (win ? 'THROW!' : 'STEPS') : 'DASH');
    const touch = this.root.classList.contains('has-touch');
    this.$.mhint.textContent = running || fire ? '' : (touch ? 'hold DASH, throw on 4 to 7' : 'hold U or double-tap, throw on 4 to 7');
  }
  snapshot() {
    const pl = (a) => ({ name: a.name, num: a.num, team: a.team, role: a.role, state: a.state, x: +a.x.toFixed(2), z: +a.z.toFixed(2), h: +a.h.toFixed(2), hasBall: !!a.held, oob: a.oob > 0, boss: a.boss });
    return {
      phase: this.phase, paused: this.paused, timeout: this.timeoutT > 0, frame: this.frame, clock: +(this.clock || 0).toFixed(2), otClock: +(this.otClock || 0).toFixed(2), ot: this.ot, sudden: this.sudden, phaseTwo: this.p2,
      sportsmanship: this.handshake ? { stage: this.handshake.stage, frame: this.handshake.frame, greetings: this.handshake.pairs.size } : null,
      points: this.points.slice(), gameNo: this.gameNo, live: [this.liveCount(0), this.liveCount(1)], rush: this.rushT < RULES.rushF && this.phase === 'play',
      control: { team: this.ctlTeam, t: +(this.ctlT || 0).toFixed(2) }, queue: [this.queue[0].map(a => a.num), this.queue[1].map(a => a.num)],
      score: this.score, combo: this.combo, stats: Object.assign({}, this.stats), mode: this.mode, look: this.look && this.look.name, lookId: this.look && this.look.id,
      user: this.user ? Object.assign(pl(this.user), { steps: this.user.steps }) : null,
      balls: this.balls.map(b => ({ id: b.id, state: b.state, live: b.live, cleared: b.cleared, team: b.team, rushTeam: b.rushTeam, type: b.type, power: b.power, x: +b.x.toFixed(2), z: +b.z.toFixed(2), h: +b.h.toFixed(2), vx: +b.vx.toFixed(2), vz: +b.vz.toFixed(2), holder: b.holder ? b.holder.name : null, target: b.target ? b.target.name : null })),
      bossHp: this.liveCount(1), players: this.all.filter(a => a.active).map(pl), fps: Math.round(this.fpsS || 0), result: this.result || null, reducedMotion: this.rm,
    };
  }
  stage(name) {
    // QA helpers: set up a rules moment on demand so automated playtests can exercise it
    const u = this.user; if (!u || this.phase !== 'play') return false;
    if (this.rushT < RULES.rushF) this.endRush();
    const cpu = this.inPlayers(1).filter(a => !a.held && !a.locked())[0]; if (!cpu && name !== 'countdown') return false;
    const takeBall = (holder) => { const b = this.balls.find(x => x.state !== 'held' && x.state !== 'flight') || this.balls.find(x => x.state !== 'flight'); if (!b) return null; if (b.holder) { b.holder.held = null; b.holder = null; } this.give(holder, b); b.cleared = true; return b; };
    if (name === 'headshot' || name === 'catch') {
      if (u.held) { const b = u.held; u.held = null; b.holder = null; b.state = 'loose'; b.vh = 2; }
      if (name === 'catch' && !this.queue[0].length) { const m = this.inPlayers(0).find(a => a !== u && !a.held); if (m) { m.role = 'outline'; m.set('idle'); this.queue[0].push(m); this.layoutQueue(0); m.x = m.qx; m.z = m.qz; this.renderLive(); } }
      u.x = -4.2; u.z = 0; u.vx = u.vz = 0; u.set('idle'); u.yaw = 100 * DEG;
      cpu.x = 4.6; cpu.z = 0; cpu.vx = cpu.vz = 0; cpu.set('idle'); cpu.ai.plan = { k: 'throw' }; cpu.ai.delay = 0; cpu.ai.t = 99;
      if (!takeBall(cpu)) return false;
      cpu.forceHead = name === 'headshot'; cpu.throwTarget = u; cpu.throwType = 'normal'; cpu.wantPower = false; cpu.set('windup');
      return true;
    }
    if (name === 'countdown') {
      const mates = this.inPlayers(0).filter(a => a !== u);
      for (let i = 0; i < 3; i++) { const m = i === 0 ? u : mates[i]; if (!m) break; if (!m.held) takeBall(m); m.ai.plan = { k: 'throw' }; m.ai.t = 0; m.ai.delay = 420; }
      return true;
    }
    return false;
  }
  applyTier(fromResize) {
    const R = this.renderer, t = this.tier;
    const dev = window.devicePixelRatio || 1;
    // Bound pixel cost at large PC resolutions; quality adds detail, not unbounded supersampling.
    let dpr;
    if (this.native) {
      // PC native: draw at the display's own pixel density (1080p, 1440p, Retina, 4K), never supersampled past it.
      // Auto scales the render resolution (this.rs, 1 down to 0.6) before it gives up a tier; HUD text is DOM, so it stays sharp either way.
      const budget = t === 'ultra' || t === 'high' ? 16e6 : t === 'med' ? 6e6 : 2.5e6;
      dpr = Math.min(dev, Math.sqrt(budget / Math.max(1, (this.W || 1280) * (this.H || 720)))) * (this.qMode === 'auto' ? this.rs : 1);
    } else {
      const budget = t === 'ultra' ? 4e6 : t === 'high' ? 3e6 : t === 'med' ? 2e6 : 1.2e6;
      const cap = t === 'ultra' ? 2 : t === 'high' ? 1.5 : t === 'med' ? 1.25 : 1;
      dpr = Math.min(dev, cap, Math.sqrt(budget / Math.max(1, (this.W || 1280) * (this.H || 720))));
    }
    R.setPixelRatio(dpr); if (this.W) R.setSize(this.W, this.H, false);
    R.shadowMap.enabled = t !== 'low';
    if (this.key) { const ms = t === 'ultra' || t === 'high' ? 2048 : 1024; if (this.key.shadow.mapSize.x !== ms) { this.key.shadow.mapSize.set(ms, ms); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; } } this.key.castShadow = t !== 'low'; }
    this.useRefl = t !== 'low'; this.useBloom = (t === 'high' || t === 'ultra') && !this.rm && this.hdrSupported !== false; this.ultra = t === 'ultra';
    if (this.scene) this.applyEnv();
    if (this.glossMesh) this.glossMesh.visible = this.useRefl;
    if (this.W) this.sizePost();
    if (this.$.qual) this.$.qual.textContent = 'Quality: ' + (this.qMode === 'auto' ? 'Auto (' + t + ')' : t);
    this.syncMenu();
    if (!fromResize && this.scene) this.scene.traverse(o => { if (o.material && o.material.needsUpdate !== undefined && o.receiveShadow) o.material.needsUpdate = true; });
  }
  applyEnv() {
    // ultra: image-based lighting from a generated arena (warm key, violet and orange rims, light rig panels)
    if (this.ultra && !this.envTex) {
      const pm = new THREE.PMREMGenerator(this.renderer), es = new THREE.Scene();
      es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float y = vP.y; vec3 c = mix(vec3(0.10,0.05,0.06), vec3(0.32,0.20,0.16), smoothstep(-0.3, 0.6, y)); c += vec3(0.9,0.35,0.12) * pow(max(0.0, -vP.x * 0.7 - vP.z * 0.7), 6.0) * 0.6; c += vec3(0.5,0.3,1.0) * pow(max(0.0, vP.x * 0.7 - vP.z * 0.7), 6.0) * 0.6; gl_FragColor = vec4(c, 1.0); }' })));
      const pg = new THREE.PlaneGeometry(1, 1);
      for (const [x, y, z, w, h, col, s] of [[-14, 22, 6, 10, 3, '#fff1dc', 9], [14, 22, 6, 10, 3, '#fff1dc', 9], [0, 24, -10, 18, 2.5, '#ffe2b8', 7], [0, 14, 30, 22, 3, '#ffd7b0', 3], [-30, 8, -20, 8, 8, '#ff7a3a', 2.4], [30, 8, -20, 8, 8, '#9a6bff', 2.4]]) {
        const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(s), side: THREE.DoubleSide })); m.position.set(x, y, z); m.scale.set(w, h, 1); m.lookAt(0, 0, 0); es.add(m);
      }
      this.envTex = pm.fromScene(es, 0.02).texture; pm.dispose();
    }
    const env = this.ultra ? this.envTex : null;
    this.scene.environment = env;
    // materials made after the switch (new players, rebuilt looks) are picked up by the periodic sweep in renderFrame
    this.scene.traverse(o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (m.isMeshStandardMaterial && m.userData.env !== env) { m.userData.env = env; m.envMapIntensity = m === this.floorMat ? 0.25 : 0.42; m.needsUpdate = true; } });
    if (this.floorMat && this.floorMat.map) { this.floorMat.map.anisotropy = this.ultra ? this.renderer.capabilities.getMaxAnisotropy() : 8; this.floorMat.map.needsUpdate = true; }
  }
  setQuality(q) {
    this.qMode = q; if (q !== 'auto') this.tier = q; else { this.tier = matchMedia('(pointer: coarse)').matches ? 'med' : 'high'; this.qDrops = 0; this.qFrames = 0; this.rs = 1; this.dts.length = 0; }
    this.applyTier(false);
  }
  autoQuality(dt) {
    if (this.qMode !== 'auto' || this.phase === 'title' || this.paused) return;
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05; this.qFrames++;
    if (this.native) {
      // judge 90-frame windows by their median, so one stall (a tab switch, a screenshot, a shader compile) cannot cost a tier
      const D = this.dts; D.push(dt * 1000); if (D.length < 90) return;
      const med = D.slice().sort((a, b) => a - b)[45]; D.length = 0;
      if (med > 18.5) {
        if (this.rs > 0.61) { this.rs = Math.max(0.6, +(this.rs - 0.1).toFixed(2)); this.applyTier(true); }
        else if (this.tier !== 'low' && this.qDrops < 3) { this.tier = this.tier === 'ultra' ? 'high' : this.tier === 'high' ? 'med' : 'low'; this.qDrops++; this.rs = 0.8; this.applyTier(false); }
      } else if (med < 12.5 && this.rs < 1) { this.rs = Math.min(1, +(this.rs + 0.1).toFixed(2)); this.applyTier(true); }
      return;
    }
    if (this.qFrames > 150 && this.frameMs > 21 && this.tier !== 'low' && this.qDrops < 3) {
      this.tier = this.tier === 'ultra' ? 'high' : this.tier === 'high' ? 'med' : 'low'; this.qDrops++; this.qFrames = 0; this.frameMs = 16; this.applyTier(false);
    }
  }
  placeBackdrop() {
    if (!this.backdrop) return;
    const v = this.view, BW = 30, BH = BW * 768 / 4096;
    const B = new THREE.Vector3(0, -0.05, -8.0), u = new THREE.Vector3(0, COSP, -SINP);
    this.bd = { BW, BH, B, u };
    this.backdrop.scale.set(BW, BH, 1); this.backdrop.rotation.x = -PITCH;
    this.backdrop.position.copy(B).addScaledVector(u, BH / 2);
  }
  standPoint(fx, fy, out, lift = 0.06) {
    // fx: -0.5..0.5 across the plate; fy: 0 top .. 1 bottom
    const b = this.bd; out.copy(b.B).addScaledVector(b.u, (1 - fy) * b.BH); out.x = fx * b.BW; out.y += SINP * lift; out.z += COSP * lift; return out;
  }
  buildGloss() {
    this.reflRT = new THREE.WebGLRenderTarget(512, 256, { type: THREE.UnsignedByteType });
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflMatrix = new THREE.Matrix4();
    this.glossMat = new THREE.ShaderMaterial({
      uniforms: { tRefl: { value: this.reflRT.texture }, texMatrix: { value: this.reflMatrix }, strength: { value: 0.42 }, texel: { value: new THREE.Vector2(1 / 512, 1 / 256) }, tint: { value: new THREE.Color('#ffe8d0') } },
      vertexShader: `uniform mat4 texMatrix; varying vec4 vR; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vR = texMatrix * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D tRefl; uniform float strength; uniform vec2 texel; uniform vec3 tint; varying vec4 vR; varying vec3 vW;
        void main(){ vec2 uv = vR.xy / vR.w; vec3 c = vec3(0.0);
          c += texture2D(tRefl, uv).rgb * 0.36;
          c += texture2D(tRefl, uv + vec2(texel.x*1.5, 0.0)).rgb * 0.16; c += texture2D(tRefl, uv - vec2(texel.x*1.5, 0.0)).rgb * 0.16;
          c += texture2D(tRefl, uv + vec2(0.0, texel.y*2.5)).rgb * 0.16; c += texture2D(tRefl, uv - vec2(0.0, texel.y*2.5)).rgb * 0.16;
          float edge = smoothstep(7.4, 5.5, abs(vW.z + 0.0)) * smoothstep(13.0, 11.0, abs(vW.x));
          gl_FragColor = vec4(c * tint * strength * edge, 1.0);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glossMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), this.glossMat); this.glossMesh.rotation.x = -Math.PI / 2; this.glossMesh.position.y = 0.012; this.glossMesh.renderOrder = 2; this.scene.add(this.glossMesh);
  }
  renderReflection() {
    const cam = this.camera, rc = this.reflCam, R = this.renderer;
    cam.updateMatrixWorld();
    const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    rc.position.set(cp.x, -cp.y, cp.z);
    rc.up.set(0, 1, 0).applyMatrix4(rot); rc.up.y = -rc.up.y;
    rc.lookAt(look.x, -look.y, look.z);
    rc.near = cam.near; rc.far = cam.far; rc.fov = cam.fov; rc.aspect = cam.aspect; rc.updateProjectionMatrix(); rc.updateMatrixWorld();
    // oblique near plane clipped at the floor (y = 0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.001); plane.applyMatrix4(rc.matrixWorldInverse);
    const cp4 = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cp4.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(cp4.y) + pm.elements[9]) / pm.elements[5]; q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp4.multiplyScalar(2.0 / cp4.dot(q));
    pm.elements[2] = cp4.x; pm.elements[6] = cp4.y; pm.elements[10] = cp4.z + 1.0; pm.elements[14] = cp4.w;
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    const hide = [this.glossMesh, this.floor, this.court, this.glowPlane, ...this.pools, ...this.streaks, ...this.caustics, ...this.decals.map(d => d.m), ...this.balls.map(b => b.trail)];
    const vis = hide.map(o => o.visible); hide.forEach(o => o.visible = false);
    const shadows = []; for (const a of this.all) { shadows.push(a.shadow.visible); a.shadow.visible = false; a.ring && (a.ring.visible = false); a.foot && (a.foot.visible = false); }
    const bs = this.balls ? this.balls.map(b => b.shadow.visible) : []; if (this.balls) this.balls.forEach(b => b.shadow.visible = false);
    const sm = R.shadowMap.enabled; R.shadowMap.enabled = false;
    R.setRenderTarget(this.reflRT); R.clear(); R.render(this.scene, rc); R.setRenderTarget(null);
    R.shadowMap.enabled = sm;
    hide.forEach((o, i) => o.visible = vis[i]); this.all.forEach((a, i) => a.shadow.visible = shadows[i]);
    if (this.balls) this.balls.forEach((b, i) => b.shadow.visible = bs[i]);
  }
  initPost() {
    const isGL2 = this.renderer.capabilities.isWebGL2;
    this.hdrSupported = isGL2 && this.renderer.extensions.has('EXT_color_buffer_float');
    const targetType = this.hdrSupported ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.post = {
      main: new THREE.WebGLRenderTarget(4, 4, { type: targetType, samples: isGL2 ? Math.min(4, this.renderer.capabilities.maxSamples || 4) : 0 }),
      a: new THREE.WebGLRenderTarget(4, 4, { type: targetType }), b: new THREE.WebGLRenderTarget(4, 4, { type: targetType }),
      cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene: new THREE.Scene(),
    };
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.post.bright = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, th: { value: 0.9 } }, vertexShader: vs, fragmentShader: 'uniform sampler2D t; uniform float th; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(th, th + 0.25, l), 1.0); }', depthTest: false });
    this.post.blur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: vs, fragmentShader: 'uniform sampler2D t; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += texture2D(t, vUv + dir * 1.385).rgb * 0.316; c += texture2D(t, vUv - dir * 1.385).rgb * 0.316; c += texture2D(t, vUv + dir * 3.23).rgb * 0.07; c += texture2D(t, vUv - dir * 3.23).rgb * 0.07; gl_FragColor = vec4(c, 1.0); }', depthTest: false });
    this.post.comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, bl: { value: null }, k: { value: 0.75 }, grade: { value: 0 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } }, vertexShader: vs, fragmentShader: `uniform sampler2D t; uniform sampler2D bl; uniform float k; uniform float grade; uniform float time; uniform vec2 res; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c;
        if (grade > 0.5) {
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec2 off = vec2(0.0); // No chromatic fringing on small athletes or boundary lines.
          c = vec3(texture2D(t, vUv + off).r, texture2D(t, vUv).g, texture2D(t, vUv - off).b) + texture2D(bl, vUv).rgb * k;
          c = mix(c, aces(c * 1.08), 0.45);
          c *= 1.0 - smoothstep(0.18, 0.85, r2 * 1.6) * 0.12;
          c += (hash(vUv * res + fract(time) * 37.0) - 0.5) * 0.004;
        } else { c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k; }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`, depthTest: false });
    this.post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post.comp); this.post.scene.add(this.post.quad);
  }
  sizePost() {
    const R = this.renderer, pr = R.getPixelRatio(), W = Math.max(4, Math.floor(this.W * pr)), H = Math.max(4, Math.floor(this.H * pr));
    const sh = 2;
    if (this.post) { this.post.main.setSize(W, H); this.post.a.setSize(Math.max(4, W >> sh), Math.max(4, H >> sh)); this.post.b.setSize(Math.max(4, W >> sh), Math.max(4, H >> sh)); }
    const rs = this.tier === 'ultra' ? 0.5 : 0.33;
    if (this.reflRT) { const rw = Math.max(4, Math.floor(this.W * pr * rs)), rh = Math.max(4, Math.floor(this.H * pr * rs)); this.reflRT.setSize(rw, rh); this.glossMat.uniforms.texel.value.set(1 / rw, 1 / rh); }
  }
  pass(mat, target) { const P = this.post; P.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(P.scene, P.cam); }
  renderFrame() {
    const R = this.renderer;
    R.shadowMap.needsUpdate = R.shadowMap.enabled;
    if (this.ultra && ((this.envSweep = (this.envSweep || 0) + 1) % 60 === 1)) this.applyEnv();
    if (this.useRefl && this.glossMesh) this.renderReflection();
    if (this.useBloom) {
      const P = this.post;
      R.setRenderTarget(P.main); R.clear(); R.render(this.scene, this.camera);
      P.bright.uniforms.t.value = P.main.texture; this.pass(P.bright, P.a);
      const tw = 1 / P.a.width, th = 1 / P.a.height;
      for (let i = 0, n = this.ultra ? 3 : 2; i < n; i++) {
        P.blur.uniforms.t.value = P.a.texture; P.blur.uniforms.dir.value.set(tw * (1 + i), 0); this.pass(P.blur, P.b);
        P.blur.uniforms.t.value = P.b.texture; P.blur.uniforms.dir.value.set(0, th * (1 + i)); this.pass(P.blur, P.a);
      }
      P.comp.uniforms.t.value = P.main.texture; P.comp.uniforms.bl.value = P.a.texture; P.comp.uniforms.k.value = (this.mode === 'vc' ? 0.25 : 0.10) * (this.ultra ? 0.8 : 1); P.comp.uniforms.grade.value = (this.ultra || this.native) ? 1 : 0; P.comp.uniforms.time.value = (performance.now() % 100000) / 1000; P.comp.uniforms.res.value.set(P.main.width, P.main.height);
      this.pass(P.comp, null);
    } else { R.setRenderTarget(null); R.render(this.scene, this.camera); }
  }
  paintRibbon() {
    const kit = this.kit, vc = this.mode === 'vc';
    this.ribbonTex.userData.redraw((c, w, h) => {
      const L = w * 0.42, Rr = w * 0.58;
      const g1 = c.createLinearGradient(0, 0, L, 0); g1.addColorStop(0, shade(vc ? '#ff3fa1' : kit.trim, -0.35)); g1.addColorStop(1, vc ? '#ff3fa1' : kit.trim);
      c.fillStyle = g1; c.fillRect(0, 0, L, h);
      c.fillStyle = '#0d0a12'; c.fillRect(L, 0, Rr - L, h);
      const g2 = c.createLinearGradient(Rr, 0, w, 0); g2.addColorStop(0, shade(OPPC.sig, -0.5)); g2.addColorStop(1, shade(OPPC.sig, -0.78)); c.fillStyle = vc ? '#0e3a40' : g2; c.fillRect(Rr, 0, w - Rr, h);
      // diagonal slashes
      c.globalAlpha = 0.25; c.fillStyle = '#000'; for (let x = 0; x < w; x += 60) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, 0); c.lineTo(x + 38, 0); c.lineTo(x + 14, h); c.fill(); } c.globalAlpha = 1;
      c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = font(54);
      const txt = (t, x, col, st) => { c.save(); c.translate(x, h / 2 + 3); c.transform(1, 0, -0.18, 1, 0, 0); c.lineWidth = 5; c.strokeStyle = st; c.strokeText(t, 0, 0); c.fillStyle = col; c.fillText(t, 0, 0); c.restore(); };
      txt('FINAL BOSS', L * 0.5, '#fff7e8', '#2a0a0a'); crown(c, L * 0.18, h / 2 + 2, 16, '#ffc83d', '#3a1a00'); crown(c, L * 0.82, h / 2 + 2, 16, '#ffc83d', '#3a1a00');
      c.font = font(40); txt('B O S S   R U S H', w / 2, vc ? '#7ff3ff' : '#d8d0e8', '#000');
      c.font = font(54); txt('' + this.opp.name + '', Rr + (w - Rr) * 0.5, vc ? '#7ff3ff' : shade(OPPC.sig, 0.35), '#0a1a02');
      for (const x of [Rr + (w - Rr) * 0.15, Rr + (w - Rr) * 0.85]) { if (OPPC.id === 'glitches') glitchGlyph(c, x, h / 2, 14, vc ? '#7ff3ff' : OPPC.sig); else if (this.tex.t1 && this.tex.t1.image) { c.save(); c.globalAlpha = 0.9; try { c.drawImage(this.tex.t1.image, x - 22, h / 2 - 22, 44, 44); } catch (e) { } c.restore(); } }
    });
  }
  punch(x, z, strength = 1) { if (this.rm) return; const v = this.view; v.punch = Math.max(v.punch, 26); v.px = x; v.pz = z; v.pk = strength; }
  catchFlash(a) {
    const y = a.h + 1.3 * a.scale;
    if (!this.rm) this.decal(a.x, a.z, 0.5, 3.6, 18, a.team === 1 ? OPPC.sig : '#ffc83d', 0.85);
    this.spawnSprite({ tex: this.tex.speed, x: a.x, y, z: a.z, s: 1.2, s1: 4.2, life: 16, color: '#ffd23a', alpha: 0.95, rot: Math.random() * 6, fade: 1.2 });
    this.spawnSprite({ tex: this.tex.star, x: a.x, y, z: a.z, s: 0.6, s1: 2.0, life: 12, ease: 'pop', normal: true, fade: 3 });
    this.spawnSprite({ tex: this.tex.glow, x: a.x, y, z: a.z, s: 2.4, s1: 3.6, life: 12, color: '#ffc83d', alpha: 0.9 });
  }
  popBrush(text, sub, cls = '', y = 0.36, dur = 1.5) {
    if (this._brush && this._brush.isConnected) { const o = this._brush; o.classList.add('out'); setTimeout(() => o.remove(), 170); }
    const el = document.createElement('div'); el.className = 'fbg-brush ' + cls; this._brush = el;
    el.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    el.style.left = (this.W / 2) + 'px'; el.style.top = (this.H * y) + 'px'; el.style.animationDuration = dur + 's';
    this.$.world.appendChild(el); setTimeout(() => el.remove(), dur * 1000 + 60);
    this.say(text + (sub ? '. ' + sub : ''));
  }
  destroy() { for (const ev of ['mousedown', 'click', 'auxclick']) document.removeEventListener(ev, this.onGuardClick, true); document.removeEventListener('contextmenu', this.onGuardCtx, true); if (this.full) this.setFull(false); cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp); window.removeEventListener('mouseup', this.onMouseUp); document.removeEventListener('fullscreenchange', this.onFs); document.removeEventListener('webkitfullscreenchange', this.onFs); this.ro && this.ro.disconnect(); this.io && this.io.disconnect(); this.renderer && this.renderer.dispose(); this.root.remove(); }
}

// ================================================================ Phase 2 (2026-10-26): Sin City Weekend, opponent abilities, Fun Fabulous Facts, the stands, the share chip
// Shared by the Mobile and PC editions (identical block). Every opponent plays the SAME real rules (15 s ball control, catch = back in,
// saveOnTeammateCatch, mercy, overtime). Teams differ only by play style, strategy weights, ratings and abilities, and every ability
// has a visible AND audible tell plus a counter (WK_TEAMS from teams.json; Astra direction check 2026-10-26).
const OPPC = { sig: '#a6f23a', dark: '#17131f', id: 'glitches' };   // the current opponent's signature color (THE GLITCHES by default)
const GLITCHES_WK = { id: 'glitches', name: 'THE GLITCHES', short: 'GLITCHES', lvl: 'hard', rank: 17, pool: 'final', sig: '#a6f23a', dark: '#17131f', shape: 'pixel', crest: CREST_GL, emblem: null,
  who: 'The final boss: a crew of corrupted sprites led by the GLITCH KING, the strongest player on the floor.', scout: 'Big arms, wandering eyes, a few slippery dodgers. When they are down to 3, the GLITCH KING powers up.',
  weak: { stat: 'none', text: 'No weakness. Phase two at 3 players left.', teaches: 'Everything this weekend taught you.' }, ab: [], signs: ['GAME OVER?', 'PHASE TWO!', 'NEW HIGH SCORE'], taunt: 'Insert coin to continue!' };
// crowd allusions (STANDS.md, SAFE only, 3 words or fewer; Astra: no logos, no casino names, no HIGH ROLLER)
const ALLUDE = [['THANK YOU', 'STAFF!'], ['CATCH =', 'BACK IN'], ['FINAL', 'BOSS'], ['COMEBACK'], ['NO STING'], ['HAND UP!'], ['20TH', 'ANNIVERSARY'], ['ALL IN'], ['HIT ME!']];   // Astra 10/26: the advertised anniversary, not a counted run
// the arena marquee alludes to the weekend without printing the tournament's name (rectangular frame, never the welcome-sign silhouette)
const MARQUEE = ['WELCOME TO THE FAMILY', '15 YEARS OF DODGEBALL'];
const FACTS_GORDON_STORY = true;   // deck B (Gordon's own Sin City story) is approved by Gordon (relayed by main 2026-10-26)
// per-round difficulty: the weekend ramps from beatable to the GLITCH KING. Offsets on top of each team's ratings, tuned by
// simulation (tools: sim by round, FINAL BOSS win rate measured per opponent); Phase 1 found the catch-first and power-arm
// profiles crushed FINAL BOSS early, so the easy pools sit well below the defaults.
const WK_OFF = {1: -0.2, 2: -0.16, 3: -0.15, 4: -0.12, 5: -0.1, 6: -0.1, 7: -0.12, 8: -0.12, 9: -0.11, 10: -0.07, 11: -0.09, 12: -0.04, 13: -0.08, 14: -0.06, 15: -0.02, 16: -0.04};
// the Sin City staff (photo order, left to right). All eight mapped by Gordon 10/27.
// Gordon 10/27: the staff names, spelled exactly as given; alphabetical by last name in the thank-you line. Gordon mapped every face.
const STAFF_NAMES = ['Alexandra Bustamante', 'Jamell Dorton', 'Casey Flammond', 'Val Horton', 'Jake Mason', 'Anh Phan', 'Brendan Tickner', 'Chris Yeh'];
const STAFF_CREDITS = [
  { name: 'Jamell Dorton', role: 'Sin City Staff', alt: 'Jamell Dorton, illustrated' },
  { name: 'Casey Flammond', role: 'Sin City Staff', alt: 'Casey Flammond in a rainbow wig, illustrated' },
  { name: 'Jake Mason', role: 'Tournament Commissioner', alt: 'Commissioner Jake Mason, illustrated' },
  { name: 'Brendan Tickner', role: 'Sin City Staff', alt: 'Brendan Tickner, illustrated' },
  { name: 'Alexandra Bustamante', role: 'Sin City Staff', alt: 'Alexandra Bustamante, illustrated' },
  { name: 'Chris Yeh', role: 'Sin City Staff', alt: 'Chris Yeh, illustrated' },
  { name: 'Anh Phan', role: 'Sin City Staff', alt: 'Anh Phan, illustrated' },
  { name: 'Val Horton', role: 'Sin City Staff', alt: 'Val Horton, illustrated' },
];
// officials on the far sideline: the head referee at the center line, a line judge at each far corner
const STAFF_OFFICIALS = [
  { name: 'Jake Mason', x: 0, z: -(HZ + 0.95), look: { g: 'm', hs: 'crop', hc: '#5a3a24', skin: '#e8b48e', beard: '#4a2e1c', ht: 1.03, bw: 1.02 } },
  { name: 'Casey Flammond', x: -(HX + 0.9), z: -(HZ + 0.45), look: { g: 'm', hs: 'rainbow', hc: '#ff8a1f', skin: '#f0c09a', beard: '#c46a32', specs: '#1b1b1b', ht: 0.98, bw: 1 } },
  { name: 'Alexandra Bustamante', x: HX + 0.9, z: -(HZ + 0.45), look: { g: 'f', hs: 'curly', hc: '#1c1410', skin: '#b07a55', specs: '#1b1b1b', ht: 0.92, bw: 1.05 } },
];
const POST_KEY = 'fbg-post-v1';
const POST_PRI = { double: 5, save: 4, catchBack: 3, catch: 2, out: 1 };
// Coach Fiore's next steps: each one is a rule the game enforces (RULES, the title card), never a diagnosis of the player
const FIORE_STEPS = [
  'Catch, then answer right away: a catch puts the thrower out and brings your next teammate back in.',
  'When a ball pops off a teammate, go get it. Catch it before the floor and your teammate stays in.',
  'Carry the ball past your attack line before you throw, and rush only the balls on your right.',
  'Throw on dash steps 4 to 7 for a power shot.',
  'Hold a ball to block: a ball in your hands can stop a throw.',
];
// Commissioner Jake Mason's sportsmanship lines (dot's brief): encouragement, never a claim that sportsmanship was measured
const JAKE_LINES = ['Big respect for every player. Let\'s keep it kind!', 'Win or lose, there\'s room for a fresh start.', 'Make room to celebrate each other.', 'Take a bow, take a breath, and bring kindness next round!'];
const WK_KEY = 'fbg-weekend-v1';
const SUN_ROUNDS = ['WINNERS ROUND 1', 'WINNERS QUARTERFINAL', 'WINNERS SEMIFINAL', 'WINNERS FINAL', 'GRAND FINAL'];
function wkTeam(id) { return id === 'glitches' ? GLITCHES_WK : (WK_TEAMS.find(t => t.id === id) || null); }
function wkLoad() { try { const v = JSON.parse(localStorage.getItem(WK_KEY) || 'null'); return v && v.v === 1 && v.pools ? v : null; } catch (e) { return null; } }
function wkSave(w) { try { if (w) localStorage.setItem(WK_KEY, JSON.stringify(w)); else localStorage.removeItem(WK_KEY); } catch (e) { } }
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function wkPower(id) { if (id === 'finalboss') return 0.7; const t = wkTeam(id); if (!t || id === 'glitches') return 0.8; const r = t.rt; return (r.aware + r.catch + r.acc + r.power + r.foot + r.comp) / 6 + (WK_OFF[t.rank] || 0) + 0.004 * t.rank; }
function oppFromWK(t) {
  // a weekend team becomes the engine's opponent shape; THE GLITCHES keep their visor, crown and phase two
  if (!t || t.id === 'glitches') return Object.assign({}, BOSS_TEAM, { id: 'glitches', wk: GLITCHES_WK, sig: '#a6f23a', dark: '#17131f', abilities: [], built: true });
  return { id: t.id, wk: t, built: true, name: t.name, short: t.short, colors: t.colors, sig: t.sig, dark: t.dark, emblem: t.shape, style: null, tactic: null, abilities: [], visor: false, crown: false, p2: false,
    players: t.players.map(p => ({ key: p.key, num: p.num, skin: p.skin, build: p.build, shots: p.shots, look: p.look })),
    boss: { key: t.boss.key, stage: t.boss.stage, num: t.boss.num, skin: t.boss.skin, build: t.boss.build, shots: t.boss.shots, look: t.boss.look } };
}
function svgURI(inner, vb) { return 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb || '0 0 48 48'}">${inner}</svg>`) + '")'; }
function ord(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'); }

// ---- Fun Fabulous Facts card component (from fabulous-facts-20261026/ship card.js and anim.js, same timeline as Gordon's preview)
const FF = (function () {
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/(\S+-\S+)/g, '<span style="white-space:nowrap">$1</span>');
  function frame() {
    const W = 1920, H = 1080, i = 40, c = 64;
    const pts = [[i + c, i], [W - i - c, i], [W - i, i + c], [W - i, H - i - c], [W - i - c, H - i], [i + c, H - i], [i, H - i - c], [i, i + c]];
    const poly = pts.map(p => p.join(',')).join(' ');
    let bulbs = '', n = 0; const step = 44; let carry = 0;
    for (const [a, b] of pts.map((p, k) => [p, pts[(k + 1) % pts.length]])) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      for (let t = carry; t < L; t += step) { bulbs += `<circle class="b${n % 2 ? ' alt' : ''}" cx="${(a[0] + dx * t / L).toFixed(1)}" cy="${(a[1] + dy * t / L).toFixed(1)}" r="9.5"/>`; n++; }
      carry = (carry - L) % step; if (carry < 0) carry += step;
    }
    return `<svg class="ff-frame" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polygon class="inner" points="${poly}"/><polygon class="band" points="${poly}"/><polygon class="edge" points="${poly}"/><g class="bulbs">${bulbs}</g></svg>`;
  }
  const crownI = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 50 L10 18 L24 34 L32 10 L40 34 L54 18 L58 50 Z" fill="#FFC93C" stroke="#0E0B16" stroke-width="4" stroke-linejoin="round"/><circle cx="10" cy="16" r="5" fill="#F6E7C8" stroke="#0E0B16" stroke-width="3"/><circle cx="32" cy="8" r="5" fill="#F6E7C8" stroke="#0E0B16" stroke-width="3"/><circle cx="54" cy="16" r="5" fill="#F6E7C8" stroke="#0E0B16" stroke-width="3"/></svg>';
  const bulbI = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="#FFC93C" stroke="#0E0B16" stroke-width="4"/><circle cx="32" cy="32" r="9" fill="#F6E7C8"/></svg>';
  const qmark = '<svg class="ff-qmark" viewBox="0 0 130 100" aria-hidden="true"><path d="M8 96 V58 C8 26 22 8 52 2 L56 18 C38 24 32 34 32 50 H56 V96 Z M74 96 V58 C74 26 88 8 118 2 L122 18 C104 24 98 34 98 50 H122 V96 Z"/></svg>';
  const PRISM = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787', '#FFFFFF', '#FFAFC8', '#5BCEFA', '#613915', '#000000'];
  const prism = '<div class="ff-prism" aria-hidden="true">' + PRISM.map(c => `<i style="background:${c}"></i>`).join('') + '</div>';
  const label = (card) => card.deck === 'B' ? `<p class="ff-label">${crownI}<span>Gordon's Sin City</span></p>${prism}` : `<p class="ff-label">${bulbI}<span>${card.layout === 'dyk' ? 'Did you know?' : (card.exp ? 'Fabulous experience' : 'Fabulous fact')}</span></p>${prism}`;
  function render(card, o) {
    const el = document.createElement('div'); el.className = `ff L-${card.layout}${o.mobile ? ' m' : ''} D-${card.deck}`;
    el.style.setProperty('--u', (o.width / 1920) + 'px'); el.dataset.id = card.id;
    const portal = `<div class="ff-portal"><img alt="" src="${o.spotBase}spot-${card.spot}${o.spotSuffix}"></div>`;
    let col;
    if (card.layout === 'big') col = `${label(card)}<svg class="ff-num" viewBox="0 0 1000 380" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${escH(card.num)}"><text x="8" y="318" font-size="380" stroke-width="16">${escH(card.num)}</text></svg><p class="ff-body">${escH(card.text)}</p>`;
    else if (card.layout === 'quote') col = `${label(card)}${card.exp ? '' : qmark}<p class="ff-quote">${escH(card.quote)}</p><p class="ff-body">${escH(card.text)}</p><p class="ff-by">${escH(card.by)}</p>`;
    else col = `${label(card)}<p class="ff-head">${escH(card.head)}</p><p class="ff-body">${escH(card.text)}</p>`;
    el.innerHTML = frame() + portal + `<div class="ff-col">${col}</div>`;
    return el;
  }
  function fit(root) {
    root.querySelectorAll('.ff-num').forEach(svg => {
      const t = svg.querySelector('text'); let fs = +t.getAttribute('font-size') || 380; if (!svg.dataset.fit) { fs = 380; t.setAttribute('font-size', fs); }
      try { while (t.getComputedTextLength() > 980 && fs > 120) { fs -= 10; t.setAttribute('font-size', fs); } } catch (e) { }
      const h = Math.round(fs * 0.93); svg.setAttribute('viewBox', `0 0 1000 ${h}`); t.setAttribute('y', Math.round(fs * 0.83)); svg.style.height = `calc(${h} * var(--u))`; svg.dataset.fit = '1';
    });
  }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), seg = (t, a, d) => clamp((t - a) / d), outCubic = p => 1 - Math.pow(1 - p, 3);
  const outBack = p => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const fmt = (n, card) => { const s = Math.round(n).toLocaleString('en-US'); if (card.num === '#1') return '#' + s; if (/th$/.test(card.num)) return s + 'th'; return s + (card.num.endsWith('+') ? '+' : ''); };
  const T = { scrimIn: 0, cardIn: 0.08, cardD: 0.22, label: 0.3, count: 0.45, countD: 1.0, portal: 0.5, body: 0.7, vo: 0.8, exitD: 0.3 };
  const duration = (card, voSecs) => Math.max(5.0, T.vo + (voSecs || 4) + 0.6) + T.exitD;
  function seek(root, card, t, o) {
    const total = o.total || duration(card, o.voSecs), exitStart = Math.min(o.exitAt != null ? o.exitAt : Infinity, total - T.exitD), ex = seg(t, exitStart, T.exitD);
    const ff = root.querySelector('.ff'), scrim = root.querySelector('.ff-scrim'), R = !!o.reduced;
    if (scrim) scrim.style.opacity = (seg(t, T.scrimIn, 0.2) * (1 - ex)).toFixed(3);
    const pin = outCubic(seg(t, T.cardIn, T.cardD)), sc = R ? 1 : (1.25 - 0.25 * pin) * (1 - 0.04 * ex);
    ff.style.opacity = (R ? seg(t, T.cardIn, 0.15) : pin) * (1 - ex); ff.style.transform = `scale(${sc.toFixed(4)})`;
    const pl = R ? 1 : outCubic(seg(t, T.label, 0.2));
    root.querySelectorAll('.ff-label, .ff-prism').forEach(e => { e.style.opacity = pl; e.style.transform = `translateX(${((1 - pl) * -24).toFixed(1)}px)`; });
    const txt = root.querySelector('.ff-num text');
    if (txt && card.count != null) { const pc = R ? 1 : outCubic(seg(t, T.count, T.countD)); txt.textContent = pc >= 1 ? card.num : fmt(card.count * pc, card); /* a count-up number never runs under the medallion */ try { if (txt.getComputedTextLength() > 980) fit(root); } catch (e) { } txt.parentNode.style.opacity = R ? 1 : seg(t, T.count - 0.05, 0.1); }
    const portal = root.querySelector('.ff-portal'), img = portal && portal.querySelector('img');
    if (portal) {
      const pp = R ? 1 : outBack(seg(t, T.portal, 0.28)); portal.style.transform = `scale(${pp.toFixed(4)})`; portal.style.opacity = R ? 1 : clamp(pp * 2);
      if (img) { let y = 0, sx = 1, sy = 1; if (!R) for (const b of [1.6, 3.2]) { const p = seg(t, b, 0.5); if (p > 0 && p < 1) { y = -Math.sin(p * Math.PI) * 18; const sq = p > 0.85 ? (1 - p) / 0.15 : 0; sx = 1 + 0.04 * sq; sy = 1 - 0.04 * sq; } } img.style.transform = `translateY(${y.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`; }
    }
    root.querySelectorAll('.ff-body, .ff-quote, .ff-head, .ff-qmark, .ff-by').forEach((e, i) => { const p = R ? 1 : outCubic(seg(t, T.body + i * 0.06, 0.24)); e.style.opacity = p; e.style.transform = `translateY(${((1 - p) * 16).toFixed(1)}px)`; });
    const g = root.querySelector('.ff-frame .bulbs'); if (g) g.classList.toggle('chase', !R && Math.floor(t * 4) % 2 === 1);
    return { total, done: t >= exitStart + T.exitD };
  }
  return { render, fit, seek, duration, T };
})();

Object.assign(Sfx.prototype, {
  // lazy clips (team intros, ability tells, fact reads, weekend calls): fetched only when a match or card needs them, so a phone never downloads all of it
  loadOne(n, url) {
    this.want = this.want || {}; this.buf = this.buf || {};
    if (this.buf[n]) return; this.want[n] = url;
    if (!this.on || !this.ctx || !this.loading) return;
    this.lone = this.lone || {}; if (this.lone[n]) return; this.lone[n] = 1;
    fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(ab => { if (ab) this.ctx.decodeAudioData(ab, b => { this.buf[n] = b; }, () => { }); }).catch(() => { });
  },
  flushWant() { for (const k in (this.want || {})) this.loadOne(k, this.want[k]); },
  voH(n, prio = 2) {
    // an announcer read that can be cut: returns the source so a skipped fact card stops its read at once
    if (!this.on || !this.ctx) return null; const now = this.ctx.currentTime;
    const s = this.smp(n, 1, 1, 0, this.vBus); if (!s) return null;
    const d = s.buffer.duration; this.voUntil = now + d; this.voPrio = prio; if (this.onVo) this.onVo(n);
    this.bedBus.gain.cancelScheduledValues(now); this.bedBus.gain.setTargetAtTime(0.4, now, 0.04); this.bedBus.gain.setTargetAtTime(1, now + d, 0.35);
    if (this.musBus) { this.musBus.gain.cancelScheduledValues(now); this.musBus.gain.setTargetAtTime(0.14, now, 0.05); this.musBus.gain.setTargetAtTime(0.3, now + d, 0.4); }
    return s;
  },
  stopH(s) { if (!s || !this.ctx) return; try { s.stop(this.ctx.currentTime + 0.12); } catch (e) { } this.voUntil = 0; if (this.musBus) this.musBus.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.2); if (this.bedBus) this.bedBus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.2); },
});

Object.assign(Game.prototype, {
  // ------------------------------------------------ opponents: build, swap, look
  makeOppTeam() {
    const k1 = kitFrom(this.opp.colors); this.kit1 = k1; this.teams[1] = [];
    for (const def of this.opp.players) { const a = new Athlete(this, def, 1); a.drawKit(k1); a.def = def; this.teams[1].push(a); }
    const b = new Athlete(this, Object.assign({ isBoss: true }, this.opp.boss), 1); b.drawKit(k1); this.boss = b; b.stage = this.opp.boss.stage || this.opp.boss.key; this.teams[1].splice(3, 0, b);
  },
  athleteExtras(a) {
    const t = document.createElement('div'); t.className = 'fbg-tag t' + a.team; t.innerHTML = `<div class="fbg-you" hidden>YOU</div><div class="fbg-note" hidden></div>`;
    this.$.world.appendChild(t); a.tag = t; a.tagYou = t.querySelector('.fbg-you'); a.tagNote = t.querySelector('.fbg-note');
    const ring = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc83d', opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false; this.scene.add(ring); a.ring = ring;
    this.footTexT = this.footTexT || [teamFootTex(0), teamFootTex(1)];
    const foot = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.footTexT[a.team], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: a.team === 0 ? '#ffc83d' : OPPC.sig, opacity: 0.42 }));
    foot.rotation.x = -Math.PI / 2; foot.renderOrder = 1; foot.visible = false; this.scene.add(foot); a.foot = foot;
  },
  setOpponent(t) {
    // swap the whole opposing team between matches (weekend opponents, or back to THE GLITCHES for a quick match)
    const want = t ? t.id : 'glitches'; if (this.opp && (this.opp.id || 'glitches') === want && this.teams[1].length) return;
    for (const a of this.teams[1]) {
      this.scene.remove(a.root); this.scene.remove(a.shadow); this.scene.remove(a.ring); this.scene.remove(a.foot); a.tag.remove();
      for (const g of a.geos) g.dispose(); a.jerseyTex.dispose(); a.faceTex.dispose(); a.mats.torso.dispose(); a.mats.head.dispose(); a.ring.material.dispose(); a.foot.material.dispose();
    }
    this.opts.opponent = oppFromWK(t); this.opp = this.opts.opponent;
    this.makeOppTeam(); for (const a of this.teams[1]) this.athleteExtras(a);
    this.all = this.teams[0].concat(this.teams[1]);
    this.oppStyle = 'glitches'; this.assignRatings();
    this.tactic = [TACTICS.finalboss, Object.assign({}, TACTICS.glitches, this.opp.wk && this.opp.id !== 'glitches' ? this.opp.wk.w : {})];
    this.applyOppLook(); this.applyLook(this.look); this.applyMode(this.mode);
    this.resetMatch(); if (this.phase === 'title') this.attract();
  },
  applyOppLook() {
    const o = this.opp, W = o.wk || GLITCHES_WK, glitch = (o.id || 'glitches') === 'glitches';
    OPPC.sig = o.sig || '#a6f23a'; OPPC.dark = o.dark || '#17131f'; OPPC.id = o.id || 'glitches';
    const r = this.root.style; r.setProperty('--fbg-lime', OPPC.sig); r.setProperty('--fbg-oppdk', OPPC.dark);
    if (glitch || !W.emblem) r.removeProperty('--sh-pixel'); else r.setProperty('--sh-pixel', svgURI(W.emblem));
    const tn = this.root.querySelector('.fbg-team.r .fbg-tname'); if (tn) tn.innerHTML = `<span>${esc(o.name)}</span><span class="fbg-crest g">${W.crest || CREST_GL}</span>`;
    const bs = this.$.boss && this.$.boss.querySelector('span'); if (bs) bs.textContent = glitch ? 'GLITCH KING' : (this.boss.stage || this.boss.name);
    this.$.boss.classList.toggle('wk', !glitch);
    // the team's emblem as a white sprite texture (confetti, trails, catch rings) so the opponent's cues carry its SHAPE as well as its color
    if (glitch) this.tex.t1 = this.tex.pixel;
    else {
      const tex = canvasTex(64, 64, () => { }); this.tex.t1 = tex; const img = new Image(); this.oppImg = img;
      img.onload = () => { if (this.oppImg !== img) return; tex.userData.redraw((c, w, h) => { c.clearRect(0, 0, w, h); c.drawImage(img, 4, 4, w - 8, h - 8); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); }); if (this.ribbonTex) this.paintRibbon(); };
      img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 6 36 38" width="64" height="64">${W.emblem}</svg>`);
    }
    RIM_T1.color.value.set(this.mode === 'vc' ? '#6ff3ff' : (glitch ? '#c8ff6a' : shade(OPPC.sig, 0.3)));
    this.buildAbilities();
    // lazy audio for this opponent: two intro calls and the ability tells
    if (!glitch) { this.sfx.loadOne('intro_' + o.id + '_1', this.base + 'assets/weekend/audio/' + o.id + '-1.mp3'); this.sfx.loadOne('intro_' + o.id + '_2', this.base + 'assets/weekend/audio/' + o.id + '-2.mp3'); }
    for (const A of (W.ab || [])) this.sfx.loadOne(A.sfx, this.base + 'assets/audio/' + A.sfx + '.mp3');
    for (const n of ['crowd_fb_chant', 'crowd_handup', 'crowd_catch_build']) this.sfx.loadOne(n, this.sfx.base + n + '.mp3');
    if (this.signs) this.drawSigns();
  },
  // ------------------------------------------------ abilities: one engine hook each, each with a tell (call-out in the team's color and shape, a sound, a particle)
  buildAbilities() { this.AB = {}; this.abT = {}; this.abState = { key: false, burst: 0, mid: false }; for (const A of ((this.opp.wk && this.opp.wk.ab) || [])) this.AB[A.hook] = this.AB[A.hook] || A; },
  ab(h, a) { return (!a || a.team === 1) && this.AB ? this.AB[h] || null : null; },
  abTell(a, A, gap = 150) {
    if (!A || !a) return; this.abT = this.abT || {}; const key = A.name + ':' + a.key;
    this.awStat('ab_' + A.hook); this.qaLog('ability', { name: A.name, who: a.key });
    if (this.frame < (this.abT[A.name] || 0) && this.frame < (this.abT[key] || 0)) return;
    this.abT[A.name] = this.frame + gap; this.abT[key] = this.frame + gap;
    this.pop(a, A.say, 'small lime sh1'); this.sfx.smp(A.sfx, 0.85);
    if (!this.rm) for (let i = 0; i < 7; i++) { const g = Math.random() * Math.PI * 2; this.spawnSprite({ tex: this.tex.t1 || this.tex.pixel, x: a.x, y: a.h + 1.6 * a.scale, z: a.z, s: 0.24, s1: 0.12, life: 26, vx: Math.cos(g) * 1.6, vy: 2.2, vz: Math.sin(g) * 0.8, g: 5, color: OPPC.sig, normal: true, alpha: 0.95 }); }
  },
  abExtra(kind) {
    // extra amounts fed into the existing ability kinds (fake bait, quick feet on a jammer burst)
    if (kind === 'fakeBait' && this.AB.fake) return this.AB.fake.k.bait;
    if (kind === 'moveSpeed' && this.AB.burst && this.frame < (this.abState.burst || 0)) return this.AB.burst.k.mul - 1;
    return 0;
  },
  abPow(a) {
    // throw speed from abilities: proofing (a held ball rises), hero answer (after a catch), key change (behind by 2)
    if (a.team !== 1 || !this.AB) return 1; let m = 1;
    const P = this.AB.proof; if (P && a.heldF) m *= 1 + (P.k.max - 1) * Math.min(1, a.heldF / (P.k.sec * 60));
    if (this.AB.answer && a.answer) m *= this.AB.answer.k.power;
    if (this.AB.keychange && this.abState.key) m *= this.AB.keychange.k.power;
    return m;
  },
  abAccM(a) { if (a.team !== 1 || !this.AB) return 1; let m = 1; if (a.sig && a.sig.k.acc) m *= a.sig.k.acc; if (this.AB.bloom && a.bloom > 0) m *= this.AB.bloom.k.acc; return m; },
  abOnThrow(a, it, inAir, power) {
    // at the windup (dodge on the load): signature throws, the boa fake and pass-then-throw tempo, each told before the ball leaves
    if (a.team !== 1 || !this.aiPlays(a) || it.pass || inAir || power) return false;
    const boa = this.AB.boa; if (boa && !a.boaSoft && !a.syncTarget && Math.random() < boa.k.p) {
      a.set('pump'); a.boaSoft = true; this.abTell(a, boa, 90); this.awStat('fakes');
      for (const f of this.inPlayers(0)) if (this.aiPlays(f) && this.viewOf(f, a.x, a.z) === 1 && !f.locked() && Math.random() < 0.6 * (f.rt || FB_BASE).aware) { f.ai.react = { fake: true, B: { state: 'flight' }, aware: true, kind: 'dodge', at: (this.wf || 0) + 1, impactF: (this.wf || 0) + 14 }; this.awStat('fakeBaited'); }
      return true;
    }
    const S = this.AB.shot; if (S && !a.syncTarget && Math.random() < 0.34) { a.sig = S; this.abTell(a, S, 100); }
    if (this.AB.answer && a.answer) this.abTell(a, this.AB.answer, 100);
    return false;
  },
  abRelease0(a, B) { B.sig = null; if (a.team === 1 && a.sig && a.sig.k.release) B.h = a.h + a.sig.k.release * a.scale; },
  abRelease1(a, B, t) {
    if (a.team !== 1) { if (a.boaSoft) a.boaSoft = false; return; }
    const S = a.sig; a.sig = null; a.windMul = 0;
    if (a.boaSoft) { a.boaSoft = false; const sp = 0.85; B.vx *= sp; B.vz *= sp; const tt = t ? Math.hypot(t.x - B.x, t.z - B.z) / Math.hypot(B.vx, B.vz) : 0.6; B.grav = 6; B.vh = (0.4 * (t ? t.scale : 1) - B.h) / tt + 0.5 * B.grav * tt; }
    if (a.answer) a.answer = false;
    if (a.bloom > 0) a.bloom--;
    if (!S) return;
    B.sig = S; B.trailC = OPPC.sig; const k = S.k;
    if (k.flat) { B.h = Math.max(0.42, k.aim * (t ? t.scale : 1)); B.vh = 0; B.grav = 0; }
    if (k.curve) B.curve = { a: (Math.random() < 0.5 ? -1 : 1) * k.curve * 9, from: 16 };
    if (k.wobble) B.wob = k.wobble;
    if (k.hard) B.hard = true;
    if (k.back && t) { /* bouquet: aimed at the back row (targeted in abTarget) */ }
  },
  abTarget(a, t) {
    // bouquet toss: a high lob over the front line onto the back row
    if (a.team === 1 && a.sig && a.sig.k.back) { const foes = this.inPlayers(0).filter(f => f.oob === 0); if (foes.length) return foes.slice().sort((p, q) => p.x - q.x)[0]; }
    return t;
  },
  abFlight(B) {
    if (B.curve && B.age > B.curve.from && B.live !== null) { const sp = Math.hypot(B.vx, B.vz) || 1; B.vx += -B.vz / sp * B.curve.a * DT; B.vz += B.vx / sp * B.curve.a * DT; }
    if (B.wob) { const sp = Math.hypot(B.vx, B.vz) || 1, w = Math.cos(B.age * 0.5) * B.wob * 9 * DT; B.vx += -B.vz / sp * w; B.vz += B.vx / sp * w; if (B.age % 3 === 0 && !this.rm) this.sparkle(B.x, B.h, B.z); }
    if (B.sig && B.live && B.age % 3 === 0 && !this.rm) this.spawnSprite({ tex: this.tex.t1 || this.tex.pixel, x: B.x, y: B.h, z: B.z, s: 0.22, s1: 0.08, life: 16, color: OPPC.sig, alpha: 0.9 });
  },
  abCatchMul(a, hImp, sc) {
    // catch choices: lasso reach above the waist, pyramid stunts for high balls, tens at chest height
    if (a.team !== 1 || !this.AB) return 1; let m = 1;
    if (this.AB.reach && hImp > 0.6 * sc) m *= this.AB.reach.k.mul;
    if (this.AB.tens && hImp > 0.6 * sc && hImp < 1.5 * sc) m *= 1.15;
    return m;
  },
  abHighCatch(a, hImp, sc) { const P = this.ab('highcatch', a); return !!(P && hImp > 1.3 * sc && hImp < 2.0 * sc && Math.random() < P.k.p); },
  abCatchTell(a, hImp, sc) {
    if (a.team !== 1) return;
    if (this.AB.reach && hImp > 0.6 * sc) this.abTell(a, this.AB.reach);
    else if (this.AB.highcatch && hImp > 1.3 * sc) this.abTell(a, this.AB.highcatch);
    else if (this.AB.tens && hImp > 0.6 * sc && hImp < 1.5 * sc) this.abTell(a, this.AB.tens);
  },
  abErrMul(a) { return a.team === 1 && this.AB && this.AB.tens ? 0.4 : 1; },
  abOnNotice(a, B, kind, impactF, hImp, sc) {
    // team reactions that ride on a noticed throw: rescue dives, the partner dip, the school of fish, the moon hop and the jammer burst
    if (a.team !== 1 || !this.AB) return kind;
    const R = this.AB.rescue;
    if (R && kind !== 'catch' && kind !== 'block' && Math.random() < 0.45) {
      const sp = Math.hypot(B.vx, B.vz) || 1, ux = B.vx / sp, uz = B.vz / sp;
      const ix = a.x - ux * 0.95, iz = a.z - uz * 0.95;   // a point on the ball's path, just in front of the target
      const m = this.inPlayers(1).filter(m => m !== a && this.aiPlays(m) && !m.held && !m.locked() && m.oob === 0 && !(m.ai.react && m.ai.react.aware && m.ai.react.B.state === 'flight') && Math.hypot(m.x - ix, m.z - iz) < R.k.r).sort((p, q) => Math.hypot(p.x - ix, p.z - iz) - Math.hypot(q.x - ix, q.z - iz))[0];
      if (m && ix * m.side > 0.3) {
        m.ai.react = { B, aware: true, kind: 'save', at: (this.wf || 0) + 2, impactF: impactF - 3, tx: ix, tz: iz, rescue: true };
        m.ai.press = Math.max((this.wf || 0) + 3, impactF - 13); this.abTell(m, R, 120); this.awStat('rescues');
        if (R.k.partner) return 'duck';
      }
    }
    if (this.AB.moonhop && hImp < 0.9 * sc && kind !== 'catch' && kind !== 'block' && Math.random() < 0.8) { a.jumpMul = 1.3; a.landHold = this.AB.moonhop.k.land; kind = 'hop'; this.abTell(a, this.AB.moonhop, 90); }
    if (this.AB.burst && kind !== 'catch' && kind !== 'block' && !this.abState.burstUsed) { this.abState.burstUsed = true; this.abState.burst = this.frame + this.AB.burst.k.frames; this.abTell(a, this.AB.burst, 60); }
    const S = this.AB.school;
    if (S && kind !== 'catch' && kind !== 'block' && kind !== 'freeze') {
      const mates = this.inPlayers(1).filter(m => m !== a && this.aiPlays(m) && !m.held && !m.locked() && !m.ai.react && Math.hypot(m.x - a.x, m.z - a.z) < 2.6).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z)).slice(0, S.k.n);
      if (mates.length) { for (const m of mates) m.ai.react = { B, aware: true, kind: 'dodge', at: (this.wf || 0) + S.k.lag, impactF, school: true }; this.abTell(a, S, 120); }
    }
    return kind;
  },
  abEvade(f, B) {
    // contact-time abilities: twirl and toe pick (cooldowns, so a second ball right after beats them), the cape over the upper body, the strobe step
    if (f.team !== 1 || !this.AB || !this.aiPlays(f)) return false;
    const fr = f.ai && f.ai.react, saw = fr && fr.aware && fr.B === B && fr.kind !== 'catch' && fr.kind !== 'block';
    f.abCd = f.abCd || {};
    const go = (A, p, test) => {
      if (!A || !test || this.frame < (f.abCd[A.hook] || 0) || Math.random() > p) return false;
      f.abCd[A.hook] = this.frame + (A.k.cd || 180); B.hitSet.add(f); this.abTell(f, A, 30); this.pop(f, 'MISS', 'tiny lime sh1'); this.awStat('abEvade_' + A.hook);
      return true;
    };
    const E = this.AB.evade;
    if (E && go(E, E.k.p, saw)) { if (!LOCKED.has(f.state)) { f.set(E.k.state); f.vz = (Math.random() < 0.5 ? -1 : 1) * 2.4; } return true; }
    const C = this.AB.cape;
    if (C && go(C, C.k.p, saw && B.h > f.h + 1.05 * f.scale)) return true;
    const T = this.AB.strobe;
    if (T && go(T, T.k.p, !!(fr && fr.aware && fr.B === B))) { const dz = (f.z > B.z ? 1 : -1) * 0.7; f.z = Math.max(-(HZ - 0.4), Math.min(HZ - 0.4, f.z + dz)); this.spawnSprite({ tex: this.tex.glow, x: f.x, y: f.h + 1.1, z: f.z - dz, s: 2.2, s1: 2.6, life: 12, color: OPPC.sig, alpha: 0.85 }); return true; }
    return false;
  },
  abOnCatch(f) {
    if (f.team !== 1 || !this.AB) return;
    if (this.AB.answer) { f.answer = true; f.windMul = this.AB.answer.k.wind; this.abTell(f, this.AB.answer, 90); }
    if (this.AB.bloom) { f.bloom = this.AB.bloom.k.uses; this.abTell(f, this.AB.bloom, 90); }
    if (this.AB.tens) this.abTell(f, this.AB.tens, 120);
  },
  abOnPass(from, to) {
    const P = this.ab('passthrow', from); if (!P || !this.aiPlays(to)) return;
    to.ai.plan = { k: 'throw' }; to.ai.delay = 3; to.ai.t = 0; to.windMul = P.k.wind; this.abTell(to, P, 90);
  },
  abOnFake(t, shooter) { const F = t === 1 && this.ab('fake'); if (F) this.abTell(shooter, F, 60); },
  abBlockP(f, p) { if (f.team === 1 && this.AB && this.AB.royal) { this.abTell(f, this.AB.royal, 90); return 0.98; } return p; },
  abBlockKind(a) { return a.team === 1 && this.AB && this.AB.royal; },
  abMulti(a, target) {
    // coordinated throws with an audible count-in: five-six-seven-eight, three-part harmony, the decree double
    const M = this.AB && this.AB.multi; if (!M || a.team !== 1) return false;
    const holders = this.inPlayers(1).filter(m => this.aiPlays(m) && m.held && m.held.cleared && m.oob === 0 && (!m.ai.plan || m.ai.plan.k === 'throw')).sort((p, q) => (p === a ? -1 : 0) - (q === a ? -1 : 0)).slice(0, M.k.n);
    if (holders.length < 2) return false;
    holders.forEach((m, i) => { m.ai.plan = { k: 'sync', s: { at: this.frame + M.k.count + i * (M.k.stagger || 0), target, team: 1 } }; m.ai.t = 0; });
    this.abTell(a, M, 60); this.awStat('sync');
    return true;
  },
  abTick() {
    // per play tick: proofing glow, key change, midnight strike near the end of the control clock
    if (!this.AB || this.phase !== 'play') return;
    for (const a of this.teams[1]) { if (a.held && a.role === 'in') { a.heldF = (a.heldF || 0) + 1; if (this.AB.proof && a.heldF === 150) this.abTell(a, this.AB.proof, 240); } else a.heldF = 0; }
    const K = this.AB.keychange;
    if (K) { const down = this.liveCount(0) - this.liveCount(1) >= 2; if (down && !this.abState.key) { this.abState.key = true; for (const a of this.teams[1]) if (a.rt) a.rt.comp = clampR(a.rt.comp + K.k.comp); const s = this.inPlayers(1)[0]; if (s) this.abTell(s, K, 600); this.popBrush('KEY CHANGE!', this.opp.short + ' FIND A HIGHER NOTE', 'lime', 0.3, 1.4); } else if (!down && this.abState.key && this.liveCount(0) <= this.liveCount(1)) { this.abState.key = false; for (const a of this.teams[1]) if (a.rt) a.rt.comp = clampR(a.rt.comp - K.k.comp); } }
    const MS = this.AB.midnight;
    if (MS) {
      if (this.ctlTeam !== 1) { this.abState.mid = false; this.abState.chime = false; }
      else {
        if (!this.abState.chime && this.ctlT >= RULES.control - 5) { this.abState.chime = true; this.sfx.smp(MS.sfx, 0.5); }
        if (!this.abState.mid && this.ctlT >= RULES.control - 3) {
          this.abState.mid = true;
          const H = this.inPlayers(1).filter(m => this.aiPlays(m) && m.held && m.held.cleared && m.oob === 0);
          const foes = this.inPlayers(0).filter(f => f.oob === 0);
          if (H.length && foes.length) { const tgt = foes.slice().sort((p, q) => this.viewOf(p, H[0].x, H[0].z) - this.viewOf(q, H[0].x, H[0].z))[0]; H.forEach((m, i) => { m.ai.plan = { k: 'sync', s: { at: this.frame + 6 + i * 2, target: tgt, team: 1 } }; m.ai.t = 0; }); this.abTell(H[0], MS, 300); }
        }
      }
    }
  },
  abBallFx(B) {
    // proofing: a held ball glows warm as it rises (the tell); jammer burst sparks at the skaters' feet
    if (B.state === 'held' && B.holder && B.holder.team === 1 && this.AB && this.AB.proof && B.holder.heldF > 60) { const g = B.glow.material; g.opacity = Math.min(0.8, (B.holder.heldF - 60) / 180); g.color.set('#ffb347'); B.glow.scale.setScalar(1.2 + 0.5 * Math.min(1, B.holder.heldF / 240)); }
  },
  // ------------------------------------------------ Sin City Weekend: Saturday pools, Sunday double elimination, ending at THE GLITCHES
  wkNew() {
    const seed = (Math.random() * 1e9) | 0, R = seeded(seed), P = WK_BRACKET.pools;
    const pools = { A: ['finalboss'].concat(P.A), B: P.B.slice(), C: P.C.slice(), D: P.D.slice() }, games = {};
    for (const p in pools) {
      games[p] = []; const ts = pools[p];
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i], b = ts[j]; if (a === 'finalboss' || b === 'finalboss') continue;
        const pa = 1 / (1 + Math.exp(-(wkPower(a) - wkPower(b)) * 18)), aw = R() < pa, big = 2 + ((R() * 3) | 0), small = (R() * big) | 0;
        games[p].push({ a, b, w: aw ? a : b, s: aw ? [big, small] : [small, big] });
      }
    }
    return { v: 1, seed, day: 'sat', pools, games, fb: [], sun: null, done: null };
  },
  wkStand(w, p) {
    const T = {}; for (const id of w.pools[p]) T[id] = { id, W: 0, L: 0, d: 0 };
    const add = (g) => { const [x, y] = g.s; T[g.a].d += x - y; T[g.b].d += y - x; if (g.w === g.a) { T[g.a].W++; T[g.b].L++; } else { T[g.b].W++; T[g.a].L++; } };
    for (const g of w.games[p]) add(g);
    if (p === 'A') for (const r of w.fb.filter(r => r.day === 'sat')) add({ a: 'finalboss', b: r.opp, w: r.win ? 'finalboss' : r.opp, s: r.pts });
    const h2h = (x, y) => { const gs = w.games[p].filter(g => (g.a === x && g.b === y) || (g.a === y && g.b === x)); if (p === 'A') for (const r of w.fb.filter(r => r.day === 'sat' && (r.opp === x || r.opp === y) && (x === 'finalboss' || y === 'finalboss'))) gs.push({ w: r.win ? 'finalboss' : r.opp }); return gs.length ? (gs[0].w === x ? -1 : 1) : 0; };
    return Object.values(T).sort((a, b) => b.W - a.W || b.d - a.d || h2h(a.id, b.id) || wkPower(b.id) - wkPower(a.id));
  },
  wkInfo(w) {
    w = w || this.wk; if (!w || w.done) return null;
    if (w.day === 'sat') { const i = w.fb.length; return { day: 'sat', opp: w.pools.A[1 + i], label: `SATURDAY: POOL A, GAME ${i + 1} OF 3`, short: 'POOL A', i }; }
    const S = w.sun;
    if (S.comeback) return { day: 'sun', opp: S.comeback, label: 'SUNDAY: COMEBACK ROAD', short: 'COMEBACK ROAD', comeback: true };
    return { day: 'sun', opp: S.path[S.step], label: 'SUNDAY: ' + SUN_ROUNDS[S.step] + (S.reset ? ', BRACKET RESET' : ''), short: SUN_ROUNDS[S.step], step: S.step };
  },
  wkRecord(win, pts) {
    const w = this.wk, n = this.wkMatch; if (!w || !n || n.recorded) return; n.recorded = true;
    w.fb.push({ day: n.day, opp: n.opp, win: !!win, pts: pts.slice(), label: n.short });
    if (n.day === 'sat') {
      if (w.fb.filter(r => r.day === 'sat').length >= 3) {
        const st = {}; for (const p of ['A', 'B', 'C', 'D']) st[p] = this.wkStand(w, p);
        const top = st.A.slice(0, 2).map(r => r.id), place = st.A.findIndex(r => r.id === 'finalboss') + 1;
        if (!top.includes('finalboss')) { w.done = { champion: false, place, why: `FINAL BOSS finished ${ord(place)} in Pool A. Only the top 2 play on Sunday.` }; }
        else {
          const other = top.find(id => id !== 'finalboss');
          w.day = 'sun'; w.sun = { step: 0, losses: 0, reset: false, comeback: null, path: [st.B[0].id, st.C[0].id, st.D[0].id, WK_BRACKET.seeded, 'glitches'], ru: [st.C[1].id, st.D[1].id, other, st.B[1].id], poolPlace: place };
        }
      }
    } else {
      const S = w.sun;
      if (S.comeback) { if (win) { S.comeback = null; S.step++; } else { S.losses++; w.done = { champion: false, place: [7, 5, 4, 3][Math.min(3, S.step)], why: 'Two Sunday losses end the weekend. FINAL BOSS fell on Comeback Road.' }; } }
      else if (win) { if (S.step >= 4) w.done = { champion: true, place: 1, why: 'FINAL BOSS beat THE GLITCHES and the GLITCH KING.' }; else S.step++; }
      else {
        S.losses++;
        if (S.step >= 4) { if (S.losses === 1) S.reset = true; else w.done = { champion: false, place: 2, why: 'The GLITCH KING keeps the crown, for now. Second place.' }; }
        else S.comeback = S.ru[S.step];
      }
    }
    wkSave(w);
  },
  wkPoolHTML(w, p) {
    const st = this.wkStand(w, p), name = (id) => id === 'finalboss' ? 'FINAL BOSS' : wkTeam(id).short;
    const crest = (id) => id === 'finalboss' ? CREST_FB : wkTeam(id).crest;
    return `<div class="fbg-wk-pool${p === 'A' ? ' mine' : ''}"><h4>POOL ${p}</h4><ol>${st.map((r, i) => `<li class="${r.id === 'finalboss' ? 'fb' : ''}${i < 2 ? ' adv' : ''}"><span class="fbg-wk-cr">${crest(r.id)}</span><b>${esc(name(r.id))}</b><i>${r.W} to ${r.L}</i></li>`).join('')}</ol></div>`;
  },
  showBracket() {
    // the weekend board: next opponent first (scouting, tells and counters), then Saturday pools and the Sunday path
    this.phase = 'title'; this.picking = false; this.wkView = true;
    if (!this.wk) this.wk = wkLoad();
    if (!this.wk) { this.wk = this.wkNew(); wkSave(this.wk); this.sfx.loadOne('vo_wk_welcome', this.sfx.base + 'vo_wk_welcome.mp3'); setTimeout(() => this.sfx.vo('vo_wk_welcome', 3), 600); }
    const w = this.wk, n = this.wkInfo(w), t = n ? wkTeam(n.opp) : null, art = this.base + 'assets/art/keyart-' + (this.native ? '1920' : '960') + '.jpg';
    this.sfx.music('music_weekend');
    const sun = w.sun, round = (i) => { const id = sun ? sun.path[i] : (i === 3 ? WK_BRACKET.seeded : (i === 4 ? 'glitches' : null)), tm = id ? wkTeam(id) : null, res = sun ? w.fb.filter(r => r.day === 'sun' && r.opp === id) : [];
      const st = !sun ? 'tbd' : res.some(r => r.win) ? 'won' : (res.length ? 'lost' : (n && n.step === i && !n.comeback ? 'next' : (sun.step > i ? 'won' : 'up')));
      return `<li class="${st}"><small>${SUN_ROUNDS[i]}</small><span class="fbg-wk-cr">${tm ? tm.crest : ''}</span><b>${tm ? esc(tm.short) : 'WINNER OF POOL ' + 'BCD'[i]}</b><em>${st === 'won' ? 'WON' : st === 'lost' ? 'LOST' : st === 'next' ? 'NEXT' : ''}</em></li>`; };
    const crb = sun && (sun.comeback || w.fb.some(r => r.label === 'COMEBACK ROAD')) ? `<p class="fbg-wk-cb">Comeback Road: ${w.fb.filter(r => r.label === 'COMEBACK ROAD').map(r => `${esc(wkTeam(r.opp).short)} ${r.win ? 'won' : 'lost'}`).join(', ') || 'one more loss ends the weekend'}</p>` : '';
    let next = '';
    if (n && t) {
      const abl = t.ab.map(A => `<li><b>${esc(A.name)}</b><span>Tell: ${esc(A.tell)}</span><span>Counter: ${esc(A.counter)}</span></li>`).join('');
      next = `<section class="fbg-wk-next"><div class="fbg-wk-crest">${t.id === 'glitches' ? `<span class="fbg-wk-svg">${CREST_GL}</span>` : `<img alt="${esc(t.name)} crest" src="${this.base}assets/weekend/crests/${t.id}-${this.native ? 512 : 256}.webp">`}</div>
        <div class="fbg-wk-nt"><small>${n.label}</small><h3>${esc(t.name)}</h3><p>${esc(t.who)}</p><p class="fbg-wk-scout"><b>Scouting</b> ${esc(t.scout)}</p>${t.weak && t.weak.stat !== 'none' ? `<p class="fbg-wk-scout"><b>Weakness</b> ${esc(t.weak.text)}</p>` : `<p class="fbg-wk-scout"><b>Boss</b> ${esc(t.weak.text)}</p>`}
        ${abl ? `<details class="fbg-wk-ab"><summary>Abilities, tells and counters</summary><ul>${abl}</ul></details>` : ''}</div></section>`;
    } else if (w.done) {
      next = `<section class="fbg-wk-next done${w.done.champion ? ' champ' : ''}"><div class="fbg-wk-crest"><img alt="" src="${this.base}assets/art/${w.done.champion ? 'trophy' : 'boss-ball'}-256.webp"></div><div class="fbg-wk-nt"><small>${w.done.champion ? 'SUNDAY: CHAMPIONS' : 'THE WEEKEND IS OVER'}</small><h3>${w.done.champion ? 'FINAL BOSS <em>WINS THE WEEKEND</em>' : 'FINAL BOSS: ' + ord(w.done.place) + ' PLACE'}</h3><p>${esc(w.done.why)}</p><p class="fbg-wk-scout">${w.fb.filter(r => r.win).length} wins, ${w.fb.filter(r => !r.win).length} losses this weekend. Hand up, walk it off, run it back.</p></div></section>`;
    }
    this.$.card.classList.remove('is-picker'); this.$.ov.classList.remove('picker'); this.$.card.classList.add('is-wk');
    this.$.card.innerHTML = `<div class="fbg-wk" style="--wk-art:url('${art}')">
      <header class="fbg-wk-h"><h2>SIN CITY <em>WEEKEND</em></h2><p>An arcade weekend inspired by the tournament: fictional teams, the same real rules every match.</p></header>
      ${next}
      <div class="fbg-row fbg-wk-row">${n ? `<button class="fbg-btn fbg-wk-go" type="button">PLAY ${esc(t.short)}</button>` : `<button class="fbg-btn fbg-wk-new" type="button">RUN IT BACK</button>`}<button class="fbg-btn ghost fbg-wk-quick" type="button">Quick match</button><button class="fbg-btn ghost fbg-wk-back" type="button">Back</button></div>
      <div class="fbg-wk-days"><section class="fbg-wk-sat"><h3>SATURDAY POOLS</h3><div class="fbg-wk-pools">${['A', 'B', 'C', 'D'].map(p => this.wkPoolHTML(w, p)).join('')}</div><p class="fbg-wk-note">Top 2 in each pool play Sunday. The defending champions wait in the winners final.</p></section>
      <section class="fbg-wk-sun"><h3>SUNDAY: DOUBLE ELIMINATION</h3><ol class="fbg-wk-path">${[0, 1, 2, 3, 4].map(round).join('')}</ol>${crb}<p class="fbg-wk-note">A Sunday loss sends you to Comeback Road. Two losses end the weekend. Plan for extra time.</p></section></div>
      ${n && w.fb.length ? `<p class="fbg-wk-reset"><button class="fbg-btn ghost fbg-wk-new" type="button">Start a new weekend</button></p>` : ''}</div>`;
    const q = (s) => this.$.card.querySelector(s);
    if (q('.fbg-wk-go')) q('.fbg-wk-go').addEventListener('click', () => this.startWeekendMatch());
    this.$.card.querySelectorAll('.fbg-wk-new').forEach(b => b.addEventListener('click', () => { this.wk = this.wkNew(); wkSave(this.wk); this.showBracket(); }));
    q('.fbg-wk-quick').addEventListener('click', () => { this.wkView = false; this.wkMatch = null; this.$.card.classList.remove('is-wk'); this.setOpponent(null); this.start(); });
    q('.fbg-wk-back').addEventListener('click', () => { this.wkView = false; this.$.card.classList.remove('is-wk'); this.showTitle(); });
    this.$.ov.hidden = false;
    const go = q('.fbg-wk-go') || q('.fbg-wk-new'); try { go.focus({ preventScroll: true }); } catch (e) { }
    if (t && t.id !== 'glitches') { this.sfx.loadOne('intro_' + t.id + '_1', this.base + 'assets/weekend/audio/' + t.id + '-1.mp3'); }
    if (sun && sun.step === 0 && !w.fb.some(r => r.day === 'sun') && !sun.said) { sun.said = true; wkSave(w); this.sfx.loadOne('vo_wk_sunday', this.sfx.base + 'vo_wk_sunday.mp3'); setTimeout(() => this.sfx.vo('vo_wk_sunday', 3), 700); }
  },
  startWeekendMatch() {
    const n = this.wkInfo(); if (!n) return this.showBracket();
    this.wkView = false; this.$.card.classList.remove('is-wk');
    this.wkMatch = n; this.setOpponent(wkTeam(n.opp));
    this.start();
  },
  // ------------------------------------------------ Fun Fabulous Facts between games (never during play; one tap, click or key skips)
  nextFact() {
    let o = null; try { o = JSON.parse(sessionStorage.getItem('fbg-facts') || 'null'); } catch (e) { }
    const A = FACT_CARDS.filter(c => c.deck === 'A'), B = FACT_CARDS.filter(c => c.deck === 'B' && FACTS_GORDON_STORY);
    if (!o || !Array.isArray(o.a) || o.a.length !== A.length) { const sh = (x) => x.map(c => [Math.random(), c.id]).sort((p, q) => p[0] - q[0]).map(p => p[1]); o = { a: sh(A), b: sh(B), i: 0, j: 0, k: 0 }; if (o.a.includes('S01')) o.a = ['S01', ...o.a.filter(x => x !== 'S01')]; }
    let id; if (B.length && o.k % 3 === 2) { id = o.b[o.j % o.b.length]; o.j++; } else { id = o.a[o.i % o.a.length]; o.i++; } o.k++;
    try { sessionStorage.setItem('fbg-facts', JSON.stringify(o)); } catch (e) { }
    return FACT_CARDS.find(c => c.id === id) || A[0];
  },
  preloadFact() { if (!this.factNext) this.factNext = this.nextFact(); const c = this.factNext; this.sfx.loadOne('fact_sting', this.sfx.base + 'fact_sting.mp3'); this.sfx.loadOne('fact_' + c.id, this.sfx.base + 'fact_' + c.id + '.mp3'); const im = new Image(); im.src = this.base + 'assets/facts/spots/spot-' + c.spot + (this.edition === 'mobile' ? '-384.webp' : '.webp'); },
  factWanted() { return !this.ot && !this.sudden && this.lastCtl >= 0 && this.gameNo > 1 && this.gameNo % 2 === 0 && this.opts.facts !== false; },
  startFact(after) {
    const card = this.factNext || this.nextFact(); this.factNext = null;
    this.factPrev = this.phase; this.factAfter = after || null; this.phase = 'fact'; this.factT = 0; this.factExit = null; this.factCard = card;
    const ov = document.createElement('div'); ov.className = 'ff-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Fun fabulous fact. Tap or press a key to skip.');
    const W = Math.min((this.W || 800) * 0.86, 1650, (this.H || 450) * 0.9 * 16 / 9);
    ov.innerHTML = '<div class="ff-scrim"></div>';
    const el = FF.render(card, { width: W, mobile: this.mobile, spotBase: this.base + 'assets/facts/spots/', spotSuffix: this.edition === 'mobile' ? '-384.webp' : '.webp' });
    ov.appendChild(el); const sk = document.createElement('p'); sk.className = 'ff-skip'; sk.textContent = this.root.classList.contains('has-touch') ? 'Tap to skip' : 'Enter to skip'; ov.appendChild(sk);
    ov.addEventListener('pointerdown', (e) => { e.preventDefault(); this.factSkip = true; });
    this.$.stage.appendChild(ov); this.factEl = ov;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (this.factEl === ov) FF.fit(ov); }); FF.fit(ov);
    this.factSnd = []; this.factSkip = false;
    setTimeout(() => { if (this.factEl === ov && this.factExit == null) { const s = this.sfx.smp('fact_sting', 0.32); if (s) this.factSnd.push(s); } }, 80);
    setTimeout(() => { if (this.factEl === ov && this.factExit == null && !card.voStale) { const s = this.sfx.voH('fact_' + card.id, 3); if (s) this.factSnd.push(s); } }, 800);
    this.say((card.head || card.num || '') + '. ' + (card.quote ? card.quote + ' ' : '') + card.text);
    this.qaLog('fact', { id: card.id }); this.preloadFact();
  },
  factTick() {
    this.factT++; const t = this.factT / 60;
    for (const a of this.all) if (a.active) { a.tgt = this.poseIdle(a); this.blend(a, 0.2); this.place(a); }
    const e = this.edge; if (this.factExit == null && this.factT > 6 && (this.factSkip || e.enter || e.throw || e.catch || e.jump || e.pass || e.pause || e.switch)) { this.factExit = t; for (const s of this.factSnd) this.sfx.stopH(s); this.qaLog('factSkip', { id: this.factCard.id, t: +t.toFixed(2) }); }
    this.edge = {};
    const r = FF.seek(this.factEl, this.factCard, t, { voSecs: this.factCard.voSecs, reduced: this.rm, exitAt: this.factExit });
    if (r.done) this.endFact();
  },
  endFact() {
    if (this.factEl) { this.factEl.remove(); this.factEl = null; }
    const prev = this.factPrev, after = this.factAfter; this.factAfter = null;
    if (after) return after();
    if (prev === 'brief' || prev === 'gameover') { this.phase = 'brief'; this.$.vs.classList.remove('live'); this.afterBrief(); }
    else this.phase = prev || 'play';
  },
  // ------------------------------------------------ the save moment: ONE readable callout sequence (Phase 1 fix: CAUGHT, SAVE! and CATCH! used to stack)
  calloutSeq(steps) {
    clearTimeout(this.seqTO); let i = 0;
    const run = () => { const s = steps[i++]; if (!s || this.phase !== 'play' && this.phase !== 'gameover') return; this.popBrush(s.t, s.sub, s.cls || '', 0.34, s.dur || 1.0); if (i < steps.length) this.seqTO = setTimeout(run, (s.next || 0.72) * 1000); };
    run();
  },
  // ------------------------------------------------ the result chip (casino-chip share card): own stats only, saves and double outs as the headline
  chipCanvas() {
    const S = 1080, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    const s = this.stats, win = !!(this.result && this.result.win), BB = '#0E0B16', GOLD = '#FFC93C', RED = '#E8173A', CREAM = '#F6E7C8';
    const AF = (w, px) => `${w} ${px}px Archivo, 'Arial Black', sans-serif`;
    c.fillStyle = BB; c.fillRect(0, 0, S, S);
    // the chip: red body, cream edge spots, gold inner ring, Boss Black center with the boss ball
    const cx = S / 2, cy = 400, R = 300;
    c.fillStyle = RED; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.fillStyle = CREAM; for (let i = 0; i < 8; i++) { c.save(); c.translate(cx, cy); c.rotate(i * Math.PI / 4 + Math.PI / 8); c.fillRect(-34, -R, 68, 58); c.restore(); }
    c.strokeStyle = BB; c.lineWidth = 10; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
    c.fillStyle = BB; c.beginPath(); c.arc(cx, cy, R - 78, 0, 7); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 8; c.setLineDash([22, 14]); c.beginPath(); c.arc(cx, cy, R - 92, 0, 7); c.stroke(); c.setLineDash([]);
    const ring = (text, r0, top) => { c.save(); c.translate(cx, cy); c.font = AF(900, 44); c.fillStyle = CREAM; c.textAlign = 'center'; c.textBaseline = 'middle'; const step = 0.105, a0 = (top ? -Math.PI / 2 : Math.PI / 2) - (text.length - 1) * step / 2 * (top ? 1 : -1);
      for (let i = 0; i < text.length; i++) { const a = a0 + i * step * (top ? 1 : -1); c.save(); c.rotate(a); c.translate(r0, 0); c.rotate(top ? Math.PI / 2 : -Math.PI / 2); c.fillText(text[i], 0, 0); c.restore(); } c.restore(); };
    if (this.chipBall && this.chipBall.complete && this.chipBall.naturalWidth) { const bw = 230, bh = bw * this.chipBall.naturalHeight / this.chipBall.naturalWidth; c.drawImage(this.chipBall, cx - bw / 2, cy - bh / 2 - 6, bw, bh); }
    ring('FINAL BOSS', R - 132, true); ring('VEGAS ARCADE', R - 132, false);
    // headline stats
    const stat = (x, n, lab) => { c.textAlign = 'center'; c.fillStyle = GOLD; c.font = AF(900, 150); c.fillText(String(n), x, 840); c.fillStyle = CREAM; c.font = AF(800, 40); c.fillText(lab, x, 892); };
    c.textBaseline = 'alphabetic'; stat(300, s.saves || 0, 'SAVES'); stat(780, s.doubles || 0, 'DOUBLE OUTS');
    c.fillStyle = GOLD; c.fillRect(538, 720, 4, 190);
    const W = this.wkMatch ? this.wkMatch.short : 'QUICK MATCH';
    c.fillStyle = CREAM; c.font = AF(800, 38); c.textAlign = 'center';
    c.fillText(`${win ? 'WIN' : 'LOSS'}  ${this.points[0]} to ${this.points[1]}  vs ${this.opp.name}`, cx, 966);
    c.fillStyle = '#CBBFA8'; c.font = AF(600, 30); c.fillText(`${W}   ${s.catches} catches   ${s.kos} outs   ${s.backIn} back in   ${this.score.toLocaleString('en-US')} pts`, cx, 1016);
    c.fillStyle = GOLD; c.font = AF(900, 34); c.textAlign = 'left'; c.fillText('BOSS RUSH', 40, 64); c.textAlign = 'right'; c.fillStyle = CREAM; c.font = AF(600, 26); c.fillText('my own match stats', S - 40, 60);
    return cv;
  },
  chipHTML() {
    if (!this.chipBall) { this.chipBall = new Image(); this.chipBall.src = this.base + 'assets/art/boss-ball-256.webp'; }
    return `<div class="fbg-chip-wrap"><img class="fbg-chipimg" alt="Your result chip: saves and double outs headline your match." width="1080" height="1080"><div class="fbg-chip-act"><a class="fbg-btn ghost fbg-chip-save" download="boss-rush-result.png" href="#">Save image</a><button class="fbg-btn ghost fbg-chip-share" type="button" hidden>Share</button></div></div>`;
  },
  bindChip() {
    const img = this.$.card.querySelector('.fbg-chipimg'); if (!img) return;
    const draw = () => { let cv; try { cv = this.chipCanvas(); } catch (e) { return; } try { img.src = cv.toDataURL('image/png'); } catch (e) { } const a = this.$.card.querySelector('.fbg-chip-save'); if (a) a.href = img.src; this.chipCv = cv;
      const sh = this.$.card.querySelector('.fbg-chip-share');
      if (sh && navigator.share && navigator.canShare && cv.toBlob) cv.toBlob(b => { if (!b) return; const f = new File([b], 'boss-rush-result.png', { type: 'image/png' }); try { if (navigator.canShare({ files: [f] })) { sh.hidden = false; sh.onclick = () => { navigator.share({ files: [f], title: 'Boss Rush' }).catch(() => { }); }; } } catch (e) { } }); };
    draw(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw); if (this.chipBall && !this.chipBall.complete) this.chipBall.onload = draw;
  },
  // ------------------------------------------------ the stands: allusion signs, opponent fans, the inflatable boss ball
  buildProps() {
    const L = new THREE.TextureLoader();
    const t = L.load(this.base + 'assets/art/boss-ball-256.webp'); t.colorSpace = THREE.SRGBColorSpace;
    this.bbSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, color: '#d8ccd0' })); this.bbSprite.renderOrder = 3; this.standsG.add(this.bbSprite); this.bbT = 0;
    const bt = L.load(this.base + 'assets/art/banner.webp'); bt.colorSpace = THREE.SRGBColorSpace;
    this.rafters = [-1, 1].map(s => { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, color: '#b8acb0' })); m.renderOrder = 3; m.rotation.x = -PITCH; this.standsG.add(m); m.userData.s = s; return m; });
  },
  layoutProps() {
    if (!this.rafters || !this.bd) return; const p = new THREE.Vector3(), v = this.view;
    for (const m of this.rafters) { const fx = m.userData.s * (v.wide ? 0.38 : 0.3); this.standPoint(fx, 0.17, p, 0.25); m.position.copy(p); const h = this.bd.BH * 0.3; m.scale.set(h * 0.34, h, 1); }
  },
  updateProps() {
    if (!this.bbSprite || !this.bd) return;
    // the inflatable boss ball crowd-surfs over the stands between games and rests on the rail during play
    const p = new THREE.Vector3(), live = this.phase === 'play';
    this.bbT += live ? 0.0006 : 0.0025; const fx = -0.42 + ((this.bbT % 1) * 0.84), hop = this.rm ? 0 : Math.abs(Math.sin(this.frame * (live ? 0.03 : 0.09))) * (live ? 0.02 : 0.07);
    this.standPoint(fx, 0.5 - hop, p, 0.35); this.bbSprite.position.copy(p); const s = this.bd.BH * (live ? 0.16 : 0.22); this.bbSprite.scale.set(s, s, 1);
    if (!this.rm) this.bbSprite.material.rotation = Math.sin(this.frame * 0.04) * 0.25;
  },
  drawStyledSign(sg, c, w, h) {
    // allusion signs in the brand's type (Archivo expanded black): Boss Cream on Boss Black, or Boss Black on Power-Up Gold; opponent fans in their colors
    const st = sg.def.style, W = this.opp.wk || GLITCHES_WK, opp = st === 'opp';
    let lines = opp ? [String(W.signs[sg.def.who === '*opp0' ? 0 : 1] || W.signs[0] || '').toUpperCase()] : sg.def.t.slice();
    const bg = st === 'gold' ? '#FFC93C' : (opp ? OPPC.dark : '#0E0B16'), ink = st === 'gold' ? '#0E0B16' : '#F6E7C8', edge = opp ? OPPC.sig : (st === 'gold' ? '#0E0B16' : '#FFC93C');
    c.fillStyle = '#3a2a1a'; c.fillRect(w / 2 - 7, 150, 14, 66);
    c.save(); c.translate(w / 2, 82); c.rotate(((sg.ph * 13) % 7 - 3) * 0.006);
    c.fillStyle = bg; c.fillRect(-124, -76, 248, 150); c.lineWidth = 7; c.strokeStyle = edge; c.strokeRect(-120, -72, 240, 142);
    try { c.fontStretch = 'expanded'; } catch (e) { }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ink;
    const F = (px) => `900 ${px}px Archivo, 'Arial Black', Impact, sans-serif`;
    if (lines.length === 1 && lines[0].indexOf(' ') > 0) { c.font = F(52); if (c.measureText(lines[0]).width > 220) { const ws = lines[0].split(' '); const k = Math.ceil(ws.length / 2); lines = [ws.slice(0, k).join(' '), ws.slice(k).join(' ')]; } }
    lines.forEach((ln, i) => { const fs = lines.length === 1 ? 58 : 44; c.font = F(fs); const tw = c.measureText(ln).width, sx = tw > 222 ? 222 / tw : 1; c.save(); c.translate(0, lines.length === 1 ? 2 : (i ? 26 : -22)); c.scale(sx, 1); c.fillText(ln, 0, 0); c.restore(); });
    try { c.fontStretch = 'normal'; } catch (e) { }
    c.restore();
  },
  rotateSigns() {
    // between games the crowd flips its allusion signs; the marquee alternates its two lines
    this.allI = (this.allI || 0) + 3;
    for (const sg of this.signs) { const m = /^\*a(\d)$/.exec(sg.def.who); if (m) sg.def.t = ALLUDE[(this.allI + +m[1]) % ALLUDE.length]; }
    this.staffK = (this.staffK || 0) + 1; if (this.staffK % 2 === 1) this.staffThanks();
    this.marqI = (this.marqI || 0) + 1; this.drawSigns(); this.drawBanner();
  },
});


Object.assign(Game.prototype, {
  // ------------------------------------------------ the Sin City Dodgeball staff (Gordon 10/27: "Gratitude is the attitude"). Officials on the court,
  // a thank-you wave between games, the Sunday finals bow, a fact card and the credits roll. Shirts are a generic staff look: no logos, no wordmarks.
  buildOfficials() {
    if (this.officials) return;
    const kit = kitFrom(['#141018', '#ff3fa1', '#ffc83d', '#7b34e6']);
    this.officials = STAFF_OFFICIALS.map((o, i) => {
      const a = new Athlete(this, { key: 'STAFF', num: '', look: o.look }, 0); a.drawKit(kit);
      { const pal = Object.assign(a.palette(kit), { shorts: '#141018', sock: '#141018', band: '#141018', shoe: '#141018', shoeT: '#ffc83d' }); for (const gg of a.geos) paintGeo(gg, pal); }   // dark trousers, plain staff look
      a.offIdx = i; a.role = 'official'; a.active = false;
      a.x = o.x; a.z = o.z; a.yaw = Math.atan2(-o.x * 0.35, -o.z); a.callT = 0; a.setExpr('happy'); a.staffName = o.name; return a;
    });
  },
  staffPose(a) {
    const p = a.blankPose(), t = ((this.frame || 0) + a.offIdx * 23) * 0.05;
    p.sh = [0.12, 0.12, 0.12, 0.12]; p.el = [-0.25, -0.25]; p.kn = [0.06, 0.06]; p.hp = [0, 0]; p.hipY = Math.sin(t) * 0.006; p.lean = 0.02; p.head = 0.02;
    if (this.staffBowT > 0) { const k = Math.min(1, Math.sin(Math.min(1, (150 - this.staffBowT) / 60) * Math.PI) * 1.2); p.lean = 0.9 * k; p.head = 0.3 * k; p.sh = [0.5, 0.15, 0.5, 0.15]; p.el = [-0.4, -0.4]; }
    else if (this.staffWaveT > 0) { const w = Math.sin(((this.frame || 0) + a.offIdx * 9) * 0.25); p.sh[2] = -2.7; p.sh[3] = 0.35 + w * 0.35; p.el[1] = -0.3; }
    else if (a.callT > 0) { p.sh[2] = -2.95; p.sh[3] = 0.12; p.el[1] = -0.05; }
    return p;
  },
  staffTick() {
    if (!this.officials) return;
    if (this.staffBowT > 0) this.staffBowT--; if (this.staffWaveT > 0) this.staffWaveT--;
    const show = this.phase !== 'title' || !this.picking;
    for (const a of this.officials) {
      if (a.callT > 0) a.callT--;
      if (!Number.isFinite(a.pose.hipY) || !Number.isFinite(a.pose.lean)) a.pose = a.blankPose();   // a NaN pose (no frame count yet) would hide the official for good
      a.root.visible = show; a.shadow.visible = show; a.tgt = this.staffPose(a); this.blend(a, this.rm ? 1 : 0.2); this.place(a);
    }
  },
  staffSignal(out) {
    // the nearest official calls the out (raises a hand), the way the staff run every court
    if (!this.officials || this.phase !== 'play') return;
    const o = this.officials.slice().sort((p, q) => Math.abs(p.x - out.x) - Math.abs(q.x - out.x))[0]; if (o) o.callT = 70;
  },
  staffThanks() {
    // between games: the crowd's allusion signs read THANK YOU STAFF!, the stands ripple left to right, the officials wave back
    if (!this.signs) return;
    for (const sg of this.signs) if (/^\*a\d$/.test(sg.def.who)) sg.def.t = ['THANK YOU', 'STAFF!'];
    if (!this.rm) this.signs.slice().sort((p, q) => (p.g ? p.g.position.x : 0) - (q.g ? q.g.position.x : 0)).forEach((sg, i) => setTimeout(() => { if (!this.dead) sg.wig = 1; }, i * 55));
    this.staffWaveT = 150; this.popBrush('THANK YOU, STAFF!', 'GRATITUDE IS THE ATTITUDE', 'gold', 0.3, 1.8);
    this.say('The crowd thanks the Sin City staff. Gratitude is the attitude.'); this.qaLog('staffThanks', {});
  },
  staffFinal() { const n = this.wkMatch; return !!(n && n.day === 'sun' && !n.comeback && n.step >= 3); },   // winners final and grand final
  staffWalkout() {
    // Sunday finals: the staff walk out first and take a bow. Skippable (any key, click or tap), still under reduced motion, no flashing
    if (this.staffWalkEl) return;
    const el = document.createElement('div'); el.className = 'fbg-staffwalk' + (this.rm ? ' still' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'The Sin City staff take a bow');
    el.innerHTML = `<img src="${assetURL(this.base, 'art/staff-group-' + (this.native ? '1344' : '672') + '.webp')}" alt="The Sin City Dodgeball staff, illustrated, smiling together"><div><b>THE SIN CITY STAFF</b><span>take a bow. Thank you for building this weekend for all of us.</span></div><button type="button" class="fbg-btn ghost fbg-staffskip">Skip</button>`;
    const done = () => { if (this.staffWalkEl !== el) return; this.staffWalkEl = null; el.classList.add('out'); setTimeout(() => el.remove(), this.rm ? 0 : 260); window.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') done(); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); done(); }); el.querySelector('.fbg-staffskip').addEventListener('click', done);
    window.addEventListener('keydown', key, true);
    this.$.stage.appendChild(el); this.staffWalkEl = el; this.staffBowT = 150; setTimeout(done, 3600);
    this.say('Sunday finals. The Sin City staff take a bow. Thank you for building this weekend for all of us.'); this.qaLog('staffWalkout', {});
  },
  showStaffCredits(back) {
    // the thank-you roll: all eight staff by name, Commissioner Jake Mason with his title
    const art = (k) => assetURL(this.base, 'art/' + k);
    const cards = STAFF_CREDITS.map((s, i) => `<li><img src="${art('staff-' + (i + 1) + '-160.webp')}" alt="${esc(s.alt)}" width="80" height="80"><b>${esc(s.name)}</b>${s.role ? `<span>${esc(s.role)}</span>` : ''}</li>`).join('');
    this.$.card.innerHTML = `<div class="fbg-credits${this.rm ? ' still' : ''}" role="group" aria-labelledby="fbg-cr-h">
      <h2 id="fbg-cr-h">THANK YOU, <em>STAFF!</em></h2>
      <div class="fbg-cr-view"><div class="fbg-cr-roll">
        <img class="fbg-cr-group" src="${art('staff-group-' + (this.native ? '1344' : '672') + '.webp')}" alt="The Sin City Dodgeball staff, illustrated, smiling together">
        <p class="fbg-cr-lead">They work so hard to make the event for all of us. This game says thank you.</p>
        <ul class="fbg-cr-list">${cards}</ul>
        <p class="fbg-cr-names">With thanks to ${esc(STAFF_NAMES.join(', '))} and the whole Sin City Dodgeball staff.</p>
        <p class="fbg-cr-end">Gratitude is the attitude.</p></div></div>
      <div class="fbg-row"><button class="fbg-btn fbg-go fbg-cr-done" type="button">DONE</button></div></div>`;
    const done = () => { if (back) back(); };
    this.$.card.querySelector('.fbg-cr-done').addEventListener('click', done);
    this.$.card.querySelector('.fbg-credits').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } });
    this.$.ov.hidden = false; this.$.card.querySelector('.fbg-cr-done').focus({ preventScroll: true }); this.qaLog('staffCredits', {});
  },
});

Object.assign(Game.prototype, {
  // ------------------------------------------------ the player you control (Gordon 10/26): a rainbow star on the floor with a gold arrow tip along your facing
  buildUserStar() {
    const S = 256, R0 = 98, r0 = 41;
    const star = (c, R, r) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); } c.closePath(); };
    const st = canvasTex(S, S, (c) => {
      c.clearRect(0, 0, S, S);
      star(c, R0 + 22, r0 + 14); c.fillStyle = '#0E0B16'; c.fill();   // dark outline (about 5 px at gameplay size) so it reads on maple and on green
      const g = c.createLinearGradient(S / 2, S / 2 - R0, S / 2, S / 2 + R0);
      ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787'].forEach((col, i) => { g.addColorStop(i / 5, col); });
      star(c, R0, r0); c.fillStyle = g; c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke();
    });
    const ar = canvasTex(128, 128, (c) => {
      c.clearRect(0, 0, 128, 128);
      const tri = () => { c.beginPath(); c.moveTo(64, 10); c.lineTo(112, 92); c.lineTo(80, 80); c.lineTo(80, 122); c.lineTo(48, 122); c.lineTo(48, 80); c.lineTo(16, 92); c.closePath(); };
      tri(); c.lineWidth = 16; c.lineJoin = 'round'; c.strokeStyle = '#0E0B16'; c.stroke(); tri(); c.fillStyle = '#FFC93C'; c.fill();
    });
    const mk = (tex) => { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.86 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; this.scene.add(m); return m; };
    this.uStar = mk(st); this.uArrow = mk(ar); this.uSpin = 0;
    for (const b of this.balls || []) b.shadow.renderOrder = 3;   // a ball's shadow always draws over the star
    if (this.lineStrips) for (const m of this.lineStrips) m.renderOrder = 3;   // so do the glowing boundary lines
  },
  updateUserStar() {
    if (!this.uStar) this.buildUserStar();
    const a = this.user, on = !!(a && a.role === 'in' && a.root.visible && this.phase !== 'title' && this.phase !== 'handshake');
    this.uStar.visible = this.uArrow.visible = on; if (!on) return;
    const s = 1.8 * a.scale;   // about 1.2x the old player ring
    if (!this.rm) this.uSpin += 0.25 * 2 * Math.PI / 60;   // a slow quarter turn per second, never a flash; static with reduced motion
    this.uStar.position.set(a.x, 0.021, a.z); this.uStar.scale.set(s, s, 1); this.uStar.rotation.set(-Math.PI / 2, 0, this.uSpin);
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), d = 0.62 * s, as = 0.62 * s;
    this.uArrow.position.set(a.x + fx * d, 0.022, a.z + fz * d); this.uArrow.scale.set(as, as, 1); this.uArrow.rotation.set(-Math.PI / 2, 0, a.yaw + Math.PI);
  },
});


Object.assign(Game.prototype, {

  // ------------------------------------------------ post-match: Coach Nina Fiore's card (dot's brief, Studio thread uids 849/850, 2026-10-26)
  // Every line comes from a recorded event or a recorded team total; nothing is inferred. Personal lines use only events whose actor
  // the human controlled (you); team totals are labeled as the team's. Event priority for the highlight: double out, save,
  // catch that brought a teammate back, other catch, out; ties go to the earliest event, then the lowest id.
  mev(kind, a, x) {
    if (!this.mlog) return null;
    const e = Object.assign({ id: ++this.mseq, kind, t: this.frame, game: this.gameNo || 1, actor: a ? a.name : '', num: a ? a.num : '', team: a ? a.team : 0, you: false }, x || {}); this.mlog.push(e); return e;
  },
  postCount(bump) {
    // completed matches, stored per browser; without storage the scouting note stays off (no reliable counter)
    let st = null; try { st = JSON.parse(localStorage.getItem(POST_KEY) || 'null') || { n: 0, scoutAt: 0 }; } catch (e) { st = null; }
    if (!st) { this._postMem = (this._postMem || 0) + (bump ? 1 : 0); return { n: this._postMem, scoutAt: 0, ok: false }; }
    if (bump) { st.n = (st.n || 0) + 1; try { localStorage.setItem(POST_KEY, JSON.stringify(st)); } catch (e) { } }
    st.ok = true; return st;
  },
  postSaveScout(n) { try { const st = JSON.parse(localStorage.getItem(POST_KEY) || 'null') || { n }; st.scoutAt = n; localStorage.setItem(POST_KEY, JSON.stringify(st)); } catch (e) { } },
  postTop(L) { const P = POST_PRI; return L.slice().sort((a, b) => (P[b.kind] || 0) - (P[a.kind] || 0) || a.t - b.t || a.id - b.id)[0] || null; },
  postSay(e) {
    // one recorded event, said plainly: who, what, which game. No replay, no intent, no "match-deciding".
    const g = 'Game ' + e.game + ': ', v = e.victims || [];
    if (e.kind === 'double') return g + 'your throw put ' + v.join(' and ') + ' out together.';
    if (e.kind === 'save') return g + 'you caught a deflection before the floor, so ' + ((e.saved || []).join(' and ') || 'your teammate') + ' stayed in' + (e.out ? ' and ' + e.out + ' was out.' : '.');
    if (e.kind === 'catchBack') return g + (e.out ? 'your catch put ' + e.out + ' out and brought ' : 'your catch brought ') + e.back + ' back in.';
    if (e.kind === 'catch') return g + (e.out ? 'your catch put ' + e.out + ' out.' : 'you made a catch.');
    return g + 'your throw put ' + (v[0] || 'a player') + ' out.';
  },
  buildPost(result) {
    const L = (this.mlog || []).slice(), mine = L.filter(e => e.you && e.team === 0), s = this.stats || {}, win = !!(result && result.win);
    const cnt = (k) => mine.filter(e => e.kind === k).length, plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const ids = new Set(L.map(e => e.id)); const dupFree = ids.size === L.length;
    const st = this.postCount(true), n = st.n;
    const welcome = win ? 'Great match. Here is what I saw.' : 'Good fight out there. Here is what I saw.';
    // one evidenced strength: personal first, then the team's recorded totals, then the no-data line
    const backs = cnt('catchBack'), saves = cnt('save'), dbl = cnt('double'), catches = backs + cnt('catch') + saves, outs = cnt('out') + dbl;
    let strength = '', basis = 'none';
    if (backs) { strength = 'You brought ' + (backs === 1 ? 'a teammate' : plural(backs, 'teammate', 'teammates')) + ' back in. That contribution matters.'; basis = 'you'; }
    else if (saves) { strength = 'You made ' + plural(saves, 'save', 'saves') + ' off a teammate\'s deflection. That kept people in the game.'; basis = 'you'; }
    else if (dbl) { strength = 'You put two players out with one throw' + (dbl > 1 ? ', ' + dbl + ' times' : '') + '.'; basis = 'you'; }
    else if (catches) { strength = 'Your ' + plural(catches, 'catch', 'catches') + ' count.'; basis = 'you'; }
    else if (outs) { strength = 'Your throws put ' + plural(outs, 'player', 'players') + ' out.'; basis = 'you'; }
    else if (s.backIn) { strength = 'Your team brought ' + plural(s.backIn, 'teammate', 'teammates') + ' back in. That contribution matters.'; basis = 'team'; }
    else if (s.catches) { strength = 'Your team made ' + plural(s.catches, 'catch', 'catches') + '.'; basis = 'team'; }
    else if (s.kos) { strength = 'Your team put ' + plural(s.kos, 'player', 'players') + ' out.'; basis = 'team'; }
    if (!strength) strength = 'One result doesn\'t define you. Let\'s focus on your next opportunity.';
    else if (!win) strength = 'A tough result, but ' + strength.replace(/ That contribution matters\.$/, '').replace(/^Your team /, 'your team ').replace(/^Your /, 'your ').replace(/^You /, 'you ').replace(/ count\.$/, ' still count.');
    // the highlight: a recorded personal event, or the team's recorded totals
    const top = this.postTop(mine);
    let hlHead = 'Your Match Highlight', hl = '';
    if (top) { hlHead = 'Your Play of the Match'; hl = this.postSay(top); }
    else {
      const parts = []; if (s.catches) parts.push(plural(s.catches, 'catch', 'catches')); if (s.backIn) parts.push(plural(s.backIn, 'teammate', 'teammates') + ' back in'); if (s.saves) parts.push(plural(s.saves, 'save', 'saves')); if (s.kos) parts.push(plural(s.kos, 'out', 'outs'));
      hl = parts.length ? 'Your team: ' + parts.join(', ') + '.' : 'No highlights were recorded this match. The next one is a fresh start.';
    }
    // one next step: the confirmed next opponent's authored tell and counter, or a rules-checked Fiore instruction
    let next = '', nextKind = 'fiore';
    const w = this.wkMatch ? this.wk : null, ni = w && !w.done ? this.wkInfo(w) : null, t = ni ? wkTeam(ni.opp) : null;
    if (t) {
      const ab = (t.ab || [])[0]; nextKind = 'scout';
      next = 'Next up: ' + t.name + '. ' + (ab && ab.tell && ab.counter ? 'Watch for ' + ab.name + ': ' + ab.tell + ' ' + ab.counter : (t.scout || ''));
    } else next = FIORE_STEPS[n % FIORE_STEPS.length];
    // Coach Fiore's playful scouting note: fiction only. Rule: from the 5th completed match on, 5 matches apart, a win with at least
    // 3 of your own recorded plays including a double out, a save or a catch that brought a teammate back.
    const exceptional = win && mine.length >= 3 && mine.some(e => e.kind === 'double' || e.kind === 'save' || e.kind === 'catchBack');
    const scout = !!(st.ok && n >= 5 && (!st.scoutAt || n - st.scoutAt >= 5) && exceptional && top);
    if (scout) this.postSaveScout(n);
    // Commissioner Jake Mason: every third completed match, never on a scouting moment
    const jake = !scout && n > 0 && n % 3 === 0;
    return { n, win, welcome, strength, basis, hlHead, hl, next, nextKind, scout, scoutText: scout ? 'Your own recorded plays: ' + [[saves, 'save', 'saves'], [backs, 'catch that brought a teammate back', 'catches that brought teammates back'], [dbl, 'double out', 'double outs'], [cnt('catch'), 'other catch', 'other catches'], [cnt('out'), 'out', 'outs']].filter(x => x[0]).map(x => plural(x[0], x[1], x[2])).join(', ') + '.' : '', scoutGoal: FIORE_STEPS[(n + 1) % FIORE_STEPS.length],
      jake, jakeLine: JAKE_LINES[Math.floor(n / 3) % JAKE_LINES.length], events: L.length, mine: mine.length, dupFree, top: top ? top.id : null, seen: false };
  },
  showPost() {
    const p = this.pm, art = (k) => assetURL(this.base, 'art/' + k);
    const jakeMedia = this.rm
      ? `<img class="fbg-jake-art" src="${art('commissioner-jake-480.webp')}" alt="Commissioner Jake Mason, illustrated, smiling with open palms" width="240" height="320">`
      : `<video class="fbg-jake-art" muted playsinline preload="auto" poster="${art('commissioner-jake-480.webp')}" width="240" height="320" aria-label="Commissioner Jake Mason, illustrated, does a small two-step, opens his palms in welcome and bows"><source src="${art('commissioner-jake-dance.webm')}" type="video/webm"><source src="${art('commissioner-jake-dance.mp4')}" type="video/mp4"></video>`;
    this.$.card.innerHTML = `<div class="fbg-post${this.rm ? ' still' : ''}" role="group" aria-labelledby="fbg-post-h">
      <div class="fbg-post-top"><img class="fbg-post-nina" src="${art('coach-nina-256.webp')}" alt="Coach Nina Fiore, illustrated" width="96" height="96">
        <div><p class="fbg-post-kick">COACH NINA FIORE</p><h2 id="fbg-post-h">${esc(p.welcome)}</h2></div></div>
      <div class="fbg-post-body" id="fbg-post-body">
        <section class="fbg-post-s fbg-post-str"><h3>What went well</h3><p>${esc(p.strength)}</p></section>
        <section class="fbg-post-s fbg-post-hl"><h3>${esc(p.hlHead)}</h3><p>${esc(p.hl)}</p></section>
        <section class="fbg-post-s fbg-post-next"><h3>${p.nextKind === 'scout' ? 'Your next step: the scout' : 'Your next step'}</h3><p>${esc(p.next)}</p></section>
        ${p.scout ? `<section class="fbg-post-s fbg-post-scout"><h3>Coach Fiore's Playful Scouting Note</h3><p class="fbg-post-disc">Fictional USA-level recognition, not official scouting, affiliation or selection.</p><p>${esc(p.scoutText)} That looked USA-level to me. Development goal: ${esc(p.scoutGoal)}</p></section>` : ''}
        ${p.jake ? `<section class="fbg-post-s fbg-post-jake">${jakeMedia}<div><h3>Commissioner Jake Mason</h3><p>${esc(p.jakeLine)}</p></div></section>` : ''}
      </div>
      <div class="fbg-row"><button class="fbg-btn fbg-go fbg-post-go" type="button" aria-describedby="fbg-post-h fbg-post-body">SEE RESULTS</button></div></div>`;
    this.$.card.classList.remove('is-wk');
    const go = () => { if (this.phase !== 'result' || !this.pm || this.pm.seen) return; this.pm.seen = true; this.showResults(); };
    this.$.card.querySelector('.fbg-post-go').addEventListener('click', go);
    this.$.card.querySelector('.fbg-post').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); go(); } });
    const v = this.$.card.querySelector('video.fbg-jake-art'); if (v) { v.addEventListener('ended', () => { const i = document.createElement('img'); i.className = 'fbg-jake-art'; i.src = art('commissioner-jake-480.webp'); i.alt = 'Commissioner Jake Mason, illustrated, smiling with open palms'; if (v.isConnected) v.replaceWith(i); });   // after the bow he settles on a face-forward still
      v.addEventListener('error', () => { const i = document.createElement('img'); i.className = 'fbg-jake-art'; i.src = art('commissioner-jake-480.webp'); i.alt = 'Commissioner Jake Mason, illustrated, smiling with open palms'; v.replaceWith(i); }, true);
      const play = () => { try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => { }); } catch (e) { } };
      // dot 10/27: on a phone or a short window the Jake row can sit below the fold of the card; start the bow only once it is in view
      if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some(x => x.isIntersecting && x.intersectionRatio >= 0.6)) { io.disconnect(); play(); } }, { root: this.$.card.querySelector('.fbg-post-body'), threshold: [0.6] }); io.observe(v); this._jakeIO = io; } else play(); }
    // when the sections scroll (small landscape phones), a soft fade at the bottom says there is more; it lifts at the end
    const bd = this.$.card.querySelector('.fbg-post-body'), more = () => bd.classList.toggle('more', bd.scrollTop + bd.clientHeight < bd.scrollHeight - 2);
    bd.addEventListener('scroll', more, { passive: true }); requestAnimationFrame(more); setTimeout(more, 2600);
    this.$.ov.hidden = false;
    const b = this.$.card.querySelector('.fbg-post-go'); if (b) b.focus({ preventScroll: true });
  },
  // ------------------------------------------------ Coach Nina Fiore's plays (FINAL BOSS, STRATEGY.md "Nina Fiore coaching note", 2026-10-26)
  ninaKey(foes) {
    // the key player: the best hands and the biggest arm on the floor (the star counts extra)
    return foes.slice().sort((p, q) => this.ninaThreat(q) - this.ninaThreat(p))[0];
  },
  ninaThreat(f) { const r = f.rt || FB_BASE; return r.catch + r.power + (f.boss ? 0.3 : 0) + (f.held ? 0.15 : 0); },
  ninaCatcher(f) { return ((f.rt || FB_BASE).catch) >= 0.7; },   // a known catcher
  ninaWidePair(foes) {
    // the corner (the player nearest a court corner) and the wing next to them; both must be dodgers, never known catchers
    const corner = foes.slice().sort((p, q) => (Math.abs(q.z) + Math.abs(q.x) * 0.6) - (Math.abs(p.z) + Math.abs(p.x) * 0.6))[0];
    if (!corner) return null;
    const wing = foes.filter(f => f !== corner && Math.hypot(f.x - corner.x, f.z - corner.z) < 2.8).sort((p, q) => Math.hypot(p.x - corner.x, p.z - corner.z) - Math.hypot(q.x - corner.x, q.z - corner.z))[0];
    if (!wing || this.ninaCatcher(corner) || this.ninaCatcher(wing)) return null;
    if ((corner.rt || FB_BASE).foot < 0.5 && (wing.rt || FB_BASE).foot < 0.5) return null;
    return [corner, wing];
  },
  ninaCall(t, M) {
    // one of Nina's plays per possession, now and then (visible and fun, never oppressive), only when it does not throw away ball control
    if (t !== 0 || this.phase !== 'play' || this.rushT < RULES.rushF || this.frame < (this.ninaCool || 0)) return false;
    this.ninaCool = this.frame + 240;
    if (Math.random() > 0.25) return false;
    const mine = this.balls.filter(b => b.holder && b.holder.team === t).length, theirs = this.balls.filter(b => b.holder && b.holder.team !== t).length;
    if (mine <= 2 && theirs >= 2) { this.awStat('ninaHeldForControl'); return false; }   // two throws would hand them every ball
    const foes = this.inPlayers(1 - t).filter(f => f.oob === 0); if (!foes.length) return false;
    const pair = this.ninaWidePair(foes), r = Math.random();
    const kind = pair && r < 0.22 ? 'xwide' : (r < 0.6 ? 'delay' : 'xone');
    return this.ninaPlan(kind, M, foes);
  },
  ninaPlan(kind, M, foes) {
    const t = M[0].team, now = this.frame, ready = M.filter(m => this.aiPlays(m) && m.held && m.held.cleared && m.oob === 0);
    if (ready.length < 2 || !foes.length) return false;
    const plan = (m, at, target) => { m.ai.plan = { k: 'sync', s: { at, target, team: t } }; m.ai.t = 0; m.ninaPlay = kind; };
    if (kind === 'delay') {
      // two balls on one key player: the first makes them move, the FOLLOW ball about 1 s later is thrown by the more ACCURATE thrower (not the fastest)
      const target = this.ninaKey(foes); const [a, b] = ready.slice(0, 2), follow = (a.rt || FB_BASE).acc >= (b.rt || FB_BASE).acc ? a : b, lead = follow === a ? b : a;
      plan(lead, now + 8, target); plan(follow, now + 8 + 60, target);
      this.ninaCalled = { kind, target, lead, follow, at: now };
    } else if (kind === 'xone') {
      // SMALL X on one player: left shoulder and right shoulder (or left and right shins), released AT THE SAME TIME, so even a catcher can take only one
      const target = this.ninaKey(foes), [a, b] = ready.slice(0, 2), h = Math.random() < 0.6 ? 1.3 : 0.3;
      for (const [m, side] of [[a, -1], [b, 1]]) { plan(m, now + 12, target); m.xAim = { h, side }; m.noLook = true; }
      // with 3 or 4 balls, the holders not throwing pump-fake with the release to hide who is throwing
      for (const m of ready.slice(2)) { m.ai.plan = { k: 'pumpAt', at: now + 12 + TUNE.wind - 2 }; m.ai.t = 0; }
      this.ninaCalled = { kind, target, throwers: [a, b], h, at: now };
    } else if (kind === 'xwide') {
      // the riskier wider X: the CORNER and the WING next to them, throws crossing; dodgers only, never known catchers; no-look
      const pair = this.ninaWidePair(foes); if (!pair) return false;
      const th = ready.slice(0, 2).sort((p, q) => p.z - q.z), tg = pair.slice().sort((p, q) => q.z - p.z);   // the thrower on one side throws at the target on the other: the paths cross
      th.forEach((m, i) => { plan(m, now + 12, tg[i]); m.noLook = true; });
      this.ninaCalled = { kind, targets: tg, throwers: th, at: now };
    } else return false;
    const label = { delay: 'DELAY', xone: 'SMALL X', xwide: 'WIDE X' }[kind];
    this.coachSay(label); this.awStat('nina_' + kind); this.qaLog('nina', { kind });
    return true;
  },
  // ---- the rush: plan who rushes and where the balls go; protect the balls in game 1; a one-ball play from game 2 only if our rushers were faster
  ninaRushStart() {
    this.rushFirst = [null, null]; this.rushOne = [null, null];
    this.rushPlay = [0, 1].map(t => this.gameNo > 1 && !this.ot && (this.rushWins || [0, 0])[t] > (this.rushWins || [0, 0])[1 - t]);
    if (this.rushPlay[0]) this.coachSay('ONE-BALL PLAY');
    this.qaLog('rushPlan', { play: this.rushPlay.slice(), wins: (this.rushWins || [0, 0]).slice(), game: this.gameNo });
  },
  ninaRushPick(a) {
    if (!this.rushFirst) return;
    a.rushCarry = true;
    if (this.rushFirst[a.team] == null) {
      this.rushFirst[a.team] = this.rushT;
      const o = this.rushFirst[1 - a.team]; if (o == null) { this.rushWins = this.rushWins || [0, 0]; this.rushWins[a.team]++; }   // first to a rush ball wins this rush
    }
    if (this.rushPlay && this.rushPlay[a.team] && !this.rushOne[a.team]) {
      const carriers = this.teams[a.team].filter(m => m.rushCarry && m.held && this.aiPlays(m));
      if (carriers.length >= 2 || this.rushT > 70) { const best = carriers.sort((p, q) => (q.rt || FB_BASE).power - (p.rt || FB_BASE).power)[0]; if (best) { this.rushOne[a.team] = best; best.rushThrow = true; } }
    }
  },
  ninaHold(a, it) {
    // a rushed ball goes back behind the attack line to the corners (Nina); the one-ball thrower answers right off the rush; everyone else holds
    if (!a.rushCarry) return null;
    const b = a.held;
    if (a.rushThrow && b.cleared) {
      a.rushThrow = false; a.rushCarry = false;
      const foes = this.inPlayers(1 - a.team).filter(f => f.oob === 0), tg = foes.length ? this.ninaKey(foes) : null;
      if (tg) { a.ai.plan = { k: 'sync', s: { at: this.frame + 2, target: tg, team: a.team } }; a.ai.t = 0; a.ninaPlay = 'rush'; this.awStat('rushOneBall'); if (a.team !== 0) this.pop(a, 'RUSH PLAY!', 'small lime sh1'); return null; }
    }
    if (a.rushThrow) return this.seek(a, it, a.side * (ATK + 1.0), Math.max(-(HZ - 0.8), Math.min(HZ - 0.8, a.z)), true);
    const cz = (a.z === 0 ? (a.team === 0 ? -1 : 1) : Math.sign(a.z)) * (HZ - 0.9), cx = a.side * (HX - 1.2);
    if (Math.hypot(a.x - cx, a.z - cz) < 0.7 || (this.rushT >= RULES.rushF && a.ai.t > 240)) { a.rushCarry = false; a.ai.plan = { k: 'hold', until: a.ai.t + 50 }; this.awStat('rushToCorner'); return null; }
    return this.seek(a, it, cx, cz, true);
  },
});

function drawPalm(c, w, h) {
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  c.lineCap = 'round';
  c.lineWidth = 22; c.beginPath(); c.moveTo(w * 0.5, h); c.bezierCurveTo(w * 0.52, h * 0.7, w * 0.62, h * 0.45, w * 0.58, h * 0.2); c.stroke();
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI * 0.95 + i / 12 * Math.PI * 0.9 + (i % 2) * 0.08; const L = 200 + (i % 3) * 30;
    const x0 = w * 0.58, y0 = h * 0.2;
    c.save(); c.translate(x0, y0); c.rotate(a);
    c.beginPath(); c.moveTo(0, 0);
    for (let j = 0; j <= 12; j++) { const t = j / 12; const x = t * L, y = Math.sin(t * Math.PI) * -18 + t * t * 60; const wd = (1 - t) * 26 + 4; c.lineTo(x, y - wd * (j % 2 ? 1 : 0.4)); }
    for (let j = 12; j >= 0; j--) { const t = j / 12; const x = t * L, y = Math.sin(t * Math.PI) * -18 + t * t * 60; const wd = (1 - t) * 22 + 3; c.lineTo(x, y + wd * (j % 2 ? 1 : 0.4)); }
    c.closePath(); c.fill(); c.restore();
  }
  c.beginPath(); c.arc(w * 0.58, h * 0.2, 22, 0, 7); c.fill();
}
function exprFor(a, g) {
  const s = a.state;
  if (s === 'ko' || a.role === 'gone' || a.role === 'outline') return s === 'ko' || a.role === 'gone' ? 'ko' : 'neutral';
  if (s === 'hitstun' || s === 'knock' || s === 'down' || s === 'drop') return 'ouch';
  if (s === 'catch' || s === 'block' || (g.phase === 'result' && g.result && (a.team === 0) === !!g.result.win)) return 'happy';
  if (s === 'windup' || s === 'pwind' || s === 'release' || s === 'prel' || s === 'run') return 'focus';
  if (s === 'catchready' || s === 'duck' || s === 'bobble') return 'shout';
  return 'neutral';
}
function drawBulbText(c, t, x, y, maxW, size) {
  // marquee letters made of glowing bulbs
  const off = document.createElement('canvas'); off.width = c.canvas.width; off.height = c.canvas.height; const o = off.getContext('2d');
  o.font = font(size); o.textAlign = 'center'; o.textBaseline = 'middle'; const tw = o.measureText(t).width; const sx = Math.min(1, maxW / tw);
  o.save(); o.translate(x, y); o.scale(sx, 1); o.fillStyle = '#fff'; o.fillText(t, 0, 0); o.restore();
  c.save(); c.translate(x, y); c.scale(sx, 1); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font(size);
  c.fillStyle = '#ffb347'; c.globalAlpha = 0.85; c.fillText(t, 0, 0); c.globalAlpha = 1; c.restore();
  const d = o.getImageData(0, 0, off.width, off.height).data, step = 9;
  c.shadowColor = '#ffc83d'; c.shadowBlur = 10;
  for (let yy = 4; yy < off.height; yy += step) for (let xx = 4; xx < off.width; xx += step) { if (d[(yy * off.width + xx) * 4 + 3] > 140) { c.fillStyle = (xx + yy) % 27 === 0 ? '#ffffff' : '#fff2c8'; c.beginPath(); c.arc(xx, yy, 4.1, 0, 7); c.fill(); } }
  c.shadowBlur = 0;
}
function pipsHTML(n, max) { let s = ''; for (let i = 0; i < max; i++) s += `<i class="${i < n ? '' : 'off'}"></i>`; return s; }
function fmtClock(c) { const m = Math.floor(c / 60), s = c % 60; return m + ':' + String(s).padStart(2, '0'); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- public API
let G = null;
const API = {
  version: '2.0.0',
  mount(el, opts) { if (G) G.destroy(); G = new Game(typeof el === 'string' ? document.querySelector(el) : el, opts); return API; },
  setLook(look) { if (!G || G.dead || !look) return; G.applyLook(look); },
  setMode(m) { if (!G || G.dead) return; G.applyMode(m); },
  setSquad(names, control) { if (!G || G.dead) return; const k = rosterKey(control) || rosterKey((names || [])[0]); if (k) { G.controlKey = k; if (G.phase === 'title') { G.resetMatch(); G.showTitle(); } } },
  setPlayer(name) { API.setSquad(null, name); },
  start() { if (G && !G.dead) G.start(); },
  pause() { if (G) G.pause(); },
  resume() { if (G) G.resume(); },
  sound(on) { if (G) G.toggleSound(!!on); },
  state() { return G ? (G.dead ? { phase: 'unavailable', paused: true } : G.snapshot()) : null; },
  roster: ROSTER.map(r => ({ name: r.key, num: r.num })),
  rules: RULES,
  court: { HX, HZ, ATK, width: COURT_W },
  stage(name) { return G && !G.dead ? G.stage(name) : false; },
  destroy() { if (G) { G.destroy(); G = null; } },
  _game() { return G; },
  qa() { return G ? G.qa.slice() : []; },
  weekend() { if (G && !G.dead) { G.showBracket(); return true; } return false; },
  fact() { if (!G || G.dead || G.phase === 'fact') return false; G.preloadFact(); G.startFact(); return true; },
  opponent(id) { if (!G || G.dead) return false; G.wkMatch = null; G.setOpponent(id ? wkTeam(id) : null); return G.opp.name; },
};
window.FBGame = API;
window.__bossrush = { state: () => API.state(), start: () => API.start(), stage: (n) => API.stage(n) };
window.dispatchEvent(new CustomEvent('fbgame:ready', { detail: API }));
export default API;
