import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadMap, GameMap } from '../../src/maps/map-loader';
import { Path } from '../../src/maps/path';

const DATA_MAPS_DIR = 'data/maps';

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

const mapFiles = readdirSync(DATA_MAPS_DIR)
  .filter(file => file.startsWith('map_') && file.endsWith('.json'))
  .map(file => ({
    file,
    data: loadJson(join(DATA_MAPS_DIR, file)) as object,
  }));

describe('Path class', () => {
  it('isContinuous returns true for adjacent waypoints', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(path.isContinuous()).toBe(true);
  });

  it('isContinuous returns false for a gap', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(path.isContinuous()).toBe(false);
  });

  it('isContinuous returns false for a diagonal step', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(path.isContinuous()).toBe(false);
  });

  it('isContinuous returns false for a stationary step', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(path.isContinuous()).toBe(false);
  });

  it('getTotalLength returns sum of Manhattan distances', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
    ]);
    expect(path.getTotalLength()).toBe(5);
  });

  it('getPositionAtDistance(0) returns first waypoint', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(path.getPositionAtDistance(0)).toEqual({ x: 0, y: 0 });
  });

  it('getPositionAtDistance(totalLength) returns last waypoint', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(path.getPositionAtDistance(4)).toEqual({ x: 4, y: 0 });
  });

  it('getPositionAtDistance interpolates between waypoints', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(path.getPositionAtDistance(2)).toEqual({ x: 2, y: 0 });
  });

  it('getPositionAtDistance handles multi-segment paths', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
    ]);
    expect(path.getPositionAtDistance(3)).toEqual({ x: 3, y: 0 });
    expect(path.getPositionAtDistance(4)).toEqual({ x: 3, y: 1 });
    expect(path.getPositionAtDistance(5)).toEqual({ x: 3, y: 2 });
  });

  it('getDirectionAtDistance returns movement direction', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
    ]);
    expect(path.getDirectionAtDistance(0)).toEqual({ dx: 1, dy: 0 });
    expect(path.getDirectionAtDistance(2)).toEqual({ dx: 1, dy: 0 });
    expect(path.getDirectionAtDistance(3)).toEqual({ dx: 0, dy: 1 });
    expect(path.getDirectionAtDistance(5)).toEqual({ dx: 0, dy: 1 });
  });

  it('getTileSet returns all tiles the path passes through', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const tiles = path.getTileSet();
    expect(tiles.has('0,0')).toBe(true);
    expect(tiles.has('1,0')).toBe(true);
    expect(tiles.has('2,0')).toBe(true);
    expect(tiles.size).toBe(3);
  });

  it('getTileSet fills intermediate tiles for non-adjacent waypoints', () => {
    const path = new Path('test', [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const tiles = path.getTileSet();
    expect(tiles.has('0,0')).toBe(true);
    expect(tiles.has('1,0')).toBe(true);
    expect(tiles.has('2,0')).toBe(true);
    expect(tiles.has('3,0')).toBe(true);
    expect(tiles.size).toBe(4);
  });
});

describe('Map loader — all 3 maps', () => {
  for (const { file, data } of mapFiles) {
    describe(`${file}`, () => {
      let map: GameMap;

      it('loads without error', () => {
        map = loadMap(data);
        expect(map).toBeDefined();
      });

      it('has correct width and height', () => {
        map = loadMap(data);
        expect(map.width).toBe(20);
        expect(map.height).toBe(15);
      });

      it('all paths are continuous (gap-free)', () => {
        map = loadMap(data);
        for (const path of map.paths) {
          expect(path.isContinuous()).toBe(true);
        }
      });

      it('no buildable tile is on a path tile', () => {
        map = loadMap(data);
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if (map.isBuildable(x, y)) {
              expect(map.isPathTile(x, y)).toBe(false);
            }
          }
        }
      });

      it('start points are at path starts', () => {
        map = loadMap(data);
        for (const sp of map.startPoints) {
          const path = map.paths.find(p => p.id === sp.pathId);
          expect(path).toBeDefined();
          const waypoints = path!.getWaypoints();
          const first = waypoints[0];
          expect(first).toBeDefined();
          expect(first!.x).toBe(sp.x);
          expect(first!.y).toBe(sp.y);
        }
      });

      it('end point is at a path end', () => {
        map = loadMap(data);
        let found = false;
        for (const path of map.paths) {
          const waypoints = path.getWaypoints();
          const last = waypoints[waypoints.length - 1];
          if (last && last.x === map.endPoint.x && last.y === map.endPoint.y) {
            found = true;
            break;
          }
        }
        expect(found).toBe(true);
      });

      it('getPositionAtDistance(0) returns first waypoint', () => {
        map = loadMap(data);
        const path = map.paths[0]!;
        const waypoints = path.getWaypoints();
        const first = waypoints[0]!;
        const pos = path.getPositionAtDistance(0);
        expect(pos.x).toBe(first.x);
        expect(pos.y).toBe(first.y);
      });

      it('getPositionAtDistance(totalLength) returns last waypoint', () => {
        map = loadMap(data);
        const path = map.paths[0]!;
        const waypoints = path.getWaypoints();
        const last = waypoints[waypoints.length - 1]!;
        const totalLength = path.getTotalLength();
        const pos = path.getPositionAtDistance(totalLength);
        expect(pos.x).toBe(last.x);
        expect(pos.y).toBe(last.y);
      });

      it('isBuildable returns true for a known buildable tile and false for a path tile', () => {
        map = loadMap(data);

        // Find a buildable tile
        let buildableTile: { x: number; y: number } | null = null;
        for (let y = 0; y < map.height && !buildableTile; y++) {
          for (let x = 0; x < map.width && !buildableTile; x++) {
            if (map.isBuildable(x, y)) {
              buildableTile = { x, y };
            }
          }
        }
        expect(buildableTile).not.toBeNull();
        expect(map.isBuildable(buildableTile!.x, buildableTile!.y)).toBe(true);

        // Find a path tile
        let pathTile: { x: number; y: number } | null = null;
        for (let y = 0; y < map.height && !pathTile; y++) {
          for (let x = 0; x < map.width && !pathTile; x++) {
            if (map.isPathTile(x, y)) {
              pathTile = { x, y };
            }
          }
        }
        expect(pathTile).not.toBeNull();
        expect(map.isBuildable(pathTile!.x, pathTile!.y)).toBe(false);
      });
    });
  }
});

describe('Map loader — validation errors', () => {
  it('throws on non-continuous path', () => {
    const badMap = {
      id: 'map_bad',
      type: 'map',
      logic: {
        width: 10,
        height: 10,
        paths: [{ id: 'p1', waypoints: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }],
        buildableTiles: [],
        startPoints: [{ x: 0, y: 0, pathId: 'p1' }],
        endPoint: { x: 2, y: 0 },
      },
      presentation: { name: 'Bad', description: 'Test', backgroundSprite: 'x' },
    };
    expect(() => loadMap(badMap)).toThrow('not continuous');
  });

  it('throws on buildable tile overlapping path', () => {
    const badMap = {
      id: 'map_bad',
      type: 'map',
      logic: {
        width: 10,
        height: 10,
        paths: [{ id: 'p1', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
        buildableTiles: [{ x: 0, y: 0 }],
        startPoints: [{ x: 0, y: 0, pathId: 'p1' }],
        endPoint: { x: 1, y: 0 },
      },
      presentation: { name: 'Bad', description: 'Test', backgroundSprite: 'x' },
    };
    expect(() => loadMap(badMap)).toThrow('overlaps');
  });

  it('throws on start point not at path start', () => {
    const badMap = {
      id: 'map_bad',
      type: 'map',
      logic: {
        width: 10,
        height: 10,
        paths: [{ id: 'p1', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
        buildableTiles: [],
        startPoints: [{ x: 1, y: 0, pathId: 'p1' }],
        endPoint: { x: 1, y: 0 },
      },
      presentation: { name: 'Bad', description: 'Test', backgroundSprite: 'x' },
    };
    expect(() => loadMap(badMap)).toThrow('Start point');
  });

  it('throws on end point not at any path end', () => {
    const badMap = {
      id: 'map_bad',
      type: 'map',
      logic: {
        width: 10,
        height: 10,
        paths: [{ id: 'p1', waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
        buildableTiles: [],
        startPoints: [{ x: 0, y: 0, pathId: 'p1' }],
        endPoint: { x: 5, y: 5 },
      },
      presentation: { name: 'Bad', description: 'Test', backgroundSprite: 'x' },
    };
    expect(() => loadMap(badMap)).toThrow('End point');
  });

  it('throws on waypoint out of bounds', () => {
    const badMap = {
      id: 'map_bad',
      type: 'map',
      logic: {
        width: 5,
        height: 5,
        paths: [
          {
            id: 'p1',
            waypoints: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 2, y: 0 },
              { x: 3, y: 0 },
              { x: 4, y: 0 },
              { x: 5, y: 0 },
            ],
          },
        ],
        buildableTiles: [],
        startPoints: [{ x: 0, y: 0, pathId: 'p1' }],
        endPoint: { x: 5, y: 0 },
      },
      presentation: { name: 'Bad', description: 'Test', backgroundSprite: 'x' },
    };
    expect(() => loadMap(badMap)).toThrow('out of map bounds');
  });
});

