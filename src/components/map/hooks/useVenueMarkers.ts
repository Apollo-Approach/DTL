import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Venue, Promotion, Preferences, Event } from '@/types';
import { calculateMatchScore } from '@/lib/matchScore';
import { CATEGORY_COLORS, getVenueCategory, sanitizeUrl, escapeHtml } from '../mapHelpers';
import { matchVenuesToBuildings } from '../buildingExtrusions';

export function useVenueMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  venues: Venue[],
  promos: Promotion[],
  events: Event[],
  searchQuery: string,
  forYou: boolean,
  preferences: Preferences | null,
  activeCategories: Set<string>,
  showOnlyWithEvents: boolean
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear existing markers to prevent duplicates on state updates
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter Venues — multi-select: show venues whose category is in the active set
    const filteredVenues = venues.filter(venue => {
      if (searchQuery && !venue.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      if (showOnlyWithEvents) {
        const hasEvent = events.some(evt => evt.venue_id === venue.id);
        if (!hasEvent) return false;
      }

      if (forYou && preferences) {
        const score = calculateMatchScore(venue.offerings, preferences);
        if (score >= 20) return true;
      }

      // Multi-select category filter: venue must be in an active category
      const venueCategory = getVenueCategory(venue.type);
      if (!activeCategories.has(venueCategory)) return false;

      return true;
    });

    filteredVenues.forEach((venue) => {
      const el = document.createElement('div');
      const isPopUp = venue.status === 'POP_UP';

      let markerColor = CATEGORY_COLORS[getVenueCategory(venue.type)];
      if (isPopUp) markerColor = '#06b6d4';

      const hasActiveSpecials = promos.some(p => p.venue_id === venue.id);
      const todayEvent = (events || []).find(e => e.venue_id === venue.id && new Date(e.start_time).toDateString() === new Date().toDateString());
      const hasEvent = !!todayEvent;
      const isHQ = venue.name?.toLowerCase().includes('dtl') && venue.address?.includes('430 Dundas');

      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.id = `venue-marker-${venue.id}`;
      el.style.width = '28px';
      el.style.height = '28px';

      // Category-based emoji icon
      const category = getVenueCategory(venue.type);
      const categoryEmoji: Record<string, string> = {
        Eatery: '🍴', Bars: '🍺', Stage: '🎭', Nightlife: '🌙', Retail: '🛍️',
      };
      let emoji = categoryEmoji[category] || '📍';
      
      if (isHQ) emoji = 'HQ';
      else if (hasEvent) emoji = '🎟️';
      else if (hasActiveSpecials) emoji = '$';

      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:${isHQ ? '#22c55e' : markerColor};border:2px solid rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;font-size:${isHQ ? '10px' : '14px'};font-weight:bold;color:white;box-shadow:0 2px 8px ${isHQ ? '#22c55e' : markerColor}88;transition:transform 0.2s;">
          ${emoji}
        </div>`;

      const hqLinks = isHQ ? `<div style="margin-top: 12px; border-top: 1px solid #ccc; padding-top: 8px;"><a href="/about" style="display:block; margin-bottom: 4px; font-size: 12px; color: #22c55e; font-weight: bold; text-decoration: none;">ℹ️ About & FAQ</a><a href="/contact" style="display:block; font-size: 12px; color: #22c55e; font-weight: bold; text-decoration: none;">📞 Contact Us</a></div>` : '';
      const destUrl = todayEvent ? (sanitizeUrl(todayEvent.ticket_url) || sanitizeUrl(todayEvent.source_url) || `/venues/${todayEvent.venue_id}`) : '#';
      const eventLink = todayEvent ? `<div style="margin-top: 8px;"><a href="${destUrl}" ${destUrl.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''} style="display:block; padding: 6px; background-color: #22c55e; color: white; text-align: center; border-radius: 4px; font-weight: bold; text-decoration: none; font-size: 12px;">🎉 See Tonight's Event</a></div>` : '';

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([venue.lng, venue.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: true, closeOnClick: true, className: 'venue-popup' }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 8px; min-width: 180px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 15px; color: ${isHQ ? '#22c55e' : markerColor};">${escapeHtml(venue.name)}</h3>
              <p style="margin: 6px 0 0 0; font-size: 12px; color: #444;">📍 ${escapeHtml(venue.address)}</p>
              ${venue.operating_hours ? `<p style="margin: 6px 0 0 0; font-size: 11px; color: #666;">🕒 ${typeof venue.operating_hours === 'object' && venue.operating_hours !== null ? Object.entries(venue.operating_hours).map(([day, hrs]) => `${escapeHtml(day)}: ${escapeHtml(String(hrs))}`).join(' · ') : escapeHtml(String(venue.operating_hours))}</p>` : ''}
              ${sanitizeUrl(venue.website_url) ? `<a href="${sanitizeUrl(venue.website_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin: 8px 0 0 0; font-size: 11px; font-weight: bold; color: #fff; background-color: #06b6d4; padding: 4px 8px; border-radius: 4px; text-decoration: none;">🔗 Website</a>` : ''}
              ${isPopUp ? '<span style="display:inline-block; margin-top:8px; margin-left: 6px; padding:4px 8px; background:#06b6d4; color:#fff; font-size:10px; border-radius:4px; font-weight:bold;">POP-UP</span>' : ''}
              ${eventLink}
              ${hqLinks}
            </div>`
          )
        )
        .addTo(map);
      
      markersRef.current.push(marker);
    });

    // Rebuild extrusions with only visible-category venues.
    // The osm-3d-buildings layer is created by useMapInit which may run concurrently,
    // so we poll until the layer exists (up to 8s) then match after tiles load.
    const venueMatchData = filteredVenues.map(venue => {
      const category = getVenueCategory(venue.type);
      return {
        id: venue.id,
        lng: venue.lng,
        lat: venue.lat,
        category,
        hasSpecials: promos.some(p => p.venue_id === venue.id),
      };
    });

    let cancelled = false;
    let onIdle: (() => void) | null = null;

    const tryMatch = () => {
      if (cancelled) return;
      if (!map.getLayer('osm-3d-buildings')) {
        // Layer not ready yet — retry in 500ms (up to ~8s via recursive calls)
        return;
      }
      // Layer exists — run match on next idle (tiles loaded)
      onIdle = () => {
        if (!cancelled) matchVenuesToBuildings(map, venueMatchData);
      };
      map.on('idle', onIdle);
      // Also fire immediately in case map is already idle
      matchVenuesToBuildings(map, venueMatchData);
    };

    // Poll for layer readiness every 500ms for up to 8 seconds
    const pollInterval = setInterval(() => {
      if (cancelled || map.getLayer('osm-3d-buildings')) {
        clearInterval(pollInterval);
        tryMatch();
      }
    }, 500);
    // Also try immediately
    tryMatch();

    // Handle cross-layer popup triggers (from 3D building clicks)
    const handleOpenPopup = (e: any) => {
      const id = e.detail?.venueId;
      if (!id) return;
      const marker = markersRef.current.find(m => m.getElement().id === `venue-marker-${id}`);
      if (marker) {
        if (!marker.getPopup().isOpen()) {
          marker.togglePopup();
        }
        map.flyTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 17), speed: 1.5 });
        
        // Add pulse animation
        const el = marker.getElement();
        const innerDiv = el.firstElementChild as HTMLElement;
        if (innerDiv) {
          innerDiv.classList.add('animate-marker-pulse');
          setTimeout(() => {
            if (innerDiv) innerDiv.classList.remove('animate-marker-pulse');
          }, 3000);
        }
      }
    };
    window.addEventListener('open-venue-popup', handleOpenPopup);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (onIdle) {
        map.off('idle', onIdle);
      }
      window.removeEventListener('open-venue-popup', handleOpenPopup);
    };
  }, [mapRef, venues, promos, events, searchQuery, forYou, preferences, activeCategories, showOnlyWithEvents]);
}
