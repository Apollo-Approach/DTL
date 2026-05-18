// src/components/InteractiveMap.tsx
'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { calculateMatchScore } from '@/lib/matchScore';
import { Session } from '@supabase/supabase-js';
import { Venue, Event, SafetyIncident, Preferences } from '@/types';
import { BusState, getBusPolygon, getOccupancyText, getStatusText, getDirectionText, escapeHtml } from './map/mapHelpers';
import MapFilterBar from './map/MapFilterBar';
import ModPinModal from './map/ModPinModal';
import SafeWalkModal from './map/SafeWalkModal';
import SafeWalkOverlay from './map/SafeWalkOverlay';



interface InteractiveMapProps {
  venues: Venue[]; 
  incidents: SafetyIncident[];
  events?: Event[];
  preferences?: Preferences | null;
  mode?: 'public' | 'crisis';
}

export default function InteractiveMap({ venues = [], incidents = [], events = [], preferences = null, mode = 'public' }: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  
  // SafeWalk State
  const [showSafeWalkModal, setShowSafeWalkModal] = useState(false);
  const [safeWalkExpiresAt, setSafeWalkExpiresAt] = useState<number | null>(null);
  
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const busStateRef = useRef<{ [id: string]: BusState }>({});
  
  // Auth & UI State
  const [session, setSession] = useState<Session | null>(null);
  
  // Map Decluttering Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [forYou, setForYou] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | 'all'>('24h');
  const [layerToggles, setLayerToggles] = useState({
    transit: true,
    incidents: true,
    retail: false,
    parking: false
  });

  const [isPinMode, setIsPinMode] = useState(false);
  const pinModeRef = useRef(false);

  // Mod Pin Submission State
  const [pendingPinLocation, setPendingPinLocation] = useState<{lng: number, lat: number} | null>(null);
  const [pinCategory, setPinCategory] = useState<string>('');
  const [pinDescription, setPinDescription] = useState<string>('');

  const togglePinMode = () => {
    const newState = !pinModeRef.current;
    pinModeRef.current = newState;
    setIsPinMode(newState);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = newState ? 'crosshair' : '';
    }
  };

  // 0. Initialize Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously();
      } else {
        setSession(session);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const animationFrameRef = useRef<number | undefined>(undefined);

  // 1. Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Expose global function for popup buttons to call securely outside of React's state loop
    (window as unknown as { requestSafeWalk: (lng: number, lat: number) => Promise<void> }).requestSafeWalk = async (lng: number, lat: number) => {
      try {
        const res = await fetch(`/api/routing/safe-path?endLng=${lng}&endLat=${lat}`);
        const data = await res.json();
        if (mapRef.current && data.route) {
          const source = mapRef.current.getSource('safe-route-source') as maplibregl.GeoJSONSource | undefined;
          if (source) source.setData(data.route);
          
          // Fly camera to gracefully show the whole route
          mapRef.current.flyTo({ center: [-81.2497, 42.9836], zoom: 15.2, pitch: 60, essential: true });
        }
      } catch (err) { console.error("Routing error:", err); }
    };

    if (!mapRef.current) {
      const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      const mapStyle = mapTilerKey 
        ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapTilerKey}`
        : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [-81.2497, 42.9836], // Dundas Place, London
        zoom: 15,
        pitch: 45,
        bearing: -17.6,
      });
      mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

      mapRef.current.on('load', () => {
        const map = mapRef.current;
        if (!map) return;

        // --- DYNAMIC LAYER STACKING ---
        // Find the first symbol/text layer so we can render polygons UNDERNEATH the street names
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

        // --- PARKING LAYER (3D EXTRUSION + ICONOGRAPHY) ---
        if (!map.getSource('parking-source')) {
          map.addSource('parking-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
        
        // Remove old flat layers if they exist from React fast-refresh
        if (map.getLayer('parking-fill')) map.removeLayer('parking-fill');
        if (map.getLayer('parking-outline')) map.removeLayer('parking-outline');

        if (!map.getLayer('parking-extrusion')) {
          map.addLayer({
            id: 'parking-extrusion',
            type: 'fill-extrusion',
            source: 'parking-source',
            layout: { visibility: 'none' },
            paint: {
              'fill-extrusion-color': '#06b6d4',
              'fill-extrusion-height': 1,
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.85
            }
          }, firstSymbolId); 
        }

        // Parking lot outline glow — bright ring around each lot
        if (!map.getLayer('parking-outline-glow')) {
          map.addLayer({
            id: 'parking-outline-glow',
            type: 'line',
            source: 'parking-source',
            layout: { visibility: 'none' },
            paint: {
              'line-color': '#06b6d4',
              'line-width': 2,
              'line-opacity': 0.6,
              'line-blur': 3
            }
          }, firstSymbolId);
        }

        // Floating 🅿️ icon at lot centroids — MapLibre renders symbols at polygon centroids automatically
        if (!map.getLayer('parking-icons')) {
          map.addLayer({
            id: 'parking-icons',
            type: 'symbol',
            source: 'parking-source',
            layout: {
              visibility: 'none',
              'text-field': '🅿️',
              'text-size': 16,
              'text-allow-overlap': false,
              'text-pitch-alignment': 'viewport',
              'text-rotation-alignment': 'viewport'
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1.5
            }
          });
        }
        
        // --- ON-STREET PARKING LAYER ---
        if (!map.getSource('on-street-parking-source')) {
          map.addSource('on-street-parking-source', { type: 'geojson', data: '/civic_data/on_street_parking.geojson' });
        }
        
        if (!map.getLayer('on-street-parking-layer')) {
          map.addLayer({
            id: 'on-street-parking-layer',
            type: 'line',
            source: 'on-street-parking-source',
            layout: {
              visibility: 'none',
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 4,
              'line-dasharray': [2, 2],
              'line-opacity': 0.8
            }
          }, firstSymbolId);
        }

        // --- BIA & RETAIL LAYERS ---
        if (!map.getSource('bia-boundaries-source')) {
          map.addSource('bia-boundaries-source', { type: 'geojson', data: '/civic_data/bia_boundaries.geojson' });
          map.addLayer({
            id: 'bia-boundaries-layer',
            type: 'fill',
            source: 'bia-boundaries-source',
            paint: {
              'fill-color': '#a855f7', // Faint purple glow
              'fill-opacity': 0.05,
              'fill-outline-color': '#a855f7'
            }
          }, firstSymbolId);
        }

        if (!map.getSource('bia-retail-source')) {
          map.addSource('bia-retail-source', { type: 'geojson', data: '/civic_data/bia_retail_buildings.geojson' });
          map.addLayer({
            id: 'bia-retail-extrusion',
            type: 'fill-extrusion',
            source: 'bia-retail-source',
            paint: {
              'fill-extrusion-color': [
                'match',
                ['get', 'category'],
                'Nightlife', '#d946ef',
                'Eatery', '#f97316',
                'Stage', '#eab308',
                'Retail', '#64748b',
                '#64748b' // default fallback
              ],
              'fill-extrusion-height': 12,       // Extrude 12 meters
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0
            }
          }, firstSymbolId);
        }

        // --- 2. TRANSIT LAYERS (TRUE 3D MATH) ---
        // Separate sources to completely eliminate filter matching bugs
        if (!map.getSource('transit-body-source')) {
          map.addSource('transit-body-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
        if (!map.getSource('transit-label-source')) {
          map.addSource('transit-label-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }

        if (map.getLayer('transit-layer')) map.removeLayer('transit-layer');
        if (map.getLayer('bus-roof-logo')) map.removeLayer('bus-roof-logo');
        if (map.getLayer('bus-body-extrusion')) map.removeLayer('bus-body-extrusion');
        if (map.getLayer('bus-roof-label')) map.removeLayer('bus-roof-label');
        if (map.getLayer('bus-3d-icon')) map.removeLayer('bus-3d-icon');

        // Layer: Congestion Underglow (Traffic Heatmap equivalent)
        if (!map.getLayer('bus-congestion-glow')) {
          map.addLayer({
            id: 'bus-congestion-glow',
            type: 'circle',
            source: 'transit-label-source',
            filter: ['all', ['==', ['get', 'isDelayed'], false], ['<', ['get', 'speed'], 1.38]], // Speed < 5 km/h
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 30],
              'circle-color': '#ef4444',
              'circle-blur': 1,
              'circle-opacity': 0.6
            }
          }, firstSymbolId);
        }

        // Layer A: The 3D Volumetric Bus Body
        if (!map.getLayer('bus-body-extrusion')) {
          map.addLayer({
            id: 'bus-body-extrusion',
            type: 'fill-extrusion',
            source: 'transit-body-source',
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'isDelayed'], true], '#888888', // Grey if delayed/stale
                '#00b296' // Default teal
              ], 
              'fill-extrusion-height': 5.4,      // Height increased by 20% (from 4.5 to 5.4)
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.95
            }
          }, firstSymbolId);
        }

        // Layer B: The Floating Route Number 
        if (!map.getLayer('bus-roof-label')) {
          map.addLayer({
            id: 'bus-roof-label',
            type: 'symbol',
            source: 'transit-label-source',
            layout: {
              'text-field': ['get', 'routeLabel'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 13,
              'text-pitch-alignment': 'viewport', 
              'text-rotation-alignment': 'viewport'
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 2
            }
          });
        }
        
        // Re-bind hover states for the 3D extrusion
        map.on('mouseenter', 'bus-body-extrusion', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'bus-body-extrusion', () => map.getCanvas().style.cursor = '');

        // --- SAFE NIGHTTIME ROUTING LAYER (Neon Glow) ---
        if (!map.getSource('safe-route-source')) {
          map.addSource('safe-route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }

        // Layer 1: The Neon Blur (Underglow)
        if (!map.getLayer('safe-route-glow')) {
          map.addLayer({
            id: 'safe-route-glow',
            type: 'line',
            source: 'safe-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#06b6d4', 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.6 }
          }, firstSymbolId); // Render under street text
        }

        // Layer 2: The Bright Core Line
        if (!map.getLayer('safe-route-core')) {
          map.addLayer({
            id: 'safe-route-core',
            type: 'line',
            source: 'safe-route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [0, 2] }
          }, firstSymbolId);
        }

        // --- 1. STATIC ROUTE SHAPES ---
        if (!map.getSource('ltc-shapes-source')) {
          map.addSource('ltc-shapes-source', { type: 'geojson', data: '/civic_data/ltc_shapes.geojson' });
          map.addLayer({
            id: 'ltc-shapes-layer',
            type: 'line',
            source: 'ltc-shapes-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 
              'line-color': ['coalesce', ['get', 'color'], '#006c5b'], 
              'line-width': 4, 
              'line-opacity': 0.45 // Boosted from 0.15 so the spatial network pops!
            } 
          }, firstSymbolId);
        }

        // --- 2. THE LERP ANIMATION ENGINE ---
        if (!map.getSource('transit-source')) {
          map.addSource('transit-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }

        const fetchLiveTransit = async () => {
          try {
            const [transitRes, parkingRes] = await Promise.all([ fetch('/api/civic/transit'), fetch('/api/civic/parking') ]);
            
            if (transitRes.ok) {
              const data = await transitRes.json();
              const activeIds = new Set(data.buses.map((b: BusState) => b.id));
              
              // Update targets for interpolation
              const now = Date.now();
              data.buses.forEach((bus: BusState) => {
                const existing = busStateRef.current[bus.id];
                busStateRef.current[bus.id] = {
                  ...bus,
                  startLng: existing ? existing.currentLng : bus.targetLng,
                  startLat: existing ? existing.currentLat : bus.targetLat,
                  currentLng: existing ? existing.currentLng : bus.targetLng,
                  currentLat: existing ? existing.currentLat : bus.targetLat,
                  startTime: now
                };
              });
              
              // Cleanup stale buses that went offline
              for (const id in busStateRef.current) {
                if (!activeIds.has(id)) delete busStateRef.current[id];
              }
            }

            if (parkingRes.ok) {
              const parkingData = await parkingRes.json();
              (map.getSource('parking-source') as maplibregl.GeoJSONSource)?.setData(parkingData);
            }
          } catch (err) {
            console.error("Civic Polling Error:", err);
          }
        };

        const renderFrame = () => {
          if (!mapRef.current) return;
          const bodyFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
          const labelFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
          const now = Date.now();

          Object.values(busStateRef.current).forEach((bus) => {
            const progress = Math.min((now - bus.startTime) / 15000, 1);
            
            bus.currentLng = bus.startLng + (bus.targetLng - bus.startLng) * progress;
            bus.currentLat = bus.startLat + (bus.targetLat - bus.startLat) * progress;

            const dirText = bus.directionId === 0 ? 'Out' : bus.directionId === 1 ? 'In' : '';
            // If the headsign exists but doesn't contain the route number, prepend it
            const headsign = bus.headsign || '';
            const hasRouteNum = headsign.startsWith(bus.routeId) || headsign.match(/^\d+[A-Z]?\s/);
            const routeLabel = headsign 
              ? (hasRouteNum ? headsign : `${bus.routeId} ${headsign}`)
              : (dirText ? `${bus.routeId} ${dirText}` : bus.routeId);

            const fullHeadsign = bus.headsign || `LTC Route ${bus.routeId} (${dirText})`;

            // Generate 3D geometry on the fly based on the new micro-position
            bodyFeatures.push({
              type: 'Feature', geometry: { type: 'Polygon', coordinates: getBusPolygon(bus.currentLng, bus.currentLat, bus.bearing) },
              properties: { 
                id: bus.id, routeId: bus.routeId, routeLabel: routeLabel, headsign: fullHeadsign, centerLng: bus.currentLng, centerLat: bus.currentLat, 
                speed: bus.speed, isDelayed: bus.isDelayed, currentStatus: bus.currentStatus, 
                stopId: bus.stopId, directionId: bus.directionId, occupancyStatus: bus.occupancyStatus, 
                occupancyPercentage: bus.occupancyPercentage, timestamp: bus.timestamp 
              }
            });
            labelFeatures.push({
              type: 'Feature', geometry: { type: 'Point', coordinates: [bus.currentLng, bus.currentLat] },
              properties: { 
                id: bus.id, routeId: bus.routeId, routeLabel: routeLabel, bearing: bus.bearing, speed: bus.speed, isDelayed: bus.isDelayed 
              }
            });
          });

          const bodySource = mapRef.current.getSource('transit-body-source') as maplibregl.GeoJSONSource | undefined;
          if (bodySource) bodySource.setData({ type: 'FeatureCollection', features: bodyFeatures });
          
          const labelSource = mapRef.current.getSource('transit-label-source') as maplibregl.GeoJSONSource | undefined;
          if (labelSource) labelSource.setData({ type: 'FeatureCollection', features: labelFeatures });

          animationFrameRef.current = requestAnimationFrame(renderFrame);
        };

        // Start engines
        fetchLiveTransit();
        const civicInterval = setInterval(fetchLiveTransit, 15000); // 15 seconds
        animationFrameRef.current = requestAnimationFrame(renderFrame);

        // --- 3. CLICK INTERACTIONS UPDATED IDs ---
        map.on('click', 'parking-extrusion', (e) => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties;
          const lat = e.lngLat.lat;
          const lng = e.lngLat.lng;
          
          let honkHTML = '';
          if (props.honkZoneId) {
            honkHTML = `
              <div style="margin-top: 8px; padding: 6px; background: #fef3c7; border: 1px dashed #f59e0b; border-radius: 4px; text-align: center;">
                <span style="font-size:10px; color:#d97706; font-weight:bold;">🎁 Promo: Use code CORE for 2 hours free!</span>
              </div>
              <a href="https://www.honkmobile.com/hourly/zones/${props.honkZoneId}" target="_blank" rel="noopener noreferrer" style="margin-top: 4px; display:block; background:#000; color:#fff; padding:6px 8px; border-radius:4px; text-decoration:none; font-size:12px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">
                🅿️ Pay with HonkMobile (Zone ${props.honkZoneId})
              </a>
            `;
          }

          const spotsHTML = props.estimatedSpots 
            ? `<span style="color: #666; font-size: 11px;">~${props.estimatedSpots} estimated spots</span>`
            : '';

          new maplibregl.Popup({ offset: 0 })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="color:black; padding:4px; font-family:sans-serif; min-width: 160px;">
              <strong style="font-size:14px; color:#06b6d4;">🅿️ ${props.name || 'Public Parking'}</strong><br/>
              ${spotsHTML}
              ${honkHTML}
              <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener noreferrer" style="background:#2563eb; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:11px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                  👁️ View on Street View
                </a>
                <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener noreferrer" style="background:#eab308; color:black; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:11px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                  🗺️ Verify on Map
                </a>
              </div>
            </div>`)
            .addTo(map);
        });

        // Update transit click handler to target the extrusion
        map.on('click', 'bus-body-extrusion', (e) => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties;
          
          // MapLibre Data-Driven Styling: Highlight the clicked route ID, dim others
          map.setPaintProperty('ltc-shapes-layer', 'line-opacity', 
            ['case', ['==', ['get', 'routeId'], props.routeId], 0.8, 0.05]
          );

          const ageMins = Math.floor((Date.now() / 1000 - props.timestamp) / 60);
          const delayHTML = props.isDelayed 
            ? `<div style="color:#ef4444; font-size:11px; font-weight:bold; margin-top:2px;">⚠️ Delayed (Ping ${ageMins}m ago)</div>`
            : '';
            
          const occText = getOccupancyText(props.occupancyStatus);
          const statText = getStatusText(props.currentStatus);
          const dirText = getDirectionText(props.directionId);
          const stopText = props.stopId ? `Stop #${props.stopId}` : 'Unknown Stop';

          new maplibregl.Popup({ offset: 15 })
            .setLngLat([props.centerLng, props.centerLat])
            .setHTML(`<div style="color:black; padding:4px; font-family:sans-serif; min-width:180px;">
              <strong style="font-size:14px; color:#006c5b;">🚌 ${props.headsign}</strong><br/>
              ${delayHTML}
              <div style="margin-top:6px; font-size:12px; line-height:1.4;">
                <div>📍 <strong>${statText}</strong> ${stopText}</div>
                <div>👥 <strong>Occupancy:</strong> ${occText} ${props.occupancyPercentage !== undefined ? `(${props.occupancyPercentage}%)` : ''}</div>
                <div>⏱️ <strong>Speed:</strong> ${(props.speed * 3.6).toFixed(1)} km/h</div>
              </div>
            </div>`)
            .addTo(map);
        });

        // Reset route lines to default visibility on empty click
        map.on('click', (e) => {
          if (!mapRef.current?.queryRenderedFeatures(e.point, { layers: ['bus-body-extrusion'] }).length) {
              mapRef.current?.setPaintProperty('ltc-shapes-layer', 'line-opacity', 0.15);
          }
        });

        map.on('mouseenter', 'parking-extrusion', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'parking-extrusion', () => map.getCanvas().style.cursor = '');

        // --- ON-STREET PARKING CLICK INTERACTIONS ---
        map.on('click', 'on-street-parking-layer', (e) => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties;
          const lat = e.lngLat.lat;
          const lng = e.lngLat.lng;
          
          let honkHTML = '';
          const zoneId = props.HonkZoneID || props.honkZoneId; // fallback for different casing
          if (zoneId) {
            honkHTML = `
              <div style="margin-top: 8px; padding: 6px; background: #fef3c7; border: 1px dashed #f59e0b; border-radius: 4px; text-align: center;">
                <span style="font-size:10px; color:#d97706; font-weight:bold;">🎁 Promo: Use code CORE for 2 hours free!</span>
              </div>
              <a href="https://www.honkmobile.com/hourly/zones/${zoneId}" target="_blank" rel="noopener noreferrer" style="margin-top: 4px; display:block; background:#000; color:#fff; padding:6px 8px; border-radius:4px; text-decoration:none; font-size:12px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">
                🅿️ Pay with HonkMobile (Zone ${zoneId})
              </a>
            `;
          }

          new maplibregl.Popup({ offset: 0 })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="color:black; padding:4px; font-family:sans-serif; min-width: 160px;">
              <strong style="font-size:14px; color:#3b82f6;">${props.Location || 'On-Street Parking'}</strong><br/>
              <span style="color: #666; font-size: 11px;">
                ${props.Name || 'Metered Parking'}
              </span>
              ${honkHTML}
              <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener noreferrer" style="background:#2563eb; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:11px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                  👁️ View on Street View
                </a>
              </div>
            </div>`)
            .addTo(map);
        });

        map.on('mouseenter', 'on-street-parking-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'on-street-parking-layer', () => map.getCanvas().style.cursor = '');

        // --- BIA RETAIL CLICK INTERACTIONS ---
        map.on('click', 'bia-retail-extrusion', (e) => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties;
          const lat = e.lngLat.lat;
          const lng = e.lngLat.lng;
          
          let catColor = '#64748b';
          let catIcon = '🛍️';
          if (props.category === 'Nightlife') { catColor = '#d946ef'; catIcon = '🍸'; }
          else if (props.category === 'Eatery') { catColor = '#f97316'; catIcon = '🍽️'; }
          else if (props.category === 'Stage') { catColor = '#eab308'; catIcon = '🎭'; }

          new maplibregl.Popup({ offset: 0 })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="color:black; padding:4px; font-family:sans-serif; min-width: 140px;">
              <strong style="font-size:14px; color:${catColor};">${catIcon} ${props.name || 'Retail Business'}</strong><br/>
              <span style="color: #666; font-size: 11px;">
                ${props.category} &bull; <span style="font-style: italic;">${props.descriptor || 'Commercial'}</span>
              </span>
              <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' London Ontario')}" target="_blank" rel="noopener noreferrer" style="background:${catColor}; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:11px; text-align:center; font-weight:bold; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                  Find on Google
                </a>
              </div>
            </div>`)
            .addTo(map);
        });

        map.on('mouseenter', 'bia-retail-extrusion', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'bia-retail-extrusion', () => map.getCanvas().style.cursor = '');
        // Cleanup
        map.on('remove', () => {
          clearInterval(civicInterval);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        });

        // --- MOD PIN (CRISIS ALERT) CLICK HANDLER ---
        map.on('click', (e) => {
          if (pinModeRef.current) {
            // Intercept click: Open the Pre-Drop Education Modal instead of dropping instantly
            setPendingPinLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat });
            setPinCategory('');
            setPinDescription('');
            
            // Turn off pin mode on the map
            pinModeRef.current = false;
            setIsPinMode(false);
            map.getCanvas().style.cursor = '';
            return;
          }
        });

      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Render Markers (Runs whenever props.venues or props.incidents change)
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers to prevent duplicates on state updates
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter Venues by Search, Category, Late Night, and For You
    const filteredVenues = venues.filter(venue => {
      if (searchQuery && !venue.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      // Category filter — map filter bubble values to venue.type
      if (activeFilter) {
        switch (activeFilter) {
          case 'Nightlife':
            if (venue.type !== 'club' && venue.type !== 'bar') return false;
            break;
          case 'Eatery':
            if (venue.type !== 'restaurant') return false;
            break;
          case 'Stage':
            if (venue.type !== 'venue') return false;
            break;
          case 'LateNight':
            if (!venue.late_night_eligible) return false;
            break;
        }
      }

      if (forYou && preferences) {
        const score = calculateMatchScore(venue.offerings, preferences);
        if (score < 20) return false;
      }
      return true;
    });

    // Draw Venues (Purple for permanent, Cyan for Pop-up)
    filteredVenues.forEach((venue) => {
      if (!mapRef.current) return;
      const el = document.createElement('div');
      const isPopUp = venue.status === 'POP_UP';
      // Modern Map Pin Iconography for Venues
      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="${isPopUp ? '#06b6d4' : '#b026ff'}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-lg group-hover:scale-110 transition-transform origin-bottom">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3" fill="white"/>
        </svg>
        ${isPopUp ? '<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span></span>' : ''}
      `;

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([venue.lng, venue.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 4px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 14px;">${venue.name}</h3>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #444;">${venue.address}</p>
              ${venue.operating_hours ? `<p style="margin: 4px 0 0 0; font-size: 10px; color: #666;">🕒 ${typeof venue.operating_hours === 'object' ? Object.entries(venue.operating_hours).map(([day, hrs]) => `${day}: ${hrs}`).join(' · ') : venue.operating_hours}</p>` : ''}
              ${venue.website_url ? `<a href="${venue.website_url}" target="_blank" style="display:block; margin: 4px 0 0 0; font-size: 10px; color: #06b6d4;">🔗 Website</a>` : ''}
              ${isPopUp ? '<span style="display:inline-block; margin-top:4px; padding:2px 6px; background:#06b6d4; color:#fff; font-size:10px; border-radius:4px; font-weight:bold;">POP-UP</span>' : ''}
              <button 
                onclick="window.requestSafeWalk(${venue.lng}, ${venue.lat})" 
                style="margin-top: 12px; width: 100%; padding: 6px; background: linear-gradient(to right, #b026ff, #06b6d4); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2);"
              >
                🛡️ Request SafeWalk
              </button>
            </div>`
          )
        )
        .addTo(mapRef.current);
      
      markersRef.current.push(marker);
    });

    // Draw Events (🎫)
    const filteredEvents = events.filter(evt => {
      if (searchQuery && !evt.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFilter && !evt.start_time.startsWith(dateFilter)) return false;
      return true;
    });

    filteredEvents.forEach((evt) => {
      if (!mapRef.current) return;
      const el = document.createElement('div');
      
      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <div class="w-8 h-8 bg-pink-600 rounded-lg border-2 border-white shadow-lg flex items-center justify-center text-lg drop-shadow-lg group-hover:scale-110 transition-transform origin-bottom">
          🎫
        </div>
      `;

      const ticketCTA = evt.ticket_url 
        ? `<a href="${evt.ticket_url}" target="_blank" style="display:block; margin-top: 12px; width: 100%; text-align: center; padding: 6px; background: #db2777; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; text-decoration: none; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">🎟️ BUY TICKETS</a>`
        : `<div style="margin-top: 12px; width: 100%; text-align: center; padding: 6px; background: #10b981; color: white; border-radius: 6px; font-size: 12px; font-weight: bold;">FREE EVENT</div>`;

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([evt.lng, evt.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 4px; min-width: 160px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 14px;">${evt.name}</h3>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #444;">${new Date(evt.start_time).toLocaleDateString()} @ ${new Date(evt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              ${ticketCTA}
            </div>`
          )
        )
        .addTo(mapRef.current);
      
      markersRef.current.push(marker);
    });

    // Draw Active Safety Incidents (Pulsing Amber)
    const filteredIncidents = incidents.filter(incident => {
      if (!layerToggles.incidents) return false;
      if (timeFilter !== 'all') {
        const incidentTime = new Date(incident.reported_at).getTime();
        const hoursDiff = (Date.now() - incidentTime) / (1000 * 60 * 60);
        if (timeFilter === '24h' && hoursDiff > 24) return false;
        if (timeFilter === '7d' && hoursDiff > 168) return false;
      }
      return true;
    });

    filteredIncidents.forEach((incident) => {
      if (!mapRef.current) return;
      let marker: maplibregl.Marker;

      if (incident.type === 'SAFEWALK_SOS') {
        // Special rendering for high-priority SOS
        const sosEl = document.createElement('div');
        sosEl.className = 'cursor-pointer z-50';
        sosEl.innerHTML = `
          <span class="relative flex h-8 w-8">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-8 w-8 bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-sm">🚨</span>
          </span>
        `;
        marker = new maplibregl.Marker({ element: sosEl }).setLngLat([incident.lng, incident.lat]);
      } else {
        const defaultEl = document.createElement('div');
        // Tailwind pulsing ping animation for active safety alerts
        defaultEl.innerHTML = `
          <span class="relative flex h-5 w-5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-5 w-5 bg-amber-500 border-2 border-white shadow-lg"></span>
          </span>
        `;
        defaultEl.className = 'cursor-pointer';
        marker = new maplibregl.Marker({ element: defaultEl }).setLngLat([incident.lng, incident.lat]);
      }

      marker.setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 4px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 14px; color: #d97706;">⚠️ Safety Alert</h3>
              <p style="margin: 2px 0 4px 0; font-size: 12px; font-weight: bold; color: #444;">${escapeHtml(incident.type.replace('_', ' '))}</p>
              <p style="margin: 0; font-size: 11px; color: #666;">${escapeHtml(incident.description) || 'Mediator requested.'}</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #888;">Reported: ${new Date(incident.reported_at).toLocaleTimeString()}</p>
            </div>`
          )
        )
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    });

  }, [venues, incidents, events, searchQuery, dateFilter, layerToggles.incidents, timeFilter, activeFilter, forYou, preferences]);

  // Handle Map Decluttering — retail 3D buildings
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getLayer('bia-retail-extrusion')) return;
    const map = mapRef.current;
    
    if (activeFilter && activeFilter !== 'LateNight') {
      // Category filter active — filter GeoJSON features by category property
      map.setFilter('bia-retail-extrusion', ['==', ['get', 'category'], activeFilter]);
      map.setPaintProperty('bia-retail-extrusion', 'fill-extrusion-opacity', 0.85);
    } else if (layerToggles.retail) {
      // Retail toggled on (or LateNight active) — show all buildings
      map.setFilter('bia-retail-extrusion', null);
      map.setPaintProperty('bia-retail-extrusion', 'fill-extrusion-opacity', 0.85);
    } else {
      // Everything off — hide retail buildings
      map.setFilter('bia-retail-extrusion', null);
      map.setPaintProperty('bia-retail-extrusion', 'fill-extrusion-opacity', 0);
    }
  }, [activeFilter, layerToggles.retail]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    // Toggle Transit
    if (map.getLayer('bus-body-extrusion')) {
      map.setLayoutProperty('bus-body-extrusion', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('bus-roof-label', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('bus-congestion-glow', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('ltc-shapes-layer', 'visibility', layerToggles.transit ? 'visible' : 'none');
    }

    // Toggle Parking
    if (map.getLayer('on-street-parking-layer')) {
      map.setLayoutProperty('on-street-parking-layer', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-extrusion', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-outline-glow', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-icons', 'visibility', layerToggles.parking ? 'visible' : 'none');
    }
  }, [layerToggles]);

  // 3. Supabase Realtime Subscription
  useEffect(() => {
    const channel = supabase.channel('realtime-safety')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incidents' },
        (payload) => {
          console.log('Realtime Safety Incident Update:', payload);
          // Seamlessly trigger a Server Component background refetch!
          // This queries the new PostGIS lat/lng from our View and pushes it to our props.
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <MapFilterBar
        layerToggles={layerToggles}
        setLayerToggles={setLayerToggles}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        forYou={forYou}
        setForYou={setForYou}
        preferences={preferences}
        mode={mode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
      />

      {/* THE 3D MAP */}
      <div className="relative w-full h-[85svh] min-h-[500px] lg:h-[800px] rounded-xl overflow-hidden border border-neutral-700 shadow-2xl z-0">
        <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />
        
        {/* MOD PIN MODAL */}
        {pendingPinLocation && (
          <ModPinModal
            pendingPinLocation={pendingPinLocation}
            setPendingPinLocation={setPendingPinLocation}
            pinCategory={pinCategory}
            setPinCategory={setPinCategory}
            pinDescription={pinDescription}
            setPinDescription={setPinDescription}
            mapRef={mapRef}
            supabase={supabase}
          />
        )}

        {/* SafeWalk Floating Button */}
        {!safeWalkExpiresAt && !showSafeWalkModal && (
          <button 
            onClick={() => setShowSafeWalkModal(true)}
            className="absolute bottom-10 right-4 z-40 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-900/50 flex flex-col items-center justify-center transition-transform active:scale-95 border-2 border-emerald-400"
            title="SafeWalk Timer"
          >
            <span className="text-xl">🛡️</span>
            <span className="text-[9px] font-bold uppercase tracking-tighter mt-0.5">SafeWalk</span>
          </button>
        )}

        {/* SafeWalk Modal */}
        {showSafeWalkModal && (
          <SafeWalkModal 
            onCancel={() => setShowSafeWalkModal(false)}
            onStart={(mins) => {
              // Ask for location permission eagerly
              if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(() => {
                  setSafeWalkExpiresAt(Date.now() + mins * 60000);
                  setShowSafeWalkModal(false);
                }, (err) => {
                  alert('SafeWalk requires Location Access to dispatch help to your location. Please enable it.');
                });
              } else {
                alert('Geolocation is not supported by your browser.');
              }
            }}
          />
        )}

        {/* SafeWalk Active Overlay */}
        {safeWalkExpiresAt && (
          <SafeWalkOverlay 
            expiresAt={safeWalkExpiresAt}
            onSafe={() => setSafeWalkExpiresAt(null)}
            onExtend={(mins) => setSafeWalkExpiresAt(prev => (prev ? prev + mins * 60000 : null))}
          />
        )}
      </div>

      {/* SAFETY MODERATION INTERFACE (Report Incident CTA) */}
      <div className="w-full">
        <button 
          onClick={togglePinMode}
          className={`w-full py-4 rounded-xl font-black text-lg shadow-xl transition-all border-2 ${isPinMode ? 'bg-red-900/80 text-red-100 border-red-500 animate-pulse shadow-red-500/20' : 'bg-neutral-900 text-neutral-200 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500'}`}
        >
          {isPinMode ? '🎯 TAP MAP TO DROP PIN' : '⚠️ REPORT STREET INCIDENT'}
        </button>
      </div>

    </div>
  );
}
