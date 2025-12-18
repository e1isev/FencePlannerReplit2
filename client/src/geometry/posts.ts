import { FenceLine, Point, Post, PostCategory, Gate } from "@/types/models";
import { generateId } from "@/lib/ids";
import { DEFAULT_POINT_QUANTIZE_STEP_MM, quantizePointMm } from "@/geometry/coordinates";

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

function samePoint(a: Point, b: Point, eps = POINT_EPS_MM) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

const STRAIGHT_EPS = 0.1;
const RIGHT_ANGLE = Math.PI / 2;
const CORNER_ANGLE_EPS = Math.PI / 12;

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
  const keyForPoint: PointKeyFn = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

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

const categorizePost = (pos: Point, lines: FenceLine[]): PostCategory => {
  const connectingLines = lines.filter((l) => samePoint(l.a, pos) || samePoint(l.b, pos));

  // Treat gate segments as not panels for T post logic
  const panelConnections = connectingLines.filter((l) => !l.gateId);

  // If 3 or 4 panels meet, it is a T post
  if (panelConnections.length >= 3) return "t";

  // Gate adjacency still forces end posts for gate openings
  const isNextToGate = connectingLines.some((l) => l.gateId);
  if (isNextToGate) return "end";

  // One connected panel segment means end post
  if (panelConnections.length === 1) return "end";

  if (panelConnections.length === 2) {
    const angleForLine = (line: FenceLine) => {
      const target = samePoint(line.a, pos) ? line.b : line.a;
      return Math.atan2(target.y - pos.y, target.x - pos.x);
    };

    const [lineA, lineB] = panelConnections;
    const angleA = angleForLine(lineA);
    const angleB = angleForLine(lineB);
    const diff = Math.abs(angleA - angleB);
    const normalizedDiff = Math.min(diff, 2 * Math.PI - diff);
    const isStraight =
      normalizedDiff < STRAIGHT_EPS || Math.abs(normalizedDiff - Math.PI) < STRAIGHT_EPS;
    if (isStraight) return "line";

    const isCorner = Math.abs(normalizedDiff - RIGHT_ANGLE) <= CORNER_ANGLE_EPS;
    return isCorner ? "corner" : "line";
  }

  return "line";
};

export function generatePosts(
  lines: FenceLine[],
  _gates: Gate[],
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
      entry.source === "panel" ? entry.category ?? "line" : categorizePost(entry.pos, lines);
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
