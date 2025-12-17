import { FenceLine, Point, Post, PostCategory, Gate } from "@/types/models";
import { generateId } from "@/lib/ids";

function makePointKey(p: Point, decimals = 2): string {
  return `${p.x.toFixed(decimals)},${p.y.toFixed(decimals)}`;
}

export function pointsEqual(a: Point, b: Point): boolean {
  return makePointKey(a) === makePointKey(b);
}

function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

function normalise(x: number, y: number) {
  const len = Math.hypot(x, y);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function normaliseAngleDeg(angle: number) {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

const projectPointToSegment = (p: Point, a: Point, b: Point) => {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq === 0) return { t: 0, proj: a, distanceSq: pointToSegmentDistanceSq(p, a, b) };

  const ap = { x: p.x - a.x, y: p.y - a.y };
  let t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  const distanceSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;

  return { t, proj, distanceSq };
};

export function getPostNeighbours(pos: Point, lines: FenceLine[]): Point[] {
  const neighbours: Point[] = [];
  const seen = new Set<string>();
  const keyForPoint = (p: Point) => makePointKey(p);

  lines.forEach((line) => {
    const { t, distanceSq } = projectPointToSegment(pos, line.a, line.b);
    if (distanceSq > 0.25) return;

    if (t <= 0.02) {
      const other = line.b;
      if (!seen.has(keyForPoint(other))) {
        seen.add(keyForPoint(other));
        neighbours.push(other);
      }
    } else if (t >= 0.98) {
      const other = line.a;
      if (!seen.has(keyForPoint(other))) {
        seen.add(keyForPoint(other));
        neighbours.push(other);
      }
    } else {
      [line.a, line.b].forEach((endpoint) => {
        const k = keyForPoint(endpoint);
        if (!seen.has(k)) {
          seen.add(k);
          neighbours.push(endpoint);
        }
      });
    }
  });

  return neighbours;
}

function pointToSegmentDistanceSq(p: Point, a: Point, b: Point) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq === 0) return ap.x * ap.x + ap.y * ap.y;

  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLenSq));
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;

  return dx * dx + dy * dy;
}

export function getPostAngleDeg(
  post: Point,
  neighbours: Array<Point>,
  lines: FenceLine[] = [],
  category: PostCategory
): number {
  if (neighbours.length === 0) {
    if (lines.length === 0) {
      return 0;
    }

    let closestLine = lines[0];
    let minDistSq = pointToSegmentDistanceSq(post, closestLine.a, closestLine.b);

    for (let i = 1; i < lines.length; i++) {
      const candidate = lines[i];
      const distSq = pointToSegmentDistanceSq(post, candidate.a, candidate.b);

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestLine = candidate;
      }
    }

    const dx = closestLine.b.x - closestLine.a.x;
    const dy = closestLine.b.y - closestLine.a.y;
    return normaliseAngleDeg(radToDeg(Math.atan2(dy, dx)));
  }

  if (neighbours.length === 1) {
    const dx = neighbours[0].x - post.x;
    const dy = neighbours[0].y - post.y;
    return normaliseAngleDeg(radToDeg(Math.atan2(dy, dx)));
  }

  if (category === "corner" && neighbours.length === 2) {
    const LENGTH_TIE_MM = 50;
    const a = neighbours[0];
    const b = neighbours[1];

    const v1 = { x: a.x - post.x, y: a.y - post.y };
    const v2 = { x: b.x - post.x, y: b.y - post.y };

    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);

    let primary = v1;

    if (Math.abs(len1 - len2) > LENGTH_TIE_MM) {
      primary = len1 >= len2 ? v1 : v2;
    } else {
      primary = Math.abs(v1.y) <= Math.abs(v2.y) ? v1 : v2;
    }

    return normaliseAngleDeg(radToDeg(Math.atan2(primary.y, primary.x)));
  }

  const a = neighbours[0];
  const b = neighbours[1];

  const v1 = normalise(a.x - post.x, a.y - post.y);
  const v2 = normalise(b.x - post.x, b.y - post.y);

  const sx = v1.x + v2.x;
  const sy = v1.y + v2.y;

  if (Math.hypot(sx, sy) < 1e-6) {
    return normaliseAngleDeg(radToDeg(Math.atan2(v1.y, v1.x)));
  }

  return normaliseAngleDeg(radToDeg(Math.atan2(sy, sx)));
}

export function generatePosts(
  lines: FenceLine[],
  _gates: Gate[],
  panelPositionsMap: Map<string, number[]> = new Map()
): Post[] {
  const STRAIGHT_EPS = 0.1;
  const SEGMENT_TOLERANCE = 0.5;

  type Adjacency = {
    pos: Point;
    edges: Array<{ lineId: string; angle: number }>;
    gateBlocked: boolean;
  };

  const lineHasBlockingFeatures = (line: FenceLine): boolean => {
    const segmentHasOpening = line.segments?.some(
      (segment) => segment?.type === "opening" || segment?.type === "gate"
    );

    return Boolean(
      line.isGateLine === true ||
        line.gateId ||
        (line.openings && line.openings.length > 0) ||
        (line.gates && line.gates.length > 0) ||
        segmentHasOpening
    );
  };

  const angleCache = new Map<string, number>();
  const adjacency = new Map<string, Adjacency>();

  const addEdge = (point: Point, line: FenceLine) => {
    const key = makePointKey(point);
    const angle =
      angleCache.get(line.id) ??
      (() => {
        const a = Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x);
        angleCache.set(line.id, a);
        return a;
      })();

    const existing = adjacency.get(key);
    const gateBlocked = lineHasBlockingFeatures(line);
    if (existing) {
      existing.gateBlocked = existing.gateBlocked || gateBlocked;
      if (!existing.edges.some((e) => e.lineId === line.id)) {
        existing.edges.push({ lineId: line.id, angle });
      }
      return;
    }

    adjacency.set(key, {
      pos: point,
      edges: [{ lineId: line.id, angle }],
      gateBlocked,
    });
  };

  lines.forEach((line) => {
    addEdge(line.a, line);
    addEdge(line.b, line);

    const panelPositions = panelPositionsMap.get(line.id) || [];
    const linePosts = getLinePosts(line, panelPositions);
    linePosts.forEach((point) => addEdge(point, line));
  });

  lines.forEach((line, index) => {
    [line.a, line.b].forEach((endpoint) => {
      for (let i = 0; i < lines.length; i++) {
        if (i === index) continue;
        const candidate = lines[i];
        const { t, distanceSq } = projectPointToSegment(endpoint, candidate.a, candidate.b);
        const epsilon = 0.02;

        if (t > epsilon && t < 1 - epsilon && distanceSq <= SEGMENT_TOLERANCE * SEGMENT_TOLERANCE) {
          addEdge(endpoint, candidate);
        }
      }
    });
  });

  const classify = (entry: Adjacency): PostCategory => {
    if (entry.gateBlocked) return "end";

    const edgeCount = entry.edges.length;
    if (edgeCount <= 1) return "end";
    if (edgeCount === 2) {
      const [a1, a2] = entry.edges.map((e) => e.angle);
      const diff = Math.abs(a1 - a2);
      const normalizedDiff = Math.min(diff, 2 * Math.PI - diff);
      const isStraight =
        normalizedDiff < STRAIGHT_EPS || Math.abs(normalizedDiff - Math.PI) < STRAIGHT_EPS;
      return isStraight ? "line" : "corner";
    }

    return "t";
  };

  return Array.from(adjacency.values()).map((entry) => ({
    id: generateId("post"),
    pos: entry.pos,
    category: classify(entry),
  }));
}

export function getLinePosts(
  line: FenceLine,
  panelPositions: number[]
): Point[] {
  const posts: Point[] = [];
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const totalLength_mm = line.length_mm;

  if (!totalLength_mm || totalLength_mm <= 0) return posts;

  panelPositions.forEach((pos_mm) => {
    const t = pos_mm / totalLength_mm;
    if (t > 0 && t < 1) {
      posts.push({
        x: line.a.x + dx * t,
        y: line.a.y + dy * t,
      });
    }
  });
  
  return posts;
}
