import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Event, Preferences, Venue } from '@/types';
import { escapeHtml, sanitizeUrl } from '../mapHelpers';

// Inject z-index overrides once (ensures event markers stack above venue markers)
let styleInjected = false;
function injectEventMarkerStyles() {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .event-cluster-marker { z-index: 150 !important; }
    .event-cluster-marker > div:hover { transform: scale(1.12); }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

interface EventCluster {
  lat: number;
  lng: number;
  venueName: string;
  events: Event[];
}

export function useEventMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  events: Event[],
  venues: Venue[],
  searchQuery: string,
  dateFilter: string,
  layerToggles: { events: boolean },
  preferences: Preferences | null
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    injectEventMarkerStyles();

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Determine logical "today" (if before 5 AM, it belongs to yesterday's night)
    const now = new Date();
    const logicalToday = new Date(now);
    if (logicalToday.getHours() < 5) {
      logicalToday.setDate(logicalToday.getDate() - 1);
    }
    logicalToday.setHours(0, 0, 0, 0);

    const endOfTonight = new Date(logicalToday);
    endOfTonight.setDate(logicalToday.getDate() + 1);
    endOfTonight.setHours(5, 0, 0, 0);

    const filteredEvents = layerToggles.events ? events.filter(evt => {
      if (searchQuery && !evt.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFilter && !evt.start_time.startsWith(dateFilter)) return false;
      
      if (!evt.start_time) return false;
      const eventDate = new Date(evt.start_time);
      if (eventDate < logicalToday || eventDate > endOfTonight) return false;

      return true;
    }) : [];

    // Cluster events by venue proximity (~200m)
    const clusters: EventCluster[] = [];
    filteredEvents.forEach((evt) => {
      const venue = venues.find(v => v.id === evt.venue_id);
      if (!venue) return; // Skip events without a known venue
      const lat = venue.lat || 0;
      const lng = venue.lng || 0;

      const cluster = clusters.find(c => 
        Math.abs(c.lat - lat) < 0.002 && Math.abs(c.lng - lng) < 0.002
      );

      if (cluster) {
        cluster.events.push(evt);
      } else {
        clusters.push({ lat, lng, venueName: evt.name, events: [evt] });
      }
    });

    clusters.forEach((cluster) => {
      const count = cluster.events.length;
      const el = document.createElement('div');
      el.className = 'event-cluster-marker cursor-pointer';

      el.innerHTML = `
        <div style="position:relative;width:28px;height:28px;background:#db2777;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(219,39,119,0.6);display:flex;align-items:center;justify-content:center;font-size:14px;transition:transform 0.2s;">
          🎫
          ${count > 1 ? `<span style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;background:#fff;color:#db2777;border-radius:8px;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);border:1.5px solid #db2777;">${count}</span>` : ''}
        </div>`;

      if (preferences?.autoRoute) {
        el.addEventListener('click', () => {
          (window as unknown as { requestSafeWalk: (lng: number, lat: number) => void }).requestSafeWalk(cluster.lng, cluster.lat);
        });
      }

      // Build scrollable event list for popup
      const eventCards = cluster.events
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        .map((evt) => {
          const dateStr = evt.start_time ? new Date(evt.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
          const timeStr = evt.start_time ? new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const safeTicketUrl = sanitizeUrl(evt.best_link);
          const ticketLink = safeTicketUrl
            ? `<a href="${safeTicketUrl}" target="_blank" rel="noopener noreferrer" style="font-size:9px;color:#db2777;font-weight:bold;text-decoration:none;">TICKETS/INFO →</a>`
            : '';
          return `<div style="padding:6px 0;border-bottom:1px solid #eee;">
            <div style="font-weight:bold;font-size:12px;color:#1f2937;margin-bottom:2px;">${escapeHtml(evt.name)}</div>
            <div style="font-size:10px;color:#666;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              ${dateStr ? `<span>📅 ${dateStr}${timeStr ? ' @ ' + timeStr : ''}</span>` : ''}
              ${ticketLink}
            </div>
          </div>`;
        }).join('');

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([cluster.lng, cluster.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, maxWidth: '320px' }).setHTML(
            `<div style="color:#000;font-family:sans-serif;padding:4px;min-width:250px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:6px;border-bottom:2px solid #db2777;">
                <h3 style="margin:0;font-weight:900;font-size:14px;color:#be185d;">🎫 ${escapeHtml(cluster.venueName)}</h3>
                <span style="background:#db2777;color:white;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:bold;">${count} event${count > 1 ? 's' : ''}</span>
              </div>
              <div style="max-height:260px;overflow-y:auto;scrollbar-width:thin;">
                ${eventCards}
              </div>
            </div>`
          )
        )
        .addTo(map);
      
      markersRef.current.push(marker);
    });

  }, [mapRef, events, venues, searchQuery, dateFilter, layerToggles.events, preferences]);
}
