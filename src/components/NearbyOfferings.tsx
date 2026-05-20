'use client';

import React, { useState, useMemo, useEffect } from 'react';
import SecureQR from '@/components/SecureQR';
import VenueDetailModal from '@/components/VenueDetailModal';

import { Venue, Promotion, Event, Preferences } from '@/types';

interface NearbyOfferingsProps {
  venues: Venue[];
  promos: Promotion[];
  events?: Event[];
  preferences: Preferences | null;
}

import { calculateMatchScore } from '@/lib/matchScore';

// Situation filter chips — the "Search by Situation" UX (Sprint 3.3)
const SITUATION_CHIPS = [
  { tag: 'cheap-drinks', icon: '🍻', label: 'Cheap Drinks', color: 'amber' },
  { tag: 'live-music', icon: '🎵', label: 'Live Music', color: 'pink' },
  { tag: 'late-night', icon: '🌙', label: 'Late Night', color: 'indigo' },
  { tag: 'no-cover', icon: '🚫', label: 'No Cover', color: 'emerald' },
  { tag: 'patio', icon: '☀️', label: 'Patios', color: 'yellow' },
  { tag: 'date-night', icon: '💕', label: 'Date Night', color: 'rose' },
  { tag: 'student-friendly', icon: '🎓', label: 'Student', color: 'blue' },
] as const;

const CHIP_COLORS: Record<string, { active: string; inactive: string }> = {
  amber: { active: 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  pink: { active: 'bg-pink-500/20 text-pink-400 border-pink-500/50 shadow-[0_0_10px_rgba(236,72,153,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  indigo: { active: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  emerald: { active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  yellow: { active: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  rose: { active: 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
  blue: { active: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)]', inactive: 'bg-neutral-900 text-neutral-500 border-neutral-700 hover:border-neutral-600' },
};

// Dynamic feed item from /api/promotions/feed
interface FeedItem {
  id: string;
  title: string;
  description: string;
  discount_value: string;
  venue_name: string;
  venue_id: string;
  situation_tags: string[];
  recurring_day: string | null;
  active_window: string;
  distance_km: number | null;
}

export default function NearbyOfferings({ venues, promos, events = [], preferences }: NearbyOfferingsProps) {
  const [forYou, setForYou] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeSituationTag, setActiveSituationTag] = useState<string | null>(null);
  const [liveFeed, setLiveFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // Default center: Richmond & Dundas intersection
  const DTL_CENTER = { lat: 42.9837, lng: -81.2497 };

  // Fetch live promo feed when situation tag changes
  useEffect(() => {
    const fetchFeed = async () => {
      setFeedLoading(true);
      try {
        const params = new URLSearchParams({
          lat: DTL_CENTER.lat.toString(),
          lng: DTL_CENTER.lng.toString(),
          limit: '15',
        });
        if (activeSituationTag) {
          params.set('tags', activeSituationTag);
        }
        const res = await fetch(`/api/promotions/feed?${params}`);
        if (res.ok) {
          const data = await res.json();
          setLiveFeed(data.feed || []);
        }
      } catch (err) {
        console.error('Feed fetch error:', err);
      } finally {
        setFeedLoading(false);
      }
    };

    fetchFeed();
  }, [activeSituationTag]);

  // Compute matched venues — max 7, sorted by proximity or match score
  const displayVenues = useMemo(() => {
    const distanceTo = (v: Venue) => {
      const dlat = v.lat - DTL_CENTER.lat;
      const dlng = v.lng - DTL_CENTER.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng);
    };

    let filtered = venues;

    // Situation tag filter — show only venues with matching tags
    if (activeSituationTag) {
      filtered = venues.filter(v => {
        const tags = v.situation_tags || [];
        // Also check if any promo for this venue matches the tag
        const promoTagMatch = promos.some(p =>
          p.venue_id === v.id && (p.situation_tags || []).includes(activeSituationTag)
        );
        return tags.includes(activeSituationTag) || promoTagMatch;
      });
    }

    if (forYou && preferences) {
      return filtered
        .map(v => ({
          ...v,
          matchScore: calculateMatchScore(v.offerings, preferences),
        }))
        .filter(v => v.matchScore >= 20)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 7);
    }

    // Default: sort by proximity to Richmond & Dundas, take top 7
    return [...filtered]
      .sort((a, b) => distanceTo(a) - distanceTo(b))
      .slice(0, 7);
  }, [venues, preferences, forYou, activeSituationTag, promos]);

  return (
    <section className="w-full min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-neutral-800 pb-2 mb-4 gap-4">
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          Nearby Offerings
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full border border-purple-500/30 font-semibold uppercase tracking-wider">
            Live Network
          </span>
        </h2>

        {preferences && (
          <button
            onClick={() => setForYou(!forYou)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
              forYou 
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
            }`}
          >
            🎯 For You
          </button>
        )}
      </div>

      {/* Situation Chips — Sprint 3.3 */}
      <div className="flex overflow-x-auto gap-2 pb-4 scrollbar-hide">
        {SITUATION_CHIPS.map(chip => {
          const isActive = activeSituationTag === chip.tag;
          const colors = CHIP_COLORS[chip.color];
          return (
            <button
              key={chip.tag}
              onClick={() => setActiveSituationTag(isActive ? null : chip.tag)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all shrink-0 ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {chip.icon} {chip.label}
            </button>
          );
        })}
      </div>

      {/* Live Feed Banner — shows when situation tag is active */}
      {activeSituationTag && liveFeed.length > 0 && (
        <div className="mb-4 p-4 bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/20 rounded-xl">
          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            🔥 Live Tonight
            {feedLoading && <span className="text-neutral-500 animate-pulse">updating...</span>}
          </h3>
          <div className="space-y-2">
            {liveFeed.slice(0, 4).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-2 bg-neutral-900/60 rounded-lg hover:bg-neutral-800/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{item.discount_value}</p>
                  <p className="text-xs text-neutral-400 truncate">{item.venue_name} · {item.active_window}</p>
                </div>
                {item.distance_km !== null && (
                  <span className="text-[10px] text-neutral-500 font-bold shrink-0">
                    {item.distance_km < 1 ? `${Math.round(item.distance_km * 1000)}m` : `${item.distance_km}km`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {displayVenues.length === 0 && (forYou || activeSituationTag) ? (
        <div className="p-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl">
          <p className="text-neutral-400">
            {activeSituationTag 
              ? `No venues match "${activeSituationTag.replace(/-/g, ' ')}" right now.`
              : 'No high-match venues found for your specific preferences right now.'
            }
          </p>
          <button 
            onClick={() => { setForYou(false); setActiveSituationTag(null); }} 
            className="mt-4 text-cyan-400 font-bold underline"
          >
            Show all venues
          </button>
        </div>
      ) : (
        <ul className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-hide">
          {displayVenues.map((venue: Venue & { matchScore?: number }) => {
            const venuePromos = promos.filter((p: Promotion) => p.venue_id === venue.id);
            const venueEvents = events.filter(e => e.venue_id === venue.id);
            const upcomingCount = venueEvents.filter(e => new Date(e.start_time) >= new Date()).length;
            const isPopUp = venue.status === 'POP_UP';
            const tags = venue.situation_tags || [];
            
            return (
              <li 
                key={venue.id} 
                onClick={() => setSelectedVenue(venue)}
                className={`min-w-[300px] shrink-0 snap-center p-5 bg-neutral-900 border ${
                  forYou && (venue.matchScore ?? 0) >= 80 
                    ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : isPopUp 
                      ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                      : 'border-neutral-800'
                } rounded-xl hover:border-purple-500 transition-all hover:scale-[1.02] cursor-pointer relative overflow-hidden flex flex-col group`}
              >
                <article className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-xl font-bold text-neutral-100 pr-4 group-hover:text-purple-400 transition-colors">{venue.name}</h3>
                    
                    {/* Tags Container */}
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      {isPopUp && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded whitespace-nowrap">
                          Pop-up
                        </span>
                      )}
                      {forYou && venue.matchScore && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap ${
                          venue.matchScore >= 80 ? 'bg-cyan-500 text-black' : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          {venue.matchScore}% Match
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <address className="not-italic text-sm text-purple-400 mb-2 font-mono">
                    {venue.address}
                  </address>

                  {/* Situation Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded-full border border-neutral-700 font-bold capitalize">
                          {tag.replace(/-/g, ' ')}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 text-neutral-500">+{tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  
                  <p className="text-sm text-neutral-300 leading-relaxed line-clamp-2 mb-4 flex-1">
                    {venue.description}
                  </p>

                  <div className="mt-auto text-xs font-bold text-cyan-400 flex items-center justify-between border-t border-neutral-800 pt-3">
                    <span>Click for details & hours</span>
                    <div className="flex items-center gap-2">
                      {upcomingCount > 0 && (
                        <span className="bg-pink-500/20 text-pink-300 px-2 py-1 rounded border border-pink-500/30 flex items-center gap-1">
                          🎫 {upcomingCount}
                        </span>
                      )}
                      {venuePromos.length > 0 && (
                        <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded border border-purple-500/30">
                          🎁 {venuePromos.length}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {/* Render Modal */}
      <VenueDetailModal 
        venue={selectedVenue} 
        promos={selectedVenue ? promos.filter(p => p.venue_id === selectedVenue.id) : []} 
        events={events}
        onClose={() => setSelectedVenue(null)} 
      />
    </section>
  );
}
