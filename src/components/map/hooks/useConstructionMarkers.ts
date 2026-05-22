import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

interface ConstructionProject {
  id: string;
  title: string;
  description: string;
  location: string;
  source: string;
  impacts: string[];
}

export function useConstructionMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  constructionProjects: ConstructionProject[],
  layerToggles: { construction: boolean }
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (layerToggles.construction && constructionProjects.length > 0) {
      constructionProjects.forEach((project) => {
        const el = document.createElement('div');
        el.className = 'cursor-pointer z-30';
        el.innerHTML = `
          <span class="relative flex h-8 w-8">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-50" style="animation-duration: 2.5s;"></span>
            <span class="relative inline-flex rounded-full h-8 w-8 bg-orange-600 border-2 border-orange-300 shadow-lg items-center justify-center text-sm">🚧</span>
          </span>
        `;

        const locationCoords: Record<string, [number, number]> = {
          'renew-ontario-st': [-81.2435, 42.9870],
          'renew-queens-bridge': [-81.2540, 42.9830],
          'renew-brt-east': [-81.2380, 42.9830],
          'renew-wellington-gateway': [-81.2483, 42.9700],
          'renew-york-wellington': [-81.2483, 42.9840],
        };

        const coords = locationCoords[project.id] || [-81.2497, 42.9836];

        const impactBadges = project.impacts.map((impact: string) => {
          let color = '#f59e0b';
          let icon = '⚠️';
          if (impact.toLowerCase().includes('road closed')) { color = '#ef4444'; icon = '🚫'; }
          else if (impact.toLowerCase().includes('ltc')) { icon = '🚌'; color = '#06b6d4'; }
          else if (impact.toLowerCase().includes('sidewalk')) { icon = '🚶'; }
          else if (impact.toLowerCase().includes('bike')) { icon = '🚲'; color = '#22c55e'; }
          return `<span style="display:inline-block;padding:2px 6px;margin:2px;background:${color}22;border:1px solid ${color}44;border-radius:4px;font-size:10px;color:${color};font-weight:600;">${icon} ${impact}</span>`;
        }).join('');

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(coords)
          .setPopup(
            new maplibregl.Popup({ offset: 20, closeButton: true }).setHTML(
              `<div style="color:#000;font-family:sans-serif;padding:6px;min-width:200px;max-width:280px;">
                <h3 style="margin:0 0 4px;font-weight:900;font-size:14px;color:#ea580c;">🚧 ${project.title}</h3>
                <p style="margin:0 0 6px;font-size:11px;color:#666;line-height:1.4;">${project.description}</p>
                <p style="margin:0 0 6px;font-size:11px;color:#444;">📍 ${project.location}</p>
                <div style="display:flex;flex-wrap:wrap;gap:2px;">${impactBadges}</div>
                <p style="margin:6px 0 0;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.05em;">Source: ${project.source === 'renew-london' ? 'Renew London' : 'City of London'}</p>
              </div>`
            )
          )
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

  }, [mapRef, constructionProjects, layerToggles.construction]);
}
