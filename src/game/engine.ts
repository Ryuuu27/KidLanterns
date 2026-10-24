import { InputManager } from './input';
import { SANCTUARIES } from './levels';
import { ParticlePool, ParticleShape } from './particles';
import { SoundEngine } from './sound';
import {
  CoupleNames,
  EnemyKind,
  EnemyPhase,
  GameState,
  HudSnapshot,
  LanternKind,
  PlayMode,
  RoundStats,
  SanctuaryDef,
  Vec2,
} from './types';

interface SpiritActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  scaleX: number;
  scaleY: number;
  facingAngle: number;
  dashTimer: number;
  dashCooldown: number;
  pulseCooldown: number;
  invulnTimer: number;
  hitFlashTimer: number;
}

interface TetherNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

interface TetherSpark {
  fromSol: boolean;
  progress: number; // 0..1 from sender to receiver
  active: boolean;
}

interface LiveLantern {
  id: string;
  x: number;
  y: number;
  kind: LanternKind;
  sealed: boolean;
  lit: boolean;
  charge: number; // 0..1
  scaleX: number;
  scaleY: number;
  glowPhase: number;
}

interface LiveSealPair {
  id: string;
  sunX: number;
  sunY: number;
  moonX: number;
  moonY: number;
  unlocksLanternId: string;
  progress: number; // 0..1
  unlocked: boolean;
  sunOccupied: boolean;
  moonOccupied: boolean;
}

interface LivePillar {
  id: string;
  x: number;
  y: number;
  radius: number;
  energy: number; // 0..1 when tether wraps/brushes it
  pulseCooldown: number;
}

interface LiveStarBud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  active: boolean;
}

interface GroundTelegraph {
  x: number;
  y: number;
  radius: number;
  timer: number;
  duration: number;
  lingeringMireTimer: number; // >0 once erupted
  active: boolean;
}

interface LiveEnemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  phase: EnemyPhase;
  phaseTimer: number;
  phaseDuration: number;
  aimX: number;
  aimY: number;
  scaleX: number;
  scaleY: number;
  hitFlashTimer: number;
  sliceImmunityTimer: number;
  orbitAngle: number;
  attackCycle: number;
}

interface PendingWave {
  triggerTime: number;
  kind: EnemyKind;
  count: number;
  spawned: boolean;
}

interface AmbientFirefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  warm: boolean;
}

const TETHER_NODES = 15;
const TETHER_COMFORT_LEN = 225;
const TETHER_MAX_LEN = 365;
const PLAYER_SPEED = 278;
const DASH_SPEED = 640;

export class KindredEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;
  public readonly sound: SoundEngine;
  private particles: ParticlePool;
  private onHudChange: (hud: HudSnapshot) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private viewWidth = 1280;
  private viewHeight = 720;
  private dpr = 1;
  private reducedMotion = false;

  // Game State
  private gameState: GameState = GameState.TitleMenu;
  private playMode: PlayMode = PlayMode.Coop2P;
  private names: CoupleNames = { sol: 'Sol', luna: 'Luna' };

  private sanctuaryIdx = 0; // 0-based into SANCTUARIES
  private currentDef: SanctuaryDef = SANCTUARIES[0];
  private levelTime = 0;
  private globalTime = 0;
  private clearDelayTimer = 0;

  // Shared Couple Resources
  private hearts = 5;
  private maxHearts = 5;
  private harmonyPips = 0;
  private score = 0;
  private roundStartScore = 0;
  private syncStreak = 0;
  private comboTimer = 0;

  // Round Telemetry for Couple Summary
  private tetherSlices = 0;
  private resonanceNovas = 0;
  private partnerSaves = 0;
  private embraceSeconds = 0;

  // Hitstop & Camera
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private camX = 620;
  private camY = 390;

  // Actors & Tether
  private sol: SpiritActor;
  private luna: SpiritActor;
  private tether: TetherNode[] = [];
  private tetherDist = 200;
  private tetherTension = 0; // 0..1
  private sparks: TetherSpark[] = [
    { fromSol: true, progress: 0, active: false },
    { fromSol: false, progress: 0, active: false },
  ];
  private syncGraceSolTimer = 0; // Coyote sync window after spark arrives
  private syncGraceLunaTimer = 0;
  private aiPulseEchoTimer = 0;

  // World Entities
  private lanterns: LiveLantern[] = [];
  private sealPairs: LiveSealPair[] = [];
  private pillars: LivePillar[] = [];
  private enemies: LiveEnemy[] = [];
  private pendingWaves: PendingWave[] = [];
  private groundHazards: GroundTelegraph[] = [];
  private starBuds: LiveStarBud[] = [];
  private fireflies: AmbientFirefly[] = [];
  private nextEnemyId = 1;
  private starBudSpawnTimer = 4.5;
  private embraceParticleTimer = 0;

  private lastHudKey = '';
  private latestRoundStats: RoundStats | null = null;

  private onPointerMoveBound: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement, onHudChange: (hud: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.onHudChange = onHudChange;
    this.input = new InputManager();
    this.sound = new SoundEngine();
    this.particles = new ParticlePool();

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.sol = this.createActor(520, 420);
    this.luna = this.createActor(720, 420);
    this.initTether();
    this.loadSanctuary(0, true);

    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    window.addEventListener('pointermove', this.onPointerMoveBound, { passive: true });
  }

  private createActor(x: number, y: number): SpiritActor {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 17,
      scaleX: 1,
      scaleY: 1,
      facingAngle: 0,
      dashTimer: 0,
      dashCooldown: 0,
      pulseCooldown: 0,
      invulnTimer: 0,
      hitFlashTimer: 0,
    };
  }

  private initTether(): void {
    this.tether = [];
    for (let i = 0; i < TETHER_NODES; i++) {
      const t = i / (TETHER_NODES - 1);
      const x = this.sol.x + (this.luna.x - this.sol.x) * t;
      const y = this.sol.y + (this.luna.y - this.sol.y) * t;
      this.tether.push({ x, y, oldX: x, oldY: y });
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldX = sx - this.viewWidth * 0.5 + this.camX;
    const worldY = sy - this.viewHeight * 0.5 + this.camY;

    const prev = this.input.pointerWorld;
    this.input.pointerWorld = { x: worldX, y: worldY };
    this.input.pointerActive = true;

    if (this.gameState === GameState.TitleMenu && prev) {
      const moved = Math.hypot(worldX - prev.x, worldY - prev.y);
      if (moved > 18 && Math.random() < 0.35) {
        this.particles.spawnRing(worldX, worldY, 3, 34, 0.75, '#FDE68A', 1.3);
      }
    }
  }

  public resize(width: number, height: number, dpr: number): void {
    this.viewWidth = Math.max(320, width);
    this.viewHeight = Math.max(240, height);
    this.dpr = Math.min(2, Math.max(1, dpr));
    this.canvas.width = Math.floor(this.viewWidth * this.dpr);
    this.canvas.height = Math.floor(this.viewHeight * this.dpr);
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      this.step(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    this.emitHud(true);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    this.input.destroy();
  }

  // Public UI Controls
  public setPlayMode(mode: PlayMode): void {
    this.playMode = mode;
    this.emitHud(true);
  }

  public setCoupleNames(names: CoupleNames): void {
    this.names = {
      sol: names.sol.trim() || 'Sol',
      luna: names.luna.trim() || 'Luna',
    };
  }

  public toggleMute(): boolean {
    const muted = this.sound.toggleMute();
    this.emitHud(true);
    return muted;
  }

  public startNewGame(): void {
    this.sound.unlock();
    this.hearts = this.maxHearts;
    this.harmonyPips = 0;
    this.score = 0;
    this.syncStreak = 0;
    this.latestRoundStats = null;
    this.loadSanctuary(0, false);
    this.gameState = GameState.Playing;
    this.input.clearAll();
    this.sound.playLanternLit(2, 4);
    this.emitHud(true);
  }

  public restartCurrentSanctuary(): void {
    this.sound.unlock();
    this.hearts = this.maxHearts;
    this.harmonyPips = 0;
    this.score = this.roundStartScore;
    this.syncStreak = 0;
    this.latestRoundStats = null;
    this.loadSanctuary(this.sanctuaryIdx, false);
    this.gameState = GameState.Playing;
    this.input.clearAll();
    this.emitHud(true);
  }

  public advanceNextSanctuary(): void {
    this.sound.unlock();
    if (this.sanctuaryIdx + 1 < SANCTUARIES.length) {
      // Restore 1 heart between sanctuaries as a warm blessing
      this.hearts = Math.min(this.maxHearts, this.hearts + 1);
      this.latestRoundStats = null;
      this.loadSanctuary(this.sanctuaryIdx + 1, false);
      this.gameState = GameState.Playing;
      this.input.clearAll();
      this.emitHud(true);
    } else {
      this.gameState = GameState.Victory;
      this.emitHud(true);
    }
  }

  public togglePause(): void {
    if (this.gameState === GameState.Playing) {
      this.gameState = GameState.Paused;
      this.input.clearAll();
      this.emitHud(true);
    } else if (this.gameState === GameState.Paused) {
      this.gameState = GameState.Playing;
      this.input.clearAll();
      this.emitHud(true);
    }
  }

  public returnToTitle(): void {
    this.latestRoundStats = null;
    this.loadSanctuary(0, true);
    this.gameState = GameState.TitleMenu;
    this.input.clearAll();
    this.emitHud(true);
  }

  private loadSanctuary(idx: number, isTitleShowcase: boolean): void {
    this.sanctuaryIdx = idx;
    const def = SANCTUARIES[idx];
    this.currentDef = def;
    this.levelTime = 0;
    this.clearDelayTimer = 0;
    this.roundStartScore = this.score;

    this.tetherSlices = 0;
    this.resonanceNovas = 0;
    this.partnerSaves = 0;
    this.embraceSeconds = 0;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;

    this.sol = this.createActor(def.solStart.x, def.solStart.y);
    this.luna = this.createActor(def.lunaStart.x, def.lunaStart.y);
    this.initTether();

    this.camX = (this.sol.x + this.luna.x) * 0.5;
    this.camY = (this.sol.y + this.luna.y) * 0.5;

    this.sparks[0].active = false;
    this.sparks[1].active = false;
    this.syncGraceSolTimer = 0;
    this.syncGraceLunaTimer = 0;

    this.lanterns = def.lanterns.map((l, i) => ({
      id: l.id,
      x: l.x,
      y: l.y,
      kind: l.kind,
      sealed: l.kind === LanternKind.SealedHeart,
      lit: isTitleShowcase && i < 2,
      charge: isTitleShowcase && i < 2 ? 1 : 0,
      scaleX: 1,
      scaleY: 1,
      glowPhase: i * 1.3,
    }));

    this.sealPairs = def.sealPairs.map((s) => ({
      ...s,
      progress: 0,
      unlocked: false,
      sunOccupied: false,
      moonOccupied: false,
    }));

    this.pillars = def.pillars.map((p) => ({
      ...p,
      energy: 0,
      pulseCooldown: 0,
    }));

    this.enemies = [];
    this.groundHazards = [];
    this.starBuds = [];
    this.particles.clear();

    this.pendingWaves = isTitleShowcase
      ? []
      : def.waves.map((w) => ({
          triggerTime: w.delay,
          kind: w.kind,
          count: w.count,
          spawned: false,
        }));

    this.fireflies = [];
    for (let i = 0; i < 34; i++) {
      this.fireflies.push({
        x: 80 + Math.random() * (def.worldWidth - 160),
        y: 80 + Math.random() * (def.worldHeight - 160),
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        phase: Math.random() * Math.PI * 2,
        size: 1.5 + Math.random() * 2.2,
        warm: i % 2 === 0,
      });
    }

    if (isTitleShowcase) {
      // Spawn a couple gentle drifting Star-Buds on Title Screen
      for (let i = 0; i < 3; i++) {
        this.spawnStarBud();
      }
    }
  }

  private step(dt: number): void {
    this.globalTime += dt;
    this.input.update(dt);

    // Global keyboard shortcuts
    if (this.input.wasJustPressed('KeyM')) {
      this.toggleMute();
    }

    if (this.gameState === GameState.TitleMenu) {
      this.stepTitleShowcase(dt);
      this.input.endFrame();
      return;
    }

    if (this.input.wasJustPressed('Escape') || this.input.wasJustPressed('KeyP')) {
      if (this.gameState === GameState.Playing || this.gameState === GameState.Paused) {
        this.togglePause();
        this.input.endFrame();
        return;
      }
    }

    if (this.gameState === GameState.RoundSummary) {
      if (this.input.wasJustPressed('Enter') || this.input.wasJustPressed('Space')) {
        this.advanceNextSanctuary();
      }
      this.particles.update(dt * 0.6);
      this.updateFireflies(dt);
      this.input.endFrame();
      return;
    }

    if (this.gameState === GameState.Victory) {
      if (this.input.wasJustPressed('Enter') || this.input.wasJustPressed('Space')) {
        this.startNewGame();
      }
      this.particles.update(dt * 0.5);
      this.updateFireflies(dt);
      this.input.endFrame();
      return;
    }

    if (this.gameState === GameState.GameOver) {
      if (this.input.wasJustPressed('Enter') || this.input.wasJustPressed('Space')) {
        this.restartCurrentSanctuary();
      }
      this.particles.update(dt * 0.5);
      this.updateFireflies(dt);
      this.input.endFrame();
      return;
    }

    if (this.gameState === GameState.Paused) {
      this.input.endFrame();
      return;
    }

    // Active Playing simulation
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= Math.exp(-13 * dt);
      if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
    }

    // Brief hitstop freezes physics for weighty crunch while preserving shake
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.input.endFrame();
      return;
    }

    this.levelTime += dt;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.syncStreak = 0;
      }
    }

    this.updatePlayers(dt);
    this.updateTether(dt);
    this.updatePulsesAndSync(dt);
    this.updateSealsAndLanterns(dt);
    this.updateStarBuds(dt);
    this.updateWavesAndEnemies(dt);
    this.updateGroundHazards(dt);
    this.particles.update(dt);
    this.updateFireflies(dt);
    this.updateCamera(dt);
    this.checkSanctuaryClear(dt);

    this.emitHud(false);
    this.input.endFrame();
  }

  private stepTitleShowcase(dt: number): void {
    // Serene live-world figure-eight dance around the center shrine
    const cx = this.currentDef.worldWidth * 0.5;
    const cy = this.currentDef.worldHeight * 0.5;
    const t = this.globalTime * 0.68;

    const targetSolX = cx + Math.cos(t) * 165;
    const targetSolY = cy + Math.sin(t * 2) * 82;
    const targetLunaX = cx - Math.cos(t) * 165;
    const targetLunaY = cy - Math.sin(t * 2) * 82;

    this.sol.x += (targetSolX - this.sol.x) * Math.min(1, dt * 4);
    this.sol.y += (targetSolY - this.sol.y) * Math.min(1, dt * 4);
    this.luna.x += (targetLunaX - this.luna.x) * Math.min(1, dt * 4);
    this.luna.y += (targetLunaY - this.luna.y) * Math.min(1, dt * 4);

    this.updateTether(dt);
    this.updateFireflies(dt);
    this.particles.update(dt);

    // Periodic gentle spark exchange on Title Screen (silent visual beauty)
    if (!this.sparks[0].active && Math.sin(this.globalTime * 1.4) > 0.96) {
      this.sparks[0] = { fromSol: true, progress: 0, active: true };
    }
    for (const sp of this.sparks) {
      if (!sp.active) continue;
      sp.progress += dt * 1.3;
      if (sp.progress >= 1) {
        sp.active = false;
        this.particles.spawnRing(this.luna.x, this.luna.y, 6, 48, 0.55, '#FECDD3', 2);
      }
    }

    // Gentle live camera pan
    const panX = cx + Math.sin(this.globalTime * 0.28) * 65;
    const panY = cy + Math.cos(this.globalTime * 0.22) * 36 - 18;
    this.camX += (panX - this.camX) * Math.min(1, dt * 2.5);
    this.camY += (panY - this.camY) * Math.min(1, dt * 2.5);
  }

  private updatePlayers(dt: number): void {
    const solMove = this.input.getSolMove(this.playMode === PlayMode.SoloCompanion);
    let lunaMove =
      this.playMode === PlayMode.SoloCompanion
        ? this.computeCompanionMove(dt)
        : this.input.getLunaMove();

    // If in SoloCompanion mode, still let a second player join seamlessly if they press Arrow keys!
    if (this.playMode === PlayMode.SoloCompanion) {
      const manualP2 = this.input.getLunaMove();
      // Only override if IJKL or Gamepad 2 is used, since Arrows mirror Sol in solo mode
      if (
        this.input.wasJustPressed('KeyJ') ||
        this.input.wasJustPressed('KeyL') ||
        this.input.wasJustPressed('KeyI') ||
        this.input.wasJustPressed('KeyK')
      ) {
        lunaMove = manualP2;
      }
    }

    this.stepSingleActor(this.sol, solMove, true, dt);
    this.stepSingleActor(this.luna, lunaMove, false, dt);

    // Tug-Dash actions
    if (this.input.consumeSolDash() && this.sol.dashCooldown <= 0) {
      this.triggerTugDash(this.sol, this.luna, solMove, true);
    }
    if (this.input.consumeLunaDash() && this.luna.dashCooldown <= 0) {
      this.triggerTugDash(this.luna, this.sol, lunaMove, false);
    }

    // Elastic max-length tether constraint (keeps couple connected and allows slingshot saves)
    const dx = this.luna.x - this.sol.x;
    const dy = this.luna.y - this.sol.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    this.tetherDist = dist;
    this.tetherTension = Math.max(
      0,
      Math.min(1, (dist - (TETHER_COMFORT_LEN - 45)) / (TETHER_MAX_LEN - TETHER_COMFORT_LEN))
    );

    if (dist > TETHER_MAX_LEN) {
      const excess = dist - TETHER_MAX_LEN;
      const nx = dx / dist;
      const ny = dy / dist;
      const pull = excess * 10.5 * dt;
      this.sol.vx += nx * pull * 16;
      this.sol.vy += ny * pull * 16;
      this.luna.vx -= nx * pull * 16;
      this.luna.vy -= ny * pull * 16;
      this.sol.x += nx * excess * 0.48;
      this.sol.y += ny * excess * 0.48;
      this.luna.x -= nx * excess * 0.48;
      this.luna.y -= ny * excess * 0.48;
    }

    // Cozy Embrace when standing close together
    if (dist < 88) {
      this.embraceSeconds += dt;
      this.embraceParticleTimer -= dt;
      if (this.embraceParticleTimer <= 0) {
        this.embraceParticleTimer = 0.34;
        const mx = (this.sol.x + this.luna.x) * 0.5 + (Math.random() - 0.5) * 20;
        const my = (this.sol.y + this.luna.y) * 0.5 - 10;
        this.particles.spawnParticle(
          mx,
          my,
          (Math.random() - 0.5) * 18,
          -34 - Math.random() * 18,
          1.1,
          5.2,
          1.2,
          Math.random() < 0.5 ? '#FDE68A' : '#FECDD3',
          ParticleShape.HeartMote,
          0.97,
          -8
        );
      }
    }
  }

  private stepSingleActor(actor: SpiritActor, move: Vec2, isSol: boolean, dt: number): void {
    actor.dashTimer = Math.max(0, actor.dashTimer - dt);
    actor.dashCooldown = Math.max(0, actor.dashCooldown - dt);
    actor.pulseCooldown = Math.max(0, actor.pulseCooldown - dt);
    actor.invulnTimer = Math.max(0, actor.invulnTimer - dt);
    actor.hitFlashTimer = Math.max(0, actor.hitFlashTimer - dt);

    // Spring squash & stretch recovery
    actor.scaleX += (1 - actor.scaleX) * Math.min(1, dt * 14);
    actor.scaleY += (1 - actor.scaleY) * Math.min(1, dt * 14);

    // Check if slowed by Gloom Mire puddle
    let speedMult = 1;
    for (const h of this.groundHazards) {
      if (h.active && h.lingeringMireTimer > 0) {
        if (Math.hypot(actor.x - h.x, actor.y - h.y) < h.radius) {
          speedMult = 0.58;
          break;
        }
      }
    }

    if (actor.dashTimer <= 0) {
      const targetVx = move.x * PLAYER_SPEED * speedMult;
      const targetVy = move.y * PLAYER_SPEED * speedMult;
      const accel = Math.min(1, dt * 15);
      actor.vx += (targetVx - actor.vx) * accel;
      actor.vy += (targetVy - actor.vy) * accel;
    } else {
      actor.vx *= Math.pow(0.25, dt * 4);
      actor.vy *= Math.pow(0.25, dt * 4);
    }

    if (Math.hypot(move.x, move.y) > 0.1) {
      actor.facingAngle = Math.atan2(move.y, move.x);
    }

    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;

    // Collide smoothly with Crystal Prism Pillars
    for (const p of this.pillars) {
      const dx = actor.x - p.x;
      const dy = actor.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const minDist = actor.radius + p.radius;
      if (d < minDist) {
        const nx = dx / d;
        const ny = dy / d;
        actor.x = p.x + nx * minDist;
        actor.y = p.y + ny * minDist;
      }
    }

    // Keep inside sanctuary stone courtyard bounds
    const pad = 74;
    actor.x = Math.max(pad, Math.min(this.currentDef.worldWidth - pad, actor.x));
    actor.y = Math.max(pad, Math.min(this.currentDef.worldHeight - pad, actor.y));

    // Subtle trail motes while dashing
    if (actor.dashTimer > 0 && Math.random() < 0.7) {
      this.particles.spawnParticle(
        actor.x,
        actor.y,
        -actor.vx * 0.15,
        -actor.vy * 0.15,
        0.32,
        4.5,
        0.5,
        isSol ? '#FDE68A' : '#FECDD3',
        ParticleShape.GlowDot
      );
    }
  }

  private triggerTugDash(
    actor: SpiritActor,
    partner: SpiritActor,
    move: Vec2,
    isSol: boolean
  ): void {
    let dirX = move.x;
    let dirY = move.y;
    if (dirX === 0 && dirY === 0) {
      dirX = Math.cos(actor.facingAngle);
      dirY = Math.sin(actor.facingAngle);
    }
    actor.vx = dirX * DASH_SPEED;
    actor.vy = dirY * DASH_SPEED;
    actor.dashTimer = 0.17;
    actor.dashCooldown = 0.65;
    actor.invulnTimer = Math.max(actor.invulnTimer, 0.22);
    actor.scaleX = 1.36;
    actor.scaleY = 0.68;

    // Check if tugging partner away from an imminent windup hazard ("Partner Save"!)
    let savedPartner = false;
    if (this.tetherDist > 210) {
      const pullX = actor.x - partner.x;
      const pullY = actor.y - partner.y;
      const pLen = Math.hypot(pullX, pullY) || 1;
      // Check if partner was threatened
      for (const e of this.enemies) {
        if (
          (e.phase === EnemyPhase.Windup || e.phase === EnemyPhase.Lunging) &&
          Math.hypot(e.x - partner.x, e.y - partner.y) < 165
        ) {
          savedPartner = true;
          break;
        }
      }
      if (!savedPartner) {
        for (const h of this.groundHazards) {
          if (h.active && h.lingeringMireTimer <= 0 && Math.hypot(h.x - partner.x, h.y - partner.y) < h.radius + 20) {
            savedPartner = true;
            break;
          }
        }
      }

      partner.vx += (pullX / pLen) * 320;
      partner.vy += (pullY / pLen) * 320;
      partner.scaleX = 1.24;
      partner.scaleY = 0.78;
      if (savedPartner) {
        partner.invulnTimer = Math.max(partner.invulnTimer, 0.35);
        this.partnerSaves += 1;
        this.score += 120;
        this.particles.spawnRing(partner.x, partner.y, 10, 56, 0.42, '#34D399', 3);
      }
    }

    this.sound.playTugDash(savedPartner);
    this.particles.spawnBurst(
      actor.x,
      actor.y,
      8,
      40,
      140,
      0.32,
      3.5,
      isSol ? '#F59E0B' : '#FB7185',
      ParticleShape.DiamondSpark
    );
  }

  private computeCompanionMove(dt: number): Vec2 {
    // Intelligent, affectionate AI partner for Solo + Companion mode
    let targetX = this.sol.x + 195;
    let targetY = this.sol.y;

    // 1. If there is an unlocked seal pair and Sol is near the Sun Seal, head to the Moon Seal!
    let sealAssigned = false;
    for (const s of this.sealPairs) {
      if (!s.unlocked) {
        const solToSun = Math.hypot(this.sol.x - s.sunX, this.sol.y - s.sunY);
        if (solToSun < 220) {
          targetX = s.moonX;
          targetY = s.moonY;
          sealAssigned = true;
          break;
        }
      }
    }

    // 2. Otherwise, position across the nearest enemy or unlit lantern from Sol so the tether sweeps through it!
    if (!sealAssigned) {
      let focusPoint: Vec2 | null = null;
      let bestDist = Infinity;

      for (const e of this.enemies) {
        const d = Math.hypot(e.x - this.sol.x, e.y - this.sol.y);
        if (d < bestDist && d < 460) {
          bestDist = d;
          focusPoint = { x: e.x, y: e.y };
        }
      }

      if (!focusPoint) {
        for (const l of this.lanterns) {
          if (!l.lit && !l.sealed) {
            const d = Math.hypot(l.x - this.luna.x, l.y - this.luna.y);
            if (d < bestDist) {
              bestDist = d;
              if (l.kind === LanternKind.Moon) {
                targetX = l.x;
                targetY = l.y;
                sealAssigned = true;
              } else {
                focusPoint = { x: l.x, y: l.y };
              }
            }
          }
        }
      }

      if (focusPoint && !sealAssigned) {
        // Place Luna on the opposite side of focusPoint from Sol to stretch the tether across it!
        const vx = focusPoint.x - this.sol.x;
        const vy = focusPoint.y - this.sol.y;
        const len = Math.hypot(vx, vy) || 1;
        const span = Math.min(285, Math.max(195, len * 1.85));
        targetX = this.sol.x + (vx / len) * span + Math.sin(this.globalTime * 2.2) * 38;
        targetY = this.sol.y + (vy / len) * span + Math.cos(this.globalTime * 2.2) * 38;
      }
    }

    // 3. Dodge imminent ground mortar circles!
    for (const h of this.groundHazards) {
      if (h.active) {
        const dx = this.luna.x - h.x;
        const dy = this.luna.y - h.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < h.radius + 36) {
          targetX = this.luna.x + (dx / d) * 140;
          targetY = this.luna.y + (dy / d) * 140;
        }
      }
    }

    // Companion pulse echo timer
    if (this.aiPulseEchoTimer > 0) {
      this.aiPulseEchoTimer -= dt;
      if (this.aiPulseEchoTimer <= 0 && this.luna.pulseCooldown <= 0) {
        this.firePulse(false);
      }
    }

    const dx = targetX - this.luna.x;
    const dy = targetY - this.luna.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) return { x: 0, y: 0 };
    const strength = Math.min(1, dist / 45);
    return { x: (dx / dist) * strength, y: (dy / dist) * strength };
  }

  private updateTether(dt: number): void {
    if (this.tether.length !== TETHER_NODES) this.initTether();

    // Pin endpoints to Sol and Luna
    this.tether[0].x = this.sol.x;
    this.tether[0].y = this.sol.y;
    this.tether[TETHER_NODES - 1].x = this.luna.x;
    this.tether[TETHER_NODES - 1].y = this.luna.y;

    // Verlet integration with subtle silk drape when slack
    const sag = (1 - this.tetherTension) * 28;
    for (let i = 1; i < TETHER_NODES - 1; i++) {
      const n = this.tether[i];
      const vx = (n.x - n.oldX) * 0.86;
      const vy = (n.y - n.oldY) * 0.86;
      n.oldX = n.x;
      n.oldY = n.y;
      n.x += vx;
      n.y += vy + sag * dt * 14;
    }

    // Constraint relaxation + Pillar wrapping
    const segLen = Math.max(8, this.tetherDist / (TETHER_NODES - 1));
    for (let iter = 0; iter < 5; iter++) {
      this.tether[0].x = this.sol.x;
      this.tether[0].y = this.sol.y;
      this.tether[TETHER_NODES - 1].x = this.luna.x;
      this.tether[TETHER_NODES - 1].y = this.luna.y;

      for (let i = 0; i < TETHER_NODES - 1; i++) {
        const a = this.tether[i];
        const b = this.tether[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - segLen) / d;
        if (i > 0) {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
        }
        if (i + 1 < TETHER_NODES - 1) {
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }

      // Wrap tether nodes around Crystal Prism Pillars
      for (const p of this.pillars) {
        const minR = p.radius + 5;
        for (let i = 1; i < TETHER_NODES - 1; i++) {
          const n = this.tether[i];
          const dx = n.x - p.x;
          const dy = n.y - p.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d < minR) {
            n.x = p.x + (dx / d) * minR;
            n.y = p.y + (dy / d) * minR;
            if (this.gameState === GameState.Playing) {
              p.energy = Math.min(1, p.energy + dt * 1.8);
            }
          }
        }
      }
    }

    // Decay or discharge energized Prism Pillars
    for (const p of this.pillars) {
      p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);
      if (p.energy >= 0.98 && p.pulseCooldown <= 0) {
        p.pulseCooldown = 2.4;
        p.energy = 0.35;
        this.particles.spawnRing(p.x, p.y, p.radius, 155, 0.5, '#6EE7B7', 3);
        this.sound.playStarBudBloom();
        for (const e of this.enemies) {
          if (Math.hypot(e.x - p.x, e.y - p.y) < 155 + e.radius) {
            this.damageEnemy(e, 2, p.x, p.y);
          }
        }
      } else {
        p.energy = Math.max(0, p.energy - dt * 0.35);
      }
    }
  }

  private firePulse(fromSol: boolean): void {
    const actor = fromSol ? this.sol : this.luna;
    actor.pulseCooldown = 0.42;
    actor.scaleX = 0.8;
    actor.scaleY = 1.26;
    this.sound.playPulse(fromSol);

    this.particles.spawnRing(
      actor.x,
      actor.y,
      actor.radius,
      78,
      0.36,
      fromSol ? '#FDE68A' : '#FECDD3',
      2.5
    );

    // Check if partner's spark just arrived (Sync Grace Coyote Window!)
    if (fromSol && this.syncGraceSolTimer > 0) {
      this.syncGraceSolTimer = 0;
      this.triggerResonanceNova();
      return;
    }
    if (!fromSol && this.syncGraceLunaTimer > 0) {
      this.syncGraceLunaTimer = 0;
      this.triggerResonanceNova();
      return;
    }

    const idx = fromSol ? 0 : 1;
    this.sparks[idx] = { fromSol, progress: 0, active: true };

    // In SoloCompanion mode, let Luna echo pulses periodically for joyful syncs!
    if (fromSol && this.playMode === PlayMode.SoloCompanion && this.luna.pulseCooldown <= 0) {
      this.aiPulseEchoTimer = 0.16;
    }
  }

  private updatePulsesAndSync(dt: number): void {
    this.syncGraceSolTimer = Math.max(0, this.syncGraceSolTimer - dt);
    this.syncGraceLunaTimer = Math.max(0, this.syncGraceLunaTimer - dt);

    if (this.input.consumeSolPulse() && this.sol.pulseCooldown <= 0) {
      this.firePulse(true);
    }
    if (this.input.consumeLunaPulse() && this.luna.pulseCooldown <= 0) {
      this.firePulse(false);
    }

    // Advance sparks along tether
    for (const sp of this.sparks) {
      if (!sp.active) continue;
      sp.progress += dt * 2.35;

      const pos = this.sampleTetherPoint(sp.fromSol ? sp.progress : 1 - sp.progress);
      if (Math.random() < 0.75) {
        this.particles.spawnParticle(
          pos.x,
          pos.y,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          0.26,
          4,
          0.5,
          sp.fromSol ? '#FDE68A' : '#FECDD3',
          ParticleShape.DiamondSpark
        );
      }

      if (sp.progress >= 1) {
        sp.active = false;
        // Grant Sync Coyote Grace Window to the receiving partner!
        if (sp.fromSol) {
          this.syncGraceLunaTimer = 0.34;
        } else {
          this.syncGraceSolTimer = 0.34;
        }
      }
    }

    // If BOTH Sol and Luna sparks meet on the tether simultaneously -> Resonance Nova!
    if (this.sparks[0].active && this.sparks[1].active) {
      const pSol = this.sparks[0].progress;
      const pLuna = 1 - this.sparks[1].progress;
      if (Math.abs(pSol - pLuna) < 0.28) {
        this.sparks[0].active = false;
        this.sparks[1].active = false;
        this.triggerResonanceNova();
      }
    }
  }

  private triggerResonanceNova(): void {
    const mid = this.sampleTetherPoint(0.5);
    this.resonanceNovas += 1;
    this.syncStreak += 1;
    this.comboTimer = 5.5;
    this.score += 200 * Math.min(4, this.syncStreak);

    this.sol.scaleX = 0.76;
    this.sol.scaleY = 1.3;
    this.luna.scaleX = 0.76;
    this.luna.scaleY = 1.3;

    this.addHitstop(0.068);
    this.addShake(9.5);
    this.sound.playResonanceNova(this.syncStreak);

    // Dual expanding shockwaves + particle burst
    this.particles.spawnRing(mid.x, mid.y, 12, 205, 0.56, '#FDE68A', 4.2);
    this.particles.spawnRing(mid.x, mid.y, 6, 155, 0.46, '#FECDD3', 2.8);
    this.particles.spawnBurst(mid.x, mid.y, 28, 70, 280, 0.58, 5.5, '#FFFBEB', ParticleShape.DiamondSpark);

    // Grant +1 Harmony Pip (every 3 restores 1 Shared Heart!)
    this.grantHarmonyPip();

    // Clear shadow puddles within Nova radius
    const novaRadius = 205;
    for (const h of this.groundHazards) {
      if (h.active && Math.hypot(h.x - mid.x, h.y - mid.y) < novaRadius + h.radius * 0.5) {
        h.active = false;
      }
    }

    // Ignite unsealed lanterns inside Nova radius
    for (const l of this.lanterns) {
      if (!l.lit && !l.sealed && Math.hypot(l.x - mid.x, l.y - mid.y) < novaRadius) {
        this.igniteLantern(l);
      }
    }

    // Heavy radiant damage to enemies inside Nova radius
    for (const e of this.enemies) {
      if (Math.hypot(e.x - mid.x, e.y - mid.y) < novaRadius + e.radius) {
        this.damageEnemy(e, 3, mid.x, mid.y);
      }
    }
  }

  private grantHarmonyPip(): void {
    this.harmonyPips += 1;
    if (this.harmonyPips >= 3) {
      this.harmonyPips = 0;
      if (this.hearts < this.maxHearts) {
        this.hearts += 1;
        this.sound.playHeartRestored();
        const mid = this.sampleTetherPoint(0.5);
        this.particles.spawnBurst(mid.x, mid.y, 14, 30, 110, 0.75, 6, '#FB7185', ParticleShape.HeartMote);
      } else {
        this.score += 150;
      }
    }
  }

  private sampleTetherPoint(t: number): Vec2 {
    const clamped = Math.max(0, Math.min(1, t));
    const exact = clamped * (TETHER_NODES - 1);
    const idx = Math.min(TETHER_NODES - 2, Math.floor(exact));
    const frac = exact - idx;
    const a = this.tether[idx];
    const b = this.tether[idx + 1];
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
    };
  }

  private distanceToTether(px: number, py: number): { dist: number; closest: Vec2 } {
    let best = Infinity;
    let bestPt = { x: this.tether[0].x, y: this.tether[0].y };
    for (let i = 0; i < TETHER_NODES - 1; i++) {
      const a = this.tether[i];
      const b = this.tether[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby || 0.0001;
      const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / lenSq));
      const cx = a.x + abx * t;
      const cy = a.y + aby * t;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best) {
        best = d;
        bestPt = { x: cx, y: cy };
      }
    }
    return { dist: best, closest: bestPt };
  }

  private updateSealsAndLanterns(dt: number): void {
    // 1. Update Twin Sun & Moon Pressure Seals (with forgiving 0.35s decay coyote window)
    for (const s of this.sealPairs) {
      if (s.unlocked) continue;
      s.sunOccupied = Math.hypot(this.sol.x - s.sunX, this.sol.y - s.sunY) < 44;
      s.moonOccupied = Math.hypot(this.luna.x - s.moonX, this.luna.y - s.moonY) < 44;

      if (s.sunOccupied && s.moonOccupied) {
        s.progress = Math.min(1, s.progress + dt * 0.92);
        if (s.progress >= 1) {
          s.unlocked = true;
          this.sound.playSealUnlocked();
          this.score += 250;
          this.particles.spawnRing(s.sunX, s.sunY, 12, 85, 0.5, '#FDE68A', 3);
          this.particles.spawnRing(s.moonX, s.moonY, 12, 85, 0.5, '#FECDD3', 3);

          const target = this.lanterns.find((l) => l.id === s.unlocksLanternId);
          if (target) {
            target.sealed = false;
            target.scaleX = 1.3;
            target.scaleY = 0.75;
            this.particles.spawnRing(target.x, target.y, 10, 110, 0.6, '#34D399', 3.2);
          }
        }
      } else {
        s.progress = Math.max(0, s.progress - dt * 0.42);
      }
    }

    // 2. Update Spirit Lanterns
    const tetherActive =
      this.tetherTension > 0.32 || this.sparks[0].active || this.sparks[1].active;

    for (const l of this.lanterns) {
      l.glowPhase += dt * 2.4;
      l.scaleX += (1 - l.scaleX) * Math.min(1, dt * 12);
      l.scaleY += (1 - l.scaleY) * Math.min(1, dt * 12);

      if (l.lit || l.sealed) continue;

      const solDist = Math.hypot(this.sol.x - l.x, this.sol.y - l.y);
      const lunaDist = Math.hypot(this.luna.x - l.x, this.luna.y - l.y);
      const tetherHit = tetherActive && this.distanceToTether(l.x, l.y).dist < 26;

      let shouldIgnite = false;
      if (l.kind === LanternKind.Sun && (solDist < 42 || tetherHit)) {
        shouldIgnite = true;
      } else if (l.kind === LanternKind.Moon && (lunaDist < 42 || tetherHit)) {
        shouldIgnite = true;
      } else if (
        (l.kind === LanternKind.Shared || l.kind === LanternKind.SealedHeart) &&
        (tetherHit || (solDist < 68 && lunaDist < 68))
      ) {
        shouldIgnite = true;
      }

      if (shouldIgnite) {
        this.igniteLantern(l);
      }
    }
  }

  private igniteLantern(l: LiveLantern): void {
    if (l.lit || l.sealed) return;
    l.lit = true;
    l.charge = 1;
    l.scaleX = 0.72;
    l.scaleY = 1.36;
    this.score += 180;

    const litCount = this.lanterns.filter((item) => item.lit).length;
    this.sound.playLanternLit(litCount, this.lanterns.length);
    this.addShake(4.5);

    const ringColor =
      l.kind === LanternKind.Sun
        ? '#FDE68A'
        : l.kind === LanternKind.Moon
        ? '#FECDD3'
        : '#6EE7B7';

    this.particles.spawnRing(l.x, l.y, 12, 115, 0.55, ringColor, 3);
    this.particles.spawnBurst(l.x, l.y, 18, 45, 165, 0.52, 4.5, ringColor, ParticleShape.DiamondSpark);
  }

  private spawnStarBud(): void {
    const w = this.currentDef.worldWidth;
    const h = this.currentDef.worldHeight;
    this.starBuds.push({
      x: 180 + Math.random() * (w - 360),
      y: 160 + Math.random() * (h - 320),
      vx: (Math.random() - 0.5) * 28,
      vy: (Math.random() - 0.5) * 28,
      phase: Math.random() * Math.PI * 2,
      active: true,
    });
  }

  private updateStarBuds(dt: number): void {
    this.starBudSpawnTimer -= dt;
    if (this.starBudSpawnTimer <= 0 && this.starBuds.filter((b) => b.active).length < 2) {
      this.starBudSpawnTimer = 8.5;
      this.spawnStarBud();
    }

    for (const b of this.starBuds) {
      if (!b.active) continue;
      b.phase += dt * 3;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 140 || b.x > this.currentDef.worldWidth - 140) b.vx *= -1;
      if (b.y < 140 || b.y > this.currentDef.worldHeight - 140) b.vy *= -1;

      const tetherHit = this.distanceToTether(b.x, b.y).dist < 22;
      if (tetherHit) {
        b.active = false;
        this.score += 85;
        this.sound.playStarBudBloom();
        this.grantHarmonyPip();
        this.particles.spawnRing(b.x, b.y, 6, 64, 0.42, '#6EE7B7', 2.2);
        this.particles.spawnBurst(b.x, b.y, 12, 35, 120, 0.45, 4, '#A7F3D0', ParticleShape.DiamondSpark);
      }
    }
  }

  private updateWavesAndEnemies(dt: number): void {
    // Spawn scheduled waves
    for (const w of this.pendingWaves) {
      if (!w.spawned && this.levelTime >= w.triggerTime) {
        w.spawned = true;
        for (let i = 0; i < w.count; i++) {
          this.spawnEnemy(w.kind, i, w.count);
        }
      }
    }

    const coupleSpeed =
      Math.hypot(this.sol.vx, this.sol.vy) + Math.hypot(this.luna.vx, this.luna.vy);
    const tetherCanSlice =
      (this.tetherTension > 0.36 && coupleSpeed > 95) ||
      this.sparks[0].active ||
      this.sparks[1].active ||
      this.sol.dashTimer > 0 ||
      this.luna.dashTimer > 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      e.sliceImmunityTimer = Math.max(0, e.sliceImmunityTimer - dt);
      e.scaleX += (1 - e.scaleX) * Math.min(1, dt * 11);
      e.scaleY += (1 - e.scaleY) * Math.min(1, dt * 11);
      e.orbitAngle += dt * 2.2;

      this.stepEnemyBehavior(e, dt);

      // Tether Slice Check!
      if (tetherCanSlice && e.sliceImmunityTimer <= 0) {
        const { dist, closest } = this.distanceToTether(e.x, e.y);
        if (dist < e.radius + 9) {
          const dmg = this.sparks[0].active || this.sparks[1].active ? 2 : 1;
          this.tetherSlices += 1;
          this.syncStreak += 1;
          this.comboTimer = 4.5;
          this.sound.playTetherSlice(this.syncStreak);
          this.damageEnemy(e, dmg, closest.x, closest.y);
          if (e.hp > 0) {
            e.sliceImmunityTimer = 0.42;
          }
        }
      }

      // Check enemy collision with Sol & Luna
      if (e.hp > 0) {
        this.checkActorHitByEnemy(this.sol, e);
        this.checkActorHitByEnemy(this.luna, e);
      }

      if (e.hp <= 0) {
        this.enemies.splice(i, 1);
      }
    }
  }

  private spawnEnemy(kind: EnemyKind, indexInBatch: number, batchTotal: number): void {
    const w = this.currentDef.worldWidth;
    const h = this.currentDef.worldHeight;
    let x = w * 0.5;
    let y = 135;

    if (kind === EnemyKind.EclipseWeaver) {
      x = w * 0.5;
      y = 230;
    } else {
      const angle =
        (Math.PI * 2 * indexInBatch) / Math.max(1, batchTotal) + this.levelTime * 0.7;
      x = w * 0.5 + Math.cos(angle) * (w * 0.37);
      y = h * 0.5 + Math.sin(angle) * (h * 0.34);
    }

    const hpMap: Record<EnemyKind, number> = {
      [EnemyKind.ShadeMote]: 1,
      [EnemyKind.RiftStalker]: 2,
      [EnemyKind.GloomMortar]: 2,
      [EnemyKind.EclipseWeaver]: 14,
    };

    const radiusMap: Record<EnemyKind, number> = {
      [EnemyKind.ShadeMote]: 16,
      [EnemyKind.RiftStalker]: 20,
      [EnemyKind.GloomMortar]: 19,
      [EnemyKind.EclipseWeaver]: 38,
    };

    const hp = hpMap[kind];
    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: radiusMap[kind],
      hp,
      maxHp: hp,
      phase: EnemyPhase.Drifting,
      phaseTimer: 1.2 + Math.random() * 0.8,
      phaseDuration: 1.2,
      aimX: this.sol.x,
      aimY: this.sol.y,
      scaleX: 0.4,
      scaleY: 1.5,
      hitFlashTimer: 0,
      sliceImmunityTimer: 0.3,
      orbitAngle: Math.random() * Math.PI * 2,
      attackCycle: 0,
    });

    this.particles.spawnRing(x, y, 5, 48, 0.45, '#94A3B8', 2);
  }

  private stepEnemyBehavior(e: LiveEnemy, dt: number): void {
    const nearest =
      Math.hypot(this.sol.x - e.x, this.sol.y - e.y) <
      Math.hypot(this.luna.x - e.x, this.luna.y - e.y)
        ? this.sol
        : this.luna;
    const mid = this.sampleTetherPoint(0.5);

    if (e.kind === EnemyKind.ShadeMote) {
      if (e.phase === EnemyPhase.Drifting) {
        const dx = nearest.x - e.x;
        const dy = nearest.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += ((dx / d) * 108 - e.vx) * Math.min(1, dt * 5);
        e.vy += ((dy / d) * 108 - e.vy) * Math.min(1, dt * 5);
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        e.phaseTimer -= dt;
        if (d < 165 && e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Windup;
          e.phaseDuration = 0.72;
          e.phaseTimer = 0.72;
          e.aimX = nearest.x + (nearest.x - e.x) * 0.35;
          e.aimY = nearest.y + (nearest.y - e.y) * 0.35;
          e.scaleX = 1.28;
          e.scaleY = 0.72;
          this.sound.playEnemyWindup();
        }
      } else if (e.phase === EnemyPhase.Windup) {
        e.vx *= 0.85;
        e.vy *= 0.85;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Lunging;
          e.phaseTimer = 0.34;
          const dx = e.aimX - e.x;
          const dy = e.aimY - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.vx = (dx / d) * 390;
          e.vy = (dy / d) * 390;
          e.scaleX = 1.38;
          e.scaleY = 0.68;
        }
      } else if (e.phase === EnemyPhase.Lunging) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Recovering;
          e.phaseTimer = 0.65;
        }
      } else {
        e.vx *= 0.88;
        e.vy *= 0.88;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Drifting;
          e.phaseTimer = 1.1;
        }
      }
    } else if (e.kind === EnemyKind.RiftStalker) {
      // Hunts the midpoint of the silk tether to slash across it!
      if (e.phase === EnemyPhase.Drifting) {
        const dx = mid.x - e.x;
        const dy = mid.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += ((dx / d) * 142 - e.vx) * Math.min(1, dt * 6);
        e.vy += ((dy / d) * 142 - e.vy) * Math.min(1, dt * 6);
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        e.phaseTimer -= dt;
        if (d < 200 && e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Windup;
          e.phaseDuration = 0.86;
          e.phaseTimer = 0.86;
          const nx = dx / d;
          const ny = dy / d;
          e.aimX = e.x + nx * 310;
          e.aimY = e.y + ny * 310;
          e.scaleX = 1.32;
          e.scaleY = 0.7;
          this.sound.playEnemyWindup();
        }
      } else if (e.phase === EnemyPhase.Windup) {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Lunging;
          e.phaseTimer = 0.42;
          const dx = e.aimX - e.x;
          const dy = e.aimY - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.vx = (dx / d) * 510;
          e.vy = (dy / d) * 510;
          e.scaleX = 1.44;
          e.scaleY = 0.64;
        }
      } else if (e.phase === EnemyPhase.Lunging) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Recovering;
          e.phaseTimer = 0.8;
        }
      } else {
        e.vx *= 0.86;
        e.vy *= 0.86;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Drifting;
          e.phaseTimer = 1.35;
        }
      }
    } else if (e.kind === EnemyKind.GloomMortar) {
      // Keeps medium orbit distance and casts telegraphed ground circles
      const dx = nearest.x - e.x;
      const dy = nearest.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredDist = 275;
      const radialPush = d < desiredDist ? -85 : 95;
      const tangentX = -dy / d;
      const tangentY = dx / d;

      e.vx += (((dx / d) * radialPush + tangentX * 70) - e.vx) * Math.min(1, dt * 4);
      e.vy += (((dy / d) * radialPush + tangentY * 70) - e.vy) * Math.min(1, dt * 4);
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      e.phaseTimer -= dt;
      if (e.phase === EnemyPhase.Drifting && e.phaseTimer <= 0) {
        e.phase = EnemyPhase.Windup;
        e.phaseDuration = 0.55;
        e.phaseTimer = 0.55;
        e.scaleX = 0.8;
        e.scaleY = 1.28;
      } else if (e.phase === EnemyPhase.Windup && e.phaseTimer <= 0) {
        e.phase = EnemyPhase.Drifting;
        e.phaseTimer = 3.2;
        this.spawnGroundTelegraph(nearest.x, nearest.y, 68, 1.18);
      }
    } else if (e.kind === EnemyKind.EclipseWeaver) {
      // Sanctuary 5 Guardian Boss: alternates Star-Cleave charges & Umbral Mortar rings
      if (e.phase === EnemyPhase.Drifting) {
        const dx = mid.x - e.x;
        const dy = mid.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.vx += ((dx / d) * 95 - e.vx) * Math.min(1, dt * 3.5);
        e.vy += ((dy / d) * 95 - e.vy) * Math.min(1, dt * 3.5);
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.attackCycle += 1;
          e.phase = EnemyPhase.Windup;
          e.phaseDuration = 1.05;
          e.phaseTimer = 1.05;
          e.aimX = mid.x + (dx / d) * 140;
          e.aimY = mid.y + (dy / d) * 140;
          e.scaleX = 1.25;
          e.scaleY = 0.78;
          this.sound.playEnemyWindup();

          if (e.attackCycle % 2 === 0) {
            this.spawnGroundTelegraph(this.sol.x, this.sol.y, 74, 1.25);
            this.spawnGroundTelegraph(this.luna.x, this.luna.y, 74, 1.25);
          }
        }
      } else if (e.phase === EnemyPhase.Windup) {
        e.vx *= 0.85;
        e.vy *= 0.85;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          if (e.attackCycle % 2 === 1) {
            e.phase = EnemyPhase.Lunging;
            e.phaseTimer = 0.52;
            const dx = e.aimX - e.x;
            const dy = e.aimY - e.y;
            const d = Math.hypot(dx, dy) || 1;
            e.vx = (dx / d) * 440;
            e.vy = (dy / d) * 440;
          } else {
            e.phase = EnemyPhase.Recovering;
            e.phaseTimer = 0.9;
          }
        }
      } else if (e.phase === EnemyPhase.Lunging) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Recovering;
          e.phaseTimer = 1.05;
        }
      } else {
        e.vx *= 0.86;
        e.vy *= 0.86;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phase = EnemyPhase.Drifting;
          e.phaseTimer = 2.0;
        }
      }
    }

    // Keep enemy inside sanctuary courtyard
    const pad = 80;
    e.x = Math.max(pad, Math.min(this.currentDef.worldWidth - pad, e.x));
    e.y = Math.max(pad, Math.min(this.currentDef.worldHeight - pad, e.y));
  }

  private spawnGroundTelegraph(x: number, y: number, radius: number, duration: number): void {
    this.groundHazards.push({
      x: Math.max(120, Math.min(this.currentDef.worldWidth - 120, x)),
      y: Math.max(120, Math.min(this.currentDef.worldHeight - 120, y)),
      radius,
      timer: duration,
      duration,
      lingeringMireTimer: 0,
      active: true,
    });
  }

  private updateGroundHazards(dt: number): void {
    for (let i = this.groundHazards.length - 1; i >= 0; i--) {
      const h = this.groundHazards[i];
      if (!h.active) {
        this.groundHazards.splice(i, 1);
        continue;
      }

      if (h.lingeringMireTimer <= 0) {
        h.timer -= dt;
        if (h.timer <= 0) {
          // Erupt!
          h.lingeringMireTimer = 4.2;
          this.particles.spawnRing(h.x, h.y, 10, h.radius, 0.38, '#EF4444', 3);
          this.particles.spawnBurst(h.x, h.y, 14, 30, 120, 0.45, 4.5, '#F87171', ParticleShape.GlowDot);

          if (Math.hypot(this.sol.x - h.x, this.sol.y - h.y) < h.radius) {
            this.damageCouple(this.sol, h.x, h.y);
          } else if (Math.hypot(this.luna.x - h.x, this.luna.y - h.y) < h.radius) {
            this.damageCouple(this.luna, h.x, h.y);
          }
        }
      } else {
        h.lingeringMireTimer -= dt;
        if (h.lingeringMireTimer <= 0) {
          h.active = false;
        }
      }
    }
  }

  private damageEnemy(e: LiveEnemy, amount: number, fromX: number, fromY: number): void {
    e.hp -= amount;
    e.hitFlashTimer = 0.12;
    e.scaleX = 1.34;
    e.scaleY = 0.7;

    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    e.vx += (dx / d) * 210;
    e.vy += (dy / d) * 210;

    if (e.hp <= 0) {
      const isBoss = e.kind === EnemyKind.EclipseWeaver;
      this.score += isBoss ? 1200 : 110 * Math.min(4, Math.max(1, this.syncStreak));
      this.addHitstop(isBoss ? 0.08 : 0.048);
      this.addShake(isBoss ? 13 : 6.5);

      this.particles.spawnRing(e.x, e.y, e.radius * 0.5, isBoss ? 190 : 88, 0.48, '#FDE68A', 3.2);
      this.particles.spawnBurst(
        e.x,
        e.y,
        isBoss ? 38 : 16,
        55,
        isBoss ? 290 : 195,
        0.52,
        isBoss ? 6 : 4.2,
        '#FDE68A',
        ParticleShape.DiamondSpark
      );
    } else {
      this.addHitstop(0.036);
      this.addShake(4.2);
      this.particles.spawnBurst(e.x, e.y, 9, 45, 145, 0.35, 3.6, '#FEF3C7', ParticleShape.DiamondSpark);
    }
  }

  private checkActorHitByEnemy(actor: SpiritActor, e: LiveEnemy): void {
    if (actor.invulnTimer > 0) return;
    const d = Math.hypot(actor.x - e.x, actor.y - e.y);
    if (d < actor.radius + e.radius - 4) {
      this.damageCouple(actor, e.x, e.y);
    }
  }

  private damageCouple(victim: SpiritActor, sourceX: number, sourceY: number): void {
    if (victim.invulnTimer > 0) return;
    this.hearts = Math.max(0, this.hearts - 1);
    this.syncStreak = 0;

    // Brief protective invulnerability on both partners so a single attack never double-hits
    this.sol.invulnTimer = 1.15;
    this.luna.invulnTimer = 1.15;
    victim.hitFlashTimer = 0.25;
    victim.scaleX = 0.72;
    victim.scaleY = 1.34;

    const dx = victim.x - sourceX;
    const dy = victim.y - sourceY;
    const d = Math.hypot(dx, dy) || 1;
    victim.vx = (dx / d) * 320;
    victim.vy = (dy / d) * 320;

    this.sound.playDamage();
    this.addHitstop(0.065);
    this.addShake(11);
    this.particles.spawnRing(victim.x, victim.y, 12, 95, 0.45, '#EF4444', 3.5);
    this.particles.spawnBurst(victim.x, victim.y, 16, 50, 180, 0.45, 4.5, '#FCA5A5', ParticleShape.DiamondSpark);

    if (this.hearts <= 0) {
      this.sound.playGameOver();
      this.gameState = GameState.GameOver;
      this.emitHud(true);
    }
  }

  private addHitstop(seconds: number): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, seconds);
  }

  private addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeIntensity = Math.min(16, this.shakeIntensity + amount);
  }

  private updateFireflies(dt: number): void {
    const w = this.currentDef.worldWidth;
    const h = this.currentDef.worldHeight;
    for (const f of this.fireflies) {
      f.phase += dt * 2.1;
      if (this.gameState === GameState.TitleMenu && this.input.pointerWorld) {
        const dx = this.input.pointerWorld.x - f.x;
        const dy = this.input.pointerWorld.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 180 && d > 8) {
          f.vx += (dx / d) * 28 * dt;
          f.vy += (dy / d) * 28 * dt;
        }
      }
      f.vx *= 0.99;
      f.vy *= 0.99;
      f.x += (f.vx + Math.sin(f.phase) * 8) * dt;
      f.y += (f.vy + Math.cos(f.phase * 0.8) * 8) * dt;
      if (f.x < 40) f.x = w - 40;
      if (f.x > w - 40) f.x = 40;
      if (f.y < 40) f.y = h - 40;
      if (f.y > h - 40) f.y = 40;
    }
  }

  private updateCamera(dt: number): void {
    const midX = (this.sol.x + this.luna.x) * 0.5;
    const midY = (this.sol.y + this.luna.y) * 0.5;
    const centerBiasX = this.currentDef.worldWidth * 0.5;
    const centerBiasY = this.currentDef.worldHeight * 0.5;

    const targetX = midX * 0.62 + centerBiasX * 0.38;
    const targetY = midY * 0.62 + centerBiasY * 0.38;

    this.camX += (targetX - this.camX) * Math.min(1, dt * 6.5);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 6.5);
  }

  private checkSanctuaryClear(dt: number): void {
    const allLanternsLit = this.lanterns.every((l) => l.lit);
    const allWavesSpawned = this.pendingWaves.every((w) => w.spawned);
    const noEnemiesLeft = this.enemies.length === 0;

    if (allLanternsLit && allWavesSpawned && noEnemiesLeft) {
      if (this.clearDelayTimer === 0) {
        this.sound.playSanctuaryClear();
        const mid = this.sampleTetherPoint(0.5);
        this.particles.spawnRing(mid.x, mid.y, 15, 280, 0.8, '#6EE7B7', 4);
        this.particles.spawnBurst(mid.x, mid.y, 34, 60, 240, 0.85, 5.5, '#FDE68A', ParticleShape.HeartMote);
      }
      this.clearDelayTimer += dt;
      if (this.clearDelayTimer >= 0.95) {
        this.latestRoundStats = {
          sanctuaryIndex: this.currentDef.index,
          sanctuaryTitle: this.currentDef.title,
          coupleSparkPrompt: this.currentDef.coupleSparkPrompt,
          scoreGained: this.score - this.roundStartScore,
          totalScore: this.score,
          tetherSlices: this.tetherSlices,
          resonanceNovas: this.resonanceNovas,
          partnerSaves: this.partnerSaves,
          embraceSeconds: Math.round(this.embraceSeconds),
          clearTimeSeconds: Math.round(this.levelTime),
          heartsRemaining: this.hearts,
          maxHearts: this.maxHearts,
        };

        if (this.sanctuaryIdx + 1 >= SANCTUARIES.length) {
          this.gameState = GameState.Victory;
        } else {
          this.gameState = GameState.RoundSummary;
        }
        this.emitHud(true);
      }
    }
  }

  private emitHud(force: boolean): void {
    const lanternsLit = this.lanterns.filter((l) => l.lit).length;
    const unspawnedCount = this.pendingWaves
      .filter((w) => !w.spawned)
      .reduce((acc, w) => acc + w.count, 0);
    const enemiesRemaining = this.enemies.length + unspawnedCount;

    const boss = this.enemies.find((e) => e.kind === EnemyKind.EclipseWeaver);
    const bossHpRatio = boss ? Math.max(0, boss.hp / boss.maxHp) : null;

    const key = [
      this.gameState,
      this.playMode,
      this.hearts,
      this.harmonyPips,
      this.sanctuaryIdx,
      lanternsLit,
      enemiesRemaining,
      boss ? boss.hp : -1,
      this.score,
      this.syncStreak,
      this.sound.isMuted(),
    ].join('|');

    if (!force && key === this.lastHudKey) return;
    this.lastHudKey = key;

    this.onHudChange({
      gameState: this.gameState,
      playMode: this.playMode,
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      harmonyPips: this.harmonyPips,
      sanctuaryIndex: this.currentDef.index,
      totalSanctuaries: SANCTUARIES.length,
      sanctuaryTitle: this.currentDef.title,
      objectiveHint: this.currentDef.objectiveHint,
      lanternsLit,
      totalLanterns: this.lanterns.length,
      enemiesRemaining,
      bossHpRatio,
      bossName: boss ? 'The Eclipse Weaver' : null,
      score: this.score,
      syncStreak: this.syncStreak,
      isMuted: this.sound.isMuted(),
      roundStats: this.latestRoundStats,
    });
  }

  // ============================================================================
  // RENDERING (60fps World-Matched Twilight Courtyard, Silk Tether & Spirits)
  // ============================================================================

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Deep nocturnal lotus-water backdrop
    const bgGrad = ctx.createRadialGradient(
      this.viewWidth * 0.5,
      this.viewHeight * 0.45,
      80,
      this.viewWidth * 0.5,
      this.viewHeight * 0.5,
      Math.max(this.viewWidth, this.viewHeight) * 0.78
    );
    bgGrad.addColorStop(0, '#0F1B2D');
    bgGrad.addColorStop(1, '#060C16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    // Camera transform + decaying shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0 && !this.reducedMotion) {
      shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    }

    ctx.translate(
      this.viewWidth * 0.5 - this.camX + shakeX,
      this.viewHeight * 0.5 - this.camY + shakeY
    );

    this.renderSanctuaryCourtyard(ctx);
    this.renderSeals(ctx);
    this.renderGroundHazards(ctx);
    this.renderPillars(ctx);
    this.renderStarBuds(ctx);
    this.renderLanterns(ctx);
    this.renderTether(ctx);
    this.renderEnemies(ctx);
    this.renderSpirit(ctx, this.sol, true, this.names.sol);
    this.renderSpirit(ctx, this.luna, false, this.names.luna);
    this.particles.render(ctx);
    this.renderFireflies(ctx);

    ctx.restore();
  }

  private renderSanctuaryCourtyard(ctx: CanvasRenderingContext2D): void {
    const w = this.currentDef.worldWidth;
    const h = this.currentDef.worldHeight;

    // Subtle lotus lily pads floating in perimeter water
    const padPositions = [
      { x: 68, y: 150, r: 22 },
      { x: 85, y: h - 160, r: 18 },
      { x: w - 75, y: 190, r: 24 },
      { x: w - 82, y: h - 150, r: 20 },
      { x: w * 0.5, y: 52, r: 19 },
      { x: w * 0.5 + 80, y: h - 52, r: 21 },
    ];
    for (const lp of padPositions) {
      ctx.save();
      ctx.translate(lp.x, lp.y + Math.sin(this.globalTime * 1.2 + lp.x) * 3);
      ctx.fillStyle = '#132A2E';
      ctx.strokeStyle = '#1F4449';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, lp.r, 0.25, Math.PI * 2 - 0.25);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Carved Twilight Stone Terrace
    const terraceX = 64;
    const terraceY = 64;
    const terraceW = w - 128;
    const terraceH = h - 128;

    // Stone foundation shadow/rim
    ctx.fillStyle = '#09121F';
    this.roundRectPath(ctx, terraceX, terraceY + 10, terraceW, terraceH, 38);
    ctx.fill();

    // Main stone courtyard surface
    const stoneGrad = ctx.createLinearGradient(terraceX, terraceY, terraceX, terraceY + terraceH);
    stoneGrad.addColorStop(0, '#142234');
    stoneGrad.addColorStop(0.5, '#111D2E');
    stoneGrad.addColorStop(1, '#0D1726');
    ctx.fillStyle = stoneGrad;
    this.roundRectPath(ctx, terraceX, terraceY, terraceW, terraceH, 36);
    ctx.fill();

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Delicate architectural stone tile grid & central celestial astrolabe inlay
    ctx.save();
    this.roundRectPath(ctx, terraceX + 8, terraceY + 8, terraceW - 16, terraceH - 16, 30);
    ctx.clip();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
    ctx.lineWidth = 1;
    const tile = 90;
    for (let x = terraceX; x <= terraceX + terraceW; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, terraceY);
      ctx.lineTo(x, terraceY + terraceH);
      ctx.stroke();
    }
    for (let y = terraceY; y <= terraceY + terraceH; y += tile) {
      ctx.beginPath();
      ctx.moveTo(terraceX, y);
      ctx.lineTo(terraceX + terraceW, y);
      ctx.stroke();
    }

    // Center Sanctuary Astrolabe Ring
    const cx = w * 0.5;
    const cy = h * 0.5;
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.09)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 135, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(254, 205, 211, 0.07)';
    ctx.beginPath();
    ctx.arc(cx, cy, 220, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderSeals(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sealPairs) {
      const targetLantern = this.lanterns.find((l) => l.id === s.unlocksLanternId);

      // Subtle rune channels linking Sun Seal & Moon Seal to Sealed Heart Lantern
      if (targetLantern && !s.unlocked) {
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -this.globalTime * 16;
        ctx.lineWidth = 1.5;

        ctx.strokeStyle = s.sunOccupied ? 'rgba(253, 230, 138, 0.65)' : 'rgba(253, 230, 138, 0.22)';
        ctx.beginPath();
        ctx.moveTo(s.sunX, s.sunY);
        ctx.lineTo(targetLantern.x, targetLantern.y);
        ctx.stroke();

        ctx.strokeStyle = s.moonOccupied ? 'rgba(254, 205, 211, 0.65)' : 'rgba(254, 205, 211, 0.22)';
        ctx.beginPath();
        ctx.moveTo(s.moonX, s.moonY);
        ctx.lineTo(targetLantern.x, targetLantern.y);
        ctx.stroke();
        ctx.restore();
      }

      this.drawSingleSeal(ctx, s.sunX, s.sunY, true, s.sunOccupied, s.progress, s.unlocked);
      this.drawSingleSeal(ctx, s.moonX, s.moonY, false, s.moonOccupied, s.progress, s.unlocked);
    }
  }

  private drawSingleSeal(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    isSun: boolean,
    occupied: boolean,
    progress: number,
    unlocked: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);

    const baseColor = unlocked
      ? '#34D399'
      : isSun
      ? '#F59E0B'
      : '#FB7185';
    const lightColor = unlocked
      ? '#A7F3D0'
      : isSun
      ? '#FDE68A'
      : '#FECDD3';

    ctx.fillStyle = occupied || unlocked ? `${baseColor}26` : 'rgba(15, 23, 42, 0.65)';
    ctx.strokeStyle = occupied || unlocked ? lightColor : `${baseColor}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Progress fill arc
    if (progress > 0 && !unlocked) {
      ctx.strokeStyle = '#6EE7B7';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 42, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * progress);
      ctx.stroke();
    }

    // Center Sun or Crescent Glyph (non-hue-only iconographic distinction!)
    ctx.fillStyle = lightColor;
    if (isSun) {
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lightColor;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + this.globalTime * 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(-2, 0, 9, -Math.PI * 0.72, Math.PI * 0.72, false);
      ctx.arc(3, 0, 7.5, Math.PI * 0.62, -Math.PI * 0.62, true);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private renderGroundHazards(ctx: CanvasRenderingContext2D): void {
    for (const h of this.groundHazards) {
      if (!h.active) continue;
      ctx.save();
      ctx.translate(h.x, h.y);

      if (h.lingeringMireTimer <= 0) {
        // Windup Telegraph Circle
        const progress = Math.max(0, Math.min(1, 1 - h.timer / h.duration));
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
        ctx.fill();

        // Expanding inner danger ring
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius * progress, 0, Math.PI * 2);
        ctx.fill();

        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Lingering Shadow Mire (slows movement; cleared by Resonance Nova)
        const fade = Math.min(1, h.lingeringMireTimer / 1.0);
        ctx.globalAlpha = fade * 0.65;
        ctx.fillStyle = '#1E1B2E';
        ctx.beginPath();
        ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9F1239';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private renderPillars(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pillars) {
      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.energy > 0.05) {
        const grad = ctx.createRadialGradient(0, 0, p.radius * 0.5, 0, 0, p.radius * 2.4);
        grad.addColorStop(0, `rgba(110, 231, 183, ${0.38 * p.energy})`);
        grad.addColorStop(1, 'rgba(110, 231, 183, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = p.energy > 0.2 ? '#6EE7B7' : '#64748B';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 6;
        const px = Math.cos(a) * p.radius;
        const py = Math.sin(a) * p.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner crystal core
      ctx.fillStyle = p.energy > 0.2 ? '#A7F3D0' : '#475569';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private renderStarBuds(ctx: CanvasRenderingContext2D): void {
    for (const b of this.starBuds) {
      if (!b.active) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.phase * 0.4);
      const pulse = 1 + Math.sin(b.phase) * 0.12;
      ctx.scale(pulse, pulse);

      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      glow.addColorStop(0, 'rgba(167, 243, 208, 0.75)');
      glow.addColorStop(1, 'rgba(167, 243, 208, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#A7F3D0';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.quadraticCurveTo(4, -3, 0, 0);
        ctx.quadraticCurveTo(-4, -3, 0, -10);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderLanterns(ctx: CanvasRenderingContext2D): void {
    for (const l of this.lanterns) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.scale(l.scaleX, l.scaleY);

      // Volumetric warm aura when lit
      if (l.lit) {
        const flicker = 1 + Math.sin(l.glowPhase) * 0.06;
        const glowColor =
          l.kind === LanternKind.Sun
            ? 'rgba(245, 158, 11, 0.34)'
            : l.kind === LanternKind.Moon
            ? 'rgba(251, 113, 133, 0.32)'
            : 'rgba(52, 211, 153, 0.34)';
        const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 88 * flicker);
        aura.addColorStop(0, glowColor);
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, 88 * flicker, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pedestal ring
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = l.lit
        ? '#FDE68A'
        : l.sealed
        ? '#475569'
        : l.kind === LanternKind.Sun
        ? '#F59E0B'
        : l.kind === LanternKind.Moon
        ? '#FB7185'
        : '#94A3B8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Ornate Lantern Housing
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fillStyle = l.lit
        ? l.kind === LanternKind.Moon
          ? '#FECDD3'
          : l.kind === LanternKind.Sun
          ? '#FDE68A'
          : '#A7F3D0'
        : '#1E293B';
      ctx.fill();
      ctx.stroke();

      if (l.sealed) {
        // Crossed seal chains + lock icon
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-14, -14);
        ctx.lineTo(14, 14);
        ctx.moveTo(14, -14);
        ctx.lineTo(-14, 14);
        ctx.stroke();
      } else if (!l.lit) {
        // Subtle emblem clue (Sun dot, Moon arc, or Shared diamond)
        ctx.fillStyle =
          l.kind === LanternKind.Sun
            ? '#F59E0B'
            : l.kind === LanternKind.Moon
            ? '#FB7185'
            : '#94A3B8';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderTether(ctx: CanvasRenderingContext2D): void {
    if (this.tether.length < 2) return;

    ctx.save();
    const grad = ctx.createLinearGradient(this.sol.x, this.sol.y, this.luna.x, this.luna.y);
    grad.addColorStop(0, '#F59E0B');
    grad.addColorStop(0.5, this.tetherTension > 0.45 ? '#FFFBEB' : '#FDE68A');
    grad.addColorStop(1, '#FB7185');

    // Outer luminous silk ribbon glow
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.28 + this.tetherTension * 0.35;
    ctx.lineWidth = 8 + this.tetherTension * 5;
    this.traceTetherCurve(ctx);
    ctx.stroke();

    // Crisp silk core thread
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.4 + this.tetherTension * 1.8;
    ctx.strokeStyle = this.tetherTension > 0.55 ? '#FFFBEB' : grad;
    this.traceTetherCurve(ctx);
    ctx.stroke();

    // Render active Harmonic Sparks racing along the tether
    for (const sp of this.sparks) {
      if (!sp.active) continue;
      const pos = this.sampleTetherPoint(sp.fromSol ? sp.progress : 1 - sp.progress);
      const sparkGlow = ctx.createRadialGradient(pos.x, pos.y, 2, pos.x, pos.y, 24);
      sparkGlow.addColorStop(0, '#FFFBEB');
      sparkGlow.addColorStop(0.5, sp.fromSol ? '#F59E0B' : '#FB7185');
      sparkGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sparkGlow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private traceTetherCurve(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.tether[0].x, this.tether[0].y);
    for (let i = 1; i < this.tether.length - 1; i++) {
      const xc = (this.tether[i].x + this.tether[i + 1].x) * 0.5;
      const yc = (this.tether[i].y + this.tether[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(this.tether[i].x, this.tether[i].y, xc, yc);
    }
    const last = this.tether[this.tether.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  private renderSpirit(
    ctx: CanvasRenderingContext2D,
    actor: SpiritActor,
    isSol: boolean,
    label: string
  ): void {
    ctx.save();
    ctx.translate(actor.x, actor.y);

    // Sync Coyote Grace Ring (tells player they can press Pulse right now for a Resonance Nova!)
    const grace = isSol ? this.syncGraceSolTimer : this.syncGraceLunaTimer;
    if (grace > 0 && this.gameState === GameState.Playing) {
      ctx.strokeStyle = '#6EE7B7';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, actor.radius + 11 + Math.sin(this.globalTime * 18) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Warm spirit radial light
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 56);
    glow.addColorStop(0, isSol ? 'rgba(245, 158, 11, 0.42)' : 'rgba(251, 113, 133, 0.40)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fill();

    // Squash & stretch body
    ctx.save();
    ctx.rotate(actor.facingAngle);
    ctx.scale(actor.scaleX, actor.scaleY);

    if (actor.invulnTimer > 0 && Math.floor(actor.invulnTimer * 16) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    // Spirit cloak / body
    ctx.fillStyle =
      actor.hitFlashTimer > 0
        ? '#FFFFFF'
        : isSol
        ? '#F59E0B'
        : '#FB7185';
    ctx.strokeStyle = isSol ? '#FEF3C7' : '#FFE4E6';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, actor.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Luminous inner spirit core
    ctx.fillStyle = '#FFFBEB';
    ctx.beginPath();
    ctx.arc(3, 0, actor.radius * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Distinct Crown Crest (Sol Sunburst Crest vs Luna Crescent Crest)
    ctx.strokeStyle = '#FFFBEB';
    ctx.lineWidth = 1.8;
    if (isSol) {
      ctx.beginPath();
      ctx.moveTo(-actor.radius - 6, -5);
      ctx.lineTo(-actor.radius - 12, 0);
      ctx.lineTo(-actor.radius - 6, 5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-actor.radius - 3, 0, 6, -Math.PI * 0.65, Math.PI * 0.65);
      ctx.stroke();
    }

    ctx.restore();

    // Quiet unboxed name label above spirit during active play
    if (this.gameState === GameState.Playing) {
      ctx.font = '600 11.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSol ? '#FDE68A' : '#FECDD3';
      ctx.fillText(label, 0, -actor.radius - 11);
    }

    ctx.restore();
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      ctx.save();

      // Visible Windup Telegraph BEFORE enemy lunges!
      if (e.phase === EnemyPhase.Windup && e.kind !== EnemyKind.GloomMortar) {
        const progress = Math.max(0, Math.min(1, 1 - e.phaseTimer / e.phaseDuration));
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.72)';
        ctx.lineWidth = e.kind === EnemyKind.EclipseWeaver ? 4 : 2.2;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.aimX, e.aimY);
        ctx.stroke();

        // Shrinking timing ring around winding-up enemy
        ctx.setLineDash([]);
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + (1 - progress) * 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.translate(e.x, e.y);
      ctx.scale(e.scaleX, e.scaleY);

      const flashing = e.hitFlashTimer > 0;

      if (e.kind === EnemyKind.ShadeMote) {
        ctx.fillStyle = flashing ? '#FFFBEB' : '#1E1B38';
        ctx.strokeStyle = flashing ? '#FDE68A' : '#818CF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glowing eyes
        ctx.fillStyle = '#F87171';
        ctx.beginPath();
        ctx.arc(-5, -2, 2.4, 0, Math.PI * 2);
        ctx.arc(5, -2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === EnemyKind.RiftStalker) {
        // Sleek diamond scissor-blade silhouette
        const angle = Math.atan2(e.vy || 0.01, e.vx || 0.01);
        ctx.rotate(angle);
        ctx.fillStyle = flashing ? '#FFFBEB' : '#2A162D';
        ctx.strokeStyle = flashing ? '#FDE68A' : '#FB7185';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(e.radius * 1.3, 0);
        ctx.lineTo(-e.radius * 0.4, e.radius * 0.9);
        ctx.lineTo(-e.radius, 0);
        ctx.lineTo(-e.radius * 0.4, -e.radius * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.kind === EnemyKind.GloomMortar) {
        // Hexagonal floating shadow censer
        ctx.rotate(e.orbitAngle * 0.4);
        ctx.fillStyle = flashing ? '#FFFBEB' : '#1F1A30';
        ctx.strokeStyle = flashing ? '#FDE68A' : '#C084FC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI * 2 * k) / 6;
          if (k === 0) ctx.moveTo(Math.cos(a) * e.radius, Math.sin(a) * e.radius);
          else ctx.lineTo(Math.cos(a) * e.radius, Math.sin(a) * e.radius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === EnemyKind.EclipseWeaver) {
        // Majestic Sanctuary 5 Boss
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 12, e.orbitAngle, e.orbitAngle + Math.PI * 1.4);
        ctx.stroke();

        ctx.fillStyle = flashing ? '#FFFBEB' : '#171126';
        ctx.strokeStyle = flashing ? '#FDE68A' : '#F43F5E';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eclipse Corona Core
        ctx.fillStyle = flashing ? '#F59E0B' : '#E11D48';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.42, 0, Math.PI * 2);
        ctx.fill();

        // Orbiting umbral nodes
        for (let n = 0; n < 3; n++) {
          const a = e.orbitAngle + (Math.PI * 2 * n) / 3;
          ctx.fillStyle = '#FDA4AF';
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (e.radius + 12), Math.sin(a) * (e.radius + 12), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  private renderFireflies(ctx: CanvasRenderingContext2D): void {
    for (const f of this.fireflies) {
      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(f.phase));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.warm ? '#FDE68A' : '#FECDD3';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
