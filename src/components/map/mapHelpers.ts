// src/components/map/mapHelpers.ts
// Pure utility functions for the InteractiveMap — no React dependencies.

export interface BusState {
  id: string;
  startLng: number;
  startLat: number;
  currentLng: number;
  currentLat: number;
  targetLng: number;
  targetLat: number;
  startTime: number;
  directionId: number;
  headsign: string;
  routeId: string;
  tripId: string | null;
  speed: number;
  isDelayed: boolean;
  delaySeconds: number | null;
  delayLabel: string | null;
  currentStatus: number;
  stopId: string;
  occupancyStatus: number;
  occupancyPercentage: number | null;
  hasOccupancyData: boolean;
  timestamp: number;
  bearing: number;
}

/**
 * Generates a clockwise polygon for a 3D bus extrusion.
 * 
 * CRITICAL: Exterior rings MUST be CLOCKWISE in MapLibre GL otherwise
 * they are culled as "holes" during 3D extrusion rendering.
 * Sequence: Front-Left -> Front-Right -> Back-Right -> Back-Left
 */
export function getBusPolygon(lng: number, lat: number, bearing: number) {
  const rad = (90 - bearing) * (Math.PI / 180);
  const mToLng = 1 / 81500; const mToLat = 1 / 111111;
  // Exaggerated + 20% size increase for maximum visibility (approx 19.2m x 6m footprint)
  const l = 9.6, w = 3.0; 
  
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  
  const offsets = [
    [l, w],    // Front-Left
    [l, -w],   // Front-Right
    [-l, -w],  // Back-Right
    [-l, w]    // Back-Left
  ];
  
  const coords = offsets.map(([lx, wy]) => [
    lng + (lx * cosA - wy * sinA) * mToLng,
    lat + (lx * sinA + wy * cosA) * mToLat
  ]);
  
  coords.push(coords[0]); 
  return [coords];
}

/**
 * Smart occupancy text resolver.
 * Prioritizes percentage over enum status, and explicitly marks
 * "No Data" when hasOccupancyData is false (fixing the "empty bus" bug
 * where missing protobuf fields default to 0/EMPTY).
 */
export const getOccupancyText = (
  status: number,
  percentage?: number | null,
  hasData?: boolean
): string => {
  // If the API explicitly tells us there's no data, show that
  if (hasData === false) return 'No Data';

  // If we have a percentage, use it as the primary label
  if (percentage !== undefined && percentage !== null && percentage >= 0) {
    if (percentage === 0) return 'Empty';
    if (percentage <= 25) return 'Many Seats Available';
    if (percentage <= 50) return 'Few Seats Available';
    if (percentage <= 75) return 'Standing Room Only';
    if (percentage <= 100) return 'Crushed Standing Room';
    return 'Full';
  }

  // Fall back to enum status
  switch(status) {
    case 0: return 'No Data';
    case 1: return 'Many Seats Available';
    case 2: return 'Few Seats Available';
    case 3: return 'Standing Room Only';
    case 4: return 'Crushed Standing Room';
    case 5: return 'Full';
    case 6: return 'Not Accepting Passengers';
    default: return 'No Data';
  }
};

/**
 * Returns a color for the occupancy status, used in popup capacity bars.
 */
export const getOccupancyColor = (
  status: number,
  hasData?: boolean
): string => {
  if (hasData === false) return '#6b7280'; // grey
  switch(status) {
    case 0: return '#6b7280'; // grey — no data
    case 1: return '#22c55e'; // green
    case 2: return '#eab308'; // yellow
    case 3: return '#f97316'; // orange
    case 4: return '#ef4444'; // red
    case 5: return '#dc2626'; // dark red
    case 6: return '#991b1b'; // deep red
    default: return '#6b7280';
  }
};

export const getStatusText = (status: number) => {
   switch(status) {
     case 0: return "Incoming at";
     case 1: return "Stopped at";
     case 2: return "In transit to";
     default: return "Approaching";
   }
};

export const getDirectionText = (dir: number) => {
   if (dir === 0) return "Outbound";
   if (dir === 1) return "Inbound";
   return "Unknown";
};

/**
 * Escapes HTML characters in user-provided text to prevent XSS
 * when rendering content in MapLibre .setHTML() popups.
 */
export const escapeHtml = (unsafe: string | null | undefined): string => {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Shared venue category type lists — single source of truth.
 * Used for filtering, marker coloring, and 3D building matching.
 */
export const VENUE_CATEGORIES = {
  Nightlife: ['club', 'nightclub', 'lounge', 'night_club'],
  Bars: ['bar', 'pub', 'brewery'],
  Eatery: ['restaurant', 'cafe', 'diner', 'pizza', 'bakery', 'meal_takeaway', 'meal_delivery', 'eats', 'eatery', 'eats 1'],
  Eats2: ['eats 2'],
  Stage: ['venue', 'church', 'live_music_venue', 'theater', 'performing_arts_theater'],
  Amenity: ['amenity']
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Nightlife: '#d946ef',
  Bars: '#a855f7',
  Eatery: '#f97316',
  Eats2: '#f97316',
  Stage: '#eab308',
  Retail: '#64748b',
  Amenity: '#64748b'
};

/** Resolves a venue type string to its display category. */
export function getVenueCategory(type: string | null | undefined): 'Nightlife' | 'Bars' | 'Eatery' | 'Eats2' | 'Stage' | 'Amenity' | 'Retail' {
  const vType = (type || '').toLowerCase();
  if ((VENUE_CATEGORIES.Nightlife as readonly string[]).includes(vType)) return 'Nightlife';
  if ((VENUE_CATEGORIES.Bars as readonly string[]).includes(vType)) return 'Bars';
  if ((VENUE_CATEGORIES.Eats2 as readonly string[]).includes(vType)) return 'Eats2';
  if ((VENUE_CATEGORIES.Eatery as readonly string[]).includes(vType)) return 'Eatery';
  if ((VENUE_CATEGORIES.Stage as readonly string[]).includes(vType)) return 'Stage';
  if ((VENUE_CATEGORIES.Amenity as readonly string[]).includes(vType)) return 'Amenity';
  return 'Retail';
}

/**
 * Validates a URL is safe to use in an href attribute.
 * Blocks javascript:, data:, and other non-http protocols.
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
    return null;
  } catch {
    return null;
  }
}
