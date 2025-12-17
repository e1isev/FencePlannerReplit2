import React from "react";
import { Rect } from "react-konva";

import { POST_CORNER_RADIUS_MM, POST_SIZE_MM } from "@/constants/geometry";
import { getPostAngleDeg } from "@/geometry/posts";
import { FenceLine, Point, PostCategory } from "@/types/models";

type PostShapeProps = {
  x: number;
  y: number;
  neighbours: Array<Point>;
  mmPerPixel: number;
  category: PostCategory;
  lines: FenceLine[];
  isSatelliteMode?: boolean;
};

export function PostShape({
  x,
  y,
  neighbours,
  mmPerPixel,
  category,
  lines,
  isSatelliteMode,
}: PostShapeProps) {
  const mmToPx = (mm: number) => (mmPerPixel > 0 ? mm / mmPerPixel : mm);

  const postSizePx = mmToPx(POST_SIZE_MM);
  const cornerRadiusPx = mmToPx(POST_CORNER_RADIUS_MM);

  const angleDeg = getPostAngleDeg({ x, y }, neighbours, lines, category);

  const getPostColors = (type: PostCategory) => {
    switch (type) {
      case "end":
        return { fill: "#10b981", stroke: "#059669" };
      case "corner":
        return { fill: "#ef4444", stroke: "#dc2626" };
      case "t":
        return { fill: "#f97316", stroke: "#ea580c" };
      case "line":
      default:
        return { fill: "#3b82f6", stroke: "#2563eb" };
    }
  };

  const { fill, stroke } = getPostColors(category);
  const fillColor = isSatelliteMode ? `${fill}e6` : fill;
  const strokeColor = isSatelliteMode ? `${stroke}e6` : stroke;

  return (
    <Rect
      x={x}
      y={y}
      width={postSizePx}
      height={postSizePx}
      offsetX={postSizePx / 2}
      offsetY={postSizePx / 2}
      rotation={angleDeg}
      cornerRadius={cornerRadiusPx}
      fill={fillColor}
      stroke={strokeColor}
      strokeWidth={2}
      strokeScaleEnabled={false}
      name="post"
      hitStrokeWidth={8}
      listening={true}
    />
  );
}
