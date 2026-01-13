import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { calculateMetersPerPixel } from "@/lib/mapScale";
import { geocode } from "@/lib/geocode";
import {
  MIN_QUERY_LENGTH,
  useAddressAutocomplete,
  type AddressSuggestion,
} from "@/hooks/use-address-autocomplete";
import { aflVenues } from "@/data/aflVenues";
import { useMapViewportStore } from "@/store/mapViewportStore";

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
// Keep the UI max higher so the map can overscale after the provider tops out.
const SATELLITE_NATIVE_MAX_ZOOM = 22;
const NEARMAP_MIN_ZOOM = 3;
const NEARMAP_MAX_ZOOM = 21;

const MAP_MIN_ZOOM = 0;
const MAP_MAX_ZOOM = 24;
const NEARMAP_TILE_URL_TEMPLATE = "/api/nearmap/tiles/{z}/{x}/{y}.jpg";

const PROVIDER_CAPABILITIES: Record<
  SatelliteProvider,
  { maxZoom: number; maxImageSizePx: number }
> = {
  nearmap: { maxZoom: NEARMAP_MAX_ZOOM, maxImageSizePx: 2048 },
  maptiler: { maxZoom: SATELLITE_NATIVE_MAX_ZOOM, maxImageSizePx: 4096 },
  esri: { maxZoom: 20, maxImageSizePx: 4096 },
};

const PROVIDER_MIN_ZOOM: Record<SatelliteProvider, number> = {
  nearmap: NEARMAP_MIN_ZOOM,
  maptiler: MAP_MIN_ZOOM,
  esri: MAP_MIN_ZOOM,
};

const BASE_SATELLITE_PROVIDER: SatelliteProvider = "esri";

const MAP_VIEW_STORAGE_KEY = "lastMapViewport";
const DEFAULT_VENUE_STORAGE_KEY = "defaultVenueId";

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
  maxZoom: number;
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

function clampZoomForProvider(provider: SatelliteProvider, zoom: number) {
  const providerZoom = PROVIDER_CAPABILITIES[provider]?.maxZoom ?? MAP_MAX_ZOOM;
  const providerMinZoom = PROVIDER_MIN_ZOOM[provider] ?? MAP_MIN_ZOOM;
  return Math.max(providerMinZoom, Math.min(zoom, providerZoom));
}

function maxZoomForMode(mode: MapStyleMode, provider: SatelliteProvider) {
  if (mode === "satellite") {
    return PROVIDER_CAPABILITIES[provider]?.maxZoom ?? MAP_MAX_ZOOM;
  }
  return MAP_MAX_ZOOM;
}

async function isTileMostlyEmpty(blob: Blob): Promise<boolean> {
  if (typeof document === "undefined") return false;

  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const samplesPerAxis = 5;
    const totalSamples = samplesPerAxis * samplesPerAxis;
    let emptySamples = 0;

    for (let x = 0; x < samplesPerAxis; x++) {
      for (let y = 0; y < samplesPerAxis; y++) {
        const sampleX = Math.floor(((x + 0.5) / samplesPerAxis) * canvas.width);
        const sampleY = Math.floor(((y + 0.5) / samplesPerAxis) * canvas.height);
        const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        const a = pixel[3];

        const isTransparent = a < 5;
        const isBlack = r < 6 && g < 6 && b < 6;
        const isWhite = r > 250 && g > 250 && b > 250;
        if (isTransparent || isBlack || isWhite) {
          emptySamples += 1;
        }
      }
    }

    return emptySamples / totalSamples >= 0.7;
  } catch (error) {
    console.warn("[MapOverlay] Failed to evaluate tile opacity", error);
    return false;
  }
}

function isDevEnvironment() {
  if (typeof import.meta !== "undefined" && "env" in import.meta) {
    // @ts-ignore Vite injects env
    return Boolean(import.meta.env?.DEV);
  }
  return process.env.NODE_ENV === "development";
}

function logNearmapRejection(params: {
  status?: number;
  url?: string;
  zoom: number;
  center: { lng: number; lat: number };
  coords?: TileCoord | null;
  tileSize?: number;
  message?: string;
}) {
  if (!isDevEnvironment()) return;

  const { status, url, zoom, center, coords, message } = params;
  const tileSize = params.tileSize ?? satelliteSourceForProvider("nearmap").tileSize;

  console.warn("[MapOverlay] Nearmap request rejected", {
    provider: "nearmap",
    zoom,
    width: tileSize,
    height: tileSize,
    center,
    coords,
    status,
    url,
    message,
  });
}

function satelliteSourceForProvider(provider: SatelliteProvider): SatelliteSourceConfig {
  const template = tileTemplateForProvider(provider);

  if (provider === "maptiler" && template) {
    return {
      tiles: [template],
      tileSize: 512,
      attribution: "© MapTiler © OpenStreetMap contributors",
      maxZoom: SATELLITE_NATIVE_MAX_ZOOM,
    };
  }

  if (provider === "nearmap" && template) {
    return {
      tiles: [template],
      tileSize: 256,
      attribution: "Tiles © Nearmap",
      maxZoom: NEARMAP_MAX_ZOOM,
    };
  }

  return {
    tiles: [FALLBACK_SATELLITE_TILES],
    tileSize: 256,
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: clampZoomForProvider(
      provider,
      PROVIDER_CAPABILITIES[provider]?.maxZoom ?? SATELLITE_NATIVE_MAX_ZOOM
    ),
  };
}

function applyTileTemplate(template: string, coords: TileCoord): string {
  return template
    .replace(/{z}/g, String(coords.z))
    .replace(/{x}/g, String(coords.x))
    .replace(/{y}/g, String(coords.y));
}

function parseTileCoordsFromUrl(url?: string | null): TileCoord | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)(?:\.|$)/);
  if (!match) return null;

  const [, z, x, y] = match;
  return { z: Number(z), x: Number(x), y: Number(y) };
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

type StoredMapView = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

function loadStoredView(): StoredMapView | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = sessionStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<StoredMapView>;
    if (
      !parsed ||
      !Array.isArray(parsed.center) ||
      parsed.center.length !== 2 ||
      typeof parsed.center[0] !== "number" ||
      typeof parsed.center[1] !== "number" ||
      typeof parsed.zoom !== "number" ||
      typeof parsed.bearing !== "number" ||
      typeof parsed.pitch !== "number"
    ) {
      return null;
    }

    return {
      center: parsed.center as [number, number],
      zoom: parsed.zoom,
      bearing: parsed.bearing,
      pitch: parsed.pitch,
    };
  } catch (error) {
    console.warn("[MapOverlay] Failed to load stored map view", error);
    return null;
  }
}

function persistView(view: StoredMapView) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch (error) {
    console.warn("[MapOverlay] Failed to persist map view", error);
  }
}

function loadStoredDefaultVenueId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return sessionStorage.getItem(DEFAULT_VENUE_STORAGE_KEY);
  } catch (error) {
    console.warn("[MapOverlay] Failed to load stored default venue id", error);
    return null;
  }
}

function persistDefaultVenueId(id: string) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(DEFAULT_VENUE_STORAGE_KEY, id);
  } catch (error) {
    console.warn("[MapOverlay] Failed to persist default venue id", error);
  }
}

function pickRandomVenueId(): string {
  if (aflVenues.length === 0) return "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return aflVenues[buffer[0] % aflVenues.length]?.id ?? aflVenues[0].id;
  }
  const index = Math.floor(Math.random() * aflVenues.length);
  return aflVenues[index]?.id ?? aflVenues[0].id;
}

function moveMapInstant(
  map: maplibregl.Map,
  center: [number, number],
  zoom?: number
) {
  const z =
    zoom == null
      ? map.getZoom()
      : Math.max(MAP_MIN_ZOOM, Math.min(zoom, MAP_MAX_ZOOM));

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
  const baseSource = satelliteSourceForProvider(BASE_SATELLITE_PROVIDER);
  const overlayTemplate = tileTemplateForProvider(satelliteProvider);
  const overlaySource =
    isSatellite && overlayTemplate
      ? satelliteSourceForProvider(satelliteProvider)
      : null;
  const overlayMinZoom = PROVIDER_MIN_ZOOM[satelliteProvider] ?? MAP_MIN_ZOOM;
  const baseMinZoom = PROVIDER_MIN_ZOOM[BASE_SATELLITE_PROVIDER] ?? MAP_MIN_ZOOM;

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
        base: {
          type: "raster" as const,
          tiles: baseSource.tiles,
          tileSize: baseSource.tileSize,
          minzoom: baseMinZoom,
          maxzoom: baseSource.maxZoom,
          scheme: "xyz",
          attribution: baseSource.attribution,
        },
        ...(overlaySource
          ? {
              overlay: {
                type: "raster" as const,
                tiles: overlaySource.tiles,
                tileSize: overlaySource.tileSize,
                minzoom: overlayMinZoom,
                maxzoom: overlaySource.maxZoom,
                scheme: "xyz",
                attribution: overlaySource.attribution,
              },
            }
          : {}),
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
          id: "satellite-base",
          type: "raster" as const,
          source: "base",
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 0,
          },
        },
        ...(overlaySource
          ? [
              {
                id: "satellite-overlay",
                type: "raster" as const,
                source: "overlay",
                paint: {
                  "raster-opacity": 1,
                  "raster-fade-duration": 0,
                },
              },
            ]
          : []),
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
  const pendingFlyRef = useRef<{ lon: number; lat: number; zoom: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapMode, setMapMode] = useState<MapStyleMode>("satellite");
  const [satelliteProvider, setSatelliteProvider] = useState<SatelliteProvider>("esri");
  const [satelliteWarning, setSatelliteWarning] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isMapReady, setIsMapReady] = useState(false);
  const [tileFailures, setTileFailures] = useState<Record<SatelliteProvider, number>>({
    nearmap: 0,
    maptiler: 0,
    esri: 0,
  });
  const storedViewport = useMapViewportStore((state) => state.viewport);
  const setStoredViewport = useMapViewportStore((state) => state.setViewport);
  const mapCenterValue = useMemo(
    () => (mapCenter ? { lng: mapCenter[0], lat: mapCenter[1] } : null),
    [mapCenter]
  );
  const { suggestions, isLoading: isSearchLoading, error: searchError } =
    useAddressAutocomplete(query, mapCenterValue);
  const initialCenterRef = useRef<maplibregl.LngLat | null>(null);
  const moveEndHandlerRef = useRef<((this: maplibregl.Map, ev: any) => void) | null>(null);

  const providerOrderRef = useRef<SatelliteProvider[]>(PROVIDER_ORDER);
  const mapModeRef = useRef<MapStyleMode>(mapMode);
  const satelliteProviderRef = useRef<SatelliteProvider>(satelliteProvider);
  const providerCheckIdRef = useRef(0);
  const loggedTileFailuresRef = useRef<Set<string>>(new Set());
  const providerServerErrorsRef = useRef<Record<SatelliteProvider, number>>({
    nearmap: 0,
    maptiler: 0,
    esri: 0,
  });
  const suppressViewportSaveRef = useRef(false);
  const initialViewportRef = useRef<StoredMapView | null>(null);
  const defaultVenueAppliedRef = useRef(false);
  const viewportSaveTimeoutRef = useRef<number | null>(null);
  const defaultVenueAbortRef = useRef<AbortController | null>(null);
  const pendingSearchRef = useRef<{ result: SearchResult; inputValue?: string } | null>(null);

  const getTileCoordForCurrentView = useCallback(
    (provider: SatelliteProvider): TileCoord => {
      const map = mapRef.current;
      const center =
        map?.getCenter() ?? new maplibregl.LngLat(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
      const zoom = map?.getZoom() ?? mapZoom;
      const clampedZoom = Math.round(clampZoomForProvider(provider, zoom));

      return lngLatToTile(center.lng, center.lat, clampedZoom);
    },
    [mapZoom]
  );

  const registerTileFailure = useCallback(
    (details: {
      provider: SatelliteProvider;
      status?: number;
      url?: string;
      coords?: TileCoord | null;
      message?: string;
      tileSize?: number;
      zoom?: number;
      center?: { lng: number; lat: number };
    }) => {
      const coordsKey = details.coords
        ? `${details.coords.z}/${details.coords.x}/${details.coords.y}`
        : "unknown";
      const key = `${details.provider}:${details.url ?? coordsKey}:${details.status ?? "no-status"}`;

      if (!loggedTileFailuresRef.current.has(key)) {
        loggedTileFailuresRef.current.add(key);
        console.warn("[MapOverlay] Satellite tile failure", {
          provider: details.provider,
          z: details.coords?.z,
          x: details.coords?.x,
          y: details.coords?.y,
          tileSize: details.tileSize,
          url: details.url,
          status: details.status,
          message: details.message,
          zoom: details.zoom,
          center: details.center,
        });
      }

      setTileFailures((prev) => ({
        ...prev,
        [details.provider]: (prev[details.provider] ?? 0) + 1,
      }));
    },
    []
  );

  const isProviderUsable = useCallback(
    async (provider: SatelliteProvider) => {
      const template = tileTemplateForProvider(provider);
      if (!template) return false;

      const coords = getTileCoordForCurrentView(provider);
      const tileUrl = applyTileTemplate(template, coords);

      try {
        const response = await fetch(tileUrl, { method: "GET", cache: "no-store" });
        const contentType = response.headers.get("content-type") ?? "";

        if (!response.ok || !contentType.startsWith("image/")) {
          return false;
        }

        if (provider === "nearmap") {
          const blob = await response.clone().blob();
          const mostlyEmpty = await isTileMostlyEmpty(blob);
          if (mostlyEmpty) {
            console.warn("[MapOverlay] Nearmap tile appeared empty; skipping overlay.");
            return false;
          }
        }

        return true;
      } catch (err) {
        console.warn(`[MapOverlay] Failed to reach ${providerLabel(provider)} tiles`, err);
        return false;
      }
    },
    [getTileCoordForCurrentView]
  );

  const ensureSatelliteProvider = useCallback(
    async (startIndex = 0, failureReason?: string) => {
      if (mapModeRef.current !== "satellite") return;

      providerCheckIdRef.current += 1;
      const checkId = providerCheckIdRef.current;

      let warning = failureReason ?? null;

      for (let i = startIndex; i < providerOrderRef.current.length; i++) {
        const provider = providerOrderRef.current[i];

        if (provider === "maptiler" && !MAPTILER_SATELLITE_TILES) {
          warning = warning ?? "MapTiler API key not configured.";
          continue;
        }

        const usable = await isProviderUsable(provider);

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
    providerServerErrorsRef.current[satelliteProvider] = 0;
  }, [satelliteProvider]);

  useEffect(() => {
    onMapModeChange?.(mapMode);
  }, [mapMode, onMapModeChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeProvider =
      mapMode === "satellite" ? satelliteProviderRef.current : BASE_SATELLITE_PROVIDER;
    const providerMin = PROVIDER_MIN_ZOOM[activeProvider] ?? MAP_MIN_ZOOM;
    const providerMax = maxZoomForMode(mapMode, activeProvider);

    map.setMaxZoom(providerMax);
    map.setMinZoom(providerMin);

    const currentZoom = map.getZoom();
    if (currentZoom < providerMin) {
      map.setZoom(providerMin);
    } else if (currentZoom > providerMax) {
      map.setZoom(providerMax);
    }
  }, [mapMode, satelliteProvider]);

  useEffect(() => {
    if (mapMode === "satellite") {
      ensureSatelliteProvider();
    } else {
      setSatelliteWarning(null);
    }
  }, [ensureSatelliteProvider, mapMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const storedView = storedViewport ?? loadStoredView();
    if (storedView && !storedViewport) {
      setStoredViewport(storedView);
    }
    initialViewportRef.current = storedView;
    suppressViewportSaveRef.current = true;

    const initialCenter = storedView?.center ?? DEFAULT_CENTER;
    const initialProvider =
      mapMode === "satellite" ? satelliteProviderRef.current : BASE_SATELLITE_PROVIDER;
    const initialMinZoom = PROVIDER_MIN_ZOOM[initialProvider] ?? MAP_MIN_ZOOM;
    const initialMaxZoom = maxZoomForMode(mapMode, initialProvider);
    const requestedZoom = storedView?.zoom ?? mapZoom;
    const initialZoom = Math.max(initialMinZoom, Math.min(requestedZoom, initialMaxZoom));
    const initialBearing = storedView?.bearing ?? 0;
    const initialPitch = storedView?.pitch ?? 0;
    const initialMaxPitch = Math.max(0, storedView?.pitch ?? 0);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(mapMode, satelliteProviderRef.current),
      center: initialCenter,
      zoom: initialZoom,
      minZoom: initialMinZoom,
      maxZoom: initialMaxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      bearing: initialBearing,
      pitch: initialPitch,
      maxPitch: initialMaxPitch,
    });

    map.touchZoomRotate.disableRotation();

    mapRef.current = map;
    setIsMapReady(true);

    if (storedView) {
      map.once("idle", () => {
        suppressViewportSaveRef.current = false;
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
    // Don't include mapMode, so only freshly creates on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleError = (e: any) => {
      const sourceId = e?.sourceId || e?.error?.sourceId;
      if (sourceId !== "overlay") {
        return;
      }

      const status = e?.error?.status || e?.error?.statusCode;
      const url = e?.error?.url || e?.tile?.url;
      const message = e?.error?.message || e?.message;
      const coords = parseTileCoordsFromUrl(url);
      const activeProvider = satelliteProviderRef.current;
      const tileSize = satelliteSourceForProvider(activeProvider).tileSize;

      const center = map.getCenter();
      if (activeProvider === "nearmap" && typeof status === "number") {
        logNearmapRejection({
          status,
          url,
          zoom: map.getZoom(),
          center: { lng: center.lng, lat: center.lat },
          coords,
          tileSize,
          message,
        });
      }

      registerTileFailure({
        provider: activeProvider,
        status,
        url,
        coords,
        message,
        tileSize,
        zoom: map.getZoom(),
        center: { lng: center.lng, lat: center.lat },
      });

      const statusCode = typeof status === "number" ? status : null;

      if (statusCode != null) {
        if (statusCode >= 500) {
          const nextServerErrorCount = (providerServerErrorsRef.current[activeProvider] ?? 0) + 1;
          providerServerErrorsRef.current[activeProvider] = nextServerErrorCount;
          if (mapModeRef.current === "satellite" && nextServerErrorCount >= 3) {
            handleProviderFailure(
              `Satellite provider ${providerLabel(
                satelliteProviderRef.current
              )} returned repeated errors (${statusCode}).`
            );
          }
          return;
        }

        providerServerErrorsRef.current[activeProvider] = 0;

        if (statusCode === 400 || statusCode === 404) {
          return;
        }

        if (
          mapModeRef.current === "satellite" &&
          (statusCode === 401 || statusCode === 403 || statusCode === 429)
        ) {
          handleProviderFailure(
            `Satellite provider ${providerLabel(
              satelliteProviderRef.current
            )} returned status ${statusCode}.`
          );
        }
      }
    };

    map.on("error", handleError);

    return () => {
      map.off("error", handleError);
    };
  }, [handleProviderFailure, registerTileFailure]);

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
    if (!map) return;

    const handleMoveEnd = () => {
      if (suppressViewportSaveRef.current) return;

      if (viewportSaveTimeoutRef.current) {
        window.clearTimeout(viewportSaveTimeoutRef.current);
      }

      viewportSaveTimeoutRef.current = window.setTimeout(() => {
        const center = map.getCenter();
        const nextView: StoredMapView = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        };
        setStoredViewport(nextView);
        persistView(nextView);
      }, 200);
    };

    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
      if (viewportSaveTimeoutRef.current) {
        window.clearTimeout(viewportSaveTimeoutRef.current);
        viewportSaveTimeoutRef.current = null;
      }
    };
  }, [setStoredViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panByDelta) return;

    map.panBy([panByDelta.x, panByDelta.y], { animate: false });
  }, [panByDelta]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentZoom = map.getZoom();
    const activeProvider = mapMode === "satellite" ? satelliteProvider : BASE_SATELLITE_PROVIDER;
    const minZoom = PROVIDER_MIN_ZOOM[activeProvider] ?? MAP_MIN_ZOOM;
    const maxZoom = maxZoomForMode(mapMode, activeProvider);
    const clampedZoom = Math.max(
      minZoom,
      Math.min(mapZoom, maxZoom)
    );
    if (Math.abs(currentZoom - clampedZoom) < 0.001) return;

    map.easeTo({ zoom: clampedZoom, duration: 0 });
  }, [mapMode, mapZoom, satelliteProvider]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeProvider = mapMode === "satellite" ? satelliteProvider : BASE_SATELLITE_PROVIDER;
    const minZoom = PROVIDER_MIN_ZOOM[activeProvider] ?? MAP_MIN_ZOOM;
    const maxZoom = maxZoomForMode(mapMode, activeProvider);

    map.setMaxZoom(maxZoom);
    map.setMinZoom(minZoom);
    map.setStyle(buildMapStyle(mapMode, satelliteProvider));

    const currentZoom = map.getZoom();
    if (currentZoom > maxZoom) {
      map.setZoom(maxZoom);
    } else if (currentZoom < minZoom) {
      map.setZoom(minZoom);
    }
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
    if (!initialViewportRef.current) {
      map.setPitch(0);
      map.setBearing(0);
    }
  }, [onPanOffsetChange, onPanReferenceReset]);

  const flyToSearchResult = useCallback(
    (lon: number, lat: number, desiredZoom = 18) => {
      const map = mapRef.current;
      if (!map) {
        console.warn("[MapOverlay] flyToSearchResult: mapRef is null");
        return;
      }

      const activeProvider =
        mapModeRef.current === "satellite" ? satelliteProviderRef.current : BASE_SATELLITE_PROVIDER;
      const minZoom = PROVIDER_MIN_ZOOM[activeProvider] ?? MAP_MIN_ZOOM;
      const maxZoom = maxZoomForMode(mapModeRef.current, activeProvider);
      const safeZoom = Math.max(minZoom, Math.min(desiredZoom ?? 18, maxZoom));

      if (flyLockRef.current) {
        pendingFlyRef.current = { lon, lat, zoom: safeZoom };
        return;
      }

      flyLockRef.current = true;
      pendingFlyRef.current = null;

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

        const pending = pendingFlyRef.current;
        if (pending) {
          pendingFlyRef.current = null;
          flyToSearchResult(pending.lon, pending.lat, pending.zoom);
        }
      };

      moveEndHandlerRef.current = unlock;
      map.on("moveend", unlock);

      const performMove = () => {
        try {
          map.flyTo({ center: [lon, lat], zoom: safeZoom, essential: true });
        } catch (error) {
          console.error("[MapOverlay] flyTo failed, jumping instead", error);
          moveMapInstant(map, [lon, lat], safeZoom);
        }
      };

      if (map.loaded()) {
        performMove();
      } else {
        map.once("load", performMove);
      }
    },
    [onPanOffsetChange, onPanReferenceReset]
  );

  const recenterToResult = useCallback((result: SearchResult, inputValue?: string) => {
    const map = mapRef.current;

    const lat = Number(result.lat);
    const lon = Number(result.lon);

    setQuery(inputValue ?? result.label);
    setIsDropdownOpen(false);
    setActiveIndex(-1);

    if (!map) {
      pendingSearchRef.current = { result, inputValue };
      console.warn("[MapOverlay] recenterToResult: mapRef is null");
      return;
    }

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);

    flyToSearchResult(lon, lat, 18);
  }, [flyToSearchResult]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    if (!pendingSearchRef.current) return;
    const pending = pendingSearchRef.current;
    pendingSearchRef.current = null;
    recenterToResult(pending.result, pending.inputValue);
  }, [isMapReady, recenterToResult]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (defaultVenueAppliedRef.current) return;
    if (initialViewportRef.current || storedViewport || loadStoredView()) return;

    defaultVenueAppliedRef.current = true;

    const storedVenueId = loadStoredDefaultVenueId();
    const storedVenue = storedVenueId
      ? aflVenues.find((venue) => venue.id === storedVenueId)
      : null;
    const fallbackVenueId = pickRandomVenueId();
    const venue =
      storedVenue ?? aflVenues.find((item) => item.id === fallbackVenueId) ?? aflVenues[0];

    if (!venue) {
      suppressViewportSaveRef.current = false;
      return;
    }

    if (!storedVenueId || storedVenueId !== venue.id) {
      persistDefaultVenueId(venue.id);
    }

    setQuery(venue.query);
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    suppressViewportSaveRef.current = false;

    const applyFallback = () => {
      if (!venue.fallbackCenter) return;
      if (markerRef.current) {
        markerRef.current.remove();
      }
      markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
        .setLngLat(venue.fallbackCenter)
        .addTo(map);
      flyToSearchResult(venue.fallbackCenter[0], venue.fallbackCenter[1], 18);
    };

    const controller = new AbortController();
    defaultVenueAbortRef.current?.abort();
    defaultVenueAbortRef.current = controller;

    geocode(venue.query, { signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) return;
        const result = results[0];
        if (result) {
          recenterToResult(result, venue.query);
          return;
        }
        applyFallback();
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("[MapOverlay] Failed to geocode default venue", error);
        applyFallback();
      });

    return () => {
      controller.abort();
    };
  }, [flyToSearchResult, recenterToResult, storedViewport]);

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

      {isDevEnvironment() && (
        <div className="absolute top-4 right-4 z-50 text-xs bg-white/85 backdrop-blur rounded-md shadow px-3 py-2 pointer-events-none space-y-1">
          <p className="font-semibold">Tile failures</p>
          {(Object.keys(tileFailures) as SatelliteProvider[]).map((provider) => (
            <p key={provider} className="flex items-center gap-2">
              <span className="min-w-[72px] text-slate-600">{providerLabel(provider)}:</span>
              <span className="tabular-nums text-slate-900">{tileFailures[provider]}</span>
            </p>
          ))}
        </div>
      )}

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

            {isDropdownOpen &&
              (isSearchLoading ||
                suggestions.length > 0 ||
                searchError ||
                query.trim().length >= MIN_QUERY_LENGTH) && (
              <div
                ref={resultsListRef}
                className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg z-20 min-h-[48px]"
              >
                {isSearchLoading && (
                  <div className="px-3 py-2 text-sm text-slate-600">Searching…</div>
                )}

                {!isSearchLoading && suggestions.length === 0 && !searchError && (
                  <div className="px-3 py-2 text-sm text-slate-500">
                    Refining suggestions…
                  </div>
                )}

                {suggestions.map((result, index) => (
                  <button
                    type="button"
                    key={result.id ?? `${index}-${result.lat}-${result.lon}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleResultSelect(result);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm",
                      activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50"
                    )}
                  >
                    {result.label}
                  </button>
                ))}
              </div>
            )}
          </form>

          {searchError && (
            <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {searchError}
            </div>
          )}

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
