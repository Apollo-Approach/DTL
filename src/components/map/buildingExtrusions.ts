// src/components/map/buildingExtrusions.ts
// 3D Building Extrusion Engine — "The Nuclear Option"
// Replaces pin markers with glowing, color-coded 3D building extrusions
// using a custom GeoJSON source to prevent tile-based ID collisions.

import maplibregl from 'maplibre-gl';

// --- Venue color palette matching BIA retail categories ---
const VENUE_COLORS: Record<string, string> = {
  Nightlife: '#d946ef', // Fuchsia
  Bars:      '#06b6d4', // Cyan
  Eatery:    '#f97316', // Orange
  Stage:     '#eab308', // Yellow
  Retail:    '#64748b', // Slate
  default:   '#1a1a2e', // Dormant dark
};

// Feature Flag for venue-based building color styling
export let ENABLE_VENUE_COLORING = true;

export function setEnableVenueColoring(enable: boolean) {
  ENABLE_VENUE_COLORING = enable;
}

// Shimmer peak color (bright white-ish glow)
const SHIMMER_PEAK = '#ffffff';

// --- Types ---
interface VenueMatch {
  venueId: string;
  buildingFeatureId: number;
  category: string;
  color: string;
  hasSpecials: boolean;
}

interface BuildingExtrusionState {
  matchedBuildings: Map<number, VenueMatch>;
  shimmerBuildings: Set<number>;
  animationFrameId: number | null;
  nextFeatureId: number;
}

// Module state
const state: BuildingExtrusionState = {
  matchedBuildings: new Map(),
  shimmerBuildings: new Set(),
  animationFrameId: null,
  nextFeatureId: 1,
};

// --- Color Interpolation Utility ---
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function lerpColor(colorA: string, colorB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}

// --- 1. Initialize 3D Building Layer ---
export function initBuildingExtrusions(map: maplibregl.Map, firstSymbolId?: string): void {
  // Check if the source exists (MapTiler planet tiles)
  const source = map.getSource('maptiler_planet');
  if (!source) {
    console.warn('[3D Buildings] maptiler_planet source not found — skipping OSM building extrusions');
    return;
  }

  // --- Step A: Suppress default POI labels for a pin-free experience ---
  suppressPOILabels(map);

  // --- Step B: Hide ALL existing building layers (flat fills AND 3D extrusions) to prevent z-fighting ---
  const style = map.getStyle();
  if (style?.layers) {
    style.layers.forEach(layer => {
      const sourceLayer = ('source-layer' in layer ? layer['source-layer'] : '') as string;
      if (sourceLayer === 'building' && (layer as any).source === 'maptiler_planet') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    });
  }

  // --- Step C: Add a queryable but invisible hitbox layer for all buildings ---
  if (!map.getLayer('building-hitbox')) {
    map.addLayer({
      id: 'building-hitbox',
      type: 'fill',
      source: 'maptiler_planet',
      'source-layer': 'building',
      paint: {
        'fill-opacity': 0 // Invisible but queryable
      }
    });
  }

  // --- Step D: Add custom GeoJSON source for matched buildings ONLY ---
  if (!map.getSource('venue-buildings-source')) {
    map.addSource('venue-buildings-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('osm-3d-buildings')) {
    map.addLayer({
      id: 'osm-3d-buildings',
      type: 'fill-extrusion',
      source: 'venue-buildings-source',
      minzoom: 14.5,
      paint: {
        // Color: driven by feature-state (for shimmer) or property fallback
        'fill-extrusion-color': [
          'case',
          ['!=', ['feature-state', 'venueColor'], null],
          ['feature-state', 'venueColor'],
          ['coalesce', ['get', 'venueColor'], '#64748b']
        ],
        // Height: from properties
        'fill-extrusion-height': ['get', 'venueHeight'],
        // Base: from properties
        'fill-extrusion-base': ['get', 'venueBase'],
        'fill-extrusion-opacity': 0.85,
      },
    }, firstSymbolId);
  }

  // --- Step E: Add the "Firefly" glow layer (flat circle beneath buildings) ---
  if (!map.getSource('venue-glow-source')) {
    map.addSource('venue-glow-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('venue-glow-halo')) {
    map.addLayer({
      id: 'venue-glow-halo',
      type: 'circle',
      source: 'venue-glow-source',
      paint: {
        'circle-radius': 18,
        'circle-color': ['get', 'color'],
        'circle-blur': 1.0,
        'circle-opacity': 0.4,
      },
    }, 'osm-3d-buildings'); // Render BENEATH the 3D buildings
  }

  // --- Step F: Click handler for 3D buildings ---
  map.on('click', 'osm-3d-buildings', (e) => {
    if (!e.features || e.features.length === 0) return;

    // Skip if the user clicked directly on a marker DOM element (don't override their selection)
    const target = (e.originalEvent?.target as HTMLElement);
    if (target?.closest('[id^="venue-marker-"]')) return;

    // Collect all matched venues from the clicked features
    const candidates: Array<{ venueId: string; screenDist: number }> = [];
    const seen = new Set<string>();

    for (const feature of e.features) {
      const featureId = feature.id as number;
      const match = state.matchedBuildings.get(featureId);
      if (!match || seen.has(match.venueId)) continue;
      seen.add(match.venueId);

      // Find the marker's screen position to calculate distance to click point
      const markerEl = document.getElementById(`venue-marker-${match.venueId}`);
      if (markerEl) {
        const rect = markerEl.getBoundingClientRect();
        const markerCenterX = rect.left + rect.width / 2;
        const markerCenterY = rect.top + rect.height / 2;
        const dx = e.originalEvent.clientX - markerCenterX;
        const dy = e.originalEvent.clientY - markerCenterY;
        candidates.push({ venueId: match.venueId, screenDist: dx * dx + dy * dy });
      }
    }

    if (candidates.length === 0) return;

    // Pick the venue whose marker is closest to where the user actually clicked
    candidates.sort((a, b) => a.screenDist - b.screenDist);
    const targetVenueId = candidates[0].venueId;
    
    // Redirect to the venue's dedicated page
    window.location.href = `/venues/${targetVenueId}`;
  });

  map.on('mouseenter', 'osm-3d-buildings', (e) => {
    if (!e.features || e.features.length === 0) return;
    const featureId = e.features[0].id as number;
    if (state.matchedBuildings.has(featureId)) {
      map.getCanvas().style.cursor = 'pointer';
    }
  });

  map.on('mouseleave', 'osm-3d-buildings', () => {
    map.getCanvas().style.cursor = '';
  });

  console.log('[3D Buildings] OSM building extrusion layer initialized');
}

// --- 2. Suppress POI Labels ---
function suppressPOILabels(map: maplibregl.Map): void {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  style.layers.forEach((layer) => {
    if (layer.type !== 'symbol') return;
    const sourceLayer = ('source-layer' in layer ? layer['source-layer'] as string : '');
    const layerId = layer.id.toLowerCase();

    if (
      sourceLayer === 'poi' ||
      layerId.includes('poi') ||
      (sourceLayer === 'place' && layerId.includes('label'))
    ) {
      if (sourceLayer === 'poi' || layerId.includes('poi')) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    }
  });
}

// Helper: Ray-casting algorithm for point in polygon
export function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  const x = point[0], y = point[1];
  let inside = false;
  
  const ring = polygon[0];
  if (!ring) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

// Helper: Get minimum distance squared from a point to any vertex of a polygon
export function distanceToPolygon(point: [number, number], polygon: number[][][]): number {
  const ring = polygon[0];
  if (!ring || ring.length === 0) return Infinity;
  let minDistance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const dx = point[0] - ring[i][0];
    const dy = point[1] - ring[i][1];
    const dist = dx * dx + dy * dy;
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
}

// Helper: Extract a single Polygon from a feature that contains the given point
export function extractSinglePolygon(
  geometry: GeoJSON.Geometry, 
  point: [number, number]
): GeoJSON.Geometry {
  if (geometry.type === 'Polygon') {
    return geometry;
  }
  
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) {
      const extracted = extractSinglePolygon(g, point);
      if (extracted.type === 'Polygon') return extracted;
    }
  }
  
  if (geometry.type === 'MultiPolygon') {
    // 1. Try strict point-in-polygon first
    for (const polygon of geometry.coordinates) {
      if (pointInPolygon(point, polygon)) {
        return { type: 'Polygon', coordinates: polygon };
      }
    }
    
    // 2. If point misses (e.g. on sidewalk), find the closest polygon by vertex distance
    let bestPolygon = geometry.coordinates[0];
    let minDistance = Infinity;
    
    for (const polygon of geometry.coordinates) {
      const dist = distanceToPolygon(point, polygon);
      if (dist < minDistance) {
        minDistance = dist;
        bestPolygon = polygon;
      }
    }
    
    if (bestPolygon) {
      return { type: 'Polygon', coordinates: bestPolygon };
    }
  }
  
  // Fallback to the original geometry if we can't extract a Polygon
  return geometry;
}

// --- 3. Spatial Join: Match Venues to Building Polygons ---
export function matchVenuesToBuildings(
  map: maplibregl.Map,
  venues: Array<{ id: string; lng: number; lat: number; category: string; hasSpecials: boolean }>,
): void {
  if (!map.getLayer('osm-3d-buildings')) return;

  // Clear previous matches and feature states
  state.matchedBuildings.forEach((match, featureId) => {
    try {
      map.setFeatureState(
        { source: 'venue-buildings-source', id: featureId },
        { venueColor: null },
      );
    } catch { /* Ignore */ }
  });
  state.matchedBuildings.clear();
  state.shimmerBuildings.clear();

  const buildingFeatures: GeoJSON.Feature[] = [];
  const glowFeatures: GeoJSON.Feature[] = [];

  venues.forEach((venue) => {
    const color = VENUE_COLORS[venue.category] || VENUE_COLORS.default;
    const point = map.project([venue.lng, venue.lat]);

    // Create bounding box (30x30 px) for hit detection to catch venues slightly off building footprints
    const HITBOX_BUFFER = 15;
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - HITBOX_BUFFER, point.y - HITBOX_BUFFER],
      [point.x + HITBOX_BUFFER, point.y + HITBOX_BUFFER],
    ];

    // Filter the layers array so MapLibre doesn't crash if a layer isn't in the style
    const targetLayers = ['building-hitbox', 'Building', 'Building top']
      .filter(layerId => map.getLayer(layerId));

    if (targetLayers.length === 0) return;

    // Query the invisible hitbox layer to find the building footprint
    // Since we expanded the hitbox, we might hit multiple distinct features. We grab the closest one.
    const features = map.queryRenderedFeatures(bbox, {
      layers: targetLayers,
    });

    if (features.length > 0) {
      // If multiple features are returned, we should ideally check all of them, but extracting the closest polygon
      // from the first feature (which MapLibre sorts by z-index/closest to center) is usually sufficient.
      const sourceFeature = features[0];
      const customFeatureId = state.nextFeatureId++;

      const renderHeight = sourceFeature.properties?.render_height ?? 6;
      const renderBase = sourceFeature.properties?.render_min_height ?? 0;

      // Extract geometry from the rendered tile feature (filtering MultiPolygons if needed)
      const newFeature: GeoJSON.Feature = {
        type: 'Feature',
        id: customFeatureId,
        geometry: extractSinglePolygon(sourceFeature.geometry, [venue.lng, venue.lat]),
        properties: {
          venueId: venue.id,
          venueColor: ENABLE_VENUE_COLORING ? color : '#64748b',
          venueHeight: renderHeight,
          venueBase: renderBase,
        }
      };

      buildingFeatures.push(newFeature);

      const match: VenueMatch = {
        venueId: venue.id,
        buildingFeatureId: customFeatureId,
        category: venue.category,
        color,
        hasSpecials: venue.hasSpecials,
      };

      state.matchedBuildings.set(customFeatureId, match);

      if (venue.hasSpecials) {
        state.shimmerBuildings.add(customFeatureId);
      }

      // Add glow point for this venue only if coloring is enabled
      if (ENABLE_VENUE_COLORING) {
        glowFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] },
          properties: { color, venueId: venue.id },
        });
      }
    }
  });

  // Update building source with our custom features
  const buildingSource = map.getSource('venue-buildings-source') as maplibregl.GeoJSONSource | undefined;
  if (buildingSource) {
    buildingSource.setData({
      type: 'FeatureCollection',
      features: buildingFeatures,
    });
  }

  // Update glow source
  const glowSource = map.getSource('venue-glow-source') as maplibregl.GeoJSONSource | undefined;
  if (glowSource) {
    glowSource.setData({
      type: 'FeatureCollection',
      features: glowFeatures,
    });
  }

  console.log(`[3D Buildings] Matched ${state.matchedBuildings.size}/${venues.length} venues to building footprints`);
}

// --- 4. Shimmer Animation Loop ---
export function startShimmerAnimation(map: maplibregl.Map): void {
  stopShimmerAnimation();

  function animate(timestamp: number): void {
    if (state.shimmerBuildings.size === 0) {
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    const t = (Math.sin(timestamp / 1500) + 1) / 2;

    state.shimmerBuildings.forEach((featureId) => {
      const match = state.matchedBuildings.get(featureId);
      if (!match) return;

      const baseColor = ENABLE_VENUE_COLORING ? match.color : '#64748b';
      const interpolatedColor = lerpColor(baseColor, SHIMMER_PEAK, t * 0.5);

      try {
        // Set feature state on our custom geojson source using our custom integer IDs
        map.setFeatureState(
          { source: 'venue-buildings-source', id: featureId },
          { venueColor: ENABLE_VENUE_COLORING ? interpolatedColor : '#64748b' },
        );
      } catch { /* Ignore */ }
    });

    state.animationFrameId = requestAnimationFrame(animate);
  }

  state.animationFrameId = requestAnimationFrame(animate);
}

export function stopShimmerAnimation(): void {
  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

// --- 5. Toggle Visibility ---
export function setBuildingExtrusionsVisible(map: maplibregl.Map, visible: boolean): void {
  if (map.getLayer('osm-3d-buildings')) {
    map.setLayoutProperty('osm-3d-buildings', 'visibility', visible ? 'visible' : 'none');
  }
  if (map.getLayer('venue-glow-halo')) {
    map.setLayoutProperty('venue-glow-halo', 'visibility', visible ? 'visible' : 'none');
  }
}

// --- 6. Cleanup ---
export function destroyBuildingExtrusions(map: maplibregl.Map): void {
  stopShimmerAnimation();
  state.matchedBuildings.clear();
  state.shimmerBuildings.clear();

  if (!map) return;

  ['Building', 'Building top'].forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', 'visible');
    }
  });
}
