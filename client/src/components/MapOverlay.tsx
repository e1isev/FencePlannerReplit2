import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_CENTER: [number, number] = [-79.3832, 43.6532];

function buildMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster" as const,
        source: "osm",
      },
    ],
  };
}

export function MapOverlay() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [query, setQuery] = useState("");
  const [isLocked, setIsLocked] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle(),
      center: DEFAULT_CENTER,
      zoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isLocked) {
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.dragRotate.disable();
      map.dragPan.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    } else {
      map.scrollZoom.enable();
      map.boxZoom.enable();
      map.dragRotate.enable();
      map.dragPan.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
    }
  }, [isLocked]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`
      );

      if (!res.ok) {
        throw new Error("Search failed. Please try again.");
      }

      const data = (await res.json()) as SearchResult[];
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    const map = mapRef.current;
    if (!map) return;

    const lat = Number(result.lat);
    const lon = Number(result.lon);

    setQuery(result.display_name);
    setResults([]);

    map.flyTo({ center: [lon, lat], zoom: 18 });

    if (markerRef.current) {
      markerRef.current.remove();
    }

    markerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lon, lat])
      .addTo(map);
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={mapContainerRef}
        className={cn(
          "absolute inset-0 transition-opacity",
          isLocked ? "pointer-events-none opacity-90" : "pointer-events-auto"
        )}
      />

      <div className="absolute top-4 left-4 z-20 max-w-md space-y-3">
        <Card className="p-3 shadow-lg">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Map Overlay</p>
              <p className="text-xs text-slate-500">Search an address and draw on top of the map.</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="map-lock" className="text-xs text-slate-600 whitespace-nowrap">
                Lock for drawing
              </Label>
              <Switch id="map-lock" checked={isLocked} onCheckedChange={setIsLocked} />
            </div>
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
            Toggle off locking when you want to pan or zoom the map. Turn it back on to draw
            fence lines without the map capturing clicks.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default MapOverlay;
