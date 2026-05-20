import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { SafetyIncident } from '@/types';
import { escapeHtml } from '../mapHelpers';

export function useIncidentMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  incidents: SafetyIncident[],
  localIncidentUpdates: Record<string, SafetyIncident>,
  layerToggles: { incidents: boolean },
  userRole: string,
  timeFilter: '24h' | '7d' | 'all',
  mode: 'public' | 'crisis',
  setSelectedIncident: (incident: SafetyIncident) => void
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const displayIncidents = incidents.map(inc => localIncidentUpdates[inc.id] || inc);

    const filteredIncidents = displayIncidents.filter((incident) => {
      if (!layerToggles.incidents) return false;

      // Role-based visibility logic
      if (userRole === 'citizen') {
        return false;
      }

      if (userRole === 'm1_observer') {
        if (incident.type !== 'PANIC_ALARM' && incident.type !== 'SAFEWALK_SOS') {
          return false;
        }
        if (incident.status === 'RESOLVED') return false;
      }

      // Filter by time
      if (timeFilter !== 'all') {
        const incidentTime = new Date(incident.reported_at).getTime();
        const hoursDiff = (Date.now() - incidentTime) / (1000 * 60 * 60);
        if (timeFilter === '24h' && hoursDiff > 24) return false;
        if (timeFilter === '7d' && hoursDiff > 168) return false;
      }

      return true;
    });

    filteredIncidents.forEach((incident) => {
      let marker: maplibregl.Marker;

      if (incident.type === 'SAFEWALK_SOS' || incident.type === 'PANIC_ALARM') {
        const sosEl = document.createElement('div');
        sosEl.className = 'cursor-pointer z-50';
        sosEl.innerHTML = `
          <span class="relative flex h-8 w-8">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-8 w-8 ${incident.status === 'DISPATCHED' ? 'bg-cyan-500' : 'bg-red-600'} border-2 border-white shadow-2xl flex items-center justify-center text-sm">🚨</span>
          </span>
        `;
        marker = new maplibregl.Marker({ element: sosEl }).setLngLat([incident.lng, incident.lat]);
      } else {
        const defaultEl = document.createElement('div');
        defaultEl.innerHTML = `
          <span class="relative flex h-5 w-5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${incident.status === 'DISPATCHED' ? 'bg-cyan-400' : 'bg-amber-400'} opacity-75"></span>
            <span class="relative inline-flex rounded-full h-5 w-5 ${incident.status === 'DISPATCHED' ? 'bg-cyan-500' : 'bg-amber-500'} border-2 border-white shadow-lg"></span>
          </span>
        `;
        defaultEl.className = 'cursor-pointer';
        marker = new maplibregl.Marker({ element: defaultEl }).setLngLat([incident.lng, incident.lat]);
      }

      if (mode === 'crisis') {
        marker.getElement().addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedIncident(incident);
        });
      } else {
        marker.setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<div style="color: #000; font-family: sans-serif; padding: 4px;">
                <h3 style="margin: 0; font-weight: bold; font-size: 14px; color: ${incident.status === 'DISPATCHED' ? '#06b6d4' : '#d97706'};">⚠️ Safety Alert ${incident.status === 'DISPATCHED' ? '(Dispatched)' : ''}</h3>
                <p style="margin: 2px 0 4px 0; font-size: 12px; font-weight: bold; color: #444;">${escapeHtml(incident.type.replace('_', ' '))}</p>
                <p style="margin: 0; font-size: 11px; color: #666;">${escapeHtml(incident.description) || 'Mediator requested.'}</p>
                <p style="margin: 4px 0 0 0; font-size: 10px; color: #888;">Reported: ${new Date(incident.reported_at).toLocaleTimeString()}</p>
              </div>`
            )
          );
      }

      marker.addTo(map);
      markersRef.current.push(marker);
    });

  }, [mapRef, incidents, localIncidentUpdates, layerToggles.incidents, userRole, timeFilter, mode, setSelectedIncident]);
}
