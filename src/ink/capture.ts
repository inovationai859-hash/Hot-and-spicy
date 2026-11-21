import { getThemePageBg, ThemeMode } from './theme';
import type { InkWebGL2Renderer, SnapshotTextureRecord } from './renderer';

type Html2CanvasFn = typeof import('html2canvas')['default'];

async function waitForPageAssets(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (document.querySelector('[data-ink-loader="true"]')) {
    await new Promise<void>((resolve) => {
      const done = () => {
        obs.disconnect();
        window.clearTimeout(timer);
        window.requestAnimationFrame(() => resolve());
      };
      const obs = new MutationObserver(() => {
        if (!document.querySelector('[data-ink-loader="true"]')) done();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const timer = window.setTimeout(done, 2500);
    });
  }

  // Wait for lazy-loaded sections (down to <footer>) to mount when customer page is active
  if (document.querySelector('main') && !document.querySelector('footer')) {
    await new Promise<void>((resolve) => {
      const done = () => {
        obs.disconnect();
        window.clearTimeout(timer);
        window.requestAnimationFrame(() => resolve());
      };
      const obs = new MutationObserver(() => {
        if (document.querySelector('footer') || !document.querySelector('main')) {
          done();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const timer = window.setTimeout(done, 3500);
    });
  }

  // Wait for document height to stabilize across two animation frames
  await new Promise<void>((resolve) => {
    let lastH = document.documentElement.scrollHeight;
    let settled = 0;
    let checks = 0;
    const step = () => {
      const h = document.documentElement.scrollHeight;
      checks += 1;
      if (Math.abs(h - lastH) <= 2) {
        settled += 1;
      } else {
        settled = 0;
        lastH = h;
      }
      if (settled >= 2 || checks >= 14) {
        resolve();
      } else {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  });

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch {
    // Ignore font readiness rejections
  }

  const imgs = Array.from(document.querySelectorAll('img'));
  await Promise.allSettled(
    imgs.map(async (img) => {
      if (img.loading === 'lazy' && !img.complete) {
        return;
      }
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 1200);
          const done = () => {
            window.clearTimeout(timer);
            resolve();
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      }
      if (typeof img.decode === 'function' && img.naturalWidth > 0) {
        await Promise.race([
          img.decode().catch(() => {}),
          new Promise<void>((r) => window.setTimeout(r, 500)),
        ]);
      }
    })
  );
}

function scheduleIdleWork(cb: () => void, timeoutMs = 2000): number {
  const win = window as unknown as {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof win.requestIdleCallback === 'function') {
    return win.requestIdleCallback(cb, { timeout: timeoutMs });
  }
  return window.setTimeout(cb, 300);
}

function cancelIdleWork(handle: number): void {
  const win = window as unknown as {
    cancelIdleCallback?: (id: number) => void;
    requestIdleCallback?: unknown;
  };
  if (typeof win.requestIdleCallback === 'function' && typeof win.cancelIdleCallback === 'function') {
    win.cancelIdleCallback(handle);
  } else {
    window.clearTimeout(handle);
  }
}

function hasBlockingUiOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector('[data-ink-loader="true"], [role="dialog"], [role="alertdialog"]')
  );
}

export class SnapshotCaptureManager {
  private renderer: InkWebGL2Renderer;
  private isBusy: () => boolean;
  private revision = 1;
  private textures: Record<ThemeMode, SnapshotTextureRecord | null> = {
    light: null,
    dark: null,
  };
  private capturing = false;
  private queued = false;
  private disposed = false;
  private html2canvasMod: Html2CanvasFn | null = null;
  private resizeTimer = 0;
  private idleHandle = 0;
  private initialDelayTimer = 0;
  private scrollResumeTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastObservedWidth = 0;
  private lastCapturedScrollY = 0;
  private lastScrollStamp = 0;
  private scrollPauseUntil = 0;
  private scrollCaptureTimer = 0;
  private onResizeBound: () => void;
  private onScrollBound: () => void;

  constructor(renderer: InkWebGL2Renderer, isBusy: () => boolean) {
    this.renderer = renderer;
    this.isBusy = isBusy;
    this.lastObservedWidth =
      typeof document !== 'undefined' ? document.documentElement.clientWidth || window.innerWidth : 0;
    this.onResizeBound = () => this.scheduleResizeCapture();
    this.onScrollBound = () => this.handlePassiveScroll();
  }

  private handlePassiveScroll(): void {
    const now = performance.now();
    // Throttle scroll bookkeeping to avoid overhead on high-Hz input
    if (now - this.lastScrollStamp < 120) return;
    this.lastScrollStamp = now;
    this.scrollPauseUntil = now + 900;

    // Schedule calm viewport re-capture after scroll settles far from previous snapshot
    window.clearTimeout(this.scrollCaptureTimer);
    this.scrollCaptureTimer = window.setTimeout(() => {
      if (this.disposed || this.isBusy() || this.capturing) return;
      const vh = document.documentElement.clientHeight || window.innerHeight || 800;
      const scrollY = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
      if (Math.abs(scrollY - this.lastCapturedScrollY) > vh * 0.35) {
        this.revision += 1;
        void this.captureBothThemes();
      }
    }, 950);
  }

  private async waitUntilInteractionSettled(): Promise<void> {
    while (!this.disposed) {
      const now = performance.now();
      const threeRolling = Boolean((window as unknown as { __hs3dRolling?: boolean }).__hs3dRolling);
      if (
        !this.isBusy() &&
        !hasBlockingUiOverlay() &&
        now >= this.scrollPauseUntil &&
        !threeRolling
      ) {
        return;
      }
      await new Promise<void>((resolve) => {
        window.clearTimeout(this.scrollResumeTimer);
        this.scrollResumeTimer = window.setTimeout(resolve, 250);
      });
    }
  }

  public start(): void {
    window.addEventListener('resize', this.onResizeBound, { passive: true });
    window.addEventListener('scroll', this.onScrollBound, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const nextWidth = document.documentElement.clientWidth || window.innerWidth;
        if (Math.abs(nextWidth - this.lastObservedWidth) <= 16 && this.hasValidPair()) {
          return;
        }
        this.lastObservedWidth = nextWidth;
        this.scheduleResizeCapture();
      });
      this.resizeObserver.observe(document.body);
    }

    // Defer snapshot capture until after initial hero/loader settles & browser goes idle
    this.initialDelayTimer = window.setTimeout(() => {
      if (this.disposed) return;
      this.idleHandle = scheduleIdleWork(() => {
        if (!this.disposed) {
          void this.captureBothThemes();
        }
      }, 2200);
    }, 1800);
  }

  public getSnapshot(theme: ThemeMode): SnapshotTextureRecord | null {
    return this.textures[theme];
  }

  public hasValidPair(): boolean {
    const l = this.textures.light;
    const d = this.textures.dark;
    return Boolean(
      l &&
        d &&
        l.widthCss === d.widthCss &&
        l.heightCss === d.heightCss &&
        this.renderer.isAvailable()
    );
  }

  public getRevision(): number {
    return this.revision;
  }

  public refresh(): void {
    this.revision += 1;
    if (this.isBusy()) {
      this.queued = true;
      return;
    }
    void this.captureBothThemes();
  }

  public flushPending(): void {
    if (this.queued && !this.isBusy() && !this.disposed) {
      this.queued = false;
      void this.captureBothThemes();
    }
  }

  private scheduleResizeCapture(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.renderer.resizeCanvas();
      const nextWidth = document.documentElement.clientWidth || window.innerWidth;
      if (this.hasValidPair() && Math.abs(nextWidth - this.lastObservedWidth) <= 16) {
        return;
      }
      this.lastObservedWidth = nextWidth;
      if (this.isBusy()) {
        this.queued = true;
        return;
      }
      void this.captureBothThemes();
    }, 500);
  }

  private async ensureHtml2Canvas(): Promise<Html2CanvasFn> {
    if (!this.html2canvasMod) {
      const mod = await import('html2canvas');
      this.html2canvasMod = mod.default;
    }
    return this.html2canvasMod;
  }

  public async renderThemeCanvas(targetTheme: ThemeMode): Promise<{
    canvas: HTMLCanvasElement;
    widthCss: number;
    heightCss: number;
    originXCss: number;
    originYCss: number;
    scale: number;
  }> {
    const html2canvas = await this.ensureHtml2Canvas();
    await waitForPageAssets();

    const docEl = document.documentElement;
    const widthCss = Math.max(1, docEl.clientWidth || window.innerWidth);
    const clientHeight = Math.max(1, docEl.clientHeight || window.innerHeight);
    const originXCss = Math.max(0, Math.round(window.scrollX || docEl.scrollLeft || 0));
    const maxY = Math.max(0, (docEl.scrollHeight || clientHeight) - clientHeight);
    const originYCss = Math.min(
      maxY,
      Math.max(0, Math.round(window.scrollY || docEl.scrollTop || 0))
    );
    // Capture strictly the visible viewport band (not ~6000px full document)
    const heightCss = clientHeight;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const maxTex = this.renderer.getMaxTextureSize();

    let scale = Math.min(window.devicePixelRatio || 1, isTouch ? 0.65 : 0.85);
    const maxSide = Math.max(widthCss, heightCss);
    if (maxSide * scale > maxTex) {
      scale = Math.max(0.25, Math.floor((maxTex / maxSide) * 100) / 100);
    }

    const canvas = await html2canvas(document.body, {
      width: widthCss,
      height: heightCss,
      x: originXCss,
      y: originYCss,
      scrollX: originXCss,
      scrollY: originYCss,
      windowWidth: widthCss,
      windowHeight: clientHeight,
      useCORS: true,
      logging: false,
      backgroundColor: getThemePageBg(targetTheme),
      scale,
      ignoreElements: (el: Element) => {
        const tag = el.tagName;
        if (tag === 'VIDEO' || tag === 'CANVAS') return true;
        if (el.hasAttribute('data-html2canvas-ignore') || el.hasAttribute('data-ink-live')) {
          return true;
        }
        return false;
      },
      onclone: (clonedDoc: Document) => {
        clonedDoc.documentElement.setAttribute('data-theme', targetTheme);
        clonedDoc.documentElement.classList.remove('dark');
        clonedDoc.documentElement.classList.add('ink-snapshot');
      },
    });

    return { canvas, widthCss, heightCss, originXCss, originYCss, scale };
  }

  private async captureSingleTheme(
    targetTheme: ThemeMode,
    captureRevision: number
  ): Promise<{ widthCss: number; heightCss: number; scale: number } | null> {
    await this.waitUntilInteractionSettled();
    if (this.disposed || this.isBusy() || hasBlockingUiOverlay()) {
      this.queued = true;
      return null;
    }

    const { canvas, widthCss, heightCss, originXCss, originYCss, scale } =
      await this.renderThemeCanvas(targetTheme);
    if (this.disposed || this.isBusy()) {
      this.queued = true;
      return null;
    }

    const expectedKey = `${widthCss}x${heightCss}@${originXCss},${originYCss}#${scale}*${captureRevision}`;
    const current = this.textures[targetTheme];
    if (current && current.key === expectedKey) {
      return { widthCss, heightCss, scale };
    }

    const uploaded = this.renderer.uploadSnapshotCanvas(
      canvas,
      widthCss,
      heightCss,
      scale,
      captureRevision,
      originXCss,
      originYCss
    );
    if (uploaded) {
      this.renderer.deleteSnapshotTexture(this.textures[targetTheme]);
      this.textures[targetTheme] = uploaded;
      this.lastCapturedScrollY = originYCss;
    }
    return { widthCss, heightCss, scale };
  }

  public async captureBothThemes(): Promise<void> {
    if (this.disposed || !this.renderer.isAvailable()) return;
    if (this.isBusy() || this.capturing) {
      this.queued = true;
      return;
    }

    this.capturing = true;
    const captureRevision = this.revision;

    try {
      const lightMeta = await this.captureSingleTheme('light', captureRevision);
      if (!lightMeta || this.disposed) return;

      await new Promise<void>((r) => window.setTimeout(r, 150));
      if (this.disposed) return;

      const darkMeta = await this.captureSingleTheme('dark', captureRevision);
      if (!darkMeta || this.disposed) return;

      if (
        lightMeta.widthCss !== darkMeta.widthCss ||
        lightMeta.heightCss !== darkMeta.heightCss ||
        lightMeta.scale !== darkMeta.scale
      ) {
        await new Promise<void>((r) => window.setTimeout(r, 100));
        await this.captureSingleTheme('light', captureRevision);
      }
    } catch {
      // Snapshot capture failure keeps CSS cross-fade fallback active gracefully
    } finally {
      this.capturing = false;
      if (this.queued && !this.isBusy() && !this.disposed) {
        this.queued = false;
        window.setTimeout(() => {
          if (!this.disposed && !this.isBusy()) {
            void this.captureBothThemes();
          }
        }, 300);
      }
    }
  }

  public destroy(): void {
    this.disposed = true;
    window.clearTimeout(this.resizeTimer);
    window.clearTimeout(this.initialDelayTimer);
    window.clearTimeout(this.scrollResumeTimer);
    window.clearTimeout(this.scrollCaptureTimer);
    cancelIdleWork(this.idleHandle);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('scroll', this.onScrollBound);
    this.resizeObserver?.disconnect();
    this.renderer.deleteSnapshotTexture(this.textures.light);
    this.renderer.deleteSnapshotTexture(this.textures.dark);
    this.textures.light = null;
    this.textures.dark = null;
  }
}
