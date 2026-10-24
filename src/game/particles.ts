export enum ParticleShape {
  GlowDot = 0,
  DiamondSpark = 1,
  HeartMote = 2,
  SmokeWisp = 3,
}

export interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  endSize: number;
  color: string;
  shape: ParticleShape;
  gravityY: number;
}

export interface PooledRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  lineWidth: number;
}

const MAX_PARTICLES = 520;
const MAX_RINGS = 36;

/**
 * Fixed-size pre-allocated particle & shockwave ring pool to prevent
 * per-frame garbage collection stalls during heavy action moments.
 */
export class ParticlePool {
  public readonly particles: PooledParticle[] = [];
  public readonly rings: PooledRing[] = [];

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        drag: 0.94,
        life: 0,
        maxLife: 1,
        size: 4,
        endSize: 0,
        color: '#FDE68A',
        shape: ParticleShape.GlowDot,
        gravityY: 0,
      });
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({
        active: false,
        x: 0,
        y: 0,
        radius: 4,
        maxRadius: 80,
        life: 0,
        maxLife: 0.5,
        color: '#FDE68A',
        lineWidth: 3,
      });
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles[i].active = false;
    for (let i = 0; i < MAX_RINGS; i++) this.rings[i].active = false;
  }

  public spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    endSize: number,
    color: string,
    shape: ParticleShape = ParticleShape.GlowDot,
    drag: number = 0.93,
    gravityY: number = 0
  ): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.life = life;
        p.maxLife = life;
        p.size = size;
        p.endSize = endSize;
        p.color = color;
        p.shape = shape;
        p.drag = drag;
        p.gravityY = gravityY;
        return;
      }
    }
  }

  public spawnBurst(
    x: number,
    y: number,
    count: number,
    minSpeed: number,
    maxSpeed: number,
    life: number,
    size: number,
    color: string,
    shape: ParticleShape = ParticleShape.DiamondSpark
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life * (0.75 + Math.random() * 0.45),
        size * (0.8 + Math.random() * 0.4),
        0.5,
        color,
        shape,
        0.91,
        0
      );
    }
  }

  public spawnRing(
    x: number,
    y: number,
    startRadius: number,
    maxRadius: number,
    life: number,
    color: string,
    lineWidth: number = 2.5
  ): void {
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) {
        r.active = true;
        r.x = x;
        r.y = y;
        r.radius = startRadius;
        r.maxRadius = maxRadius;
        r.life = life;
        r.maxLife = life;
        r.color = color;
        r.lineWidth = lineWidth;
        return;
      }
    }
  }

  public update(dt: number): void {
    const dampFactor = Math.pow(0.08, dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravityY * dt;
      const dragStep = Math.pow(p.drag, dt * 60);
      p.vx *= dragStep || dampFactor;
      p.vy *= dragStep || dampFactor;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      const eased = 1 - Math.pow(1 - progress, 3);
      r.radius = r.maxRadius * eased;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    // Shockwave & ripple rings
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      const alpha = Math.max(0, r.life / r.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.75, r.lineWidth * alpha);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const t = Math.max(0, p.life / p.maxLife);
      const sz = p.endSize + (p.size - p.endSize) * t;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.15);
      ctx.fillStyle = p.color;

      if (p.shape === ParticleShape.DiamondSpark) {
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.beginPath();
        ctx.moveTo(sz * 1.7, 0);
        ctx.lineTo(0, sz * 0.65);
        ctx.lineTo(-sz * 1.4, 0);
        ctx.lineTo(0, -sz * 0.65);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === ParticleShape.HeartMote) {
        ctx.translate(p.x, p.y);
        const hs = sz * 0.95;
        ctx.beginPath();
        ctx.moveTo(0, hs * 0.65);
        ctx.bezierCurveTo(-hs * 1.2, -hs * 0.2, -hs * 0.7, -hs * 1.2, 0, -hs * 0.45);
        ctx.bezierCurveTo(hs * 0.7, -hs * 1.2, hs * 1.2, -hs * 0.2, 0, hs * 0.65);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, sz), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
