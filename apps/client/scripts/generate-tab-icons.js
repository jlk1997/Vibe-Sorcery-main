/**
 * Generates minimal 81x81 PNG tab icons for WeChat tabBar (recommended 81px).
 * Run: node scripts/generate-tab-icons.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b, a] = draw(x, y, size);
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

function circle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function line(x, y, x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const t = ((x - x1) * dx + (y - y1) * dy) / (len * len);
  const cl = Math.max(0, Math.min(1, t));
  const px = x1 + cl * dx;
  const py = y1 + cl * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= w * w;
}

function drawIcon(kind, active) {
  const color = active ? [20, 184, 166] : [136, 136, 170];
  return (x, y, size) => {
    const s = size / 81;
    const cx = size / 2;
    const cy = size / 2;
    let on = false;
    if (kind === "journey") {
      on = line(x, y, 20 * s, 58 * s, 40 * s, 28 * s, 3 * s) || line(x, y, 40 * s, 28 * s, 61 * s, 22 * s, 3 * s);
    } else if (kind === "feed") {
      on = circle(x, y, cx, cy, 22 * s) && !circle(x, y, cx, cy, 10 * s);
    } else if (kind === "create") {
      on = line(x, y, cx, 18 * s, cx, 63 * s, 3 * s) || line(x, y, 28 * s, cy, 53 * s, cy, 3 * s);
    } else if (kind === "profile") {
      on = circle(x, y, cx, 28 * s, 10 * s) || circle(x, y, cx, cy + 8 * s, 18 * s);
    }
    if (on) return [...color, 255];
    return [0, 0, 0, 0];
  };
}

const outDir = path.join(__dirname, "../src/assets/tab");
fs.mkdirSync(outDir, { recursive: true });

const icons = ["journey", "feed", "create", "profile"];
for (const name of icons) {
  fs.writeFileSync(path.join(outDir, `${name}.png`), createPng(81, drawIcon(name, false)));
  fs.writeFileSync(path.join(outDir, `${name}-active.png`), createPng(81, drawIcon(name, true)));
}
console.log("Tab icons written to", outDir);
