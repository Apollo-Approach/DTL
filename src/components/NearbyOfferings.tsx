'use client';

import React, { useState, useMemo } from 'react';
import SecureQR from '@/components/SecureQR';
import VenueDetailModal from '@/components/VenueDetailModal';

import { Venue, Promotion, Preferences } from '@/types';

interface NearbyOfferingsProps {
  venues: Venue[];
  promos: Promotion[];
  preferences: Preferences | null;
}

import { calculateMatchScore } from '@/lib/matchScore';

export default function NearbyOfferings({ venues, promos, preferences }: NearbyOfferingsProps) {
  const [forYou, setForYou] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // Compute matched venues
  const displayVenues = useMemo(() => {
    if (!forYou || !preferences) return venues;

    return venues
      .map(v => {
        const score = calculateMatchScore(v.offerings, preferences);
        return { ...v, matchScore: score };
      })
      // Only show if score is >= 20 (or whatever threshold) when "For You" is on
      .filter(v => v.matchScore >= 20)
      .sort((a, b) => b.matchScore - a.matchScore);
  }, [venues, preferences, forYou]);

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

      {displayVenues.length === 0 && forYou ? (
        <div className="p-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl">
          <p className="text-neutral-400">No high-match venues found for your specific preferences right now.</p>
          <button onClick={() => setForYou(false)} className="mt-4 text-cyan-400 font-bold underline">Show all venues</button>
        </div>
      ) : (
        <ul className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-hide">
          {displayVenues.map((venue: Venue & { matchScore?: number }) => {
            const venuePromos = promos.filter((p: Promotion) => p.venue_id === venue.id);
            const isPopUp = venue.status === 'POP_UP';
            
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
                  
                  <address className="not-italic text-sm text-purple-400 mb-3 font-mono">
                    {venue.address}
                  </address>
                  
                  <p className="text-sm text-neutral-300 leading-relaxed line-clamp-3 mb-4 flex-1">
                    {venue.description}
                  </p>

                  <div className="mt-auto text-xs font-bold text-cyan-400 flex items-center justify-between border-t border-neutral-800 pt-3">
                    <span>Click for details & hours</span>
                    {venuePromos.length > 0 && (
                      <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded border border-purple-500/30">
                        🎁 {venuePromos.length} Offer{venuePromos.length !== 1 ? 's' : ''}
                      </span>
                    )}
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
        onClose={() => setSelectedVenue(null)} 
      />
    </section>
  );
}
