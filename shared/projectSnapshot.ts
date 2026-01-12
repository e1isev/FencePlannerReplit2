import { z } from "zod";

export const projectTypeSchema = z.enum([
  "decking",
  "residential_fencing",
  "rural_fencing",
  "titan_rail",
]);

export type ProjectType = z.infer<typeof projectTypeSchema>;

export const mapStateSchema = z.object({
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number(),
  bearing: z.number(),
  pitch: z.number(),
});

export type MapState = z.infer<typeof mapStateSchema>;

export const projectSnapshotV1Schema = z.object({
  version: z.literal(1),
  type: projectTypeSchema,
  name: z.string(),
  plannerState: z.unknown(),
  uiState: z.unknown().optional(),
  mapState: mapStateSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectSnapshotV1 = z.infer<typeof projectSnapshotV1Schema>;
