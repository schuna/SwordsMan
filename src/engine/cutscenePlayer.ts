import { EndingDef } from '../systems/types.js';

export interface CutsceneFrame {
  title: string;
  subtitle: string;
  accent: string;
  durationMs: number;
}

const OPENING_FRAMES: CutsceneFrame[] = [
  {
    title: '청운강호전 (靑雲江湖傳)',
    subtitle: '1993 무협 액션 RPG의 서막을 현대 경량 2D 엔진으로 재구성하다',
    accent: '#fbbf24',
    durationMs: 2600,
  },
  {
    title: '비급을 둘러싼 강호의 암투',
    subtitle: '사라진 고금제일 검보를 찾아 12대 관문을 돌파하라',
    accent: '#38bdf8',
    durationMs: 2600,
  },
  {
    title: '청운산문(靑雲山門)',
    subtitle: '제자 임청운의 검이 지금 깨어난다',
    accent: '#f87171',
    durationMs: 2400,
  },
];

export class CutscenePlayer {
  private active = false;
  private frames: CutsceneFrame[] = [];
  private index = 0;
  private elapsedMs = 0;
  private onComplete: (() => void) | null = null;

  public isActive(): boolean {
    return this.active;
  }

  public playOpening(onComplete?: () => void): void {
    this.frames = OPENING_FRAMES;
    this.index = 0;
    this.elapsedMs = 0;
    this.active = true;
    this.onComplete = onComplete ?? null;
  }

  public playEnding(ending: EndingDef, onComplete?: () => void): void {
    this.frames = ending.lines.map((line, i) => ({
      title: i === 0 ? ending.title : ending.subtitle,
      subtitle: line,
      accent: ending.accentColor,
      durationMs: 3200,
    }));
    this.index = 0;
    this.elapsedMs = 0;
    this.active = true;
    this.onComplete = onComplete ?? null;
  }

  public skip(): void {
    if (!this.active) return;
    this.active = false;
    const cb = this.onComplete;
    this.onComplete = null;
    if (cb) cb();
  }

  public update(dtMs: number): void {
    if (!this.active || this.frames.length === 0) return;
    this.elapsedMs += dtMs;
    const cur = this.frames[this.index];
    if (this.elapsedMs >= cur.durationMs) {
      this.elapsedMs = 0;
      this.index += 1;
      if (this.index >= this.frames.length) {
        this.skip();
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, w: number, h: number, timeSec: number): void {
    if (!this.active || this.frames.length === 0) return;
    const cur = this.frames[Math.min(this.index, this.frames.length - 1)];

    // 밤하늘 그라데이션
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#070b14');
    grad.addColorStop(0.65, '#131d33');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 달빛 & 산맥 실루엣
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.24, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.lineTo(w * 0.22, h * 0.48);
    ctx.lineTo(w * 0.45, h * 0.64);
    ctx.lineTo(w * 0.68, h * 0.42);
    ctx.lineTo(w, h * 0.68);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 흩날리는 매화 / 검기 파티클
    ctx.fillStyle = cur.accent;
    for (let i = 0; i < 18; i += 1) {
      const px = ((i * 73 + timeSec * 48) % (w + 40)) - 20;
      const py = ((i * 41 + Math.sin(timeSec * 2 + i) * 18 + timeSec * 22) % (h * 0.75));
      ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
    }

    // VGA 16:10 레터박스
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, 42);
    ctx.fillRect(0, h - 56, w, 56);

    ctx.textAlign = 'center';
    ctx.fillStyle = cur.accent;
    ctx.font = 'bold 26px "Malgun Gothic", sans-serif';
    ctx.fillText(cur.title, w / 2, h * 0.44);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '15px "Malgun Gothic", sans-serif';
    ctx.fillText(cur.subtitle, w / 2, h * 0.54);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "Malgun Gothic", sans-serif';
    ctx.fillText(`(${this.index + 1}/${this.frames.length})  Space / Esc 또는 건너뛰기 버튼으로 생략`, w / 2, h - 22);
  }
}
