'use client';

import React, { useEffect } from 'react';
import { Venue, Promotion } from '@/types';
import SecureQR from '@/components/SecureQR';
import { X, MapPin, Clock, Globe, Shield } from 'lucide-react';

interface VenueDetailModalProps {
  venue: Venue | null;
  promos: Promotion[];
  onClose: () => void;
}

export default function VenueDetailModal({ venue, promos, onClose }: VenueDetailModalProps) {
  useEffect(() => {
    if (venue) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [venue]);

  if (!venue) return null;

  const isPopUp = venue.status === 'POP_UP';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 pb-0 sm:pb-6 pointer-events-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content - Slide up on mobile, zoom on desktop */}
      <div 
        className="relative w-full max-w-lg max-h-[90vh] bg-neutral-900 border border-neutral-700 sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
      >
        {/* Header Image / Gradient Area */}
        <div className="h-32 bg-gradient-to-br from-purple-900/60 to-cyan-900/60 relative">
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
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-hide">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-2">{venue.name}</h2>
          
          <div className="flex flex-col gap-3 mb-6">
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
            
            {venue.website_url && (
              <div className="flex items-center gap-3 text-neutral-300">
                <Globe className="w-5 h-5 text-cyan-400 shrink-0" />
                <a href={venue.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                  Visit Website
                </a>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-2 border-b border-neutral-800 pb-2">About</h3>
            <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
              {venue.description || "A premier destination in downtown London."}
            </p>
          </div>

          {/* Active Promotions */}
          {promos.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3 border-b border-neutral-800 pb-2">Active Offers</h3>
              <div className="flex flex-col gap-3">
                {promos.map((promo) => (
                  <details key={promo.id} className="group bg-neutral-800 border border-purple-500/30 rounded-xl overflow-hidden">
                    <summary className="list-none cursor-pointer bg-gradient-to-r from-purple-900/40 to-cyan-900/40 p-4 text-sm font-bold text-purple-300 hover:text-white transition-colors flex items-center justify-between outline-none">
                      <div className="flex items-center gap-2">
                        <span>🎁</span> {promo.discount_value}
                      </div>
                      <span className="text-xs bg-purple-500 text-white px-3 py-1 rounded-full group-open:hidden shadow-lg shadow-purple-500/50">Redeem</span>
                    </summary>
                    <div className="p-4 bg-neutral-900/50 animate-in fade-in slide-in-from-top-2 duration-300">
                      <SecureQR 
                        promotionId={promo.id}
                        venueName={venue.name}
                        discountValue={promo.discount_value}
                        title={promo.title}
                      />
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2">
            <button 
              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).requestSafeWalk) {
                  (window as any).requestSafeWalk(venue.lng, venue.lat);
                  onClose();
                }
              }}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-purple-500/25 active:scale-[0.98]"
            >
              <Shield className="w-5 h-5" />
              Request SafeWalk Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
