import { FenceLine, Point, Post, PostCategory, Gate } from "@/types/models";
import { generateId } from "@/lib/ids";

function makePointKey(p: Point, decimals = 2): string {
  return `${p.x.toFixed(decimals)},${p.y.toFixed(decimals)}`;
}

function pointsEqual(a: Point, b: Point): boolean {
  return makePointKey(a) === makePointKey(b);
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
