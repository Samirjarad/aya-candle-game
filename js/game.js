/*
  Light AYA Candels
  - 60s arcade: tap candels (+1), avoid bombs (-5), tap gifts (+1/+2/+3 seconds)
  - Speed & spawn ramp up with time
  - Minimal, dependency-free, GitHub Pages friendly
*/

// ----------------------------
// Config
// ----------------------------
const CONFIG = {
  durationSeconds: 60,
  // spawn rates are dynamic (see getSpawnIntervalMs)
  baseFallSpeed: 105, // px/s for candels at t=0
  baseBombSpeed: 165, // px/s for bombs at t=0
  baseGiftSpeed: 125, // px/s for gifts at t=0
  maxSpeedMultiplier: 2.1,

  // probabilities per spawn
  pBomb: 0.18,
  pGift: 0.10,

  // gift time add values
  giftSeconds: [1, 2, 3],
  giftWeights: [0.55, 0.30, 0.15],

  // object size for collision-ish / tap area
  objW: 78,
  objH: 92,

  // match movement
  matchMoveDurationMs: 120,

  // voucher
  voucherPrefix: 'AYA10',

  // optional: your Canva store URL for Back button
  storeUrl: 'https://byggritningarna.se/aya-candle-boutique',

  // Formspree placeholder to remind user
  formspreePlaceholder: 'https://formspree.io/f/REPLACE_WITH_YOUR_FORM_ID'
};

// ----------------------------
// DOM
// ----------------------------
const $ = (sel) => document.querySelector(sel);

const screenStart = $('#screenStart');
const screenGame = $('#screenGame');
const screenOver = $('#screenOver');

const btnStart = $('#btnStart');
const btnHow = $('#btnHow');
const modalHow = $('#modalHow');

const gameEl = $('#game');
const objLayer = $('#objLayer');
const fxLayer = $('#fxLayer');

const hudTime = $('#hudTime');
const hudScore = $('#hudScore');
const btnPause = $('#btnPause');
const btnQuit = $('#btnQuit');

const matchEl = $('#match');
const matchFlame = $('#matchFlame');

const toast = $('#toast');

const finalScoreEl = $('#finalScore');
const voucherCodeEl = $('#voucherCode');
const btnCopyVoucher = $('#btnCopyVoucher');
const btnPlayAgain = $('#btnPlayAgain');
const btnBackToStore = $('#btnBackToStore');

const scoreForm = $('#scoreForm');
const fieldScore = $('#fieldScore');
const fieldVoucher = $('#fieldVoucher');
const fieldPlayedAt = $('#fieldPlayedAt');
const fieldBestLocal = $('#fieldBestLocal');

// ----------------------------
// State
// ----------------------------
let rafId = null;
let running = false;
let paused = false;

let score = 0;
let timeLeft = CONFIG.durationSeconds;
let startTs = 0;
let lastFrameTs = 0;
let lastSecondTickTs = 0;

let lastSpawnTs = 0;

const objects = new Map(); // id -> obj
let nextId = 1;

const STORAGE_KEY_BEST = 'lit-aya-candels.bestScore';

// ----------------------------
// Helpers
// ----------------------------
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function lerp(a, b, t){ return a + (b - a) * t; }
function now(){ return performance.now(); }
function rand(min, max){ return Math.random() * (max - min) + min; }
function randInt(min, max){ return Math.floor(rand(min, max + 1)); }

function chooseWeighted(values, weights){
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++){
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1200);
}

function setScreen(active){
  [screenStart, screenGame, screenOver].forEach(s => s.classList.remove('screen--active'));
  active.classList.add('screen--active');
}

function getProgress01(){
  // 0 at start, 1 at end of normal 60 seconds (not counting gift added time)
  const elapsed = Math.max(0, (now() - startTs) / 1000);
  return clamp(elapsed / CONFIG.durationSeconds, 0, 1);
}

function getSpeedMultiplier(){
  // smoothly ramps up
  const t = getProgress01();
  // ease-in
  const eased = t * t;
  return lerp(1, CONFIG.maxSpeedMultiplier, eased);
}

function getSpawnIntervalMs(){
  // gets smaller over time (more frequent spawns)
  // start ~520ms, end ~270ms
  const t = getProgress01();
  const eased = Math.sqrt(t);
  return lerp(520, 270, eased);
}

function getGameRect(){
  return gameEl.getBoundingClientRect();
}

function localBestScore(){
  const v = Number(localStorage.getItem(STORAGE_KEY_BEST) || '0');
  return Number.isFinite(v) ? v : 0;
}

function setLocalBestScore(v){
  localStorage.setItem(STORAGE_KEY_BEST, String(v));
}

function makeVoucher(scoreValue){
  // Low-stakes: generate a human-friendly code.
  // Not secure; just for fun and manual verification.
  const datePart = new Date().toISOString().slice(2,10).replace(/-/g,''); // yymmdd
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${CONFIG.voucherPrefix}-${datePart}-${scoreValue}-${rnd}`;
}

// ----------------------------
// SVG Assets (inline)
// ----------------------------
function svgWrapper(inner){
  return `<svg class="obj__svg" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

function wickSvg(isLit){
  // wick + optional flame glow
  return `
    <path d="M60 18 C57 12, 57 9, 60 6 C63 9, 63 12, 60 18 Z" fill="#e6e6e6" opacity=".9"/>
    <path d="M60 20 C56 25, 56 30, 60 34 C64 30, 64 25, 60 20 Z" fill="#202020" opacity=".85"/>
    ${isLit ? `
      <g filter="url(#glow)">
        <path d="M60 14 C52 24, 54 38, 60 44 C66 38, 68 24, 60 14 Z" fill="#ffd36b" opacity=".95"/>
        <path d="M60 20 C55 28, 56 36, 60 40 C64 36, 65 28, 60 20 Z" fill="#ff8a4b" opacity=".9"/>
      </g>
    ` : ''}
  `;
}

function defsSvg(){
  return `
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
  `;
}

// Candle styles: fruit, animal, geometric, layered
function candleSvg(style, lit=false){
  const base = {
    strawberry: {
      body: `
        <path d="M60 40 C34 40 26 62 28 84 C30 110 46 124 60 124 C74 124 90 110 92 84 C94 62 86 40 60 40 Z" fill="#ff6b7a"/>
        <path d="M44 46 C48 40 52 38 60 38 C68 38 72 40 76 46" fill="none" stroke="#ff95a1" stroke-width="6" stroke-linecap="round" opacity=".7"/>
        <circle cx="44" cy="82" r="3" fill="#ffd36b" opacity=".8"/>
        <circle cx="56" cy="94" r="3" fill="#ffd36b" opacity=".8"/>
        <circle cx="70" cy="84" r="3" fill="#ffd36b" opacity=".8"/>
        <path d="M52 32 C50 24 44 22 40 20" stroke="#4dffb5" stroke-width="6" stroke-linecap="round"/>
        <path d="M68 32 C70 24 76 22 80 20" stroke="#4dffb5" stroke-width="6" stroke-linecap="round"/>
      `,
      accent: '#ff95a1'
    },
    orange: {
      body: `
        <circle cx="60" cy="84" r="42" fill="#ffb14b"/>
        <circle cx="44" cy="78" r="10" fill="#ffd36b" opacity=".55"/>
        <path d="M38 92 C50 104 70 104 82 92" fill="none" stroke="#ff8a4b" stroke-width="8" stroke-linecap="round" opacity=".75"/>
        <path d="M62 36 C60 28 56 24 50 20" stroke="#4dffb5" stroke-width="7" stroke-linecap="round"/>
        <path d="M66 36 C70 30 76 28 82 26" stroke="#4dffb5" stroke-width="7" stroke-linecap="round" opacity=".9"/>
      `,
      accent: '#ff8a4b'
    },
    pear: {
      body: `
        <path d="M60 40 C52 44 46 54 48 66 C40 72 34 84 36 96 C40 116 50 124 60 124 C70 124 80 116 84 96 C86 84 80 72 72 66 C74 54 68 44 60 40 Z" fill="#c8ff7a"/>
        <path d="M60 40 C58 30 56 24 50 18" stroke="#6b4b2f" stroke-width="8" stroke-linecap="round"/>
        <circle cx="50" cy="90" r="8" fill="#ffffff" opacity=".18"/>
      `,
      accent: '#7cffb1'
    },
    bunny: {
      body: `
        <path d="M44 44 C38 22 48 18 52 34" fill="#ffd9ef"/>
        <path d="M76 44 C82 22 72 18 68 34" fill="#ffd9ef"/>
        <path d="M60 42 C38 42 32 62 34 84 C36 110 46 124 60 124 C74 124 84 110 86 84 C88 62 82 42 60 42 Z" fill="#ffe7f6"/>
        <circle cx="48" cy="78" r="5" fill="#232323"/>
        <circle cx="72" cy="78" r="5" fill="#232323"/>
        <path d="M60 84 C56 86 56 92 60 94 C64 92 64 86 60 84 Z" fill="#ff8ab5"/>
        <path d="M54 96 C58 100 62 100 66 96" fill="none" stroke="#ff8ab5" stroke-width="5" stroke-linecap="round"/>
      `,
      accent: '#ff8ab5'
    },
    cat: {
      body: `
        <path d="M40 52 L34 36 L50 44" fill="#cfe6ff"/>
        <path d="M80 52 L86 36 L70 44" fill="#cfe6ff"/>
        <path d="M60 44 C38 44 32 62 34 84 C36 110 46 124 60 124 C74 124 84 110 86 84 C88 62 82 44 60 44 Z" fill="#dff0ff"/>
        <circle cx="50" cy="80" r="5" fill="#1d1d1d"/>
        <circle cx="70" cy="80" r="5" fill="#1d1d1d"/>
        <path d="M60 86 C58 88 58 92 60 94 C62 92 62 88 60 86 Z" fill="#ff7a7a"/>
        <path d="M44 90 C50 92 54 94 58 96" stroke="#9abde0" stroke-width="4" stroke-linecap="round"/>
        <path d="M76 90 C70 92 66 94 62 96" stroke="#9abde0" stroke-width="4" stroke-linecap="round"/>
      `,
      accent: '#9abde0'
    },
    cube: {
      body: `
        <path d="M32 56 L60 42 L88 56 L88 104 L60 118 L32 104 Z" fill="#c9b6ff"/>
        <path d="M60 42 L60 118" stroke="#ffffff" stroke-width="4" opacity=".18"/>
        <path d="M32 56 L60 70 L88 56" fill="none" stroke="#8c6cff" stroke-width="6" opacity=".6"/>
      `,
      accent: '#8c6cff'
    },
    pyramid: {
      body: `
        <path d="M60 40 L92 112 L28 112 Z" fill="#ffd36b"/>
        <path d="M60 40 L60 112" stroke="#ff8a4b" stroke-width="6" opacity=".6"/>
        <path d="M60 40 L92 112" stroke="#ffffff" stroke-width="4" opacity=".18"/>
      `,
      accent: '#ff8a4b'
    },
    layered: {
      body: `
        <rect x="34" y="44" width="52" height="78" rx="18" fill="#a8f0ff"/>
        <rect x="34" y="64" width="52" height="18" rx="10" fill="#b77cff" opacity=".75"/>
        <rect x="34" y="88" width="52" height="18" rx="10" fill="#ffd36b" opacity=".75"/>
        <path d="M38 58 C52 52 68 52 82 58" fill="none" stroke="#ffffff" stroke-width="5" opacity=".2"/>
      `,
      accent: '#58d7ff'
    }
  };

  const s = base[style] || base.layered;
  const glowRing = lit ? `<circle cx="60" cy="84" r="54" fill="none" stroke="${s.accent}" stroke-width="6" opacity=".35" filter="url(#glow)"/>` : '';

  return svgWrapper(`
    ${defsSvg()}
    ${glowRing}
    ${wickSvg(lit)}
    ${s.body}
  `);
}

function bombSvg(){
  return svgWrapper(`
    ${defsSvg()}
    <circle cx="60" cy="86" r="42" fill="#2a2a34"/>
    <circle cx="48" cy="76" r="12" fill="#ffffff" opacity=".12"/>
    <rect x="52" y="40" width="16" height="18" rx="6" fill="#3a3a48"/>
    <path d="M60 40 C62 28 72 24 82 20" fill="none" stroke="#9a9aa8" stroke-width="7" stroke-linecap="round"/>
    <path d="M84 20 C90 18 96 22 94 28" fill="none" stroke="#ffd36b" stroke-width="5" stroke-linecap="round"/>
    <circle cx="94" cy="28" r="4" fill="#ffd36b" filter="url(#glow)"/>
    <path d="M42 98 C52 106 68 106 78 98" fill="none" stroke="#15151a" stroke-width="10" opacity=".45" stroke-linecap="round"/>
  `);
}

function giftSvg(){
  return svgWrapper(`
    ${defsSvg()}
    <rect x="28" y="56" width="64" height="62" rx="12" fill="#58d7ff" opacity=".9"/>
    <rect x="28" y="56" width="64" height="22" rx="12" fill="#b77cff" opacity=".92"/>
    <rect x="56" y="56" width="10" height="62" rx="5" fill="#ffd36b" opacity=".95"/>
    <path d="M60 56 C52 52 44 52 40 58 C46 62 54 60 60 56 Z" fill="#ffd36b"/>
    <path d="M60 56 C68 52 76 52 80 58 C74 62 66 60 60 56 Z" fill="#ffd36b"/>
    <circle cx="42" cy="98" r="4" fill="#ffffff" opacity=".4"/>
    <circle cx="80" cy="90" r="3" fill="#ffffff" opacity=".35"/>
  `);
}

// ----------------------------
// Object creation
// ----------------------------
function createObj(type){
  const rect = getGameRect();

  const x = rand(CONFIG.objW * 0.6, rect.width - CONFIG.objW * 0.6);
  const y = -CONFIG.objH * 0.6;

  const id = String(nextId++);

  const el = document.createElement('div');
  el.className = `obj obj--${type}`;
  el.dataset.id = id;
  el.dataset.type = type;
  el.style.transform = `translate(${x}px, ${y}px)`;

  // add shadow & svg
  const shadow = document.createElement('div');
  shadow.className = 'obj__shadow';

  const svgWrap = document.createElement('div');
  svgWrap.className = 'obj__svgwrap';

  let svg = '';
  let meta = {};

  if (type === 'candel'){
    const styles = ['strawberry','orange','pear','bunny','cat','cube','pyramid','layered'];
    const style = styles[randInt(0, styles.length - 1)];
    meta.style = style;
    svg = candleSvg(style, false);
  } else if (type === 'bomb'){
    svg = bombSvg();
  } else {
    svg = giftSvg();
    const add = chooseWeighted(CONFIG.giftSeconds, CONFIG.giftWeights);
    meta.addSeconds = add;
  }

  svgWrap.innerHTML = svg;

  el.appendChild(shadow);
  el.appendChild(svgWrap.firstElementChild);

  // click / touch
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    onTapObject(id, ev);
  });

  objLayer.appendChild(el);

  // speed
  const speedMult = getSpeedMultiplier();
  let vy;
  if (type === 'bomb') vy = CONFIG.baseBombSpeed * speedMult;
  else if (type === 'gift') vy = CONFIG.baseGiftSpeed * speedMult;
  else vy = CONFIG.baseFallSpeed * speedMult;

  // small horizontal drift for life
  const drift = rand(-24, 24) * (0.35 + getProgress01());

  const obj = {
    id,
    type,
    x,
    y,
    vx: drift,
    vy,
    el,
    meta,
    alive: true
  };

  objects.set(id, obj);
}

function removeObj(id){
  const obj = objects.get(id);
  if (!obj) return;
  obj.alive = false;
  if (obj.el && obj.el.parentNode) obj.el.parentNode.removeChild(obj.el);
  objects.delete(id);
}

// ----------------------------
// FX
// ----------------------------
function fxFloatText(text, x, y, kind){
  const el = document.createElement('div');
  el.className = `float-text float-text--${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function fxBurst(x, y){
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = `${x}px`;
  b.style.top = `${y}px`;
  fxLayer.appendChild(b);
  setTimeout(() => b.remove(), 450);
}

function fxExplosion(x, y){
  const e = document.createElement('div');
  e.className = 'explosion';
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  fxLayer.appendChild(e);
  setTimeout(() => e.remove(), 520);
}

// ----------------------------
// Matchstick animation
// ----------------------------
let matchAnim = null;
function moveMatchToX(targetX){
  const rect = getGameRect();
  // targetX is within game coordinate
  const clamped = clamp(targetX, 20, rect.width - 20);

  if (matchAnim) matchAnim.cancelled = true;
  const start = { t: now(), x: matchEl._x ?? (rect.width/2) };

  matchAnim = { cancelled: false };

  const dx = clamped - start.x;
  const lean = clamp(dx / 160, -0.55, 0.55);

  const step = () => {
    if (matchAnim.cancelled) return;
    const p = clamp((now() - start.t) / CONFIG.matchMoveDurationMs, 0, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const x = start.x + dx * ease;

    matchEl.style.left = `${(x / rect.width) * 100}%`;
    matchEl._x = x;

    // flame leans opposite direction of movement
    matchFlame.style.transform = `rotate(${(-lean*18).toFixed(2)}deg) scaleX(${(1 + Math.abs(lean)*0.25).toFixed(2)})`;

    if (p < 1) requestAnimationFrame(step);
    else {
      // relax back
      matchFlame.style.transform = 'rotate(0deg) scaleX(1)';
    }
  };
  requestAnimationFrame(step);
}

// ----------------------------
// Tap logic
// ----------------------------
function onTapObject(id, ev){
  if (!running || paused) return;

  const obj = objects.get(id);
  if (!obj) return;

  const rect = getGameRect();

  // compute x/y in game coords
  const clientX = ev.clientX ?? (ev.touches && ev.touches[0]?.clientX);
  const clientY = ev.clientY ?? (ev.touches && ev.touches[0]?.clientY);
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  moveMatchToX(x);

  if (obj.type === 'candel'){
    // light candle: swap to lit SVG
    const svg = candleSvg(obj.meta.style || 'layered', true);
    obj.el.querySelector('svg')?.remove();
    obj.el.insertAdjacentHTML('beforeend', svg);

    score += 1;
    hudScore.textContent = String(score);

    fxBurst(obj.x, obj.y);
    fxFloatText('+1', obj.x, obj.y, 'good');

    obj.el.classList.add('is-lit');
    setTimeout(() => removeObj(id), 170);

  } else if (obj.type === 'bomb'){
    score -= 5;
    hudScore.textContent = String(score);

    fxExplosion(obj.x, obj.y);
    fxFloatText('−5', obj.x, obj.y, 'bad');

    obj.el.classList.add('is-lit');
    setTimeout(() => removeObj(id), 160);

  } else if (obj.type === 'gift'){
    const add = Number(obj.meta.addSeconds || 1);
    timeLeft += add;
    hudTime.textContent = String(Math.max(0, Math.ceil(timeLeft)));

    fxBurst(obj.x, obj.y);
    fxFloatText(`+${add}s`, obj.x, obj.y, 'time');

    obj.el.classList.add('is-lit');
    setTimeout(() => removeObj(id), 160);
  }
}

// ----------------------------
// Spawning
// ----------------------------
function spawnMaybe(ts){
  const interval = getSpawnIntervalMs();
  if (ts - lastSpawnTs < interval) return;
  lastSpawnTs = ts;

  // choose type by probability
  const r = Math.random();
  let type = 'candel';
  if (r < CONFIG.pGift) type = 'gift';
  else if (r < CONFIG.pGift + CONFIG.pBomb) type = 'bomb';

  createObj(type);
}

// ----------------------------
// Update loop
// ----------------------------
function tick(ts){
  if (!running){ rafId = null; return; }
  rafId = requestAnimationFrame(tick);
  if (paused) return;

  if (!lastFrameTs) lastFrameTs = ts;
  const dt = Math.min(0.032, (ts - lastFrameTs) / 1000); // cap 32ms
  lastFrameTs = ts;

  // countdown based on dt (allows gifts adding time)
  timeLeft -= dt;
  if (timeLeft <= 0){
    timeLeft = 0;
    hudTime.textContent = '0';
    endGame();
    return;
  }

  // update HUD every ~100ms to reduce jitter
  if (ts - lastSecondTickTs > 90){
    lastSecondTickTs = ts;
    hudTime.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  }

  // spawn
  spawnMaybe(ts);

  // move objects
  const rect = getGameRect();
  const speedMult = getSpeedMultiplier();

  for (const obj of objects.values()){
    // objects created earlier have vy baked; also increase a bit continuously
    const vy = obj.vy * (0.65 + 0.35 * speedMult);
    obj.y += vy * dt;
    obj.x += obj.vx * dt;

    // bounce drift
    if (obj.x < 20){ obj.x = 20; obj.vx = Math.abs(obj.vx); }
    if (obj.x > rect.width - 20){ obj.x = rect.width - 20; obj.vx = -Math.abs(obj.vx); }

    obj.el.style.transform = `translate(${obj.x}px, ${obj.y}px)`;

    // cleanup when off screen
    if (obj.y > rect.height + CONFIG.objH){
      removeObj(obj.id);
    }
  }
}

// ----------------------------
// Game controls
// ----------------------------
function resetGameState(){
  score = 0;
  timeLeft = CONFIG.durationSeconds;
  hudScore.textContent = '0';
  hudTime.textContent = String(CONFIG.durationSeconds);
  objects.forEach((_, id) => removeObj(id));
  objLayer.innerHTML = '';
  fxLayer.innerHTML = '';
  lastFrameTs = 0;
  lastSecondTickTs = 0;
  lastSpawnTs = 0;

  matchEl._x = null;
  matchEl.style.left = '50%';
  matchFlame.style.transform = 'rotate(0deg) scaleX(1)';
}

function startGame(){
  resetGameState();
  setScreen(screenGame);

  running = true;
  paused = false;
  startTs = now();

  btnPause.textContent = '⏸';

  // initial batch so it feels alive
  for (let i = 0; i < 4; i++) createObj('candel');

  if (!rafId) rafId = requestAnimationFrame(tick);
}

function pauseGame(){
  if (!running) return;
  paused = !paused;
  btnPause.textContent = paused ? '▶' : '⏸';
  showToast(paused ? 'Paused' : 'Resumed');
}

function quitToStart(){
  running = false;
  paused = false;
  if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
  resetGameState();
  setScreen(screenStart);
}

function endGame(){
  running = false;
  paused = false;
  if (rafId){ cancelAnimationFrame(rafId); rafId = null; }

  // compute voucher
  const voucher = makeVoucher(score);

  // update best score
  const best = Math.max(localBestScore(), score);
  setLocalBestScore(best);

  // fill UI
  finalScoreEl.textContent = String(score);
  voucherCodeEl.textContent = voucher;

  // fill form fields
  fieldScore.value = String(score);
  fieldVoucher.value = voucher;
  fieldPlayedAt.value = new Date().toISOString();
  fieldBestLocal.value = String(best);

  // back-to-store
  btnBackToStore.href = CONFIG.storeUrl;

  setScreen(screenOver);
}

// ----------------------------
// Modal
// ----------------------------
function openModal(modal){
  modal.setAttribute('aria-hidden','false');
}
function closeModal(modal){
  modal.setAttribute('aria-hidden','true');
}
modalHow.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute('data-close') === 'true') closeModal(modalHow);
});

// ----------------------------
// Wiring
// ----------------------------
btnStart.addEventListener('click', startGame);
btnHow.addEventListener('click', () => openModal(modalHow));

btnPause.addEventListener('click', pauseGame);
btnQuit.addEventListener('click', () => {
  if (confirm('Quit the game?')) quitToStart();
});

btnPlayAgain.addEventListener('click', startGame);

btnCopyVoucher.addEventListener('click', async () => {
  const code = voucherCodeEl.textContent.trim();
  try{
    await navigator.clipboard.writeText(code);
    showToast('Voucher copied');
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Voucher copied');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // Keep end-screen clean: no placeholder warnings shown to players.
  $('#formHint').textContent = '';

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      if (modalHow.getAttribute('aria-hidden') === 'false') closeModal(modalHow);
      else if (running) pauseGame();
    }
  });
});

// Prevent the game from scrolling page on mobile while tapping
['touchmove','gesturestart'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    if (running) e.preventDefault();
  }, { passive: false });
});
