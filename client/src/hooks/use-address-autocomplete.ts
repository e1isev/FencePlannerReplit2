import { useEffect, useRef, useState } from "react";

import { geocode, type GeocodeSuggestion } from "@/lib/geocode";
import { isDebugSearch } from "@/lib/searchDebug";

type MapCenter = { lng: number; lat: number } | null;

export interface AddressSuggestion extends GeocodeSuggestion {}

export const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;
const BIAS_DELTA = 0.35;
const CACHE_LIMIT = 15;

function haversineDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const aa = sinLat * sinLat + sinLon * sinLon * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function scoreSuggestion(s: AddressSuggestion, mapCenter: MapCenter, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  const label = s.label.toLowerCase();
  const hasStreetNumber = /\b\d+/.test(label);
  const queryHasNumber = tokens.some((token) => /\d/.test(token));

  const tokenMatches = tokens.reduce((acc, token) => acc + (label.includes(token) ? 1 : 0), 0);
  const parsed = { lat: s.lat, lon: s.lon };
  const nearCenter =
    mapCenter &&
    Math.abs(parsed.lat - mapCenter.lat) <= BIAS_DELTA &&
    Math.abs(parsed.lon - mapCenter.lng) <= BIAS_DELTA;

  const distanceKm = mapCenter
    ? haversineDistanceKm({ lat: mapCenter.lat, lon: mapCenter.lng }, parsed)
    : null;
  const distanceScore = distanceKm == null ? 0 : Math.max(0, 1.5 - Math.min(distanceKm, 50) / 50);

  const suburbComponents = s.label.split(",").slice(1).join(",").toLowerCase();
  const suburbMatches = tokens.reduce(
    (acc, token) => acc + (suburbComponents.includes(token) ? 0.5 : 0),
    0
  );

  let score = tokenMatches * 2 + suburbMatches + distanceScore;
  if (queryHasNumber && hasStreetNumber) {
    score += 3;
  }
  if (nearCenter) {
    score += 2;
  }

  return score;
}

function rankSuggestions(suggestions: AddressSuggestion[], mapCenter: MapCenter, query: string) {
  const seen = new Set<string>();

  return [...suggestions]
    .filter((s) => {
      const key = s.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => ({ suggestion: s, score: scoreSuggestion(s, mapCenter, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.suggestion);
}

export function useAddressAutocomplete(
  query: string,
  mapCenter: MapCenter
): {
  suggestions: AddressSuggestion[];
  isLoading: boolean;
  error: string | null;
} {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setIsLoading(false);
      setError(null);
      setSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      const cached = cacheRef.current.get(trimmed);
      if (cached && cached.length > 0) {
        setSuggestions(rankSuggestions(cached, mapCenter, trimmed));
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const data = await geocode(trimmed, { signal: controller.signal });

        if (requestIdRef.current === requestId) {
          const ranked = rankSuggestions(Array.isArray(data) ? data : [], mapCenter, trimmed);
          cacheRef.current.set(trimmed, ranked);
          cacheOrderRef.current.push(trimmed);

          if (cacheOrderRef.current.length > CACHE_LIMIT) {
            const oldest = cacheOrderRef.current.shift();
            if (oldest) {
              cacheRef.current.delete(oldest);
            }
          }

          setSuggestions(ranked);

          if (ranked.length === 0) {
            setError("No matching locations found. Try a more specific address.");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }

        if (isDebugSearch()) {
          console.error("[useAddressAutocomplete] search failed", err);
        }

        if (requestIdRef.current === requestId) {
          setSuggestions([]);
          setError("Search unavailable, check API key or network");
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handler);
    };
  }, [mapCenter, query]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { suggestions, isLoading, error };
}
