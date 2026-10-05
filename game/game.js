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
const HX = 9, HZ = 4.5;            // court half extents (18 x 9 m)
const OUTX = 10.25;                // back outfield lane x
const SIDEZ = 5.35;                // side outfield lane z
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
  { key: 'ZABOKRITSKY', num: '2', skin: '#f0c7a6', hair: '#b8873f', style: 'pony', build: 0.95 },
  { key: 'HAWKINS', num: '3', skin: '#c58c66', hair: '#2a1b12', style: 'short', build: 1.0 },
  { key: 'BELLAMY', num: '4', skin: '#6a4029', hair: '#1b1210', style: 'crop', build: 1.12, shots: ['comet', 'moon'] },
  { key: 'BELLAMY III', num: '5', skin: '#8a5a3c', hair: '#17100c', style: 'short', build: 1.04 },
  { key: 'REED', num: '6', skin: '#e9b997', hair: '#5a3a22', style: 'short', build: 0.98 },
  { key: 'KRAMER', num: '31', skin: '#eec3a0', hair: '#6b4a2a', style: 'short', build: 1.03 },
  { key: 'KETCHUM', num: '83', skin: '#d6a07a', hair: '#24170f', style: 'short', build: 1.02 },
];
const SHOTS_BY = { FIORE: ['hook', 'hop'], ZABOKRITSKY: ['hook', 'moon'], HAWKINS: ['comet', 'hop'], 'BELLAMY III': ['hook', 'hop'], REED: ['comet', 'moon'], KRAMER: ['comet', 'hop'], KETCHUM: ['hook', 'moon'] };
const BOSS_TEAM = {
  name: 'THE GLITCHES',
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
const DEFAULT_LOOK = { id: 'fb01', name: 'Chosen Family', mode: 'fb', colors: ['#14523f', '#2ab3b8', '#f3e6c8', '#c9a24a'] };
const ATK = 3;                     // attack lines, 3 m from center
const RULES = { match: 180, ot: 60, mercy: 8, control: 15, oob: 10, back: 5, timeout: 30, balls: 5, rushF: 300 };
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
  { t: ['GO FIORE', '#1'], who: 'FIORE' }, { t: ['ZABOKRITSKY', '2!'], who: 'ZABOKRITSKY' }, { t: ['HAWKINS 3', 'HYPE'], who: 'HAWKINS' },
  { t: ['BELLAMY 4', 'FINAL BOSS'], who: 'BELLAMY' }, { t: ['BELLAMY III', '#5'], who: 'BELLAMY III' }, { t: ['REED 6', 'ALL DAY'], who: 'REED' },
  { t: ['KRAMER 31', 'ARM CANNON'], who: 'KRAMER' }, { t: ['KETCHUM 83', 'GOLDEN BOY'], who: 'KETCHUM' }, { t: ['NO STING', 'ALL HEART'], who: '*go' }, { t: ['PHASE TWO!'], who: '*p2' },
];
const CREST_FB = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z" fill="var(--fbg-tb)" stroke="#ffc83d" stroke-width="3"/><path d="M13 30V17l6 6 5-9 5 9 6-6v13z" fill="#ffc83d" stroke="#3a1a00" stroke-width="1.5"/></svg>';
const CREST_GL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6h36v20c0 9-8 15-18 18C14 41 6 35 6 26z" fill="#17131f" stroke="#a6f23a" stroke-width="3"/><g fill="#a6f23a"><rect x="16" y="13" width="16" height="4"/><rect x="13" y="17" width="22" height="8"/><rect x="16" y="25" width="16" height="4"/><rect x="18" y="29" width="3" height="4"/><rect x="27" y="29" width="3" height="4"/></g><g fill="#17131f"><rect x="16" y="19" width="5" height="4"/><rect x="27" y="19" width="5" height="4"/></g></svg>';
const SHOT_NAME = { comet: 'COMET!', hook: 'HOOK!', hop: 'HOP-SCOTCH!', moon: 'MOONBALL!', zig: 'GLITCH CURVE!' };

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
  if (contrast(num, base) < 2.6) num = others.slice().sort((a, b) => contrast(b, base) - contrast(a, base))[0];
  let trim = c[1]; if (contrast(trim, base) < 1.4) trim = c[3];
  let shorts = c[1]; if (contrast(shorts, base) < 1.3) shorts = c[3];
  let accent = c[2]; if (contrast(accent, base) < 1.3) accent = c[3];
  const outline = lum(base) > 0.5 ? shade(trim, -0.35) : '#120818';
  return { base, trim, num, shorts, accent, extra: c[3], outline, all: c };
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redraw = (fn) => { fn(ctx, w, h); t.needsUpdate = true; };
  return t;
}
const DISP = "700 {s}px Teko, 'Arial Narrow', Impact, sans-serif";
function font(s) { return DISP.replace('{s}', s); }
function drawJersey(ctx, w, h, kit, name, num, boss) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = kit.base; ctx.fillRect(0, 0, w, h);
  // subtle sublimated texture: diagonal pinstripes
  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = lum(kit.base) > 0.5 ? '#000' : '#fff'; ctx.lineWidth = 3;
  for (let x = -h; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke(); }
  ctx.restore();
  // side panels at u=0.25 and 0.75
  ctx.fillStyle = kit.trim;
  for (const cx of [w * 0.25, w * 0.75]) { ctx.fillRect(cx - 22, 0, 44, h); }
  ctx.fillStyle = kit.accent;
  for (const cx of [w * 0.25, w * 0.75]) { ctx.fillRect(cx - 4, 0, 8, h); }
  // collar and hem
  ctx.fillStyle = kit.trim; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = kit.accent; ctx.fillRect(0, 14, w, 4); ctx.fillRect(0, h - 20, w, 4);
  // back: nameplate (arched, auto-fit) and big number, centered at u = 0.5
  const cx = w * 0.5;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const nm = name.toUpperCase();
  let fs = 46; ctx.font = font(fs);
  const maxW = w * 0.34;
  let tw = ctx.measureText(nm).width;
  const sx = tw > maxW ? maxW / tw : 1;
  // arc the letters
  const arc = Math.min(0.5, nm.length * 0.035);
  ctx.save(); ctx.translate(cx, 64);
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
  fs = num.length > 2 ? 120 : 150; ctx.font = font(fs);
  let nw = ctx.measureText(num).width; const nsx = nw > w * 0.3 ? (w * 0.3) / nw : 1;
  ctx.save(); ctx.translate(cx, h - 34); ctx.scale(nsx, 1);
  ctx.lineWidth = 12; ctx.strokeStyle = kit.outline; ctx.strokeText(num, 0, 0);
  ctx.lineWidth = 5; ctx.strokeStyle = kit.accent; ctx.strokeText(num, 0, 0);
  ctx.fillStyle = kit.num; ctx.fillText(num, 0, 0);
  ctx.restore();
  // front (u = 0 and 1): small number plus crown mark
  ctx.font = font(72);
  for (const fx of [0, w]) {
    ctx.lineWidth = 7; ctx.strokeStyle = kit.outline; ctx.strokeText(num, fx, h - 46);
    ctx.fillStyle = kit.num; ctx.fillText(num, fx, h - 46);
    crown(ctx, fx, 64, 22, kit.accent, kit.outline);
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
function ringTex() {
  return canvasTex(128, 128, (c, w, h) => { c.strokeStyle = '#fff'; c.lineWidth = 10; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke(); });
}
function ballTex() {
  return canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#e0262b'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 2.2; c.fillStyle = Math.random() < 0.5 ? 'rgba(120,0,10,.35)' : 'rgba(255,140,140,.25)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(80,0,20,.55)'; c.fillRect(0, h / 2 - 3, w, 6);
    c.fillStyle = '#ffc83d'; c.fillRect(w * 0.18, h / 2 - 16, 36, 8);
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
  ZABOKRITSKY: { g: 'f', hs: 'bun', hc: '#c99a52', skin: '#f0c7a6', ht: 0.97, bw: 0.9, eye: '#3d6a8a' },
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
function rimify(m) {
  m.onBeforeCompile = (s) => {
    s.uniforms.rimColor = RIM_U.color; s.uniforms.rimStrength = RIM_U.strength;
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
  HG.shorts = lathe([[0.001, 0.12], [0.27, 0.12], [0.3, 0.0], [0.315, -0.12], [0.001, -0.12]], 40);
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
  c.save(); c.translate(cx, 124); c.scale(1.62, 1.62); c.translate(-cx, -124);
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
    this.g = game; this.def = def; this.team = team; this.name = def.key; this.num = def.num;
    this.boss = !!def.isBoss;
    const L = Object.assign({ g: 'm', hs: 'cap', hc: '#2a1a10', skin: def.skin || '#d9a07a', ht: 1, bw: 1 }, APPEAR[def.key] || {});
    if (def.skin && !APPEAR[def.key]) L.skin = def.skin;
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
      torso: rimify(new THREE.MeshStandardMaterial({ map: this.jerseyTex, vertexColors: true, roughness: 0.72, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.35, 0.35) })),
      head: rimify(new THREE.MeshStandardMaterial({ map: this.faceTex, vertexColors: true, roughness: 0.55 })),
      limb: game.limbMat,
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
    for (const s of [-1, 1]) P(L1, G.sph, { pos: [s * 0.31 * bw * sh, 0.55, 0], scl: [0.15, 0.12, 0.14], key: 'sleeve' });
    mk(L1, this.mats.torso, this.torso);
    // head with face canvas, hair, ears, nose, band or glasses
    this.headG = new THREE.Group(); this.headG.position.y = 0.72; this.torso.add(this.headG);
    L1 = []; P(L1, G.head, { pos: [0, 0.22, 0], scl: [1, 1.06, 1], key: 'white', uv: 'own' });
    for (const s of [-1, 1]) P(L1, G.sphLo, { pos: [s * 0.265, 0.2, -0.01], scl: [0.028, 0.06, 0.045], key: 'skin' });
    P(L1, G.sphLo, { pos: [0, 0.175, 0.272], scl: [0.03, 0.034, 0.03], key: 'skinD' });
    this.hairParts(L1, L.hs, fem);
    if (team === 1) { P(L1, G.box, { pos: [0, 0.245, 0.235], scl: [0.46, 0.085, 0.07], key: 'glass' }); for (const s of [-1, 1]) P(L1, G.box, { pos: [s * 0.075, 0.245, 0.272], scl: [0.12, 0.06, 0.012], key: 'lens' }); }
    else if (L.hs !== 'cap') P(L1, G.cyl, { pos: [0, 0.385, -0.02], rot: [-0.18, 0, 0], scl: [0.262, 0.05, 0.27], key: 'band' });
    if (this.boss) P(L1, G.crown, { pos: [0, 0.52, 0], scl: [0.2, 0.17, 0.2], key: 'gold' });
    mk(L1, this.mats.head, this.headG, FACE_WHITE_UV);
    if (L.hs === 'pony') { const pl = []; P(pl, G.cap1, { pos: [0, -0.13, 0], scl: [0.07, 0.15, 0.06], key: 'hair' }); P(pl, G.cyl, { pos: [0, 0.0, 0], scl: [0.045, 0.04, 0.045], key: 'band' }); const pg = new THREE.Group(); pg.position.set(0, 0.36, -0.26); this.headG.add(pg); mk(pl, this.mats.limb, pg); this.pony = pg; }
    if (this.boss) {
      const cmat = new THREE.MeshStandardMaterial({ color: '#7b2ad6', roughness: 0.5, side: THREE.DoubleSide, emissive: '#2a0a4a' });
      const cg = new THREE.PlaneGeometry(0.7, 1.0, 4, 8); const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + (0.5 - y) * 0.6; p.setX(i, p.getX(i) * k); p.setZ(i, -Math.pow(p.getX(i) * 1.3, 2) * 0.3 - (0.5 - y) * 0.08); } cg.translate(0, -0.5, 0); cg.computeVertexNormals();
      this.cape = new THREE.Mesh(cg, cmat); this.cape.position.set(0, 0.64, -0.24); this.cape.rotation.x = 0.15; this.cape.castShadow = true; this.torso.add(this.cape);
    }
    // arms
    this.arm = [];
    for (const s of [-1, 1]) {
      const shg = new THREE.Group(); shg.position.set(s * 0.36 * bw * sh, 0.53, 0); this.torso.add(shg);
      L1 = []; P(L1, G.cylT, { pos: [0, -0.05, 0], scl: [0.122, 0.15, 0.118], key: 'sleeve' }); P(L1, G.cyl, { pos: [0, -0.125, 0], scl: [0.11, 0.022, 0.106], key: 'trim' });
      const am = (fem ? 0.9 : 1.08) * Math.sqrt(bw); P(L1, G.cap1, { pos: [0, -0.18, 0], scl: [0.09 * am, 0.12, 0.09 * am], key: 'skin' }); P(L1, G.sph, { pos: [0, -0.17, 0.03], scl: [0.085 * am, 0.105, 0.085 * am], key: 'skin' });
      mk(L1, this.mats.limb, shg);
      const el = new THREE.Group(); el.position.y = -0.31; shg.add(el);
      const fm = (fem ? 0.92 : 1.06) * Math.sqrt(bw); L1 = []; P(L1, G.cap1, { pos: [0, -0.12, 0], scl: [0.076 * fm, 0.1, 0.076 * fm], key: 'skin' }); P(L1, G.sph, { pos: [0, -0.06, 0.01], scl: [0.084 * fm, 0.095, 0.082 * fm], key: 'skin' });
      P(L1, G.cyl, { pos: [0, -0.235, 0], scl: [0.082, 0.07, 0.082], key: 'band' });
      P(L1, G.sph, { pos: [0, -0.31, 0.005], scl: [0.072, 0.085, 0.05], key: 'skin' }); P(L1, G.sph, { pos: [0, -0.385, 0.012], scl: [0.066, 0.055, 0.045], key: 'skin' });
      P(L1, G.sphLo, { pos: [s * -0.0, -0.3, 0.06], scl: [0.03, 0.05, 0.03], key: 'skin' });
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
    const base = { skin: L.skin, skinD: shade(L.skin, -0.12), hair: L.hc, white: '#ffffff', gold: '#ffc83d' };
    if (this.team === 1) return Object.assign(base, { sleeve: '#17131f', trim: '#a6f23a', shorts: '#0e0b14', sock: '#17131f', band: '#a6f23a', shoe: '#a6f23a', shoeT: '#17131f', sole: '#101010', pad: '#101010', glass: '#a6f23a', lens: '#0c1418' });
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
    this.lane = null; this.knock = null; this.happyT = 0;
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
const LOCKED = new Set(['windup', 'release', 'recover', 'catch', 'bobble', 'hitstun', 'knock', 'down', 'getup', 'ko', 'tired', 'squat', 'land', 'walkin', 'drop', 'pwind', 'prel', 'prec', 'block']);

// ---------------------------------------------------------------- audio
class Sfx {
  constructor() { this.on = false; this.ctx = null; }
  enable(v) { this.on = v; if (v && !this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); this.noiseBuf = this.makeNoise(); } catch (e) { this.on = false; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  makeNoise() { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.5, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
    if (!this.on || !this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, f0, f1, q = 1, vol = 0.3, delay = 0, type = 'bandpass') {
    if (!this.on || !this.ctx) return; const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  throw(p) { this.noise(p ? 0.45 : 0.22, p ? 500 : 900, p ? 4000 : 2400, 2, p ? 0.5 : 0.3); if (p) this.tone('sawtooth', 220, 880, 0.4, 0.08); }
  hit(p) { this.tone('sine', p ? 150 : 190, 45, p ? 0.35 : 0.2, 0.7); this.noise(0.12, 1800, 300, 0.8, 0.5); }
  catch() { this.tone('square', 660, 990, 0.08, 0.18); this.tone('square', 990, 1320, 0.1, 0.14, 0.06); this.noise(0.06, 3000, 2000, 1, 0.25); }
  bobble() { this.tone('triangle', 500, 300, 0.15, 0.2); }
  crowd(big) { this.noise(big ? 1.4 : 0.9, 600, 1400, 0.4, big ? 0.35 : 0.2); }
  step() { this.tone('sine', 120, 80, 0.04, 0.12); }
  ko() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.15, i * 0.07)); }
  buzz() { this.tone('square', 140, 120, 0.7, 0.18); }
  tick() { this.tone('square', 1400, 1400, 0.03, 0.06); }
  stinger() { [392, 494, 587, 784].forEach((f, i) => this.tone('sawtooth', f, f * 1.01, 0.16, 0.08, i * 0.09)); }
}

// ---------------------------------------------------------------- the game
class Game {
  constructor(el, opts) {
    this.opts = Object.assign({ mode: 'fb', difficulty: 'normal', sound: false, look: null, control: 'BELLAMY', basePath: BASE }, opts || {});
    this.base = this.opts.basePath;
    this.el = el;
    this.rm = this.opts.reducedMotion != null ? !!this.opts.reducedMotion : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.level = AI_LEVEL[this.opts.difficulty] || AI_LEVEL.normal;
    this.look = this.opts.look || DEFAULT_LOOK; this.mode = this.opts.mode === 'vc' ? 'vc' : 'fb';
    this.controlKey = rosterKey(this.opts.player) || rosterKey(this.opts.control) || 'BELLAMY';
    this.squad = ROSTER.map(r => r.key);
    this.sfx = new Sfx();
    this.keys = {}; this.edge = {}; this.lastTap = { dir: 0, f: -99 };
    this.touch = { mx: 0, mz: 0, run: false, btn: {} };
    this.frame = 0; this.phase = 'title'; this.paused = false; this.visible = true; this.hitstop = 0;
    this.shakeAmp = 0; this.shakeF = 0; this.shakeMax = 1; this.fever = false;
    this.fx = []; this.queue = [[], []]; this.rushT = 999;
    this.stats = { hits: 0, catches: 0, power: 0, kos: 0, bestCombo: 0, headshots: 0, backIn: 0, blocks: 0 };
    this.buildDOM();
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
    <div class="fbg-team l"><div class="fbg-tname"><span class="fbg-crest">${CREST_FB}</span><span>FINAL BOSS</span></div><div class="fbg-live" data-t="0"></div><div class="fbg-q" data-t="0"></div></div>
    <div class="fbg-mid"><div class="fbg-games"><b class="fbg-g0">0</b><div class="fbg-clock">3:00</div><b class="fbg-g1">0</b></div><div class="fbg-sub">GAME 1</div><div class="fbg-score">0</div></div>
    <div class="fbg-team r"><div class="fbg-tname"><span>THE GLITCHES</span><span class="fbg-crest g">${CREST_GL}</span></div><div class="fbg-live" data-t="1"></div><div class="fbg-q" data-t="1"></div></div>
  </div>
  <div class="fbg-ctl" hidden></div>
  <div class="fbg-bossbar"><span>GLITCH KING</span><i></i></div>
  <div class="fbg-meter"><b>STEPS</b><div class="fbg-steps"></div></div>
  <div class="fbg-btns"><button class="fbg-btn ghost fbg-qual" type="button">Quality: Auto</button><button class="fbg-btn ghost fbg-sound" type="button" aria-pressed="false">Sound off</button><button class="fbg-btn ghost fbg-pause" type="button">Time out</button></div>
  <div class="fbg-vs" hidden></div>
  <div class="fbg-poster"><p>Boss Rush needs WebGL. This is a still from the game.</p></div>
  <div class="fbg-sr" aria-live="polite"></div>
</div>
<div class="fbg-touch" aria-label="Touch controls">
  <div class="fbg-stickzone"><div class="fbg-stick"><div class="fbg-knob"></div></div></div>
  <div class="fbg-tbtns">
    <button class="fbg-tb catch" data-b="catch" type="button">CATCH</button>
    <button class="fbg-tb throw" data-b="throw" type="button">THROW</button>
    <button class="fbg-tb" data-b="pass" type="button">PASS</button>
    <button class="fbg-tb" data-b="jump" type="button">JUMP</button>
  </div>
</div>
<div class="fbg-ov" hidden><div class="fbg-card"></div></div>`;
    this.el.appendChild(r);
    const q = (s) => r.querySelector(s);
    this.$ = { stage: q('.fbg-stage'), canvas: q('.fbg-canvas'), world: q('.fbg-world'), flash: q('.fbg-flash'), clock: q('.fbg-clock'), score: q('.fbg-score'),
      looknm: q('.fbg-looknm') || document.createElement('div'), chip: q('.fbg-chip'), l0: q('.fbg-live[data-t="0"]'), l1: q('.fbg-live[data-t="1"]'), q0: q('.fbg-q[data-t="0"]'), q1: q('.fbg-q[data-t="1"]'),
      g0: q('.fbg-g0'), g1: q('.fbg-g1'), sub: q('.fbg-sub'), ctl: q('.fbg-ctl'), boss: q('.fbg-bossbar'), bossI: q('.fbg-bossbar i'),
      meter: q('.fbg-meter'), steps: q('.fbg-steps'), vs: q('.fbg-vs'), ov: q('.fbg-ov'), card: q('.fbg-card'), sound: q('.fbg-sound'), qual: q('.fbg-qual'), pause: q('.fbg-pause'), sr: q('.fbg-sr'),
      poster: q('.fbg-poster'), touch: q('.fbg-touch'), knob: q('.fbg-knob'), stick: q('.fbg-stick') };
    this.$.poster.style.backgroundImage = `url(${assetURL(this.base, 'poster.jpg')})`;
    for (let i = 1; i <= 9; i++) { const c = document.createElement('i'); this.$.steps.appendChild(c); }
    if (this.rm) r.classList.add('rm');
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse || this.opts.touch) r.classList.add('has-touch');
    this.$.sound.addEventListener('click', () => this.toggleSound());
    this.$.qual.addEventListener('click', () => { const order = ['auto', 'ultra', 'high', 'med', 'low']; this.setQuality(order[(order.indexOf(this.qMode) + 1) % 5]); });
    this.$.pause.addEventListener('click', () => { if (this.phase === 'title' || this.phase === 'result') return; this.paused ? this.resume() : this.pause(); });
  }
  toggleSound(v) {
    const on = v != null ? v : !this.sfx.on; this.sfx.enable(on);
    this.$.sound.setAttribute('aria-pressed', String(on)); this.$.sound.textContent = on ? 'Sound on' : 'Sound off';
    const b = this.$.card.querySelector('.fbg-snd'); if (b) b.textContent = on ? 'Sound on' : 'Sound off';
  }

  initGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.$.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!this.renderer.getContext()) throw new Error('no gl');
    } catch (e) { this.root.classList.add('no-webgl'); this.dead = true; return false; }
    const R = this.renderer;
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 220);
    this.view = { cx: 0, d: 20, tz: -1.8, fov: 34, wide: true, punch: 0, px: 0, pz: 0 };
    this.limbMat = rimify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }));
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    this.qMode = this.opts.quality || 'auto';
    this.tier = this.qMode === 'auto' ? (coarse ? 'high' : 'ultra') : this.qMode;
    this.frameMs = 16; this.qFrames = 0; this.qDrops = 0;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.root);
    this.io = new IntersectionObserver((es) => { for (const e of es) this.visible = e.isIntersecting; if (!this.visible && this.phase === 'play' && !this.paused) this.pause(true); }, { threshold: 0.05 });
    this.io.observe(this.root);
    this.$.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.root.classList.add('no-webgl'); });
    return true;
  }
  resize() {
    const w = this.root.clientWidth;
    const narrow = w < 700;
    this.root.classList.toggle('is-narrow', narrow); this.root.classList.toggle('is-wide', !narrow);
    const st = this.$.stage; const W = st.clientWidth, H = st.clientHeight; if (!W || !H) return;
    this.W = W; this.H = H;
    this.applyTier(true);
    const aspect = W / H, v = this.view;
    v.wide = aspect >= 1.25;
    v.fov = v.wide ? 27 : 40;
    const halfW = v.wide ? 10.6 : 8.2;
    v.d = halfW / (Math.tan(v.fov / 2 * DEG) * aspect);
    v.tz = v.wide ? -2.3 : -1.4;
    this.camera.fov = v.fov; this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.pxPerUnit = H / (2 * v.d * Math.tan(v.fov / 2 * DEG));
    this.placeBackdrop();
    if (this.layoutStands) this.layoutStands();
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), this.floorMat); floor.position.z = 1.5; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; S.add(floor); this.floor = floor;
    this.courtTex = canvasTex(2080, 1200, () => { });
    this.courtMat = new THREE.MeshStandardMaterial({ map: this.courtTex, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
    const court = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), this.courtMat); court.rotation.x = -Math.PI / 2; court.position.y = 0.003; court.receiveShadow = true; S.add(court); this.court = court;
    // pool caustics (Miami night): two scrolling layers, additive
    this.causticTex = causticTexture(); this.causticTex.wrapS = this.causticTex.wrapT = THREE.RepeatWrapping;
    this.caustics = [0, 1].map(i => { const t = this.causticTex.clone(); t.needsUpdate = true; t.repeat.set(5 + i * 1.3, 3 + i * 0.8); const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.28, color: '#bff8ff' })); m.rotation.x = -Math.PI / 2; m.position.y = 0.005 + i * 0.001; m.renderOrder = 1; m.visible = false; S.add(m); return m; });
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
    this.crowdT = { value: 0 }; this.crowdAmp = { value: 1 };
    this.bdMat = new THREE.MeshBasicMaterial({ map: this.bdTex.fb, color: '#d8ccd0' });
    this.bdMat.onBeforeCompile = (s) => {
      s.uniforms.uT = this.crowdT; s.uniforms.uAmp = this.crowdAmp;
      s.fragmentShader = 'uniform float uT; uniform float uAmp;\n' + s.fragmentShader.replace('#include <map_fragment>',
        `vec2 cuv = vMapUv; float band = step(0.36, 1.0 - cuv.y) * step(1.0 - cuv.y, 0.95);
         float col = floor(cuv.x * 220.0); float h = fract(sin(col * 12.9898) * 43758.5453);
         cuv.y += band * uAmp * 0.006 * max(0.0, sin(uT * (6.0 + h * 5.0) + h * 30.0));
         vec4 sampledDiffuseColor = texture2D(map, cuv); diffuseColor *= sampledDiffuseColor;`);
    };
    this.backdrop = new THREE.Mesh(GEO.plane, this.bdMat); S.add(this.backdrop);
    // light shafts and haze in front of the stands
    const shaftTex = canvasTex(128, 512, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(w * 0.42, 0); c.lineTo(w * 0.58, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill(); });
    this.shafts = [];
    for (const [x, r] of [[-9, 0.35], [-3, 0.1], [3, -0.1], [9, -0.35]]) { const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd6a0', opacity: 0.1 })); m.scale.set(4.5, 7, 1); m.position.set(x, 3.6, -7.3); m.rotation.set(-PITCH, 0, r); m.renderOrder = 3; S.add(m); this.shafts.push(m); }
    this.hazeTex = radialTex([[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    this.haze = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.hazeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb070', opacity: 0.12 })); this.haze.scale.set(40, 5, 1); this.haze.position.set(0, 1.2, -7.4); this.haze.rotation.x = -PITCH; this.haze.renderOrder = 3; S.add(this.haze);
    // LED ribbon boards along the far edge
    this.ribbonTex = canvasTex(2048, 64, () => { });
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
    this.tex = { star: starTex(), sparkle: sparkleTex(), ring: ringTex(), speed: speedTex(), glow: radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 64), dust: radialTex([[0, 'rgba(255,240,220,0.9)'], [1, 'rgba(255,240,220,0)']], 64) };
    this.spritePool = [];
    for (let i = 0; i < 180; i++) { const m = new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 5; S.add(s); this.spritePool.push(s); }
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
      const line = '#fbf6ee';
      c.strokeStyle = line; c.lineWidth = 9; c.strokeRect(cx0, cz0, cw, ch);
      c.beginPath(); c.moveTo(X(0), cz0); c.lineTo(X(0), cz0 + ch); c.stroke();
      c.lineWidth = 9;
      for (const ax of [-ATK, ATK]) { c.strokeStyle = vc ? (ax < 0 ? '#ff6fc0' : '#7ff3ff') : (ax < 0 ? tb : '#a6f23a'); c.beginPath(); c.moveTo(X(ax), cz0); c.lineTo(X(ax), cz0 + ch); c.stroke(); }
      c.save(); c.font = font(0.34 * P); c.textAlign = 'center';
      for (const ax of [-ATK, ATK]) { c.fillStyle = vc ? '#ffffff' : (ax < 0 ? tb : '#5a8a1a'); c.save(); c.translate(X(ax) + (ax < 0 ? -14 : 14), Z(HZ) - 0.6 * P); c.rotate(-Math.PI / 2); c.fillText('ATTACK', 0, 0); c.restore(); }
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
    this.bdMat.map = this.bdTex[this.mode]; this.bdMat.color.set(vc ? '#e6dcef' : '#d8ccd0'); this.bdMat.needsUpdate = true;
    this.scene.background = new THREE.Color(vc ? '#0a0618' : '#0b0608');
    this.palms.forEach(p => p.visible = false);
    this.floorMat.map = vc ? this.waterTex : this.mapleTex; this.floorMat.color.set(vc ? '#ffffff' : '#ffcf98'); this.floorMat.roughness = vc ? 0.18 : 0.32; this.floorMat.needsUpdate = true;
    this.caustics.forEach(c => c.visible = vc);
    this.hemi.color.set(vc ? '#d8b8ff' : '#ffe2c4'); this.hemi.groundColor.set(vc ? '#1a4a6a' : '#3a1e14'); this.hemi.intensity = vc ? 1.35 : 1.5;
    this.key.color.set(vc ? '#ffe6f4' : '#fff0dc'); this.key.intensity = vc ? 2.4 : 2.8;
    this.rimL.color.set(vc ? '#ff3fa1' : '#ff7a3a'); this.rimR.color.set(vc ? '#3ff0ff' : '#9a6bff');
    RIM_U.color.value.set(vc ? '#ff6fd0' : '#ffb070');
    this.pools.forEach((p, i) => p.material.color.set(vc ? (i % 2 ? '#ff8cc2' : '#7ff3ff') : '#ffe6c8'));
    this.streaks.forEach((s, i) => s.material.color.set(vc ? (i % 2 ? '#ff6fd0' : '#6ff3ff') : '#ffd9a0'));
    this.shafts.forEach(s => s.material.color.set(vc ? '#c48cff' : '#ffd6a0'));
    this.haze.material.color.set(vc ? '#b06cff' : '#ffb070');
    this.glossMat.uniforms.tint.value.set(vc ? '#e0f6ff' : '#ffe8d0'); this.glossMat.uniforms.strength.value = vc ? 0.5 : 0.38;
    this.glowMat.opacity = vc ? 0.75 : 0.45;
    if (this.kit) { this.paintCourt(); this.paintRibbon(); }
    if (this.drawBanner) this.drawBanner();
  }
  bindInput() {
    const map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', j: 'throw', J: 'throw', ' ': 'throw', k: 'catch', K: 'catch', l: 'jump', L: 'jump', Shift: 'pass', q: 'switch', Q: 'switch', Escape: 'pause', p: 'pause', P: 'pause', Enter: 'enter', '1': 'rock', '2': 'paper', '3': 'scissors' };
    this.onKeyDown = (e) => {
      const k = map[e.key]; if (!k) return;
      const inGame = this.phase !== 'title' && this.phase !== 'result';
      const focusOK = this.root.contains(document.activeElement) || document.activeElement === document.body;
      if (!this.visible || !focusOK) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!inGame) { if (k === 'enter' && this.phase === 'title' && document.activeElement === this.$.stage) { this.start(); e.preventDefault(); } return; }
      if (k === 'pause') { this.paused ? this.resume() : this.pause(); e.preventDefault(); return; }
      if (this.paused) return;
      e.preventDefault();
      if (!this.keys[k]) {
        this.edge[k] = true;
        if (k === 'left' || k === 'right') {
          const dir = k === 'left' ? -1 : 1;
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
    zone.addEventListener('pointerdown', (e) => { sid = e.pointerId; zone.setPointerCapture(sid); const r = this.$.stick.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; move(e); e.preventDefault(); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
    const up = (e) => { if (e.pointerId !== sid) return; sid = null; this.touch.mx = 0; this.touch.mz = 0; this.touch.run = false; this.$.knob.style.transform = ''; };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    this.root.querySelectorAll('.fbg-tb').forEach(b => {
      const k = b.dataset.b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.touch.btn[k] = true; this.edge[k] = true; b.classList.add('on'); if (this.phase === 'title') return; });
      const off = () => { this.touch.btn[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('contextmenu', e => e.preventDefault());
    });
    this.$.stage.addEventListener('pointerdown', () => { this.$.stage.focus({ preventScroll: true }); });
  }
  userIntent() {
    const k = this.keys, t = this.touch, e = this.edge;
    let mx = (k.right ? 1 : 0) - (k.left ? 1 : 0) + t.mx;
    let mz = (k.down ? 1 : 0) - (k.up ? 1 : 0) + t.mz;
    mx = Math.max(-1, Math.min(1, mx)); mz = Math.max(-1, Math.min(1, mz));
    const it = { mx, mz, dash: e.dash || 0, holdRun: (k.left || k.right || t.run), throw: !!e.throw, catch: !!e.catch, catchHeld: !!(k.catch || t.btn.catch), jump: !!e.jump, pass: !!e.pass, sw: !!e.switch };
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
      default: P = this.poseIdle(a);
    }
    a.setExpr(exprFor(a, this));
    a.tgt = P; this.blend(a, k); this.place(a);
  }
  bp(a) { return a.blankPose(); }
  poseIdle(a) { const p = this.bp(a); const t = (this.frame + a.num.length * 17) * 0.09; if (a.role !== 'in') { p.hipY = -0.02; p.kn = [0.25, 0.25]; p.hp = [-0.12, -0.12]; p.sh = [-0.5, 0.2, -0.5, 0.2]; p.el = [-1.0, -1.0]; return p; } p.hipY = Math.sin(t) * 0.02 - 0.13; p.kn = [0.95, 0.95]; p.hp = [-0.62, -0.62]; p.spread = [0.2, 0.2]; p.lean = 0.42 + Math.sin(t) * 0.025; p.sh = [-0.85, 0.38, -0.85, 0.38]; p.el = [-0.95, -0.95]; p.head = -0.25 + Math.sin(t * 0.5) * 0.05; return p; }
  poseHold(a) { const p = this.poseIdle(a); p.sh[2] = -0.9; p.sh[3] = 0.35; p.el[1] = -1.5; p.twist = -0.15; return p; }
  poseWalk(a) { const p = this.bp(a); const ph = a.st * 0.32 + (a.num.length); const s = Math.sin(ph); p.hp = [s * 0.55 - 0.1, -s * 0.55 - 0.1]; p.kn = [Math.max(0, -Math.cos(ph)) * 0.8 + 0.15, Math.max(0, Math.cos(ph)) * 0.8 + 0.15]; p.sh = [-s * 0.5 - 0.1, 0.15, s * 0.5 - 0.1, 0.15]; p.el = [-0.7, -0.7]; p.hipY = Math.abs(Math.cos(ph)) * 0.04 - 0.02; p.lean = 0.14; if (a.hasBall) { p.sh[2] = -0.9; p.el[1] = -1.5; } return p; }
  poseRun(a) { const p = this.bp(a); const ph = (a.runF / TUNE.stepF) * Math.PI; const s = Math.sin(ph); p.hp = [s * 1.0 - 0.25, -s * 1.0 - 0.25]; p.kn = [Math.max(0, -Math.cos(ph)) * 1.5 + 0.3, Math.max(0, Math.cos(ph)) * 1.5 + 0.3]; p.sh = [-s * 1.1, 0.12, s * 1.1, 0.12]; p.el = [-1.5, -1.5]; p.hipY = Math.abs(Math.sin(ph)) * 0.08 - 0.05; p.lean = 0.42; p.sq = 1 + Math.abs(Math.cos(ph)) * 0.04; if (a.hasBall) { p.sh[2] = -0.7 + s * 0.3; p.el[1] = -1.7; } return p; }
  poseSquat(a, f = 1) { const p = this.bp(a); p.hipY = -0.2 * f; p.kn = [1.3 * f, 1.3 * f]; p.hp = [-0.9 * f, -0.9 * f]; p.lean = 0.45 * f; p.sh = [0.5 * f, 0.2, 0.5 * f, 0.2]; p.sq = 1 - 0.14 * f; if (a.cheer) { p.sh = [-2.8, 0.3, -2.8, 0.3]; } return p; }
  poseAir(a) { const p = this.bp(a); const up = a.vh > 0; p.kn = up ? [0.4, 1.4] : [1.2, 0.6]; p.hp = up ? [-0.3, -1.0] : [-0.9, -0.3]; p.sh = [-2.4, 0.4, -2.4, 0.4]; p.el = [-0.4, -0.4]; p.lean = 0.1; p.sq = up ? 1.12 : 1.04; if (a.hasBall) { p.sh = [-1.2, 0.3, 2.6, 0.2]; p.el = [-0.5, -1.2]; p.twist = -0.6; } if (a.state === 'air' && a.airF > 26) p.sq = 1; if (a.boss && this.phase === 'p2intro') { p.sh = [-1.4, 1.2, -1.4, 1.2]; } return p; }
  poseWind(a, power) {
    const p = this.bp(a); const n = power ? TUNE.pWind : TUNE.wind; const f = Math.min(1, a.st / n);
    const e = 1 - Math.pow(1 - f, 3);
    if (a.passing) { p.sh = [-0.9 * e, 0.2, -0.9 * e, -0.2]; p.el = [-0.9, -0.9]; p.lean = 0.05; p.kn = [0.3, 0.3]; return p; }
    p.twist = -0.9 * e * (power ? 1.25 : 1); p.lean = -0.18 * e - (power ? 0.12 : 0); p.side = -0.08 * e;
    p.sh = [-1.3 * e, 0.3, 2.5 * e + (power ? 0.4 : 0), 0.35]; p.el = [-0.3, -1.4 * e];
    p.hp = [-0.6 * e, 0.35 * e]; p.kn = [0.3, 0.75 * e]; p.hipY = -0.08 * e; p.sq = 1 - 0.07 * e;
    if (a.state === 'air' || a.h > 0) { p.hp = [-0.8, -0.2]; p.kn = [1.0, 0.6]; }
    return p;
  }
  poseRelease(a, power) { const p = this.bp(a); if (a.passing) { p.sh = [-1.6, 0.1, -1.6, -0.1]; p.el = [-0.2, -0.2]; p.lean = 0.25; return p; } p.twist = 0.85; p.lean = 0.45; p.sh = [0.6, 0.3, -1.9, 0.15]; p.el = [-0.6, -0.15]; p.hp = [0.35, -0.85]; p.kn = [0.7, 0.2]; p.hipY = -0.05; p.sq = power ? 1.12 : 1.07; return p; }
  poseRecover(a) { const p = this.bp(a); const f = Math.min(1, a.st / 10); p.twist = 0.9 * (1 - f) + 0.1; p.lean = 0.45 * (1 - f) + 0.12; p.sh = [0.3, 0.3, -0.9 + 0.5 * f, -0.4 * (1 - f)]; p.el = [-0.8, -0.6]; p.hp = [0.25 * (1 - f), -0.6 * (1 - f)]; p.kn = [0.5, 0.3]; return p; }
  poseCatchReady(a) { const p = this.bp(a); p.sh = [-1.45, 0.45, -1.45, 0.45]; p.el = [-0.35, -0.35]; p.kn = [0.6, 0.6]; p.hp = [-0.4, -0.4]; p.lean = 0.28; p.hipY = -0.07; p.head = 0.15; return p; }
  poseCatch(a) { const p = this.bp(a); const f = Math.min(1, a.st / 5); p.sh = [-0.85, -0.1, -0.85, -0.1]; p.el = [-1.9, -1.9]; p.lean = -0.3 * (1 - f) + 0.1; p.kn = [0.7, 0.7]; p.hp = [-0.3, -0.3]; p.sq = a.st < 3 ? 0.88 : 1; p.hipY = -0.05; return p; }
  poseBobble(a) { const p = this.bp(a); const w = Math.sin(a.st * 0.9); p.sh = [-1.9 + w * 0.6, 0.4, -1.9 - w * 0.6, 0.4]; p.el = [-0.6, -0.6]; p.lean = -0.1; p.head = -0.25; p.kn = [0.5, 0.5]; return p; }
  poseDuck(a) { const p = this.bp(a); p.hipY = -0.42; p.kn = [1.9, 1.9]; p.hp = [-1.4, -1.4]; p.lean = 0.75; p.sh = [-2.4, 0.6, -2.4, 0.6]; p.el = [-1.9, -1.9]; p.head = 0.4; return p; }
  poseHit(a) { const p = this.bp(a); const f = Math.min(1, a.st / 10); p.lean = -0.55 * (1 - f * 0.6); p.head = -0.5 * (1 - f); p.sh = [-1.6, 0.9, -1.4, 0.9]; p.el = [-0.3, -0.5]; p.kn = [0.5, 0.2]; p.hp = [0.25, -0.3]; p.sq = a.st < 3 ? 0.9 : 1; return p; }
  poseKnock(a) { const p = this.bp(a); p.lean = -1.0; p.roll = -Math.min(1.45, a.st * 0.09); p.sh = [-2.6, 1.1, -2.2, 1.0]; p.el = [-0.2, -0.3]; p.hp = [-0.8, 0.2]; p.kn = [0.9, 0.3]; p.head = -0.4; return p; }
  poseDown(a) { const p = this.bp(a); p.roll = -1.5; p.lean = 0; p.sh = [-2.9, 1.0, -2.9, 1.1]; p.el = [-0.2, -0.2]; p.hp = [-0.1, 0.1]; p.kn = [0.2, 0.4]; p.hipY = -0.62; const b = a.st < 8 ? Math.sin(a.st / 8 * Math.PI) * 0.12 : 0; p.hipY += b; return p; }
  poseGetup(a) { const p = this.bp(a); const f = Math.min(1, a.st / 16); p.roll = -1.5 * (1 - f); p.hipY = -0.62 * (1 - f) - 0.1 * Math.sin(f * Math.PI); p.lean = 0.6 * Math.sin(f * Math.PI); p.kn = [1.4 * (1 - f) + 0.3, 1.2 * (1 - f) + 0.3]; p.hp = [-1.1 * (1 - f), -0.8 * (1 - f)]; p.sh = [0.3, 0.3, 0.3, 0.3]; return p; }
  poseTired(a) { const p = this.bp(a); const t = a.st * 0.18; p.lean = 0.7 + Math.sin(t) * 0.06; p.hipY = -0.12; p.kn = [0.55, 0.55]; p.hp = [-0.5, -0.5]; p.sh = [-0.55, 0.05, -0.55, 0.05]; p.el = [-0.2, -0.2]; p.head = 0.15 + Math.sin(t) * 0.08; if (a.st % 16 === 0) this.sweat(a); return p; }
  poseKO(a) { const p = this.bp(a); p.sh = [-2.2, 1.3, -2.2, 1.3]; p.el = [-0.3, -0.3]; p.kn = [0.6, 0.2]; p.hp = [-0.2, 0.2]; p.lean = -0.2; p.flip = a.st * 0.12; return p; }
  poseBench(a) { const p = this.bp(a); const t = (this.frame + a.num.length * 23) * 0.06; p.hipY = -0.16; p.kn = [0.7, 0.7]; p.hp = [-0.6, -0.6]; p.lean = 0.45; p.sh = [-0.7, 0.1, -0.7, 0.1]; p.el = [-0.5, -0.5]; p.head = -0.2 + Math.sin(t) * 0.05; return p; }
  blend(a, k) {
    const c = a.pose, t = a.tgt;
    for (const key of ['lean', 'twist', 'side', 'head', 'hipY', 'sq', 'roll', 'flip']) c[key] += (t[key] - c[key]) * k;
    for (let i = 0; i < 4; i++) c.sh[i] += (t.sh[i] - c.sh[i]) * k;
    for (let i = 0; i < 2; i++) { c.el[i] += (t.el[i] - c.el[i]) * k; c.hp[i] += (t.hp[i] - c.hp[i]) * k; c.kn[i] += (t.kn[i] - c.kn[i]) * k; }
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
  updateFX() {
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
  aura(a) { for (let i = 0; i < 3; i++) this.spawnSprite({ tex: this.tex.glow, x: a.x, y: a.h + 1.1, z: a.z, s: 1.8 + i, s1: 3.2 + i, life: 14 + i * 4, color: a.team === 0 ? '#ffc83d' : '#a6f23a', alpha: 0.45 }); }
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
    this.bannerTex = [canvasTex(1024, 192, () => { }), canvasTex(1024, 192, () => { })];
    this.neonTex = canvasTex(1024, 300, () => { });
    this.bannerMat = new THREE.MeshBasicMaterial({ map: this.bannerTex[0], transparent: true, depthWrite: false });
    this.banner = new THREE.Mesh(GEO.plane, this.bannerMat); this.banner.rotation.x = -PITCH; this.banner.renderOrder = 3; this.standsG.add(this.banner);
    this.signs = SIGNS.map((s, i) => {
      const tex = canvasTex(256, 216, () => { });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const g = new THREE.Group(); const m = new THREE.Mesh(GEO.plane, mat); m.position.y = -0.18; g.add(m); g.rotation.x = -PITCH;
      this.standsG.add(g);
      return { def: s, tex, mat, g, m, ph: i * 1.7 + 0.3, sp: 1.6 + (i % 3) * 0.35, wig: 0, bx: 0, by: 0 };
    });
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
        drawBulbText(c, 'SIN CITY CLASSIC', w / 2, h / 2 + 8, w - 170, 128);
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
        const t1 = 'Sin City'; const s1 = Math.min(1, 760 / c.measureText(t1).width);
        neon((m) => { c.save(); c.translate(w / 2, 118); c.scale(s1, 1); c.rotate(-0.04); c.strokeText(t1, 0, 0); c.restore(); }, '#ff3fa1');
        c.font = font(86); const t2 = 'C L A S S I C'; const s2 = Math.min(1, 620 / c.measureText(t2).width);
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
    const spots = [[-0.4, 0.8], [-0.315, 0.86], [-0.23, 0.8], [-0.15, 0.87], [-0.065, 0.86], [0.02, 0.87], [0.105, 0.86], [0.19, 0.87], [0.27, 0.8], [0.355, 0.86]];
    const phoneSet = [3, 0, 1, 8, 7, 4, 6];
    const narrowSpots = [[-0.27, 0.84], [-0.18, 0.87], [-0.09, 0.84], [0.0, 0.87], [0.09, 0.84], [0.18, 0.87], [0.27, 0.84]];
    const sc = v.wide ? 0.95 : 1.15;
    const show = v.wide ? this.signs.map((_, i) => i) : phoneSet;
    this.signs.forEach((sg, i) => {
      const k = show.indexOf(i); sg.g.visible = k >= 0; if (k < 0) return;
      const sp = v.wide ? spots[i] : narrowSpots[k];
      this.standPoint(sp[0], sp[1], p, 0.15); sg.bx = p.x; sg.by = p.y;
      sg.m.scale.set(1.78 * sc, 1.5 * sc, 1);
      sg.g.position.copy(p);
    });
  }
  cheer(name) { if (!this.signs) return; for (const sg of this.signs) if (sg.def.who === name) sg.wig = 1; }
  updateStands() {
    if (!this.standsG) return;
    const v = this.view;
    const t = this.frame / 60, rm = this.rm;
    if (this.mode !== 'vc') { if (!rm && this.frame % 14 === 0) { this.bannerPh = 1 - (this.bannerPh || 0); this.bannerMat.map = this.bannerTex[this.bannerPh]; } }
    else this.bannerMat.opacity = rm ? 1 : (Math.sin(t * 37) > 0.985 ? 0.55 : 1);
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
      const b = { id: i, mesh, mat, glow, shadow };
      this.resetBall(b); this.balls.push(b);
    }
  }
  resetBall(b) {
    Object.assign(b, { state: 'rest', x: 0, z: 0, h: 0.22, vx: 0, vz: 0, vh: 0, holder: null, thrower: null, team: -1, live: false, crossed: false, cleared: true, rushTeam: -1,
      type: 'normal', power: false, age: 0, hitSet: new Set(), target: null, pending: null, squash: 0, spin: b.spin || 0, trailC: '#ffffff', bounces: 0, claim: null, outF: 0, flash: 0, grav: 0, fromSide: 0, deflected: false, defSide: 0, forceHead: false, restF: 0 });
  }
  buildTeams() {
    const k0 = kitFrom(DEFAULT_LOOK.colors), k1 = kitFrom(BOSS_TEAM.colors);
    this.kit1 = k1;
    this.all = []; this.teams = [[], []];
    for (const def of ROSTER) { const a = new Athlete(this, def, 0); a.drawKit(k0); this.teams[0].push(a); this.all.push(a); }
    for (const def of BOSS_TEAM.players) { const a = new Athlete(this, def, 1); a.drawKit(k1); this.teams[1].push(a); this.all.push(a); }
    const b = new Athlete(this, Object.assign({ isBoss: true }, BOSS_TEAM.boss), 1); b.drawKit(k1); this.boss = b; this.teams[1].splice(3, 0, b); this.all.push(b);
    this.ringTex = canvasTex(128, 128, (c) => { c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.arc(64, 64, 50, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 0.25; c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 46, 0, Math.PI * 2); c.fill(); });
    for (const a of this.all) {
      const t = document.createElement('div'); t.className = 'fbg-tag t' + a.team; t.innerHTML = `<div class="fbg-you" hidden>YOU</div><div class="fbg-note" hidden></div>`;
      this.$.world.appendChild(t); a.tag = t; a.tagYou = t.querySelector('.fbg-you'); a.tagNote = t.querySelector('.fbg-note');
      const ring = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc83d', opacity: 0.9 }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false; this.scene.add(ring); a.ring = ring;
    }
  }
  inPlayers(team) { return this.teams[team].filter(a => a.active && a.role === 'in'); }
  liveCount(team) { return this.teams[team].filter(a => a.role === 'in' || a.role === 'returning').length; }

  // ------------------------------------------------ match flow
  resetMatch() {
    this.clock = RULES.match; this.points = [0, 0]; this.gameNo = 0; this.ot = false; this.otClock = RULES.ot; this.sudden = false; this.over = false;
    this.score = 0; this.combo = 0; this.stats = { hits: 0, catches: 0, power: 0, kos: 0, bestCombo: 0, headshots: 0, backIn: 0, blocks: 0 };
    this.timeoutUsed = false; this.timeoutT = 0; this.result = null; this.lastBig = -1;
    this.setupGame();
    this.updateHUD(true);
  }
  setupGame() {
    this.gameNo++; this.p2 = false; this.ctlTeam = -1; this.ctlT = 0; this.lastCtlSec = -1; this.gameEndT = 0; this.rushT = 999; this.falseStart = false;
    this.$.boss.classList.remove('on'); this.$.ctl.hidden = true;
    this.queue = [[], []];
    for (const t of [0, 1]) {
      const ps = this.teams[t];
      ps.forEach((a, i) => {
        a.reset(); a.active = true; a.root.visible = true; a.shadow.visible = true; a.role = 'in';
        a.x = a.side * (HX - 0.45); a.z = -HZ + 0.6 + i * ((2 * HZ - 1.2) / (ps.length - 1));
        a.ai.home = [a.side * (3.8 + (i % 3) * 1.7), Math.max(-3.9, Math.min(3.9, a.z * 0.95))];
        a.yaw = a.team === 0 ? 100 * DEG : -100 * DEG;
      });
    }
    for (const b of this.balls) { this.resetBall(b); b.mesh.visible = true; }
    this.user = this.teams[0].find(a => a.name === this.controlKey) || this.teams[0][3];
    this.renderLive();
  }
  placeRushBalls(w) {
    const z0 = w === 0 ? [1.0, 2.3, 3.6] : [1.7, 3.3];
    const z1 = w === 1 ? [-1.0, -2.3, -3.6] : [-1.7, -3.3];
    let i = 0;
    for (const z of z0) { const b = this.balls[i++]; this.resetBall(b); b.z = z; b.rushTeam = 0; }
    for (const z of z1) { const b = this.balls[i++]; this.resetBall(b); b.z = z; b.rushTeam = 1; }
  }
  start() {
    if (this.dead) return;
    this.sfx.enable(this.sfx.on);
    this.resetMatch();
    this.paused = false; this.$.ov.hidden = true; this.$.pause.textContent = 'Time out';
    this.phase = 'intro'; this.introT = 0;
    this.showVS();
    this.sfx.stinger();
    this.$.stage.focus({ preventScroll: true });
  }
  showVS() {
    const t0 = this.teams[0], t1 = this.teams[1];
    this.$.vs.innerHTML = `<div class="fbg-vsp l"><small>${esc(this.look.name || '')}</small><h3>FINAL BOSS</h3><ul class="two">${t0.map(a => `<li${a === this.user ? ' class="me"' : ''}><span>#${a.num}</span>${a.name}</li>`).join('')}</ul></div>
      <div class="fbg-vsp r"><small>Boss team</small><h3>THE GLITCHES</h3><ul class="two">${t1.map(a => `<li>${a.name}<span>#${a.num}</span></li>`).join('')}</ul></div><div class="fbg-vsx">VS</div>`;
    this.$.vs.hidden = false;
  }
  startRPS() {
    this.phase = 'rps'; this.rpsT = 0; this.rpsPick = null; this.rpsCPU = null; this.rpsDone = 0;
    const names = ['ROCK', 'PAPER', 'SCISSORS'];
    this.$.vs.innerHTML = `<div class="fbg-rps"><h3>RO-SHAM-BO</h3><p>${this.gameNo === 1 && !this.ot ? 'Winner takes 3 balls on its right.' : (this.ot ? 'Overtime. Winner takes 3 balls.' : 'Game ' + this.gameNo + '. Winner takes 3 balls.')}</p>
      <div class="fbg-rpsb">${names.map((n, i) => `<button type="button" data-r="${i}">${rpsIcon(i)}<b>${n}</b><small>${i + 1}</small></button>`).join('')}</div><div class="fbg-rpsr" aria-live="polite"></div></div>`;
    this.$.vs.hidden = false; this.$.vs.classList.add('live');
    this.$.vs.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { if (this.rpsPick == null) this.rpsPick = +b.dataset.r; }));
  }
  rpsTick() {
    this.rpsT++;
    for (const a of this.all) if (a.active) { a.tgt = this.poseIdle(a); this.blend(a, 0.2); this.place(a); }
    if (this.rpsPick == null) {
      if (this.edge.rock) this.rpsPick = 0; else if (this.edge.paper) this.rpsPick = 1; else if (this.edge.scissors) this.rpsPick = 2; else if (this.edge.enter || this.edge.throw) this.rpsPick = (Math.random() * 3) | 0;
      else if (this.rpsT > 150) this.rpsPick = (Math.random() * 3) | 0;
    }
    this.edge = {};
    if (this.rpsPick != null && this.rpsCPU == null) {
      this.rpsCPU = (Math.random() * 3) | 0; this.rpsDone = this.rpsT;
      const names = ['ROCK', 'PAPER', 'SCISSORS'];
      const r = this.$.vs.querySelector('.fbg-rpsr');
      this.$.vs.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', +b.dataset.r === this.rpsPick));
      const w = this.rpsPick === this.rpsCPU ? -1 : ((this.rpsPick - this.rpsCPU + 3) % 3 === 1 ? 0 : 1);
      this.rpsWinner = w;
      if (r) r.innerHTML = `You: <b>${names[this.rpsPick]}</b>. GLITCHES: <b>${names[this.rpsCPU]}</b>. ${w < 0 ? 'Tie, go again.' : (w === 0 ? 'FINAL BOSS gets 3 balls.' : 'THE GLITCHES get 3 balls.')}`;
      this.sfx.catch();
    }
    if (this.rpsCPU != null && this.rpsT - this.rpsDone > (this.rpsWinner < 0 ? 50 : 70)) {
      if (this.rpsWinner < 0) { this.startRPS(); return; }
      this.$.vs.hidden = true; this.$.vs.classList.remove('live');
      this.placeRushBalls(this.rpsWinner);
      this.phase = 'lineup'; this.lineT = 0;
      this.popCenter('READY', 'big', 0.45, 0.75);
    }
  }
  lineupTick() {
    this.lineT++;
    const ui = this.userIntent();
    if (!this.falseStart && this.lineT > 8 && (Math.abs(ui.mx) + Math.abs(ui.mz) > 0.3 || ui.dash)) {
      this.falseStart = true;
      for (const b of this.balls) if (b.state === 'rest' && b.rushTeam === 0) b.rushTeam = 1;
      this.popCenter('FALSE START', 'big red', 0.6); this.ref('Balls go to THE GLITCHES'); this.sfx.buzz();
    }
    for (const a of this.all) if (a.active) { a.tgt = this.poseSquat(a, 0.45); a.tgt.sq = 1; a.tgt.sh = [-0.6, 0.3, -0.6, 0.3]; this.blend(a, 0.25); this.place(a); }
    for (const b of this.balls) this.placeBallMesh(b);
    if (this.lineT === 45) this.popCenter('SET', 'big', 0.45, 0.75);
    if (this.lineT === 90) { this.phase = 'play'; this.rushT = 0; this.cheer('*go'); this.popBrush('RUSH!', 'Ro-sham-bo: ' + (this.rpsWinner === 0 ? 'FINAL BOSS' : 'GLITCHES') + ' ball control', '', 0.3, 1.3); this.sfx.crowd(true); this.sfx.buzz(); }
  }
  pause(auto) {
    if (this.phase === 'title' || this.phase === 'result' || this.dead) return;
    this.paused = true; this.$.pause.textContent = 'Resume';
    const timeout = !auto && !this.timeoutUsed;
    if (timeout) { this.timeoutUsed = true; this.timeoutT = RULES.timeout * 60; }
    else this.timeoutT = 0;
    this.$.card.innerHTML = `<h2>${timeout ? 'TIME <em>OUT</em>' : 'PAUSED'}</h2><p class="fbg-to">${timeout ? 'Your one 30 second time out. Play resumes on its own at 0.' : (auto ? 'The game paused while it was off screen.' : 'Your time out is used, so this is a plain pause.')}</p><div class="fbg-row"><button class="fbg-btn fbg-res-go" type="button">RESUME</button><button class="fbg-btn ghost fbg-restart" type="button">RESTART</button><button class="fbg-btn ghost fbg-snd" type="button">${this.sfx.on ? 'Sound on' : 'Sound off'}</button></div>`;
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
  resume() { if (!this.paused) return; this.paused = false; this.timeoutT = 0; this.$.ov.hidden = true; this.$.pause.textContent = this.timeoutUsed ? 'Pause' : 'Time out'; this.$.stage.focus({ preventScroll: true }); }
  endMatch(result) {
    if (this.over) return; this.over = true; this.phase = 'result'; this.resultT = 0; this.result = result;
    this.sfx.buzz(); if (result.win) this.sfx.crowd(true);
    this.popCenter(result.win ? 'MATCH: FINAL BOSS' : 'MATCH: GLITCHES', result.win ? 'big gold' : 'big red');
    setTimeout(() => this.showResults(), this.rm ? 600 : 1600);
  }
  showResults() {
    if (this.phase !== 'result') return;
    const r = this.result, s = this.stats;
    this.$.card.innerHTML = `<h2>${r.win ? 'YOU <em>WIN</em>' : 'NICE <em>TRY</em>'}</h2><p>${esc(r.msg)}</p>
      <div class="fbg-res"><div><b>${this.points[0]} to ${this.points[1]}</b><span>Games</span></div><div><b>${this.score.toLocaleString()}</b><span>Score</span></div><div><b>${s.kos}</b><span>Outs you made</span></div>
      <div><b>${s.catches}</b><span>Catches</span></div><div><b>${s.backIn}</b><span>Teammates back in</span></div><div><b>${s.headshots}</b><span>Headshot calls</span></div></div>
      <p style="color:var(--fbg-ash)">Look: ${esc(this.look.name || '')}. Honor system, always.</p>
      <div class="fbg-row"><button class="fbg-btn fbg-go" type="button">REMATCH</button><button class="fbg-btn ghost fbg-lineup-b" type="button">PICK A PLAYER</button></div>`;
    this.$.card.querySelector('.fbg-go').addEventListener('click', () => this.start());
    this.$.card.querySelector('.fbg-lineup-b').addEventListener('click', () => { this.resetMatch(); this.phase = 'title'; this.showTitle(); });
    this.$.ov.hidden = false;
    const b = this.$.card.querySelector('.fbg-go'); if (b) b.focus({ preventScroll: true });
  }
  showTitle() {
    this.phase = 'title';
    const touch = this.root.classList.contains('has-touch');
    const how = touch
      ? `<li data-n="1">Drag the left pad to move. Flick it hard to <b>dash</b>.</li>
         <li data-n="2"><b>THROW</b>. Dash 4 to 7 steps first for a <b>power shot</b>.</li>
         <li data-n="3"><b>CATCH</b> right before impact (hold to duck). <b>JUMP</b>, <b>PASS</b>.</li>`
      : `<li data-n="1"><span class="fbg-kbd">Arrows</span> or <span class="fbg-kbd">WASD</span> move. Double-tap to <b>dash</b>. <span class="fbg-kbd">Q</span> switches player.</li>
         <li data-n="2"><span class="fbg-kbd">J</span> or <span class="fbg-kbd">Space</span> throws. Throw on dash steps 4 to 7 for a <b>power shot</b>.</li>
         <li data-n="3"><span class="fbg-kbd">K</span> catches or blocks right before impact (hold to duck). <span class="fbg-kbd">L</span> jumps, <span class="fbg-kbd">Shift</span> passes.</li>`;
    const rules = [['rush', 'Rush right', 'grab only the balls on your right'], ['line', 'Clear the line', 'carry it past your attack line first'], ['catch', 'Catch = back in', 'thrower out, your next teammate returns'],
      ['head', 'No headshots', 'a standing headshot puts the thrower out'], ['clock', '15 s control', 'hold 3 of 5 balls and the clock runs'], ['back', 'Back line only', 'leave only out the back, 10 s to return']];
    this.$.card.innerHTML = `
      <h2>BOSS <em>RUSH</em></h2>
      <p>Sin City rules. 8 on 8, 5 balls, no sting. Most games in 3 minutes wins.</p>
      <ul class="fbg-rules">${rules.map(r => `<li>${ruleIcon(r[0])}<b>${r[1]}</b><span>${r[2]}</span></li>`).join('')}</ul>
      <details class="fbg-more"><summary>How Sin City plays</summary>
        <p>Both teams start on their back line. Ro-sham-bo decides ball control: the winner's 3 balls sit on its right, the other team's 2 on its right. On GO, rush only your right side. Leave early and you lose those balls.</p>
        <p>You are out if a live ball hits you and nobody catches it, if your throw is caught, if you cross the center line or a side line, or if you stay out the back for more than 10 seconds. A ball held in your hands can block a throw.</p>
        <p>A ball is live once it crosses the center line, and dead once it touches the floor, a wall, or another ball. A game ends when a team is out, worth 1 point. Mercy at an 8 game lead. A tie goes to overtime, then sudden death. Play on the honor system.</p>
      </details>
      <ol class="fbg-how">${how}</ol>
      <div class="fbg-lineup"><h3>PICK YOUR PLAYER</h3><div class="fbg-pool"></div></div>
      <div class="fbg-row"><button class="fbg-btn fbg-go" type="button">PLAY</button><button class="fbg-btn ghost fbg-snd" type="button">${this.sfx.on ? 'Sound on' : 'Sound off'}</button></div>`;
    this.renderPicker();
    this.$.card.querySelector('.fbg-go').addEventListener('click', () => this.start());
    this.$.card.querySelector('.fbg-snd').addEventListener('click', () => this.toggleSound());
    this.$.ov.hidden = false;
  }
  renderPicker() {
    const pool = this.$.card.querySelector('.fbg-pool'); if (!pool) return;
    pool.innerHTML = ROSTER.map(r => `<button class="fbg-pick${r.key.length > 9 ? ' long' : ''}" type="button" aria-pressed="${r.key === this.controlKey}" data-k="${r.key}">${r.key}<small>#${r.num}${r.key === this.controlKey ? ' you' : ''}</small></button>`).join('');
    pool.querySelectorAll('.fbg-pick').forEach(b => b.addEventListener('click', () => {
      this.controlKey = b.dataset.k; this.user = this.teams[0].find(a => a.name === this.controlKey); this.renderPicker();
      const nb = pool.querySelector(`[data-k="${CSS.escape(this.controlKey)}"]`); if (nb) nb.focus();
    }));
  }

  // ------------------------------------------------ main tick
  tick() {
    this.frame++;
    if (this.paused) { this.timeoutTick(); this.edge = {}; return; }
    this.updateFX();
    switch (this.phase) {
      case 'title': this.attract(); return;
      case 'intro':
        this.introT++;
        for (const a of this.all) if (a.active) this.animate(a);
        if (this.introT === 112) this.popBrush('NO STING!', 'SIN CITY RULES', '', 0.5, 1.2);
        if (this.introT === 150) { this.$.vs.hidden = true; this.startRPS(); }
        this.edge = {}; return;
      case 'rps': this.rpsTick(); return;
      case 'lineup': this.lineupTick(); return;
      case 'gameover': this.gameOverTick(); return;
      case 'ot-wait': for (const a of this.all) if (a.active) { this.control(a, NOI); this.physics(a); this.animate(a); } for (const b of this.balls) this.updateBall(b); this.edge = {}; return;
      case 'result':
        this.resultT++;
        for (const a of this.all) if (a.active) { this.control(a, NOI); this.physics(a); this.animate(a); }
        for (const b of this.balls) this.updateBall(b);
        this.edge = {}; return;
    }
    if (this.hitstop > 0) { this.hitstop--; for (const a of this.all) if (a.shake > 0) a.shake--; return; }
    const ui = this.userIntent();
    if (ui.sw) this.switchUser(true);
    this.assignClaims();
    for (const a of this.all) {
      if (!a.active) continue;
      const it = (a === this.user && a.role === 'in') ? ui : this.aiIntent(a);
      this.control(a, it);
      this.physics(a);
      this.animate(a);
    }
    for (const b of this.balls) this.updateBall(b);
    this.ballHits();
    this.rules();
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
      if (this.ot || this.sudden) return this.endMatch({ win: this.lastGameWinner === 0, msg: this.lastGameWinner === 0 ? 'Overtime goes to FINAL BOSS.' : 'Overtime goes to THE GLITCHES.' });
      if (lead >= RULES.mercy) return this.endMatch({ win: this.points[0] > this.points[1], msg: `Mercy rule at ${this.points[0]} to ${this.points[1]}.` });
      this.setupGame(); this.startRPS();
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
    if (a.role !== 'in' || a.locked()) return it;
    const ai = a.ai; ai.t++;
    if (ai.press >= 0 && this.frame >= ai.press) { it.catch = true; ai.press = -1; }
    if (a.held) return this.aiWithBall(a, it);
    const inc = this.incomingFor(a);
    if (inc) {
      if (ai.press >= 0) return it;
      if (!ai.dodgeAt) { ai.dodgeAt = this.frame + this.level.r; ai.dz = a.z > inc.z ? 1 : -1; if (Math.abs(a.z) > HZ - 1) ai.dz = -Math.sign(a.z); ai.duck = inc.h > 1.2 && Math.random() < 0.3; }
      if (this.frame >= ai.dodgeAt) { if (ai.duck) it.catchHeld = true; else it.mz = ai.dz; }
      return it;
    }
    ai.dodgeAt = 0;
    if (ai.claimBall) { const b = ai.claimBall; const tx = b.state === 'rest' ? b.x + a.side * 0.35 : b.x; return this.seek(a, it, tx, b.z, true); }
    if (a.oob > 0) return this.seek(a, it, a.side * (HX - 0.8), Math.max(-3.5, Math.min(3.5, a.z)), false);
    // formation: drift around home, back off when the other side holds more balls
    const foeHeld = this.balls.filter(b => b.holder && b.holder.team !== a.team).length;
    const h = ai.home || [a.side * 5, 0];
    if (!ai.wander || ai.t % 100 === 0) ai.wander = [h[0] + (Math.random() - 0.5) * 2.2, Math.max(-3.9, Math.min(3.9, h[1] + (Math.random() - 0.5) * 2.4))];
    let tx = ai.wander[0], tz = ai.wander[1];
    if (foeHeld >= 3) tx = a.side * Math.max(Math.abs(tx), 6.2);
    const d = Math.hypot(tx - a.x, tz - a.z);
    if (d > 0.4) { it.mx = (tx - a.x) / d * 0.6; it.mz = (tz - a.z) / d * 0.6; }
    return it;
  }
  aiWithBall(a, it) {
    const b = a.held, ai = a.ai;
    if (a.oob > 0) return this.seek(a, it, a.side * (HX - 0.9), Math.max(-3, Math.min(3, a.z)), false);
    if (!b.cleared) return this.seek(a, it, a.side * (ATK + 1.2), Math.max(-3.8, Math.min(3.8, a.z)), false);
    const pressure = this.ctlTeam === a.team ? this.ctlT : 0;
    if (ai.plan == null) {
      ai.delay = pressure > 8 ? 6 + ((Math.random() * 10) | 0) : 22 + ((Math.random() * 55) | 0);
      const r = Math.random();
      const powerP = a.team === 1 ? (this.p2 && a.boss ? 0.75 : this.level.p) : 0.3;
      if (r < 0.08) ai.plan = { k: 'pass' };
      else if (Math.random() < powerP && Math.abs(a.x) > 3.4) ai.plan = { k: Math.random() < 0.7 ? 'run' : 'jump', stepAt: TUNE.powMin + ((Math.random() * 4) | 0) };
      else ai.plan = { k: 'throw' };
      ai.t = 0;
    }
    const P = ai.plan;
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
      const eta = Math.round(d / sp * 60);
      t.ai.press = this.frame + Math.max(1, eta - (2 + ((Math.random() * 7) | 0)));
    } else t.ai.press = -1;
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
      case 'squat': if (a.st >= 4) { a.set('air'); a.vh = GRAV * (TUNE.airF / 60) / 2; a.airF = 0; } return;
      case 'land': if (a.st >= 6) a.set('idle'); return;
      case 'windup': case 'pwind': { const n = st === 'pwind' ? TUNE.pWind : TUNE.wind; if (a.st >= (a.passing ? 4 : n)) { a.set(st === 'pwind' ? 'prel' : 'release'); this.release(a); } return; }
      case 'release': case 'prel': if (a.st >= (st === 'prel' ? TUNE.pRel : TUNE.rel)) a.set(st === 'prel' ? 'prec' : 'recover'); return;
      case 'recover': case 'prec': if (a.st >= (a.passing ? 6 : (st === 'prec' ? TUNE.pRec : TUNE.rec))) { a.passing = false; a.set(a.h > 0 ? 'air' : 'idle'); } return;
      case 'catch': if (a.st >= 14) a.set('idle'); return;
      case 'block': if (a.st >= 12) a.set('idle'); return;
      case 'bobble': if (a.st >= 22) a.set('idle'); return;
      case 'hitstun': if (a.st >= 22) a.set('ko'); return;
      case 'knock': return;
      case 'down': if (a.st >= 24) a.set('ko'); return;
      case 'walkin': if (a.st >= 20) a.set('idle'); return;
    }
    if (it.catch && a.catchCool === 0 && st !== 'air') { a.catchF = this.frame; a.set('catchready'); a.catchHeld = 0; }
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
    if (it.dash && (a.state === 'idle' || a.state === 'walk')) { a.set('run'); a.runDir = it.dash; a.runF = 0; a.steps = 0; }
    if (a.state === 'run') {
      const holding = it.holdRun && Math.sign(it.mx || a.runDir) === a.runDir;
      if (!holding) a.set('idle');
      else { a.runF++; if (a.runF % TUNE.stepF === 0) { a.steps++; if (a === this.user) this.sfx.step(); this.dust(a); } a.vx = a.runDir * TUNE.run; a.vz = it.mz * TUNE.walk * 0.6; return; }
    }
    const mag = Math.hypot(it.mx, it.mz);
    if (mag > 0.15) { const k = Math.min(1, mag) / mag; const sp = TUNE.walk * (a.boss && this.p2 ? 1.15 : 1); a.vx = it.mx * k * sp; a.vz = it.mz * k * sp * 0.85; if (a.state !== 'walk') a.set('walk'); }
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
    a.wantPower = power; a.throwType = type;
    a.throwTarget = this.pickTarget(a, it);
    a.set(power ? 'pwind' : 'windup');
    if (!inAir) { a.vx *= power ? 0.5 : 0.35; a.vz *= 0.3; }
    if (power) { this.aura(a); if (a.team === 0) this.stats.power++; }
  }
  pickTarget(a, it) {
    const foes = this.inPlayers(1 - a.team).filter(f => f.oob === 0); if (!foes.length) return null;
    if (a === this.user) {
      if (it && Math.abs(it.mz) > 0.3) { const s = foes.slice().sort((p, q) => p.z - q.z); return it.mz < 0 ? s[0] : s[s.length - 1]; }
      return foes.slice().sort((p, q) => (Math.abs(p.z - a.z) + Math.abs(p.x - a.x) * 0.25) - (Math.abs(q.z - a.z) + Math.abs(q.x - a.x) * 0.25))[0];
    }
    let best = null, bs = -1e9;
    for (const f of foes) {
      const fv = f.facingVec(); const tx = a.x - f.x, tz = a.z - f.z; const away = (fv[0] * tx + fv[1] * tz) < 0;
      const s = (away ? 3 : 0) + (f.locked() ? 2 : 0) + (f.held ? -1.5 : 0) - Math.hypot(tx, tz) * 0.25 + Math.random() * 2.5 + (f === this.user ? 0.6 : 0);
      if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  pickPass(a, it) {
    const mates = this.inPlayers(a.team).filter(m => m !== a && !m.held && !m.locked());
    if (!mates.length) return null;
    const mx = it ? it.mx : 0, mz = it ? it.mz : 0;
    if (Math.hypot(mx, mz) < 0.2) return mates.slice().sort((p, q) => Math.abs(q.x) - Math.abs(p.x))[0];
    let best = null, bs = -1e9;
    for (const m of mates) { const dx = m.x - a.x, dz = m.z - a.z, d = Math.hypot(dx, dz) || 1; const s = (dx * mx + dz * mz * 1.5) / d - d * 0.02; if (s > bs) { bs = s; best = m; } }
    return best;
  }
  release(a) {
    const B = a.held; if (!B) return;
    a.held = null; B.holder = null; B.thrower = a; B.team = a.team; B.age = 0; B.hitSet = new Set(); B.pending = null; B.bounces = 0; B.claim = null;
    B.fromSide = a.side; B.crossed = false; B.live = false; B.deflected = false; B.forceHead = !!a.forceHead; a.forceHead = false;
    const hx = a.x + Math.sin(a.yaw) * 0.4, hz = a.z + Math.cos(a.yaw) * 0.4;
    B.x = hx; B.z = hz; B.h = a.h + 1.45 * a.scale; B.state = 'flight'; B.type = a.throwType; B.power = a.wantPower; B.pierce = 0;
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
    B.target = t;
    const spd = { normal: TUNE.vNormal, dash: TUNE.vDash, jump: TUNE.vJump, comet: 23, hook: 20, hop: 20, moon: 13, zig: 19 }[B.type] || 14;
    let tx = t ? t.x : a.x - a.side * 9, tz = t ? t.z : a.z;
    if (t) { const d0 = Math.hypot(tx - B.x, tz - B.z); const eta0 = d0 / spd; tx += t.vx * eta0 * 0.6; tz += t.vz * eta0 * 0.6; }
    const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1, eta = d / spd;
    B.vx = dx / d * spd; B.vz = dz / d * spd; B.grav = 6;
    const aimJit = a === this.user ? 0 : (Math.random() - 0.5) * 0.18;
    const th = (B.forceHead ? 1.78 : 0.9 + aimJit) * (t ? t.scale : 1);
    B.vh = (th - B.h) / eta + 0.5 * B.grav * eta;
    if (B.type === 'hook') { const ang = (Math.random() < 0.5 ? -1 : 1) * 0.5; const c = Math.cos(ang), s = Math.sin(ang); const vx = B.vx * c - B.vz * s, vz = B.vx * s + B.vz * c; B.vx = vx; B.vz = vz; B.vh = 0.3; B.grav = 0; }
    if (B.type === 'comet') { B.vh = (1.0 * (t ? t.scale : 1) - B.h) / eta; B.grav = 0; }
    if (B.type === 'hop') { B.vh = -6; B.grav = 20; }
    if (B.type === 'moon') { const e = Math.max(0.9, eta); B.vx = dx / e; B.vz = dz / e; B.grav = 18; B.vh = ((t ? t.scale * 1.15 : 1.2) - B.h) / e + 0.5 * B.grav * e; }
    if (B.type === 'zig') { B.zigBase = { vx: B.vx, vz: B.vz }; B.vh = (1.0 - B.h) / eta; B.grav = 0; }
    B.trailC = B.power ? ({ comet: '#ffc83d', hook: '#ff6b4a', hop: '#7ff3ff', moon: '#c9a0ff', zig: '#a6f23a' }[B.type] || '#ffffff') : '#ffffff';
    this.sfx.throw(B.power);
    if (B.power) { this.pop(a, SHOT_NAME[B.type] || 'POWER!', a.team === 0 ? 'gold' : 'lime'); B.flash = 6; }
    if (this.ctlTeam === a.team) this.ctlT = Math.max(0, this.ctlT - 0);
    this.scheduleCatches(B);
  }

  // ------------------------------------------------ physics
  physics(a) {
    if (!a.active || a.role !== 'in') { this.faceIdle(a); return; }
    if (a.state === 'ko') return;
    if (a.state === 'knock') {
      a.vh -= GRAV * DT; a.h += a.vh * DT; a.x += a.vx * DT; a.z += a.vz * DT;
      if (a.h <= 0) { a.h = 0; a.vh = 0; a.vx *= 0.3; a.vz *= 0.3; a.set('down'); this.dust(a, 5); this.shakeScreen(this.rm ? 0 : 2, 6); }
      return;
    }
    if (a.state === 'hitstun' && a.st < 12 && a.knock) { a.x += a.knock.dx / 12; a.z += a.knock.dz / 12; }
    if (a.state === 'air' || a.h > 0) {
      a.vh -= GRAV * DT; a.h += a.vh * DT; a.x += a.vx * DT; a.z += a.vz * DT;
      if (a.h <= 0) { a.h = 0; a.vh = 0; if (a.state === 'air') { a.set('land'); this.dust(a, 3); } a.vx *= 0.3; a.vz *= 0.3; }
    } else if (!a.locked() || a.state === 'walkin') { a.x += a.vx * DT; a.z += a.vz * DT; }
    else { a.vx *= 0.8; a.vz *= 0.8; a.x += a.vx * DT * 0.3; a.z += a.vz * DT * 0.3; }
    this.clampAthlete(a);
    // facing
    let fx, fz;
    if (a.state === 'run') { fx = a.runDir; fz = -0.5; }
    else if (a.state === 'down' || a.state === 'getup') return;
    else if (a.held && a.throwTarget && (a.state === 'windup' || a.state === 'pwind')) { fx = a.throwTarget.x - a.x; fz = a.throwTarget.z - a.z; }
    else if (a.held && a.passTarget && a.passing) { fx = a.passTarget.x - a.x; fz = a.passTarget.z - a.z; }
    else {
      const inc = this.incomingFor(a);
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
  clampAthlete(a) {
    const s = a.side, rush = this.rushT < RULES.rushF;
    const backOK = this.backLineBallFor(a);
    const isUser = a === this.user;
    // center line: CPU never crosses; the player may, and pays for it in rules()
    const cen = isUser ? (rush ? -1.0 : -0.6) : (rush ? 0.05 : 0.4);
    if (s < 0) a.x = Math.min(-cen, a.x); else a.x = Math.max(cen, a.x);
    // back line: only to fetch a ball that is already out
    const maxX = backOK || a.oob > 0 ? HX + 1.6 : HX - 0.25;
    if (s < 0) a.x = Math.max(-maxX, a.x); else a.x = Math.min(maxX, a.x);
    const beyondBack = Math.abs(a.x) > HX;
    if (beyondBack && a.oob === 0 && a.role === 'in') { a.oob = 1; if (isUser) this.ref('OUT THE BACK: 10 S'); }
    if (!beyondBack && a.oob > 0) a.oob = 0;
    const zl = beyondBack ? HZ + 1.2 : (isUser ? HZ + 0.6 : HZ - 0.25);
    a.z = Math.max(-zl, Math.min(zl, a.z));
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
      if (this.frame - p.a.catchF <= TUNE.catchLate && p.a.catchF >= p.start) { B.pending = null; this.doCatch(p.a, B, false); return; }
      if (p.f <= 0) { B.pending = null; this.applyHit(p.a, B); }
      this.placeBallMesh(B); return;
    }
    if (B.state === 'flight') {
      if (B.type === 'hook' && B.age === 24 && B.live !== null) {
        const t = this.nearestFoe(B); if (t) { const sp = Math.hypot(B.vx, B.vz); const want = Math.atan2(t.z - B.z, t.x - B.x); const cur = Math.atan2(B.vz, B.vx); let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; d = Math.max(-60 * DEG, Math.min(60 * DEG, d)); const n = cur + d; B.vx = Math.cos(n) * sp; B.vz = Math.sin(n) * sp; B.target = t; this.burst(B.x, B.h, B.z, '#ff6b4a', 6); }
      }
      if (B.type === 'zig' && B.zigBase) { const w = Math.sin(B.age * 0.22) * 6.5; const bx = B.zigBase.vx, bz = B.zigBase.vz, l = Math.hypot(bx, bz) || 1; B.vx = bx - (bz / l) * w * 0.3; B.vz = bz + (bx / l) * w; }
      if (B.type === 'pass' && B.target) { const t = B.target; const dx = t.x - B.x, dz = t.z - B.z; if (Math.hypot(dx, dz) < 4) { B.vx += dx * 0.15; B.vz += dz * 0.15; } }
      B.vh -= (B.grav || 0) * DT; B.x += B.vx * DT; B.z += B.vz * DT; B.h += B.vh * DT;
      // live once it crosses the center line; a deflection that comes back over is dead
      if (!B.crossed && B.x * B.fromSide < 0) { B.crossed = true; if (B.type !== 'pass') B.live = true; }
      if (B.deflected && B.x * B.defSide < 0) this.killBall(B, 'over');
      if (B.type === 'hop' && B.h <= 0.22) { B.h = 0.22; B.vh = 3.2 + B.bounces * 0.6; B.bounces++; B.vx *= 1.12; B.vz *= 1.12; this.dustAt(B.x, B.z, 2); }
      if ((B.power || B.type === 'dash') && B.live) this.trail(B);
      if (B.type === 'pass') {
        const t = B.target; if (t && t.role === 'in' && !t.held && Math.hypot(t.x - B.x, t.z - B.z) < 0.7 && Math.abs((t.h + 1.2) - B.h) < 1.3) { this.give(t, B); t.set('catch'); B.squash = 1; this.sfx.catch(); return; }
      }
      if (B.type !== 'hop' && B.h <= 0.22) { B.h = 0.22; this.killBall(B, 'floor'); this.dustAt(B.x, B.z, 2); return; }
      if (B.type === 'hop' && B.bounces > 5) { this.killBall(B, 'floor'); return; }
      if (Math.abs(B.x) > 12.3 || Math.abs(B.z) > 6.6) { this.killBall(B, 'wall'); return; }
      this.placeBallMesh(B); return;
    }
    // loose (dead) ball
    B.vh -= GRAV * DT; B.x += B.vx * DT; B.z += B.vz * DT; B.h += B.vh * DT;
    if (B.h <= 0.22) { B.h = 0.22; if (Math.abs(B.vh) > 1.5) B.vh = -B.vh * 0.5; else B.vh = 0; B.vx *= 0.94; B.vz *= 0.94; }
    if (Math.abs(B.x) > 12) { B.x = Math.sign(B.x) * 12; B.vx = -B.vx * 0.5; }
    if (Math.abs(B.z) > 6.2) { B.z = Math.sign(B.z) * 6.2; B.vz = -B.vz * 0.5; }
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
    if (best) { const wasRest = B.state === 'rest'; this.give(best, B); B.cleared = !wasRest; if (wasRest && best === this.user) this.pop(best, 'CLEAR THE LINE', 'small cyan'); }
  }
  killBall(B, why) {
    B.state = 'loose'; B.live = false; B.thrower = null; B.target = null; B.deflected = false;
    B.vx *= 0.45; B.vz *= 0.45; B.vh = Math.abs(B.vh) * 0.4 + 1.5;
  }
  nearestFoe(B) { let best = null, bd = 1e9; for (const f of this.inPlayers(1 - B.team)) { const d = Math.hypot(f.x - B.x, f.z - B.z); if (d < bd && !B.hitSet.has(f)) { bd = d; best = f; } } return best; }
  give(a, B) {
    B.state = 'held'; B.holder = a; a.held = B; B.team = a.team; B.vx = B.vz = B.vh = 0; B.live = false; B.claim = null; a.ai.plan = null; a.ai.claimBall = null;
    for (const p of this.all) if (p.ai.press >= 0 && !this.balls.some(b => b.state === 'flight' && b.target === p)) p.ai.press = -1;
  }
  ballHits() {
    // live balls against players, then ball against ball in the air (both go dead)
    for (const B of this.balls) {
      if (B.state !== 'flight' || B.type === 'pass' || B.pending) continue;
      for (const f of this.all) {
        if (!f.active || f.role !== 'in' || f.team === B.team || f.oob > 0 || B.hitSet.has(f)) continue;
        if (f.state === 'knock' || f.state === 'down' || f.state === 'ko' || f.state === 'hitstun') continue;
        const r = 0.4 * f.scale + 0.22;
        if (Math.hypot(f.x - B.x, f.z - B.z) > r) continue;
        const top = (f.state === 'duck' ? 1.0 : 1.98) * f.scale + f.h, bot = f.h - 0.1;
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
    const crouched = f.state === 'duck';
    const headLine = f.h + (crouched ? 0.8 : 1.6) * f.scale;
    if (B.h > headLine || B.forceHead) {
      // direct headshot: dead ball, victim stays in. Standing headshot puts the thrower out.
      B.hitSet.add(f); B.vx *= -0.25; B.vz *= -0.25; B.vh = 4; this.killBall(B, 'head');
      this.spark(B.x, B.h, B.z, 1.3); this.hitstop = 4; f.shake = 8; f.shakeMax = 8;
      if (!crouched && thrower && thrower.role === 'in') {
        this.popBrush('HEADSHOT!', 'THROWER OUT', 'red'); this.stats.headshots++;
        this.eliminate(thrower, 'headshot');
      } else this.pop(f, 'HEADSHOT: NO CALL', 'small');
      return;
    }
    const fv = f.facingVec(); const bl = Math.hypot(B.vx, B.vz) || 1;
    const facingOK = (fv[0] * -B.vx / bl + fv[1] * -B.vz / bl) > Math.cos(100 * DEG);
    if (facingOK && f.state === 'catchready') {
      const age = this.frame - f.catchF;
      if (age <= TUNE.catchBobble) return f.held ? this.block(f, B, true) : this.doCatch(f, B, age <= TUNE.catchClean);
    }
    if (f.held && facingOK && !f.locked()) {
      if (Math.random() < 0.6) return this.block(f, B, false);
      // the blocking ball is knocked loose: that counts as out
      this.ref('BLOCK DROPPED'); return this.applyHit(f, B);
    }
    if (facingOK && !f.locked() && !f.held && f.state !== 'air' && f.state !== 'duck') { B.pending = { a: f, f: TUNE.catchLate, start: this.frame }; return; }
    this.applyHit(f, B);
  }
  block(f, B, timed) {
    B.hitSet.add(f); B.vx = -B.vx * 0.3 + (Math.random() - 0.5) * 2; B.vz = -B.vz * 0.3 + (Math.random() - 0.5) * 2; B.vh = 5; B.grav = GRAV;
    B.deflected = true; B.defSide = f.side; B.type = 'normal'; B.power = false;
    f.set('block'); this.hitstop = 4; this.spark(B.x, B.h, B.z, 1.2); this.pop(f, 'BLOCK!', f.team === 0 ? 'gold' : 'lime'); this.sfx.hit(false);
    if (f.team === 0) { this.stats.blocks++; this.addScore(60); }
  }
  doCatch(f, B, clean) {
    if (f.team === 0) this.cheer(f.name);
    const thrower = B.thrower;
    this.give(f, B); B.squash = 1; B.cleared = true;
    f.set(clean ? 'catch' : 'bobble');
    f.x += f.side * 0.2; this.clampAthlete(f);
    this.hitstop = 6; this.flash(clean ? 0.3 : 0.14); this.ringFx(f, clean ? '#ffffff' : '#ffc83d'); this.catchFlash(f); if (f.team === 0 || f === this.user) this.punch(f.x, f.z, 1);
    this.sfx.catch(); this.sfx.crowd();
    if (f.team === 0) { this.stats.catches++; this.addScore(clean ? 150 : 90); } else this.breakCombo();
    if (thrower && thrower.role === 'in') this.eliminate(thrower, 'caught');
    // the first teammate in the outline comes back in
    const q = this.queue[f.team];
    if (q.length) {
      const r = q.shift(); r.role = 'returning'; r.backF = 0; r.set('walk');
      this.popBrush('CATCH!', `${r.name} ${r.num} BACK IN`, f.team === 0 ? '' : 'lime');
      if (f.team === 0) this.stats.backIn++;
      this.layoutQueue(f.team);
    } else if (f.team === 0) this.popBrush(clean ? 'CATCH!' : 'BOBBLE!', thrower ? `${thrower.name} OUT` : '', ''); else this.pop(f, 'CATCH!', 'lime');
    this.renderLive();
    this.say(`${f.name} catches. ${thrower ? thrower.name + ' is out.' : ''}`);
  }
  applyHit(f, B) {
    if (B.thrower && B.thrower.team === 0) this.cheer(B.thrower.name);
    const power = B.power || B.type === 'zig';
    B.hitSet.add(f);
    this.hitstop = this.rm ? 4 : (power ? TUNE.hsPower : TUNE.hsKO);
    f.shake = this.hitstop + 6; f.shakeMax = f.shake;
    if (!this.rm) { if (power) this.shakeScreen(7, 16); else this.shakeScreen(4, 10); }
    this.spark(B.x, B.h, B.z, power ? 2.6 : 1.8);
    if (!this.rm && power) this.flash(0.22, true);
    this.sfx.hit(power);
    const dir = Math.sign(B.vx) || -f.side;
    // the ball goes dead off the hit
    B.vx = -B.vx * 0.18 + (Math.random() - 0.5) * 2; B.vz = -B.vz * 0.18 + (Math.random() - 0.5) * 2; B.vh = 6; this.killBall(B, 'hit'); B.vh = 6;
    B.squash = 1;
    if (f.team === 1) { this.stats.hits++; this.addScore(power ? 200 : 100); } else this.breakCombo();
    this.eliminate(f, power ? 'power' : 'hit', dir);
  }
  eliminate(a, why, dir) {
    if (a.role !== 'in') return;
    if (a.held) { const b = a.held; a.held = null; b.holder = null; b.state = 'loose'; b.live = false; b.vh = 4; b.vx = (dir || -a.side) * 1.5; b.vz = (Math.random() - 0.5) * 2; b.cleared = true; }
    a.role = 'gone'; a.oob = 0; a.ai.press = -1; a.ai.claimBall = null;
    dir = dir || -a.side;
    if (why === 'power') { a.knock = {}; a.vx = dir * 7; a.vz = (Math.random() - 0.5) * 2; a.vh = 6; a.h = 0.05; a.set('knock'); }
    else if (why === 'hit') { a.knock = { dx: dir * 0.8, dz: 0 }; a.set('hitstun'); }
    else a.set('ko');
    if (a.team === 1) { this.stats.kos++; this.addScore(why === 'caught' ? 150 : 120); }
    if ((why === 'power' || why === 'hit') && (a.team === 1 || a === this.user)) this.punch(a.x, a.z, why === 'power' ? 1.2 : 0.7);
    const call = { hit: 'OUT!', power: 'OUT!', caught: 'CAUGHT: OUT', headshot: 'THROWER OUT', line: 'LINE: OUT', side: 'OUT OF BOUNDS', oob: 'OUT: 10 S' }[why] || 'OUT!';
    this.pop(a, call, a.team === 0 ? 'red' : 'lime');
    if (a.team === 1 && (why === 'hit') && Math.random() < 0.35) setTimeout(() => { if (this.phase === 'play') this.pop(a, 'HONOR CALL', 'small lime'); }, 500);
    this.sfx.ko();
    if (a === this.user) setTimeout(() => this.switchUser(false), 0);
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
    if (a.st === 36) { this.burst(a.x, a.h + 1, a.z, a.team === 0 ? '#ffc83d' : '#a6f23a', 20); }
    if (a.st > 36 && a.st <= 44) a.popScale = Math.max(0, 1 - (a.st - 36) / 8);
    if (a.st === 50) {
      // join the outline queue in order of arrival, on the far side line beside our half
      this.queue[a.team].push(a); a.role = 'outline'; a.h = 0; a.popScale = 1; a.vx = a.vz = 0;
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
    const u = this.user;
    if (u && u.role === 'in' && u.oob === 0) {
      if (this.rushT >= RULES.rushF && u.x * u.side < -0.05) { this.eliminate(u, 'line'); this.popCenter('CENTER LINE: OUT', 'big red', 0.36); }
      else if (Math.abs(u.z) > HZ + 0.2 && Math.abs(u.x) < HX) { this.eliminate(u, 'side'); this.popCenter('SIDE LINE: OUT', 'big red', 0.36); }
    }
    // ball control countdown: 3 of 5 held by one team
    const held = [0, 0]; for (const b of this.balls) if (b.state === 'held') held[b.holder.team]++;
    const maj = held[0] >= 3 ? 0 : (held[1] >= 3 ? 1 : -1);
    if (maj < 0 || maj !== this.ctlTeam) { if (this.ctlTeam >= 0 && maj < 0) this.$.ctl.hidden = true; this.ctlTeam = maj; this.ctlT = 0; this.lastCtlSec = -1; }
    if (maj >= 0 && this.rushT >= RULES.rushF) {
      this.ctlT += DT; const left = Math.max(0, Math.ceil(RULES.control - this.ctlT));
      if (left !== this.lastCtlSec) {
        this.lastCtlSec = left; this.$.ctl.hidden = false; this.$.ctl.className = 'fbg-ctl t' + maj; this.$.ctl.innerHTML = `${maj === 0 ? 'FINAL BOSS' : 'GLITCHES'} BALL CONTROL <b>${left}</b>`;
        if (left <= 5 && left > 0) { this.popCenter(`${left}...`, maj === 0 ? 'gold' : 'lime', 0.62); this.sfx.tick(); }
      }
      if (this.ctlT >= RULES.control) this.controlViolation(maj);
    }
    // phase two: the GLITCH KING powers up when his team is down to 3
    if (!this.p2 && this.liveCount(1) <= 3 && this.boss.role === 'in') { this.p2 = true; this.cheer('*p2'); this.popBrush('PHASE TWO!', 'THE GLITCH KING POWERS UP', 'red'); this.sfx.stinger(); this.$.boss.classList.add('on'); this.aura(this.boss); }
    if (this.p2) this.$.bossI.style.transform = `scaleX(${this.liveCount(1) / 8})`;
    // game over
    const l0 = this.liveCount(0), l1 = this.liveCount(1);
    if (l0 === 0 || l1 === 0) this.gameOver(l0 === 0 ? 1 : 0);
  }
  endRush() {
    this.rushT = RULES.rushF;
    for (const b of this.balls) if (b.state === 'rest') { b.state = 'loose'; b.vx = (b.rushTeam === 0 ? -1 : 1) * 2.6; b.vh = 1.5; }
  }
  controlViolation(t) {
    this.popCenter('BALL CONTROL: VIOLATION', 'big red', 0.36); this.ref('Every ball goes to the other side'); this.sfx.buzz();
    const other = 1 - t; let k = 0;
    for (const b of this.balls) {
      const onSide = b.state === 'held' ? b.holder.team === t : (b.state === 'loose' && Math.sign(b.x) === (t === 0 ? -1 : 1));
      if (!onSide) continue;
      if (b.holder) { b.holder.held = null; b.holder = null; }
      b.state = 'loose'; b.live = false; b.cleared = true; b.x = (other === 0 ? -1 : 1) * (4 + (k % 3)); b.z = -3 + k * 1.5; b.h = 1.2; b.vh = 2; b.vx = b.vz = 0; k++;
    }
    this.ctlTeam = -1; this.ctlT = 0; this.$.ctl.hidden = true;
  }
  bigCountdown(before, now) {
    const s = Math.ceil(now);
    if (now <= 10 && s !== Math.ceil(before) && s > 0) { this.popCenter(String(s), 'big gold', 0.5); this.sfx.tick(); }
  }
  gameOver(w) {
    if (this.phase !== 'play') return;
    this.points[w]++; this.lastGameWinner = w;
    this.phase = 'gameover'; this.gameEndT = 0;
    this.popBrush('GAME!', w === 0 ? 'POINT FINAL BOSS' : 'POINT GLITCHES', w === 0 ? '' : 'lime');
    this.sfx.crowd(true); this.updateHUD(true);
  }
  timeUp() {
    this.popCenter('TIME! GAME VOID', 'big red'); this.sfx.buzz();
    const [p0, p1] = this.points;
    if (p0 !== p1) return this.endMatch({ win: p0 > p1, time: true, msg: p0 > p1 ? `Time. FINAL BOSS takes the match, ${p0} games to ${p1}.` : `Time. THE GLITCHES take it, ${p1} games to ${p0}.` });
    // tied: overtime game, then sudden death
    this.ot = true; this.otClock = RULES.ot;
    this.phase = 'gameover'; this.gameEndT = 100; this.lastGameWinner = -1;
    setTimeout(() => { if (this.over) return; this.popCenter('OVERTIME', 'big red'); this.setupGame(); this.startRPS(); }, this.rm ? 300 : 900);
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
    else if (B.state === 'rest') { g.opacity = 0.5 + 0.3 * Math.sin(this.frame * 0.15 + B.id); g.color.set(B.rushTeam === 0 ? this.kit.accent : '#a6f23a'); B.glow.scale.setScalar(1.3); }
    else { g.opacity = B.state === 'held' ? 0 : 0.18; g.color.set('#ff7a5a'); B.glow.scale.setScalar(0.9); }
    if (B.mat.emissive) B.mat.emissive.set(B.flash > 0 && !this.rm ? '#ffffff' : (B.state === 'loose' ? '#000000' : '#000000'));
  }
  addScore(n) { this.combo++; const m = Math.min(4, 1 + Math.floor((this.combo - 1) / 2) * 0.5); this.score += Math.round(n * m); this.stats.bestCombo = Math.max(this.stats.bestCombo, m); if (this.combo >= 3 && this.combo % 2 === 1) this.popCenter(`COMBO x${m}`, 'small cyan', 0.3); }
  breakCombo() { this.combo = 0; }
  renderLive() {
    const dots = (t) => this.teams[t].map(a => `<i class="${a.role === 'in' || a.role === 'returning' ? '' : 'off'}${a === this.user ? ' me' : ''}" title="${esc(a.name)}"></i>`).join('');
    this.$.l0.innerHTML = dots(0); this.$.l1.innerHTML = dots(1);
    const q = (t) => this.queue[t].map((a, i) => `<span>${i === 0 ? 'NEXT ' : ''}#${a.num}</span>`).join('');
    this.$.q0.innerHTML = this.queue[0].length ? 'Outline: ' + q(0) : ''; this.$.q1.innerHTML = this.queue[1].length ? 'Outline: ' + q(1) : '';
  }
  updateHUD(force) {
    const c = this.ot ? this.otClock : this.clock; const txt = this.sudden ? 'SD' : fmtClock(Math.max(0, Math.ceil(c)));
    if (force || this.$.clock.textContent !== txt) this.$.clock.textContent = txt;
    this.$.clock.classList.toggle('fever', this.ot || c <= 10);
    const sub = this.sudden ? 'SUDDEN DEATH' : (this.ot ? 'OVERTIME' : (this.phase === 'title' ? '3 MINUTES' : 'GAME ' + this.gameNo));
    if (this.$.sub.textContent !== sub) this.$.sub.textContent = sub;
    if (this.$.g0.textContent !== String(this.points[0])) this.$.g0.textContent = this.points[0];
    if (this.$.g1.textContent !== String(this.points[1])) this.$.g1.textContent = this.points[1];
    const sc = this.score.toLocaleString(); if (this.$.score.textContent !== sc) this.$.score.textContent = sc;
  }
  render() {
    if (!this.renderer) return;
    const v = this.view;
    let tx = 0;
    if (!v.wide) {
      const u = this.user; let focus = u ? u.x * 0.55 : 0;
      const fl = this.balls.filter(b => b.state === 'flight' && b.live); if (fl.length) focus = focus * 0.6 + fl[0].x * 0.4;
      tx = Math.max(-4.6, Math.min(4.6, focus));
    }
    v.cx += (tx - v.cx) * 0.08;
    let sx = 0, sy = 0;
    if (this.shakeF > 0) { this.shakeF--; const k = this.shakeF / this.shakeMax; const amp = this.shakeAmp * k * k / this.pxPerUnit; sx = (Math.random() * 2 - 1) * amp; sy = (Math.random() * 2 - 1) * amp; if (this.shakeF <= 0) this.shakeAmp = 0; }
    // camera punch-in on catches and knockouts
    let d = v.d, tX = v.cx, tZ = v.tz;
    if (v.punch > 0) { v.punch--; const t = v.punch / 26; const e = Math.sin(Math.min(1, (1 - t) * 3) * Math.PI / 2) * Math.min(1, t * 2.2); d *= 1 - 0.3 * e * Math.min(1.3, v.pk || 1); tX += (v.px - tX) * 0.35 * e; tZ += (v.pz - tZ) * 0.35 * e; }
    const T = new THREE.Vector3(tX + sx, sy, tZ);
    this.camera.position.set(T.x, T.y + SINP * d, T.z + COSP * d); this.camera.lookAt(T);
    if (this.backdrop) { this.backdrop.position.x = v.cx * 0.3; if (this.standsG) this.standsG.position.x = v.cx * 0.3; }
    this.crowdT.value = this.frame / 60; this.crowdAmp.value = (this.rm || this.tier === 'low') ? 0 : 1;
    if (this.mode === 'vc') { const t = this.frame / 60; this.caustics[0].material.map.offset.set(t * 0.02, t * 0.013); this.caustics[1].material.map.offset.set(-t * 0.017, t * 0.021); }
    if (this.glowMat) { const base = this.mode === 'vc' ? 0.75 : 0.45; this.glowMat.opacity = (this.ctlTeam >= 0 || this.ot) ? base + 0.3 * (0.5 + 0.5 * Math.sin(this.frame * 0.15)) : base; }
    for (const a of this.all) {
      if (!a.active) continue;
      if (a.shake > 0 && !this.rm) { const k = a.shake / Math.max(1, a.shakeMax); const amp = 3 / this.pxPerUnit * k; const o = (a.shake % 2 ? 1 : -1) * amp; if (a.h > 0.2) { a.body.position.y = (a.bodyY || 0) + o; a.body.position.x = 0; } else { a.body.position.x = o; a.body.position.y = a.bodyY || 0; } }
      else { a.body.position.x = 0; a.body.position.y = a.bodyY || 0; }
      if (this.hitstop <= 0 && a.shake > 0) a.shake--;
      const you = a === this.user && a.role === 'in' && this.phase !== 'title';
      const holder = !!a.held && a.role === 'in';
      a.ring.visible = (you || holder) && a.root.visible;
      if (a.ring.visible) {
        const pulse = you ? 1 + 0.08 * Math.sin(this.frame * 0.2) : 1;
        const s = (you ? 1.5 : 1.15) * a.scale * pulse; a.ring.scale.set(s, s * 0.62, 1); a.ring.position.set(a.x, 0.02, a.z);
        a.ring.material.color.set(you ? '#ffc83d' : (a.team === 0 ? '#ffffff' : '#a6f23a')); a.ring.material.opacity = you ? 0.95 : 0.7;
      }
    }
    this.updateStands();
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
    const u = this.user; if (!u) return;
    const steps = u.state === 'run' ? u.steps : (u.state === 'air' ? u.airSteps : 0);
    const lo = TUNE.powMin, hi = TUNE.powMax;
    const key = steps + '|' + (u.state === 'run');
    if (this._mk === key) return; this._mk = key;
    const cells = this.$.steps.children;
    for (let i = 0; i < cells.length; i++) { const n = i + 1; cells[i].className = (n >= lo && n <= hi ? 'win ' : '') + (n <= steps ? 'lit' : ''); }
    this.$.meter.classList.toggle('on', u.state === 'run' || u.state === 'air');
    this.$.meter.classList.toggle('power', steps >= lo && steps <= hi && u.state === 'run');
  }
  snapshot() {
    const pl = (a) => ({ name: a.name, num: a.num, team: a.team, role: a.role, state: a.state, x: +a.x.toFixed(2), z: +a.z.toFixed(2), h: +a.h.toFixed(2), hasBall: !!a.held, oob: a.oob > 0, boss: a.boss });
    return {
      phase: this.phase, paused: this.paused, timeout: this.timeoutT > 0, frame: this.frame, clock: +(this.clock || 0).toFixed(2), otClock: +(this.otClock || 0).toFixed(2), ot: this.ot, sudden: this.sudden, phaseTwo: this.p2,
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
    // ultra supersamples: 1.5x the screen's own density, capped near 14 megapixels
    const dpr = t === 'ultra' ? Math.min(dev * 1.5, 3, Math.sqrt(14e6 / Math.max(1, (this.W || 1280) * (this.H || 720)))) : Math.min(t === 'high' ? 2 : t === 'med' ? 1.5 : 1, dev);
    R.setPixelRatio(dpr); if (this.W) R.setSize(this.W, this.H, false);
    R.shadowMap.enabled = t !== 'low';
    if (this.key) { const ms = t === 'ultra' ? 4096 : t === 'high' ? 2048 : 1024; if (this.key.shadow.mapSize.x !== ms) { this.key.shadow.mapSize.set(ms, ms); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; } } this.key.castShadow = t !== 'low'; }
    this.useRefl = t !== 'low'; this.useBloom = (t === 'high' || t === 'ultra') && !this.rm; this.ultra = t === 'ultra';
    if (this.scene) this.applyEnv();
    if (this.glossMesh) this.glossMesh.visible = this.useRefl;
    if (this.W) this.sizePost();
    if (this.$.qual) this.$.qual.textContent = 'Quality: ' + (this.qMode === 'auto' ? 'Auto (' + t + ')' : t);
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
    this.qMode = q; if (q !== 'auto') this.tier = q; else { this.tier = 'ultra'; this.qDrops = 0; this.qFrames = 0; }
    this.applyTier(false);
  }
  autoQuality(dt) {
    if (this.qMode !== 'auto' || this.phase === 'title' || this.paused) return;
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05; this.qFrames++;
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
    const hide = [this.glossMesh, this.floor, this.court, this.glowPlane, ...this.pools, ...this.streaks, ...this.caustics];
    const vis = hide.map(o => o.visible); hide.forEach(o => o.visible = false);
    const shadows = []; for (const a of this.all) { shadows.push(a.shadow.visible); a.shadow.visible = false; a.ring && (a.ring.visible = false); }
    const bs = this.balls ? this.balls.map(b => b.shadow.visible) : []; if (this.balls) this.balls.forEach(b => b.shadow.visible = false);
    const sm = R.shadowMap.enabled; R.shadowMap.enabled = false;
    R.setRenderTarget(this.reflRT); R.clear(); R.render(this.scene, rc); R.setRenderTarget(null);
    R.shadowMap.enabled = sm;
    hide.forEach((o, i) => o.visible = vis[i]); this.all.forEach((a, i) => a.shadow.visible = shadows[i]);
    if (this.balls) this.balls.forEach((b, i) => b.shadow.visible = bs[i]);
  }
  initPost() {
    const isGL2 = this.renderer.capabilities.isWebGL2;
    this.post = {
      main: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: isGL2 ? Math.min(8, this.renderer.capabilities.maxSamples || 4) : 0 }),
      a: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), b: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }),
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
          vec2 off = d * r2 * 0.006;
          c = vec3(texture2D(t, vUv + off).r, texture2D(t, vUv).g, texture2D(t, vUv - off).b) + texture2D(bl, vUv).rgb * k;
          c = mix(c, aces(c * 1.08), 0.45);
          c *= mix(1.0, smoothstep(0.85, 0.18, r2 * 1.6), 0.38);
          c += (hash(vUv * res + fract(time) * 37.0) - 0.5) * 0.018;
        } else { c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k; }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`, depthTest: false });
    this.post.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post.comp); this.post.scene.add(this.post.quad);
  }
  sizePost() {
    const R = this.renderer, pr = R.getPixelRatio(), W = Math.max(4, Math.floor(this.W * pr)), H = Math.max(4, Math.floor(this.H * pr));
    const sh = this.tier === 'ultra' ? 1 : 2;
    if (this.post) { this.post.main.setSize(W, H); this.post.a.setSize(Math.max(4, W >> sh), Math.max(4, H >> sh)); this.post.b.setSize(Math.max(4, W >> sh), Math.max(4, H >> sh)); }
    const rs = this.tier === 'ultra' ? 1 : this.tier === 'high' ? 0.5 : 0.33;
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
      for (let i = 0, n = this.ultra ? 4 : 2; i < n; i++) {
        P.blur.uniforms.t.value = P.a.texture; P.blur.uniforms.dir.value.set(tw * (1 + i), 0); this.pass(P.blur, P.b);
        P.blur.uniforms.t.value = P.b.texture; P.blur.uniforms.dir.value.set(0, th * (1 + i)); this.pass(P.blur, P.a);
      }
      P.comp.uniforms.t.value = P.main.texture; P.comp.uniforms.bl.value = P.a.texture; P.comp.uniforms.k.value = (this.mode === 'vc' ? 0.6 : 0.32) * (this.ultra ? 0.8 : 1); P.comp.uniforms.grade.value = this.ultra ? 1 : 0; P.comp.uniforms.time.value = (performance.now() % 100000) / 1000; P.comp.uniforms.res.value.set(P.main.width, P.main.height);
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
      const g2 = c.createLinearGradient(Rr, 0, w, 0); g2.addColorStop(0, '#3f7a10'); g2.addColorStop(1, '#1a3a06'); c.fillStyle = vc ? '#0e3a40' : g2; c.fillRect(Rr, 0, w - Rr, h);
      // diagonal slashes
      c.globalAlpha = 0.25; c.fillStyle = '#000'; for (let x = 0; x < w; x += 60) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, 0); c.lineTo(x + 38, 0); c.lineTo(x + 14, h); c.fill(); } c.globalAlpha = 1;
      c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = font(54);
      const txt = (t, x, col, st) => { c.save(); c.translate(x, h / 2 + 3); c.transform(1, 0, -0.18, 1, 0, 0); c.lineWidth = 5; c.strokeStyle = st; c.strokeText(t, 0, 0); c.fillStyle = col; c.fillText(t, 0, 0); c.restore(); };
      txt('FINAL BOSS', L * 0.5, '#fff7e8', '#2a0a0a'); crown(c, L * 0.18, h / 2 + 2, 16, '#ffc83d', '#3a1a00'); crown(c, L * 0.82, h / 2 + 2, 16, '#ffc83d', '#3a1a00');
      c.font = font(40); txt('B O S S   R U S H', w / 2, vc ? '#7ff3ff' : '#d8d0e8', '#000');
      c.font = font(54); txt('THE GLITCHES', Rr + (w - Rr) * 0.5, vc ? '#7ff3ff' : '#c8ff6a', '#0a1a02');
      for (const x of [Rr + (w - Rr) * 0.15, Rr + (w - Rr) * 0.85]) glitchGlyph(c, x, h / 2, 14, vc ? '#7ff3ff' : '#a6f23a');
    });
  }
  punch(x, z, strength = 1) { if (this.rm) return; const v = this.view; v.punch = Math.max(v.punch, 26); v.px = x; v.pz = z; v.pk = strength; }
  catchFlash(a) {
    const y = a.h + 1.3 * a.scale;
    this.spawnSprite({ tex: this.tex.speed, x: a.x, y, z: a.z, s: 1.2, s1: 4.2, life: 16, color: '#ffd23a', alpha: 0.95, rot: Math.random() * 6, fade: 1.2 });
    this.spawnSprite({ tex: this.tex.star, x: a.x, y, z: a.z, s: 0.6, s1: 2.0, life: 12, ease: 'pop', normal: true, fade: 3 });
    this.spawnSprite({ tex: this.tex.glow, x: a.x, y, z: a.z, s: 2.4, s1: 3.6, life: 12, color: '#ffc83d', alpha: 0.9 });
  }
  popBrush(text, sub, cls = '', y = 0.36, dur = 1.5) {
    const el = document.createElement('div'); el.className = 'fbg-brush ' + cls;
    el.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    el.style.left = (this.W / 2) + 'px'; el.style.top = (this.H * y) + 'px'; el.style.animationDuration = dur + 's';
    this.$.world.appendChild(el); setTimeout(() => el.remove(), dur * 1000 + 60);
    this.say(text + (sub ? '. ' + sub : ''));
  }
  destroy() { cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp); this.ro && this.ro.disconnect(); this.io && this.io.disconnect(); this.renderer && this.renderer.dispose(); this.root.remove(); }
}

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
  start() { if (G) G.start(); },
  pause() { if (G) G.pause(); },
  resume() { if (G) G.resume(); },
  sound(on) { if (G) G.toggleSound(!!on); },
  state() { return G ? G.snapshot() : null; },
  roster: ROSTER.map(r => ({ name: r.key, num: r.num })),
  rules: RULES,
  stage(name) { return G && !G.dead ? G.stage(name) : false; },
  destroy() { if (G) { G.destroy(); G = null; } },
  _game() { return G; },
};
window.FBGame = API;
window.__bossrush = { state: () => API.state(), start: () => API.start(), stage: (n) => API.stage(n) };
window.dispatchEvent(new CustomEvent('fbgame:ready', { detail: API }));
export default API;
