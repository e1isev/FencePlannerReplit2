import { createRequire } from "module";

const require = createRequire(import.meta.url);

try {
  require.resolve("maplibre-gl");
  console.log("maplibre-gl dependency found. Map overlay is ready.");
} catch (error) {
  console.error(
    "Missing dependency: maplibre-gl is required for the map overlay. Run `npm install maplibre-gl` to install it."
  );
  process.exit(1);
}
