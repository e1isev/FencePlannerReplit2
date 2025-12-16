import { isDebugSearch } from "./searchDebug";

export type GeocodeSuggestion = {
  id: string;
  label: string;
  lon: number;
  lat: number;
  raw?: unknown;
};

const DEFAULT_GEOCODE_ENDPOINT =
  (typeof import.meta !== "undefined" && "env" in import.meta
    ? (import.meta as any).env?.VITE_GEOCODE_ENDPOINT
    : undefined) ||
  (typeof process !== "undefined"
    ? process.env.VITE_GEOCODE_ENDPOINT
    : undefined) ||
  "https://nominatim.openstreetmap.org/search";

function normalizeFeatureEntry(entry: any): GeocodeSuggestion | null {
  if (!entry) return null;

  // GeoJSON Feature
  if (entry.type === "Feature" && entry.geometry && Array.isArray(entry.geometry.coordinates)) {
    const [lon, lat] = entry.geometry.coordinates;
    const label =
      entry.properties?.label ||
      entry.properties?.name ||
      entry.properties?.display_name ||
      entry.place_name ||
      entry.text ||
      entry.properties?.formatted ||
      "Unknown location";

    if (typeof lon === "number" && typeof lat === "number") {
      return {
        id: String(entry.id ?? entry.properties?.id ?? `${lon},${lat}`),
        label,
        lon,
        lat,
        raw: entry,
      };
    }
  }

  // Nominatim / generic result
  const latValue = Number(entry.lat ?? entry.latitude ?? entry.geometry?.lat);
  const lonValue = Number(entry.lon ?? entry.lng ?? entry.longitude ?? entry.geometry?.lng);
  const label =
    entry.display_name || entry.label || entry.name || entry.formatted || entry.title || entry.address?.freeformAddress;

  if (Number.isFinite(latValue) && Number.isFinite(lonValue) && label) {
    return {
      id: String(entry.place_id ?? entry.id ?? entry.osm_id ?? `${lonValue},${latValue}`),
      label,
      lon: lonValue,
      lat: latValue,
      raw: entry,
    };
  }

  return null;
}

function normalizeResponse(data: any): GeocodeSuggestion[] {
  if (!data) return [];

  if (Array.isArray(data.features)) {
    return data.features
      .map((feature: any) => normalizeFeatureEntry(feature))
      .filter(Boolean) as GeocodeSuggestion[];
  }

  if (Array.isArray(data.results)) {
    return data.results
      .map((result: any) => normalizeFeatureEntry(result))
      .filter(Boolean) as GeocodeSuggestion[];
  }

  if (Array.isArray(data)) {
    return data.map((item) => normalizeFeatureEntry(item)).filter(Boolean) as GeocodeSuggestion[];
  }

  return [];
}

export async function geocode(
  query: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL(DEFAULT_GEOCODE_ENDPOINT);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("dedupe", "1");

  const requestUrl = url.toString();

  if (isDebugSearch()) {
    console.debug("[geocode] request", requestUrl);
  }

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-AU",
      "User-Agent": "FencePlanner/1.0 search",
    },
    signal,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<unreadable>");
    console.error("[geocode] request failed", {
      status: response.status,
      url: requestUrl,
      response: bodyText,
    });
    throw new Error("Search unavailable, check API key or network");
  }

  let parsed: any;
  try {
    parsed = await response.json();
  } catch (error) {
    console.error("[geocode] failed to parse response", { url: requestUrl, error });
    throw new Error("Search unavailable, check API key or network");
  }

  const suggestions = normalizeResponse(parsed);

  if (isDebugSearch()) {
    console.debug("[geocode] normalized results", suggestions);
  }

  return suggestions;
}
