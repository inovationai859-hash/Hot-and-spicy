import {
  DEFAULT_INK_PARAMS,
  INK_DURATION_S,
  InkShaderParams,
  power3Out,
} from './params';

export interface SnapshotTextureRecord {
  texture: WebGLTexture;
  key: string;
  widthCss: number;
  heightCss: number;
  originXCss: number;
  originYCss: number;
  scale: number;
  revision: number;
}

export interface InkRenderState {
  elapsed: number;
  centerCss: [number, number];
  maxDist: number;
  scrollCss: [number, number];
  seed: [number, number];
  seedAngle: number;
  rimColor: [number, number, number];
  fromIsFrozen: boolean;
  freezeScrollCss: [number, number];
  params?: Partial<InkShaderParams>;
}

const VERT_SRC = `#version 300 es
precision highp float;
void main() {
  vec2 pos;
  if (gl_VertexID == 0) pos = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) pos = vec2(3.0, -1.0);
  else pos = vec2(-1.0, 3.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uNoiseTex;
uniform sampler2D uFromTex;
uniform sampler2D uToTex;

uniform vec2 uViewportCss;
uniform float uDpr;
uniform float uRef;
uniform vec2 uScroll;

uniform vec2 uFromSnapCss;
uniform vec2 uToSnapCss;
uniform vec2 uFromSnapOrigin;
uniform vec2 uToSnapOrigin;
uniform int uFromIsFrozen;
uniform vec2 uFreezeScroll;

uniform vec2 uCenter;
uniform float uR;
uniform float uCleanup;
uniform float uLinear;
uniform float uElapsed;

uniform vec2 uSeed;
uniform mat2 uSeedRot;

uniform float uTendril;
uniform float uNoiseScale;
uniform float uSoftness;
uniform float uDrift;
uniform vec3 uRimColor;

out vec4 outColor;

vec2 gradAt(ivec2 cell) {
  ivec2 w = cell & ivec2(255);
  vec2 rg = texelFetch(uNoiseTex, w, 0).rg * 2.0 - 1.0;
  return normalize(rg + vec2(1e-5));
}

float gnoise(vec2 p) {
  vec2 ip = floor(p);
  vec2 f = p - ip;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(ip);
  float n00 = dot(gradAt(c), f);
  float n10 = dot(gradAt(c + ivec2(1, 0)), f - vec2(1.0, 0.0));
  float n01 = dot(gradAt(c + ivec2(0, 1)), f - vec2(0.0, 1.0));
  float n11 = dot(gradAt(c + ivec2(1, 1)), f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y) * 1.41421356;
}

const mat2 OCT_ROT = mat2(0.8, -0.6, 0.6, 0.8);

float fbm3(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * gnoise(p);
    p = OCT_ROT * p * 2.02;
    amp *= 0.5;
  }
  return sum;
}

float fbm4(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * gnoise(p);
    p = OCT_ROT * p * 2.02;
    amp *= 0.5;
  }
  return sum;
}

float fbm5(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * gnoise(p);
    p = OCT_ROT * p * 2.02;
    amp *= 0.5;
  }
  return sum;
}

vec3 sampleFrom(vec2 css) {
  if (uFromIsFrozen == 1) {
    vec2 frozenCss = css + (uScroll - uFreezeScroll);
    vec2 uv = vec2(frozenCss.x / uViewportCss.x, 1.0 - frozenCss.y / uViewportCss.y);
    return texture(uFromTex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  }
  vec2 doc = css + uScroll - uFromSnapOrigin;
  vec2 uv = clamp(doc / max(uFromSnapCss, vec2(1.0)), vec2(0.0), vec2(1.0));
  return texture(uFromTex, uv).rgb;
}

vec3 sampleTo(vec2 css) {
  vec2 doc = css + uScroll - uToSnapOrigin;
  vec2 uv = clamp(doc / max(uToSnapCss, vec2(1.0)), vec2(0.0), vec2(1.0));
  return texture(uToTex, uv).rgb;
}

void main() {
  vec2 css = vec2(gl_FragCoord.x / uDpr, uViewportCss.y - gl_FragCoord.y / uDpr);
  vec2 rel = css - uCenter;
  float d = length(rel);

  float bandW = min(0.30 * uR + 28.0, 260.0);
  float minReachBound = uR * 0.58 + uCleanup;
  float maxReachBound = uR * (1.42 + 0.24 * uTendril) + uCleanup;

  // Bounding-radius early-out: deep inside or far outside active ink band
  if (d < minReachBound - bandW - 32.0) {
    outColor = vec4(sampleTo(css), 1.0);
    return;
  }
  if (d > maxReachBound + 42.0) {
    outColor = vec4(sampleFrom(css), 1.0);
    return;
  }

  vec3 fromCol = sampleFrom(css);
  vec3 toCol = sampleTo(css);

  float ns = max(uNoiseScale, 0.05);
  vec2 p = rel / max(uRef, 1.0);
  vec2 dir = uSeedRot * (rel / max(d, 0.001));
  float t = uElapsed * uDrift;

  vec2 q = p * 2.4 * ns + uSeed;
  vec2 w = vec2(
    fbm3(q + vec2(0.0, 0.31)),
    fbm3(q + vec2(5.2, 1.3)) - 0.27
  );
  float blob = fbm5(q + 2.3 * w + vec2(0.12 * t, -0.08 * t));

  vec2 iq = dir * 0.9 + uSeed.yx * 0.37 + vec2(0.06 * t);
  float lobes = gnoise(iq) * 0.75 + gnoise(q * 2.1 + 9.9) * 0.25;
  float reach = clamp(1.0 + 0.22 * 1.6 * lobes + 0.20 * 1.5 * blob, 0.58, 1.42);
  float f0 = d - uR * reach;

  // Tendrils extending from edge along noise ridges
  float gate = smoothstep(-0.35, 0.4, fbm3(dir * 1.6 + uSeed * 0.61 + vec2(3.71)));
  vec2 tq = dir * 2.2 * ns + (d / max(uRef, 1.0)) * vec2(2.6, -1.9) * ns + 1.2 * w + uSeed * 1.7 + vec2(10.0, 0.18 * t);
  float ridgePx = abs(fbm4(tq)) * max(d, 24.0) / (4.0 * ns);
  float L = uTendril * 0.24 * uR * gate * (0.35 + 0.65 * clamp(0.5 + 0.5 * gnoise(dir * 3.1 + uSeed * 0.43 + vec2(0.1 * t)), 0.0, 1.0));
  float along = clamp(f0 / max(L, 1.0), 0.0, 1.0);
  float width = clamp(uR * 0.022, 1.5, 9.0) * (1.0 - along * along) * gate;
  float f1 = max(f0 - L, ridgePx - width);

  // Smooth-union with k = 6
  float h = clamp(0.5 + 0.5 * (f1 - f0) / 6.0, 0.0, 1.0);
  float f = mix(f1, f0, h) - 6.0 * h * (1.0 - h);

  // Paper fibres, static in screen space
  vec2 fq = css * 0.34 + uSeed * 13.1;
  float fibre = gnoise(fq) * 0.65 + gnoise(OCT_ROT * fq * 5.3) * 0.35;
  f += 1.8 * fibre;

  // End-of-animation cleanup expansion so 100% of screen is covered by t=2.2s
  f -= uCleanup;

  float soft = max(uSoftness, 0.6);
  float inked = 1.0 - smoothstep(-soft, soft, f);

  // Ink thins just behind the front
  float thinW = mix(3.0, 20.0, clamp(blob * 0.6 + 0.3, 0.0, 1.0));
  float cov = inked * mix(0.6, 1.0, smoothstep(0.0, thinW, -f));

  // Diffusion haze just ahead of the front
  float hazeW = mix(4.0, 16.0, clamp(0.5 - 0.5 * blob, 0.0, 1.0));
  float haze = (1.0 - smoothstep(0.0, hazeW, f)) * smoothstep(-0.3, 0.6, 0.35 * fibre + w.x);
  cov = max(cov, haze * 0.24 * step(0.0, f));

  // Tiny droplets within 18 px ahead of the front from thresholded fibre noise
  float dropMask = (1.0 - smoothstep(0.0, 18.0, f)) * step(0.0, f);
  float dropField = gnoise(css * 0.22 + uSeed * 7.3) + 0.38 * fibre;
  float drops = smoothstep(0.46, 0.64, dropField);
  cov = max(cov, drops * dropMask * 0.58);

  vec3 col = mix(fromCol, toCol, cov);

  // Marbled band (-1 < u < 0.5): wide black & white streaks curling with soft grey veils
  float u = f / max(bandW, 1.0);
  if (u > -1.0 && u < 0.5) {
    float bandEnv = smoothstep(-1.0, -0.45, u) * (1.0 - smoothstep(0.08, 0.5, u));
    float onset = smoothstep(0.0, 22.0, uR);

    vec2 mq = p * 3.1 * ns + dir * 1.35 + uSeed * 2.1 + vec2(0.07 * t, -0.05 * t);
    vec2 warp2 = vec2(fbm3(mq + w * 1.25), fbm3(mq.yx + vec2(4.7, -2.9) - w));
    vec2 mq2 = mq * 1.65 + 2.4 * warp2 + vec2(-0.06 * t, 0.09 * t);
    vec2 warp3 = vec2(fbm4(mq2 + 1.1 * w), fbm4(mq2.yx + vec2(-3.1, 6.4)));
    float marble = fbm5(mq2 + 2.2 * warp3 + 0.42 * fibre);

    float th = sin((marble * 5.2 + u * 2.6 + warp3.x * 1.8) * 3.14159265);
    float streak = smoothstep(-0.22, 0.28, th);
    float veil = smoothstep(-0.55, 0.65, fbm4(mq2 * 0.85 - warp2 * 1.4));
    float bw = mix(streak, mix(0.24, 0.78, veil), 0.34);

    col = mix(col, vec3(bw), bandEnv * onset * 0.90);

    // Subtle pigment rim at the leading edge toward target page colour
    float rim = smoothstep(-soft * 2.2, 0.0, f) * (1.0 - smoothstep(0.0, soft * 2.6, f));
    col = mix(col, uRimColor, rim * 0.26 * onset);
  }

  outColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL2 shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createNoiseTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // Deterministic high-quality PRNG for periodic gradient lattice
  let state = 0x9e3779b9;
  const nextRand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
  for (let i = 0; i < size * size; i++) {
    const angle = nextRand() * Math.PI * 2;
    const gx = Math.cos(angle);
    const gy = Math.sin(angle);
    const idx = i * 4;
    data[idx] = Math.round((gx * 0.5 + 0.5) * 255);
    data[idx + 1] = Math.round((gy * 0.5 + 0.5) * 255);
    data[idx + 2] = Math.round(nextRand() * 255);
    data[idx + 3] = 255;
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error('Unable to create noise texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return tex;
}

export class InkWebGL2Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private noiseTex: WebGLTexture | null = null;
  private freezeFbo: WebGLFramebuffer | null = null;
  private freezeTexs: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private activeFreezeIdx = 0;
  private freezeSizePx: [number, number] = [0, 0];
  private contextLost = false;
  private renderScale = 1;
  private viewportCss: [number, number] = [1, 1];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private seedRotBuffer = new Float32Array(4);

  private onLostHandler: ((e: Event) => void) | null = null;
  private onRestoredHandler: ((e: Event) => void) | null = null;

  // WebGL2 Canvas Lifecycle Manager (cancels rAF immediately when hidden or out of viewport)
  private rafId = 0;
  private loopActive = false;
  private canvasShown = false;
  private inViewport = true;
  private documentHidden = typeof document !== 'undefined' ? document.hidden : false;
  private loopStepFn: ((now: number) => boolean) | null = null;
  private visibilityListener: (() => void) | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private intersectionTimer = 0;

  constructor() {
    const existing = document.querySelector<HTMLCanvasElement>('canvas.ink-canvas');
    if (existing) existing.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'ink-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-html2canvas-ignore', 'true');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '1000';
    canvas.style.pointerEvents = 'none';
    canvas.style.visibility = 'hidden';
    canvas.style.opacity = '0';

    document.body.appendChild(canvas);
    this.canvas = canvas;

    this.onLostHandler = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.pauseLifecycle();
    };
    this.onRestoredHandler = () => {
      this.contextLost = false;
      this.initGL();
    };
    canvas.addEventListener('webglcontextlost', this.onLostHandler);
    canvas.addEventListener('webglcontextrestored', this.onRestoredHandler);

    this.setupLifecycleObservers();
    this.initGL();
    this.resizeCanvas();
  }

  private setupLifecycleObservers(): void {
    this.visibilityListener = () => {
      this.documentHidden = typeof document !== 'undefined' ? document.hidden : false;
      if (this.documentHidden) {
        this.pauseLifecycle();
      } else if (this.loopActive && this.canvasShown && this.inViewport) {
        this.scheduleLifecycleFrame();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityListener);

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          window.clearTimeout(this.intersectionTimer);
          this.intersectionTimer = window.setTimeout(() => {
            const visible = entries.some((entry) => entry.isIntersecting);
            this.inViewport = visible;
            if (!visible) {
              this.pauseLifecycle();
            } else if (this.loopActive && this.canvasShown && !this.documentHidden) {
              this.scheduleLifecycleFrame();
            }
          }, 50);
        },
        { threshold: 0.01 }
      );
      this.intersectionObserver.observe(this.canvas);
    }
  }

  private scheduleLifecycleFrame(): void {
    if (
      this.rafId !== 0 ||
      !this.loopActive ||
      !this.canvasShown ||
      !this.inViewport ||
      this.documentHidden ||
      !this.isAvailable() ||
      !this.loopStepFn
    ) {
      return;
    }

    const tick = (now: number) => {
      this.rafId = 0;
      if (
        !this.loopActive ||
        !this.canvasShown ||
        !this.inViewport ||
        this.documentHidden ||
        !this.isAvailable() ||
        !this.loopStepFn
      ) {
        return;
      }
      const keepGoing = this.loopStepFn(now);
      if (keepGoing && this.loopActive && this.canvasShown && this.inViewport && !this.documentHidden) {
        this.rafId = window.requestAnimationFrame(tick);
      } else {
        this.loopActive = false;
      }
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  public startLifecycleLoop(step: (now: number) => boolean): void {
    this.cancelLifecycleFrame();
    this.loopStepFn = step;
    this.loopActive = true;
    this.scheduleLifecycleFrame();
  }

  public pauseLifecycle(): void {
    this.cancelLifecycleFrame();
  }

  public cancelLifecycleFrame(): void {
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  public stopLifecycleLoop(): void {
    this.loopActive = false;
    this.loopStepFn = null;
    this.cancelLifecycleFrame();
  }

  public isLifecyclePaused(): boolean {
    return this.rafId === 0 && !this.loopActive;
  }

  private initGL(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      this.gl = null;
      return;
    }

    try {
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      const program = gl.createProgram();
      if (!program) throw new Error('Unable to create WebGL2 program');
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || 'Program link failed';
        gl.deleteProgram(program);
        throw new Error(log);
      }

      const vao = gl.createVertexArray();
      const noiseTex = createNoiseTexture(gl);
      const freezeFbo = gl.createFramebuffer();

      this.gl = gl;
      this.program = program;
      this.vao = vao;
      this.noiseTex = noiseTex;
      this.freezeFbo = freezeFbo;
      this.freezeTexs = [null, null];
      this.freezeSizePx = [0, 0];

      const names = [
        'uNoiseTex',
        'uFromTex',
        'uToTex',
        'uViewportCss',
        'uDpr',
        'uRef',
        'uScroll',
        'uFromSnapCss',
        'uToSnapCss',
        'uFromSnapOrigin',
        'uToSnapOrigin',
        'uFromIsFrozen',
        'uFreezeScroll',
        'uCenter',
        'uR',
        'uCleanup',
        'uLinear',
        'uElapsed',
        'uSeed',
        'uSeedRot',
        'uTendril',
        'uNoiseScale',
        'uSoftness',
        'uDrift',
        'uRimColor',
      ];
      this.uniforms = {};
      for (const name of names) {
        this.uniforms[name] = gl.getUniformLocation(program, name);
      }
    } catch {
      this.gl = null;
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.gl && !this.contextLost && !this.gl.isContextLost());
  }

  public getMaxTextureSize(): number {
    if (!this.gl) return 4096;
    return Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 4096;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public resizeCanvas(): void {
    const docEl = document.documentElement;
    const vw = docEl.clientWidth || window.innerWidth;
    const vh = docEl.clientHeight || window.innerHeight;
    this.viewportCss[0] = vw;
    this.viewportCss[1] = vh;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const scale = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
    this.renderScale = scale;

    const pw = Math.max(1, Math.round(vw * scale));
    const ph = Math.max(1, Math.round(vh * scale));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  public uploadSnapshotCanvas(
    sourceCanvas: HTMLCanvasElement,
    widthCss: number,
    heightCss: number,
    scale: number,
    revision: number,
    originXCss = 0,
    originYCss = 0
  ): SnapshotTextureRecord | null {
    const gl = this.gl;
    if (!gl || !this.isAvailable()) return null;

    const tex = gl.createTexture();
    if (!tex) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    return {
      texture: tex,
      key: `${widthCss}x${heightCss}@${originXCss},${originYCss}#${scale}*${revision}`,
      widthCss,
      heightCss,
      originXCss,
      originYCss,
      scale,
      revision,
    };
  }

  public deleteSnapshotTexture(record: SnapshotTextureRecord | null): void {
    if (!record || !this.gl) return;
    try {
      this.gl.deleteTexture(record.texture);
    } catch {
      // Ignore deletion errors if context lost
    }
  }

  public getActiveFreezeTexture(): WebGLTexture | null {
    return this.freezeTexs[this.activeFreezeIdx];
  }

  private ensureFreezeTextures(pw: number, ph: number): void {
    const gl = this.gl;
    if (!gl) return;
    if (
      this.freezeSizePx[0] === pw &&
      this.freezeSizePx[1] === ph &&
      this.freezeTexs[0] &&
      this.freezeTexs[1]
    ) {
      return;
    }
    for (let i = 0; i < 2; i++) {
      const old = this.freezeTexs[i];
      if (old) gl.deleteTexture(old);
      const tex = gl.createTexture();
      if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.freezeTexs[i] = tex;
    }
    this.freezeSizePx = [pw, ph];
  }

  /**
   * Captures the live ink composition frame into an offscreen FBO texture
   * so mid-animation re-clicks start cleanly from the frozen screen pixels.
   */
  public freezeCurrentFrame(
    fromSnap: SnapshotTextureRecord,
    toSnap: SnapshotTextureRecord,
    state: InkRenderState
  ): WebGLTexture | null {
    const gl = this.gl;
    if (!gl || !this.freezeFbo || !this.isAvailable()) return null;

    this.resizeCanvas();
    const pw = this.canvas.width;
    const ph = this.canvas.height;
    this.ensureFreezeTextures(pw, ph);

    const writeIdx = (this.activeFreezeIdx + 1) % 2;
    const targetTex = this.freezeTexs[writeIdx];
    if (!targetTex) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.freezeFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }

    this.drawPass(fromSnap, toSnap, state);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.activeFreezeIdx = writeIdx;
    return targetTex;
  }

  public render(
    fromSnap: SnapshotTextureRecord,
    toSnap: SnapshotTextureRecord,
    state: InkRenderState
  ): void {
    const gl = this.gl;
    if (!gl || !this.isAvailable()) return;
    this.resizeCanvas();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.drawPass(fromSnap, toSnap, state);
  }

  private drawPass(
    fromSnap: SnapshotTextureRecord,
    toSnap: SnapshotTextureRecord,
    state: InkRenderState
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.noiseTex) return;

    const pw = this.canvas.width;
    const ph = this.canvas.height;
    const vw = this.viewportCss[0] || document.documentElement.clientWidth || window.innerWidth;
    const vh = this.viewportCss[1] || document.documentElement.clientHeight || window.innerHeight;
    const dpr = this.renderScale;

    const p: InkShaderParams = {
      ...DEFAULT_INK_PARAMS,
      ...(state.params || {}),
    };

    const linear = Math.min(1, Math.max(0, state.elapsed / INK_DURATION_S));
    const progress = power3Out(linear);
    const R = progress * 0.7 * state.maxDist;
    const tGrad = Math.max(0, (linear - 0.45) / 0.55);
    const tNear = Math.max(0, (linear - 0.97) / 0.03);
    const cleanup = state.maxDist * 0.4 * tGrad * tGrad + (state.maxDist * 0.85 + 280) * tNear;

    const c = Math.cos(state.seedAngle);
    const s = Math.sin(state.seedAngle);

    gl.viewport(0, 0, pw, ph);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(this.uniforms.uNoiseTex, 0);

    const activeFromTex =
      state.fromIsFrozen && this.getActiveFreezeTexture()
        ? this.getActiveFreezeTexture()!
        : fromSnap.texture;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, activeFromTex);
    gl.uniform1i(this.uniforms.uFromTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, toSnap.texture);
    gl.uniform1i(this.uniforms.uToTex, 2);

    gl.uniform2f(this.uniforms.uViewportCss, vw, vh);
    gl.uniform1f(this.uniforms.uDpr, dpr);
    gl.uniform1f(this.uniforms.uRef, Math.max(vw, vh));
    gl.uniform2f(this.uniforms.uScroll, state.scrollCss[0], state.scrollCss[1]);

    gl.uniform2f(this.uniforms.uFromSnapCss, fromSnap.widthCss, fromSnap.heightCss);
    gl.uniform2f(this.uniforms.uToSnapCss, toSnap.widthCss, toSnap.heightCss);
    gl.uniform2f(this.uniforms.uFromSnapOrigin, fromSnap.originXCss, fromSnap.originYCss);
    gl.uniform2f(this.uniforms.uToSnapOrigin, toSnap.originXCss, toSnap.originYCss);
    gl.uniform1i(this.uniforms.uFromIsFrozen, state.fromIsFrozen ? 1 : 0);
    gl.uniform2f(
      this.uniforms.uFreezeScroll,
      state.freezeScrollCss[0],
      state.freezeScrollCss[1]
    );

    gl.uniform2f(this.uniforms.uCenter, state.centerCss[0], state.centerCss[1]);
    gl.uniform1f(this.uniforms.uR, R);
    gl.uniform1f(this.uniforms.uCleanup, cleanup);
    gl.uniform1f(this.uniforms.uLinear, linear);
    gl.uniform1f(this.uniforms.uElapsed, state.elapsed);

    this.seedRotBuffer[0] = c;
    this.seedRotBuffer[1] = s;
    this.seedRotBuffer[2] = -s;
    this.seedRotBuffer[3] = c;
    gl.uniform2f(this.uniforms.uSeed, state.seed[0], state.seed[1]);
    gl.uniformMatrix2fv(this.uniforms.uSeedRot, false, this.seedRotBuffer);

    gl.uniform1f(this.uniforms.uTendril, p.tendril);
    gl.uniform1f(this.uniforms.uNoiseScale, p.noiseScale);
    gl.uniform1f(this.uniforms.uSoftness, p.softness);
    gl.uniform1f(this.uniforms.uDrift, p.drift);
    gl.uniform3f(
      this.uniforms.uRimColor,
      state.rimColor[0],
      state.rimColor[1],
      state.rimColor[2]
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  public show(): void {
    this.canvasShown = true;
    this.canvas.style.visibility = 'visible';
    this.canvas.style.opacity = '1';
    if (this.loopActive && this.inViewport && !this.documentHidden) {
      this.scheduleLifecycleFrame();
    }
  }

  public hide(): void {
    this.canvasShown = false;
    this.stopLifecycleLoop();
    this.canvas.style.visibility = 'hidden';
    this.canvas.style.opacity = '0';
  }

  public destroy(): void {
    this.stopLifecycleLoop();
    window.clearTimeout(this.intersectionTimer);
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    if (this.onLostHandler) {
      this.canvas.removeEventListener('webglcontextlost', this.onLostHandler);
    }
    if (this.onRestoredHandler) {
      this.canvas.removeEventListener('webglcontextrestored', this.onRestoredHandler);
    }
    if (this.gl) {
      if (this.noiseTex) this.gl.deleteTexture(this.noiseTex);
      if (this.freezeTexs[0]) this.gl.deleteTexture(this.freezeTexs[0]);
      if (this.freezeTexs[1]) this.gl.deleteTexture(this.freezeTexs[1]);
      if (this.freezeFbo) this.gl.deleteFramebuffer(this.freezeFbo);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.canvas.remove();
  }
}
