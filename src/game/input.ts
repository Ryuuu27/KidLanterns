import { Vec2 } from './types';

export interface PlayerInputSample {
  move: Vec2;
  pulseBuffered: boolean;
  dashBuffered: boolean;
}

const BUFFER_WINDOW_SEC = 0.16;

/**
 * Separates continuous held directional state from edge-triggered actions,
 * maintains input buffers for responsive action timing, supports dual gamepads,
 * and clears held keys on window blur / visibility change.
 */
export class InputManager {
  private held: Set<string> = new Set();
  private justPressed: Set<string> = new Set();

  private solPulseBuffer = 0;
  private lunaPulseBuffer = 0;
  private solDashBuffer = 0;
  private lunaDashBuffer = 0;

  private prevGamepadButtons: boolean[][] = [[], []];
  public pointerWorld: Vec2 | null = null;
  public pointerActive = false;

  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;
  private onVisibilityBound: () => void;

  constructor() {
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onBlurBound = this.clearAll.bind(this);
    this.onVisibilityBound = () => {
      if (document.hidden) this.clearAll();
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('visibilitychange', this.onVisibilityBound);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('visibilitychange', this.onVisibilityBound);
  }

  public clearAll(): void {
    this.held.clear();
    this.justPressed.clear();
    this.solPulseBuffer = 0;
    this.lunaPulseBuffer = 0;
    this.solDashBuffer = 0;
    this.lunaDashBuffer = 0;
    this.pointerActive = false;
  }

  private isTypingInInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isTypingInInput(e.target)) return;

    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    if (!this.held.has(code)) {
      this.justPressed.add(code);

      // Buffer Sol (P1) actions
      if (code === 'Space') {
        this.solPulseBuffer = BUFFER_WINDOW_SEC;
      }
      if (code === 'ShiftLeft' || code === 'KeyQ' || code === 'KeyE') {
        this.solDashBuffer = BUFFER_WINDOW_SEC;
      }

      // Buffer Luna (P2) actions
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Slash') {
        this.lunaPulseBuffer = BUFFER_WINDOW_SEC;
      }
      if (code === 'ShiftRight' || code === 'Period' || code === 'Backslash') {
        this.lunaDashBuffer = BUFFER_WINDOW_SEC;
      }
    }
    this.held.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.held.delete(e.code);
  }

  public update(dt: number): void {
    this.solPulseBuffer = Math.max(0, this.solPulseBuffer - dt);
    this.lunaPulseBuffer = Math.max(0, this.lunaPulseBuffer - dt);
    this.solDashBuffer = Math.max(0, this.solDashBuffer - dt);
    this.lunaDashBuffer = Math.max(0, this.lunaDashBuffer - dt);

    this.pollGamepads();
  }

  public endFrame(): void {
    this.justPressed.clear();
  }

  public wasJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  public consumeSolPulse(): boolean {
    if (this.solPulseBuffer > 0) {
      this.solPulseBuffer = 0;
      return true;
    }
    return false;
  }

  public consumeLunaPulse(): boolean {
    if (this.lunaPulseBuffer > 0) {
      this.lunaPulseBuffer = 0;
      return true;
    }
    return false;
  }

  public consumeSolDash(): boolean {
    if (this.solDashBuffer > 0) {
      this.solDashBuffer = 0;
      return true;
    }
    return false;
  }

  public consumeLunaDash(): boolean {
    if (this.lunaDashBuffer > 0) {
      this.lunaDashBuffer = 0;
      return true;
    }
    return false;
  }

  private pollGamepads(): void {
    if (typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    for (let idx = 0; idx < 2; idx++) {
      const pad = pads[idx];
      if (!pad) continue;
      const prev = this.prevGamepadButtons[idx] || [];
      const curr = pad.buttons.map((b) => b.pressed);

      // Button 0 (A/Cross) or 2 (X/Square) -> Pulse
      const pulseNow = Boolean(curr[0] || curr[2]);
      const pulsePrev = Boolean(prev[0] || prev[2]);
      if (pulseNow && !pulsePrev) {
        if (idx === 0) this.solPulseBuffer = BUFFER_WINDOW_SEC;
        else this.lunaPulseBuffer = BUFFER_WINDOW_SEC;
      }

      // Button 1 (B/Circle) or 5 (RB/R1) -> Tug Dash
      const dashNow = Boolean(curr[1] || curr[5] || curr[4]);
      const dashPrev = Boolean(prev[1] || prev[5] || prev[4]);
      if (dashNow && !dashPrev) {
        if (idx === 0) this.solDashBuffer = BUFFER_WINDOW_SEC;
        else this.lunaDashBuffer = BUFFER_WINDOW_SEC;
      }

      // Button 9 (Start/Options) -> Pause edge trigger
      if (curr[9] && !prev[9]) {
        this.justPressed.add('Escape');
      }

      this.prevGamepadButtons[idx] = curr;
    }
  }

  private readGamepadStick(padIndex: number): Vec2 {
    if (typeof navigator.getGamepads !== 'function') return { x: 0, y: 0 };
    const pad = navigator.getGamepads()[padIndex];
    if (!pad) return { x: 0, y: 0 };
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const mag = Math.hypot(ax, ay);
    if (mag < 0.18) return { x: 0, y: 0 };
    const clamped = Math.min(1, mag);
    return { x: (ax / mag) * clamped, y: (ay / mag) * clamped };
  }

  public getSolMove(allowArrowFallback: boolean): Vec2 {
    let x = 0;
    let y = 0;
    if (this.held.has('KeyA') || (allowArrowFallback && this.held.has('ArrowLeft'))) x -= 1;
    if (this.held.has('KeyD') || (allowArrowFallback && this.held.has('ArrowRight'))) x += 1;
    if (this.held.has('KeyW') || (allowArrowFallback && this.held.has('ArrowUp'))) y -= 1;
    if (this.held.has('KeyS') || (allowArrowFallback && this.held.has('ArrowDown'))) y += 1;

    if (x === 0 && y === 0) {
      const stick = this.readGamepadStick(0);
      if (stick.x !== 0 || stick.y !== 0) return stick;
    }

    const len = Math.hypot(x, y);
    if (len > 0) {
      return { x: x / len, y: y / len };
    }
    return { x: 0, y: 0 };
  }

  public getLunaMove(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.held.has('ArrowLeft') || this.held.has('KeyJ')) x -= 1;
    if (this.held.has('ArrowRight') || this.held.has('KeyL')) x += 1;
    if (this.held.has('ArrowUp') || this.held.has('KeyI')) y -= 1;
    if (this.held.has('ArrowDown') || this.held.has('KeyK')) y += 1;

    if (x === 0 && y === 0) {
      const stick = this.readGamepadStick(1);
      if (stick.x !== 0 || stick.y !== 0) return stick;
    }

    const len = Math.hypot(x, y);
    if (len > 0) {
      return { x: x / len, y: y / len };
    }
    return { x: 0, y: 0 };
  }
}
