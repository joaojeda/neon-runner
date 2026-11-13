(() => {
'use strict';

/* =====================================================================
   NEON RUNNER - plataformas 2D con un robot en una ciudad futurista
   Todo (texturas, sprites, fondo, sonido) se genera por código.
   ===================================================================== */

const TILE = 32, W = 768, H = 480;
const LW = 200, LH = 15, GROUND = 13;
const T = { EMPTY: 0, GROUND: 1, PANEL: 2, ENERGY: 3, USED: 4, CAP_L: 5, CAP_R: 6, BODY_L: 7, BODY_R: 8, STEEL: 9, FILL: 10 };
const POLE_X = 186, DOOR_X = 195, CHECK_X = 100;
const POLE_PX = POLE_X * TILE + 14;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

/* ----------------------------- Utilidades --------------------------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function mk(w = TILE, h = TILE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/* ------------------------------- Audio ------------------------------ */
let AC = null, muted = false;
function initAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
}
function tone(f, d, type = 'square', v = 0.05, f2 = null, delay = 0) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + d + 0.03);
}
const sfx = {
  jump: () => tone(300, 0.16, 'square', 0.035, 700),
  coin: () => { tone(988, 0.07, 'square', 0.045); tone(1319, 0.22, 'square', 0.045, null, 0.07); },
  stomp: () => tone(240, 0.12, 'sawtooth', 0.05, 80),
  bump: () => tone(140, 0.09, 'square', 0.06, 90),
  die: () => { [523, 392, 330, 262, 196].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, null, i * 0.14)); },
  flag: () => { for (let i = 0; i < 10; i++) tone(1200 - i * 90, 0.08, 'square', 0.04, null, i * 0.07); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.05, null, i * 0.13)); },
  check: () => { tone(660, 0.1, 'triangle', 0.06); tone(990, 0.2, 'triangle', 0.06, null, 0.1); },
  oneup: () => { [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.04, null, i * 0.09)); }
};
// Música sencilla tipo synthwave (secuenciador propio)
const BASS = [55, 55, 55, 55, 65.4, 65.4, 49, 49, 55, 55, 55, 55, 73.4, 73.4, 65.4, 65.4];
const ARP = [220, 261.6, 329.6, 440, 261.6, 329.6, 440, 523.3];
let musicStep = 0;
setInterval(() => {
  if (!AC || muted || (G.state !== 'play' && G.state !== 'title') || G.paused) return;
  const i = musicStep++;
  tone(BASS[i % BASS.length], 0.2, 'triangle', 0.045);
  if (i % 2 === 0 || i % 8 === 7) tone(ARP[i % ARP.length] * (i % 32 >= 16 ? 1.5 : 1), 0.12, 'square', 0.012);
}, 165);

/* ------------------------------- Input ------------------------------ */
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  initAudio();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const kLeft = () => keys.ArrowLeft || keys.KeyA;
const kRight = () => keys.ArrowRight || keys.KeyD;
const kJump = () => keys.ArrowUp || keys.KeyW || keys.Space || keys.KeyZ;
const kRun = () => keys.ShiftLeft || keys.ShiftRight || keys.KeyX;
const pJump = () => pressed.ArrowUp || pressed.KeyW || pressed.Space || pressed.KeyZ;

/* ----------------------------- Texturas ----------------------------- */
const tex = {};
function rivet(g, x, y, col = '#8a93c9', sh = '#10142b') {
  g.fillStyle = sh; g.fillRect(x + 1, y + 1, 3, 3);
  g.fillStyle = col; g.fillRect(x, y, 3, 3);
}
function buildTextures() {
  { // suelo (superficie con borde de neón)
    const [c, g] = mk();
    g.fillStyle = '#262a47'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#30355a'; g.fillRect(0, 6, 32, 26);
    g.fillStyle = '#3b4272'; g.fillRect(0, 8, 15, 2); g.fillRect(17, 8, 15, 2);
    g.fillStyle = '#171a31'; g.fillRect(15, 8, 2, 24); g.fillRect(0, 20, 32, 2);
    g.fillStyle = '#232850'; g.fillRect(0, 30, 32, 2);
    rivet(g, 3, 12); rivet(g, 26, 12); rivet(g, 3, 24); rivet(g, 26, 24);
    g.fillStyle = '#0a6b80'; g.fillRect(0, 3, 32, 3);
    g.fillStyle = '#00e5ff'; g.fillRect(0, 0, 32, 3);
    g.fillStyle = '#c9fbff'; g.fillRect(0, 0, 32, 1);
    tex.groundTop = c;
  }
  { // suelo (relleno)
    const [c, g] = mk();
    g.fillStyle = '#1e2140'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#272b4f'; g.fillRect(1, 1, 30, 30);
    g.fillStyle = '#15182f'; g.fillRect(0, 15, 32, 2); g.fillRect(15, 0, 2, 15); g.fillRect(7, 17, 2, 15); g.fillRect(23, 17, 2, 15);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#12142a'; g.fillRect(4, 4 + i * 3, 8, 1); g.fillRect(20, 20 + i * 2, 8, 1); }
    rivet(g, 2, 2, '#59629a'); rivet(g, 27, 2, '#59629a'); rivet(g, 2, 27, '#59629a'); rivet(g, 27, 27, '#59629a');
    g.fillStyle = 'rgba(255,63,180,0.5)'; g.fillRect(20, 6, 8, 2);
    tex.groundFill = c;
  }
  { // panel metálico
    const [c, g] = mk();
    g.fillStyle = '#454d86'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#7a85d1'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
    g.fillStyle = '#232850'; g.fillRect(0, 30, 32, 2); g.fillRect(30, 0, 2, 32);
    g.fillStyle = '#363d73'; g.fillRect(6, 6, 20, 20);
    g.fillStyle = '#242a58'; g.fillRect(6, 6, 20, 2); g.fillRect(6, 6, 2, 20);
    g.fillStyle = '#5b66ad'; g.fillRect(6, 24, 20, 2); g.fillRect(24, 6, 2, 20);
    g.fillStyle = '#0a3d4a'; g.fillRect(10, 14, 12, 4);
    g.fillStyle = '#00e5ff'; g.fillRect(11, 15, 10, 2);
    rivet(g, 2, 2, '#aab3f0'); rivet(g, 27, 2, '#aab3f0'); rivet(g, 2, 27, '#aab3f0'); rivet(g, 27, 27, '#aab3f0');
    tex.panel = c;
  }
  { // bloque de energía
    const [c, g] = mk();
    g.fillStyle = '#ffb300'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#ffe08a'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
    g.fillStyle = '#a86b00'; g.fillRect(0, 30, 32, 2); g.fillRect(30, 0, 2, 32);
    g.fillStyle = '#2b1a00'; g.fillRect(5, 5, 22, 22);
    g.fillStyle = '#5c3b00'; g.fillRect(5, 5, 22, 2); g.fillRect(5, 5, 2, 22);
    g.fillStyle = '#fff08a';
    g.beginPath();
    g.moveTo(18, 6); g.lineTo(9, 18); g.lineTo(15, 18); g.lineTo(13, 27); g.lineTo(23, 13); g.lineTo(17, 13); g.lineTo(20, 6);
    g.closePath(); g.fill();
    g.fillStyle = '#ffc400';
    g.beginPath(); g.moveTo(18, 9); g.lineTo(12, 17); g.lineTo(16, 17); g.lineTo(15, 23); g.lineTo(20, 15); g.lineTo(17, 15); g.closePath(); g.fill();
    rivet(g, 1, 1, '#a86b00', '#ffe08a'); rivet(g, 28, 1, '#a86b00', '#ffe08a'); rivet(g, 1, 28, '#a86b00', '#ffe08a'); rivet(g, 28, 28, '#a86b00', '#ffe08a');
    tex.energy = c;
  }
  { // bloque usado
    const [c, g] = mk();
    g.fillStyle = '#3a3d56'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#50547a'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
    g.fillStyle = '#1f2135'; g.fillRect(0, 30, 32, 2); g.fillRect(30, 0, 2, 32);
    g.fillStyle = '#2a2c44'; g.fillRect(5, 5, 22, 22);
    g.fillStyle = '#1a1b2c'; g.fillRect(5, 5, 22, 2); g.fillRect(5, 5, 2, 22);
    g.strokeStyle = '#3d4060'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(11, 11); g.lineTo(21, 21); g.moveTo(21, 11); g.lineTo(11, 21); g.stroke();
    rivet(g, 1, 1, '#6b6f99'); rivet(g, 28, 1, '#6b6f99'); rivet(g, 1, 28, '#6b6f99'); rivet(g, 28, 28, '#6b6f99');
    tex.used = c;
  }
  { // conductos (tuberías): tapa y cuerpo, cortados en mitades izquierda/derecha
    const [cap, g] = mk(64, 32);
    let lin = g.createLinearGradient(0, 0, 64, 0);
    lin.addColorStop(0, '#0b4f46'); lin.addColorStop(0.16, '#1fd1b3'); lin.addColorStop(0.28, '#9ff9e8');
    lin.addColorStop(0.55, '#17b89d'); lin.addColorStop(1, '#0b4f46');
    g.fillStyle = lin; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#06302b'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 32); g.fillRect(62, 0, 2, 32); g.fillRect(0, 30, 64, 2);
    g.fillStyle = '#0a3d4a'; g.fillRect(4, 19, 56, 4);
    g.fillStyle = '#00e5ff'; g.fillRect(4, 20, 56, 2);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(4, 4, 56, 2);

    const [body, b] = mk(64, 32);
    lin = b.createLinearGradient(4, 0, 60, 0);
    lin.addColorStop(0, '#0b4f46'); lin.addColorStop(0.16, '#1fd1b3'); lin.addColorStop(0.3, '#9ff9e8');
    lin.addColorStop(0.55, '#17b89d'); lin.addColorStop(1, '#0b4f46');
    b.fillStyle = lin; b.fillRect(4, 0, 56, 32);
    b.fillStyle = '#06302b'; b.fillRect(4, 0, 2, 32); b.fillRect(58, 0, 2, 32);
    b.fillStyle = '#0a3d4a'; b.fillRect(8, 12, 48, 4);
    b.fillStyle = '#00e5ff'; b.fillRect(8, 13, 48, 2);
    b.fillStyle = '#0a3d4a'; b.fillRect(8, 26, 48, 3);
    b.fillStyle = '#ff3fb4'; b.fillRect(8, 27, 48, 1);

    const slice = (src, sx) => { const [c, gg] = mk(); gg.drawImage(src, sx, 0, 32, 32, 0, 0, 32, 32); return c; };
    tex.capL = slice(cap, 0); tex.capR = slice(cap, 32);
    tex.bodyL = slice(body, 0); tex.bodyR = slice(body, 32);
  }
  { // bloque de acero (escaleras)
    const [c, g] = mk();
    g.fillStyle = '#6a74a6'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#a9b3ee'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
    g.fillStyle = '#2b3160'; g.fillRect(0, 30, 32, 2); g.fillRect(30, 0, 2, 32);
    g.fillStyle = '#525b8f'; g.fillRect(4, 4, 24, 24);
    g.strokeStyle = '#363d70'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(6, 6); g.lineTo(26, 26); g.moveTo(26, 6); g.lineTo(6, 26); g.stroke();
    g.fillStyle = '#7c87c8'; g.fillRect(4, 4, 24, 1);
    g.fillStyle = '#ffb300'; g.fillRect(13, 13, 6, 6);
    g.fillStyle = '#fff08a'; g.fillRect(14, 14, 2, 2);
    rivet(g, 1, 1, '#c7cffa'); rivet(g, 28, 1, '#c7cffa'); rivet(g, 1, 28, '#c7cffa'); rivet(g, 28, 28, '#c7cffa');
    tex.steel = c;
  }
  tex.byType = [null, tex.groundTop, tex.panel, tex.energy, tex.used, tex.capL, tex.capR, tex.bodyL, tex.bodyR, tex.steel, tex.groundFill];
}

/* --------------------------- Fondo (parallax) ----------------------- */
const bg = {};
function makeSky() {
  const [c, g] = mk(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#070624'); grad.addColorStop(0.45, '#1d0c4a');
  grad.addColorStop(0.75, '#5a1675'); grad.addColorStop(1, '#c2307f');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 120; i++) {
    const x = r() * W, y = r() * H * 0.62, s = r() < 0.15 ? 2 : 1;
    g.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.6).toFixed(2) + ')';
    g.fillRect(x | 0, y | 0, s, s);
  }
  // planeta con anillo
  g.save();
  g.translate(580, 105); g.rotate(-0.3);
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,190,235,0.45)';
  g.beginPath(); g.ellipse(0, 0, 86, 18, 0, Math.PI, 2 * Math.PI); g.stroke();
  const pg = g.createRadialGradient(-14, -14, 6, 0, 0, 50);
  pg.addColorStop(0, '#ffc2e6'); pg.addColorStop(0.55, '#c44fe0'); pg.addColorStop(1, '#4b1d9a');
  g.fillStyle = pg; g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(40,10,90,0.25)'; g.fillRect(-48, -6, 96, 5); g.fillRect(-46, 12, 92, 4);
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,190,235,0.7)';
  g.beginPath(); g.ellipse(0, 0, 86, 18, 0, 0, Math.PI); g.stroke();
  g.restore();
  return c;
}
function makeLayer(seed, wid, hMin, hMax, wMin, wMax, body, edge, far) {
  const [c, g] = mk(wid, H);
  const r = rng(seed);
  const cols = ['#35e6ff', '#ff3fb4', '#ffd75a', '#7dff9b'];
  let x = 0;
  while (x < wid) {
    let bw = Math.floor(wMin + r() * (wMax - wMin));
    if (x + bw > wid || wid - (x + bw) < wMin) bw = wid - x;
    const bh = Math.floor(hMin + r() * (hMax - hMin));
    const top = 416 - bh;
    g.fillStyle = body; g.fillRect(x, top, bw, H - top);
    g.fillStyle = edge; g.fillRect(x + bw - 3, top, 3, H - top); g.fillRect(x, top, bw, 2);
    if (r() < 0.4) { g.fillStyle = body; g.fillRect(x + 8, top - 12, bw - 16, 12); g.fillStyle = edge; g.fillRect(x + 8, top - 12, bw - 16, 2); }
    if (r() < 0.45) {
      const ax = x + Math.floor(bw / 2);
      g.fillStyle = edge; g.fillRect(ax, top - 30, 2, 30);
      g.fillStyle = '#ff3b6b'; g.fillRect(ax - 1, top - 33, 4, 4);
    }
    const sx = far ? 8 : 10, sy = far ? 10 : 12;
    for (let wy = top + 10; wy < 410; wy += sy) {
      for (let wx = x + 6; wx < x + bw - 8; wx += sx) {
        if (r() < (far ? 0.18 : 0.38)) {
          g.fillStyle = far ? '#3a2f8f' : cols[Math.floor(r() * cols.length)];
          g.globalAlpha = far ? 0.6 : 0.85;
          g.fillRect(wx, wy, far ? 2 : 4, far ? 3 : 5);
          g.globalAlpha = 1;
        }
      }
    }
    if (!far && r() < 0.3) { // cartel de neón vertical
      const col = cols[Math.floor(r() * cols.length)];
      g.fillStyle = '#0a0820'; g.fillRect(x + bw - 16, top + 18, 8, 58);
      g.fillStyle = col; g.globalAlpha = 0.9; g.fillRect(x + bw - 14, top + 20, 4, 54); g.globalAlpha = 1;
    }
    x += bw;
  }
  const fog = g.createLinearGradient(0, 250, 0, 416);
  fog.addColorStop(0, 'rgba(255,60,160,0)'); fog.addColorStop(1, far ? 'rgba(255,60,160,0.28)' : 'rgba(255,60,160,0.2)');
  g.fillStyle = fog; g.fillRect(0, 250, wid, 166);
  return c;
}
function buildBackground() {
  bg.sky = makeSky();
  bg.far = makeLayer(11, 1536, 120, 260, 40, 90, '#150f3b', '#241a63', true);
  bg.mid = makeLayer(23, 1536, 90, 210, 54, 110, '#1e1550', '#33257c', false);
}
const cars = [];
(function () {
  const r = rng(99);
  const cs = ['#35e6ff', '#ff3fb4', '#ffd75a', '#ffffff'];
  for (let i = 0; i < 8; i++) cars.push({ x: r() * W, y: 50 + r() * 190, v: (0.5 + r() * 1.3) * (r() < 0.5 ? 1 : -1), c: cs[i % cs.length] });
})();

/* ------------------------------- Nivel ------------------------------ */
let grid = [], enemies = [], energyCells = [], lamps = [], signs = [];
const bumps = new Map();
const GAPS = [[69, 71], [88, 89], [104, 106], [140, 142], [146, 147], [160, 162]];
const inGap = x => GAPS.some(([a, b]) => x >= a && x <= b);

function buildLevel() {
  grid = [];
  for (let y = 0; y < LH; y++) grid.push(new Uint8Array(LW));
  const set = (x, y, t) => { if (x >= 0 && x < LW && y >= 0 && y < LH) grid[y][x] = t; };
  for (let x = 0; x < LW; x++) if (!inGap(x)) { set(x, GROUND, T.GROUND); set(x, GROUND + 1, T.FILL); }

  const conduit = (x, h) => {
    const top = GROUND - h;
    set(x, top, T.CAP_L); set(x + 1, top, T.CAP_R);
    for (let y = top + 1; y < GROUND; y++) { set(x, y, T.BODY_L); set(x + 1, y, T.BODY_R); }
  };
  [[28, 2], [38, 3], [46, 4], [57, 4], [156, 3], [166, 2]].forEach(([x, h]) => conduit(x, h));

  // bloques golpeables
  [[16, 9, T.ENERGY], [20, 9, T.PANEL], [21, 9, T.ENERGY], [22, 9, T.PANEL], [23, 9, T.ENERGY], [24, 9, T.PANEL], [22, 5, T.ENERGY],
   [77, 9, T.PANEL], [78, 9, T.ENERGY], [79, 9, T.PANEL],
   [94, 9, T.ENERGY], [96, 9, T.PANEL], [97, 9, T.ENERGY], [98, 9, T.PANEL],
   [110, 9, T.PANEL], [111, 9, T.ENERGY], [112, 9, T.PANEL], [113, 9, T.ENERGY], [114, 9, T.PANEL], [112, 5, T.ENERGY],
   [150, 9, T.ENERGY], [151, 9, T.PANEL], [152, 9, T.ENERGY], [153, 9, T.PANEL], [154, 9, T.ENERGY]
  ].forEach(([x, y, t]) => set(x, y, t));
  for (let x = 80; x <= 87; x++) set(x, 5, x === 83 ? T.ENERGY : T.PANEL);

  // escalera piramidal
  for (let i = 0; i < 4; i++) for (let h = 1; h <= i + 1; h++) set(118 + i, GROUND - h, T.STEEL);
  for (let i = 0; i < 4; i++) for (let h = 1; h <= 4 - i; h++) set(122 + i, GROUND - h, T.STEEL);
  // escalera final
  for (let i = 0; i < 8; i++) for (let h = 1; h <= i + 1; h++) set(172 + i, GROUND - h, T.STEEL);
  // (la base del mástil es solo decoración, no sólida, para poder tocarlo desde el suelo)

  // enemigos
  enemies = [];
  [34, 42, 44, 52, 61, 64, 82, 84, 92, 98, 108, 112, 130, 134, 144, 152, 164, 169].forEach(tx => {
    enemies.push({ type: 'walker', x: tx * TILE + 3, y: GROUND * TILE - 26, w: 26, h: 26, vx: -0.7, vy: 0, state: 'alive', timer: 0, active: false, anim: 0, face: -1 });
  });
  [[50, 8], [75, 8], [100, 7], [121, 6], [137, 8], [150, 6]].forEach(([tx, ty]) => {
    enemies.push({ type: 'drone', x0: tx * TILE, y0: ty * TILE, x: tx * TILE, y: ty * TILE, w: 28, h: 22, vx: 0, vy: 0, t: tx * 7, state: 'alive', timer: 0, active: false, face: 1 });
  });

  // celdas de energía (monedas)
  energyCells = [];
  const cell = (tx, ty) => energyCells.push({ x: tx * TILE + 16, y: ty * TILE + 16, taken: false, ph: tx });
  [[12, 10], [13, 10], [14, 10], [31, 9], [32, 9], [33, 9],
   [69, 10], [70, 9], [71, 10], [88, 9], [89, 9],
   [80, 4], [81, 4], [82, 4], [83, 4], [84, 4], [85, 4], [86, 4], [87, 4],
   [104, 10], [105, 9], [106, 10], [140, 10], [141, 9], [142, 10], [146, 10], [147, 10],
   [160, 10], [161, 9], [162, 10], [126, 7], [127, 8]].forEach(([x, y]) => cell(x, y));

  // decoración: farolas y carteles holográficos sobre suelo libre
  lamps = []; signs = [];
  for (let x = 8; x < LW - 6; x += 11) {
    if (grid[GROUND][x] === T.GROUND && grid[GROUND - 1][x] === 0 && grid[GROUND - 1][x + 1] === 0) lamps.push(x);
  }
  for (let x = 14; x < 180; x += 23) {
    if (grid[GROUND][x] === T.GROUND && grid[GROUND - 1][x] === 0 && grid[GROUND - 1][x + 1] === 0 && grid[GROUND - 1][x + 2] === 0) signs.push(x);
  }
  bumps.clear();
}

/* -------------------------- Estado del juego ------------------------ */
const G = { state: 'title', score: 0, coins: 0, lives: 3, time: 300, frames: 0, t: 0, cam: 0, checkpoint: false, flagY: 3 * TILE + 8, paused: false, winTimer: 0, dyingTimer: 0, bonusDone: false };
let P = null;
const popups = [], particles = [], coinPops = [];

function newPlayer() {
  const sx = G.checkpoint ? CHECK_X * TILE : 3 * TILE;
  return { x: sx, y: GROUND * TILE - 30, w: 22, h: 30, vx: 0, vy: 0, face: 1, onGround: true, coyote: 0, jumpBuf: 0, anim: 0, dead: false, hidden: false, skid: false, hang: false };
}
function resetLevel() {
  buildLevel();
  popups.length = 0; particles.length = 0; coinPops.length = 0;
  G.time = 300; G.frames = 0; G.flagY = 3 * TILE + 8; G.bonusDone = false; G.winTimer = 0;
  P = newPlayer();
  G.cam = clamp(P.x - W * 0.42, 0, LW * TILE - W);
}
function startGame() {
  G.score = 0; G.coins = 0; G.lives = 3; G.checkpoint = false; G.paused = false;
  resetLevel();
  G.state = 'play';
}

/* ------------------------------ Colisiones -------------------------- */
function solid(tx, ty) {
  if (tx < 0 || tx >= LW) return true;
  if (ty < 0 || ty >= LH) return false;
  return grid[ty][tx] !== 0;
}
function moveX(e, dx) {
  e.x += dx;
  const t0 = Math.floor(e.y / TILE), t1 = Math.floor((e.y + e.h - 0.01) / TILE);
  const l = Math.floor(e.x / TILE), r = Math.floor((e.x + e.w - 0.01) / TILE);
  let hit = false, best = dx > 0 ? Infinity : -Infinity;
  for (let ty = t0; ty <= t1; ty++) {
    for (let tx = l; tx <= r; tx++) {
      if (!solid(tx, ty)) continue;
      hit = true;
      if (dx > 0) best = Math.min(best, tx * TILE - e.w);
      else if (dx < 0) best = Math.max(best, (tx + 1) * TILE);
    }
  }
  if (hit && dx !== 0) e.x = best;
  return hit && dx !== 0;
}
function moveY(e, dy, onHead) {
  e.y += dy;
  const l = Math.floor(e.x / TILE), r = Math.floor((e.x + e.w - 0.01) / TILE);
  const t0 = Math.floor(e.y / TILE), t1 = Math.floor((e.y + e.h - 0.01) / TILE);
  let hit = false, best = dy > 0 ? Infinity : -Infinity, headTy = -1;
  for (let ty = t0; ty <= t1; ty++) {
    for (let tx = l; tx <= r; tx++) {
      if (!solid(tx, ty)) continue;
      hit = true;
      if (dy > 0) best = Math.min(best, ty * TILE - e.h);
      else if (dy < 0 && (ty + 1) * TILE > best) { best = (ty + 1) * TILE; headTy = ty; }
    }
  }
  if (!hit || dy === 0) return false;
  e.y = best; e.vy = 0;
  if (dy > 0) e.onGround = true;
  else if (onHead && headTy >= 0) {
    const cx = e.x + e.w / 2; let bestTx = -1, bd = 1e9;
    for (let tx = l; tx <= r; tx++) if (solid(tx, headTy)) { const d = Math.abs(cx - (tx * TILE + 16)); if (d < bd) { bd = d; bestTx = tx; } }
    if (bestTx >= 0) onHead(bestTx, headTy);
  }
  return true;
}

/* --------------------------- Efectos y puntos ----------------------- */
function addPopup(x, y, text, color = '#fff') { popups.push({ x, y, text, color, life: 50 }); }
function spark(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1, life: 24 + (Math.random() * 14 | 0), color });
}
function addScore(n) { G.score += n; }
function gainEnergy() {
  G.coins++; addScore(200); sfx.coin();
  if (G.coins >= 100) { G.coins -= 100; G.lives++; sfx.oneup(); }
}

function hitBlock(tx, ty) {
  const t = grid[ty][tx];
  if (t === T.ENERGY) {
    grid[ty][tx] = T.USED;
    bumps.set(ty * LW + tx, 0);
    coinPops.push({ x: tx * TILE + 16, y: ty * TILE - 4, vy: -8, life: 34 });
    gainEnergy();
    spark(tx * TILE + 16, ty * TILE, '#ffd166', 6);
  } else if (t === T.PANEL || t === T.USED) {
    bumps.set(ty * LW + tx, 0); sfx.bump();
  } else { sfx.bump(); return; }
  for (const e of enemies) {
    if (e.state !== 'alive') continue;
    if (e.x + e.w > tx * TILE && e.x < (tx + 1) * TILE && Math.abs((e.y + e.h) - ty * TILE) < 8) flipEnemy(e);
  }
}
function flipEnemy(e) {
  e.state = 'flipped'; e.vy = -6; e.vx = P.x < e.x ? 1.2 : -1.2; e.timer = 0;
  addScore(100); addPopup(e.x, e.y - 6, '100', '#ffd166'); sfx.stomp();
}

/* ------------------------------- Jugador ---------------------------- */
function die() {
  if (P.dead) return;
  P.dead = true; P.vy = -9; P.vx = 0;
  G.state = 'dying'; G.dyingTimer = 0; sfx.die();
}
function updatePlayer() {
  const run = kRun();
  const maxV = run ? 3.7 : 2.5;
  const acc = run ? 0.17 : 0.13;
  const dir = (kRight() ? 1 : 0) - (kLeft() ? 1 : 0);
  P.skid = false;
  if (dir !== 0) {
    const a = P.onGround ? acc : acc * 0.8;
    if (P.vx !== 0 && Math.sign(P.vx) !== dir) {
      P.vx += dir * (a + 0.17);
      if (P.onGround && Math.abs(P.vx) > 1.2) P.skid = true;
    } else P.vx += dir * a;
    if (Math.abs(P.vx) > maxV) P.vx = approach(P.vx, Math.sign(P.vx) * maxV, 0.12);
    P.face = dir;
  } else {
    P.vx = approach(P.vx, 0, P.onGround ? 0.15 : 0.03);
  }

  P.coyote = P.onGround ? 6 : P.coyote - 1;
  P.jumpBuf = pJump() ? 7 : P.jumpBuf - 1;
  if (P.jumpBuf > 0 && P.coyote > 0) {
    P.vy = -12.3 - Math.abs(P.vx) * 0.18;
    P.coyote = 0; P.jumpBuf = 0; P.onGround = false;
    sfx.jump();
  }
  if (!kJump() && P.vy < -4.5) P.vy = -4.5;
  P.vy = Math.min(P.vy + 0.55, 12);

  if (moveX(P, P.vx)) P.vx = 0;
  P.onGround = false;
  moveY(P, P.vy, hitBlock);

  P.anim += Math.abs(P.vx) * 0.09;
  if (P.x < 0) P.x = 0;
}

/* ------------------------------ Enemigos ---------------------------- */
function updateEnemies() {
  for (const e of enemies) {
    if (e.state === 'gone') continue;
    if (!e.active) { if (e.x < G.cam + W + 64 && e.x > G.cam - 200) e.active = true; else continue; }
    if (e.state === 'squashed') { if (++e.timer > 30) e.state = 'gone'; continue; }
    if (e.state === 'flipped') {
      e.vy += 0.5; e.x += e.vx; e.y += e.vy;
      if (e.y > H + 100) e.state = 'gone';
      continue;
    }
    if (e.type === 'walker') {
      e.anim += 0.15;
      if (moveX(e, e.vx)) { e.vx = -e.vx; }
      e.face = Math.sign(e.vx) || e.face;
      e.vy = Math.min(e.vy + 0.5, 10);
      moveY(e, e.vy);
      if (e.y > H + 100) e.state = 'gone';
    } else {
      e.t++;
      const nx = e.x0 + Math.sin(e.t * 0.018) * 70;
      e.face = nx >= e.x ? 1 : -1;
      e.x = nx;
      e.y = e.y0 + Math.sin(e.t * 0.05) * 16;
    }
  }
  if (P.dead) return;
  for (const e of enemies) {
    if (e.state !== 'alive' || !e.active) continue;
    if (!overlap(P, e)) continue;
    if (P.vy > 0 && (P.y + P.h) - e.y < 14 + P.vy) {
      if (e.type === 'walker') { e.state = 'squashed'; e.timer = 0; }
      else { e.state = 'flipped'; e.vy = -4; e.vx = P.face * 1.2; }
      addScore(100); addPopup(e.x, e.y - 8, '100', '#ffd166');
      spark(e.x + e.w / 2, e.y + e.h / 2, e.type === 'walker' ? '#ff8a70' : '#a67bff', 10);
      sfx.stomp();
      P.vy = kJump() ? -10.5 : -6.5; P.onGround = false;
    } else {
      die(); return;
    }
  }
}

/* ----------------------------- Actualización ------------------------ */
function updateEffects() {
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= 0.7; if (--p.life <= 0) popups.splice(i, 1); }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.vy += 0.25; p.x += p.vx; p.y += p.vy; if (--p.life <= 0) particles.splice(i, 1); }
  for (let i = coinPops.length - 1; i >= 0; i--) { const p = coinPops[i]; p.vy += 0.55; p.y += p.vy; if (--p.life <= 0) coinPops.splice(i, 1); }
  for (const [k, v] of bumps) { if (v >= 10) bumps.delete(k); else bumps.set(k, v + 1); }
  for (const c of cars) { c.x += c.v; if (c.x > W + 30) c.x = -30; if (c.x < -30) c.x = W + 30; }
}
function updateCam(snap) {
  const target = P.x + P.w / 2 - W * 0.42;
  G.cam = snap ? target : G.cam + (target - G.cam) * 0.12;
  G.cam = clamp(G.cam, 0, LW * TILE - W);
}
function updatePlay() {
  G.frames++;
  if (G.frames % 60 === 0) { G.time--; if (G.time <= 0) { G.time = 0; die(); return; } }
  updatePlayer();
  updateEnemies();
  if (P.dead) return;

  for (const c of energyCells) {
    if (c.taken) continue;
    if (Math.abs(P.x + P.w / 2 - c.x) < 18 && Math.abs(P.y + P.h / 2 - c.y) < 22) {
      c.taken = true; gainEnergy(); spark(c.x, c.y, '#ffd166', 6);
    }
  }
  if (!G.checkpoint && P.x > CHECK_X * TILE) { G.checkpoint = true; sfx.check(); addPopup(P.x - 30, P.y - 20, 'CHECKPOINT', '#00e5ff'); }

  if (P.x + P.w > POLE_PX && P.x < POLE_PX + 4 && P.y + P.h > 3 * TILE && P.y < GROUND * TILE) {
    grabFlag();
  } else if (P.x > DOOR_X * TILE - 10) {
    finishLevel();
  }
  if (P.y > H + 60) die();
  updateCam(false);
}
function grabFlag() {
  G.state = 'flag'; P.hang = true; P.vx = 0; P.vy = 0;
  P.x = POLE_PX - P.w + 2; P.face = 1;
  const frac = clamp(((GROUND - 1) * TILE - P.y) / (8 * TILE), 0, 1);
  const pts = frac > 0.85 ? 5000 : frac > 0.6 ? 2000 : frac > 0.35 ? 800 : frac > 0.15 ? 400 : 100;
  addScore(pts); addPopup(POLE_PX + 10, P.y, String(pts), '#ff3fb4');
  sfx.flag();
}
function updateFlag() {
  P.y += 2.5; G.flagY = Math.min(G.flagY + 2.5, (GROUND - 1) * TILE - 28);
  if (P.y + P.h >= GROUND * TILE) {
    P.y = GROUND * TILE - P.h;
    if (++G.winTimer > 20) { G.state = 'walkout'; P.hang = false; P.x = POLE_PX + 6; P.face = 1; P.onGround = true; }
  }
}
function updateWalkout() {
  P.vx = 1.8; P.vy = Math.min(P.vy + 0.55, 12);
  moveX(P, P.vx); P.onGround = false; moveY(P, P.vy);
  P.anim += 0.16;
  if (P.x > DOOR_X * TILE - 10) finishLevel();
}
function finishLevel() {
  if (G.state === 'win') return;
  G.state = 'win'; G.winTimer = 0; P.hidden = true; sfx.win();
}
function updateWin() {
  G.winTimer++;
  if (G.winTimer > 50 && G.time > 0) { const s = Math.min(G.time, 3); G.time -= s; addScore(s * 50); if (G.winTimer % 3 === 0) tone(1500, 0.03, 'square', 0.02); }
  else if (G.winTimer > 50) G.bonusDone = true;
  if (G.bonusDone && pressed.Enter) { G.state = 'title'; }
}
function updateDying() {
  G.dyingTimer++;
  P.vy += 0.5; P.y += P.vy;
  if (G.dyingTimer > 150) {
    G.lives--;
    if (G.lives <= 0) G.state = 'gameover';
    else { resetLevel(); G.state = 'play'; }
  }
}

function update() {
  G.t++;
  if (pressed.KeyM) muted = !muted;
  switch (G.state) {
    case 'title':
      G.cam = (G.cam + 0.6) % (LW * TILE - W);
      if (pressed.Enter || pressed.Space) startGame();
      break;
    case 'play':
      if (pressed.KeyP || pressed.Escape) G.paused = !G.paused;
      if (pressed.KeyR) { startGame(); break; }
      if (!G.paused) { updatePlay(); updateEffects(); }
      break;
    case 'dying': updateDying(); updateEffects(); break;
    case 'flag': updateFlag(); updateEffects(); updateCam(false); break;
    case 'walkout': updateWalkout(); updateEffects(); updateCam(false); break;
    case 'win': updateWin(); updateEffects(); break;
    case 'gameover':
      updateEffects();
      if (pressed.Enter) G.state = 'title';
      break;
  }
  for (const k in pressed) pressed[k] = false;
}

/* ------------------------------- Sprites ---------------------------- */
function drawRobot(c, x, y, face, pose, frame, t) {
  c.save();
  c.translate(Math.round(x) + 16, Math.round(y));
  c.scale(face, 1);
  c.translate(-16, 0);
  const R = (col, a, b, w, h) => { c.fillStyle = col; c.fillRect(a, b, w, h); };
  // piernas
  let lL = [10, 24, 5, 6], lR = [17, 24, 5, 6];
  if (pose === 'walk') {
    const f = frame % 4;
    if (f === 0) { lL = [8, 24, 5, 6]; lR = [19, 23, 5, 5]; }
    else if (f === 1) { lL = [10, 24, 5, 6]; lR = [17, 24, 5, 6]; }
    else if (f === 2) { lL = [12, 23, 5, 5]; lR = [14, 24, 5, 6]; }
    else { lL = [10, 24, 5, 6]; lR = [17, 24, 5, 6]; }
  } else if (pose === 'jump' || pose === 'hang') { lL = [8, 23, 5, 6]; lR = [19, 24, 5, 5]; }
  else if (pose === 'skid') { lL = [7, 24, 5, 6]; lR = [12, 24, 5, 6]; }
  R('#2a3563', lL[0], lL[1], lL[2], lL[3]); R('#2a3563', lR[0], lR[1], lR[2], lR[3]);
  R('#141a3c', lL[0] - 1, lL[1] + lL[3] - 2, lL[2] + 2, 2); R('#141a3c', lR[0] - 1, lR[1] + lR[3] - 2, lR[2] + 2, 2);
  // brazos
  const armUp = pose === 'jump' || pose === 'hang';
  const sw = pose === 'walk' ? ((frame % 2) ? 1 : -1) : 0;
  const ay = armUp ? 11 : 15 + sw;
  R('#cfd8ff', 6, ay, 3, 8); R('#8fa0e8', 6, ay + 7, 3, 2);
  R('#cfd8ff', 23, armUp ? 11 : 15 - sw, 3, 8); R('#8fa0e8', 23, (armUp ? 11 : 15 - sw) + 7, 3, 2);
  // batería trasera
  R('#ffb300', 7, 16, 2, 6); R('#fff08a', 7, 16, 2, 1);
  // torso
  R('#4f7bff', 9, 14, 14, 10); R('#7ea0ff', 9, 14, 14, 2); R('#2f4fc2', 9, 22, 14, 2);
  R('#16204f', 13, 16, 6, 6);
  R((Math.floor(t / 20) % 2) ? '#ffd166' : '#ff9d3c', 14, 17, 4, 4);
  // cabeza
  R('#9aa6e8', 15, 0, 2, 3); R((Math.floor(t / 15) % 2) ? '#ff3b6b' : '#00e5ff', 14, 0, 4, 2);
  R('#d6defc', 8, 3, 16, 11); R('#ffffff', 8, 3, 16, 2); R('#a7b3e8', 22, 3, 2, 11); R('#a7b3e8', 8, 12, 16, 2);
  R('#0a0f2a', 10, 6, 13, 5);
  R('rgba(0,229,255,0.35)', 10, 6, 13, 5);
  R('#00e5ff', 13, 7, 3, 3); R('#00e5ff', 18, 7, 3, 3);
  R('#d9fcff', 13, 7, 1, 1); R('#d9fcff', 18, 7, 1, 1);
  c.restore();
}
function drawWalker(c, e, camX) {
  const x = Math.round(e.x - camX), y = Math.round(e.y);
  c.save();
  if (e.state === 'flipped') { c.translate(x + 13, y + 13); c.scale(1, -1); c.translate(-13, -13); }
  else c.translate(x, y);
  if (e.state === 'squashed') { c.translate(0, 18); c.scale(1, 0.3); }
  const R = (col, a, b, w, h) => { c.fillStyle = col; c.fillRect(a, b, w, h); };
  R('#20233d', 0, 18, 26, 8);
  const off = Math.floor(e.anim) % 4;
  for (let i = 0; i < 7; i++) R('#5a62a0', 1 + i * 4 + off - 2 > 0 ? 1 + i * 4 + (off % 4) : 1, 20, 2, 4);
  R('#0d0f20', 0, 24, 26, 2);
  c.fillStyle = '#d94f3d'; c.beginPath(); c.arc(13, 18, 12, Math.PI, 0); c.fill();
  c.fillStyle = '#ff8a70'; c.beginPath(); c.arc(11, 14, 7, Math.PI * 1.05, Math.PI * 1.7); c.lineTo(11, 14); c.fill();
  R('#8f2a1f', 1, 17, 24, 3);
  R('#ffffff', 8, 10, 10, 8);
  R('#ff3b3b', 12 + (e.face || -1) * 2, 12, 4, 5);
  R('#1a0a0a', 13 + (e.face || -1) * 2, 13, 2, 3);
  R('#4a0f0a', 7, 8, 5, 2); R('#4a0f0a', 14, 8, 5, 2);
  R('#9aa6e8', 12, 0, 2, 5); R('#ffd166', 11, 0, 4, 2);
  c.restore();
}
function drawDrone(c, e, camX, t) {
  const x = Math.round(e.x - camX), y = Math.round(e.y);
  c.save();
  if (e.state === 'flipped') { c.translate(x + 14, y + 11); c.scale(1, -1); c.translate(-14, -11); }
  else c.translate(x, y);
  const R = (col, a, b, w, h) => { c.fillStyle = col; c.fillRect(a, b, w, h); };
  const fl = Math.floor(t / 2) % 2;
  R('#cfd8ff', 0, 5, 9, 2); R('#cfd8ff', 19, 5, 9, 2);
  R('#e8ecff', fl ? 0 : 3, 3, fl ? 9 : 5, 1); R('#e8ecff', fl ? 19 : 20, 3, fl ? 9 : 5, 1);
  R('#6b6f99', 8, 5, 2, 6); R('#6b6f99', 18, 5, 2, 6);
  c.fillStyle = '#7b3fe4'; c.beginPath(); c.ellipse(14, 12, 12, 7, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#a67bff'; c.beginPath(); c.ellipse(14, 10, 10, 4, 0, Math.PI, 0); c.fill();
  R('#2a1160', 3, 14, 22, 2);
  R('#06182a', 10, 9, 8, 6); R('#00e5ff', 12, 10, 4, 4); R('#d9fcff', 12, 10, 1, 1);
  R((Math.floor(t / 10) % 2) ? '#ff3b6b' : '#ffd166', 13, 17, 2, 2);
  c.restore();
}
function drawCell(c, cx, cy, t, ph) {
  const w = Math.abs(Math.cos(t * 0.07 + ph)) * 7 + 2;
  c.fillStyle = 'rgba(255,209,102,0.18)'; c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#a86b00'; c.fillRect(cx - w - 1, cy - 10, 2 * w + 2, 20);
  c.fillStyle = '#ffd166'; c.fillRect(cx - w, cy - 9, 2 * w, 18);
  c.fillStyle = '#fff3b0'; c.fillRect(cx - w, cy - 9, Math.max(1, w * 0.5), 18);
  if (w > 6) { c.fillStyle = '#a86b00'; c.fillRect(cx - 1, cy - 5, 2, 10); c.fillRect(cx - 3, cy - 1, 6, 2); }
}

/* ------------------------------ Render ------------------------------ */
function drawLayer(img, factor, camX) {
  const w = img.width;
  const off = Math.round(-((camX * factor) % w));
  ctx.drawImage(img, off, 0); ctx.drawImage(img, off + w, 0);
}
function glowText(txt, x, y, size, col, glow, align = 'center') {
  ctx.font = 'bold ' + size + 'px "Courier New", monospace';
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = glow; ctx.shadowBlur = 16;
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0;
}
function hudText(txt, x, y, align = 'left', size = 16, col = '#fff') {
  ctx.font = 'bold ' + size + 'px "Courier New", monospace';
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000'; ctx.fillText(txt, x + 2, y + 2);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
const pad = (n, l) => String(Math.max(0, n | 0)).padStart(l, '0');

function drawLamp(tx, camX, t) {
  const x = tx * TILE - camX + 14, y = GROUND * TILE;
  ctx.fillStyle = '#3a4170'; ctx.fillRect(x, y - 76, 4, 76); ctx.fillRect(x, y - 78, 16, 4);
  ctx.fillStyle = '#20264a'; ctx.fillRect(x - 3, y - 6, 10, 6);
  const g = ctx.createRadialGradient(x + 14, y - 70, 2, x + 14, y - 70, 46);
  g.addColorStop(0, 'rgba(0,229,255,0.5)'); g.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 32, y - 116, 92, 92);
  ctx.fillStyle = '#c9fbff'; ctx.fillRect(x + 11, y - 74, 8, 4);
}
function drawSign(tx, camX, t) {
  const x = tx * TILE - camX + 6, y = GROUND * TILE;
  ctx.fillStyle = '#3a4170'; ctx.fillRect(x + 28, y - 56, 4, 56);
  ctx.fillStyle = '#0a0820'; ctx.fillRect(x, y - 100, 60, 44);
  ctx.fillStyle = '#ff3fb4'; ctx.fillRect(x + 2, y - 98, 56, 2); ctx.fillRect(x + 2, y - 60, 56, 2);
  ctx.fillStyle = '#00e5ff'; ctx.fillRect(x + 2, y - 98, 2, 40); ctx.fillRect(x + 56, y - 98, 2, 40);
  for (let i = 0; i < 4; i++) {
    const w = 14 + ((Math.floor(t / 12) + i * 5 + tx) % 5) * 6;
    ctx.fillStyle = ['#ffd75a', '#00e5ff', '#ff3fb4', '#7dff9b'][i];
    ctx.fillRect(x + 8, y - 92 + i * 9, w, 4);
  }
}
function drawCheckpoint(camX, t) {
  const x = CHECK_X * TILE - camX + 12, y = GROUND * TILE;
  ctx.fillStyle = '#6b6f99'; ctx.fillRect(x, y - 64, 4, 64);
  ctx.fillStyle = '#3a4170'; ctx.fillRect(x - 4, y - 6, 12, 6);
  const on = G.checkpoint;
  ctx.fillStyle = on ? '#7dff9b' : '#ff3b6b';
  ctx.fillRect(x - 5, y - 74, 14, 10);
  ctx.fillStyle = on ? '#d8ffe3' : '#ffb0c4'; ctx.fillRect(x - 3, y - 72, 5, 3);
  if (on) { ctx.fillStyle = 'rgba(125,255,155,0.25)'; ctx.beginPath(); ctx.arc(x + 2, y - 69, 16 + Math.sin(t * 0.1) * 2, 0, Math.PI * 2); ctx.fill(); }
}
function drawFlagpole(camX, t) {
  const px = POLE_PX - camX, top = 3 * TILE, bottom = (GROUND - 1) * TILE;
  const g = ctx.createLinearGradient(px, 0, px + 4, 0);
  g.addColorStop(0, '#8f9bd8'); g.addColorStop(0.5, '#f0f3ff'); g.addColorStop(1, '#6b74b0');
  ctx.fillStyle = g; ctx.fillRect(px, top, 4, bottom - top);
  ctx.fillStyle = 'rgba(0,229,255,0.3)'; ctx.beginPath(); ctx.arc(px + 2, top - 6, 12 + Math.sin(t * 0.1) * 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.arc(px + 2, top - 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9fcff'; ctx.fillRect(px, top - 9, 2, 2);
  ctx.drawImage(tex.steel, POLE_X * TILE - camX, (GROUND - 1) * TILE);
  const fy = G.flagY;
  ctx.fillStyle = '#ff3fb4'; ctx.beginPath(); ctx.moveTo(px, fy); ctx.lineTo(px - 30, fy + 12); ctx.lineTo(px, fy + 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd1ef'; ctx.beginPath(); ctx.moveTo(px - 4, fy + 6); ctx.lineTo(px - 14, fy + 12); ctx.lineTo(px - 4, fy + 18); ctx.closePath(); ctx.fill();
}
function drawStation(camX, t) {
  const x = 192 * TILE - camX, y = GROUND * TILE, w = 5 * TILE, h = 7 * TILE;
  ctx.fillStyle = '#1a1546'; ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = '#2c2478'; ctx.fillRect(x, y - h, w, 4); ctx.fillRect(x + w - 4, y - h, 4, h);
  ctx.fillStyle = '#1a1546'; ctx.fillRect(x + 20, y - h - 20, w - 40, 20);
  ctx.fillStyle = '#2c2478'; ctx.fillRect(x + 20, y - h - 20, w - 40, 3);
  ctx.fillStyle = '#9aa6e8'; ctx.fillRect(x + w / 2 - 1, y - h - 56, 3, 36);
  ctx.fillStyle = (Math.floor(t / 20) % 2) ? '#ff3b6b' : '#7a1d3a'; ctx.fillRect(x + w / 2 - 3, y - h - 60, 7, 7);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    ctx.fillStyle = ((r * 7 + c * 3) % 5 === 0) ? '#35e6ff' : ((r + c) % 3 === 0 ? '#ffd75a' : '#ff3fb4');
    ctx.globalAlpha = 0.75; ctx.fillRect(x + 14 + c * 24, y - h + 18 + r * 24, 10, 12); ctx.globalAlpha = 1;
  }
  const dx = x + w / 2 - 20;
  ctx.fillStyle = '#05030f'; ctx.fillRect(dx - 3, y - 70, 46, 70);
  const g = ctx.createLinearGradient(0, y - 66, 0, y);
  g.addColorStop(0, '#00e5ff'); g.addColorStop(1, '#0a6b80');
  ctx.fillStyle = g; ctx.fillRect(dx, y - 66, 40, 66);
  ctx.fillStyle = '#c9fbff'; ctx.fillRect(dx + 18, y - 66, 4, 66);
  ctx.fillStyle = '#ff3fb4'; ctx.fillRect(dx - 3, y - 74, 46, 4);
}

function render() {
  const camX = Math.round(G.cam), t = G.t;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg.sky, 0, 0);
  drawLayer(bg.far, 0.12, camX);
  for (const c of cars) {
    ctx.fillStyle = c.c; ctx.globalAlpha = 0.9; ctx.fillRect(c.x, c.y, 8, 3);
    ctx.globalAlpha = 0.3; ctx.fillRect(c.v > 0 ? c.x - 16 : c.x + 8, c.y + 1, 16, 1); ctx.globalAlpha = 1;
  }
  drawLayer(bg.mid, 0.32, camX);

  drawStation(camX, t);
  for (const x of lamps) if (x * TILE - camX > -64 && x * TILE - camX < W + 64) drawLamp(x, camX, t);
  for (const x of signs) if (x * TILE - camX > -96 && x * TILE - camX < W + 64) drawSign(x, camX, t);
  drawCheckpoint(camX, t);
  drawFlagpole(camX, t);

  // celdas de energía
  for (const c of energyCells) if (!c.taken && c.x - camX > -20 && c.x - camX < W + 20) drawCell(ctx, c.x - camX, c.y, t, c.ph);

  // bloques
  const sx = Math.max(0, Math.floor(camX / TILE)), ex = Math.min(LW - 1, Math.floor((camX + W) / TILE));
  for (let y = 0; y < LH; y++) {
    for (let x = sx; x <= ex; x++) {
      const tt = grid[y][x];
      if (!tt) continue;
      const b = bumps.get(y * LW + x);
      const off = b !== undefined ? -Math.round(Math.sin(b / 10 * Math.PI) * 8) : 0;
      const px = x * TILE - camX, py = y * TILE + off;
      ctx.drawImage(tex.byType[tt], px, py);
      if (tt === T.ENERGY) {
        const a = 0.1 + 0.1 * Math.sin(t * 0.1 + x);
        ctx.fillStyle = 'rgba(255,240,150,' + a.toFixed(2) + ')'; ctx.fillRect(px + 5, py + 5, 22, 22);
      }
    }
  }

  // enemigos
  for (const e of enemies) {
    if (e.state === 'gone' || e.x - camX < -40 || e.x - camX > W + 40) continue;
    if (e.type === 'walker') drawWalker(ctx, e, camX); else drawDrone(ctx, e, camX, t);
  }
  for (const p of coinPops) drawCell(ctx, p.x - camX, p.y, t, 0);
  for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), 3, 3); }

  // jugador
  if (P && !P.hidden) {
    let pose = 'idle';
    if (P.hang) pose = 'hang';
    else if (!P.onGround) pose = 'jump';
    else if (P.skid) pose = 'skid';
    else if (Math.abs(P.vx) > 0.2) pose = 'walk';
    if (P.dead) pose = 'jump';
    drawRobot(ctx, P.x - 5 - camX, P.y - 2, P.face, pose, Math.floor(P.anim), t);
  }
  for (const p of popups) hudText(p.text, p.x - camX, p.y, 'left', 12, p.color);

  drawHUD();
  drawOverlays();
}

function drawHUD() {
  if (G.state === 'title') return;
  hudText('VOLT', 24, 28, 'left', 16, '#00e5ff');
  hudText(pad(G.score, 6), 24, 48, 'left', 16);
  drawCell(ctx, 218, 34, G.t, 0);
  hudText('x' + pad(G.coins, 2), 234, 40, 'left', 16);
  hudText('ZONA', 370, 28, 'center', 16, '#ff3fb4');
  hudText('1-NEO', 370, 48, 'center', 16);
  hudText('TIEMPO', 520, 28, 'center', 16, '#ffd166');
  hudText(pad(G.time, 3), 520, 48, 'center', 16, G.time <= 60 ? '#ff6b6b' : '#fff');
  hudText('VIDAS', 700, 28, 'center', 16, '#7dff9b');
  ctx.fillStyle = '#d6defc'; ctx.fillRect(668, 36, 12, 10); ctx.fillStyle = '#0a0f2a'; ctx.fillRect(670, 39, 8, 4); ctx.fillStyle = '#00e5ff'; ctx.fillRect(672, 40, 2, 2); ctx.fillRect(675, 40, 2, 2);
  hudText('x' + G.lives, 686, 47, 'left', 16);
  if (muted) hudText('SIN SONIDO', W - 10, H - 10, 'right', 12, '#8f9bd8');
}
function drawOverlays() {
  if (G.state === 'title') {
    ctx.fillStyle = 'rgba(5,3,15,0.5)'; ctx.fillRect(0, 0, W, H);
    glowText('NEON RUNNER', W / 2, 150, 60, '#00e5ff', '#00e5ff');
    glowText('NEON RUNNER', W / 2 + 3, 153, 60, 'rgba(255,63,180,0.45)', '#ff3fb4');
    hudText('El robot VOLT cruza la ciudad del futuro', W / 2, 195, 'center', 16, '#cfd8ff');
    const y = 292 + Math.round(Math.sin(G.t * 0.08) * 3);
    drawRobot(ctx, W / 2 - 16, y - 32, 1, 'idle', 0, G.t);
    if (Math.floor(G.t / 30) % 2 === 0) glowText('PRESIONÁ ENTER PARA JUGAR', W / 2, 372, 22, '#ffd166', '#ff9d3c');
    hudText('← → mover   ↑ / ESPACIO saltar   SHIFT turbo   P pausa   M sonido', W / 2, 430, 'center', 13, '#8f9bd8');
  } else if (G.paused) {
    ctx.fillStyle = 'rgba(5,3,15,0.6)'; ctx.fillRect(0, 0, W, H);
    glowText('PAUSA', W / 2, H / 2, 48, '#00e5ff', '#00e5ff');
    hudText('Presioná P para continuar', W / 2, H / 2 + 36, 'center', 16);
  } else if (G.state === 'gameover') {
    ctx.fillStyle = 'rgba(5,3,15,0.7)'; ctx.fillRect(0, 0, W, H);
    glowText('FIN DEL JUEGO', W / 2, H / 2 - 10, 48, '#ff3b6b', '#ff3b6b');
    hudText('Puntaje: ' + pad(G.score, 6), W / 2, H / 2 + 30, 'center', 18);
    if (Math.floor(G.t / 30) % 2 === 0) hudText('ENTER para volver al inicio', W / 2, H / 2 + 66, 'center', 16, '#ffd166');
  } else if (G.state === 'win') {
    ctx.fillStyle = 'rgba(5,3,15,' + Math.min(0.7, G.winTimer / 60).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
    if (G.winTimer > 20) {
      glowText('¡ZONA COMPLETADA!', W / 2, H / 2 - 30, 44, '#7dff9b', '#7dff9b');
      hudText('Puntaje: ' + pad(G.score, 6), W / 2, H / 2 + 14, 'center', 20);
      hudText('Bonus de tiempo: ' + pad(G.time, 3) + ' x 50', W / 2, H / 2 + 44, 'center', 16, '#ffd166');
      if (G.bonusDone && Math.floor(G.t / 30) % 2 === 0) hudText('ENTER para jugar de nuevo', W / 2, H / 2 + 86, 'center', 16, '#00e5ff');
    }
  }
}

/* ------------------------------ Bucle ------------------------------- */
buildTextures();
buildBackground();
resetLevel();
G.state = 'title';

let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__game = { G, update, render, keys, pressed, get P() { return P; }, get enemies() { return enemies; }, constants: { TILE, LW, POLE_X, DOOR_X, GROUND } };
})();
