import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { calculateMetersPerPixel } from "@/lib/mapScale";
import {
  MIN_QUERY_LENGTH,
  useAddressAutocomplete,
  type AddressSuggestion,
} from "@/hooks/use-address-autocomplete";

type SearchResult = AddressSuggestion;

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

type SatelliteProvider = "nearmap" | "maptiler" | "esri";

const MAPTILER_API_KEY =
  import.meta.env.VITE_MAPTILER_API_KEY ??
  (typeof process !== "undefined"
    ? ((process.env.VITE_MAPTILER_API_KEY as string | undefined) ?? undefined)
    : undefined);

const SATELLITE_PROVIDER_ENV =
  (import.meta.env.VITE_SATELLITE_PROVIDER as SatelliteProvider | undefined) ??
  (typeof process !== "undefined"
    ? (process.env.VITE_SATELLITE_PROVIDER as SatelliteProvider | undefined)
    : undefined);

if (!MAPTILER_API_KEY) {
  console.warn(
    "[MapOverlay] MAPTILER_API_KEY is not set. Falling back to Esri imagery when MapTiler is unavailable."
  );
}

const MAPTILER_SATELLITE_TILES = MAPTILER_API_KEY
  ? `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}@2x.jpg?key=${MAPTILER_API_KEY}`
  : null;

const FALLBACK_SATELLITE_TILES =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Highest zoom at which satellite tiles are expected to exist globally.
// This should match the raster source "maxzoom" you use for satellite imagery.
// Keep conservative to avoid 404 gaps from providers that top out around z20.
const SATELLITE_NATIVE_MAX_ZOOM = 19;

// How many levels of over-zoom we normally allow on top of the native max.
// Nearmap supports up to zoom 21, so do not over-zoom.
const GLOBAL_OVERZOOM = 0;

// Hard ceiling on the map zoom in any area.
const GLOBAL_HARD_MAX_ZOOM = SATELLITE_NATIVE_MAX_ZOOM + GLOBAL_OVERZOOM;

const MAP_MIN_ZOOM = 0;
const NEARMAP_TILE_URL_TEMPLATE = "/api/nearmap/tiles/{z}/{x}/{y}.jpg";

// Zoom level for our "area buckets" – coarse tiling to group nearby positions.
const AREA_BUCKET_ZOOM = 10;

const MAP_VIEW_STORAGE_KEY = "map-overlay-view";

const PROVIDER_LABELS: Record<SatelliteProvider, string> = {
  nearmap: "Nearmap",
  maptiler: "MapTiler",
  esri: "Esri",
};

const PROVIDER_ORDER: SatelliteProvider[] = (() => {
  const base: SatelliteProvider[] = ["nearmap", "maptiler", "esri"];
  if (SATELLITE_PROVIDER_ENV && base.includes(SATELLITE_PROVIDER_ENV)) {
    return [
      SATELLITE_PROVIDER_ENV,
      ...base.filter((provider) => provider !== SATELLITE_PROVIDER_ENV),
    ];
  }
  return base;
})();

type SatelliteSourceConfig = {
  tiles: string[];
  tileSize: number;
  attribution: string;
};

type TileCoord = { x: number; y: number; z: number };

function providerLabel(provider: SatelliteProvider) {
  return PROVIDER_LABELS[provider];
}

function tileTemplateForProvider(provider: SatelliteProvider): string | null {
  switch (provider) {
    case "nearmap":
      return NEARMAP_TILE_URL_TEMPLATE;
    case "maptiler":
      return MAPTILER_SATELLITE_TILES;
    case "esri":
    default:
      return FALLBACK_SATELLITE_TILES;
  }
}

function satelliteSourceForProvider(provider: SatelliteProvider): SatelliteSourceConfig {
  const template = tileTemplateForProvider(provider);

  if (provider === "maptiler" && template) {
    return {
      tiles: [template],
      tileSize: 512,
      attribution: "© MapTiler © OpenStreetMap contributors",
    };
  }

  if (provider === "nearmap" && template) {
    return {
      tiles: [template],
      tileSize: 256,
      attribution: "Tiles © Nearmap",
    };
  }

  return {
    tiles: [FALLBACK_SATELLITE_TILES],
    tileSize: 256,
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
  };
}

function applyTileTemplate(template: string, coords: TileCoord): string {
  return template
    .replace(/{z}/g, String(coords.z))
    .replace(/{x}/g, String(coords.x))
    .replace(/{y}/g, String(coords.y));
}

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

function moveMapInstant(
  map: maplibregl.Map,
  center: [number, number],
  zoom?: number
) {
  const z =
    zoom == null
      ? map.getZoom()
      : Math.max(MAP_MIN_ZOOM, Math.min(zoom, GLOBAL_HARD_MAX_ZOOM));

  map.stop();
  map.jumpTo({ center, zoom: z });
}

function moveWhenReady(
  map: maplibregl.Map,
  center: [number, number],
  zoom?: number
) {
  if (map.loaded()) {
    moveMapInstant(map, center, zoom);
    return;
  }

  map.once("load", () => moveMapInstant(map, center, zoom));
}

export type MapStyleMode = "street" | "satellite";

function buildMapStyle(
  mode: MapStyleMode,
  satelliteProvider: SatelliteProvider
): StyleSpecification {
  const isSatellite = mode === "satellite";
  const satelliteSource = satelliteSourceForProvider(satelliteProvider);

  const osmSource = {
    type: "raster" as const,
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors",
  };

  const sources: StyleSpecification["sources"] = isSatellite
    ? {
        satellite: {
          type: "raster" as const,
          tiles: satelliteSource.tiles,
          tileSize: satelliteSource.tileSize,
          minzoom: 0,
          maxzoom: SATELLITE_NATIVE_MAX_ZOOM,
          scheme: "xyz",
          attribution: satelliteSource.attribution,
        },
        osm: osmSource,
      }
    : {
        osm: osmSource,
      };

  const layers: StyleSpecification["layers"] = isSatellite
    ? [
        {
          id: "background",
          type: "background" as const,
          paint: {
            "background-color": "#eaf2ff",
          },
        },
        {
          id: "osm",
          type: "raster" as const,
          source: "osm",
          paint: {
            "raster-opacity": 1,
          },
        },
        {
          id: "satellite",
          type: "raster" as const,
          source: "satellite",
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 0,
          },
        },
      ]
    : [
        {
          id: "background",
          type: "background" as const,
          paint: {
            "background-color": "#eaf2ff",
          },
        },
        {
          id: "osm",
          type: "raster" as const,
          source: "osm",
          paint: {
            "raster-opacity": 1,
          },
        },
      ];

  return {
    version: 8,
    sources,
    layers,
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
  const flyLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapMode, setMapMode] = useState<MapStyleMode>("street");
  const [satelliteProvider, setSatelliteProvider] = useState<SatelliteProvider>("esri");
  const [satelliteWarning, setSatelliteWarning] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const mapCenterValue = useMemo(
    () => (mapCenter ? { lng: mapCenter[0], lat: mapCenter[1] } : null),
    [mapCenter]
  );
  const { suggestions, isLoading: isSearchLoading, error } = useAddressAutocomplete(
    query,
    mapCenterValue
  );
  const initialCenterRef = useRef<maplibregl.LngLat | null>(null);
  const moveEndHandlerRef = useRef<((this: maplibregl.Map, ev: any) => void) | null>(null);
  // Cache of per-area safe max zooms.
  // Key: `${z}/${x}/${y}` at AREA_BUCKET_ZOOM.
  // Value: safe max zoom level for that area.
  const areaZoomLimitsRef = useRef<Record<string, number>>({});

  const providerOrderRef = useRef<SatelliteProvider[]>(PROVIDER_ORDER);
  const mapModeRef = useRef<MapStyleMode>(mapMode);
  const satelliteProviderRef = useRef<SatelliteProvider>(satelliteProvider);
  const providerCheckIdRef = useRef(0);

  // Global fallback if no entry exists for the current area.
  const defaultSafeMaxZoomRef = useRef<number>(GLOBAL_HARD_MAX_ZOOM);

  const getTileCoordForCurrentView = useCallback((): TileCoord => {
    const map = mapRef.current;
    const center = map?.getCenter() ?? new maplibregl.LngLat(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    const zoom = map?.getZoom() ?? mapZoom;
    const clampedZoom = Math.max(
      MAP_MIN_ZOOM,
      Math.min(Math.round(zoom), SATELLITE_NATIVE_MAX_ZOOM)
    );

    return lngLatToTile(center.lng, center.lat, clampedZoom);
  }, [mapZoom]);

  const isProviderUsable = useCallback(
    async (provider: SatelliteProvider, coords: TileCoord) => {
      const template = tileTemplateForProvider(provider);
      if (!template) return false;

      const tileUrl = applyTileTemplate(template, coords);

      try {
        const response = await fetch(tileUrl, { method: "GET", cache: "no-store" });
        return response.ok && (response.headers.get("content-type")?.startsWith("image/") ?? true);
      } catch (err) {
        console.warn(`[MapOverlay] Failed to reach ${providerLabel(provider)} tiles`, err);
        return false;
      }
    },
    []
  );

  const ensureSatelliteProvider = useCallback(
    async (startIndex = 0, failureReason?: string) => {
      if (mapModeRef.current !== "satellite") return;

      providerCheckIdRef.current += 1;
      const checkId = providerCheckIdRef.current;

      const coords = getTileCoordForCurrentView();
      let warning = failureReason ?? null;

      for (let i = startIndex; i < providerOrderRef.current.length; i++) {
        const provider = providerOrderRef.current[i];

        if (provider === "maptiler" && !MAPTILER_SATELLITE_TILES) {
          warning = warning ?? "MapTiler API key not configured.";
          continue;
        }

        const usable = await isProviderUsable(provider, coords);

        if (providerCheckIdRef.current !== checkId) {
          return;
        }

        if (usable) {
          setSatelliteProvider(provider);
          setSatelliteWarning(
            warning && (i > startIndex || !!failureReason)
              ? `${warning} Falling back to ${providerLabel(provider)} imagery.`
              : warning
          );
          return;
        }

        warning = `Satellite provider ${providerLabel(provider)} is unavailable.`;
      }

      setSatelliteProvider("esri");
      setSatelliteWarning(
        warning
          ? `${warning} Using Esri imagery as a fallback.`
          : "Using Esri imagery as a fallback."
      );
    },
    [getTileCoordForCurrentView, isProviderUsable]
  );

  const handleProviderFailure = useCallback(
    (reason: string) => {
      const currentIndex = providerOrderRef.current.indexOf(satelliteProviderRef.current);
      const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 1;
      ensureSatelliteProvider(nextIndex, reason);
    },
    [ensureSatelliteProvider]
  );

  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);

  useEffect(() => {
    satelliteProviderRef.current = satelliteProvider;
  }, [satelliteProvider]);

  useEffect(() => {
    onMapModeChange?.(mapMode);
  }, [mapMode, onMapModeChange]);

  useEffect(() => {
    if (mapMode === "satellite") {
      ensureSatelliteProvider();
    } else {
      setSatelliteWarning(null);
    }
  }, [ensureSatelliteProvider, mapMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const storedView = loadStoredView();
    const initialCenter = storedView?.center ?? DEFAULT_CENTER;
    const initialZoom = storedView?.zoom ?? mapZoom;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(mapMode, satelliteProviderRef.current),
      center: initialCenter,
      zoom: initialZoom,
      minZoom: MAP_MIN_ZOOM,
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
      mapRef.current = null;
    };
    // Don't include mapMode, so only freshly creates on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ensureNearmapLayer = () => {
      if (!map.isStyleLoaded()) return;

      if (!map.getSource("nearmap")) {
        map.addSource("nearmap", {
          type: "raster",
          tiles: [NEARMAP_TILE_URL_TEMPLATE],
          tileSize: 256,
          minzoom: MAP_MIN_ZOOM,
          maxzoom: GLOBAL_HARD_MAX_ZOOM,
          scheme: "xyz",
        });
      }

      if (!map.getLayer("nearmap")) {
        map.addLayer({
          id: "nearmap",
          type: "raster",
          source: "nearmap",
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 0,
          },
        });
      }

      const shouldShow =
        mapModeRef.current === "satellite" &&
        satelliteProviderRef.current === "nearmap";

      map.setLayoutProperty("nearmap", "visibility", shouldShow ? "visible" : "none");
      map.moveLayer("nearmap");
    };

    map.on("load", ensureNearmapLayer);
    ensureNearmapLayer();

    return () => {
      map.off("load", ensureNearmapLayer);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleError = (e: any) => {
      const sourceId = e?.sourceId || e?.error?.sourceId;
      if (sourceId !== "satellite") {
        return;
      }

      const status = e?.error?.status || e?.error?.statusCode;
      const url = e?.error?.url || e?.tile?.url;
      const message = e?.error?.message || e?.message;

      console.warn("[MapOverlay] Satellite tile error", {
        message,
        status,
        url,
        sourceId,
      });

      if (
        mapModeRef.current === "satellite" &&
        typeof status === "number" &&
        status >= 400
      ) {
        handleProviderFailure(
          `Satellite provider ${providerLabel(
            satelliteProviderRef.current
          )} returned status ${status}.`
        );
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
  }, [handleProviderFailure]);

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
      setMapCenter([center.lng, center.lat]);
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
  }, [onPanOffsetChange, onScaleChange, onZoomChange, setMapCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panByDelta) return;

    map.panBy([panByDelta.x, panByDelta.y], { animate: false });
  }, [panByDelta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentZoom = map.getZoom();
    const clampedZoom = Math.max(
      MAP_MIN_ZOOM,
      Math.min(mapZoom, GLOBAL_HARD_MAX_ZOOM)
    );
    if (Math.abs(currentZoom - clampedZoom) < 0.001) return;

    map.easeTo({ zoom: clampedZoom, duration: 0 });
  }, [mapZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setMaxZoom(GLOBAL_HARD_MAX_ZOOM);
    map.setMinZoom(MAP_MIN_ZOOM);
    map.setStyle(buildMapStyle(mapMode, satelliteProvider));
  }, [mapMode, satelliteProvider]);

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

  const flyToSearchResult = useCallback(
    (lon: number, lat: number, desiredZoom = 18) => {
      const map = mapRef.current;
      if (!map) {
        console.warn("[MapOverlay] flyToSearchResult: mapRef is null");
        return;
      }

      if (flyLockRef.current) {
        return;
      }

      flyLockRef.current = true;

      const safeZoom = Math.min(desiredZoom ?? 18, GLOBAL_HARD_MAX_ZOOM);

      if (moveEndHandlerRef.current) {
        map.off("moveend", moveEndHandlerRef.current);
        moveEndHandlerRef.current = null;
      }

      const unlock = () => {
        const settledCenter = map.getCenter();
        initialCenterRef.current = settledCenter;
        onPanReferenceReset?.();
        onPanOffsetChange?.({ x: 0, y: 0 });
        flyLockRef.current = false;
        map.off("moveend", unlock);
        moveEndHandlerRef.current = null;
      };

      moveEndHandlerRef.current = unlock;
      map.on("moveend", unlock);

      moveWhenReady(map, [lon, lat], safeZoom);
    },
    [onPanOffsetChange, onPanReferenceReset]
  );

  const recenterToResult = (result: SearchResult) => {
    const map = mapRef.current;
    if (!map) {
      console.warn("[MapOverlay] recenterToResult: mapRef is null");
      return;
    }

    const lat = Number(result.lat);
    const lon = Number(result.lon);

    setQuery(result.display_name);
    setIsDropdownOpen(false);
    setActiveIndex(-1);

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);

    flyToSearchResult(lon, lat, 18);
  };

  useEffect(() => {
    if (!isDropdownOpen) return;

    if (suggestions.length > 0) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [isDropdownOpen, suggestions]);

  const handleSearchChange = (value: string) => {
    setQuery(value);

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      return;
    }

    setIsDropdownOpen(true);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
      }

      if (suggestions.length > 0) {
        setActiveIndex((prev) => ((prev + 1) % suggestions.length + suggestions.length) % suggestions.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
      }

      if (suggestions.length > 0) {
        setActiveIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : (prev - 1 + suggestions.length) % suggestions.length
        );
      }
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        handleResultSelect(suggestions[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleInputFocus = () => {
    if (query.trim().length >= MIN_QUERY_LENGTH) {
      setIsDropdownOpen(true);
    }
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement === inputRef.current || resultsListRef.current?.contains(activeElement))
      ) {
        return;
      }

      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }, 0);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    setIsDropdownOpen(true);

    const result =
      (activeIndex >= 0 && suggestions[activeIndex]) || suggestions[0];
    if (result) {
      recenterToResult(result);
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
          "absolute inset-0 transition-opacity opacity-90 pointer-events-none bg-[#eaf2ff]"
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
                onKeyDown={handleInputKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                ref={inputRef}
                placeholder="Search address"
                className="text-sm"
              />
              <Button type="submit" size="sm" disabled={isSearchLoading}>
                {isSearchLoading ? "Searching" : "Search"}
              </Button>
            </div>

            {isDropdownOpen && (isSearchLoading || suggestions.length > 0 || error) && (
              <div
                ref={resultsListRef}
                className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg z-20"
              >
                {isSearchLoading && (
                  <div className="px-3 py-2 text-sm text-slate-600">Searching…</div>
                )}

                {error && (
                  <div className="px-3 py-2 text-sm text-red-600">{error}</div>
                )}

                {suggestions.map((result, index) => (
                  <button
                    type="button"
                    key={`${result.place_id ?? index}-${result.lat}-${result.lon}`}
                    onClick={() => handleResultSelect(result)}
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm",
                      activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50"
                    )}
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </form>

          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Right click and drag on the canvas to pan. Use the mouse wheel to zoom while keeping your
            place on the map.
          </p>
        </Card>

        {mapMode === "satellite" && satelliteWarning && (
          <div className="p-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md shadow-sm">
            {satelliteWarning}
          </div>
        )}
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
