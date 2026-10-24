/**
 * Procedural Web Audio synthesizer for Kindred Lanterns.
 * Uses pure browser Web Audio API oscillators and filtered noise bursts
 * tuned to a warm D-Lydian / major pentatonic harmonic palette.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = window.localStorage.getItem('kindred_lanterns_muted');
      if (saved === 'true') {
        this.muted = true;
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): boolean {
    this.muted = mute;
    try {
      window.localStorage.setItem('kindred_lanterns_muted', String(mute));
    } catch {
      // Ignore storage errors
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.35, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.35;
      this.masterGain.connect(this.ctx.destination);
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay: number = 0
  ): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playFilteredNoise(duration: number, filterFreq: number, volume: number, q: number = 2.5): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(filterFreq * 0.45, now + duration);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public playPulse(isSol: boolean): void {
    if (isSol) {
      // Warm amber harp pluck (D4 + A4)
      this.playTone(293.66, 295.0, 0.28, 'triangle', 0.34, 0);
      this.playTone(440.0, 442.0, 0.22, 'sine', 0.2, 0.02);
    } else {
      // Moonlit rose celesta chime (F#4 + C#5)
      this.playTone(369.99, 371.5, 0.28, 'sine', 0.3, 0);
      this.playTone(554.37, 556.0, 0.24, 'triangle', 0.22, 0.02);
    }
  }

  public playResonanceNova(streak: number): void {
    // Lush major-9th harmonic bloom when Sol & Luna sync pulses!
    const pitchBoost = Math.pow(1.06, Math.min(streak, 6));
    const notes = [293.66, 440.0, 554.37, 659.25, 880.0];
    notes.forEach((f, idx) => {
      this.playTone(f * pitchBoost, f * pitchBoost * 1.005, 0.55, idx % 2 === 0 ? 'triangle' : 'sine', 0.24, idx * 0.028);
    });
    this.playTone(146.83, 110.0, 0.42, 'sine', 0.36, 0);
    this.playFilteredNoise(0.22, 2400, 0.16, 1.8);
  }

  public playTetherSlice(combo: number): void {
    const semitone = Math.pow(1.05946, Math.min(combo, 10));
    this.playFilteredNoise(0.14, 1900 * semitone, 0.28, 3.2);
    this.playTone(392.0 * semitone, 784.0 * semitone, 0.19, 'triangle', 0.3, 0);
    this.playTone(587.33 * semitone, 880.0 * semitone, 0.24, 'sine', 0.22, 0.03);
  }

  public playTugDash(savedPartner: boolean): void {
    this.playFilteredNoise(0.11, 1200, 0.2, 2.0);
    this.playTone(220, 360, 0.14, 'sine', 0.22, 0);
    if (savedPartner) {
      this.playTone(587.33, 880.0, 0.28, 'triangle', 0.26, 0.04);
    }
  }

  public playLanternLit(litCount: number, totalCount: number): void {
    const scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 739.99, 880.0];
    const base = scale[Math.min(litCount - 1, scale.length - 1)] || 440;
    this.playTone(base, base * 1.004, 0.45, 'triangle', 0.32, 0);
    this.playTone(base * 1.5, base * 1.504, 0.48, 'sine', 0.24, 0.055);
    if (litCount >= totalCount) {
      this.playTone(base * 2, base * 2.005, 0.65, 'sine', 0.28, 0.11);
    }
  }

  public playSealUnlocked(): void {
    const chord = [369.99, 440.0, 587.33, 739.99];
    chord.forEach((f, idx) => {
      this.playTone(f, f, 0.45, 'sine', 0.22, idx * 0.045);
    });
  }

  public playStarBudBloom(): void {
    this.playTone(659.25, 987.77, 0.2, 'sine', 0.18, 0);
  }

  public playEnemyWindup(): void {
    this.playTone(195, 275, 0.22, 'sawtooth', 0.075, 0);
  }

  public playDamage(): void {
    this.playFilteredNoise(0.24, 420, 0.36, 1.4);
    this.playTone(165, 72, 0.32, 'sawtooth', 0.28, 0);
    this.playTone(130, 65, 0.34, 'triangle', 0.3, 0.02);
  }

  public playHeartRestored(): void {
    this.playTone(440, 587.33, 0.28, 'sine', 0.25, 0);
    this.playTone(587.33, 880.0, 0.38, 'triangle', 0.26, 0.08);
  }

  public playSanctuaryClear(): void {
    const fanfare = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0];
    fanfare.forEach((f, i) => {
      this.playTone(f, f * 1.003, 0.62, i % 2 === 0 ? 'triangle' : 'sine', 0.25, i * 0.075);
    });
  }

  public playGameOver(): void {
    const notes = [369.99, 329.63, 293.66, 220.0];
    notes.forEach((f, i) => {
      this.playTone(f, f * 0.98, 0.48, 'triangle', 0.24, i * 0.12);
    });
  }
}
