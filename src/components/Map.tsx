'use client';

import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Event } from '@/types';
interface MapProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  events?: Event[];
}

export default function Map({ 
  initialCenter = [-81.250, 42.983],
  initialZoom = 15,
  events = [] 
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (map.current) return; // initialize map only once
    if (!mapContainer.current) return;

    const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    
    if (!mapTilerKey || mapTilerKey === 'your_maptiler_api_key_here') {
      console.warn('MapTiler API key is missing. Falling back to default Carto tiles. Please add NEXT_PUBLIC_MAPTILER_KEY to .env.local');
    }

    const mapStyle = mapTilerKey 
      ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapTilerKey}`
      : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [-81.2497, 42.9836], // Dundas Place, London, ON
      zoom: initialZoom,
      pitch: 45, // 3D perspective
      bearing: -17.6, // Slight rotation to perfectly align with the London street grid
    });

    map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const initializeMarkers = () => {
      events.forEach(event => {
        if (event.lng && event.lat) {
          const el = document.createElement('div');
          // Using explicit styles as a fallback for Tailwind dynamic values in injected elements
          el.style.width = '16px';
          el.style.height = '16px';
          el.style.backgroundColor = 'var(--color-neon-purple)';
          el.style.border = '2px solid var(--color-background)';
          el.style.borderRadius = '50%';
          el.style.boxShadow = '0 0 10px var(--color-neon-purple)';
          el.style.cursor = 'pointer';
          
          new maplibregl.Marker({ element: el })
            .setLngLat([event.lng, event.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(
              `<div style="color: #000; padding: 4px;">
                <h3 style="font-weight: bold; margin: 0;">${event.name}</h3>
                <p style="margin: 0; font-size: 14px;">${event.description || ''}</p>
              </div>`
            ))
            .addTo(map.current!);
        }
      });
    };

    map.current.on('load', initializeMarkers);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden shadow-2xl border border-white/10">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
}
