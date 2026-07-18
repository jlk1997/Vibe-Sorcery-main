/** Canvas-agnostic mood-shift poster drawing (H5 + WeChat). */

export type MoodPosterInput = {
  title: string;
  before: number;
  after: number;
  beforeLabel: string;
  afterLabel: string;
  beforeTitle: string;
  afterTitle: string;
  brandName: string;
  deltaLabel: string;
};

type Ctx = {
  fillStyle: string | CanvasGradient;
  strokeStyle: string | CanvasGradient;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  stroke(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  measureText(text: string): { width: number };
};

function orbColor(value: number, kind: "before" | "after") {
  const t = (value - 1) / 8;
  const hue = kind === "before" ? 240 - t * 80 : 160 + t * 40;
  return `hsl(${hue}, 65%, 52%)`;
}

function wrapText(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  let dy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, dy);
      line = ch;
      dy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, dy);
}

export function drawMoodPoster(ctx: Ctx, input: MoodPosterInput, w = 600, h = 800, fontFamily = "sans-serif") {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0d0b14");
  grad.addColorStop(1, "#1a1428");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(212, 175, 55, 0.15)";
  ctx.beginPath();
  ctx.arc(w * 0.85, h * 0.12, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d4af37";
  ctx.font = `600 22px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.fillText(input.brandName, 40, 56);

  ctx.fillStyle = "#f5f0e8";
  ctx.font = `600 28px ${fontFamily}`;
  wrapText(ctx, input.title, 40, 100, w - 80, 34);

  const cy = 340;
  const drawOrb = (x: number, value: number, kind: "before" | "after", caption: string, mood: string) => {
    const r = 44 + value * 4;
    ctx.fillStyle = orbColor(value, kind);
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f0e8";
    ctx.font = `700 32px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText(String(value), x, cy + 12);
    ctx.font = `500 16px ${fontFamily}`;
    ctx.fillStyle = "#a89f8f";
    ctx.fillText(caption, x, cy + r + 28);
    ctx.fillStyle = "#e8e0d0";
    ctx.fillText(mood, x, cy + r + 52);
    ctx.textAlign = "left";
  };

  drawOrb(150, input.before, "before", input.beforeTitle, input.beforeLabel);
  drawOrb(450, input.after, "after", input.afterTitle, input.afterLabel);

  const delta = input.after - input.before;
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(230, cy);
  ctx.lineTo(370, cy);
  ctx.stroke();
  ctx.fillStyle = "#d4af37";
  ctx.font = `700 24px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.fillText(delta > 0 ? `+${delta}` : delta === 0 ? "±0" : String(delta), 300, cy - 20);
  ctx.fillStyle = "#a89f8f";
  ctx.font = `500 14px ${fontFamily}`;
  ctx.fillText(input.deltaLabel, 300, cy + 90);
  ctx.textAlign = "left";
}
