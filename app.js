import { Sandpile, cpuStabilize } from './sim.js';
import { buildExplain } from './explain.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv');
const sim = new Sandpile(cv);

const PALETTES = {
  sand:    ['#1a1410', '#6b4a2b', '#c98a4b', '#f3dcae', '#ff4d2e'],
  classic: ['#000000', '#1f4e9e', '#f2c14e', '#d1342f', '#ffffff'],
  ink:     ['#f4ede1', '#bdb1a3', '#6d625a', '#1e1a17', '#b4562f'],
};
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const SPEEDS = [0.25, 1, 2, 4, 8, 16, 32, 64, 128, 512, Infinity];

const NOTES = {
  center: '가운데 한 칸에 모래를 한꺼번에 붓고 다 무너질 때까지 기다려요. 이 컴퓨터에서 2¹⁸개는 약 6초, 2¹⁹개는 약 20초, 2²⁰개(약 100만)는 1분 넘게 걸려요. 자라는 과정도 볼거리예요.',
  drip: '가운데에 모래를 계속 조금씩 떨어뜨려요. 더미가 자라면서 무늬가 바뀌는 걸 볼 수 있어요.',
  identity: '"아무것도 안 더한 것과 같은" 특별한 모래 배치(항등원)를 계산해요. 격자 크기마다 다른 프랙탈이 나와요.',
  critical: '모든 칸을 무너지기 직전(3개)으로 채우고 가운데 한 알을 떨어뜨려요. 격자 전체가 무너지고 결과는 의외로 단순한 대각선 X. 그다음 캔버스를 여기저기 눌러 한 알씩 더하면 무늬가 겹쳐 복잡해져요.',
  soc: '아무렇게나 쌓인 더미에 한 알씩 무작위로 떨어뜨리고, 그때마다 일어난 눈사태 크기를 기록해요.',
};

const st = {
  preset: 'center', view: 0, pal: 'sand', T: 4, speed: 10, paused: false,
  active: false, phase: null, added: 0, frames: 0, ppf: 64,
  stats: null, odoMax: 1, center: 0, grid: 256, onStable: null,
  soc: null,
};

// ---------- 격자 준비 ----------
function density() { return st.T === 4 ? 2.125 : 4.3; }
function setRule(T) { st.T = T; sim.T = T; sim.moore = T === 8; }

function startCenter() {
  const N = 2 ** +$('nSlider').value;
  const R = Math.sqrt(N / (density() * Math.PI));
  let W = Math.ceil(R * 2 * 1.2) + 12; W += W & 1;
  sim.reset(W);
  st.center = W / 2; st.added = N;
  sim.addSand(st.center, st.center, 0, N);
  st.growBox = true; st.activePasses = 0;
  go(`모래 ${N.toLocaleString()}알 무너지는 중`);
}

function startDrip() {
  const W = 2 ** +$('gSlider').value;
  sim.reset(W); st.center = W / 2; st.added = 0;
  st.growBox = false;
  go('붓는 중');
}

function fill(W, v) { return new Int32Array(W * W).fill(v); }

function startIdentity() {
  const W = 2 ** +$('gSlider').value, m = 2 * (st.T - 1);
  sim.reset(W, fill(W, m)); st.added = m * W * W; st.growBox = false;
  st.onStable = () => {
    const S = sim.readAll();
    const D = new Int32Array(W * W);
    for (let i = 0; i < D.length; i++) D[i] = m - S[i];
    sim.reset(W, D); st.added = D.reduce((a, b) => a + b, 0);
    st.onStable = () => { setBadge(`항등원 완성 (${W}×${W})`); };
    go('항등원 계산 2/2단계');
  };
  go('항등원 계산 1/2단계');
}

function startCritical() {
  const W = 2 ** +$('gSlider').value;
  sim.reset(W, fill(W, st.T - 1)); st.added = (st.T - 1) * W * W; st.growBox = false;
  st.center = W / 2;
  sim.addSand(st.center, st.center, 0, 1); st.added++;
  go('한 알이 일으킨 눈사태');
}

// 눈사태 관찰은 CPU로 한 알씩 정확히 (작은 격자라 충분히 빠름)
function startSoc() {
  const W = Math.min(256, 2 ** +$('gSlider').value), T = st.T;
  const H = new Int32Array(W * W);
  for (let i = 0; i < H.length; i++) H[i] = Math.floor(Math.random() * T);
  st.soc = { W, H, O: new Int32Array(W * W), sizes: new Map(), drops: 0, stack: new Int32Array(W * W * 8) };
  // 임계 상태까지 미리 채워 두기 (처음엔 모래가 부족해서 눈사태가 작기만 함)
  st.added = 0;
  for (let i = 0; i < W * W * (T === 4 ? 0.8 : 2); i++) socDrop(Math.floor(Math.random() * W * W));
  s0reset();
  sim.reset(W, H);
  st.added = H.reduce((a, b) => a + b, 0);
  st.active = false; st.growBox = false;
  setBadge('눈사태 관찰 중');
  updateSocPlot();
}

function s0reset() { const s = st.soc; s.sizes.clear(); s.drops = 0; s.O.fill(0); }

function socDrop(i) {
  const s = st.soc, { W, H, O, stack } = s, T = st.T, moore = st.T === 8;
  H[i]++; st.added++;
  let sp = 0, size = 0;
  if (H[i] >= T) stack[sp++] = i;
  while (sp) {
    const j = stack[--sp];
    const k = Math.floor(H[j] / T);
    if (!k) continue;
    H[j] -= k * T; O[j] += k; size += k;
    const x = j % W, y = (j / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!(dx || dy) || (!moore && dx && dy)) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
      const n = Y * W + X, before = H[n];
      H[n] += k;
      if (before < T && H[n] >= T) stack[sp++] = n;
    }
  }
  s.drops++;
  if (size > 0) {
    const b = Math.floor(Math.log2(size));
    s.sizes.set(b, (s.sizes.get(b) || 0) + 1);
  }
  return size;
}

function restart() {
  st.onStable = null; st.soc = null; st.paused = false; $('pause').textContent = '멈춤';
  st.stats = null; st.odoMax = 1;
  $('socBox').classList.toggle('hidden', st.preset !== 'soc');
  ({ center: startCenter, drip: startDrip, identity: startIdentity, critical: startCritical, soc: startSoc })[st.preset]();
}

function go(label) { st.active = true; st.frames = 0; setBadge(label); }
function setBadge(t) { $('badge').textContent = t; }

// ---------- 메인 루프 ----------
let lastT = performance.now(), acc = 0;
function frame(now) {
  const dt = now - lastT; lastT = now;
  if (!st.paused) tick(dt);
  draw();
  requestAnimationFrame(frame);
}

function tick(dt) {
  if (st.preset === 'soc' && st.soc) { socTick(); return; }
  if (st.preset === 'drip') {
    const rate = Math.max(1, Math.round(2 ** (+$('speed').value) / 4));
    sim.addSand(st.center, st.center, 0, rate); st.added += rate;
    st.active = true;
  }
  if (!st.active) return;
  const sp = SPEEDS[st.speed];
  let n;
  if (sp === Infinity) {
    // 프레임 시간을 보며 패스 수를 조절
    if (dt < 20) st.ppf = Math.min(40000, st.ppf * 1.15);
    else if (dt > 28) st.ppf = Math.max(4, st.ppf * 0.8);
    n = Math.round(st.ppf);
  } else if (sp < 1) {
    acc += sp; n = acc >= 1 ? 1 : 0; if (n) acc = 0;
  } else n = sp;
  runPasses(n);
  st.frames++;
  const every = sp === Infinity && sim.W > 320 ? 3 : 1;
  if (st.frames % every === 0) checkStable();
}

function runPasses(n) {
  if (!n) return;
  if (st.growBox) {
    // 활동은 한 패스에 한 칸씩만 퍼진다 → 가운데에서 (패스 수 + 2)칸 안쪽만 계산해도 정확
    const W = sim.W, c = st.center;
    let left = n;
    while (left > 0) {
      const r = st.activePasses + 2;
      if (r >= c) { sim.box = null; st.growBox = false; sim.run(left); st.activePasses += left; break; }
      const k = Math.min(left, Math.max(1, Math.floor(r / 2)));
      const rr = Math.min(c, r + k);
      sim.box = { x0: Math.max(0, c - rr), y0: Math.max(0, c - rr), x1: Math.min(W, c + rr + 1), y1: Math.min(W, c + rr + 1) };
      sim.run(k); st.activePasses += k; left -= k;
    }
  } else {
    sim.box = null; sim.run(n);
  }
}

function checkStable() {
  const r = sim.read(true);
  const T = st.T, counts = new Array(T + 1).fill(0);
  let grains = 0, maxH = 0, topples = 0, odoMax = 0;
  for (let i = 0; i < r.H.length; i++) {
    const h = r.H[i]; grains += h; if (h > maxH) maxH = h;
    counts[Math.min(h, T)]++;
    const o = r.O[i]; topples += o; if (o > odoMax) odoMax = o;
  }
  // 박스 밖(아직 안 닿은 곳)은 0
  counts[0] += sim.W * sim.W - r.H.length;
  st.stats = { counts, grains, topples, maxH };
  st.odoMax = odoMax;
  if (maxH < T && st.preset !== 'drip') {
    st.active = false;
    const cb = st.onStable; st.onStable = null;
    setBadge(`안정 · ${sim.passes.toLocaleString()} 패스`);
    if (cb) cb();
  }
}

function socTick() {
  const s = st.soc, sp = SPEEDS[st.speed];
  const drops = sp === Infinity ? 400 : Math.max(1, Math.round(sp / 4));
  let last = 0;
  for (let i = 0; i < drops; i++) last = socDrop(Math.floor(Math.random() * s.W * s.W));
  sim.upload(s.H, s.O);
  let grains = 0, topples = 0, odoMax = 0; const counts = new Array(st.T + 1).fill(0);
  for (let i = 0; i < s.H.length; i++) { grains += s.H[i]; counts[s.H[i]]++; topples += s.O[i]; if (s.O[i] > odoMax) odoMax = s.O[i]; }
  st.stats = { counts, grains, topples };
  st.odoMax = odoMax;
  if (++st.frames % 10 === 0) updateSocPlot();
  setBadge(`${s.drops.toLocaleString()}알 떨어뜨림 · 방금 눈사태 ${last}번 무너짐`);
}

// ---------- 그리기 / 상태 표시 ----------
function draw() {
  sim.render(st.view, PALETTES[st.pal].map(hex), st.odoMax);
  const s = st.stats;
  if (!s) return;
  $('stGrains').textContent = s.grains.toLocaleString() +
    (st.added > s.grains ? ` (가장자리로 ${(st.added - s.grains).toLocaleString()} 떨어짐)` : '');
  $('stTopples').textContent = s.topples.toLocaleString();
  $('stPasses').textContent = st.preset === 'soc' ? 'CPU' : sim.passes.toLocaleString();
  const pal = PALETTES[st.pal], total = s.counts.reduce((a, b) => a + b, 0);
  const levels = st.T === 4 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7];
  $('legend').innerHTML = levels.map(h => {
    const lv = st.T === 4 ? h : (h === 0 ? 0 : Math.max(1, Math.min(3, Math.floor(h * 4 / st.T))));
    return `<div><i style="background:${pal[lv]}"></i>${h}<br><span>${Math.round(100 * s.counts[h] / total)}%</span></div>`;
  }).join('');
}

function updateSocPlot() {
  const c = $('socPlot'), g = c.getContext('2d'), s = st.soc;
  const W = c.width, H = c.height, css = getComputedStyle(document.body);
  g.clearRect(0, 0, W, H);
  if (!s || !s.sizes.size) return;
  const ent = [...s.sizes.entries()].sort((a, b) => a[0] - b[0]);
  // 구간 [2^b, 2^(b+1)) 폭으로 나눠 밀도로 → 거듭제곱 법칙이면 직선
  const pts = ent.map(([b, n]) => [b, Math.log2(n / 2 ** b)]);
  const maxB = Math.max(...pts.map(p => p[0]), 8);
  const ys = pts.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (b) => 30 + (b / maxB) * (W - 40), Y = (v) => H - 20 - ((v - y0) / Math.max(1, y1 - y0)) * (H - 34);
  g.strokeStyle = css.getPropertyValue('--line'); g.beginPath(); g.moveTo(30, 6); g.lineTo(30, H - 20); g.lineTo(W - 6, H - 20); g.stroke();
  g.fillStyle = css.getPropertyValue('--mute'); g.font = '11px sans-serif';
  g.fillText('눈사태 크기 →', W - 90, H - 6); g.save(); g.translate(12, H - 24); g.rotate(-Math.PI / 2); g.fillText('빈도 →', 0, 0); g.restore();
  for (let b = 0; b <= maxB; b += 4) g.fillText(b ? `2^${b}` : '1', X(b) - 6, H - 8);
  g.fillStyle = css.getPropertyValue('--accent');
  for (const [b, v] of pts) { g.beginPath(); g.arc(X(b), Y(v), 3.5, 0, 7); g.fill(); }
  // 최소제곱 기울기
  const n = pts.length;
  if (n >= 4) {
    const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    $('socNote').textContent = `점들이 대략 직선이면 "거듭제곱 법칙" — 작은 눈사태는 아주 많고, 큰 눈사태는 드물지만 꼭 일어나요. 기울기 ≈ ${slope.toFixed(2)} (격자가 작아서 오른쪽 끝은 휘어요)`;
  }
}

// ---------- 입력 ----------
function gridPos(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * sim.W);
  const y = Math.floor((1 - (e.clientY - r.top) / r.height) * sim.W);
  return [Math.max(0, Math.min(sim.W - 1, x)), Math.max(0, Math.min(sim.W - 1, y))];
}
let painting = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  const [x, y] = gridPos(e);
  if (st.preset === 'critical') { sim.box = null; sim.addSand(x, y, 0, 1); st.added++; go('한 알이 일으킨 눈사태'); return; }
  if (st.preset === 'soc' && st.soc) { const size = socDrop(y * st.soc.W + x); sim.upload(st.soc.H, st.soc.O); setBadge(`직접 떨어뜨린 한 알 → ${size}번 무너짐`); return; }
  painting = [x, y];
});
cv.addEventListener('pointermove', (e) => { if (painting) painting = gridPos(e); });
addEventListener('pointerup', () => { painting = null; });
setInterval(() => {
  if (!painting || st.paused || st.preset === 'critical' || st.preset === 'soc') return;
  const [px, py] = painting, r = Math.max(1, sim.W / 128);
  const per = Math.max(1, Math.round(Math.max(64, sim.W * sim.W / 64) / (Math.PI * r * r)));
  st.growBox = false; sim.box = null;
  sim.addSand(px, py, r, per);
  let cells = 0; // 셰이더와 같은 기준으로 실제 더해진 칸 수
  for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++)
    if (x >= 0 && y >= 0 && x < sim.W && y < sim.W && (x - px) ** 2 + (y - py) ** 2 <= r * r) cells++;
  st.added += per * cells;
  if (!st.active) go('뿌린 모래 무너지는 중');
}, 50);

// ---------- 컨트롤 ----------
function segBind(id, attr, fn) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    fn(b.dataset[attr]);
  });
}
segBind('view', 'v', (v) => { st.view = +v; });
segBind('pal', 'p', (p) => { st.pal = p; });
segBind('rule', 'r', (r) => { setRule(+r); restart(); });

document.querySelector('.presets').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.presets button').forEach(x => x.classList.toggle('on', x === b));
  st.preset = b.dataset.preset;
  $('presetNote').textContent = NOTES[st.preset];
  $('gCenter').classList.toggle('hidden', st.preset !== 'center');
  $('gGrid').classList.toggle('hidden', st.preset === 'center');
  if (st.preset === 'identity' || st.preset === 'center') st.view = 0;
  if (st.preset === 'critical') st.view = 0;
  document.querySelectorAll('#view button').forEach(x => x.classList.toggle('on', +x.dataset.v === st.view));
  syncLabels();
  restart();
});

function syncLabels() {
  const k = +$('nSlider').value;
  $('nLabel').textContent = `2^${k} = ${(2 ** k).toLocaleString()}`;
  const g = 2 ** +$('gSlider').value;
  $('gLabel').textContent = st.preset === 'soc' ? `${Math.min(256, g)}×${Math.min(256, g)}` : `${g}×${g}`;
  const s = SPEEDS[+$('speed').value];
  $('sLabel').textContent = st.preset === 'drip' ? `한 프레임에 ${Math.max(1, Math.round(2 ** +$('speed').value / 4))}알`
    : s === Infinity ? '최대' : s < 1 ? '아주 천천히' : `프레임당 ${s}패스`;
}
$('nSlider').addEventListener('input', syncLabels);
$('gSlider').addEventListener('input', syncLabels);
$('speed').addEventListener('input', () => { st.speed = +$('speed').value; syncLabels(); });
$('go').addEventListener('click', restart);
$('go2').addEventListener('click', restart);
$('pause').addEventListener('click', () => { st.paused = !st.paused; $('pause').textContent = st.paused ? '계속' : '멈춤'; });
$('clear').addEventListener('click', () => { sim.reset(sim.W); st.added = 0; st.active = false; st.stats = null; st.onStable = null; st.growBox = false; if (st.soc) startSoc(); setBadge('비움'); });
$('save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `sandpile-${st.preset}.png`; a.href = cv.toDataURL('image/png'); a.click();
});

document.querySelector('nav').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === b.dataset.tab));
});

function fitCanvas() {
  const r = cv.getBoundingClientRect();
  const px = Math.min(2048, Math.round(r.width * devicePixelRatio));
  if (px > 0 && cv.width !== px) { cv.width = cv.height = px; }
}
addEventListener('resize', fitCanvas);

// ---------- 시작 ----------
$('presetNote').textContent = NOTES.center;
syncLabels(); fitCanvas();
buildExplain($('explain'));
restart();
requestAnimationFrame(frame);

// 숨은 창 테스트용 훅: rAF가 멈춰 있어도 직접 돌릴 수 있게
window.sandpile = {
  st, sim,
  run(frames = 50) { for (let i = 0; i < frames && (st.active || st.soc); i++) tick(16); draw(); return { active: st.active, passes: sim.passes, stats: st.stats }; },
  // GPU 결과가 CPU 기준 구현과 칸 단위로 같은지
  verify(k = 12, T = 4) {
    setRule(T); $('nSlider').value = k; st.preset = 'center'; restart();
    let guard = 0;
    while (st.active && guard++ < 100000) { runPasses(500); checkStable(); }
    const g = sim.readAll(), W = sim.W;
    const H0 = new Int32Array(W * W); H0[st.center * W + st.center] = 2 ** k;
    const c = cpuStabilize(W, H0, T, T === 8);
    let diff = 0; for (let i = 0; i < g.length; i++) if (g[i] !== c.H[i]) diff++;
    const sum = g.reduce((a, b) => a + b, 0);
    return { W, diffCells: diff, gpuGrains: sum, expected: 2 ** k, cpuPasses: c.passes, gpuPasses: sim.passes };
  },
};
