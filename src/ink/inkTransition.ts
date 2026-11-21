import {
  CANVAS_FADE_OUT_S,
  CSS_FADE_FALLBACK_MS,
  INK_DURATION_S,
  computeArrivalLinear,
  computeMaxDist,
} from './params';
import {
  ThemeMode,
  applyTheme,
  getTheme,
  getThemeRimColor,
  isInkDisabledByQuery,
  prefersReducedMotion,
  saveTheme,
  shouldIgnoreThemeShortcut,
} from './theme';
import { InkRenderState, InkWebGL2Renderer, SnapshotTextureRecord } from './renderer';
import { SnapshotCaptureManager } from './capture';
import { ThemeIconAnimator } from './themeIcons';

export interface InkPoint {
  x: number;
  y: number;
}

export class InkTransitionController {
  private renderer: InkWebGL2Renderer | null = null;
  private capture: SnapshotCaptureManager | null = null;
  private icons: ThemeIconAnimator | null = null;

  private initialized = false;
  private mountCount = 0;
  private timeScale = 1;

  private isAnimating = false;
  private isCssFading = false;
  private cssFadeTimer = 0;

  private currentFromSnap: SnapshotTextureRecord | null = null;
  private currentToSnap: SnapshotTextureRecord | null = null;
  private currentState: InkRenderState | null = null;

  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  public mount(): void {
    this.mountCount += 1;
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const renderer = new InkWebGL2Renderer();
    const icons = new ThemeIconAnimator();
    const capture = new SnapshotCaptureManager(renderer, () => this.isBusy());

    this.renderer = renderer;
    this.icons = icons;
    this.capture = capture;

    icons.syncImmediate(getTheme());
    capture.start();

    this.keyListener = (e: KeyboardEvent) => {
      if (shouldIgnoreThemeShortcut(e)) return;
      e.preventDefault();
      this.toggle();
    };
    window.addEventListener('keydown', this.keyListener);

    (window as unknown as { __inkTransition?: InkTransitionController }).__inkTransition = this;
  }

  public unmount(): void {
    this.mountCount = Math.max(0, this.mountCount - 1);
    if (this.mountCount > 0 || !this.initialized) return;

    this.renderer?.stopLifecycleLoop();
    window.clearTimeout(this.cssFadeTimer);

    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }

    this.icons?.destroy();
    this.capture?.destroy();
    this.renderer?.destroy();

    this.icons = null;
    this.capture = null;
    this.renderer = null;
    this.initialized = false;
  }

  public isBusy(): boolean {
    return this.isAnimating || this.isCssFading;
  }

  public setTimeScale(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.timeScale = n;
    this.icons?.setTimeScale(n);
  }

  public refresh(): void {
    this.capture?.refresh();
  }

  public setThemeImmediate(theme: ThemeMode): void {
    this.renderer?.stopLifecycleLoop();
    window.clearTimeout(this.cssFadeTimer);
    document.documentElement.classList.remove('theme-fade');
    this.isAnimating = false;
    this.isCssFading = false;
    this.renderer?.hide();
    applyTheme(theme);
    saveTheme(theme);
    this.icons?.syncImmediate(theme);
  }

  private getButtonCenter(): InkPoint {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const vw = document.documentElement.clientWidth || window.innerWidth;
    return { x: vw - 40, y: 36 };
  }

  public toggle(point?: InkPoint): void {
    const fromTheme = getTheme();
    const toTheme: ThemeMode = fromTheme === 'dark' ? 'light' : 'dark';
    const clickPt = point ?? this.getButtonCenter();

    const canUseWebGL =
      !prefersReducedMotion() &&
      !isInkDisabledByQuery() &&
      Boolean(this.renderer?.isAvailable()) &&
      Boolean(this.capture?.hasValidPair());

    if (!canUseWebGL) {
      this.runCssFallbackFade(toTheme);
      return;
    }

    const renderer = this.renderer!;
    const capture = this.capture!;
    const icons = this.icons!;

    const fromSnap = capture.getSnapshot(fromTheme);
    const toSnap = capture.getSnapshot(toTheme);
    if (!fromSnap || !toSnap) {
      this.runCssFallbackFade(toTheme);
      return;
    }

    let fromIsFrozen = false;
    let freezeScrollCss: [number, number] = [0, 0];

    // Clicking mid-animation freezes current frame cleanly via lifecycle cancellation
    if (this.isAnimating && this.currentState && this.currentFromSnap && this.currentToSnap) {
      renderer.stopLifecycleLoop();
      this.currentState.scrollCss = [window.scrollX, window.scrollY];
      const frozen = renderer.freezeCurrentFrame(
        this.currentFromSnap,
        this.currentToSnap,
        this.currentState
      );
      if (frozen) {
        fromIsFrozen = true;
        freezeScrollCss = [window.scrollX, window.scrollY];
      }
    } else {
      renderer.stopLifecycleLoop();
    }

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const maxDist = computeMaxDist(clickPt.x, clickPt.y, vw, vh);
    const btnCenter = this.getButtonCenter();
    const arrivalLinear = computeArrivalLinear(
      clickPt.x,
      clickPt.y,
      btnCenter.x,
      btnCenter.y,
      maxDist
    );

    const state: InkRenderState = {
      elapsed: 0,
      centerCss: [clickPt.x, clickPt.y],
      maxDist,
      scrollCss: [window.scrollX, window.scrollY],
      seed: [Math.random() * 90 + 5, Math.random() * 90 + 5],
      seedAngle: Math.random() * Math.PI * 2,
      rimColor: getThemeRimColor(toTheme),
      fromIsFrozen,
      freezeScrollCss,
    };

    this.currentFromSnap = fromSnap;
    this.currentToSnap = toSnap;
    this.currentState = state;
    this.isAnimating = true;

    // Show old snapshot over page, flip live page data-theme immediately underneath
    renderer.render(fromSnap, toSnap, state);
    renderer.show();

    applyTheme(toTheme);
    saveTheme(toTheme);

    const arrivalSec = arrivalLinear * INK_DURATION_S;
    const morphDurationSec = Math.max(0.45, INK_DURATION_S - arrivalSec);
    icons.animateToTheme(toTheme, arrivalSec, morphDurationSec, this.timeScale);

    const totalSec = INK_DURATION_S + CANVAS_FADE_OUT_S;
    let lastNow = performance.now();
    let totalElapsed = 0;
    const canvas = renderer.getCanvas();

    renderer.startLifecycleLoop((now) => {
      if (!this.renderer || !this.currentFromSnap || !this.currentToSnap || !this.currentState) {
        this.isAnimating = false;
        return false;
      }

      const rawDt = Math.max(0, (now - lastNow) / 1000);
      lastNow = now;
      // Clamp frame delta to avoid jumps after tab switch, scaled by timeScale
      totalElapsed += Math.min(rawDt, 0.05) * this.timeScale;

      if (totalElapsed <= INK_DURATION_S) {
        this.currentState.elapsed = totalElapsed;
        this.currentState.scrollCss = [window.scrollX, window.scrollY];
        this.renderer.render(this.currentFromSnap, this.currentToSnap, this.currentState);
        canvas.style.opacity = '1';
        return true;
      }

      if (this.currentState.elapsed < INK_DURATION_S) {
        this.currentState.elapsed = INK_DURATION_S;
        this.currentState.scrollCss = [window.scrollX, window.scrollY];
        this.renderer.render(this.currentFromSnap, this.currentToSnap, this.currentState);
      }

      const fadeProgress = Math.min(1, (totalElapsed - INK_DURATION_S) / CANVAS_FADE_OUT_S);
      canvas.style.opacity = String(Math.max(0, 1 - fadeProgress));

      if (totalElapsed >= totalSec) {
        this.renderer.hide();
        this.isAnimating = false;
        this.capture?.flushPending();
        return false;
      }

      return true;
    });
  }

  private runCssFallbackFade(toTheme: ThemeMode): void {
    window.clearTimeout(this.cssFadeTimer);
    this.renderer?.stopLifecycleLoop();
    this.isAnimating = false;
    this.renderer?.hide();

    const docEl = document.documentElement;
    if (prefersReducedMotion()) {
      applyTheme(toTheme);
      saveTheme(toTheme);
      this.icons?.syncImmediate(toTheme);
      this.capture?.flushPending();
      return;
    }

    this.isCssFading = true;
    docEl.classList.add('theme-fade');
    applyTheme(toTheme);
    saveTheme(toTheme);
    this.icons?.animateToTheme(toTheme, 0, 0.45, this.timeScale);

    this.cssFadeTimer = window.setTimeout(() => {
      docEl.classList.remove('theme-fade');
      this.isCssFading = false;
      this.capture?.flushPending();
    }, CSS_FADE_FALLBACK_MS);
  }

  public async renderDebugSnapshotPng(theme: ThemeMode): Promise<string> {
    if (!this.capture) throw new Error('Snapshot capture not mounted');
    const { canvas } = await this.capture.renderThemeCanvas(theme);
    return canvas.toDataURL('image/png');
  }

  public getDebugState() {
    return {
      initialized: this.initialized,
      isAnimating: this.isAnimating,
      isCssFading: this.isCssFading,
      timeScale: this.timeScale,
      webglAvailable: Boolean(this.renderer?.isAvailable()),
      lifecyclePaused: this.renderer ? this.renderer.isLifecyclePaused() : true,
      snapshotsReady: Boolean(this.capture?.hasValidPair()),
      revision: this.capture?.getRevision() ?? 0,
      lightKey: this.capture?.getSnapshot('light')?.key ?? null,
      darkKey: this.capture?.getSnapshot('dark')?.key ?? null,
      theme: getTheme(),
    };
  }
}

export const inkTransition = new InkTransitionController();
