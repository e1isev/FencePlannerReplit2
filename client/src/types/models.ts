export type ProductKind = "Decking" | "Titan rail" | "Residential fencing" | "Rural fencing";

export type FenceCategoryId = "residential" | "rural";

export type FenceColourMode = "White" | "Colour";

export type FenceStyleId =
  | "bellbrae"
  | "jabiru"
  | "kestrel"
  | "kookaburra"
  | "mystique_lattice"
  | "mystique_solid"
  | "rosella"
  | "toucan"
  | "wren"
  | "1_rail_140x40"
  | "1_rail_150x50"
  | "2_rails_140x40"
  | "2_rails_150x50"
  | "3_rails_140x40"
  | "3_rails_150x50"
  | "4_rails_140x40"
  | "4_rails_150x50"
  | "caviar_150x50"
  | "crossbuck_150x50"
  | "mesh_150x50";

export type GateType = 
  | "single_900"
  | "single_1800"
  | "double_900"
  | "double_1800"
  | "sliding_4800"
  | "opening_custom";

export interface FenceStylePricing {
  id: FenceStyleId;
  name: string;
  panel_mm: 2390;
  panel_unit_price: number;
  post_unit_price: number;
  gate_prices: {
    single_900: number;
    single_1800: number;
    double_900: number;
    double_1800: number;
    sliding_4800: number;
  };
}

export type PostCategory = "end" | "corner" | "line" | "t";

export interface Point {
  x: number;
  y: number;
}

export interface FenceLine {
  id: string;
  a: Point;
  b: Point;
  length_mm: number;
  locked_90: boolean;
  even_spacing: boolean;
  gateId?: string;
  /**
   * Optional metadata describing gates or openings along a line. Lines containing any opening or
   * gate details should be treated as non-mergeable to preserve topology.
   */
  isGateLine?: boolean;
  openings?: Array<{ id?: string; type?: string; gateId?: string; openingId?: string; [key: string]: unknown }>;
  gates?: Array<{ id?: string; type?: string; gateId?: string; openingId?: string; [key: string]: unknown }>;
  segments?: Array<{ id?: string; gateId?: string; openingId?: string; type?: string }>;
}

export interface PanelSegment {
  id: string;
  runId: string;
  start_mm: number;
  end_mm: number;
  length_mm: number;
  uses_leftover_id?: string;
  is_remainder?: boolean;
}

export interface Leftover {
  id: string;
  length_mm: number;
  consumed: boolean;
}

export interface Post {
  id: string;
  pos: Point;
  category: PostCategory;
  source: "vertex" | "panel";
}

export interface Gate {
  id: string;
  type: GateType;
  opening_mm: number;
  runId: string;
  slidingReturnDirection: "left" | "right";
  leaf_count?: number;
  leaf_width_mm?: number;
  panel_width_mm?: number;
  returnLength_mm?: number;
}

export interface WarningMsg {
  id: string;
  text: string;
  runId?: string;
  timestamp: number;
}

export interface PricingData {
  styles: FenceStylePricing[];
}
