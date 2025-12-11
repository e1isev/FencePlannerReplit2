import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { calculateMetersPerPixel } from "@/lib/mapScale";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface MapOverlayProps {
  onZoomChange?: (zoom: number) => void;
  onScaleChange?: (metersPerPixel: number, zoom?: number) => void;
  onPanOffsetChange?: (offset: { x: number; y: number }) => void;
  onPanReferenceReset?: () => void;
  onMapModeChange?: (mode: MapStyleMode) => void;
  mapZoom: number;
  panByDelta?: { x: number; y: number } | null;
}

export const DEFAULT_CENTER: [number, number] = [144.9834, -37.8199];

const MAP_VIEW_STORAGE_KEY = "map-overlay-view";

type StoredMapView = {
  center: [number, number];
  zoom: number;
};

function loadStoredView(): StoredMapView | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<StoredMapView>;
    if (
      !parsed ||
      !Array.isArray(parsed.center) ||
      parsed.center.length !== 2 ||
      typeof parsed.center[0] !== "number" ||
      typeof parsed.center[1] !== "number" ||
      typeof parsed.zoom !== "number"
    ) {
      return null;
    }

    return { center: parsed.center as [number, number], zoom: parsed.zoom };
  } catch (error) {
    console.warn("[MapOverlay] Failed to load stored map view", error);
    return null;
  }
}

function persistView(view: StoredMapView) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch (error) {
    console.warn("[MapOverlay] Failed to persist map view", error);
  }
}

export type MapStyleMode = "street" | "satellite";

function buildMapStyle(mode: MapStyleMode): StyleSpecification {
  const isSatellite = mode === "satellite";

  return {
    version: 8,
    sources: {
      [isSatellite ? "satellite" : "osm"]: {
        type: "raster" as const,
        tiles: isSatellite
          ? [ "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" ]
          : [ "https://tile.openstreetmap.org/{z}/{x}/{y}.png" ],
        tileSize: 256,
        attribution: isSatellite
          ? "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
          : "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: isSatellite ? "satellite" : "osm",
        type: "raster" as const,
        source: isSatellite ? "satellite" : "osm",
      },
    ],
  };
}

export function MapOverlay({
  onZoomChange,
  onScaleChange,
  onPanOffsetChange,
  onPanReferenceReset,
  onMapModeChange,
  mapZoom,
  panByDelta,
}: MapOverlayProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapStyleMode>("street");
  const initialCenterRef = useRef<maplibregl.LngLat | null>(null);
  const moveEndHandlerRef = useRef<((this: maplibregl.Map, ev: any) => void) | null>(null);

  useEffect(() => {
    onMapModeChange?.(mapMode);
  }, [mapMode, onMapModeChange]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const storedView = loadStoredView();
    const initialCenter = storedView?.center ?? DEFAULT_CENTER;
    const initialZoom = storedView?.zoom ?? mapZoom;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(mapMode),
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      bearing: 0,
      pitch: 0,
      maxPitch: 0,
    });

    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    return () => {
      map.remove();
    };
    // Don't include mapMode, so only freshly creates on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleViewChange = () => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      onZoomChange?.(zoom);
      const metersPerPixel = calculateMetersPerPixel(zoom, center.lat);
      onScaleChange?.(metersPerPixel, zoom);

      if (!initialCenterRef.current) {
        initialCenterRef.current = center;
      }

      const referenceCenter = initialCenterRef.current;
      const referencePoint = map.project(referenceCenter);
      const currentPoint = map.project(center);
      onPanOffsetChange?.({
        x: currentPoint.x - referencePoint.x,
        y: currentPoint.y - referencePoint.y,
      });
    };

    handleViewChange();
    map.on("zoom", handleViewChange);
    map.on("move", handleViewChange);

    return () => {
      map.off("zoom", handleViewChange);
      map.off("move", handleViewChange);
    };
  }, [onPanOffsetChange, onScaleChange, onZoomChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panByDelta) return;

    map.panBy([panByDelta.x, panByDelta.y], { animate: false });
  }, [panByDelta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentZoom = map.getZoom();
    if (Math.abs(currentZoom - mapZoom) < 0.001) return;

    map.easeTo({ zoom: mapZoom, duration: 0 });
  }, [mapZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(buildMapStyle(mapMode));
  }, [mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    initialCenterRef.current = center;
    onPanOffsetChange?.({ x: 0, y: 0 });
    onPanReferenceReset?.();

    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.dragPan.disable();
    map.keyboard.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    map.setPitch(0);
    map.setBearing(0);
  }, [onPanOffsetChange, onPanReferenceReset]);

  const recenterToResult = (result: SearchResult) => {
    const map = mapRef.current;
    if (!map) {
      console.warn("[MapOverlay] recenterToResult: mapRef is null");
      return;
    }

    const lat = Number(result.lat);
    const lon = Number(result.lon);
    const targetCenter = new maplibregl.LngLat(lon, lat);
    const targetZoom = 18;

    // Update search input and clear search results
    setQuery(result.display_name);
    setResults([]);

    // Tell the canvas this is the new map reference center
    onPanReferenceReset?.();
    initialCenterRef.current = targetCenter;
    onPanOffsetChange?.({ x: 0, y: 0 });

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);

    const currentCenter = map.getCenter();
    const closeEnough =
      Math.abs(currentCenter.lat - targetCenter.lat) < 1e-8 &&
      Math.abs(currentCenter.lng - targetCenter.lng) < 1e-8 &&
      Math.abs(map.getZoom() - targetZoom) < 0.001;

    if (closeEnough) {
      initialCenterRef.current = targetCenter;
      onPanReferenceReset?.();
      onPanOffsetChange?.({ x: 0, y: 0 });
      return;
    }

    // Cancel any previous animation so this one is not ignored
    map.stop();
    if (moveEndHandlerRef.current) {
      map.off("moveend", moveEndHandlerRef.current);
      moveEndHandlerRef.current = null;
    }

    const handleMoveEnd = () => {
      const settledCenter = map.getCenter();
      initialCenterRef.current = settledCenter;
      onPanReferenceReset?.();
      onPanOffsetChange?.({ x: 0, y: 0 });
      map.off("moveend", handleMoveEnd);
      moveEndHandlerRef.current = null;
    };

    moveEndHandlerRef.current = handleMoveEnd;
    map.on("moveend", handleMoveEnd);
    map.flyTo({ center: targetCenter, zoom: targetZoom });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&addressdetails=1&limit=5`
      );

      if (!res.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = (await res.json()) as SearchResult[];
      console.log("[MapOverlay] search results:", data);
      setResults(data);

      if (data.length > 0) {
        // Always recenter on the first result
        recenterToResult(data[0]);
      } else {
        setError("No matching locations found. Try a more specific address.");
      }
    } catch (err) {
      console.error("[MapOverlay] search error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to search right now."
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    recenterToResult(result);
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const toggleMapMode = () => {
    setMapMode((mode) => (mode === "street" ? "satellite" : "street"));
  };

  return (
    <div className="absolute inset-0">
      {/* Map tiles, visible but non interactive */}
      <div
        ref={mapContainerRef}
        className={cn(
          "absolute inset-0 transition-opacity opacity-90 pointer-events-none"
        )}
      />

      {/* Search and controls, on top and clickable */}
      <div className="absolute top-4 left-4 max-w-md space-y-3 z-30 pointer-events-auto">
        <Card className="p-3 shadow-lg">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Map Overlay</p>
              <p className="text-xs text-slate-500">Search an address and draw on top of the map.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">Map locked for drawing</div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address"
              className="text-sm"
            />
            <Button type="submit" size="sm" disabled={isSearching}>
              {isSearching ? "Searching" : "Search"}
            </Button>
          </form>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          {results.length > 0 && (
            <div className="mt-3 rounded-md border border-slate-200 max-h-56 overflow-auto bg-white shadow-sm">
              {results.map((result) => (
                <button
                  type="button"
                  key={`${result.lat}-${result.lon}-${result.display_name}`}
                  onClick={() => handleResultSelect(result)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Right click and drag on the canvas to pan. Use the mouse wheel to zoom while keeping your
            place on the map.
          </p>
        </Card>
      </div>

      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2 pointer-events-auto">
        <div className="flex flex-col rounded-md border border-slate-200 bg-white shadow-md overflow-hidden">
          <Button variant="ghost" size="icon" onClick={handleZoomIn} aria-label="Zoom in">
            +
          </Button>
          <div className="border-t border-slate-200" />
          <Button variant="ghost" size="icon" onClick={handleZoomOut} aria-label="Zoom out">
            -
          </Button>
        </div>
        <Button variant="secondary" size="sm" className="shadow-md" onClick={toggleMapMode}>
          {mapMode === "street" ? "Satellite view" : "Street view"}
        </Button>
      </div>
    </div>
  );
}

export default MapOverlay;
