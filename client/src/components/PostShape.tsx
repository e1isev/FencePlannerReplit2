import React from "react";
import { Rect } from "react-konva";

import { POST_CORNER_RADIUS_MM, POST_SIZE_MM } from "@/constants/geometry";
import { PostCategory } from "@/types/models";

type PostShapeProps = {
  x: number;
  y: number;
  mmPerPixel: number;
  category: PostCategory;
  angleDeg: number;
  isSatelliteMode?: boolean;
};

export function PostShape({
  x,
  y,
  mmPerPixel,
  category,
  angleDeg,
  isSatelliteMode,
}: PostShapeProps) {
  const mmToPx = (mm: number) => (mmPerPixel > 0 ? mm / mmPerPixel : mm);

  const postSizePx = mmToPx(POST_SIZE_MM);
  const cornerRadiusPx = mmToPx(POST_CORNER_RADIUS_MM);

  const categoryColor = {
    end: "#22c55e",
    corner: "#ef4444",
    line: "#3b82f6",
    t: "#a855f7",
  }[category];

  const fillColor = isSatelliteMode ? `${categoryColor}e6` : categoryColor;
  const strokeColor = isSatelliteMode ? `${categoryColor}e6` : categoryColor;

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
