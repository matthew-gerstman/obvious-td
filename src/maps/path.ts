/** A point in tile coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** A unit movement direction (-1, 0, or 1 on each axis). */
export interface Direction {
  dx: number;
  dy: number;
}

/**
 * A single path that enemies follow from start to end.
 * Waypoints are tile coordinates; adjacent waypoints must differ by
 * exactly 1 in x or y (orthogonal, gap-free) for a valid path.
 */
export class Path {
  private readonly waypoints: readonly Point[];
  readonly id: string;

  constructor(id: string, waypoints: readonly Point[]) {
    this.id = id;
    this.waypoints = waypoints.map(wp => ({ x: wp.x, y: wp.y }));
  }

  /** Returns a copy of the waypoint array. */
  getWaypoints(): Point[] {
    return this.waypoints.map(wp => ({ x: wp.x, y: wp.y }));
  }

  /** Total path length in tiles (sum of Manhattan distances between consecutive waypoints). */
  getTotalLength(): number {
    let total = 0;
    for (let i = 1; i < this.waypoints.length; i++) {
      const prev = this.waypoints[i - 1];
      const curr = this.waypoints[i];
      if (!prev || !curr) continue;
      total += Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
    }
    return total;
  }

  /**
   * Returns the {x, y} position at a given distance along the path.
   * Interpolates linearly between waypoints. Distance 0 returns the
   * first waypoint; distance >= totalLength returns the last waypoint.
   */
  getPositionAtDistance(distance: number): Point {
    if (this.waypoints.length === 0) {
      throw new Error('Path has no waypoints');
    }

    const first = this.waypoints[0]!;
    if (distance <= 0) return { x: first.x, y: first.y };

    const last = this.waypoints[this.waypoints.length - 1]!;
    const totalLength = this.getTotalLength();
    if (distance >= totalLength) return { x: last.x, y: last.y };

    let remaining = distance;
    for (let i = 1; i < this.waypoints.length; i++) {
      const prev = this.waypoints[i - 1]!;
      const curr = this.waypoints[i]!;
      const segmentLength =
        Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);

      if (remaining <= segmentLength) {
        const t = segmentLength > 0 ? remaining / segmentLength : 0;
        return {
          x: prev.x + t * (curr.x - prev.x),
          y: prev.y + t * (curr.y - prev.y),
        };
      }
      remaining -= segmentLength;
    }

    return { x: last.x, y: last.y };
  }

  /**
   * Validates that adjacent waypoints differ by exactly 1 in x OR y
   * (not both, not 0, not >1) — a gap-free orthogonal path.
   */
  isContinuous(): boolean {
    for (let i = 1; i < this.waypoints.length; i++) {
      const prev = this.waypoints[i - 1];
      const curr = this.waypoints[i];
      if (!prev || !curr) return false;
      const dx = Math.abs(curr.x - prev.x);
      const dy = Math.abs(curr.y - prev.y);
      if (dx + dy !== 1) return false;
    }
    return true;
  }

  /** Returns a Set of "x,y" strings for all tiles the path passes through. */
  getTileSet(): Set<string> {
    const tiles = new Set<string>();
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      if (wp) tiles.add(`${wp.x},${wp.y}`);
    }
    // Walk between consecutive waypoints to fill intermediate tiles
    for (let i = 1; i < this.waypoints.length; i++) {
      const prev = this.waypoints[i - 1];
      const curr = this.waypoints[i];
      if (!prev || !curr) continue;
      let x = prev.x;
      let y = prev.y;
      while (x !== curr.x || y !== curr.y) {
        if (x < curr.x) x++;
        else if (x > curr.x) x--;
        else if (y < curr.y) y++;
        else if (y > curr.y) y--;
        tiles.add(`${x},${y}`);
      }
    }
    return tiles;
  }

  /**
   * Returns the movement direction {dx, dy} at a given distance along
   * the path. Values are -1, 0, or 1. Used for enemy facing/rotation.
   * At segment boundaries, returns the direction of the upcoming segment.
   */
  getDirectionAtDistance(distance: number): Direction {
    if (this.waypoints.length < 2) {
      return { dx: 0, dy: 0 };
    }

    const totalLength = this.getTotalLength();
    if (totalLength === 0) return { dx: 0, dy: 0 };

    // At or past the end — return last segment direction
    if (distance >= totalLength) {
      return this.segmentDirection(
        this.waypoints[this.waypoints.length - 2]!,
        this.waypoints[this.waypoints.length - 1]!,
      );
    }

    // Before the start — return first segment direction
    if (distance <= 0) {
      return this.segmentDirection(
        this.waypoints[0]!,
        this.waypoints[1]!,
      );
    }

    let remaining = distance;
    for (let i = 1; i < this.waypoints.length; i++) {
      const prev = this.waypoints[i - 1]!;
      const curr = this.waypoints[i]!;
      const segmentLength =
        Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);

      if (remaining < segmentLength) {
        return this.segmentDirection(prev, curr);
      }
      remaining -= segmentLength;
    }

    // Fallback — last segment
    return this.segmentDirection(
      this.waypoints[this.waypoints.length - 2]!,
      this.waypoints[this.waypoints.length - 1]!,
    );
  }

  private segmentDirection(from: Point, to: Point): Direction {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
    if (dx === 0) return { dx: 0, dy: dy > 0 ? 1 : -1 };
    if (dy === 0) return { dx: dx > 0 ? 1 : -1, dy: 0 };
    // Diagonal — shouldn't occur for orthogonal paths
    return { dx: dx > 0 ? 1 : -1, dy: dy > 0 ? 1 : -1 };
  }
}

