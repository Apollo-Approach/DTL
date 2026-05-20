// src/components/CivicEventsPanel.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, ExternalLink, Music, MapPin, Ticket } from 'lucide-react';

interface CivicEvent {
  id: string;
  name: string;
  date: string;
  time: string | null;
  venue: string;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  url: string;
  priceRange: string | null;
  genre: string | null;
  subGenre: string | null;
  status: string;
  source: string;
}

export default function CivicEventsPanel() {
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/civic/events')
      .then(res => res.json())
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="w-full">
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 animate-pulse">
          <div className="h-5 bg-neutral-800 rounded w-48 mb-4" />
          <div className="space-y-3">
            <div className="h-20 bg-neutral-800 rounded-xl" />
            <div className="h-20 bg-neutral-800 rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  if (events.length === 0) return null;

  const visibleEvents = expanded ? events : events.slice(0, 3);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  return (
    <section className="w-full">
      <div className="bg-gradient-to-b from-neutral-900/90 to-neutral-900/70 border border-pink-900/25 rounded-2xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-pink-900/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-pink-900/20 rounded-lg flex items-center justify-center border border-pink-800/30">
              <Calendar className="w-4 h-4 text-pink-400/80" />
            </div>
            <div>
              <h3 className="text-pink-50 font-bold text-sm">Upcoming Events</h3>
              <p className="text-pink-200/40 text-xs">{events.length} events near downtown</p>
            </div>
          </div>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
            {events[0]?.source === 'ticketmaster' ? '🎫 Ticketmaster' : '📍 Local Venues'}
          </span>
        </div>

        {/* Event Cards */}
        <div className="p-4 space-y-3">
          {visibleEvents.map((event) => (
            <a
              key={event.id}
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 hover:border-pink-800/40 rounded-xl p-4 transition-all duration-200"
            >
              <div className="flex gap-4">
                {/* Event Image or Icon */}
                {event.imageUrl ? (
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-700">
                    <img 
                      src={event.imageUrl} 
                      alt={event.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-gradient-to-br from-pink-900/30 to-purple-900/30 border border-pink-800/30 flex items-center justify-center">
                    <Music className="w-6 h-6 text-pink-400/60" />
                  </div>
                )}

                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-bold text-sm truncate group-hover:text-pink-300 transition-colors">
                    {event.name}
                  </h4>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <MapPin className="w-3 h-3 text-neutral-500 flex-shrink-0" />
                    <span className="text-xs text-neutral-400 truncate">{event.venue}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    {event.date && (
                      <span className="text-[10px] text-pink-400 font-bold bg-pink-900/20 px-2 py-0.5 rounded-full border border-pink-800/30">
                        {formatDate(event.date)}
                      </span>
                    )}
                    {event.time && (
                      <span className="text-[10px] text-neutral-400 font-medium">
                        {formatTime(event.time)}
                      </span>
                    )}
                    {event.genre && (
                      <span className="text-[10px] text-purple-400 font-medium">
                        {event.genre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price / CTA */}
                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  {event.priceRange && (
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-800/30">
                      {event.priceRange}
                    </span>
                  )}
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-600 group-hover:text-pink-400 transition-colors" />
                </div>
              </div>
            </a>
          ))}

          {/* Show More / Less */}
          {events.length > 3 && (
            <button
              onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}
              className="w-full py-2.5 text-xs font-bold text-neutral-400 hover:text-pink-400 transition-colors uppercase tracking-wider"
            >
              {expanded ? 'Show Less' : `Show All ${events.length} Events`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
