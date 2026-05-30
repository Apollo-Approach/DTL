'use client';

import React, { useEffect, useState } from 'react';
import { Venue, Promotion, Event } from '@/types';
import SecureQR from '@/components/SecureQR';
import { X, MapPin, Clock, Globe, Calendar, AlertTriangle, Tag, Ticket } from 'lucide-react';
import { sanitizeUrl } from '@/components/map/mapHelpers';
import Link from 'next/link';

interface ConstructionWarning {
  id: string;
  title: string;
  description: string;
  impacts: string[];
  location: string;
  source: string;
}

interface VenueDetailModalProps {
  venue: Venue | null;
  promos: Promotion[];
  events?: Event[];
  constructionWarnings?: ConstructionWarning[];
  onClose: () => void;
}


export default function VenueDetailModal({ venue, promos, events = [], constructionWarnings = [], onClose }: VenueDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'events' | 'offers'>('details');

  useEffect(() => {
    if (venue) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [venue]);

  // Reset tab when venue changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (venue) setActiveTab('details');
  }, [venue?.id]);

  if (!venue) return null;

  const isPopUp = venue.status === 'POP_UP';
  
  // Filter events for this venue
  const venueEvents = events.filter(e => e.venue_id === venue.id);
  const upcomingEvents = venueEvents
    .filter(e => new Date(e.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5);

  // Find nearby construction warnings
  // Uses a simple bounding-box check (~300m radius around the venue)
  const nearbyConstruction = constructionWarnings.filter(w => {
    // Known project coordinates (must match InteractiveMap locationCoords)
    const locationCoords: Record<string, [number, number]> = {
      'renew-ontario-st': [-81.2335, 42.9892],
      'renew-queens-bridge': [-81.2588, 42.9825],
      'renew-brt-east': [-81.2350, 42.9870],
      'renew-wellington-gateway': [-81.2355, 42.9605],
      'renew-york-wellington': [-81.2483, 42.9818],
    };
    const coords = locationCoords[w.id];
    if (!coords) return false;
    // ~300m proximity check (approx 0.003 degrees)
    const dlat = Math.abs(venue.lat - coords[1]);
    const dlng = Math.abs(venue.lng - coords[0]);
    return dlat < 0.003 && dlng < 0.004;
  }).slice(0, 3);


  // Group promos by discount_value to prevent duplicates for everyday specials
  const groupedPromosMap = new Map();
  promos.forEach(p => {
    if (!groupedPromosMap.has(p.discount_value)) {
      groupedPromosMap.set(p.discount_value, { ...p, all_days: [p.recurring_day] });
    } else {
      const existing = groupedPromosMap.get(p.discount_value);
      if (p.recurring_day && !existing.all_days.includes(p.recurring_day)) {
        existing.all_days.push(p.recurring_day);
      }
    }
  });

  const groupedPromos = Array.from(groupedPromosMap.values()).map(p => {
    const days = p.all_days.filter(Boolean);
    if (days.length === 7) {
      p.display_day = "Everyday";
    } else if (days.length > 1) {
      // capitalize each day
      p.display_day = days.map((d: string) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
    } else {
      p.display_day = p.recurring_day;
    }
    return p;
  });

  const tabCounts = {
    details: null, // No count needed
    events: upcomingEvents.length || null,
    offers: groupedPromos.length || null,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 pb-0 sm:pb-6 pointer-events-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className="relative w-full max-w-lg max-h-[90vh] bg-neutral-900 border border-neutral-700 sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
      >
        {/* Header Image / Gradient Area */}
        <div className="h-36 bg-gradient-to-br from-purple-900/60 via-indigo-900/40 to-cyan-900/60 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full transition-colors z-10 backdrop-blur-md"
          >
            <X size={20} />
          </button>
          {isPopUp && (
            <span className="absolute top-4 left-4 bg-cyan-500 text-black font-bold px-3 py-1 text-xs uppercase tracking-widest rounded-full shadow-lg shadow-cyan-500/50">
              Pop-Up
            </span>
          )}
          
          {/* Venue Name overlaid on gradient */}
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">{venue.name}</h2>
          </div>
        </div>


        {/* Tab Bar */}
        <div className="flex border-b border-neutral-800 px-5">
          {(['details', 'events', 'offers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold capitalize transition-all border-b-2 ${
                activeTab === tab
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab === 'details' && <MapPin size={14} />}
              {tab === 'events' && <Calendar size={14} />}
              {tab === 'offers' && <Tag size={14} />}
              {tab}
              {tabCounts[tab] && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? 'bg-cyan-500/20 text-cyan-400' : 'bg-neutral-800 text-neutral-500'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 scrollbar-hide">
          
          {/* === DETAILS TAB === */}
          {activeTab === 'details' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 text-neutral-300">
                  <MapPin className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <address className="not-italic text-sm leading-relaxed">{venue.address}</address>
                </div>
                
                {venue.operating_hours && (
                  <div className="flex items-start gap-3 text-neutral-300">
                    <Clock className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      {typeof venue.operating_hours === 'object' 
                        ? Object.entries(venue.operating_hours).map(([day, hrs]) => (
                            <div key={day} className="flex justify-between gap-4">
                              <span className="font-bold text-neutral-400 w-12">{day}:</span>
                              <span>{hrs as string}</span>
                            </div>
                          ))
                        : <p>{venue.operating_hours}</p>
                      }
                    </div>
                  </div>
                )}
                
                {sanitizeUrl(venue.website_url) && (
                  <div className="flex items-center gap-3 text-neutral-300">
                    <Globe className="w-5 h-5 text-cyan-400 shrink-0" />
                    <a href={sanitizeUrl(venue.website_url)!} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                      Visit Website
                    </a>
                  </div>
                )}
                
                <div className="pt-2">
                  <Link href={`/venues/${venue.id}`} className="inline-block px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-lg transition-colors shadow-lg shadow-indigo-900/50 w-full text-center">
                    View Full Venue Profile
                  </Link>
                </div>
              </div>

              {/* About */}
              <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-2 border-b border-neutral-800 pb-2">About</h3>
                <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {venue.description || "A premier destination in downtown London."}
                </p>
              </div>

              {/* Construction Warnings */}
              {nearbyConstruction.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest mb-2 border-b border-orange-900/30 pb-2 flex items-center gap-2">
                    <AlertTriangle size={14} /> Nearby Advisories
                  </h3>
                  <div className="space-y-2">
                    {nearbyConstruction.map(w => (
                      <div key={w.id} className="p-3 bg-orange-950/30 border border-orange-800/30 rounded-lg">
                        <p className="text-sm font-bold text-orange-300">{w.title}</p>
                        <p className="text-xs text-orange-400/70 mt-1">{w.location}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {w.impacts.map((impact, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-orange-900/40 text-orange-400 rounded-full border border-orange-800/30 font-bold">
                              {impact}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === EVENTS TAB === */}
          {activeTab === 'events' && (
            <div className="space-y-3">
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                  <p className="text-neutral-500 text-sm">No upcoming events at this venue.</p>
                </div>
              ) : (
                upcomingEvents.map(evt => {
                  const startDate = new Date(evt.start_time);
                  const isPast = startDate < new Date();
                  return (
                    <div
                      key={evt.id}
                      className={`p-4 rounded-xl border transition-colors ${
                        isPast
                          ? 'bg-neutral-900 border-neutral-800 opacity-60'
                          : 'bg-neutral-800/50 border-pink-500/20 hover:border-pink-500/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-pink-400 uppercase tracking-wide mb-1">
                            {startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' · '}
                            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <h4 className="text-white font-bold text-sm truncate">{evt.name}</h4>
                          {evt.description && (
                            <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{evt.description}</p>
                          )}
                        </div>
                        {sanitizeUrl(evt.ticket_url) ? (
                          <a
                            href={sanitizeUrl(evt.ticket_url)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shadow-lg shadow-pink-600/30"
                          >
                            <Ticket size={12} /> Tickets
                          </a>
                        ) : (
                          <span className="shrink-0 bg-emerald-600/20 text-emerald-400 text-xs font-bold px-3 py-2 rounded-lg border border-emerald-600/30">
                            Free
                          </span>
                        )}
                      </div>
                      {evt.source_platform && (
                        <p className="text-[10px] text-neutral-600 mt-2 uppercase tracking-wider">
                          via {evt.source_platform}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* === OFFERS TAB === */}
          {activeTab === 'offers' && (
            <div className="space-y-3">
              {groupedPromos.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                  <p className="text-neutral-500 text-sm">No active offers right now.</p>
                  <p className="text-neutral-600 text-xs mt-1">Check back later for deals and specials!</p>
                </div>
              ) : (
                groupedPromos.map((promo) => {
                  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                  const todayPromo = promos.find(orig => orig.discount_value === promo.discount_value && orig.recurring_day?.toLowerCase() === today);
                  const activePromoId = todayPromo ? todayPromo.id : promo.id;
                  return (
                  <details key={promo.id} className="group bg-neutral-800 border border-purple-500/30 rounded-xl overflow-hidden">
                    <summary className="list-none cursor-pointer bg-gradient-to-r from-purple-900/40 to-cyan-900/40 p-4 text-sm font-bold text-purple-300 hover:text-white transition-colors flex items-center justify-between outline-none">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span>🎁</span> {promo.discount_value}
                        </div>
                        {promo.display_day && (
                          <p className="text-[10px] text-neutral-500 mt-1 font-normal capitalize">
                            {promo.display_day === 'Everyday' ? 'Everyday' : `Every ${promo.display_day}`}
                            {promo.active_from_time && promo.active_until_time 
                              ? ` · ${promo.active_from_time}–${promo.active_until_time}`
                              : ''}
                          </p>
                        )}

                      </div>
                      <span className="text-xs bg-purple-500 text-white px-3 py-1 rounded-full group-open:hidden shadow-lg shadow-purple-500/50 shrink-0 ml-3">
                        Redeem
                      </span>
                    </summary>
                    <div className="p-4 bg-neutral-900/50 animate-in fade-in slide-in-from-top-2 duration-300">
                      <SecureQR 
                        promotionId={activePromoId}
                        venueName={venue.name}
                        discountValue={promo.discount_value}
                        title={promo.title}
                      />
                    </div>
                  </details>
                );
              })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
