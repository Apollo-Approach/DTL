import { useEffect, useRef, MutableRefObject, RefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { BusState, getBusPolygon, getOccupancyText, getOccupancyColor, getStatusText, getDirectionText } from '../mapHelpers';
import { initBuildingExtrusions, startShimmerAnimation, stopShimmerAnimation, destroyBuildingExtrusions } from '../buildingExtrusions';

interface UseMapInitProps {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  busStateRef: MutableRefObject<Record<string, BusState>>;
  routeAlertsRef: MutableRefObject<Record<string, string[]>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setConstructionProjects: React.Dispatch<React.SetStateAction<any[]>>;
  pinModeRef: MutableRefObject<boolean>;
  setIsPinMode: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPinLocation: React.Dispatch<React.SetStateAction<{lng: number, lat: number} | null>>;
  setPinCategory: React.Dispatch<React.SetStateAction<string>>;
  setPinDescription: React.Dispatch<React.SetStateAction<string>>;
}

export function useMapInit({
  mapContainerRef,
  mapRef,
  busStateRef,
  routeAlertsRef,
  setConstructionProjects,
  pinModeRef,
  setIsPinMode,
  setPendingPinLocation,
  setPinCategory,
  setPinDescription
}: UseMapInitProps) {
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
      mapRef.current.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }), 'top-right');

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
                ['==', ['get', 'isDelayed'], true], '#888888',
                ['==', ['get', 'hasOccupancyData'], false], '#3b82f6',
                ['>=', ['get', 'occupancyPercentage'], 0], [
                  'interpolate',
                  ['linear'],
                  ['get', 'occupancyPercentage'],
                  0, '#22c55e',   // Green
                  50, '#eab308',  // Yellow
                  100, '#dc2626'  // Red
                ],
                '#3b82f6'
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

            // Fetch transit alerts less frequently (merged into polling but lightweight)
            fetch('/api/civic/transit/alerts').then(r => r.json()).then(d => {
              if (d.routeAlerts) routeAlertsRef.current = d.routeAlerts;
            }).catch(() => {});
            
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
                speed: bus.speed, isDelayed: bus.isDelayed, delaySeconds: bus.delaySeconds, delayLabel: bus.delayLabel, currentStatus: bus.currentStatus, 
                stopId: bus.stopId, directionId: bus.directionId, occupancyStatus: bus.occupancyStatus, 
                occupancyPercentage: bus.occupancyPercentage, hasOccupancyData: bus.hasOccupancyData, timestamp: bus.timestamp,
                alertCount: (routeAlertsRef.current[bus.routeId] || []).length,
                alertSummary: (routeAlertsRef.current[bus.routeId] || []).slice(0, 2).join(' | ') || null
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
          
          // ── Smart delay display: prefer TripUpdates exact data, fall back to ping-age ──
          let delayHTML = '';
          if (props.delayLabel && props.delaySeconds !== null && props.delaySeconds !== undefined) {
            const delaySec = Number(props.delaySeconds);
            if (delaySec > 120) {
              // Late (>2 min)
              delayHTML = `<div style="color:#ef4444; font-size:11px; font-weight:bold; margin-top:2px;">⚠️ ${props.delayLabel}</div>`;
            } else if (delaySec < -60) {
              // Early
              delayHTML = `<div style="color:#22c55e; font-size:11px; font-weight:bold; margin-top:2px;">🟢 ${props.delayLabel}</div>`;
            } else {
              // On time
              delayHTML = `<div style="color:#22c55e; font-size:11px; font-weight:bold; margin-top:2px;">✅ On time</div>`;
            }
          } else if (props.isDelayed) {
            // Fallback: old ping-age heuristic
            delayHTML = `<div style="color:#ef4444; font-size:11px; font-weight:bold; margin-top:2px;">⚠️ Stale (Ping ${ageMins}m ago)</div>`;
          }
            
          const occText = getOccupancyText(props.occupancyStatus, props.occupancyPercentage, props.hasOccupancyData);
          const statText = getStatusText(props.currentStatus);
          const stopText = props.stopId ? `Stop #${props.stopId}` : 'Unknown Stop';
          const occColor = getOccupancyColor(props.occupancyStatus, props.hasOccupancyData);
          const pctDisplay = (props.hasOccupancyData && props.occupancyPercentage !== null && props.occupancyPercentage !== undefined)
            ? props.occupancyPercentage : null;
          const pctBarWidth = pctDisplay !== null ? Math.min(pctDisplay, 100) : 0;

          new maplibregl.Popup({ offset: 15 })
            .setLngLat([props.centerLng, props.centerLat])
            .setHTML(`<div style="color:black; padding:4px; font-family:sans-serif; min-width:180px;">
              <strong style="font-size:14px; color:#006c5b;">🚌 ${props.headsign}</strong><br/>
              ${delayHTML}
              <div style="margin-top:6px; font-size:12px; line-height:1.4;">
                <div>📍 <strong>${statText}</strong> ${stopText}</div>
                <div>👥 <strong>Occupancy:</strong> ${occText}${pctDisplay !== null ? ` (${pctDisplay}%)` : ''}</div>
                ${pctDisplay !== null ? `<div style="background:#1e293b; border-radius:4px; height:6px; width:100%; margin-top:3px;">
                  <div style="background:${occColor}; height:100%; width:${pctBarWidth}%; border-radius:4px; transition:width 0.3s;"></div>
                </div>` : ''}
                <div>⏱️ <strong>Speed:</strong> ${(props.speed * 3.6).toFixed(1)} km/h</div>
                ${props.alertCount > 0 ? `<div style="margin-top:5px; padding:4px 6px; background:#78350f22; border:1px solid #92400e44; border-radius:6px; font-size:11px; color:#fbbf24;">
                  ⚠️ <strong>${props.alertCount} alert${props.alertCount > 1 ? 's' : ''}</strong> on this route
                  ${props.alertSummary ? `<div style="color:#d97706; font-size:10px; margin-top:2px; white-space:normal; line-height:1.3;">${props.alertSummary.slice(0, 120)}</div>` : ''}
                </div>` : ''}
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



        // --- NIGHTLY HQ BEACON (430 Richmond St) ---
        const hqEl = document.createElement('div');
        hqEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
            <span style="position:relative;display:flex;height:28px;width:28px;">
              <span style="animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;position:absolute;display:inline-flex;height:100%;width:100%;border-radius:50%;background:rgba(6,182,212,0.5);"></span>
              <span style="position:relative;display:inline-flex;height:28px;width:28px;border-radius:50%;background:rgb(6,182,212);border:2px solid white;box-shadow:0 0 12px rgba(6,182,212,0.6);align-items:center;justify-content:center;font-size:13px;">🏠</span>
            </span>
            <span style="margin-top:3px;font-size:9px;font-weight:800;color:#06b6d4;text-transform:uppercase;letter-spacing:0.1em;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;">Nightly HQ</span>
          </div>
        `;
        hqEl.className = 'z-50';
        new maplibregl.Marker({ element: hqEl })
          .setLngLat([-81.2498, 42.9844])
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: true }).setHTML(
              `<div style="color:#000;font-family:sans-serif;padding:8px;min-width:200px;">
                <h3 style="margin:0 0 6px;font-weight:900;font-size:15px;color:#0891b2;">🏠 DTL Nightly HQ</h3>
                <p style="margin:0 0 4px;font-size:12px;color:#444;">430 Richmond St, London ON</p>
                <p style="margin:0 0 8px;font-size:11px;color:#666;">Street Liaison base of operations.<br/>Open nightly during activation hours.</p>
                <p style="margin:0;font-size:10px;color:#888;font-style:italic;">Always visible on the map.</p>
              </div>`
            )
          )
          .addTo(map);

        // --- CONSTRUCTION ADVISORY DATA FETCH ---
        const fetchConstruction = async () => {
          try {
            const res = await fetch('/api/civic/construction');
            if (res.ok) {
              const data = await res.json();
              setConstructionProjects(data.projects || []);
            }
          } catch (err) {
            console.error('Construction fetch error:', err);
          }
        };
        fetchConstruction();
        // Refresh construction data every 5 minutes
        const constructionInterval = setInterval(fetchConstruction, 300000);

        // --- 3D BUILDING EXTRUSIONS (The Nuclear Option) ---
        // Initialize the OSM-sourced 3D fill-extrusion layer
        initBuildingExtrusions(map, firstSymbolId);
        // Start the shimmer animation loop for specials-active buildings
        startShimmerAnimation(map);

        // Cleanup
        map.on('remove', () => {
          clearInterval(civicInterval);
          clearInterval(constructionInterval);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          stopShimmerAnimation();
          destroyBuildingExtrusions(map);
        });

        // --- MOD PIN (CRISIS ALERT) CLICK HANDLER ---
        map.on('click', (e) => {
          // Skip if the click originated from a MapLibre marker (event, venue, etc.)
          const target = (e.originalEvent?.target as HTMLElement);
          if (target?.closest('.maplibregl-marker')) return;

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
      // Clean up global SafeWalk function to prevent stale closure calls
      delete (window as unknown as Record<string, unknown>).requestSafeWalk;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
