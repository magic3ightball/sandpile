// 모래더미(Abelian sandpile) GPU 시뮬레이터 — WebGL2, 정수 텍스처 핑퐁.
// 한 번의 패스에서 모든 칸이 동시에 "가진 만큼" 무너진다(다중 토플링).
// 아벨 성질 덕분에 순서·묶음과 상관없이 최종 안정 상태는 같다.

const VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// 무너뜨리기 + (선택) 모래 더하기. 바깥은 싱크(모래가 떨어져 사라짐).
const STEP_FS = `#version 300 es
precision highp float; precision highp int; precision highp isampler2D;
uniform isampler2D uH; uniform isampler2D uO;
uniform int uW; uniform int uT; uniform int uMoore;
uniform ivec2 uAddPos; uniform float uAddR; uniform int uAddAmt;
layout(location=0) out int oH;
layout(location=1) out int oO;
int H(ivec2 q){
  if (q.x < 0 || q.y < 0 || q.x >= uW || q.y >= uW) return 0;
  return texelFetch(uH, q, 0).r;
}
int add(ivec2 q){
  if (uAddAmt == 0) return 0;
  vec2 d = vec2(q - uAddPos);
  return dot(d, d) <= uAddR * uAddR ? uAddAmt : 0;
}
int give(ivec2 q){ return (H(q) + add(q)) / uT; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  int h = H(p) + add(p);
  int k = h / uT;
  int s = give(p + ivec2(1,0)) + give(p + ivec2(-1,0)) + give(p + ivec2(0,1)) + give(p + ivec2(0,-1));
  if (uMoore == 1) s += give(p + ivec2(1,1)) + give(p + ivec2(-1,1)) + give(p + ivec2(1,-1)) + give(p + ivec2(-1,-1));
  oH = h - k * uT + s;
  oO = texelFetch(uO, p, 0).r + k;
}`;

const DRAW_FS = `#version 300 es
precision highp float; precision highp int; precision highp isampler2D;
uniform isampler2D uH; uniform isampler2D uO;
uniform int uW; uniform int uT; uniform int uView;
uniform vec3 uPal[5]; uniform float uOdoMax;
uniform vec2 uCanvas;
out vec4 frag;
void main(){
  vec2 uv = gl_FragCoord.xy / uCanvas;
  ivec2 p = ivec2(floor(uv * float(uW)));
  p = clamp(p, ivec2(0), ivec2(uW - 1));
  int h = texelFetch(uH, p, 0).r;
  vec3 c;
  if (uView == 1) {
    float o = float(texelFetch(uO, p, 0).r);
    float t = o <= 0.0 ? 0.0 : log(1.0 + o) / log(1.0 + uOdoMax);
    // 0 → 배경, 많이 무너진 곳일수록 밝게. 높이 패턴을 살짝 비침.
    vec3 a = uPal[0], b = uPal[2], d = uPal[3];
    c = t < 0.5 ? mix(a, b, t * 2.0) : mix(b, d, t * 2.0 - 1.0);
    if (o > 0.0 && (h & 1) == 1) c *= 0.88;
  } else {
    int lv = h >= uT ? 4 : (uT == 4 ? h : min(3, (h * 4) / uT));
    if (h > 0 && lv == 0) lv = 1;
    c = uPal[lv];
  }
  frag = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name.endsWith('uPal') ? 'uPal[0]' : name);
  }
  return { p, u };
}

export class Sandpile {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2를 쓸 수 없는 브라우저예요.');
    this.gl = gl; this.canvas = canvas;
    this.step = program(gl, STEP_FS);
    this.draw = program(gl, DRAW_FS);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.T = 4; this.moore = false;
    this.W = 0;
    this.box = null; // 계산할 영역(시저). null이면 전체.
    this.pending = null; // 다음 패스에 더할 모래
  }

  _tex(W, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, W, W, 0, gl.RED_INTEGER, gl.INT, data || new Int32Array(W * W));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // 격자를 새로 만든다. heights가 주어지면 그 상태로 시작.
  reset(W, heights) {
    const gl = this.gl;
    if (this.fbs) {
      for (const f of this.fbs) gl.deleteFramebuffer(f);
      for (const t of [...this.H, ...this.O]) gl.deleteTexture(t);
    }
    this.W = W;
    this.H = [this._tex(W, heights), this._tex(W, heights)];
    this.O = [this._tex(W), this._tex(W)];
    this.fbs = [0, 1].map(i => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.H[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.O[i], 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      return f;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;
    this.passes = 0;
    this.box = null;
    this.pending = null;
  }

  // 모래 더하기 (다음 패스에서 반영). 같은 프레임에 여러 번 부르면 마지막만 남으니 패스를 나눠서 처리.
  addSand(x, y, r, amount) {
    if (this.pending) this.run(1);
    this.pending = { x, y, r, amount };
  }

  run(n) {
    const gl = this.gl, s = this.step, W = this.W;
    gl.useProgram(s.p);
    gl.uniform1i(s.u.uH, 0); gl.uniform1i(s.u.uO, 1);
    gl.uniform1i(s.u.uW, W); gl.uniform1i(s.u.uT, this.T); gl.uniform1i(s.u.uMoore, this.moore ? 1 : 0);
    gl.viewport(0, 0, W, W);
    if (this.box) {
      gl.enable(gl.SCISSOR_TEST);
      const b = this.box;
      gl.scissor(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    for (let i = 0; i < n; i++) {
      const a = this.pending;
      if (a) { gl.uniform2i(s.u.uAddPos, a.x, a.y); gl.uniform1f(s.u.uAddR, a.r); gl.uniform1i(s.u.uAddAmt, a.amount); }
      const src = this.cur, dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[dst]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.H[src]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.O[src]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (a) { gl.uniform1i(s.u.uAddAmt, 0); this.pending = null; }
      this.cur = dst;
      this.passes++;
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(view, palette, odoMax) {
    const gl = this.gl, d = this.draw, c = this.canvas;
    gl.useProgram(d.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, c.width, c.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.H[this.cur]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.O[this.cur]);
    gl.uniform1i(d.u.uH, 0); gl.uniform1i(d.u.uO, 1);
    gl.uniform1i(d.u.uW, this.W); gl.uniform1i(d.u.uT, this.T); gl.uniform1i(d.u.uView, view);
    gl.uniform3fv(d.u.uPal, palette.flat());
    gl.uniform1f(d.u.uOdoMax, Math.max(1, odoMax));
    gl.uniform2f(d.u.uCanvas, c.width, c.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 영역(기본: 시저 박스 또는 전체)의 높이와 무너진 횟수를 읽는다.
  read(withOdo = true) {
    const gl = this.gl, W = this.W;
    const b = this.box || { x0: 0, y0: 0, x1: W, y1: W };
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const tmp = new Int32Array(w * h * 4);
    const get = (att) => {
      gl.readBuffer(att);
      gl.readPixels(b.x0, b.y0, w, h, gl.RGBA_INTEGER, gl.INT, tmp);
      const out = new Int32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = tmp[i * 4];
      return out;
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[this.cur]);
    const H = get(gl.COLOR_ATTACHMENT0);
    const O = withOdo ? get(gl.COLOR_ATTACHMENT1) : null;
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { H, O, box: b, w, h };
  }

  // CPU에서 계산한 상태를 그대로 올림 (눈사태 관찰 모드)
  upload(H, O) {
    const gl = this.gl, W = this.W;
    gl.bindTexture(gl.TEXTURE_2D, this.H[this.cur]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.INT, H);
    gl.bindTexture(gl.TEXTURE_2D, this.O[this.cur]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RED_INTEGER, gl.INT, O);
  }

  // 전체 격자 높이를 Int32Array로 (항등원 계산용)
  readAll() {
    const keep = this.box; this.box = null;
    const r = this.read(false); this.box = keep;
    return r.H;
  }
}

// CPU 기준 구현 — 검증용. 같은 규칙(바깥은 싱크)으로 안정화.
export function cpuStabilize(W, H, T = 4, moore = false) {
  let a = Int32Array.from(H), b = new Int32Array(W * W), passes = 0;
  const nb = moore ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1]];
  for (;;) {
    let active = false;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, h = a[i];
      if (h >= T) active = true;
      let s = h - Math.floor(h / T) * T;
      for (const [dx, dy] of nb) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < W) s += Math.floor(a[Y * W + X] / T);
      }
      b[i] = s;
    }
    if (!active) return { H: a, passes };
    [a, b] = [b, a]; passes++;
  }
}
