import { FenceLine, Point, Post, PostCategory, Gate } from "@/types/models";
import { generateId } from "@/lib/ids";

const TOLERANCE = 1;

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < TOLERANCE && Math.abs(a.y - b.y) < TOLERANCE;
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
      return Math.atan2(otherPoint.y - pos.y, otherPoint.x - pos.x);
    });
    
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        let diff = Math.abs(angles[i] - angles[j]);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        
        const isRightAngle = Math.abs(diff - Math.PI / 2) < 0.1;
        if (isRightAngle) {
          return "corner";
        }
      }
    }
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
      const key = `${Math.round(point.x)},${Math.round(point.y)}`;
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
      const key = `${Math.round(point.x)},${Math.round(point.y)}`;
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

const SCALE_FACTOR = 10;

export function getLinePosts(
  line: FenceLine,
  panelPositions: number[]
): Point[] {
  const posts: Point[] = [];
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length_px = Math.sqrt(dx * dx + dy * dy);
  
  panelPositions.forEach((pos_mm) => {
    const pos_px = pos_mm / SCALE_FACTOR;
    const t = pos_px / length_px;
    if (t > 0 && t < 1) {
      posts.push({
        x: line.a.x + dx * t,
        y: line.a.y + dy * t,
      });
    }
  });
  
  return posts;
}
