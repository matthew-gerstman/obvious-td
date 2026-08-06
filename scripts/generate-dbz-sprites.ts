import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ── PNG encoding (copied from generate-sprites.ts — no external deps) ──

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function createPNG(width: number, height: number, pixels: Uint8Array): Buffer {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowOffset + 1 + x * 4;
      rawData[dst] = pixels[src];
      rawData[dst + 1] = pixels[src + 1];
      rawData[dst + 2] = pixels[src + 2];
      rawData[dst + 3] = pixels[src + 3];
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel buffer (same Pix class as generate-sprites.ts) ──────────

class Pix {
  data: Uint8Array;
  constructor(public w: number, public h: number) {
    this.data = new Uint8Array(w * h * 4);
  }
  px(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, r, g, b, a);
  }
  circle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a = 255): void {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++)
      if (x * x + y * y <= rad * rad) this.px(cx + x, cy + y, r, g, b, a);
  }
  ring(cx: number, cy: number, rad: number, thick: number, r: number, g: number, b: number, a = 255): void {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= rad && d >= rad - thick) this.px(cx + x, cy + y, r, g, b, a);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      this.px(x, y, r, g, b, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  save(file: string): void {
    fs.writeFileSync(file, createPNG(this.w, this.h, this.data));
  }
}

// ── Color helpers ────────────────────────────────────────────────

function shade(hex: string, factor: number): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor)];
}

// ── DBZ Tower sprites (32x32) ────────────────────────────────────
// Original procedural pixel art inspired by Dragon Ball Z.
// Each tower has a unique silhouette — no shared stone-base pattern.

// Skin tone for humanoid figures
const SKIN: [number, number, number] = [212, 165, 116];
const SKIN_D: [number, number, number] = [170, 125, 80];
const HAIR: [number, number, number] = [30, 20, 10];

function genTower(file: string, color: string, design: string): void {
  const p = new Pix(32, 32);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.65);
  const [lr, lg, lb] = shade(color, 1.35);

  if (design === 'gatling') {
    // Ki Blast Turret — humanoid figure with arm raised, ki sphere at hand
    // Head
    p.circle(13, 9, 3, ...SKIN);
    p.px(13, 6, ...HAIR); p.px(11, 7, ...HAIR); p.px(15, 7, ...HAIR);
    p.px(10, 8, ...HAIR); p.px(12, 6, ...HAIR); p.px(14, 6, ...HAIR);
    // Eyes
    p.px(12, 9, 20, 20, 20); p.px(14, 9, 20, 20, 20);
    // Body/gi
    p.rect(10, 12, 7, 12, r, g, b);
    p.rect(10, 12, 7, 2, dr, dg, db);
    p.rect(10, 22, 7, 2, dr, dg, db);
    // Belt
    p.rect(10, 18, 7, 2, 40, 40, 40);
    // Arm raised forward
    p.line(13, 14, 22, 11, ...SKIN);
    p.line(14, 14, 23, 11, ...SKIN);
    // Other arm at side
    p.line(10, 14, 8, 20, ...SKIN);
    // Legs
    p.line(12, 24, 11, 30, ...SKIN_D);
    p.line(15, 24, 16, 30, ...SKIN_D);
    // Ki sphere at hand position
    p.circle(24, 10, 3, r, g, b);
    p.circle(24, 10, 2, lr, lg, lb);
    p.px(23, 9, 255, 255, 255);
    // Ki glow
    p.px(27, 10, lr, lg, lb, 180);
    p.px(24, 7, lr, lg, lb, 150);
    p.px(24, 13, lr, lg, lb, 150);

  } else if (design === 'cannon') {
    // Kamehameha Cannon — cupped hands forward with energy buildup
    // Head
    p.circle(16, 8, 3, ...SKIN);
    p.px(16, 5, ...HAIR); p.px(14, 6, ...HAIR); p.px(18, 6, ...HAIR);
    p.px(13, 7, ...HAIR); p.px(19, 7, ...HAIR);
    // Eyes (focused)
    p.px(15, 8, 20, 20, 20); p.px(17, 8, 20, 20, 20);
    // Body/gi
    p.rect(13, 11, 7, 12, r, g, b);
    p.rect(13, 11, 7, 2, dr, dg, db);
    p.rect(13, 21, 7, 2, dr, dg, db);
    // Belt
    p.rect(13, 17, 7, 2, 40, 40, 40);
    // Both arms forward — cupped hands
    p.line(14, 13, 21, 14, ...SKIN);
    p.line(18, 13, 23, 15, ...SKIN);
    // Cupped hands
    p.rect(21, 13, 3, 3, ...SKIN);
    p.rect(23, 14, 3, 3, ...SKIN);
    // Energy buildup between hands
    p.circle(25, 15, 3, r, g, b);
    p.circle(25, 15, 2, 255, 200, 100);
    p.px(25, 15, 255, 255, 255);
    // Radiating energy lines
    p.line(28, 15, 31, 15, lr, lg, lb, 200);
    p.line(25, 12, 27, 9, lr, lg, lb, 180);
    p.line(25, 18, 27, 21, lr, lg, lb, 180);
    // Legs
    p.line(14, 23, 13, 30, ...SKIN_D);
    p.line(18, 23, 19, 30, ...SKIN_D);

  } else if (design === 'frost') {
    // Solar Flare — brilliant sun/burst at center
    // Outer glow ring
    p.ring(16, 16, 13, 1, lr, lg, lb, 60);
    p.ring(16, 16, 11, 1, r, g, b, 100);
    // Radiating spikes (8 directions)
    p.line(16, 10, 16, 2, r, g, b);
    p.line(16, 22, 16, 30, r, g, b);
    p.line(10, 16, 2, 16, r, g, b);
    p.line(22, 16, 30, 16, r, g, b);
    p.line(12, 12, 5, 5, r, g, b);
    p.line(20, 12, 27, 5, r, g, b);
    p.line(12, 20, 5, 27, r, g, b);
    p.line(20, 20, 27, 27, r, g, b);
    // Brighter inner spikes
    p.line(16, 9, 16, 4, lr, lg, lb);
    p.line(16, 23, 16, 28, lr, lg, lb);
    p.line(9, 16, 4, 16, lr, lg, lb);
    p.line(23, 16, 28, 16, lr, lg, lb);
    // Central core
    p.circle(16, 16, 5, r, g, b);
    p.circle(16, 16, 3, 255, 255, 200);
    p.circle(16, 16, 2, 255, 255, 255);
    // Extra sparkle dots between spikes
    p.px(10, 10, lr, lg, lb, 200); p.px(22, 10, lr, lg, lb, 200);
    p.px(10, 22, lr, lg, lb, 200); p.px(22, 22, lr, lg, lb, 200);

  } else if (design === 'poison') {
    // Hellzone Grenade — multiple purple energy spheres in a ring
    // Central darker sphere
    p.circle(16, 16, 4, dr, dg, db);
    p.circle(16, 16, 3, r, g, b);
    p.px(15, 15, lr, lg, lb);
    // 6 spheres around at radius 9
    const positions: [number, number][] = [
      [16, 5], [25, 10], [25, 22], [16, 27], [7, 22], [7, 10],
    ];
    for (const [sx, sy] of positions) {
      p.circle(sx, sy, 3, r, g, b);
      p.circle(sx, sy, 2, lr, lg, lb);
      p.px(sx - 1, sy - 1, 240, 200, 255);
    }
    // Connecting energy lines from center to each sphere
    for (const [sx, sy] of positions) {
      p.line(16, 16, sx, sy, r, g, b, 80);
    }
    // Central highlight
    p.px(14, 14, 220, 180, 240);

  } else if (design === 'sniper') {
    // Special Beam Cannon — golden spiral beam with bright tip
    // Charge glow at base
    p.circle(6, 16, 3, r, g, b, 150);
    p.circle(6, 16, 2, lr, lg, lb, 200);
    p.px(6, 16, 255, 255, 200);
    // Spiral beam — draw spiral using line segments
    p.line(8, 16, 10, 14, r, g, b);
    p.line(10, 14, 12, 16, r, g, b);
    p.line(12, 16, 14, 18, r, g, b);
    p.line(14, 18, 16, 16, r, g, b);
    p.line(16, 16, 18, 14, r, g, b);
    p.line(18, 14, 20, 16, r, g, b);
    p.line(20, 16, 22, 18, r, g, b);
    p.line(22, 18, 24, 16, r, g, b);
    p.line(24, 16, 26, 14, r, g, b);
    // Brighter spiral overlay
    p.line(9, 15, 10, 14, lr, lg, lb);
    p.line(11, 15, 12, 16, lr, lg, lb);
    p.line(13, 17, 14, 18, lr, lg, lb);
    p.line(15, 17, 16, 16, lr, lg, lb);
    p.line(17, 15, 18, 14, lr, lg, lb);
    p.line(19, 15, 20, 16, lr, lg, lb);
    p.line(21, 17, 22, 18, lr, lg, lb);
    p.line(23, 17, 24, 16, lr, lg, lb);
    p.line(25, 15, 26, 14, lr, lg, lb);
    // Bright tip
    p.circle(27, 14, 2, 255, 255, 200);
    p.px(27, 14, 255, 255, 255);
    // Tip glow
    p.px(29, 14, lr, lg, lb, 180);
    p.px(27, 12, lr, lg, lb, 150);
    p.px(27, 16, lr, lg, lb, 150);

  } else if (design === 'aura') {
    // Kaioken Aura — central figure silhouette with radiating red energy
    // Outer aura rings
    p.ring(16, 14, 12, 1, r, g, b, 50);
    p.ring(16, 14, 10, 1, r, g, b, 80);
    p.ring(16, 14, 8, 2, r, g, b, 120);
    // Radiating energy lines
    p.line(16, 8, 16, 2, r, g, b, 180);
    p.line(22, 10, 27, 5, r, g, b, 160);
    p.line(24, 14, 30, 14, r, g, b, 180);
    p.line(22, 18, 27, 23, r, g, b, 160);
    p.line(16, 22, 16, 28, r, g, b, 180);
    p.line(10, 18, 5, 23, r, g, b, 160);
    p.line(8, 14, 2, 14, r, g, b, 180);
    p.line(10, 10, 5, 5, r, g, b, 160);
    // Brighter inner lines
    p.line(16, 7, 16, 3, lr, lg, lb, 200);
    p.line(23, 14, 29, 14, lr, lg, lb, 200);
    p.line(16, 21, 16, 27, lr, lg, lb, 200);
    p.line(9, 14, 3, 14, lr, lg, lb, 200);
    // Central figure silhouette
    p.circle(16, 9, 2, 20, 15, 15); // head
    p.rect(14, 11, 4, 10, 25, 15, 15); // body
    p.px(15, 8, 40, 20, 20); p.px(17, 8, 40, 20, 20); // eyes
    // Inner aura glow around figure
    p.ring(16, 14, 5, 1, lr, lg, lb, 100);

  } else if (design === 'economy') {
    // Capsule Corp Generator — capsule pod with dome top
    // Capsule body (cylinder)
    p.rect(9, 14, 14, 14, r, g, b);
    // Darker shading on sides
    p.rect(9, 14, 2, 14, dr, dg, db);
    p.rect(21, 14, 2, 14, dr, dg, db);
    // Dome top (half circle)
    p.circle(16, 14, 7, r, g, b);
    // Only keep top half of circle (clear bottom half)
    for (let x = 9; x < 23; x++) {
      for (let y = 14; y < 21; y++) {
        const dx = x - 16, dy = y - 14;
        if (dx * dx + dy * dy <= 49 && dy > 0) {
          // Restore body color where circle overlapped
          p.px(x, y, r, g, b);
        }
      }
    }
    // Dome highlight
    p.circle(14, 11, 2, lr, lg, lb);
    p.px(13, 10, 255, 255, 255, 180);
    // Seam line between dome and body
    p.line(9, 14, 22, 14, dr, dg, db);
    p.line(9, 15, 22, 15, dr, dg, db);
    // Window/viewport
    p.circle(16, 18, 2, 100, 200, 255);
    p.px(15, 17, 180, 230, 255);
    // Bottom plate
    p.rect(8, 27, 16, 3, dr, dg, db);
    // Legs
    p.rect(9, 30, 3, 2, dr, dg, db);
    p.rect(20, 30, 3, 2, dr, dg, db);
    // CC logo on body
    p.circle(16, 23, 2, 255, 255, 255);
    p.px(15, 23, 60, 180, 100); p.px(17, 23, 60, 180, 100);
    // Antenna on dome
    p.px(16, 5, 200, 200, 200);
    p.px(16, 4, 255, 60, 60);
    p.circle(16, 3, 1, 255, 80, 80, 200);
  }

  p.save(file);
}

// ── DBZ Enemy sprites (32x32) ────────────────────────────────────
// Original procedural pixel art inspired by Dragon Ball Z enemies.

function genEnemy(file: string, color: string, design: string): void {
  const p = new Pix(32, 32);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.6);
  const [lr, lg, lb] = shade(color, 1.3);

  if (design === 'runner') {
    // Saibaman — green humanoid with pointed head crest, snarling mouth, clawed limbs
    // Head crest (mohawk spike)
    p.px(16, 2, r, g, b);
    p.px(16, 3, r, g, b);
    p.px(15, 4, r, g, b); p.px(17, 4, r, g, b);
    p.px(16, 4, lr, lg, lb);
    // Head
    p.circle(16, 9, 5, r, g, b);
    p.circle(16, 9, 4, dr, dg, db);
    p.circle(16, 8, 4, r, g, b);
    // Eyes (red, menacing)
    p.px(13, 8, 255, 50, 50); p.px(19, 8, 255, 50, 50);
    p.px(13, 8, 180, 0, 0); p.px(19, 8, 180, 0, 0);
    // Wide snarling mouth
    p.rect(12, 11, 8, 3, 40, 20, 10);
    // Teeth (white triangles)
    p.px(13, 11, 255, 255, 240); p.px(15, 11, 255, 255, 240);
    p.px(17, 11, 255, 255, 240); p.px(19, 11, 255, 255, 240);
    p.px(14, 13, 255, 255, 240); p.px(16, 13, 255, 255, 240); p.px(18, 13, 255, 255, 240);
    // Stocky body
    p.rect(11, 15, 10, 9, r, g, b);
    p.rect(11, 15, 10, 2, dr, dg, db);
    // Chest detail
    p.rect(13, 17, 6, 4, dr, dg, db);
    p.px(16, 19, lr, lg, lb);
    // Arms with claws
    p.line(11, 17, 7, 21, r, g, b);
    p.line(21, 17, 25, 21, r, g, b);
    // Claws
    p.px(6, 21, 240, 240, 220); p.px(7, 22, 240, 240, 220); p.px(5, 22, 240, 240, 220);
    p.px(26, 21, 240, 240, 220); p.px(25, 22, 240, 240, 220); p.px(27, 22, 240, 240, 220);
    // Legs
    p.line(13, 24, 11, 30, dr, dg, db);
    p.line(19, 24, 21, 30, dr, dg, db);
    // Foot claws
    p.px(10, 30, 240, 240, 220); p.px(12, 30, 240, 240, 220);
    p.px(20, 30, 240, 240, 220); p.px(22, 30, 240, 240, 220);

  } else if (design === 'grunt') {
    // Frieza Soldier — armored soldier with breastplate, shoulder pads, scouter
    // Head
    p.circle(16, 8, 3, 200, 200, 210);
    p.px(14, 6, 180, 180, 190); p.px(18, 6, 180, 180, 190);
    // Eyes
    p.px(14, 8, 180, 20, 20); p.px(17, 8, 180, 20, 20);
    // Scouter (green/cyan lens over right eye)
    p.circle(18, 8, 2, 0, 220, 160);
    p.px(18, 8, 100, 255, 200);
    p.px(19, 8, 0, 200, 140, 200);
    // Scouter strap
    p.line(19, 8, 13, 7, 60, 60, 70);
    // Breastplate
    p.rect(11, 11, 10, 10, r, g, b);
    p.rect(11, 11, 10, 2, dr, dg, db);
    p.rect(11, 19, 10, 2, dr, dg, db);
    // Shoulder pads
    p.rect(8, 11, 4, 4, lr, lg, lb);
    p.rect(20, 11, 4, 4, lr, lg, lb);
    p.rect(8, 11, 4, 1, 255, 255, 255, 100);
    p.rect(20, 11, 4, 1, 255, 255, 255, 100);
    // Chest plate detail
    p.rect(13, 14, 6, 5, dr, dg, db);
    p.px(16, 16, lr, lg, lb);
    // Tail
    p.line(21, 18, 27, 20, 150, 150, 160);
    p.line(27, 20, 29, 24, 150, 150, 160);
    // Legs
    p.rect(12, 21, 3, 8, r, g, b);
    p.rect(17, 21, 3, 8, r, g, b);
    p.rect(12, 21, 3, 1, dr, dg, db);
    p.rect(17, 21, 3, 1, dr, dg, db);
    // Boots
    p.rect(11, 28, 5, 2, 40, 40, 50);
    p.rect(16, 28, 5, 2, 40, 40, 50);

  } else if (design === 'armored') {
    // Android — metallic humanoid with mechanical joints, Red Ribbon insignia
    // Head (metallic)
    p.rect(13, 5, 6, 7, r, g, b);
    p.rect(13, 5, 6, 1, lr, lg, lb);
    p.rect(13, 11, 6, 1, dr, dg, db);
    // Antenna
    p.px(16, 3, 180, 180, 190); p.px(16, 4, 180, 180, 190);
    p.px(16, 2, 255, 40, 40);
    // Glowing eyes
    p.px(14, 8, 255, 0, 0); p.px(18, 8, 255, 0, 0);
    p.px(14, 8, 255, 100, 100, 180); p.px(18, 8, 255, 100, 100, 180);
    // Neck joint
    p.rect(15, 12, 2, 2, dr, dg, db);
    // Torso
    p.rect(11, 14, 10, 9, r, g, b);
    p.rect(11, 14, 10, 1, lr, lg, lb);
    // Red Ribbon Army insignia
    p.rect(14, 16, 4, 4, 200, 20, 20);
    p.px(15, 17, 255, 255, 255); p.px(17, 17, 255, 255, 255);
    p.px(16, 18, 255, 255, 255);
    // Mechanical joint lines
    p.line(11, 17, 8, 17, dr, dg, db);
    p.line(21, 17, 24, 17, dr, dg, db);
    p.rect(8, 15, 3, 5, dr, dg, db);
    p.rect(21, 15, 3, 5, dr, dg, db);
    // Elbow joints
    p.px(9, 17, 100, 255, 255); p.px(22, 17, 100, 255, 255);
    // Legs
    p.rect(12, 23, 3, 7, r, g, b);
    p.rect(17, 23, 3, 7, r, g, b);
    // Knee joints
    p.line(12, 26, 15, 26, dr, dg, db);
    p.line(17, 26, 20, 26, dr, dg, db);
    p.px(13, 26, 100, 255, 255); p.px(18, 26, 100, 255, 255);
    // Feet
    p.rect(11, 30, 5, 2, dr, dg, db);
    p.rect(16, 30, 5, 2, dr, dg, db);

  } else if (design === 'flyer') {
    // Flying Saibaman — same design as runner but with bat-like wings
    // Head crest
    p.px(16, 4, r, g, b);
    p.px(16, 5, r, g, b);
    p.px(15, 6, r, g, b); p.px(17, 6, r, g, b);
    // Head (smaller, in flying posture)
    p.circle(16, 10, 4, r, g, b);
    p.circle(16, 10, 3, dr, dg, db);
    p.circle(16, 9, 3, r, g, b);
    // Eyes
    p.px(14, 9, 255, 50, 50); p.px(18, 9, 255, 50, 50);
    // Mouth
    p.rect(13, 12, 6, 2, 40, 20, 10);
    p.px(14, 12, 255, 255, 240); p.px(16, 12, 255, 255, 240); p.px(18, 12, 255, 255, 240);
    // Body (compact, flying posture)
    p.rect(13, 15, 6, 8, r, g, b);
    p.rect(13, 15, 6, 2, dr, dg, db);
    // Wings (bat-like, spread on both sides)
    // Left wing
    p.line(13, 16, 4, 12, dr, dg, db);
    p.line(13, 18, 3, 18, dr, dg, db);
    p.line(13, 20, 5, 24, dr, dg, db);
    p.line(4, 12, 3, 18, r, g, b, 180);
    p.line(3, 18, 5, 24, r, g, b, 180);
    // Wing membrane fill
    p.line(6, 14, 5, 17, r, g, b, 120);
    p.line(7, 16, 6, 19, r, g, b, 100);
    p.line(5, 20, 7, 22, r, g, b, 120);
    // Right wing
    p.line(19, 16, 28, 12, dr, dg, db);
    p.line(19, 18, 29, 18, dr, dg, db);
    p.line(19, 20, 27, 24, dr, dg, db);
    p.line(28, 12, 29, 18, r, g, b, 180);
    p.line(29, 18, 27, 24, r, g, b, 180);
    // Wing membrane fill
    p.line(26, 14, 27, 17, r, g, b, 120);
    p.line(25, 16, 26, 19, r, g, b, 100);
    p.line(27, 20, 25, 22, r, g, b, 120);
    // Wing tips (claw-like)
    p.px(3, 11, 240, 240, 220); p.px(29, 11, 240, 240, 220);
    // Legs tucked
    p.line(14, 23, 13, 27, dr, dg, db);
    p.line(18, 23, 19, 27, dr, dg, db);

  } else if (design === 'swarm') {
    // Cell Junior — small round purple creature with head crest, spots, face
    // Head crest (pointed cone)
    p.px(16, 3, r, g, b);
    p.px(16, 4, r, g, b);
    p.px(15, 5, r, g, b); p.px(17, 5, r, g, b);
    p.px(16, 5, lr, lg, lb);
    // Body (round-ish)
    p.circle(16, 16, 9, r, g, b);
    p.circle(16, 16, 7, dr, dg, db);
    p.circle(16, 15, 7, r, g, b);
    // Dark spots on body
    p.px(11, 13, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(21, 13, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(13, 20, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(19, 20, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(16, 11, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(10, 17, dr[0] - 20, dg[0] - 20, db[0] - 20);
    p.px(22, 17, dr[0] - 20, dg[0] - 20, db[0] - 20);
    // Face — eyes
    p.circle(13, 15, 1, 255, 255, 255);
    p.circle(19, 15, 1, 255, 255, 255);
    p.px(13, 15, 20, 20, 20); p.px(19, 15, 20, 20, 20);
    // Mouth
    p.rect(14, 18, 4, 2, 30, 10, 20);
    p.px(15, 18, 255, 255, 240); p.px(17, 18, 255, 255, 240);
    // Small wings on back
    p.line(8, 14, 4, 11, dr, dg, db);
    p.line(24, 14, 28, 11, dr, dg, db);
    p.line(4, 11, 5, 15, dr, dg, db, 150);
    p.line(28, 11, 27, 15, dr, dg, db, 150);
    // Tail
    p.line(16, 25, 16, 29, dr, dg, db);
    p.px(16, 29, lr, lg, lb);

  } else if (design === 'boss') {
    // Demon King — large imposing figure with horns, glowing eyes, energy aura
    // Energy aura (outer)
    p.ring(16, 16, 14, 1, 120, 30, 60, 60);
    p.ring(16, 16, 12, 1, 150, 40, 80, 80);
    // Horns (curving upward)
    p.line(8, 8, 5, 4, dr, dg, db);
    p.line(5, 4, 3, 1, dr, dg, db);
    p.line(6, 5, 4, 2, lr[0] - 20, lg[0] - 20, lb[0] - 20);
    p.line(24, 8, 27, 4, dr, dg, db);
    p.line(27, 4, 29, 1, dr, dg, db);
    p.line(26, 5, 28, 2, lr[0] - 20, lg[0] - 20, lb[0] - 20);
    // Horn highlights
    p.px(4, 3, 80, 50, 90); p.px(28, 3, 80, 50, 90);
    // Body (fills most of sprite)
    p.rect(7, 7, 18, 23, r, g, b);
    // Dark armor bands
    p.rect(7, 11, 18, 2, dr, dg, db);
    p.rect(7, 19, 18, 2, dr, dg, db);
    p.rect(7, 25, 18, 2, dr, dg, db);
    // Side shading
    p.rect(7, 7, 2, 23, dr, dg, db);
    p.rect(23, 7, 2, 23, dr, dg, db);
    // Glowing eyes (bright red with glow)
    p.px(12, 14, 255, 60, 60); p.px(20, 14, 255, 60, 60);
    p.px(12, 14, 255, 120, 120, 200); p.px(20, 14, 255, 120, 120, 200);
    p.px(11, 13, 255, 40, 40, 100); p.px(21, 13, 255, 40, 40, 100);
    p.px(13, 15, 255, 40, 40, 100); p.px(19, 15, 255, 40, 40, 100);
    // Mouth with fangs
    p.rect(12, 17, 8, 3, 20, 5, 10);
    p.px(13, 17, 255, 240, 220); p.px(15, 17, 255, 240, 220);
    p.px(17, 17, 255, 240, 220); p.px(19, 17, 255, 240, 220);
    // Chest emblem (dark energy core)
    p.circle(16, 22, 3, 100, 20, 40);
    p.circle(16, 22, 2, 180, 40, 60);
    p.px(16, 22, 255, 100, 80);
    // Energy radiating from body
    p.line(7, 16, 3, 16, 150, 40, 80, 150);
    p.line(25, 16, 29, 16, 150, 40, 80, 150);
    p.line(7, 22, 3, 24, 150, 40, 80, 120);
    p.line(25, 22, 29, 24, 150, 40, 80, 120);
    // Shoulder spikes
    p.line(7, 9, 4, 7, dr, dg, db);
    p.line(25, 9, 28, 7, dr, dg, db);
  }

  p.save(file);
}

// ── DBZ Projectile sprites (8x8) ─────────────────────────────────

function genProjectile(file: string, color: string, design: string): void {
  const p = new Pix(8, 8);
  const [r, g, b] = shade(color, 1);
  const [lr, lg, lb] = shade(color, 1.4);

  if (design === 'gatling') {
    // Ki bolt — bright blue sphere with white core and trail
    p.circle(5, 4, 2, r, g, b);
    p.px(5, 4, lr, lg, lb);
    p.px(4, 3, 255, 255, 255);
    // Trail
    p.px(2, 4, r, g, b, 150);
    p.px(1, 4, r, g, b, 80);
    p.px(3, 3, r, g, b, 100);
    p.px(3, 5, r, g, b, 100);

  } else if (design === 'cannon') {
    // Energy wave — spread orange beam with bright center
    p.rect(0, 2, 8, 4, r, g, b);
    p.rect(1, 1, 6, 6, r, g, b, 180);
    p.rect(2, 3, 4, 2, lr, lg, lb);
    p.px(3, 3, 255, 255, 200);
    p.px(5, 3, 255, 255, 200);
    p.px(4, 4, 255, 255, 255);
    // Edge glow
    p.px(0, 3, lr, lg, lb, 150);
    p.px(7, 3, lr, lg, lb, 150);

  } else if (design === 'frost') {
    // Solar flare spark — radiating yellow star
    p.circle(4, 4, 2, r, g, b);
    p.line(4, 0, 4, 7, lr, lg, lb);
    p.line(0, 4, 7, 4, lr, lg, lb);
    p.line(1, 1, 6, 6, lr, lg, lb, 180);
    p.line(6, 1, 1, 6, lr, lg, lb, 180);
    p.px(4, 4, 255, 255, 255);
    p.px(4, 1, 255, 255, 200);
    p.px(4, 6, 255, 255, 200);
    p.px(1, 4, 255, 255, 200);
    p.px(6, 4, 255, 255, 200);

  } else if (design === 'poison') {
    // Energy sphere — purple orb with swirl
    p.circle(4, 4, 3, r, g, b);
    p.px(3, 3, lr, lg, lb);
    p.px(5, 4, lr, lg, lb);
    p.px(4, 5, lr, lg, lb);
    p.px(3, 3, 255, 200, 255);
    // Swirl dots
    p.px(2, 4, lr, lg, lb, 180);
    p.px(6, 3, lr, lg, lb, 150);
    p.px(5, 6, lr, lg, lb, 120);

  } else if (design === 'sniper') {
    // Spiral beam — golden spiral with bright tip
    p.px(1, 4, r, g, b);
    p.px(2, 3, r, g, b);
    p.px(3, 4, lr, lg, lb);
    p.px(4, 5, r, g, b);
    p.px(5, 4, lr, lg, lb);
    p.px(6, 3, r, g, b);
    p.px(6, 2, 255, 255, 200);
    p.px(7, 2, 255, 255, 255);
    // Glow
    p.px(0, 4, r, g, b, 150);
    p.px(7, 3, lr, lg, lb, 180);
  }

  p.save(file);
}

// ── DBZ Path tiles (32x32) — Snake Way style ────────────────────
// Organic yellow road with cloud-like white edges and decorative sparkles.

function genPathTile(file: string, type: string): void {
  const p = new Pix(32, 32);
  const road: [number, number, number] = [255, 200, 30];
  const roadD: [number, number, number] = [220, 170, 10];
  const roadL: [number, number, number] = [255, 220, 80];
  const cloud: [number, number, number] = [255, 255, 255];
  const cloudD: [number, number, number] = [210, 210, 225];
  const sparkle: [number, number, number] = [255, 240, 150];

  // Draw an organic road segment — slightly curved, not a flat rectangle
  // Then add cloud-like irregular edges and decorative elements

  if (type === 'h') {
    // Horizontal road — slight curve
    for (let x = 0; x < 32; x++) {
      // Subtle wave: offset varies with x
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      const top = 10 + offsetY;
      const bot = 22 + offsetY;
      p.rect(x, top, 1, bot - top, ...road);
      // Gradient: lighter in center
      p.px(x, top + 1, ...roadL);
      p.px(x, top + 2, ...roadL);
      // Darker edges
      p.px(x, top, ...roadD);
      p.px(x, bot - 1, ...roadD);
    }
    // Cloud edges — irregular white shapes
    for (let x = 0; x < 32; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      const top = 10 + offsetY;
      const bot = 22 + offsetY;
      // Top cloud edge — irregular bumps
      p.circle(x, top - 2, 2, ...cloud);
      if (x % 4 === 0) p.px(x, top - 4, ...cloud);
      // Bottom cloud edge
      p.circle(x, bot + 1, 2, ...cloud);
      if (x % 3 === 0) p.px(x, bot + 3, ...cloud);
    }
    // Cloud shadows
    for (let x = 1; x < 31; x += 3) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.px(x, 10 + offsetY - 1, ...cloudD);
      p.px(x, 22 + offsetY + 2, ...cloudD);
    }
    // Decorative sparkles along edges
    p.px(6, 7, ...sparkle); p.px(18, 6, ...sparkle);
    p.px(26, 25, ...sparkle); p.px(12, 26, ...sparkle);
    // Road texture dots
    p.px(8, 15, ...roadD, 180); p.px(20, 17, ...roadD, 180);
    p.px(14, 14, ...roadL, 150); p.px(24, 16, ...roadL, 150);

  } else if (type === 'v') {
    // Vertical road — slight curve
    for (let y = 0; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      const left = 10 + offsetX;
      const right = 22 + offsetX;
      p.rect(left, y, right - left, 1, ...road);
      p.px(left + 1, y, ...roadL);
      p.px(left + 2, y, ...roadL);
      p.px(left, y, ...roadD);
      p.px(right - 1, y, ...roadD);
    }
    // Cloud edges
    for (let y = 0; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      const left = 10 + offsetX;
      const right = 22 + offsetX;
      p.circle(left - 2, y, 2, ...cloud);
      if (y % 4 === 0) p.px(left - 4, y, ...cloud);
      p.circle(right + 1, y, 2, ...cloud);
      if (y % 3 === 0) p.px(right + 3, y, ...cloud);
    }
    // Cloud shadows
    for (let y = 1; y < 31; y += 3) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.px(10 + offsetX - 1, y, ...cloudD);
      p.px(22 + offsetX + 2, y, ...cloudD);
    }
    // Sparkles
    p.px(7, 6, ...sparkle); p.px(6, 18, ...sparkle);
    p.px(25, 26, ...sparkle); p.px(26, 12, ...sparkle);
    // Road texture
    p.px(15, 8, ...roadD, 180); p.px(17, 20, ...roadD, 180);
    p.px(14, 14, ...roadL, 150); p.px(16, 24, ...roadL, 150);

  } else if (type === 'corner_ne') {
    // Corner: north + east
    for (let y = 0; y < 16; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.rect(10 + offsetX, y, 12, 1, ...road);
      p.px(10 + offsetX, y, ...roadD);
      p.px(21 + offsetX, y, ...roadD);
    }
    for (let x = 16; x < 32; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.rect(x, 10 + offsetY, 1, 12, ...road);
      p.px(x, 10 + offsetY, ...roadD);
      p.px(x, 21 + offsetY, ...roadD);
    }
    // Cloud edges
    for (let y = 0; y < 16; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.circle(8 + offsetX, y, 2, ...cloud);
    }
    for (let x = 16; x < 32; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.circle(x, 8 + offsetY, 2, ...cloud);
    }
    // Sparkles
    p.px(7, 4, ...sparkle); p.px(26, 7, ...sparkle);

  } else if (type === 'corner_nw') {
    // Corner: north + west
    for (let y = 0; y < 16; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.rect(10 + offsetX, y, 12, 1, ...road);
      p.px(10 + offsetX, y, ...roadD);
      p.px(21 + offsetX, y, ...roadD);
    }
    for (let x = 0; x < 16; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.rect(x, 10 + offsetY, 1, 12, ...road);
      p.px(x, 10 + offsetY, ...roadD);
      p.px(x, 21 + offsetY, ...roadD);
    }
    // Cloud edges
    for (let y = 0; y < 16; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.circle(23 + offsetX, y, 2, ...cloud);
    }
    for (let x = 0; x < 16; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.circle(x, 8 + offsetY, 2, ...cloud);
    }
    // Sparkles
    p.px(25, 4, ...sparkle); p.px(5, 7, ...sparkle);

  } else if (type === 'corner_se') {
    // Corner: south + east
    for (let y = 16; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.rect(10 + offsetX, y, 12, 1, ...road);
      p.px(10 + offsetX, y, ...roadD);
      p.px(21 + offsetX, y, ...roadD);
    }
    for (let x = 16; x < 32; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.rect(x, 10 + offsetY, 1, 12, ...road);
      p.px(x, 10 + offsetY, ...roadD);
      p.px(x, 21 + offsetY, ...roadD);
    }
    // Cloud edges
    for (let y = 16; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.circle(8 + offsetX, y, 2, ...cloud);
    }
    for (let x = 16; x < 32; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.circle(x, 23 + offsetY, 2, ...cloud);
    }
    // Sparkles
    p.px(7, 28, ...sparkle); p.px(26, 25, ...sparkle);

  } else if (type === 'corner_sw') {
    // Corner: south + west
    for (let y = 16; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.rect(10 + offsetX, y, 12, 1, ...road);
      p.px(10 + offsetX, y, ...roadD);
      p.px(21 + offsetX, y, ...roadD);
    }
    for (let x = 0; x < 16; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.rect(x, 10 + offsetY, 1, 12, ...road);
      p.px(x, 10 + offsetY, ...roadD);
      p.px(x, 21 + offsetY, ...roadD);
    }
    // Cloud edges
    for (let y = 16; y < 32; y++) {
      const offsetX = Math.round(Math.sin(y * 0.2) * 1);
      p.circle(23 + offsetX, y, 2, ...cloud);
    }
    for (let x = 0; x < 16; x++) {
      const offsetY = Math.round(Math.sin(x * 0.2) * 1);
      p.circle(x, 23 + offsetY, 2, ...cloud);
    }
    // Sparkles
    p.px(25, 28, ...sparkle); p.px(5, 25, ...sparkle);
  }

  p.save(file);
}

// ── Main ─────────────────────────────────────────────────────────

const OUT = path.join(process.cwd(), 'public', 'sprites', 'dragon-ball');
fs.mkdirSync(OUT, { recursive: true });

// Tower colors from the DBZ theme
genTower(path.join(OUT, 'gatling.png'), '#4a90d9', 'gatling');
genTower(path.join(OUT, 'cannon.png'), '#ff6600', 'cannon');
genTower(path.join(OUT, 'frost.png'), '#ffeb3b', 'frost');
genTower(path.join(OUT, 'poison.png'), '#9b59b6', 'poison');
genTower(path.join(OUT, 'sniper.png'), '#ffcc00', 'sniper');
genTower(path.join(OUT, 'aura.png'), '#ff3333', 'aura');
genTower(path.join(OUT, 'economy.png'), '#4ad97a', 'economy');

// Enemy colors
genEnemy(path.join(OUT, 'runner.png'), '#5cb85c', 'runner');
genEnemy(path.join(OUT, 'grunt.png'), '#a0a0b0', 'grunt');
genEnemy(path.join(OUT, 'armored.png'), '#707080', 'armored');
genEnemy(path.join(OUT, 'flyer.png'), '#5cb85c', 'flyer');
genEnemy(path.join(OUT, 'swarm.png'), '#8e44ad', 'swarm');
genEnemy(path.join(OUT, 'boss.png'), '#2a1a3a', 'boss');

// Projectiles
genProjectile(path.join(OUT, 'gatling_projectile.png'), '#4a90d9', 'gatling');
genProjectile(path.join(OUT, 'cannon_projectile.png'), '#ff6600', 'cannon');
genProjectile(path.join(OUT, 'frost_projectile.png'), '#ffeb3b', 'frost');
genProjectile(path.join(OUT, 'poison_projectile.png'), '#9b59b6', 'poison');
genProjectile(path.join(OUT, 'sniper_projectile.png'), '#ffcc00', 'sniper');

// Path tiles — Snake Way style
genPathTile(path.join(OUT, 'path_tile_h.png'), 'h');
genPathTile(path.join(OUT, 'path_tile_v.png'), 'v');
genPathTile(path.join(OUT, 'path_tile_corner_ne.png'), 'corner_ne');
genPathTile(path.join(OUT, 'path_tile_corner_nw.png'), 'corner_nw');
genPathTile(path.join(OUT, 'path_tile_corner_se.png'), 'corner_se');
genPathTile(path.join(OUT, 'path_tile_corner_sw.png'), 'corner_sw');

console.log('DBZ sprites generated to', OUT);
