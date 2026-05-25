'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSON } from 'geojson';
import {
  initBuildingExtrusions,
  destroyBuildingExtrusions,
  matchVenuesToBuildings,
  setBuildingExtrusionsVisible,
  setEnableVenueColoring,
  startShimmerAnimation,
  stopShimmerAnimation
} from '@/components/map/buildingExtrusions';
import {
  getVenueCategory,
  BusState,
  getBusPolygon,
  getOccupancyText,
  getOccupancyColor,
  getStatusText,
} from '@/components/map/mapHelpers';

interface Venue {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  address?: string;
  late_night_eligible?: boolean;
}

// TransitBus uses BusState from mapHelpers for full 3D rendering support

interface ClientMapDebugProps {
  venues: Venue[];
}

export default function ClientMapDebug({ venues }: ClientMapDebugProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [clickLogs, setClickLogs] = useState<string[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [matchedStatus, setMatchedStatus] = useState<Record<string, { matched: boolean; layer?: string; reason?: string }>>({});
  const [showExtrusions, setShowExtrusions] = useState(true);
  const [enableColoring, setEnableColoring] = useState(true);
  const [showTransit, setShowTransit] = useState(false);
  const [showParking, setShowParking] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const [showConstruction, setShowConstruction] = useState(false);
  const [showHQ, setShowHQ] = useState(true);
  const [showSafeWalk, setShowSafeWalk] = useState(false);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [safeWalkTarget, setSafeWalkTarget] = useState<{ name: string } | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(['Eatery', 'Bars', 'Stage', 'Nightlife']));

  // Helper: toggle a venue category in the active set
  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const [transitBusCount, setTransitBusCount] = useState(0);
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [constructionData, setConstructionData] = useState<any[]>([]);
  const busStateRef = useRef<Record<string, BusState>>({});
  const transitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const constructionMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hqMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Helper: Simple distance calculation
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in meters
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    const mapStyle = mapTilerKey 
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
      : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-81.2497, 42.9836], // Dundas Place, London, ON
      zoom: 16,
      pitch: 45,
      bearing: -17.6, // Cinematic rotation matching prod
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true
    }), 'top-right');

    map.on('load', () => {
      setMapLoaded(true);
      setMapInstance(map);
      (window as any).map = map;

      // Find first symbol layer to place buildings underneath text/labels
      const layers = map.getStyle().layers;
      let firstSymbolId: string | undefined;
      if (layers) {
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].type === 'symbol') {
            firstSymbolId = layers[i].id;
            break;
          }
        }
      }

      initBuildingExtrusions(map, firstSymbolId);
      startShimmerAnimation(map);

      // Get all layers in the style
      setActiveLayers((layers || []).map(l => l.id));

      // ── Load LTC transit route shapes ──
      fetch('/civic_data/ltc_shapes.geojson')
        .then(r => r.json())
        .then((geojson: GeoJSON) => {
          if (map.getSource('ltc-routes')) return;
          map.addSource('ltc-routes', { type: 'geojson', data: geojson });
          map.addLayer({
            id: 'ltc-route-lines',
            type: 'line',
            source: 'ltc-routes',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
              visibility: 'none', // starts hidden
            },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 3,
              'line-opacity': 0.6,
            },
          }, firstSymbolId);
        })
        .catch(err => console.warn('Failed to load LTC shapes:', err));

      // ── 3D Transit Sources & Layers (from prod) ──
      map.addSource('transit-body-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('transit-label-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // Congestion underglow for slow/stopped buses
      map.addLayer({
        id: 'bus-congestion-glow', type: 'circle', source: 'transit-label-source',
        layout: { visibility: 'none' },
        filter: ['all', ['==', ['get', 'isDelayed'], false], ['<', ['get', 'speed'], 1.38]],
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 30], 'circle-color': '#ef4444', 'circle-blur': 1, 'circle-opacity': 0.6 }
      }, firstSymbolId);

      // 3D volumetric bus body extrusion
      map.addLayer({
        id: 'bus-body-extrusion', type: 'fill-extrusion', source: 'transit-body-source',
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'isDelayed'], true], '#888888',
            ['==', ['get', 'hasOccupancyData'], false], '#3b82f6',
            ['>=', ['get', 'occupancyStatus'], 5], '#dc2626',
            ['>=', ['get', 'occupancyStatus'], 3], '#ef4444',
            ['==', ['get', 'occupancyStatus'], 2], '#eab308',
            ['==', ['get', 'occupancyStatus'], 1], '#22c55e',
            ['==', ['get', 'occupancyStatus'], 0], '#10b981',
            '#3b82f6'
          ],
          'fill-extrusion-height': 5.4, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95
        }
      }, firstSymbolId);

      // Floating route label on bus roof
      map.addLayer({
        id: 'bus-roof-label', type: 'symbol', source: 'transit-label-source',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'routeLabel'], 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 13, 'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport'
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 2 }
      });

      // Bus click popup
      map.on('mouseenter', 'bus-body-extrusion', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'bus-body-extrusion', () => map.getCanvas().style.cursor = '');
      map.on('click', 'bus-body-extrusion', (e) => {
        if (!e.features?.[0]) return;
        const p = e.features[0].properties;
        // Highlight clicked route, dim others
        map.setPaintProperty('ltc-route-lines', 'line-opacity',
          ['case', ['==', ['get', 'routeId'], p.routeId], 0.8, 0.05]);
        const occText = getOccupancyText(p.occupancyStatus, p.occupancyPercentage, p.hasOccupancyData);
        const occColor = getOccupancyColor(p.occupancyStatus, p.hasOccupancyData);
        const statText = getStatusText(p.currentStatus);
        const pctDisplay = (p.hasOccupancyData && p.occupancyPercentage != null) ? p.occupancyPercentage : null;
        let delayHTML = '';
        if (p.delayLabel && p.delaySeconds != null) {
          const ds = Number(p.delaySeconds);
          delayHTML = ds > 120 ? `<div style="color:#ef4444;font-size:11px;font-weight:bold;margin-top:2px;">⚠️ ${p.delayLabel}</div>`
            : ds < -60 ? `<div style="color:#22c55e;font-size:11px;font-weight:bold;margin-top:2px;">🟢 ${p.delayLabel}</div>`
            : `<div style="color:#22c55e;font-size:11px;font-weight:bold;margin-top:2px;">✅ On time</div>`;
        } else if (p.isDelayed) {
          delayHTML = `<div style="color:#ef4444;font-size:11px;font-weight:bold;margin-top:2px;">⚠️ Stale signal</div>`;
        }
        new maplibregl.Popup({ offset: 15 }).setLngLat([p.centerLng, p.centerLat]).setHTML(
          `<div style="color:black;padding:4px;font-family:sans-serif;min-width:180px;">
            <strong style="font-size:14px;color:#006c5b;">🚌 ${p.headsign || 'Route ' + p.routeId}</strong><br/>
            ${delayHTML}
            <div style="margin-top:6px;font-size:12px;line-height:1.4;">
              <div>📍 <strong>${statText}</strong> Stop #${p.stopId || '?'}</div>
              <div>👥 <strong>Occupancy:</strong> ${occText}${pctDisplay != null ? ' (' + pctDisplay + '%)' : ''}</div>
              ${pctDisplay != null ? `<div style="background:#1e293b;border-radius:4px;height:6px;width:100%;margin-top:3px;"><div style="background:${occColor};height:100%;width:${Math.min(pctDisplay, 100)}%;border-radius:4px;"></div></div>` : ''}
              <div>⏱️ <strong>Speed:</strong> ${(p.speed * 3.6).toFixed(1)} km/h</div>
            </div>
          </div>`
        ).addTo(map);
      });

      // Reset route highlight on empty click
      map.on('click', (e) => {
        if (!map.queryRenderedFeatures(e.point, { layers: ['bus-body-extrusion'] }).length) {
          if (map.getLayer('ltc-route-lines')) map.setPaintProperty('ltc-route-lines', 'line-opacity', 0.6);
        }
      });

      // ── Parking Layers ──
      map.addSource('parking-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'parking-extrusion', type: 'fill-extrusion', source: 'parking-source',
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#06b6d4', 'fill-extrusion-height': 1, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.85 }
      }, firstSymbolId);
      map.addLayer({
        id: 'parking-outline-glow', type: 'line', source: 'parking-source',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#06b6d4', 'line-width': 2, 'line-opacity': 0.6, 'line-blur': 3 }
      }, firstSymbolId);
      map.addLayer({
        id: 'parking-icons', type: 'symbol', source: 'parking-source',
        layout: { visibility: 'none', 'text-field': '🅿️', 'text-size': 16, 'text-allow-overlap': false, 'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport' },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 }
      });
      map.addSource('on-street-parking-source', { type: 'geojson', data: '/civic_data/on_street_parking.geojson' });
      map.addLayer({
        id: 'on-street-parking-layer', type: 'line', source: 'on-street-parking-source',
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }
      }, firstSymbolId);
      map.on('mouseenter', 'parking-extrusion', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'parking-extrusion', () => map.getCanvas().style.cursor = '');

      // ── SafeWalk Neon Route Source & Layers ──
      if (!map.getSource('safe-route-source')) {
        map.addSource('safe-route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      // Layer 1: Neon underglow (wide blurred cyan line)
      if (!map.getLayer('safe-route-glow')) {
        map.addLayer({
          id: 'safe-route-glow', type: 'line', source: 'safe-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': '#06b6d4', 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.6 }
        }, firstSymbolId);
      }
      // Layer 2: Bright dashed core line
      if (!map.getLayer('safe-route-core')) {
        map.addLayer({
          id: 'safe-route-core', type: 'line', source: 'safe-route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [0, 2] }
        }, firstSymbolId);
      }
    });

    // Handle Click on the map to query features
    map.on('click', (e) => {
      // Skip if the click originated from a MapLibre marker (event, construction, HQ, etc.)
      // This lets the marker's own popup toggle handle the interaction
      const target = (e.originalEvent?.target as HTMLElement);
      if (target?.closest('.maplibregl-marker')) return;

      // Query the target layers (including building-hitbox) under the click point
      const targetLayers = ['building-hitbox', 'Building', 'Building top', 'building', 'Building 3D']
        .filter(layerId => map.getLayer(layerId));
      
      const features = map.queryRenderedFeatures(e.point, { layers: targetLayers.length > 0 ? targetLayers : undefined });
      
      const logs: string[] = [];
      logs.push(`CLICK AT: Lng: ${e.lngLat.lng.toFixed(5)}, Lat: ${e.lngLat.lat.toFixed(5)}`);
      logs.push(`Screen Point: X: ${Math.round(e.point.x)}, Y: ${Math.round(e.point.y)}`);

      if (features.length === 0) {
        logs.push('No building features found directly under cursor.');
      } else {
        logs.push(`Found ${features.length} building features under cursor:`);
        features.slice(0, 8).forEach((f, idx) => {
          logs.push(`[Feature ${idx + 1}]`);
          logs.push(`  Layer ID: "${f.layer.id}"`);
          logs.push(`  Source Layer: "${f.sourceLayer || 'N/A'}"`);
          logs.push(`  Geometry Type: "${f.geometry.type}"`);
          logs.push(`  Properties: ${JSON.stringify(f.properties)}`);
        });
      }

      // Check nearest venue to the clicked point
      let nearestVenue: Venue | null = null;
      let minDistance = Infinity;
      venues.forEach(v => {
        const dist = getDistance(e.lngLat.lat, e.lngLat.lng, v.lat, v.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestVenue = v;
        }
      });

      if (nearestVenue) {
        logs.push(`Nearest Venue: ${(nearestVenue as Venue).name} (${minDistance.toFixed(1)}m away)`);
        const vPoint = map.project([(nearestVenue as Venue).lng, (nearestVenue as Venue).lat]);
        const screenDist = Math.hypot(e.point.x - vPoint.x, e.point.y - vPoint.y);
        logs.push(`  Screen distance to marker: ${screenDist.toFixed(1)}px`);
        
        // If click is within 50 meters, select the venue
        if (minDistance < 50) {
          setSelectedVenue(nearestVenue);
          logs.push(`Automatically selected ${(nearestVenue as Venue).name} due to proximity.`);
        }
      }

      setClickLogs(logs);
    });

    return () => {
      stopShimmerAnimation();
      if (transitIntervalRef.current) clearInterval(transitIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      map.remove();
    };
  }, [venues]);

  // Track whether the 3D extrusion geometry has been built (expensive, should only run once)
  const extrusionsBuiltRef = useRef(false);

  // Run sidebar status checks on idle, but only build 3D geometry once
  useEffect(() => {
    if (!mapInstance || !mapLoaded || venues.length === 0) return;

    // Reset the extrusions-built flag when deps change (new map or new venues)
    extrusionsBuiltRef.current = false;

    const venueMatchData = venues.map(venue => {
      const category = getVenueCategory(venue.type);
      return {
        id: venue.id,
        lng: venue.lng,
        lat: venue.lat,
        category,
        hasSpecials: !!venue.late_night_eligible,
      };
    });

    // Lightweight: only updates the sidebar status indicators (no GeoJSON rebuild)
    const updateStatusOnly = () => {
      const map = mapInstance;
      const statusUpdates: Record<string, { matched: boolean; layer?: string; reason?: string }> = {};

      const targetLayers = ['building-hitbox', 'Building', 'Building top', 'building', 'Building 3D']
        .filter(layerId => map.getLayer(layerId));

      venues.forEach(venue => {
        const point = map.project([venue.lng, venue.lat]);
        const HITBOX_BUFFER = 15;
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [point.x - HITBOX_BUFFER, point.y - HITBOX_BUFFER],
          [point.x + HITBOX_BUFFER, point.y + HITBOX_BUFFER],
        ];

        if (targetLayers.length === 0) {
          statusUpdates[venue.id] = { matched: false, reason: 'No building layers found in active style' };
          return;
        }

        const features = map.queryRenderedFeatures(bbox, { layers: targetLayers });
        if (features.length > 0) {
          statusUpdates[venue.id] = {
            matched: true,
            layer: features[0].layer.id,
            reason: `Found building geometry of type "${features[0].geometry.type}" (Source layer: "${features[0].sourceLayer || ''}")`
          };
        } else {
          statusUpdates[venue.id] = {
            matched: false,
            reason: `No building features in 30x30px box (X: ${Math.round(point.x)}, Y: ${Math.round(point.y)})`
          };
        }
      });

      setMatchedStatus(statusUpdates);
    };

    // Full matching: builds 3D extrusion geometry + updates sidebar status
    const performFullMatching = () => {
      updateStatusOnly();
      matchVenuesToBuildings(mapInstance, venueMatchData);
      extrusionsBuiltRef.current = true;
    };

    const onIdle = () => {
      if (!extrusionsBuiltRef.current) {
        // First idle after load — tiles are ready, build the 3D geometry
        performFullMatching();
      } else {
        // Subsequent idles (zoom/pan) — only update sidebar indicators, don't rebuild geometry
        updateStatusOnly();
      }
    };

    mapInstance.on('idle', onIdle);

    return () => {
      if (mapInstance) {
        mapInstance.off('idle', onIdle);
      }
    };
  }, [mapInstance, mapLoaded, venues]);

  // Synchronize building visibility
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;
    setBuildingExtrusionsVisible(mapInstance, showExtrusions);
  }, [mapInstance, mapLoaded, showExtrusions]);

  // Synchronize venue coloring enabled state
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;
    setEnableVenueColoring(enableColoring);
    
    // Force re-matching to update colors
    const venueMatchData = venues.map(venue => {
      const category = getVenueCategory(venue.type);
      return {
        id: venue.id,
        lng: venue.lng,
        lat: venue.lat,
        category,
        hasSpecials: !!venue.late_night_eligible,
      };
    });
    matchVenuesToBuildings(mapInstance, venueMatchData);
  }, [mapInstance, mapLoaded, enableColoring, venues]);

  // Create markers overlay — only when map/venues change, NOT on every matchedStatus update
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapInstance || !mapLoaded || venues.length === 0) return;

    // Clean up old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    venues.forEach(venue => {
      const el = document.createElement('div');
      el.id = `venue-marker-${venue.id}`;
      el.className = 'group cursor-pointer';
      el.style.zIndex = '1';

      const inner = document.createElement('div');
      inner.id = `venue-marker-dot-${venue.id}`;
      inner.className = 'w-5 h-5 rounded-full border border-white flex items-center justify-center text-[11px] shadow-md transition-transform group-hover:scale-125';
      
      // Start with a neutral color — the color-update effect will set the right color
      inner.style.backgroundColor = '#6b7280';
      inner.style.color = '#fff';
      
      // Category-based emoji icon
      const category = getVenueCategory(venue.type);
      const categoryEmoji: Record<string, string> = {
        Eatery: '🍴',
        Bars: '🍺',
        Stage: '🎭',
        Nightlife: '🌙',
        Retail: '🛍️',
      };
      inner.innerText = categoryEmoji[category] || '📍';
      
      el.appendChild(inner);
      el.title = `${venue.name} (${venue.type})`;
      el.setAttribute('data-venue-type', category);

      el.addEventListener('click', () => {
        setSelectedVenue(venue);
        mapInstance.easeTo({
          center: [venue.lng, venue.lat],
          zoom: 17.5,
          duration: 800
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([venue.lng, venue.lat])
        .addTo(mapInstance);

      markersRef.current.push(marker);
    });

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [mapInstance, mapLoaded, venues]);

  // Update marker dot colors in-place when matchedStatus changes (no teardown/recreate)
  useEffect(() => {
    venues.forEach(venue => {
      const dot = document.getElementById(`venue-marker-dot-${venue.id}`);
      if (!dot) return;
      const isMatched = matchedStatus[venue.id]?.matched;
      dot.style.backgroundColor = isMatched ? '#10b981' : '#ef4444';
      const el = dot.parentElement;
      if (el) {
        el.title = `${venue.name} (${venue.type}) - ${isMatched ? 'Matched' : 'Failed'}`;
      }
    });
  }, [matchedStatus, venues]);

  // ── 3D Transit layer toggle with LERP animation engine ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    const transitLayers = ['ltc-route-lines', 'bus-body-extrusion', 'bus-roof-label', 'bus-congestion-glow'];
    const vis = showTransit ? 'visible' : 'none';
    transitLayers.forEach(id => {
      if (mapInstance.getLayer(id)) mapInstance.setLayoutProperty(id, 'visibility', vis);
    });

    // Stop animation and polling
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = undefined; }
    if (transitIntervalRef.current) { clearInterval(transitIntervalRef.current); transitIntervalRef.current = null; }

    if (!showTransit) {
      busStateRef.current = {};
      setTransitBusCount(0);
      const bodySrc = mapInstance.getSource('transit-body-source') as maplibregl.GeoJSONSource;
      const lblSrc = mapInstance.getSource('transit-label-source') as maplibregl.GeoJSONSource;
      if (bodySrc) bodySrc.setData({ type: 'FeatureCollection', features: [] });
      if (lblSrc) lblSrc.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const LERP_INTERVAL = 15_000; // match prod polling

    const fetchBuses = async () => {
      try {
        const res = await fetch('/api/civic/transit');
        if (!res.ok) return;
        const data = await res.json();
        const buses = data.buses || [];
        const now = Date.now();
        const newState: Record<string, BusState> = {};

        buses.forEach((bus: any) => {
          const prev = busStateRef.current[bus.id];
          newState[bus.id] = {
            id: bus.id,
            startLng: prev?.currentLng ?? bus.targetLng,
            startLat: prev?.currentLat ?? bus.targetLat,
            currentLng: prev?.currentLng ?? bus.targetLng,
            currentLat: prev?.currentLat ?? bus.targetLat,
            targetLng: bus.targetLng,
            targetLat: bus.targetLat,
            startTime: now,
            directionId: bus.directionId ?? 0,
            headsign: bus.headsign || `Route ${bus.routeId}`,
            routeId: bus.routeId,
            tripId: bus.tripId ?? null,
            speed: bus.speed ?? 0,
            isDelayed: bus.isDelayed ?? false,
            delaySeconds: bus.delaySeconds ?? null,
            delayLabel: bus.delayLabel ?? null,
            currentStatus: bus.currentStatus ?? 2,
            stopId: bus.stopId ?? '',
            occupancyStatus: bus.occupancyStatus ?? 0,
            occupancyPercentage: bus.occupancyPercentage ?? null,
            hasOccupancyData: bus.hasOccupancyData ?? false,
            timestamp: bus.timestamp ?? now,
            bearing: bus.bearing ?? 0,
          };
        });

        busStateRef.current = newState;
        setTransitBusCount(Object.keys(newState).length);
      } catch (err) {
        console.warn('Transit fetch error:', err);
      }
    };

    // LERP animation loop — 60fps interpolation
    const animate = () => {
      const map = mapInstance;
      if (!map || !map.getSource('transit-body-source')) return;

      const now = Date.now();
      const bodyFeatures: GeoJSON.Feature[] = [];
      const labelFeatures: GeoJSON.Feature[] = [];

      Object.values(busStateRef.current).forEach(bus => {
        const elapsed = now - bus.startTime;
        const t = Math.min(elapsed / LERP_INTERVAL, 1);
        const easedT = t * (2 - t); // ease-out quad

        bus.currentLng = bus.startLng + (bus.targetLng - bus.startLng) * easedT;
        bus.currentLat = bus.startLat + (bus.targetLat - bus.startLat) * easedT;

        const polygon = getBusPolygon(bus.currentLng, bus.currentLat, bus.bearing);
        const props = {
          routeId: bus.routeId,
          routeLabel: bus.routeId,
          headsign: bus.headsign,
          isDelayed: bus.isDelayed,
          speed: bus.speed,
          delayLabel: bus.delayLabel,
          delaySeconds: bus.delaySeconds,
          currentStatus: bus.currentStatus,
          stopId: bus.stopId,
          occupancyStatus: bus.occupancyStatus,
          occupancyPercentage: bus.occupancyPercentage,
          hasOccupancyData: bus.hasOccupancyData,
          centerLng: bus.currentLng,
          centerLat: bus.currentLat,
        };

        bodyFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: polygon }, properties: props });
        labelFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [bus.currentLng, bus.currentLat] }, properties: props });
      });

      const bodySrc = map.getSource('transit-body-source') as maplibregl.GeoJSONSource;
      const lblSrc = map.getSource('transit-label-source') as maplibregl.GeoJSONSource;
      if (bodySrc) bodySrc.setData({ type: 'FeatureCollection', features: bodyFeatures });
      if (lblSrc) lblSrc.setData({ type: 'FeatureCollection', features: labelFeatures });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    fetchBuses().then(() => { animationFrameRef.current = requestAnimationFrame(animate); });
    transitIntervalRef.current = setInterval(fetchBuses, LERP_INTERVAL);

    return () => {
      if (transitIntervalRef.current) clearInterval(transitIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [mapInstance, mapLoaded, showTransit]);

  // ── Parking layer toggle ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    const parkingLayers = ['parking-extrusion', 'parking-outline-glow', 'parking-icons', 'on-street-parking-layer'];
    const vis = showParking ? 'visible' : 'none';
    parkingLayers.forEach(id => {
      if (mapInstance.getLayer(id)) mapInstance.setLayoutProperty(id, 'visibility', vis);
    });

    if (showParking) {
      // Load parking lot data on first toggle
      const src = mapInstance.getSource('parking-source') as maplibregl.GeoJSONSource;
      if (src) {
        fetch('/api/civic/parking')
          .then(r => r.json())
          .then(geojson => {
            // API returns FeatureCollection directly, not wrapped
            if (geojson?.type === 'FeatureCollection') src.setData(geojson);
          })
          .catch(err => console.warn('Parking fetch error:', err));
      }
    }
  }, [mapInstance, mapLoaded, showParking]);

  // ── Events layer toggle (venue-clustered) ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    eventMarkersRef.current.forEach(m => m.remove());
    eventMarkersRef.current = [];

    if (!showEvents) { setEventsData([]); return; }

    fetch('/api/civic/events')
      .then(r => r.json())
      .then(data => {
        const events = (data.events || []).filter((e: any) => e.lat && e.lng);
        setEventsData(events);

        // Cluster events by venue (group by proximity within ~200m)
        const clusters: { lat: number; lng: number; venue: string; events: any[] }[] = [];
        events.forEach((evt: any) => {
          const existing = clusters.find(c =>
            Math.abs(c.lat - evt.lat) < 0.002 && Math.abs(c.lng - evt.lng) < 0.002
          );
          if (existing) {
            existing.events.push(evt);
          } else {
            clusters.push({ lat: evt.lat, lng: evt.lng, venue: evt.venue, events: [evt] });
          }
        });

        clusters.forEach(cluster => {
          const count = cluster.events.length;
          const el = document.createElement('div');
          el.className = 'debug-event-marker cursor-pointer';
          el.innerHTML = `
            <div style="position:relative;width:44px;height:44px;background:#db2777;border-radius:12px;border:2px solid white;box-shadow:0 2px 12px rgba(219,39,119,0.6);display:flex;align-items:center;justify-content:center;font-size:20px;transition:transform 0.2s;">
              🎫
              ${count > 1 ? `<span style="position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;background:#fff;color:#db2777;border-radius:10px;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:1.5px solid #db2777;">${count}</span>` : ''}
            </div>`;
          el.onmouseenter = () => (el.firstElementChild as HTMLElement).style.transform = 'scale(1.12)';
          el.onmouseleave = () => (el.firstElementChild as HTMLElement).style.transform = '';

          // Build scrollable event list for popup
          const eventCards = cluster.events
            .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''))
            .map((evt: any) => {
              const dateStr = evt.date ? new Date(evt.date + (evt.time ? 'T' + evt.time : '')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
              const timeStr = evt.time ? new Date('2000-01-01T' + evt.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              const price = evt.priceRange
                ? `<span style="padding:1px 5px;background:#f0fdf4;border:1px solid #86efac;border-radius:3px;font-size:9px;color:#15803d;font-weight:bold;">${evt.priceRange}</span>`
                : `<span style="padding:1px 5px;background:#10b981;border-radius:3px;font-size:9px;color:white;font-weight:bold;">FREE</span>`;
              const link = evt.url ? `<a href="${evt.url}" target="_blank" rel="noopener noreferrer" style="font-size:9px;color:#db2777;font-weight:bold;text-decoration:none;">TICKETS →</a>` : '';
              return `<div style="padding:6px 0;border-bottom:1px solid #eee;">
                <div style="font-weight:bold;font-size:12px;color:#1f2937;margin-bottom:2px;">${evt.name}</div>
                <div style="font-size:10px;color:#666;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                  ${dateStr ? `<span>📅 ${dateStr}${timeStr ? ' @ ' + timeStr : ''}</span>` : ''}
                  ${evt.genre ? `<span>🎵 ${evt.genre}</span>` : ''}
                  ${price} ${link}
                </div>
              </div>`;
            }).join('');

          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([cluster.lng, cluster.lat])
            .setPopup(new maplibregl.Popup({ offset: 25, maxWidth: '320px' }).setHTML(
              `<div style="color:#000;font-family:sans-serif;padding:4px;min-width:250px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:6px;border-bottom:2px solid #db2777;">
                  <h3 style="margin:0;font-weight:900;font-size:14px;color:#be185d;">🎫 ${cluster.venue}</h3>
                  <span style="background:#db2777;color:white;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:bold;">${count} event${count > 1 ? 's' : ''}</span>
                </div>
                <div style="max-height:260px;overflow-y:auto;scrollbar-width:thin;">
                  ${eventCards}
                </div>
              </div>`
            ))
            .addTo(mapInstance);
          eventMarkersRef.current.push(marker);
        });
      })
      .catch(err => console.warn('Events fetch error:', err));

    return () => { eventMarkersRef.current.forEach(m => m.remove()); eventMarkersRef.current = []; };
  }, [mapInstance, mapLoaded, showEvents]);

  // ── Construction layer toggle ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    constructionMarkersRef.current.forEach(m => m.remove());
    constructionMarkersRef.current = [];

    if (!showConstruction) { setConstructionData([]); return; }

    const locationCoords: Record<string, [number, number]> = {
      'renew-ontario-st': [-81.2435, 42.9870],
      'renew-queens-bridge': [-81.2540, 42.9830],
      'renew-brt-east': [-81.2380, 42.9830],
      'renew-wellington-gateway': [-81.2483, 42.9700],
      'renew-york-wellington': [-81.2483, 42.9840],
    };

    // ── Blueprint Toggle ──
    useEffect(() => {
      if (!mapInstance || !mapLoaded) return;
      
      const sourceId = 'blueprint-source';
      const layerId = 'blueprint-layer';
      
      if (showBlueprint) {
        if (!mapInstance.getSource(sourceId)) {
          mapInstance.addSource(sourceId, {
            type: 'image',
            url: '/dtlmap.png',
            coordinates: [
              [-81.264, 42.990], // Top Left
              [-81.238, 42.990], // Top Right
              [-81.238, 42.975], // Bottom Right
              [-81.264, 42.975]  // Bottom Left
            ]
          });
        }
        if (!mapInstance.getLayer(layerId)) {
          // Find first symbol to place underneath text, or just top
          mapInstance.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': 0.65,
              'raster-fade-duration': 0
            }
          });
        }
      } else {
        if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
        if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId);
      }
    }, [mapInstance, mapLoaded, showBlueprint]);

    fetch('/api/civic/construction')
      .then(r => r.json())
      .then(data => {
        const projects = data.projects || [];
        setConstructionData(projects);

        projects.forEach((project: any) => {
          const coords = locationCoords[project.id] || [-81.2497, 42.9836];
          const el = document.createElement('div');
          el.className = 'debug-construction-marker cursor-pointer';
          el.innerHTML = `
            <span style="position:relative;display:flex;height:32px;width:32px;">
              <span style="animation:ping 2.5s cubic-bezier(0,0,0.2,1) infinite;position:absolute;display:inline-flex;height:100%;width:100%;border-radius:50%;background:rgba(251,146,60,0.5);"></span>
              <span style="position:relative;display:inline-flex;height:32px;width:32px;border-radius:50%;background:#ea580c;border:2px solid #fdba74;box-shadow:0 2px 8px rgba(234,88,12,0.5);align-items:center;justify-content:center;font-size:15px;">🚧</span>
            </span>`;

          const impactBadges = (project.impacts || []).map((impact: string) => {
            let color = '#f59e0b', icon = '⚠️';
            if (impact.toLowerCase().includes('road closed')) { color = '#ef4444'; icon = '🚫'; }
            else if (impact.toLowerCase().includes('ltc')) { icon = '🚌'; color = '#06b6d4'; }
            else if (impact.toLowerCase().includes('sidewalk')) { icon = '🚶'; }
            else if (impact.toLowerCase().includes('bike')) { icon = '🚲'; color = '#22c55e'; }
            return `<span style="display:inline-block;padding:2px 6px;margin:2px;background:${color}22;border:1px solid ${color}44;border-radius:4px;font-size:10px;color:${color};font-weight:600;">${icon} ${impact}</span>`;
          }).join('');

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(coords)
            .setPopup(new maplibregl.Popup({ offset: 20, closeButton: true }).setHTML(
              `<div style="color:#000;font-family:sans-serif;padding:6px;min-width:200px;max-width:280px;">
                <h3 style="margin:0 0 4px;font-weight:900;font-size:14px;color:#ea580c;">🚧 ${project.title}</h3>
                <p style="margin:0 0 6px;font-size:11px;color:#666;line-height:1.4;">${project.description}</p>
                <p style="margin:0 0 6px;font-size:11px;color:#444;">📍 ${project.location}</p>
                <div style="display:flex;flex-wrap:wrap;gap:2px;">${impactBadges}</div>
                <p style="margin:6px 0 0;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.05em;">Source: ${project.source === 'renew-london' ? 'Renew London' : 'City of London'}</p>
              </div>`
            ))
            .addTo(mapInstance);
          constructionMarkersRef.current.push(marker);
        });
      })
      .catch(err => console.warn('Construction fetch error:', err));

    return () => { constructionMarkersRef.current.forEach(m => m.remove()); constructionMarkersRef.current = []; };
  }, [mapInstance, mapLoaded, showConstruction]);

  // ── Nightly HQ Beacon toggle ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    if (hqMarkerRef.current) { hqMarkerRef.current.remove(); hqMarkerRef.current = null; }
    if (!showHQ) return;

    const hqEl = document.createElement('div');
    hqEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
        <span style="position:relative;display:flex;height:28px;width:28px;">
          <span style="animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;position:absolute;display:inline-flex;height:100%;width:100%;border-radius:50%;background:rgba(6,182,212,0.5);"></span>
          <span style="position:relative;display:inline-flex;height:28px;width:28px;border-radius:50%;background:rgb(6,182,212);border:2px solid white;box-shadow:0 0 12px rgba(6,182,212,0.6);align-items:center;justify-content:center;font-size:13px;">🏠</span>
        </span>
        <span style="margin-top:3px;font-size:9px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:0.1em;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;">Nightly HQ</span>
      </div>`;
    hqEl.className = 'z-50';

    hqMarkerRef.current = new maplibregl.Marker({ element: hqEl })
      .setLngLat([-81.2498, 42.9844])
      .setPopup(new maplibregl.Popup({ offset: 25, closeButton: true }).setHTML(
        `<div style="color:#000;font-family:sans-serif;padding:8px;min-width:200px;">
          <h3 style="margin:0 0 6px;font-weight:900;font-size:15px;color:#0891b2;">🏠 DTL Nightly HQ</h3>
          <p style="margin:0 0 4px;font-size:12px;color:#444;">430 Richmond St, London ON</p>
          <p style="margin:0 0 8px;font-size:11px;color:#666;">Street Liaison base of operations.<br/>Open nightly during activation hours.</p>
        </div>`
      ))
      .addTo(mapInstance);

    return () => { if (hqMarkerRef.current) { hqMarkerRef.current.remove(); hqMarkerRef.current = null; } };
  }, [mapInstance, mapLoaded, showHQ]);

  // ── SafeWalk routing toggle ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    const glowVis = showSafeWalk ? 'visible' : 'none';
    if (mapInstance.getLayer('safe-route-glow')) mapInstance.setLayoutProperty('safe-route-glow', 'visibility', glowVis);
    if (mapInstance.getLayer('safe-route-core')) mapInstance.setLayoutProperty('safe-route-core', 'visibility', glowVis);

    if (!showSafeWalk) {
      // Clear route data when disabled
      const src = mapInstance.getSource('safe-route-source') as maplibregl.GeoJSONSource;
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
      setSafeWalkTarget(null);
      return;
    }

    // Default test route: HQ → first venue with coordinates
    const testVenue = venues.find(v => v.lat && v.lng);
    if (testVenue) {
      setSafeWalkTarget({ name: testVenue.name });
      fetch(`/api/routing/safe-path?endLng=${testVenue.lng}&endLat=${testVenue.lat}`)
        .then(r => r.json())
        .then(data => {
          if (data.route) {
            const src = mapInstance.getSource('safe-route-source') as maplibregl.GeoJSONSource;
            if (src) src.setData(data.route);
            mapInstance.flyTo({ center: [-81.2497, 42.9836], zoom: 15.2, pitch: 60, essential: true });
          }
        })
        .catch(err => console.warn('SafeWalk route error:', err));
    }
  }, [mapInstance, mapLoaded, showSafeWalk, venues]);

  // ── Venue category filter (markers + extrusions) ──
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;
    // Toggle DOM marker visibility by category
    const markerEls = document.querySelectorAll('[data-venue-type]');
    markerEls.forEach(el => {
      const type = el.getAttribute('data-venue-type') || '';
      (el as HTMLElement).style.display = activeCategories.has(type) ? '' : 'none';
    });

    // Rebuild extrusions with only visible categories
    if (enableColoring) {
      const venueMatchData = venues
        .filter(v => activeCategories.has(getVenueCategory(v.type)))
        .map(venue => ({
          id: venue.id, lng: venue.lng, lat: venue.lat,
          category: getVenueCategory(venue.type),
          hasSpecials: !!venue.late_night_eligible,
        }));
      matchVenuesToBuildings(mapInstance, venueMatchData);
    }
  }, [mapInstance, mapLoaded, activeCategories, enableColoring, venues]);

  // Effect to handle selected venue popup
  useEffect(() => {
    if (!mapInstance || !mapLoaded) return;

    // Remove existing popup if any
    const existingPopups = document.querySelectorAll('.maplibregl-popup');
    existingPopups.forEach(p => p.remove());

    if (!selectedVenue) return;

    // Create and add a new popup
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
      .setLngLat([selectedVenue.lng, selectedVenue.lat])
      .setHTML(`
        <div style="color: #111827; font-family: sans-serif; padding: 6px; min-width: 180px;">
          <h4 style="margin: 0 0 4px 0; font-weight: bold; font-size: 14px; color: #1e1b4b;">${selectedVenue.name}</h4>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #4b5563;">${selectedVenue.address || 'No Address'}</p>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; background: #e0f2fe; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px; color: #0369a1;">
              ${selectedVenue.type}
            </span>
            ${selectedVenue.late_night_eligible ? `
              <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; color: #b45309;">
                🌙 Late Night
              </span>
            ` : ''}
          </div>
        </div>
      `)
      .addTo(mapInstance);

    popup.on('close', () => {
      setSelectedVenue(current => current?.id === selectedVenue.id ? null : current);
    });

    return () => {
      popup.remove();
    };
  }, [mapInstance, mapLoaded, selectedVenue]);

  const stats = Object.values(matchedStatus);
  const matchedCount = stats.filter(s => s.matched).length;
  const totalCount = venues.length;

  return (
    <>
    <style>{`
      .debug-event-marker { z-index: 9999 !important; }
      .debug-construction-marker { z-index: 9998 !important; }
    `}</style>
    <div className="flex h-screen w-screen bg-gray-955 text-gray-100 font-sans overflow-hidden">
      {/* Sidebar: Details & List */}
      <div className="w-96 flex flex-col border-r border-gray-800 bg-gray-900/90 backdrop-blur">
        {/* Header */}
        <div className="p-4 border-b border-gray-850 bg-gray-950/50">
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span>🔍</span> DTL Map Extrusion Debugger
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Validating OSM building matches for venue coordinates.
          </p>
          <div className="mt-3 flex flex-col gap-2 bg-gray-900/50 p-2.5 rounded border border-gray-800">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showExtrusions} 
                onChange={(e) => setShowExtrusions(e.target.checked)}
                className="rounded border-gray-700 bg-gray-850 text-emerald-500 focus:ring-emerald-500"
              />
              Show 3D Extrusions
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input 
                type="checkbox" 
                checked={enableColoring} 
                onChange={(e) => setEnableColoring(e.target.checked)}
                className="rounded border-gray-700 bg-gray-850 text-emerald-500 focus:ring-emerald-500"
              />
              Enable Venue Coloring
            </label>
          </div>

          {/* ── NEON BUBBLE FILTER BAR (prod-matching) ── */}
          <div className="mt-3 w-full min-w-0 overflow-hidden">
            <h3 className="text-xs text-neutral-400 uppercase tracking-widest font-bold mb-3 px-1">Map Filters</h3>
            <div className="relative w-full [mask-image:linear-gradient(to_right,transparent_0%,black_5%,black_95%,transparent_100%)]">
              <div className="flex overflow-x-auto flex-nowrap gap-3 pb-3 px-2 snap-x snap-mandatory scrollbar-hide items-start">

                {/* Bars */}
                <button onClick={() => toggleCategory('Bars')} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${activeCategories.has('Bars') ? 'bg-fuchsia-900/50 border-[3px] border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🪩</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${activeCategories.has('Bars') ? 'text-fuchsia-400' : 'text-neutral-500'}`}>Bars</span>
                </button>

                {/* Eats */}
                <button onClick={() => toggleCategory('Eatery')} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${activeCategories.has('Eatery') ? 'bg-amber-900/50 border-[3px] border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🍔</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${activeCategories.has('Eatery') ? 'text-amber-400' : 'text-neutral-500'}`}>Eats</span>
                </button>

                {/* Stages */}
                <button onClick={() => toggleCategory('Stage')} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${activeCategories.has('Stage') ? 'bg-yellow-900/50 border-[3px] border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🎭</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${activeCategories.has('Stage') ? 'text-yellow-400' : 'text-neutral-500'}`}>Stages</span>
                </button>

                {/* Events */}
                <button onClick={() => setShowEvents(!showEvents)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showEvents ? 'bg-pink-900/50 border-[3px] border-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🎫</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showEvents ? 'text-pink-400' : 'text-neutral-500'}`}>Events</span>
                </button>

                {/* Parking */}
                <button onClick={() => setShowParking(!showParking)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showParking ? 'bg-blue-900/50 border-[3px] border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🅿️</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showParking ? 'text-blue-400' : 'text-neutral-500'}`}>Parking</span>
                </button>

                {/* Transit */}
                <button onClick={() => setShowTransit(!showTransit)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showTransit ? 'bg-emerald-900/50 border-[3px] border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🚌</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showTransit ? 'text-emerald-400' : 'text-neutral-500'}`}>Transit</span>
                </button>

                {/* Road Work */}
                <button onClick={() => setShowConstruction(!showConstruction)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showConstruction ? 'bg-orange-900/50 border-[3px] border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🚧</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showConstruction ? 'text-orange-400' : 'text-neutral-500'}`}>Road Work</span>
                </button>

                {/* HQ */}
                <button onClick={() => setShowHQ(!showHQ)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showHQ ? 'bg-cyan-900/50 border-[3px] border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🏠</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showHQ ? 'text-cyan-400' : 'text-neutral-500'}`}>HQ</span>
                </button>

                {/* SafeWalk */}
                <button onClick={() => setShowSafeWalk(!showSafeWalk)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showSafeWalk ? 'bg-teal-900/50 border-[3px] border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🛡️</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showSafeWalk ? 'text-teal-400' : 'text-neutral-500'}`}>SafeWalk</span>
                </button>

                {/* Blueprint Calibration */}
                <button onClick={() => setShowBlueprint(!showBlueprint)} className="flex flex-col items-center gap-1.5 min-w-[60px] shrink-0 snap-center">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${showBlueprint ? 'bg-indigo-900/50 border-[3px] border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>🗺️</div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${showBlueprint ? 'text-indigo-400' : 'text-neutral-500'}`}>Blueprint</span>
                </button>

              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs bg-gray-800/50 p-2 rounded border border-gray-700">
            <div>
              <span className="text-gray-400">Matched:</span>{' '}
              <span className="font-semibold text-emerald-400">{matchedCount}</span>
              <span className="text-gray-500"> / {totalCount}</span>
            </div>
            <div>
              <span className="text-gray-400">Ratio:</span>{' '}
              <span className="font-semibold text-white">
                {totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Selected Venue info */}
        {selectedVenue && (
          <div className="p-4 bg-emerald-955/20 border-b border-emerald-900/50 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-emerald-400 text-sm">{selectedVenue.name}</h3>
                <p className="text-gray-400 mt-0.5">ID: {selectedVenue.id} | Type: {selectedVenue.type}</p>
                <p className="text-gray-400">Coords: {selectedVenue.lng.toFixed(5)}, {selectedVenue.lat.toFixed(5)}</p>
                <p className="mt-1 font-semibold text-gray-300">
                  Status:{' '}
                  {matchedStatus[selectedVenue.id]?.matched ? (
                    <span className="text-emerald-400">Matched to layer &quot;{matchedStatus[selectedVenue.id]?.layer}&quot;</span>
                  ) : (
                    <span className="text-rose-400">Failed: {matchedStatus[selectedVenue.id]?.reason}</span>
                  )}
                </p>
              </div>
              <button 
                onClick={() => setSelectedVenue(null)}
                className="text-gray-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Venue List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-850">
          {venues.map(venue => {
            const status = matchedStatus[venue.id];
            return (
              <div 
                key={venue.id}
                onClick={() => {
                  setSelectedVenue(venue);
                  if (mapInstance) {
                    mapInstance.easeTo({
                      center: [venue.lng, venue.lat],
                      zoom: 17.5,
                      duration: 800
                    });
                  }
                }}
                className={`p-3 text-xs cursor-pointer transition-colors hover:bg-gray-805 flex items-center justify-between ${selectedVenue?.id === venue.id ? 'bg-gray-800 border-l-2 border-emerald-500' : ''}`}
              >
                <div className="truncate pr-2">
                  <div className="font-medium text-gray-200 truncate">{venue.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">{venue.address || 'No Address'}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] uppercase tracking-wider px-1 bg-gray-800 text-gray-400 rounded border border-gray-700">
                    {venue.type}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${status?.matched ? 'bg-emerald-500 shadow-emerald-500/50 shadow-sm' : 'bg-rose-500'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Area: Map + Logs */}
      <div className="flex-1 flex flex-col relative h-full">
        {/* Map */}
        <div className="flex-1 w-full" ref={mapContainer} />

        {/* Console / Click Log */}
        <div className="h-64 border-t border-gray-800 bg-gray-950 p-4 font-mono text-xs overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-800">
            <span className="font-bold text-gray-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Map Click & Matching Logs
            </span>
            <button 
              onClick={() => setClickLogs([])}
              className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded text-gray-400"
            >
              Clear
            </button>
          </div>
          {clickLogs.length === 0 ? (
            <div className="text-gray-500 italic my-auto text-center">
              Click anywhere on the map or buildings to inspect vector tile details.
            </div>
          ) : (
            <div className="space-y-1">
              {clickLogs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap leading-relaxed text-gray-300">{log}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
