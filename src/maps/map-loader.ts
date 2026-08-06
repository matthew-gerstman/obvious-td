import { Path, type Point } from './path';

export interface StartPoint {
  x: number;
  y: number;
  pathId: string;
}

export interface EndPoint {
  x: number;
  y: number;
}

interface MapLogic {
  width: number;
  height: number;
  paths: Array<{ id: string; waypoints: Point[] }>;
  buildableTiles: Array<{ x: number; y: number }>;
  startPoints: StartPoint[];
  endPoint: EndPoint;
}

interface MapData {
  id: string;
  type: string;
  logic: MapLogic;
  presentation: {
    name: string;
    description: string;
    backgroundSprite: string;
  };
}

/**
 * A loaded game map. Contains tile dimensions, paths, buildable tiles,
 * start/end points, and query methods for tile placement validation.
 */
export class GameMap {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly paths: Path[];
  readonly buildableTiles: Set<string>;
  readonly startPoints: StartPoint[];
  readonly endPoint: EndPoint;

  private readonly pathTiles: Set<string>;

  constructor(
    id: string,
    width: number,
    height: number,
    paths: Path[],
    buildableTiles: Set<string>,
    startPoints: StartPoint[],
    endPoint: EndPoint,
  ) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.paths = paths;
    this.buildableTiles = buildableTiles;
    this.startPoints = startPoints.map(sp => ({
      x: sp.x,
      y: sp.y,
      pathId: sp.pathId,
    }));
    this.endPoint = { x: endPoint.x, y: endPoint.y };

    this.pathTiles = new Set<string>();
    for (const path of paths) {
      for (const tile of path.getTileSet()) {
        this.pathTiles.add(tile);
      }
    }
  }

  /** Returns true if a tower can be placed on the given tile. */
  isBuildable(tileX: number, tileY: number): boolean {
    return this.buildableTiles.has(`${tileX},${tileY}`);
  }

  /** Returns true if the given tile is part of any path. */
  isPathTile(tileX: number, tileY: number): boolean {
    return this.pathTiles.has(`${tileX},${tileY}`);
  }
}

/**
 * Loads and validates a map from a parsed JSON object.
 * Throws descriptive errors on validation failure.
 */
export function loadMap(mapData: object): GameMap {
  const data = mapData as MapData;

  if (!data.id || typeof data.id !== 'string') {
    throw new Error('Map data missing required field: id');
  }
  if (!data.logic) {
    throw new Error('Map data missing required field: logic');
  }

  const logic = data.logic;

  if (typeof logic.width !== 'number' || typeof logic.height !== 'number') {
    throw new Error('Map logic missing width or height');
  }
  if (logic.width < 5 || logic.height < 5) {
    throw new Error(
      `Map dimensions too small: ${logic.width}x${logic.height} (minimum 5x5)`,
    );
  }

  if (!Array.isArray(logic.paths) || logic.paths.length === 0) {
    throw new Error('Map must have at least one path');
  }

  // Build Path objects and validate continuity
  const paths: Path[] = [];
  for (const pathData of logic.paths) {
    if (!pathData.id || typeof pathData.id !== 'string') {
      throw new Error('Path missing required field: id');
    }
    if (
      !Array.isArray(pathData.waypoints) ||
      pathData.waypoints.length < 2
    ) {
      throw new Error(
        `Path "${pathData.id}" must have at least 2 waypoints`,
      );
    }
    const path = new Path(pathData.id, pathData.waypoints);
    if (!path.isContinuous()) {
      throw new Error(
        `Path "${pathData.id}" is not continuous — gap detected between waypoints`,
      );
    }
    paths.push(path);
  }

  // Validate waypoints are within bounds
  for (const path of paths) {
    for (const wp of path.getWaypoints()) {
      if (
        wp.x < 0 ||
        wp.x >= logic.width ||
        wp.y < 0 ||
        wp.y >= logic.height
      ) {
        throw new Error(
          `Waypoint (${wp.x}, ${wp.y}) on path "${path.id}" is out of map bounds (${logic.width}x${logic.height})`,
        );
      }
    }
  }

  // Build path tiles set for overlap checking
  const pathTiles = new Set<string>();
  for (const path of paths) {
    for (const tile of path.getTileSet()) {
      pathTiles.add(tile);
    }
  }

  // Validate and build buildable tiles
  const buildableTiles = new Set<string>();
  for (const tile of logic.buildableTiles) {
    const key = `${tile.x},${tile.y}`;
    if (pathTiles.has(key)) {
      throw new Error(
        `Buildable tile (${tile.x}, ${tile.y}) overlaps with a path tile`,
      );
    }
    if (
      tile.x < 0 ||
      tile.x >= logic.width ||
      tile.y < 0 ||
      tile.y >= logic.height
    ) {
      throw new Error(
        `Buildable tile (${tile.x}, ${tile.y}) is out of map bounds (${logic.width}x${logic.height})`,
      );
    }
    buildableTiles.add(key);
  }

  // Validate start points
  if (!Array.isArray(logic.startPoints) || logic.startPoints.length === 0) {
    throw new Error('Map must have at least one start point');
  }
  for (const sp of logic.startPoints) {
    const path = paths.find(p => p.id === sp.pathId);
    if (!path) {
      throw new Error(
        `Start point (${sp.x}, ${sp.y}) references unknown path "${sp.pathId}"`,
      );
    }
    const waypoints = path.getWaypoints();
    const first = waypoints[0];
    if (!first || first.x !== sp.x || first.y !== sp.y) {
      throw new Error(
        `Start point (${sp.x}, ${sp.y}) does not match first waypoint of path "${sp.pathId}"`,
      );
    }
  }

  // Validate end point
  if (
    !logic.endPoint ||
    typeof logic.endPoint.x !== 'number' ||
    typeof logic.endPoint.y !== 'number'
  ) {
    throw new Error('Map logic missing endPoint');
  }
  let endPointValid = false;
  for (const path of paths) {
    const waypoints = path.getWaypoints();
    const last = waypoints[waypoints.length - 1];
    if (last && last.x === logic.endPoint.x && last.y === logic.endPoint.y) {
      endPointValid = true;
      break;
    }
  }
  if (!endPointValid) {
    throw new Error(
      `End point (${logic.endPoint.x}, ${logic.endPoint.y}) does not match the last waypoint of any path`,
    );
  }

  return new GameMap(
    data.id,
    logic.width,
    logic.height,
    paths,
    buildableTiles,
    logic.startPoints,
    logic.endPoint,
  );
}

/**
 * Fetches and loads a map from a URL. For runtime use.
 */
export async function loadMapFromUrl(url: string): Promise<GameMap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch map from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as object;
  return loadMap(data);
}

