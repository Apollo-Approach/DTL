'use client';

import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Event } from '@/types';
interface MapProps {
  initialZoom?: number;
  events?: Event[];
}

export default function Map({ 
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
      // Basic Map.tsx does not render event markers directly anymore.
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
