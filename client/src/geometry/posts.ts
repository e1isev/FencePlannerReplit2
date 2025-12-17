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

export function getPostNeighbours(pos: Point, lines: FenceLine[]): Point[] {
  return lines
    .filter((line) => pointsEqual(line.a, pos) || pointsEqual(line.b, pos))
    .map((line) => (pointsEqual(line.a, pos) ? line.b : line.a));
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

export function categorizePost(
  pos: Point,
  lines: FenceLine[],
  gates: Gate[]
): PostCategory {
  const connectingLines = lines.filter(
    (line) => pointsEqual(line.a, pos) || pointsEqual(line.b, pos)
  );
  
  const isNextToGate = lines.some((line) => {
    if (!line.gateId) return false;
    return pointsEqual(line.a, pos) || pointsEqual(line.b, pos);
  });
  
  if (isNextToGate || connectingLines.length === 1) {
    return "end";
  }

  if (connectingLines.length >= 2) {
    const angles = connectingLines.map((line) => {
      const otherPoint = pointsEqual(line.a, pos) ? line.b : line.a;
      return (Math.atan2(otherPoint.y - pos.y, otherPoint.x - pos.x) + 2 * Math.PI) %
        (2 * Math.PI);
    });

    if (connectingLines.length === 2) {
      const diff = Math.abs(angles[0] - angles[1]);
      const normalizedDiff = Math.min(diff, 2 * Math.PI - diff);
      const isStraight =
        normalizedDiff < 0.1 || Math.abs(normalizedDiff - Math.PI) < 0.1;

      return isStraight ? "line" : "corner";
    }

    return "corner";
  }

  return "line";
}

export function generatePosts(
  lines: FenceLine[],
  gates: Gate[],
  panelPositionsMap: Map<string, number[]> = new Map()
): Post[] {
  const postMap = new Map<string, Post>();

  lines.forEach((line) => {
    [line.a, line.b].forEach((point) => {
      const key = makePointKey(point);
      if (!postMap.has(key)) {
        const category = categorizePost(point, lines, gates);
        postMap.set(key, {
          id: generateId("post"),
          pos: point,
          category,
        });
      } else {
        const existing = postMap.get(key)!;
        existing.category = categorizePost(point, lines, gates);
      }
    });

    const panelPositions = panelPositionsMap.get(line.id) || [];
    const linePosts = getLinePosts(line, panelPositions);
    linePosts.forEach((point) => {
      const key = makePointKey(point);
      if (!postMap.has(key)) {
        postMap.set(key, {
          id: generateId("post"),
          pos: point,
          category: "line",
        });
      }
    });
  });
  
  return Array.from(postMap.values());
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
