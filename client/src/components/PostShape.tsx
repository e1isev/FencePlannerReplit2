import React from "react";
import { Rect } from "react-konva";

import { POST_CORNER_RADIUS_MM, POST_SIZE_MM } from "@/constants/geometry";
import { getPostAngleDeg } from "@/geometry/posts";
import { Point } from "@/types/models";

type PostShapeProps = {
  x: number;
  y: number;
  neighbours: Array<Point>;
  mmPerPixel: number;
  isSatelliteMode?: boolean;
};

export function PostShape({
  x,
  y,
  neighbours,
  mmPerPixel,
  isSatelliteMode,
}: PostShapeProps) {
  const mmToPx = (mm: number) => (mmPerPixel > 0 ? mm / mmPerPixel : mm);

  const postSizePx = mmToPx(POST_SIZE_MM);
  const cornerRadiusPx = mmToPx(POST_CORNER_RADIUS_MM);

  const angleDeg = getPostAngleDeg({ x, y }, neighbours);

  const stroke = isSatelliteMode
    ? "rgba(255,255,255,0.9)"
    : "rgba(0,0,0,0.8)";
  const fill = "rgba(255,255,255,0.15)";

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
      fill={fill}
      stroke={stroke}
      strokeWidth={2}
      strokeScaleEnabled={false}
      name="post"
      hitStrokeWidth={8}
      listening={true}
    />
  );
}

