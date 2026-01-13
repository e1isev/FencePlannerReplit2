import { FenceLine, Point, Post, PostCategory, Gate } from "@/types/models";
import { generateId } from "@/lib/ids";
import { DEFAULT_POINT_QUANTIZE_STEP_MM, quantizePointMm } from "@/geometry/coordinates";
import {
  distanceMetersProjected,
  interpolateLngLat,
  lngLatToMercatorMeters,
  mercatorMetersToLngLat,
} from "@/lib/geo";

type PointKeyFn = (point: Point) => string;

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

const POINT_EPS_MM = 1; // 1 mm tolerance, prevents float mismatch issues

const mmToMeters = (mm: number) => mm / 1000;

function samePoint(a: Point, b: Point, eps = POINT_EPS_MM) {
  return distanceMetersProjected(a, b) <= mmToMeters(eps);
}

const projectPointToSegment = (p: Point, a: Point, b: Point) => {
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  const pMeters = lngLatToMercatorMeters(p);
  const ab = { x: bMeters.x - aMeters.x, y: bMeters.y - aMeters.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq === 0) return { t: 0, proj: a, distanceSq: pointToSegmentDistanceSq(p, a, b) };

  const ap = { x: pMeters.x - aMeters.x, y: pMeters.y - aMeters.y };
  let t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const projMeters = { x: aMeters.x + ab.x * t, y: aMeters.y + ab.y * t };
  const proj = mercatorMetersToLngLat(projMeters);
  const distanceSq = distanceMetersProjected(p, proj) ** 2;

  return { t, proj, distanceSq };
};

export function getPostNeighbours(pos: Point, lines: FenceLine[]): Point[] {
  const neighbours: Point[] = [];
  const seen = new Set<string>();
  const keyForPoint: PointKeyFn = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const neighbourToleranceM = 0.05;

  lines.forEach((line) => {
    const { t, distanceSq } = projectPointToSegment(pos, line.a, line.b);
    if (distanceSq > neighbourToleranceM * neighbourToleranceM) return;

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
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  const pMeters = lngLatToMercatorMeters(p);
  const ab = { x: bMeters.x - aMeters.x, y: bMeters.y - aMeters.y };
  const ap = { x: pMeters.x - aMeters.x, y: pMeters.y - aMeters.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq === 0) return ap.x * ap.x + ap.y * ap.y;

  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLenSq));
  const projMeters = { x: aMeters.x + ab.x * t, y: aMeters.y + ab.y * t };
  const dx = pMeters.x - projMeters.x;
  const dy = pMeters.y - projMeters.y;

  return dx * dx + dy * dy;
}

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const angleBetweenVectorsDeg = (u: { x: number; y: number }, v: { x: number; y: number }) =>
  radToDeg(Math.acos(clamp(u.x * v.x + u.y * v.y, -1, 1)));

export function getJunctionAngleDeg(node: Point, a: Point, b: Point): number | null {
  const nodeMeters = lngLatToMercatorMeters(node);
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  const vA = normalise(aMeters.x - nodeMeters.x, aMeters.y - nodeMeters.y);
  const vB = normalise(bMeters.x - nodeMeters.x, bMeters.y - nodeMeters.y);

  if (Math.hypot(vA.x, vA.y) < 1e-9 || Math.hypot(vB.x, vB.y) < 1e-9) return null;

  return angleBetweenVectorsDeg(vA, vB);
}

export function getJunctionAngleDegForPost(pos: Point, lines: FenceLine[]): number | null {
  const connectingLines = lines.filter((l) => samePoint(l.a, pos) || samePoint(l.b, pos));
  if (connectingLines.length !== 2) return null;

  const [lineA, lineB] = connectingLines;
  const a = samePoint(lineA.a, pos) ? lineA.b : lineA.a;
  const b = samePoint(lineB.a, pos) ? lineB.b : lineB.a;

  return getJunctionAngleDeg(pos, a, b);
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

    const aMeters = lngLatToMercatorMeters(closestLine.a);
    const bMeters = lngLatToMercatorMeters(closestLine.b);
    const dx = bMeters.x - aMeters.x;
    const dy = bMeters.y - aMeters.y;
    return normaliseAngleDeg(radToDeg(Math.atan2(dy, dx)));
  }

  if (neighbours.length === 1) {
    const postMeters = lngLatToMercatorMeters(post);
    const neighbourMeters = lngLatToMercatorMeters(neighbours[0]);
    const dx = neighbourMeters.x - postMeters.x;
    const dy = neighbourMeters.y - postMeters.y;
    return normaliseAngleDeg(radToDeg(Math.atan2(dy, dx)));
  }

  if (category === "corner" && neighbours.length === 2) {
    const LENGTH_TIE_MM = 50;
    const a = neighbours[0];
    const b = neighbours[1];

    const postMeters = lngLatToMercatorMeters(post);
    const v1Meters = lngLatToMercatorMeters(a);
    const v2Meters = lngLatToMercatorMeters(b);
    const v1 = { x: v1Meters.x - postMeters.x, y: v1Meters.y - postMeters.y };
    const v2 = { x: v2Meters.x - postMeters.x, y: v2Meters.y - postMeters.y };

    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);

    let primary = v1;

    if (Math.abs(len1 - len2) > mmToMeters(LENGTH_TIE_MM)) {
      primary = len1 >= len2 ? v1 : v2;
    } else {
      primary = Math.abs(v1.y) <= Math.abs(v2.y) ? v1 : v2;
    }

    return normaliseAngleDeg(radToDeg(Math.atan2(primary.y, primary.x)));
  }

  const a = neighbours[0];
  const b = neighbours[1];

  const postMeters = lngLatToMercatorMeters(post);
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  const v1 = normalise(aMeters.x - postMeters.x, aMeters.y - postMeters.y);
  const v2 = normalise(bMeters.x - postMeters.x, bMeters.y - postMeters.y);

  const sx = v1.x + v2.x;
  const sy = v1.y + v2.y;

  if (Math.hypot(sx, sy) < 1e-6) {
    return normaliseAngleDeg(radToDeg(Math.atan2(v1.y, v1.x)));
  }

  return normaliseAngleDeg(radToDeg(Math.atan2(sy, sx)));
}

const categorizePost = (pos: Point, lines: FenceLine[], _gates: Gate[] = []): PostCategory => {
  const connectingLines = lines.filter((l) => samePoint(l.a, pos) || samePoint(l.b, pos));

  const hasBlockingFeature = connectingLines.some((line) => lineHasBlockingFeatures(line));
  if (hasBlockingFeature) return "end";

  if (connectingLines.length <= 1) return "end";
  if (connectingLines.length >= 3) return "t";

  if (connectingLines.length === 2) {
    const [lineA, lineB] = connectingLines;
    const a = samePoint(lineA.a, pos) ? lineA.b : lineA.a;
    const b = samePoint(lineB.a, pos) ? lineB.b : lineB.a;
    const turnDeg = getJunctionAngleDeg(pos, a, b);
    const isLine = turnDeg !== null && (turnDeg <= 30 || turnDeg >= 160);

    return isLine ? "line" : "corner";
  }

  return "line";
};

export function generatePosts(
  lines: FenceLine[],
  gates: Gate[],
  panelPositionsMap: Map<string, number[]> = new Map(),
  mmPerPixel: number = 1
): Post[] {
  const SEGMENT_TOLERANCE = 0.5;

  type Adjacency = {
    pos: Point;
    edges: Array<{ lineId: string; angle: number }>;
    gateBlocked: boolean;
    source: Post["source"];
    category?: PostCategory;
  };

  const quantize = (point: Point) =>
    quantizePointMm(point, DEFAULT_POINT_QUANTIZE_STEP_MM, mmPerPixel);
  const makePointKey: PointKeyFn = (p: Point) => {
    const quantized = quantize(p);
    return `${quantized.x.toFixed(2)},${quantized.y.toFixed(2)}`;
  };
  const angleCache = new Map<string, number>();
  const adjacency = new Map<string, Adjacency>();

  const addEdge = (
    point: Point,
    line: FenceLine,
    source: Post["source"] = "vertex",
    category?: PostCategory
  ) => {
    const quantized = quantize(point);
    const key = makePointKey(quantized);
    const angle =
      angleCache.get(line.id) ??
      (() => {
        const aMeters = lngLatToMercatorMeters(line.a);
        const bMeters = lngLatToMercatorMeters(line.b);
        const a = Math.atan2(bMeters.y - aMeters.y, bMeters.x - aMeters.x);
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
      if (source === "vertex" && existing.source === "panel") {
        existing.source = "vertex";
        existing.category = undefined;
      }
      if (source === "panel" && existing.source === "panel" && category) {
        existing.category = category;
      }
      return;
    }

    adjacency.set(key, {
      pos: quantized,
      edges: [{ lineId: line.id, angle }],
      gateBlocked,
      source,
      category,
    });
  };

  lines.forEach((line) => {
    addEdge(line.a, line);
    addEdge(line.b, line);

    const panelPositions = panelPositionsMap.get(line.id) || [];
    const linePosts = getLinePosts(line, panelPositions);
    linePosts.forEach((point) => addEdge(point, line, "panel", "line"));
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

  const posts = Array.from(adjacency.values()).map((entry) => {
    const category =
      entry.source === "panel" ? entry.category ?? "line" : categorizePost(entry.pos, lines, gates);
    return {
      id: generateId("post"),
      pos: entry.pos,
      category,
      source: entry.source,
    };
  });

  posts.forEach((post) => {
    if (post.source === "panel" && post.category !== "line") {
      const key = makePointKey(post.pos);
      const connectingLines = adjacency.get(key)?.edges.length ?? 0;
      console.debug("Post category mismatch at panel boundary", {
        key,
        connectingLines,
        category: post.category,
        source: post.source,
      });
    }
  });

  return posts;
}

export function getLinePosts(
  line: FenceLine,
  panelPositions: number[]
): Point[] {
  const posts: Point[] = [];
  const totalLength_mm = line.length_mm;

  if (!totalLength_mm || totalLength_mm <= 0) return posts;

  panelPositions.forEach((pos_mm) => {
    const t = pos_mm / totalLength_mm;
    if (t > 0 && t < 1) {
      posts.push(interpolateLngLat(line.a, line.b, t));
    }
  });
  
  return posts;
}
