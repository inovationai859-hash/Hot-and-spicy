import gsap from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { THEME_TOGGLE_CHROME, ThemeMode } from './theme';

gsap.registerPlugin(MorphSVGPlugin);

// Sun body circle path (center 12,12 radius 4.5) and crescent moon path (center 12,12)
const SUN_BODY_PATH = 'M16.5,12 A4.5,4.5 0 1,1 7.5,12 A4.5,4.5 0 1,1 16.5,12 Z';
const MOON_BODY_PATH = 'M19.8,14.2 A7.5,7.5 0 0,1 9.8,4.2 A6.8,6.8 0 1,0 19.8,14.2 Z';

export class ThemeIconAnimator {
  private activeTimeline: gsap.core.Timeline | null = null;
  private pathReady = false;

  private getElements(): {
    button: HTMLButtonElement | null;
    bodyEl: SVGPathElement | null;
    rays: SVGLineElement[];
  } {
    if (typeof document === 'undefined') {
      return { button: null, bodyEl: null, rays: [] };
    }
    const button = document.getElementById('theme-toggle') as HTMLButtonElement | null;
    if (!button) return { button: null, bodyEl: null, rays: [] };

    if (!this.pathReady) {
      const circle = button.querySelector<SVGCircleElement>('[data-ink-sun-body]');
      if (circle && circle.tagName.toLowerCase() === 'circle') {
        const converted = MorphSVGPlugin.convertToPath(circle);
        const pathNode = Array.isArray(converted) ? converted[0] : converted;
        if (pathNode) {
          pathNode.setAttribute('data-ink-sun-body', 'true');
        }
      }
      this.pathReady = true;
    }

    const bodyEl = button.querySelector<SVGPathElement>('[data-ink-sun-body]');
    const rays = Array.from(button.querySelectorAll<SVGLineElement>('[data-ink-ray]'));
    return { button, bodyEl, rays };
  }

  public syncImmediate(theme: ThemeMode): void {
    this.activeTimeline?.kill();
    this.activeTimeline = null;

    const { button, bodyEl, rays } = this.getElements();
    if (!button) return;

    const chrome = THEME_TOGGLE_CHROME[theme];
    gsap.set(button, {
      backgroundColor: chrome.backgroundColor,
      borderColor: chrome.borderColor,
      color: chrome.color,
    });

    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    button.setAttribute('aria-label', theme === 'dark' ? 'Light mode' : 'Dark mode');

    if (bodyEl) {
      bodyEl.setAttribute('d', theme === 'dark' ? MOON_BODY_PATH : SUN_BODY_PATH);
      gsap.set(bodyEl, {
        fill: theme === 'dark' ? 'currentColor' : 'none',
        stroke: 'currentColor',
      });
    }

    if (rays.length > 0) {
      gsap.set(rays, {
        transformOrigin: '12px 12px',
        scale: theme === 'dark' ? 0 : 1,
        rotation: theme === 'dark' ? 45 : 0,
        opacity: theme === 'dark' ? 0 : 1,
      });
    }
  }

  /**
   * Animates #theme-toggle sun <-> moon morph and chrome color tween starting
   * precisely when the ink front arrives at the button center (`arrivalSec`).
   */
  public animateToTheme(
    targetTheme: ThemeMode,
    arrivalSec: number,
    durationSec: number,
    timeScale: number
  ): void {
    this.activeTimeline?.kill();

    const { button, bodyEl, rays } = this.getElements();
    if (!button) return;

    button.setAttribute('aria-pressed', targetTheme === 'dark' ? 'true' : 'false');
    button.setAttribute('aria-label', targetTheme === 'dark' ? 'Light mode' : 'Dark mode');

    const chrome = THEME_TOGGLE_CHROME[targetTheme];
    const toDark = targetTheme === 'dark';
    const dur = Math.max(0.28, durationSec);

    const tl = gsap.timeline();
    tl.timeScale(Math.max(0.01, timeScale));

    tl.to(
      button,
      {
        backgroundColor: chrome.backgroundColor,
        borderColor: chrome.borderColor,
        color: chrome.color,
        duration: dur,
        ease: 'power3.out',
      },
      arrivalSec
    );

    if (bodyEl) {
      tl.to(
        bodyEl,
        {
          morphSVG: toDark ? MOON_BODY_PATH : SUN_BODY_PATH,
          fill: toDark ? 'currentColor' : 'none',
          duration: dur,
          ease: 'power3.out',
        },
        arrivalSec
      );
    }

    if (rays.length > 0) {
      tl.to(
        rays,
        toDark
          ? {
              scale: 0,
              rotation: 45,
              opacity: 0,
              transformOrigin: '12px 12px',
              duration: dur * 0.45,
              stagger: 0.025,
              ease: 'power3.out',
            }
          : {
              scale: 1,
              rotation: 0,
              opacity: 1,
              transformOrigin: '12px 12px',
              duration: dur * 0.65,
              stagger: 0.025,
              ease: 'power3.out',
            },
        arrivalSec + (toDark ? 0 : dur * 0.14)
      );
    }

    this.activeTimeline = tl;
  }

  public setTimeScale(scale: number): void {
    if (this.activeTimeline) {
      this.activeTimeline.timeScale(Math.max(0.01, scale));
    }
  }

  public destroy(): void {
    this.activeTimeline?.kill();
    this.activeTimeline = null;
  }
}
