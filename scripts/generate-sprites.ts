import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// ── PNG encoding (no external deps) ───────────────────────────────

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

// ── Pixel buffer ─────────────────────────────────────────────────

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

// ── Tower sprites (32x32) ────────────────────────────────────────

type TowerDesign = 'gatling' | 'cannon' | 'frost' | 'poison' | 'sniper' | 'aura' | 'economy';

function genTower(file: string, color: string, design: TowerDesign): void {
  const p = new Pix(32, 32);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.7);
  const [lr, lg, lb] = shade(color, 1.3);
  const stone: [number, number, number] = [90, 90, 100];
  const stoneD: [number, number, number] = [60, 60, 70];

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
    p.rect(24, 8, 6, 2, dr, dg, db);
    p.rect(24, 13, 6, 2, dr, dg, db);
    p.rect(24, 18, 6, 2, dr, dg, db);
  } else if (design === 'cannon') {
    p.rect(24, 11, 8, 8, dr, dg, db);
    p.rect(30, 13, 2, 4, stoneD[0], stoneD[1], stoneD[2]);
  } else if (design === 'frost') {
    p.line(16, 0, 12, 6, lr, lg, lb);
    p.line(16, 0, 20, 6, lr, lg, lb);
    p.px(16, 2, 255, 255, 255);
    p.px(14, 4, 255, 255, 255);
    p.px(18, 4, 255, 255, 255);
  } else if (design === 'poison') {
    p.circle(16, 4, 3, lr, lg, lb);
    p.px(16, 2, 200, 255, 100);
  } else if (design === 'sniper') {
    p.rect(24, 14, 8, 4, dr, dg, db);
    p.rect(30, 15, 2, 2, stoneD[0], stoneD[1], stoneD[2]);
  } else if (design === 'aura') {
    p.ring(16, 10, 5, 2, lr, lg, lb, 200);
    p.ring(16, 10, 7, 1, lr, lg, lb, 100);
  } else if (design === 'economy') {
    p.circle(16, 5, 3, 255, 215, 0);
    p.circle(16, 5, 2, 255, 240, 100);
  }

  // Texture noise for pixel diversity
  for (let i = 0; i < 8; i++) {
    const nx = 10 + Math.floor(Math.random() * 12);
    const ny = 8 + Math.floor(Math.random() * 12);
    p.px(nx, ny, lr, lg, lb, 180);
  }

  p.save(file);
}

// ── Enemy sprites (32x32) ────────────────────────────────────────

type EnemyDesign = 'runner' | 'grunt' | 'armored' | 'flyer' | 'swarm' | 'boss';

function genEnemy(file: string, color: string, design: EnemyDesign): void {
  const p = new Pix(32, 32);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.6);
  const [lr, lg, lb] = shade(color, 1.3);

  if (design === 'runner') {
    for (let y = 0; y < 16; y++) {
      const w = 12 - y;
      p.rect(16 - Math.floor(w / 2), 8 + y, w, 1, r, g, b);
    }
    p.line(16, 8, 10, 23, dr, dg, db);
    p.line(16, 8, 22, 23, dr, dg, db);
    p.line(10, 23, 22, 23, dr, dg, db);
    p.px(15, 14, 255, 255, 255);
    p.px(17, 14, 255, 255, 255);
    p.px(15, 15, 0, 0, 0);
    p.px(17, 15, 0, 0, 0);
  } else if (design === 'grunt') {
    p.rect(8, 8, 16, 16, r, g, b);
    p.rect(8, 8, 16, 2, dr, dg, db);
    p.rect(8, 22, 16, 2, dr, dg, db);
    p.rect(8, 8, 2, 16, dr, dg, db);
    p.rect(22, 8, 2, 16, lr, lg, lb);
    p.rect(12, 13, 3, 3, 255, 255, 255);
    p.rect(17, 13, 3, 3, 255, 255, 255);
    p.px(13, 14, 0, 0, 0);
    p.px(18, 14, 0, 0, 0);
    p.rect(13, 19, 6, 2, dr, dg, db);
  } else if (design === 'armored') {
    p.rect(6, 6, 20, 20, 100, 100, 110);
    p.rect(6, 6, 20, 2, 70, 70, 80);
    p.rect(6, 24, 20, 2, 70, 70, 80);
    p.rect(6, 6, 2, 20, 70, 70, 80);
    p.rect(24, 6, 2, 20, 130, 130, 140);
    p.line(6, 16, 26, 16, 80, 80, 90);
    p.line(16, 6, 16, 26, 80, 80, 90);
    p.circle(10, 10, 1, 160, 160, 170);
    p.circle(22, 10, 1, 160, 160, 170);
    p.circle(10, 22, 1, 160, 160, 170);
    p.circle(22, 22, 1, 160, 160, 170);
    p.px(13, 13, 255, 50, 50);
    p.px(19, 13, 255, 50, 50);
  } else if (design === 'flyer') {
    p.line(4, 12, 12, 16, dr, dg, db);
    p.line(28, 12, 20, 16, dr, dg, db);
    p.line(4, 20, 12, 16, dr, dg, db);
    p.line(28, 20, 20, 16, dr, dg, db);
    for (let y = 0; y < 16; y++) {
      const w = y < 8 ? y * 2 : (16 - y) * 2;
      p.rect(16 - w / 2, 8 + y, w, 1, r, g, b);
    }
    p.px(16, 10, lr, lg, lb);
    p.px(15, 11, lr, lg, lb);
    p.px(14, 15, 255, 255, 255);
    p.px(18, 15, 255, 255, 255);
  } else if (design === 'swarm') {
    p.circle(16, 16, 7, r, g, b);
    p.ring(16, 16, 7, 2, dr, dg, db);
    p.circle(16, 16, 3, lr, lg, lb);
    p.px(14, 14, 0, 0, 0);
    p.px(18, 14, 0, 0, 0);
  } else if (design === 'boss') {
    p.rect(8, 6, 16, 20, r, g, b);
    p.rect(6, 10, 20, 12, r, g, b);
    p.rect(8, 6, 16, 2, dr, dg, db);
    p.rect(8, 24, 16, 2, dr, dg, db);
    p.rect(6, 10, 2, 12, dr, dg, db);
    p.rect(24, 10, 2, 12, dr, dg, db);
    p.px(10, 4, dr, dg, db);
    p.px(16, 3, dr, dg, db);
    p.px(22, 4, dr, dg, db);
    p.circle(12, 14, 2, 255, 200, 0);
    p.circle(20, 14, 2, 255, 200, 0);
    p.px(12, 14, 255, 50, 0);
    p.px(20, 14, 255, 50, 0);
    p.rect(12, 20, 8, 3, dr, dg, db);
    p.px(14, 21, 255, 50, 0);
    p.px(18, 21, 255, 50, 0);
    for (let i = 0; i < 6; i++) {
      const nx = 10 + Math.floor(Math.random() * 12);
      const ny = 8 + Math.floor(Math.random() * 16);
      p.px(nx, ny, lr, lg, lb, 150);
    }
  }

  p.save(file);
}

// ── Projectile sprites (8x8) ─────────────────────────────────────

function genProjectile(file: string, color: string): void {
  const p = new Pix(8, 8);
  const [r, g, b] = shade(color, 1);
  const [dr, dg, db] = shade(color, 0.6);
  const [lr, lg, lb] = shade(color, 1.5);
  p.circle(4, 4, 3, r, g, b);
  p.ring(4, 4, 3, 1, dr, dg, db);
  p.circle(4, 4, 1, lr, lg, lb);
  p.save(file);
}

// ── Path tile sprites (32x32) ────────────────────────────────────

const DIRT: [number, number, number] = [139, 115, 85];
const DIRT_D: [number, number, number] = [107, 83, 64];
const DIRT_L: [number, number, number] = [160, 139, 110];

function genPathTile(file: string, type: 'h' | 'v' | 'corner_ne' | 'corner_nw' | 'corner_se' | 'corner_sw'): void {
  const p = new Pix(32, 32);

  if (type === 'h') {
    for (let y = 6; y < 26; y++) for (let x = 0; x < 32; x++) {
      const edge = y < 8 || y > 24 ? 0.6 : 1;
      const n = (x * 7 + y * 13) % 5;
      const c = n < 2 ? DIRT_D : n > 3 ? DIRT_L : DIRT;
      p.px(x, y, c[0] * edge, c[1] * edge, c[2] * edge);
    }
  } else if (type === 'v') {
    for (let x = 6; x < 26; x++) for (let y = 0; y < 32; y++) {
      const edge = x < 8 || x > 24 ? 0.6 : 1;
      const n = (x * 7 + y * 13) % 5;
      const c = n < 2 ? DIRT_D : n > 3 ? DIRT_L : DIRT;
      p.px(x, y, c[0] * edge, c[1] * edge, c[2] * edge);
    }
  } else {
    // Corner: arc centered on the tile corner shared by the two open sides
    const cx = type === 'corner_ne' || type === 'corner_se' ? 32 : 0;
    const cy = type === 'corner_ne' || type === 'corner_nw' ? 0 : 32;
    const rad = 20;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= rad + 6 && dist >= rad - 10) {
        const edge = dist > rad + 2 || dist < rad - 6 ? 0.6 : 1;
        const n = (x * 7 + y * 13) % 5;
        const c = n < 2 ? DIRT_D : n > 3 ? DIRT_L : DIRT;
        p.px(x, y, c[0] * edge, c[1] * edge, c[2] * edge);
      }
    }
  }

  p.save(file);
}

// ── Main ─────────────────────────────────────────────────────────

const outDir = path.resolve('public/sprites/default');
fs.mkdirSync(outDir, { recursive: true });

const towers: Array<[string, string, TowerDesign]> = [
  ['gatling', '#4a90d9', 'gatling'],
  ['cannon', '#d9744a', 'cannon'],
  ['frost', '#4ad9d0', 'frost'],
  ['poison', '#9ad94a', 'poison'],
  ['sniper', '#d94a8a', 'sniper'],
  ['aura', '#d9d04a', 'aura'],
  ['economy', '#4ad97a', 'economy'],
];
for (const [name, color, design] of towers) genTower(path.join(outDir, `${name}.png`), color, design);

const enemies: Array<[string, string, EnemyDesign]> = [
  ['runner', '#e03939', 'runner'],
  ['grunt', '#e03939', 'grunt'],
  ['armored', '#888888', 'armored'],
  ['flyer', '#9b59b6', 'flyer'],
  ['swarm', '#e67e22', 'swarm'],
  ['boss', '#8b0000', 'boss'],
];
for (const [name, color, design] of enemies) genEnemy(path.join(outDir, `${name}.png`), color, design);

const projectiles: Array<[string, string]> = [
  ['gatling_projectile', '#ffeb3b'],
  ['cannon_projectile', '#ff5722'],
  ['frost_projectile', '#80deea'],
  ['poison_projectile', '#76ff03'],
  ['sniper_projectile', '#e91e63'],
];
for (const [name, color] of projectiles) genProjectile(path.join(outDir, `${name}.png`), color);

const pathTiles: Array<[string, 'h' | 'v' | 'corner_ne' | 'corner_nw' | 'corner_se' | 'corner_sw']> = [
  ['path_tile_h', 'h'],
  ['path_tile_v', 'v'],
  ['path_tile_corner_ne', 'corner_ne'],
  ['path_tile_corner_nw', 'corner_nw'],
  ['path_tile_corner_se', 'corner_se'],
  ['path_tile_corner_sw', 'corner_sw'],
];
for (const [name, type] of pathTiles) genPathTile(path.join(outDir, `${name}.png`), type);

console.log(`Generated ${towers.length + enemies.length + projectiles.length + pathTiles.length} sprites in ${outDir}`);
