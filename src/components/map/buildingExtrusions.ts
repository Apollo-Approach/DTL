// src/components/map/buildingExtrusions.ts
// 3D Building Extrusion Engine — "The Nuclear Option"
// Replaces pin markers with glowing, color-coded 3D building extrusions
// using a custom GeoJSON source to prevent tile-based ID collisions.

import maplibregl from 'maplibre-gl';

// --- Venue color palette matching BIA retail categories ---
const VENUE_COLORS: Record<string, string> = {
  Nightlife: '#d946ef', // Fuchsia
  Bars:      '#a855f7', // Purple
  Eatery:    '#f97316', // Orange
  Eats2:     '#f97316', // Orange
  Stage:     '#eab308', // Yellow
  Retail:    '#64748b', // Slate
  Amenity:   '#64748b', // Slate
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
  matchedBuildings: Map<number, VenueMatch[]>;
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

  // --- Step B: Hide existing 3D building extrusions to prevent z-fighting, but keep 2D outlines ---
  const style = map.getStyle();
  if (style?.layers) {
    style.layers.forEach(layer => {
      const sourceLayer = ('source-layer' in layer ? layer['source-layer'] : '') as string;
      if (sourceLayer === 'building' && (layer as any).source === 'maptiler_planet' && layer.type === 'fill-extrusion') {
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

  // Add a 2D line layer to heavily demarcate the venue footprints from above
  if (!map.getLayer('osm-2d-building-outlines')) {
    map.addLayer({
      id: 'osm-2d-building-outlines',
      type: 'line',
      source: 'venue-buildings-source',
      minzoom: 14.5,
      paint: {
        'line-color': [
          'case',
          ['!=', ['feature-state', 'venueColor'], null],
          ['feature-state', 'venueColor'],
          ['coalesce', ['get', 'venueColor'], '#ffffff']
        ],
        'line-width': 2,
        'line-opacity': 1.0,
      },
    }, 'osm-3d-buildings');
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
      const matches = state.matchedBuildings.get(featureId);
      if (!matches) continue;
      
      for (const match of matches) {
        if (seen.has(match.venueId)) continue;
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
    }

    if (candidates.length === 0) return;

    // Pick the venue whose marker is closest to where the user actually clicked
    candidates.sort((a, b) => a.screenDist - b.screenDist);
    const targetVenueId = candidates[0].venueId;
    
    // Dispatch event to open the MapLibre popup natively instead of navigating away
    window.dispatchEvent(new CustomEvent('open-venue-popup', { detail: { venueId: targetVenueId } }));
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

// --- 3. Match Venues to Civic Buildings ---
let cachedCivicGeoJSON: GeoJSON.FeatureCollection | null = null;

export async function matchVenuesToBuildings(
  map: maplibregl.Map,
  venues: Array<{ id: string; lng: number; lat: number; category: string; hasSpecials: boolean; building_footprint?: any }>,
): Promise<void> {
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
  const geomHashes = new Map<string, number>();

  venues.forEach((venue) => {
    const color = VENUE_COLORS[venue.category] || VENUE_COLORS.default;
    
    // Use the real-time building footprint stored on the venue
    const footprintGeometry = venue.building_footprint;

    if (footprintGeometry) {
      const hash = JSON.stringify(footprintGeometry);
      let customFeatureId = geomHashes.get(hash);

      if (customFeatureId === undefined) {
        customFeatureId = state.nextFeatureId++;
        geomHashes.set(hash, customFeatureId);

        const renderHeight = footprintGeometry.properties?.height || footprintGeometry.properties?.HEIGHT || 10;
        const renderBase = 0;

        const newFeature: GeoJSON.Feature = {
          type: 'Feature',
          id: customFeatureId,
          geometry: footprintGeometry,
          properties: {
            venueId: venue.id,
            venueColor: ENABLE_VENUE_COLORING ? color : '#64748b',
            venueHeight: renderHeight,
            venueBase: renderBase,
          }
        };

        buildingFeatures.push(newFeature);
      }

      const match: VenueMatch = {
        venueId: venue.id,
        buildingFeatureId: customFeatureId,
        category: venue.category,
        color,
        hasSpecials: venue.hasSpecials,
      };

      if (!state.matchedBuildings.has(customFeatureId)) {
        state.matchedBuildings.set(customFeatureId, []);
      }
      state.matchedBuildings.get(customFeatureId)!.push(match);

      if (venue.hasSpecials) {
        state.shimmerBuildings.add(customFeatureId);
      }
    }

    // Always add glow point for venues (even if building missing)
    if (ENABLE_VENUE_COLORING) {
      glowFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] },
        properties: { color, venueId: venue.id },
      });
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

  console.log(`[3D Buildings] Matched ${state.matchedBuildings.size}/${venues.length} venues to civic building footprints`);
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
      const matches = state.matchedBuildings.get(featureId);
      if (!matches || matches.length === 0) return;

      // Use the color of the first match that has specials, or fallback to the first match
      const activeMatch = matches.find(m => m.hasSpecials) || matches[0];
      const baseColor = ENABLE_VENUE_COLORING ? activeMatch.color : '#64748b';
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
  if (map.getLayer('osm-2d-building-outlines')) {
    map.setLayoutProperty('osm-2d-building-outlines', 'visibility', visible ? 'visible' : 'none');
  }
}

// --- 6. Cleanup ---
export function destroyBuildingExtrusions(map: maplibregl.Map): void {
  stopShimmerAnimation();
  state.matchedBuildings.clear();
  state.shimmerBuildings.clear();

  if (!map || !map.getStyle()) return;

  try {
    ['Building', 'Building top'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    });
  } catch (e) {
    // Ignore errors during map teardown
  }
}

