// src/components/map/buildingExtrusions.ts
// 3D Building Extrusion Engine — "The Nuclear Option"
// Replaces pin markers with glowing, color-coded 3D building extrusions
// using MapLibre Feature State API for high-performance per-building styling.

import maplibregl from 'maplibre-gl';

// --- Venue color palette matching BIA retail categories ---
const VENUE_COLORS: Record<string, string> = {
  Nightlife: '#d946ef', // Fuchsia
  Eatery:    '#f97316', // Orange
  Stage:     '#eab308', // Yellow
  Retail:    '#64748b', // Slate
  default:   '#1a1a2e', // Dormant dark
};

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
}

// Module state
let state: BuildingExtrusionState = {
  matchedBuildings: new Map(),
  shimmerBuildings: new Set(),
  animationFrameId: null,
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

  // --- Step B: Dim existing flat building layers ---
  // The dataviz-dark style has "Building" and "Building top" as flat fills.
  // We'll hide them so our 3D extrusions replace them entirely.
  const flatBuildingLayers = ['Building', 'Building top'];
  flatBuildingLayers.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', 'none');
    }
  });

  // --- Step C: Add the 3D fill-extrusion layer ---
  if (!map.getLayer('osm-3d-buildings')) {
    map.addLayer({
      id: 'osm-3d-buildings',
      type: 'fill-extrusion',
      source: 'maptiler_planet',
      'source-layer': 'building',
      minzoom: 14.5,
      paint: {
        // Color: driven by feature-state, fallback to dormant dark
        // coalesce resolves to the first non-null value
        'fill-extrusion-color': [
          'coalesce',
          ['feature-state', 'venueColor'],
          '#1a1a2e' // Dormant: deep midnight blue-black
        ],
        // Height: smooth zoom interpolation from flat → true height
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14.5, 0,
          15.5, ['coalesce', ['get', 'render_height'], 6]
        ],
        // Base: for multi-story floating structures
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14.5, 0,
          15.5, ['coalesce', ['get', 'render_min_height'], 0]
        ],
        'fill-extrusion-opacity': 0.85,
      },
    }, firstSymbolId);
  }

  // --- Step D: Add the "Firefly" glow layer (flat circle beneath buildings) ---
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

  // --- Step E: Click handler for 3D buildings ---
  map.on('click', 'osm-3d-buildings', (e) => {
    if (!e.features || e.features.length === 0) return;
    const feature = e.features[0];
    const featureId = feature.id as number;
    const match = state.matchedBuildings.get(featureId);
    if (!match) return; // Not a venue building — ignore

    // The popup will be handled by the existing BIA retail click or venue marker system
    // For now, we let the click fall through
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
    const sourceLayer = (layer as any)['source-layer'] || '';
    const layerId = layer.id.toLowerCase();

    // Target POI-related symbol layers
    if (
      sourceLayer === 'poi' ||
      layerId.includes('poi') ||
      (sourceLayer === 'place' && layerId.includes('label'))
    ) {
      // Don't suppress place labels — they're useful for orientation
      // Only suppress actual POI markers
      if (sourceLayer === 'poi' || layerId.includes('poi')) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    }
  });
}

// --- 3. Spatial Join: Match Venues to Building Polygons ---
export function matchVenuesToBuildings(
  map: maplibregl.Map,
  venues: Array<{ id: string; lng: number; lat: number; category: string; hasSpecials: boolean }>,
): void {
  if (!map.getLayer('osm-3d-buildings')) return;

  // Clear previous matches
  state.matchedBuildings.forEach((match, featureId) => {
    try {
      map.setFeatureState(
        { source: 'maptiler_planet', sourceLayer: 'building', id: featureId },
        { venueColor: null },
      );
    } catch { /* Feature may no longer be rendered */ }
  });
  state.matchedBuildings.clear();
  state.shimmerBuildings.clear();

  const glowFeatures: GeoJSON.Feature[] = [];

  venues.forEach((venue) => {
    const color = VENUE_COLORS[venue.category] || VENUE_COLORS.default;

    // Project venue lat/lng to screen pixels
    const point = map.project([venue.lng, venue.lat]);

    // Create micro-bounding box (8x8 px) for hit detection
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - 4, point.y - 4],
      [point.x + 4, point.y + 4],
    ];

    // Query only the 3D buildings layer
    const features = map.queryRenderedFeatures(bbox, {
      layers: ['osm-3d-buildings'],
    });

    if (features.length > 0) {
      // Take the first (most likely correct) building
      const buildingFeature = features[0];
      const featureId = buildingFeature.id as number;

      if (featureId != null) {
        const match: VenueMatch = {
          venueId: venue.id,
          buildingFeatureId: featureId,
          category: venue.category,
          color,
          hasSpecials: venue.hasSpecials,
        };

        state.matchedBuildings.set(featureId, match);

        if (venue.hasSpecials) {
          state.shimmerBuildings.add(featureId);
        }

        // Apply feature state color
        try {
          map.setFeatureState(
            { source: 'maptiler_planet', sourceLayer: 'building', id: featureId },
            { venueColor: color },
          );
        } catch (err) {
          console.warn('[3D Buildings] Failed to set feature state:', err);
        }

        // Add glow point for this venue
        glowFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] },
          properties: { color, venueId: venue.id },
        });
      }
    }
  });

  // Update glow source
  const glowSource = map.getSource('venue-glow-source') as maplibregl.GeoJSONSource | undefined;
  if (glowSource) {
    glowSource.setData({
      type: 'FeatureCollection',
      features: glowFeatures,
    });
  }

  console.log(`[3D Buildings] Matched ${state.matchedBuildings.size}/${venues.length} venues to OSM buildings`);
}

// --- 4. Shimmer Animation Loop ---
export function startShimmerAnimation(map: maplibregl.Map): void {
  stopShimmerAnimation();

  function animate(timestamp: number): void {
    if (state.shimmerBuildings.size === 0) {
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    // Calculate oscillation: smooth sine wave normalized to 0..1
    // Speed divisor of 1500 gives a ~3s full cycle — mesmerizing but not distracting
    const t = (Math.sin(timestamp / 1500) + 1) / 2;

    state.shimmerBuildings.forEach((featureId) => {
      const match = state.matchedBuildings.get(featureId);
      if (!match) return;

      const interpolatedColor = lerpColor(match.color, SHIMMER_PEAK, t * 0.5); // Max 50% toward white

      try {
        map.setFeatureState(
          { source: 'maptiler_planet', sourceLayer: 'building', id: featureId },
          { venueColor: interpolatedColor },
        );
      } catch { /* Feature may not be rendered at current zoom */ }
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

  // Restore flat building layers
  ['Building', 'Building top'].forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', 'visible');
    }
  });
}
