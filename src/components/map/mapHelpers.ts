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
  speed: number;
  isDelayed: boolean;
  currentStatus: number;
  stopId: string;
  occupancyStatus: number;
  occupancyPercentage?: number;
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

export const getOccupancyText = (status: number) => {
  switch(status) {
    case 0: return "No Data";
    case 1: return "Many Seats Available";
    case 2: return "Few Seats Available";
    case 3: return "Standing Room Only";
    case 4: return "Crushed Standing Room";
    case 5: return "Full";
    case 6: return "Not Accepting Passengers";
    default: return "No Data";
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
