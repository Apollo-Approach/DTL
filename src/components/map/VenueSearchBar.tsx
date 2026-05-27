import React, { useState, useEffect, useRef } from 'react';
import { Venue } from '@/types';
import { getVenueCategory, CATEGORY_COLORS } from './mapHelpers';

interface VenueSearchBarProps {
  venues: Venue[];
  mapRef: React.RefObject<any>; // maplibregl.Map
  onClose: () => void;
}

export default function VenueSearchBar({ venues, mapRef, onClose }: VenueSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Venue[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const filtered = venues.filter(v => 
      v.name.toLowerCase().includes(lowerQuery) || 
      (v.address && v.address.toLowerCase().includes(lowerQuery))
    ).slice(0, 5); // Max 5 results
    setResults(filtered);
  }, [query, venues]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (venue: Venue) => {
    setQuery('');
    setIsFocused(false);
    
    if (mapRef.current) {
      // Fly map to venue
      mapRef.current.flyTo({
        center: [venue.lng, venue.lat],
        zoom: 17,
        speed: 1.5
      });
      
      // Give the map time to fly before opening popup
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-venue-popup', { detail: { venueId: venue.id } }));
      }, 500);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm z-50">
      <div className="relative flex items-center w-full">
        <span className="absolute left-3 text-neutral-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search venues..."
          autoFocus
          className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-neutral-500"
        />
        {/* We always show the close button to close the search mode completely */}
        <button 
          onClick={onClose}
          className="absolute right-3 text-neutral-500 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Autocomplete Dropdown */}
      {isFocused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {results.map((venue) => {
            const cat = getVenueCategory(venue.type);
            const color = CATEGORY_COLORS[cat] || '#64748b';
            
            return (
              <button
                key={venue.id}
                onClick={() => handleSelect(venue)}
                className="w-full text-left px-4 py-3 hover:bg-neutral-800 border-b border-neutral-800 last:border-0 flex items-center gap-3 transition-colors"
              >
                <div 
                  className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-xs"
                  style={{ backgroundColor: color }}
                >
                  {venue.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-bold text-white truncate">{venue.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{venue.address}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      
      {isFocused && query.trim() && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl px-4 py-3 text-sm text-neutral-400 text-center">
          No venues found
        </div>
      )}
    </div>
  );
}
