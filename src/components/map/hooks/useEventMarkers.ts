import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Event, Preferences } from '@/types';
import { escapeHtml, sanitizeUrl } from '../mapHelpers';

export function useEventMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  events: Event[],
  searchQuery: string,
  dateFilter: string,
  layerToggles: { events: boolean },
  preferences: Preferences | null
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const filteredEvents = layerToggles.events ? events.filter(evt => {
      if (searchQuery && !evt.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFilter && !evt.start_time.startsWith(dateFilter)) return false;
      return true;
    }) : [];

    filteredEvents.forEach((evt) => {
      const el = document.createElement('div');
      
      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <div class="w-8 h-8 bg-pink-600 rounded-lg border-2 border-white shadow-lg flex items-center justify-center text-lg drop-shadow-lg group-hover:scale-110 transition-transform origin-bottom">
          🎫
        </div>
      `;

      const safeTicketUrl = sanitizeUrl(evt.ticket_url);
      const ticketCTA = safeTicketUrl 
        ? `<a href="${safeTicketUrl}" target="_blank" rel="noopener noreferrer" style="display:block; margin-top: 12px; width: 100%; text-align: center; padding: 6px; background: #db2777; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; text-decoration: none; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">🎟️ BUY TICKETS</a>`
        : `<div style="margin-top: 12px; width: 100%; text-align: center; padding: 6px; background: #10b981; color: white; border-radius: 6px; font-size: 12px; font-weight: bold;">FREE EVENT</div>`;

      if (preferences?.autoRoute) {
        el.addEventListener('click', () => {
          (window as any).requestSafeWalk(evt.lng, evt.lat);
        });
      }

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([evt.lng, evt.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 4px; min-width: 160px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 14px;">${escapeHtml(evt.name)}</h3>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #444;">${new Date(evt.start_time).toLocaleDateString()} @ ${new Date(evt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              ${ticketCTA}
            </div>`
          )
        )
        .addTo(map);
      
      markersRef.current.push(marker);
    });

  }, [mapRef, events, searchQuery, dateFilter, layerToggles.events, preferences]);
}
