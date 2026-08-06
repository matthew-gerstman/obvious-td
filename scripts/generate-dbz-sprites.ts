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
// Each tower has a stone base and a themed turret body.

function genTower(file: string, color: string, design: string): void {
  const p = new Pix(32, 32);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.7);
  const [lr, lg, lb] = shade(color, 1.3);
  const stone: [number, number, number] = [70, 70, 80];
  const stoneD: [number, number, number] = [45, 45, 55];

  // Stone base
  p.rect(4, 22, 24, 10, ...stone);
  p.rect(4, 22, 24, 2, ...stoneD);
  p.rect(4, 30, 24, 2, ...stoneD);

  // Turret body
  p.rect(8, 6, 16, 16, r, g, b);
  p.rect(8, 6, 16, 2, dr, dg, db);
  p.rect(8, 20, 16, 2, dr, dg, db);
  p.rect(8, 6, 2, 16, dr, dg, db);
  p.rect(22, 6, 2, 16, lr, lg, lb);

  if (design === 'gatling') {
    // Ki Blast Turret — multiple small ki emitters
    p.rect(24, 8, 6, 2, dr, dg, db);
    p.rect(24, 13, 6, 2, dr, dg, db);
    p.rect(24, 18, 6, 2, dr, dg, db);
    // Ki glow at barrel tips
    p.px(30, 9, 100, 180, 255);
    p.px(30, 14, 100, 180, 255);
    p.px(30, 19, 100, 180, 255);
  } else if (design === 'cannon') {
    // Kamehameha Cannon — wide energy wave barrel
    p.rect(24, 9, 8, 10, dr, dg, db);
    p.rect(30, 11, 2, 6, stoneD[0], stoneD[1], stoneD[2]);
    // Energy glow inside barrel
    p.rect(26, 11, 4, 6, 255, 180, 80, 200);
  } else if (design === 'frost') {
    // Solar Flare — radiating light crystal
    p.line(16, 0, 12, 6, lr, lg, lb);
    p.line(16, 0, 20, 6, lr, lg, lb);
    p.line(12, 4, 8, 8, 255, 255, 200);
    p.line(20, 4, 24, 8, 255, 255, 200);
    p.px(16, 2, 255, 255, 255);
    p.px(14, 4, 255, 255, 200);
    p.px(18, 4, 255, 255, 200);
    // Radiating dots
    p.px(10, 10, 255, 255, 100, 180);
    p.px(22, 10, 255, 255, 100, 180);
  } else if (design === 'poison') {
    // Hellzone Grenade — energy sphere cluster
    p.circle(13, 4, 2, lr, lg, lb);
    p.circle(19, 4, 2, lr, lg, lb);
    p.circle(16, 6, 2, 180, 100, 220);
    p.px(13, 3, 220, 150, 255);
    p.px(19, 3, 220, 150, 255);
  } else if (design === 'sniper') {
    // Special Beam Cannon — long thin barrel
    p.rect(24, 14, 8, 4, dr, dg, db);
    p.rect(30, 15, 2, 2, stoneD[0], stoneD[1], stoneD[2]);
    // Spiral beam charge at tip
    p.px(31, 16, 255, 220, 50);
    p.px(30, 14, 255, 200, 30, 200);
    p.px(30, 18, 255, 200, 30, 200);
  } else if (design === 'aura') {
    // Kaioken Aura — pulsing red aura rings
    p.ring(16, 10, 5, 2, lr, lg, lb, 200);
    p.ring(16, 10, 7, 1, 255, 80, 80, 120);
    p.ring(16, 10, 9, 1, 255, 50, 50, 60);
    p.px(16, 10, 255, 100, 100);
  } else if (design === 'economy') {
    // Capsule Corp Generator — capsule device with Zeni symbol
    p.circle(16, 5, 3, 80, 220, 120);
    p.circle(16, 5, 2, 120, 255, 160);
    p.px(16, 4, 255, 255, 255);
    p.px(16, 6, 60, 180, 100);
    // Capsule Corp logo hint (two dots)
    p.px(14, 5, 255, 255, 255);
    p.px(18, 5, 255, 255, 255);
  }

  // Texture noise
  for (let i = 0; i < 8; i++) {
    const nx = 10 + Math.floor(Math.random() * 12);
    const ny = 8 + Math.floor(Math.random() * 12);
    p.px(nx, ny, lr, lg, lb, 180);
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
    // Saibaman — small green humanoid with pointed head
    for (let y = 0; y < 14; y++) {
      const w = 10 - Math.floor(y * 0.3);
      p.rect(16 - Math.floor(w / 2), 8 + y, w, 1, r, g, b);
    }
    // Pointed head
    p.px(16, 6, r, g, b);
    p.px(15, 7, r, g, b);
    p.px(17, 7, r, g, b);
    // Legs
    p.line(14, 22, 12, 28, dr, dg, db);
    p.line(18, 22, 20, 28, dr, dg, db);
    // Eyes
    p.px(14, 14, 255, 255, 255);
    p.px(18, 14, 255, 255, 255);
    p.px(14, 15, 0, 0, 0);
    p.px(18, 15, 0, 0, 0);
    // Mouth
    p.px(16, 18, dr, dg, db);
  } else if (design === 'grunt') {
    // Frieza Soldier — armored soldier
    p.rect(8, 8, 16, 16, r, g, b);
    // Armor plates
    p.rect(8, 8, 16, 2, dr, dg, db);
    p.rect(8, 14, 16, 2, dr, dg, db);
    p.rect(8, 20, 16, 2, dr, dg, db);
    // Shoulder pads
    p.rect(6, 8, 4, 4, lr, lg, lb);
    p.rect(22, 8, 4, 4, lr, lg, lb);
    // Eyes (visor)
    p.rect(12, 12, 8, 2, 255, 50, 50);
    // Chest plate
    p.rect(12, 16, 8, 4, dr, dg, db);
    p.px(16, 18, lr, lg, lb);
  } else if (design === 'armored') {
    // Android — metallic humanoid
    p.rect(8, 8, 16, 16, r, g, b);
    // Metal plating lines
    p.rect(8, 8, 16, 1, lr, lg, lb);
    p.rect(8, 12, 16, 1, lr, lg, lb);
    p.rect(8, 16, 16, 1, lr, lg, lb);
    p.rect(8, 20, 16, 1, lr, lg, lb);
    p.rect(15, 8, 2, 16, dr, dg, db);
    // Circuit dots
    p.px(11, 10, 255, 255, 100);
    p.px(21, 10, 255, 255, 100);
    p.px(11, 18, 100, 255, 255);
    p.px(21, 18, 100, 255, 255);
    // Eyes
    p.px(13, 14, 255, 0, 0);
    p.px(19, 14, 255, 0, 0);
  } else if (design === 'flyer') {
    // Flying Saibaman — green with wings
    for (let y = 0; y < 12; y++) {
      const w = 8 - Math.floor(y * 0.2);
      p.rect(16 - Math.floor(w / 2), 10 + y, w, 1, r, g, b);
    }
    // Wings
    p.line(12, 12, 4, 8, lr, lg, lb);
    p.line(12, 14, 4, 14, lr, lg, lb);
    p.line(12, 16, 4, 20, lr, lg, lb);
    p.line(20, 12, 28, 8, lr, lg, lb);
    p.line(20, 14, 28, 14, lr, lg, lb);
    p.line(20, 16, 28, 20, lr, lg, lb);
    // Eyes
    p.px(14, 14, 255, 255, 255);
    p.px(18, 14, 255, 255, 255);
    p.px(14, 15, 0, 0, 0);
    p.px(18, 15, 0, 0, 0);
  } else if (design === 'swarm') {
    // Cell Junior — small purple creature
    p.circle(16, 16, 8, r, g, b);
    p.circle(16, 16, 6, dr, dg, db);
    // Spots
    p.px(12, 12, lr, lg, lb);
    p.px(20, 12, lr, lg, lb);
    p.px(14, 20, lr, lg, lb);
    p.px(18, 20, lr, lg, lb);
    p.px(16, 16, lr, lg, lb);
    // Eyes
    p.px(13, 14, 255, 255, 255);
    p.px(19, 14, 255, 255, 255);
    p.px(13, 15, 0, 0, 0);
    p.px(19, 15, 0, 0, 0);
    // Head spike
    p.px(16, 6, r, g, b);
    p.px(16, 7, r, g, b);
  } else if (design === 'boss') {
    // Demon King — large dark figure with horns
    p.rect(6, 6, 20, 22, r, g, b);
    // Horns
    p.line(8, 6, 4, 0, dr, dg, db);
    p.line(10, 6, 8, 0, dr, dg, db);
    p.line(24, 6, 28, 0, dr, dg, db);
    p.line(22, 6, 24, 0, dr, dg, db);
    // Dark armor bands
    p.rect(6, 10, 20, 2, dr, dg, db);
    p.rect(6, 18, 20, 2, dr, dg, db);
    p.rect(6, 24, 20, 2, dr, dg, db);
    // Glowing eyes
    p.px(12, 14, 255, 50, 50);
    p.px(20, 14, 255, 50, 50);
    p.px(12, 15, 255, 100, 100);
    p.px(20, 15, 255, 100, 100);
    // Chest emblem
    p.circle(16, 20, 2, lr, lg, lb);
    p.px(16, 20, 255, 200, 50);
  }

  p.save(file);
}

// ── DBZ Projectile sprites (8x8) ─────────────────────────────────

function genProjectile(file: string, color: string, design: string): void {
  const p = new Pix(8, 8);
  const [r, g, b] = shade(color, 1);
  const [lr, lg, lb] = shade(color, 1.4);

  if (design === 'gatling') {
    // Ki bolt — small blue sphere
    p.circle(4, 4, 2, r, g, b);
    p.px(4, 4, lr, lg, lb);
    p.px(3, 3, 255, 255, 255);
  } else if (design === 'cannon') {
    // Energy wave — spread pattern
    p.rect(1, 2, 6, 4, r, g, b);
    p.rect(2, 1, 4, 6, r, g, b);
    p.rect(2, 3, 4, 2, lr, lg, lb);
    p.px(3, 2, 255, 255, 200);
    p.px(5, 2, 255, 255, 200);
  } else if (design === 'frost') {
    // Solar flare spark — radiating yellow
    p.circle(4, 4, 3, r, g, b);
    p.line(4, 0, 4, 7, lr, lg, lb);
    p.line(0, 4, 7, 4, lr, lg, lb);
    p.px(4, 4, 255, 255, 255);
  } else if (design === 'poison') {
    // Energy sphere — purple orb
    p.circle(4, 4, 3, r, g, b);
    p.circle(4, 4, 1, lr, lg, lb);
    p.px(3, 3, 255, 200, 255);
  } else if (design === 'sniper') {
    // Spiral beam — yellow spiral
    p.px(4, 1, r, g, b);
    p.px(5, 2, r, g, b);
    p.px(5, 3, lr, lg, lb);
    p.px(4, 4, r, g, b);
    p.px(3, 5, lr, lg, lb);
    p.px(2, 5, r, g, b);
    p.px(3, 6, r, g, b);
    p.px(4, 4, 255, 255, 255);
  }

  p.save(file);
}

// ── DBZ Path tiles (32x32) — Snake Way style ────────────────────
// Bright yellow road with cloud-like white edges.

function genPathTile(file: string, type: string): void {
  const p = new Pix(32, 32);
  const road: [number, number, number] = [255, 200, 30];   // bright yellow
  const roadD: [number, number, number] = [220, 170, 10];  // darker yellow
  const cloud: [number, number, number] = [255, 255, 255]; // white edges
  const cloudD: [number, number, number] = [220, 220, 230];

  // Fill background transparent — only draw road area

  if (type === 'h') {
    // Horizontal road
    p.rect(0, 10, 32, 12, ...road);
    p.rect(0, 10, 32, 2, ...roadD);
    p.rect(0, 20, 32, 2, ...roadD);
    // Cloud edges (top and bottom)
    for (let x = 0; x < 32; x += 4) {
      p.circle(x + 2, 8, 2, ...cloud);
      p.circle(x + 2, 23, 2, ...cloud);
    }
    // Cloud shadow dots
    for (let x = 2; x < 32; x += 4) {
      p.px(x, 9, ...cloudD);
      p.px(x, 22, ...cloudD);
    }
  } else if (type === 'v') {
    // Vertical road
    p.rect(10, 0, 12, 32, ...road);
    p.rect(10, 0, 2, 32, ...roadD);
    p.rect(20, 0, 2, 32, ...roadD);
    // Cloud edges (left and right)
    for (let y = 0; y < 32; y += 4) {
      p.circle(8, y + 2, 2, ...cloud);
      p.circle(23, y + 2, 2, ...cloud);
    }
    for (let y = 2; y < 32; y += 4) {
      p.px(9, y, ...cloudD);
      p.px(22, y, ...cloudD);
    }
  } else if (type === 'corner_ne') {
    // Corner: north + east (road goes from top to right)
    p.rect(10, 0, 12, 16, ...road);
    p.rect(16, 10, 16, 12, ...road);
    p.rect(10, 0, 2, 16, ...roadD);
    p.rect(20, 10, 16, 2, ...roadD);
    // Cloud edges
    for (let y = 0; y < 16; y += 4) {
      p.circle(8, y + 2, 2, ...cloud);
    }
    for (let x = 16; x < 32; x += 4) {
      p.circle(x + 2, 8, 2, ...cloud);
    }
  } else if (type === 'corner_nw') {
    // Corner: north + west (road goes from top to left)
    p.rect(10, 0, 12, 16, ...road);
    p.rect(0, 10, 16, 12, ...road);
    p.rect(20, 0, 2, 16, ...roadD);
    p.rect(0, 10, 16, 2, ...roadD);
    for (let y = 0; y < 16; y += 4) {
      p.circle(23, y + 2, 2, ...cloud);
    }
    for (let x = 0; x < 16; x += 4) {
      p.circle(x + 2, 8, 2, ...cloud);
    }
  } else if (type === 'corner_se') {
    // Corner: south + east (road goes from bottom to right)
    p.rect(10, 16, 12, 16, ...road);
    p.rect(16, 10, 16, 12, ...road);
    p.rect(10, 16, 2, 16, ...roadD);
    p.rect(20, 20, 16, 2, ...roadD);
    for (let y = 16; y < 32; y += 4) {
      p.circle(8, y + 2, 2, ...cloud);
    }
    for (let x = 16; x < 32; x += 4) {
      p.circle(x + 2, 23, 2, ...cloud);
    }
  } else if (type === 'corner_sw') {
    // Corner: south + west (road goes from bottom to left)
    p.rect(10, 16, 12, 16, ...road);
    p.rect(0, 10, 16, 12, ...road);
    p.rect(20, 16, 2, 16, ...roadD);
    p.rect(0, 20, 16, 2, ...roadD);
    for (let y = 16; y < 32; y += 4) {
      p.circle(23, y + 2, 2, ...cloud);
    }
    for (let x = 0; x < 16; x += 4) {
      p.circle(x + 2, 23, 2, ...cloud);
    }
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

