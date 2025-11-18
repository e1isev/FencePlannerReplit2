export type ProductKind = "Decking" | "Titan rail" | "Residential fencing" | "Rural fencing";

export type FenceStyleId = "mystique_lattice" | "mystique_solid" | "wren";

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

export type PostCategory = "end" | "corner" | "line";

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
}

export interface Gate {
  id: string;
  type: GateType;
  opening_mm: number;
  runId: string;
  slidingReturnDirection: "left" | "right";
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
