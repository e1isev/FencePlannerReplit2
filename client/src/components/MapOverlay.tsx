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
  place_id?: number;
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

const MAPTILER_API_KEY =
  import.meta.env.VITE_MAPTILER_API_KEY ??
  (typeof process !== "undefined"
    ? ((process.env.MAPTILER_API_KEY as string | undefined) ?? undefined)
    : undefined) ??
  "ZDlkZTEyMmQtNWNiZi00ZGM3LWIzMDAtODFjNGYxOGZhNTYx";

if (!MAPTILER_API_KEY) {
  console.warn(
    "[MapOverlay] MAPTILER_API_KEY is not set. Falling back to the existing satellite tiles."
  );
}

const MAPTILER_SATELLITE_TILES = MAPTILER_API_KEY
  ? `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}@2x.jpg?key=${MAPTILER_API_KEY}`
  : null;

const FALLBACK_SATELLITE_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Highest zoom at which satellite tiles are expected to exist globally.
// This should match the raster source "maxzoom" you use for satellite imagery.
const SATELLITE_NATIVE_MAX_ZOOM = 20;

// How many levels of over-zoom we normally allow on top of the native max.
const GLOBAL_OVERZOOM = 2;

// Hard ceiling on the map zoom in any area.
const GLOBAL_HARD_MAX_ZOOM = SATELLITE_NATIVE_MAX_ZOOM + GLOBAL_OVERZOOM;

// Zoom level for our "area buckets" – coarse tiling to group nearby positions.
const AREA_BUCKET_ZOOM = 10;

const MAP_VIEW_STORAGE_KEY = "map-overlay-view";
const MIN_QUERY_LENGTH = 3;

type TileCoord = { x: number; y: number; z: number };

function lngLatToTile(lng: number, lat: number, zoom: number): TileCoord {
  const z = zoom;
  const scale = Math.pow(2, z);

  const x = Math.floor(((lng + 180) / 360) * scale);

  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      scale
  );

  return { x, y, z };
}

function areaKeyForCenter(lng: number, lat: number): string {
  const tile = lngLatToTile(lng, lat, AREA_BUCKET_ZOOM);
  return `${tile.z}/${tile.x}/${tile.y}`;
}

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
  const satelliteTileTemplate = MAPTILER_SATELLITE_TILES ?? FALLBACK_SATELLITE_TILES;
  const satelliteTileSize = MAPTILER_SATELLITE_TILES ? 512 : 256;
  const satelliteAttribution = MAPTILER_SATELLITE_TILES
    ? "© MapTiler © OpenStreetMap contributors"
    : "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics";

  return {
    version: 8,
    sources: {
      [isSatellite ? "satellite" : "osm"]: {
        type: "raster" as const,
        tiles: isSatellite
          ? [satelliteTileTemplate]
          : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: isSatellite ? satelliteTileSize : 256,
        ...(isSatellite ? { maxzoom: SATELLITE_NATIVE_MAX_ZOOM } : {}),
        attribution: isSatellite ? satelliteAttribution : "© OpenStreetMap contributors",
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
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapStyleMode>("street");
  const initialCenterRef = useRef<maplibregl.LngLat | null>(null);
  const moveEndHandlerRef = useRef<((this: maplibregl.Map, ev: any) => void) | null>(null);
  // Cache of per-area safe max zooms.
  // Key: `${z}/${x}/${y}` at AREA_BUCKET_ZOOM.
  // Value: safe max zoom level for that area.
  const areaZoomLimitsRef = useRef<Record<string, number>>({});

  // Global fallback if no entry exists for the current area.
  const defaultSafeMaxZoomRef = useRef<number>(GLOBAL_HARD_MAX_ZOOM);

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
      maxZoom: GLOBAL_HARD_MAX_ZOOM,
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

    const handleError = (e: any) => {
      const sourceId = e?.sourceId || e?.error?.sourceId;
      if (sourceId !== "satellite") {
        return;
      }

      const zoom = map.getZoom();
      const center = map.getCenter();
      const key = areaKeyForCenter(center.lng, center.lat);

      if (zoom <= SATELLITE_NATIVE_MAX_ZOOM) {
        return;
      }

      const currentLimits = areaZoomLimitsRef.current;
      const existingLimit =
        currentLimits[key] ?? defaultSafeMaxZoomRef.current ?? GLOBAL_HARD_MAX_ZOOM;

      const newLimit = Math.max(SATELLITE_NATIVE_MAX_ZOOM, Math.floor(zoom) - 1);

      if (newLimit < existingLimit) {
        currentLimits[key] = newLimit;
        areaZoomLimitsRef.current = { ...currentLimits };

        if (map.getZoom() > newLimit) {
          map.easeTo({ zoom: newLimit });
        }
      }
    };

    map.on("error", handleError);

    return () => {
      map.off("error", handleError);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleZoomEnd = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();

      const key = areaKeyForCenter(center.lng, center.lat);
      const areaLimits = areaZoomLimitsRef.current;

      const areaSafeMax =
        areaLimits[key] ?? defaultSafeMaxZoomRef.current ?? GLOBAL_HARD_MAX_ZOOM;

      const effectiveSafeMax = Math.min(areaSafeMax, GLOBAL_HARD_MAX_ZOOM);

      if (zoom > effectiveSafeMax) {
        map.easeTo({ zoom: effectiveSafeMax });
      }
    };

    map.on("zoomend", handleZoomEnd);

    return () => {
      map.off("zoomend", handleZoomEnd);
    };
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

    map.setMaxZoom(GLOBAL_HARD_MAX_ZOOM);
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

    setQuery(result.display_name);
    setResults([]);

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);

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

    map.flyTo({
      center: targetCenter,
      zoom: targetZoom,
    });
  };

  const handleSearchChange = async (value: string, reselectFirst = false) => {
    setQuery(value);

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      return;
    }

    setIsSearchLoading(true);
    setError(null);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
        trimmed
      )}`;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.error("[MapOverlay] search request failed", res.status);
        setResults([]);
        return;
      }

      const data = (await res.json()) as SearchResult[];

      setResults(Array.isArray(data) ? data : []);

      if (reselectFirst && Array.isArray(data) && data.length > 0) {
        recenterToResult(data[0]);
      } else if (Array.isArray(data) && data.length === 0) {
        setError("No matching locations found. Try a more specific address.");
      }
    } catch (err) {
      console.error("[MapOverlay] search error:", err);
      setResults([]);
      setError(
        err instanceof Error ? err.message : "Unable to search right now."
      );
    } finally {
      setIsSearchLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    await handleSearchChange(query, true);
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
      <div className="absolute top-4 left-4 max-w-md space-y-3 z-50 pointer-events-auto">
        <Card className="p-3 shadow-lg relative overflow-visible">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Map Overlay</p>
              <p className="text-xs text-slate-500">Search an address and draw on top of the map.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">Map locked for drawing</div>
          </div>

          <form onSubmit={handleSearch} className="space-y-2 relative">
            <div className="flex gap-2 relative z-10">
              <Input
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search address"
                className="text-sm"
              />
              <Button type="submit" size="sm" disabled={isSearchLoading}>
                {isSearchLoading ? "Searching" : "Search"}
              </Button>
            </div>

            {(isSearchLoading || results.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg z-20">
                {isSearchLoading && (
                  <div className="px-3 py-2 text-sm text-slate-600">Searching…</div>
                )}

                {!isSearchLoading &&
                  results.map((result, index) => (
                    <button
                      type="button"
                      key={`${result.place_id ?? index}-${result.lat}-${result.lon}`}
                      onClick={() => handleResultSelect(result)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      {result.display_name}
                    </button>
                  ))}
              </div>
            )}
          </form>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

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
