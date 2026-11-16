/**
 * 1993 MS-DOS AdLib / Sound Blaster FM 감성의 경량 Web Audio 5음계 BGM & 효과음 엔진
 * 외부 오디오 파일 없이 즉시 실행 가능 (CPU + 내장 GPU/모바일 최적화)
 */
export class AdlibSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.6;
  private bgmEnabled = true;
  private mode: 'FIELD' | 'BOSS' | 'ENDING' = 'FIELD';
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    if (this.bgmEnabled && this.ctx) {
      this.startBgmLoop();
    }
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  public setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    if (!enabled) {
      this.stopBgmLoop();
    } else if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => undefined);
      }
      this.startBgmLoop();
    }
  }

  public setMode(mode: 'FIELD' | 'BOSS' | 'ENDING'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.bgmStep = 0;
  }

  private out(): AudioNode | null {
    return this.masterGain ?? this.ctx?.destination ?? null;
  }

  private startBgmLoop(): void {
    if (this.bgmTimer !== null || !this.bgmEnabled) return;
    // 동양 무협 5음계(궁·상·각·치·우: D4, E4, G4, A4, B4, D5)
    const fieldNotes = [293.66, 329.63, 392.0, 440.0, 587.33, 440.0, 392.0, 329.63, 293.66, 392.0, 440.0, 493.88, 587.33, 493.88, 440.0, 0];
    const bossNotes = [220.0, 220.0, 293.66, 329.63, 392.0, 329.63, 293.66, 261.63, 220.0, 293.66, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63];
    const endingNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63, 293.66, 329.63, 392.0, 523.25, 0, 392.0, 0];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || !this.bgmEnabled || this.ctx.state !== 'running' || this.volume <= 0.01) return;
      const pattern =
        this.mode === 'BOSS' ? bossNotes : this.mode === 'ENDING' ? endingNotes : fieldNotes;
      const freq = pattern[this.bgmStep % pattern.length];
      this.bgmStep = (this.bgmStep + 1) % pattern.length;
      if (freq <= 0) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = this.mode === 'BOSS' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(this.mode === 'BOSS' ? 0.032 : 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain).connect(this.out()!);
      osc.start(now);
      osc.stop(now + 0.38);
    }, 420);
  }

  private stopBgmLoop(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public playSwing(heavy = false): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 240 : 410, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + (heavy ? 0.16 : 0.09));
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.17 : 0.1));
    osc.connect(gain).connect(this.out()!);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playHit(crit = false): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(crit ? 200 : 145, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.11);
    gain.gain.setValueAtTime(crit ? 0.23 : 0.17, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(this.out()!);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playParry(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [880, 1320].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      gain.gain.setValueAtTime(0.18, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain).connect(this.out()!);
      osc.start(now + idx * 0.03);
      osc.stop(now + 0.25);
    });
  }

  public playJump(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(this.out()!);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playPickup(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      gain.gain.setValueAtTime(0.11, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.14);
      osc.connect(gain).connect(this.out()!);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.15);
    });
  }
}
