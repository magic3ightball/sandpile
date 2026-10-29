// "어떻게 작동하나" 탭 — 도식 + 짧은 주석 카드
import { cpuStabilize } from './sim.js';

const COL = ['#1a1410', '#6b4a2b', '#c98a4b', '#f3dcae', '#ff4d2e'];
const TXT = ['#c9b9a6', '#fff', '#1a1410', '#1a1410', '#fff'];
const col = (h) => COL[Math.min(h, 4)];
const txt = (h) => TXT[Math.min(h, 4)];

// 작은 격자를 SVG로 (숫자 포함)
function gridSvg(g, w, h, ox, oy, s, hot = -1) {
  let o = '';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = g[y * w + x], X = ox + x * s, Y = oy + y * s;
    o += `<rect x="${X}" y="${Y}" width="${s - 2}" height="${s - 2}" rx="4" fill="${col(v)}" ${y * w + x === hot ? 'stroke="#ff4d2e" stroke-width="3"' : ''}/>`;
    o += `<text x="${X + s / 2 - 1}" y="${Y + s / 2 + 5}" text-anchor="middle" font-size="${s * 0.42}" font-weight="700" fill="${txt(v)}">${v}</text>`;
  }
  return o;
}
function topple(g, w, h, i) {
  const x = i % w, y = (i / w) | 0;
  g[i] -= 4;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h) g[Y * w + X]++;
  }
}

function ruleCard() {
  const s = 46, before = [0, 1, 0, 2, 4, 3, 0, 1, 0], after = [0, 2, 0, 3, 0, 4, 0, 2, 0];
  const arrows = [[1, 0], [0, 1], [2, 1], [1, 2]].map(([x, y]) => {
    const cx = 20 + 1 * s + s / 2, cy = 20 + s + s / 2, tx = 20 + x * s + s / 2, ty = 20 + y * s + s / 2;
    return `<line x1="${cx + (tx - cx) * 0.35}" y1="${cy + (ty - cy) * 0.35}" x2="${cx + (tx - cx) * 0.72}" y2="${cy + (ty - cy) * 0.72}" stroke="#ff4d2e" stroke-width="3" marker-end="url(#ah)"/>`;
  }).join('');
  return `<section class="card"><h2><span class="num">1</span>규칙은 하나뿐</h2>
  <svg viewBox="0 0 520 190" style="max-width:420px;margin:10px auto">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff4d2e"/></marker></defs>
    ${gridSvg(before, 3, 3, 20, 20, s, 4)}${arrows}
    <text x="250" y="95" font-size="30" text-anchor="middle" fill="currentColor">→</text>
    ${gridSvg(after, 3, 3, 330, 20, s)}
    <text x="89" y="180" text-anchor="middle" font-size="13" fill="currentColor">가운데 칸에 4알 → 무너짐</text>
    <text x="399" y="180" text-anchor="middle" font-size="13" fill="currentColor">이웃 넷에 한 알씩</text>
  </svg>
  <p class="ann">한 칸에 모래가 <b>4알 이상</b> 모이면 4알을 내놓아 위·아래·왼쪽·오른쪽에 한 알씩 나눠요. 그러다 이웃이 4알이 되면 또 무너지고… 연쇄가 멈출 때까지 반복. 가장자리 밖으로 넘어간 모래는 떨어져 사라져요. <br>색: <b style="color:${COL[1]}">■</b>1 <b style="color:${COL[2]}">■</b>2 <b style="color:${COL[3]}">■</b>3, 빨간 테두리 = 무너질 칸.</p>
  </section>`;
}

function miniCard() {
  return `<section class="card"><h2><span class="num">2</span>직접 무너뜨려 보기</h2>
  <div class="mini"><table id="miniT"></table>
    <div class="ctrl">
      <button id="mAdd">가운데에 한 알 +1</button>
      <button id="mAdd8">가운데에 8알 +8</button>
      <button id="mStep">무너질 칸 하나 무너뜨리기</button>
      <button id="mAll">끝까지</button>
      <button id="mReset">비우기</button>
      <p class="note" id="mNote"></p>
    </div></div>
  <p class="ann">7×7 격자예요. 빨간 테두리 칸이 "무너질 차례". 어떤 칸부터 무너뜨려도 끝 모양은 같아요 — 다음 카드에서 그 이유를 봐요.</p>
  </section>`;
}

function bindMini() {
  const W = 7, g = new Int32Array(W * W), T = document.getElementById('miniT'), note = document.getElementById('mNote');
  let steps = 0;
  const unstable = () => [...g.keys()].filter(i => g[i] >= 4);
  const paint = () => {
    const u = new Set(unstable());
    T.innerHTML = Array.from({ length: W }, (_, y) => '<tr>' + Array.from({ length: W }, (_, x) => {
      const i = y * W + x, v = g[i];
      return `<td class="${u.has(i) ? 'hot' : ''}" style="background:${col(v)};color:${txt(v)}">${v}</td>`;
    }).join('') + '</tr>').join('');
    note.textContent = u.size ? `무너질 칸 ${u.size}개 · 지금까지 ${steps}번 무너짐` : `안정 · ${steps}번 무너짐 · 남은 모래 ${g.reduce((a, b) => a + b, 0)}알`;
  };
  const c = (W >> 1) * W + (W >> 1);
  document.getElementById('mAdd').onclick = () => { g[c]++; paint(); };
  document.getElementById('mAdd8').onclick = () => { g[c] += 8; paint(); };
  document.getElementById('mStep').onclick = () => { const u = unstable(); if (u.length) { topple(g, W, W, u[Math.floor(Math.random() * u.length)]); steps++; } paint(); };
  document.getElementById('mAll').onclick = () => { let u; while ((u = unstable()).length) { topple(g, W, W, u[0]); steps++; } paint(); };
  document.getElementById('mReset').onclick = () => { g.fill(0); steps = 0; paint(); };
  g[c] = 7; paint();
}

function abelianCard() {
  const w = 4, h = 3, s = 30;
  const start = [0, 1, 0, 0, 1, 4, 4, 1, 0, 0, 1, 0];
  const A = 5, B = 6;
  const run = (order) => {
    const g = Int32Array.from(start), frames = [Int32Array.from(g)], hots = [order[0]];
    for (let k = 0; k < order.length; k++) {
      topple(g, w, h, order[k]); frames.push(Int32Array.from(g));
      hots.push(order[k + 1] ?? -1);
    }
    return { frames, hots };
  };
  const p1 = run([A, B]), p2 = run([B, A]);
  const row = (p, y, label) => p.frames.map((f, k) =>
    gridSvg(f, w, h, 110 + k * 150, y, s, p.hots[k]) + (k < 2 ? `<text x="${110 + k * 150 + 132}" y="${y + 52}" font-size="20" fill="currentColor">→</text>` : '')
  ).join('') + `<text x="0" y="${y + 50}" font-size="13" fill="currentColor">${label}</text>`;
  return `<section class="card"><h2><span class="num">3</span>순서가 상관없다 — "아벨"이라는 이름의 이유</h2>
  <svg viewBox="0 0 560 230">
    ${row(p1, 10, '왼쪽 먼저')}${row(p2, 130, '오른쪽 먼저')}
    <rect x="404" y="4" width="128" height="222" rx="8" fill="none" stroke="#b4562f" stroke-dasharray="5 4"/>
    <text x="468" y="114" text-anchor="middle" font-size="12" fill="#b4562f">같은 결과</text>
  </svg>
  <p class="ann">무너질 칸이 둘 이상이면 누구부터 무너뜨려도 <b>끝 모양도, 각 칸이 무너진 횟수도 똑같아요</b>. 연산 순서를 바꿔도 되는 성질을 수학에선 "아벨(교환 가능)"이라 불러요 — 그래서 Abelian sandpile. Dhar(1990)가 이 성질을 밝혔어요.</p>
  <p class="ann">이 덕분에 이 페이지는 GPU에서 <b>모든 칸을 동시에, 가진 만큼 한꺼번에</b> 무너뜨려도 정답과 똑같은 그림을 얻어요(카드 7).</p>
  </section>`;
}

function fractalCard() {
  return `<section class="card"><h2><span class="num">4</span>가운데에 쏟으면 왜 이런 무늬가?</h2>
  <div style="display:flex;gap:10px;flex-wrap:wrap" id="scaleRow"></div>
  <p class="ann">알 수를 4배씩 늘려도(위: 2¹⁰, 2¹², 2¹⁴알) <b>같은 그림이 더 촘촘해질 뿐</b>이에요. 크기를 맞춰 놓으면 하나의 "극한 그림"으로 다가가요.</p>
  <ul>
    <li><span class="tag ok">증명됨</span>크기를 키우면 무늬가 하나의 극한 모양으로 <b>수렴한다</b> (Pegden–Smart, 2013).</li>
    <li><span class="tag ok">증명됨</span>무늬 안의 규칙적인 조각들(같은 패턴이 반복되는 영역)은 <b>아폴로니우스 원 채우기</b> 구조와 연결돼 있다 — 원 사이 빈틈에 또 원을 끝없이 채워 넣는 그 프랙탈 (Levine–Pegden–Smart, 2016·2017).</li>
    <li><span class="tag open">연구 중</span>바깥 테두리의 <b>정확한 모양</b>. 원 같지만 실험상으론 다각형에 더 가까워 보이고, 정확한 식은 모름.</li>
    <li><span class="tag open">연구 중</span>극한 그림 전체를 완전히 설명하는 일 — 증명된 건 "일부 조각들이 왜 그런 모양인지"까지.</li>
  </ul>
  </section>`;
}

function drawScaleRow() {
  const row = document.getElementById('scaleRow');
  if (!row || row.dataset.done) return;
  row.dataset.done = 1;
  for (const k of [10, 12, 14]) {
    const N = 2 ** k, W = Math.ceil(Math.sqrt(N / 2.125 / Math.PI) * 2.3) + 6;
    const H0 = new Int32Array(W * W); H0[(W >> 1) * W + (W >> 1)] = N;
    const { H } = cpuStabilize(W, H0);
    const c = document.createElement('canvas'); c.width = c.height = W;
    c.style.cssText = 'width:150px;height:150px;image-rendering:pixelated;border-radius:6px;background:#000';
    const g = c.getContext('2d'), img = g.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      const hx = COL[H[i]]; img.data.set([1, 3, 5].map(j => parseInt(hx.slice(j, j + 2), 16)).concat(255), i * 4);
    }
    g.putImageData(img, 0, 0);
    const f = document.createElement('figure'); f.style.margin = 0;
    f.append(c); f.insertAdjacentHTML('beforeend', `<figcaption class="note" style="text-align:center">2^${k} = ${N.toLocaleString()}알</figcaption>`);
    row.append(f);
  }
}

function identityCard() {
  return `<section class="card"><h2><span class="num">5</span>항등원 — "더해도 아무 일 없는" 모래</h2>
  <svg viewBox="0 0 560 120">
    <rect x="10" y="30" width="120" height="60" rx="8" fill="#c98a4b"/><text x="70" y="65" text-anchor="middle" font-size="14" fill="#1a1410">안정된 배치 A</text>
    <text x="150" y="67" font-size="24" fill="currentColor">+</text>
    <rect x="175" y="30" width="120" height="60" rx="8" fill="#f3dcae"/><text x="235" y="65" text-anchor="middle" font-size="14" fill="#1a1410">항등원 e</text>
    <text x="315" y="67" font-size="16" fill="currentColor">→ 무너뜨림 →</text>
    <rect x="430" y="30" width="120" height="60" rx="8" fill="#c98a4b"/><text x="490" y="65" text-anchor="middle" font-size="14" fill="#1a1410">다시 A</text>
  </svg>
  <p class="ann">"칸별로 더하고 → 무너뜨리기"를 덧셈처럼 쓰면, 되돌아오는 배치들은 숫자처럼 <b>군(group)</b>을 이뤄요. 거기엔 0 역할을 하는 배치가 꼭 하나 있는데, 그게 빈 격자가 아니라 이상한 프랙탈이에요. 계산법: 모든 칸에 6알 → 무너뜨려 S → (6 − S)를 다시 무너뜨림.</p>
  <p class="ann">Creutz가 처음 자세히 들여다봐서 "Creutz 항등원"이라고도 해요. 정사각형 격자에서 왜 이런 자기닮음 무늬가 나오는지는 아직 일부만 설명돼 있어요.</p>
  </section>`;
}

function socCard() {
  return `<section class="card"><h2><span class="num">6</span>눈사태와 "자기조직화 임계성"</h2>
  <svg viewBox="0 0 560 140">
    <line x1="40" y1="120" x2="540" y2="120" stroke="currentColor" opacity=".4"/><line x1="40" y1="10" x2="40" y2="120" stroke="currentColor" opacity=".4"/>
    <line x1="50" y1="20" x2="500" y2="112" stroke="#b4562f" stroke-width="3"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle cx="${60 + i * 60}" cy="${22 + i * 12.3 + (i % 2 ? 3 : -3)}" r="5" fill="#c98a4b"/>`).join('')}
    <text x="290" y="137" text-anchor="middle" font-size="12" fill="currentColor">눈사태 크기 (로그)</text>
    <text x="14" y="70" font-size="12" fill="currentColor" transform="rotate(-90 14 70)" text-anchor="middle">빈도 (로그)</text>
  </svg>
  <p class="ann">Bak·Tang·Wiesenfeld(1987)가 이 모델을 만든 이유. 아무렇게나 시작해도 더미는 스스로 "무너지기 직전" 상태로 가고, 한 알이 일으키는 눈사태 크기가 <b>거듭제곱 법칙</b>(로그-로그에서 직선)을 따라요 — 지진·산불 크기 분포와 닮은 꼴. "눈사태 관찰" 모드에서 직접 그래프를 그려 볼 수 있어요.</p>
  </section>`;
}

function gpuCard() {
  return `<section class="card"><h2><span class="num">7</span>이 페이지가 계산하는 법</h2>
  <svg viewBox="0 0 560 150">
    <rect x="10" y="30" width="150" height="90" rx="8" fill="none" stroke="currentColor"/><text x="85" y="22" text-anchor="middle" font-size="12" fill="currentColor">텍스처 A (지금 높이)</text>
    <rect x="400" y="30" width="150" height="90" rx="8" fill="none" stroke="currentColor"/><text x="475" y="22" text-anchor="middle" font-size="12" fill="currentColor">텍스처 B (다음 높이)</text>
    <rect x="185" y="45" width="190" height="60" rx="8" fill="#b4562f"/>
    <text x="280" y="70" text-anchor="middle" font-size="12" fill="#fff">새 높이 = h % 4</text>
    <text x="280" y="90" text-anchor="middle" font-size="12" fill="#fff">+ Σ ⌊이웃 / 4⌋</text>
    <line x1="160" y1="75" x2="183" y2="75" stroke="currentColor" marker-end="url(#ah)"/><line x1="375" y1="75" x2="398" y2="75" stroke="currentColor" marker-end="url(#ah)"/>
    <path d="M475 122 Q 280 160 85 122" fill="none" stroke="currentColor" stroke-dasharray="4 4" marker-end="url(#ah)"/>
    <text x="280" y="148" text-anchor="middle" font-size="11" fill="currentColor">바꿔서 반복 (핑퐁) — 한 번 = 1 패스</text>
  </svg>
  <ul class="ann" style="list-style:none;padding-left:10px">
    <li>• 모든 칸이 동시에 "가진 만큼(⌊h/4⌋번)" 무너져요. 아벨 성질 덕분에 결과는 한 칸씩 무너뜨린 것과 같아요. 검증: CPU 기준 구현과 칸 단위로 비교해 0칸 차이.</li>
    <li>• 무너짐은 한 패스에 한 칸씩만 퍼지므로, "가운데에 쏟기"는 처음엔 가운데 작은 네모만 계산해서 빨라요.</li>
    <li>• 2²⁰알이면 수만 패스가 필요해서 몇십 초 걸려요. "무너진 횟수" 보기는 각 칸이 무너진 총 횟수(odometer)를 로그 밝기로 보여줘요.</li>
  </ul>
  </section>`;
}

function refsCard() {
  return `<section class="card refs"><h2>참고</h2><ul>
  <li><a href="https://arxiv.org/abs/1208.4839" target="_blank" rel="noopener">Levine, Pegden, Smart — Apollonian structure in the Abelian sandpile (GAFA 2016)</a></li>
  <li><a href="https://annals.math.princeton.edu/2017/186-1/p01" target="_blank" rel="noopener">Levine, Pegden, Smart — The Apollonian structure of integer superharmonic matrices (Annals 2017)</a></li>
  <li><a href="https://pi.math.cornell.edu/~levine/apollonian-slides.pdf" target="_blank" rel="noopener">Levine — Apollonian 발표 슬라이드 (그림 많음)</a></li>
  <li><a href="https://arxiv.org/pdf/0809.3416" target="_blank" rel="noopener">Caracciolo, Paoletti, Sportiello — 정사각 격자 항등원의 자기닮음 구조 (2008)</a></li>
  <li><a href="https://arxiv.org/pdf/2007.05792" target="_blank" rel="noopener">Melchionna — The sandpile identity element on an ellipse</a></li>
  </ul></section>`;
}

export function buildExplain(root) {
  root.innerHTML = ruleCard() + miniCard() + abelianCard() + fractalCard() + identityCard() + socCard() + gpuCard() + refsCard();
  bindMini();
  // 큰 계산은 탭을 처음 열 때
  const obs = new MutationObserver(() => { if (root.classList.contains('on')) drawScaleRow(); });
  obs.observe(root, { attributes: true, attributeFilter: ['class'] });
}
