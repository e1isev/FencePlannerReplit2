import { useEffect, useRef, useState } from "react";

type MapCenter = { lng: number; lat: number } | null;

export interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: number;
}

export const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

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

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          format: "json",
          limit: "5",
          q: trimmed,
          countrycodes: "au",
        });

        if (mapCenter) {
          const lngDelta = 0.5;
          const latDelta = 0.5;
          params.set(
            "viewbox",
            `${mapCenter.lng - lngDelta},${mapCenter.lat + latDelta},${mapCenter.lng + lngDelta},${mapCenter.lat - latDelta}`
          );
        }

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          if (requestIdRef.current === requestId) {
            setError("Search request failed. Please try again.");
          }
          return;
        }

        const data = (await res.json()) as AddressSuggestion[];

        if (requestIdRef.current === requestId) {
          setSuggestions(Array.isArray(data) ? data : []);

          if (Array.isArray(data) && data.length === 0) {
            setError("No matching locations found. Try a more specific address.");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }

        if (requestIdRef.current === requestId) {
          setError(
            err instanceof Error ? err.message : "Unable to search right now."
          );
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
