import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Venue, Promotion, Preferences } from '@/types';
import { calculateMatchScore } from '@/lib/matchScore';
import { VENUE_CATEGORIES, CATEGORY_COLORS, getVenueCategory, sanitizeUrl, escapeHtml } from '../mapHelpers';
import { matchVenuesToBuildings } from '../buildingExtrusions';

export function useVenueMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  venues: Venue[],
  promos: Promotion[],
  searchQuery: string,
  forYou: boolean,
  preferences: Preferences | null,
  activeFilter: string | null
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear existing markers to prevent duplicates on state updates
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Filter Venues
    const filteredVenues = venues.filter(venue => {
      if (searchQuery && !venue.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      if (forYou && preferences) {
        const score = calculateMatchScore(venue.offerings, preferences);
        if (score >= 20) return true;
      }

      // If no category is selected, hide venues to prevent map clutter
      if (!activeFilter) return false;

      // Category filter — map filter bubble values to venue.type
      if (activeFilter === 'LateNight') return !!venue.late_night_eligible;
      const filterTypes = VENUE_CATEGORIES[activeFilter as keyof typeof VENUE_CATEGORIES];
      return filterTypes ? (filterTypes as readonly string[]).includes(venue.type || '') : false;
    });

    filteredVenues.forEach((venue) => {
      const el = document.createElement('div');
      const isPopUp = venue.status === 'POP_UP';

      let markerColor = CATEGORY_COLORS[getVenueCategory(venue.type)];
      if (isPopUp) markerColor = '#06b6d4';

      const hasActiveSpecials = promos.some(p => p.venue_id === venue.id);

      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.style.width = '28px';
      el.style.height = '28px';
      el.innerHTML = hasActiveSpecials
        ? `<span class="absolute inset-0 rounded-full animate-pulse" style="background: radial-gradient(circle, ${markerColor}88 0%, transparent 70%); box-shadow: 0 0 12px ${markerColor}66, 0 0 24px ${markerColor}33;"></span>`
        : '';
      if (isPopUp) {
        el.innerHTML += '<span class="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span></span>';
      }

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([venue.lng, venue.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: true, closeOnClick: true, className: 'venue-popup' }).setHTML(
            `<div style="color: #000; font-family: sans-serif; padding: 8px; min-width: 180px;">
              <h3 style="margin: 0; font-weight: bold; font-size: 15px; color: ${markerColor};">${escapeHtml(venue.name)}</h3>
              <p style="margin: 6px 0 0 0; font-size: 12px; color: #444;">📍 ${escapeHtml(venue.address)}</p>
              ${venue.operating_hours ? `<p style="margin: 6px 0 0 0; font-size: 11px; color: #666;">🕒 ${typeof venue.operating_hours === 'object' && venue.operating_hours !== null ? Object.entries(venue.operating_hours).map(([day, hrs]) => `${escapeHtml(day)}: ${escapeHtml(String(hrs))}`).join(' · ') : escapeHtml(String(venue.operating_hours))}</p>` : ''}
              ${sanitizeUrl(venue.website_url) ? `<a href="${sanitizeUrl(venue.website_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin: 8px 0 0 0; font-size: 11px; font-weight: bold; color: #fff; background-color: #06b6d4; padding: 4px 8px; border-radius: 4px; text-decoration: none;">🔗 Website</a>` : ''}
              ${isPopUp ? '<span style="display:inline-block; margin-top:8px; margin-left: 6px; padding:4px 8px; background:#06b6d4; color:#fff; font-size:10px; border-radius:4px; font-weight:bold;">POP-UP</span>' : ''}
            </div>`
          )
        )
        .addTo(map);
      
      markersRef.current.push(marker);
    });

    if (map.getLayer('osm-3d-buildings')) {
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
      setTimeout(() => {
        matchVenuesToBuildings(map, venueMatchData);
      }, 500);
    }

    return () => {
      // Don't remove markers on unmount, they get removed before next render or when parent map unmounts.
    };
  }, [mapRef, venues, promos, searchQuery, forYou, preferences, activeFilter]);
}
