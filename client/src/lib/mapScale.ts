const EARTH_RADIUS_M = 6378137;
const TILE_SIZE_PX = 256;

export function calculateMetersPerPixel(zoom: number, latitude: number): number {
  const worldSize = TILE_SIZE_PX * Math.pow(2, zoom);
  const latitudeRadians = (latitude * Math.PI) / 180;

  return (Math.cos(latitudeRadians) * 2 * Math.PI * EARTH_RADIUS_M) / worldSize;
}
