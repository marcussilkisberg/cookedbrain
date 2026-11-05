import type { InputClass, Press } from './types';
import { sound } from './audio';

export class Aborted extends Error {
  constructor() {
    super('round aborted');
  }
}

type Listener = (p: Press) => void;

/**
 * The surface a test runs on. It owns input and time, so tests never touch
 * global listeners and a round can be abandoned at any await.
 *
 * Timing rules live here:
 * - input is read on pointerdown and keydown, never click
 * - every press carries event.timeStamp, the time the browser saw the input
 * - nothing here touches the network
 */
export class Stage {
  readonly sound = sound;
  private ctrl = new AbortController();
  private listeners = new Set<Listener>();
  private counts: Record<InputClass, number> = { mouse: 0, touch: 0, keyboard: 0 };
  private hudStatus: HTMLElement;
  private bar: HTMLElement;
  private forced: InputClass | null = null;
  private hiddenSeen = false;

  constructor(
    /** The arena element tests render into. */
    readonly el: HTMLElement,
    /** Everything that counts as a press, so the header is not a dead zone. */
    surface: HTMLElement,
    hudStatus: HTMLElement,
    bar: HTMLElement,
  ) {
    this.hudStatus = hudStatus;
    this.bar = bar;
    const signal = this.ctrl.signal;
    surface.addEventListener('pointerdown', this.onPointer, { signal });
    window.addEventListener('keydown', this.onKey, { signal });
    surface.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.hiddenSeen = true;
      },
      { signal },
    );
    this.setBar(0);
  }

  private onPointer = (e: PointerEvent) => {
    if (e.button > 0 || (e.target as HTMLElement).closest?.('#hud-quit')) return;
    const r = this.el.getBoundingClientRect();
    this.emit({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      t: e.timeStamp,
      source: e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse',
      target: e.target,
    });
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape' || e.key === 'Tab') return;
    const typing = e.target instanceof HTMLInputElement;
    if (!typing && (e.key === ' ' || e.key === 'Enter' || e.key === 'Backspace' || e.key.startsWith('Arrow'))) e.preventDefault();
    this.emit({ x: 0, y: 0, t: e.timeStamp, source: 'keyboard', key: e.key, target: null });
  };

  private emit(p: Press) {
    this.counts[p.source]++;
    for (const l of [...this.listeners]) l(p);
  }

  /** Phone keyboards report as keyboards, so a typing test can say what is true. */
  forceInput(source: InputClass) {
    this.forced = source;
  }

  /** The tab was hidden during this round, so it is not scored. */
  get wasHidden() {
    return this.hiddenSeen;
  }

  get signal() {
    return this.ctrl.signal;
  }

  /** The class this round is compared within: whichever input was used most. */
  get inputClass(): InputClass {
    if (this.forced) return this.forced;
    const c = this.counts;
    if (c.keyboard >= c.mouse && c.keyboard >= c.touch && c.keyboard > 0) return 'keyboard';
    return c.touch >= c.mouse && c.touch > 0 ? 'touch' : 'mouse';
  }

  get width() {
    return this.el.clientWidth;
  }
  get height() {
    return this.el.clientHeight;
  }

  html(markup: string) {
    this.el.innerHTML = markup;
  }

  status(text: string) {
    this.hudStatus.textContent = text;
  }

  /** Progress along the top edge, 0 to 1. Compositor only, so it costs no layout. */
  setBar(fraction: number) {
    this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
  }

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Resolves on the next press that passes the filter. */
  press(filter?: (p: Press) => boolean): Promise<Press> {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) return reject(new Aborted());
      const off = this.listen((p) => {
        if (filter && !filter(p)) return;
        cleanup();
        resolve(p);
      });
      const onAbort = () => {
        cleanup();
        reject(new Aborted());
      };
      const cleanup = () => {
        off();
        this.signal.removeEventListener('abort', onAbort);
      };
      this.signal.addEventListener('abort', onAbort);
    });
  }

  /** The next animation frame's timestamp. */
  frame(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) return reject(new Aborted());
      const id = requestAnimationFrame((ts) => {
        this.signal.removeEventListener('abort', onAbort);
        resolve(ts);
      });
      const onAbort = () => {
        cancelAnimationFrame(id);
        reject(new Aborted());
      };
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) return reject(new Aborted());
      const id = setTimeout(() => {
        this.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(id);
        reject(new Aborted());
      };
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Runs `tick` every frame until `ms` have passed or `stop()` is called.
   * Timed tests use this for their clock.
   */
  async clock(ms: number, tick?: (left: number, stop: () => void) => void, addTime?: { penalty: number }): Promise<void> {
    const start = performance.now();
    let running = true;
    const stop = () => {
      running = false;
    };
    while (running) {
      const now = await this.frame();
      const left = ms - (now - start) - (addTime?.penalty ?? 0);
      if (left <= 0) break;
      this.setBar(1 - left / ms);
      tick?.(left, stop);
    }
    this.setBar(1);
  }

  dispose() {
    this.ctrl.abort();
    this.listeners.clear();
  }
}
