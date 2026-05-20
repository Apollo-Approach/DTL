// src/components/map/MapFilterBar.tsx
'use client';

import React from 'react';
import { Search, Calendar } from 'lucide-react';
import { Preferences } from '@/types';

interface LayerToggles {
  transit: boolean;
  incidents: boolean;
  retail: boolean;
  parking: boolean;
  events: boolean;
  specials: boolean;
  construction: boolean;
}

interface MapFilterBarProps {
  layerToggles: LayerToggles;
  setLayerToggles: React.Dispatch<React.SetStateAction<LayerToggles>>;
  activeFilter: string | null;
  setActiveFilter: React.Dispatch<React.SetStateAction<string | null>>;
  forYou: boolean;
  setForYou: React.Dispatch<React.SetStateAction<boolean>>;
  preferences: Preferences | null;
  mode: 'public' | 'crisis';
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  dateFilter: string;
  setDateFilter: React.Dispatch<React.SetStateAction<string>>;
  userRole?: string;
}

export default function MapFilterBar({
  layerToggles, setLayerToggles,
  activeFilter, setActiveFilter,
  forYou, setForYou,
  preferences, mode,
  searchQuery, setSearchQuery,
  dateFilter, setDateFilter,
  userRole = 'citizen',
}: MapFilterBarProps) {

  /**
   * Toggle a category filter. Acts as a radio button group:
   * - If already active → deselect (hide retail layer)
   * - If different or off → select (show retail layer, apply category filter)
   */
  const toggleCategory = (category: string) => {
    if (activeFilter === category) {
      // Deselect — hide retail buildings
      setActiveFilter(null);
      setLayerToggles(prev => ({ ...prev, retail: false }));
    } else {
      // Select — show retail buildings filtered to this category
      setActiveFilter(category);
      setLayerToggles(prev => ({ ...prev, retail: true }));
    }
  };

  return (
    <>
      {/* NEON BUBBLES (Instagram Stories Style Map Filters) */}
      <div className="w-full min-w-0 overflow-hidden">
        <h3 className="text-xs text-neutral-400 uppercase tracking-widest font-bold mb-3 px-1">Map Filters</h3>
        
        {/* Wrapper for mask fade-out effect */}
        <div className="relative w-full [mask-image:linear-gradient(to_right,transparent_0%,black_5%,black_95%,transparent_100%)]">
          <div className="flex overflow-x-auto flex-nowrap gap-3 pb-4 px-4 snap-x snap-mandatory scrollbar-hide items-start">
            
          {/* Marketing Bubbles (Hidden for M-Tier Mods to reduce cognitive load) */}
          {!userRole.startsWith('m') && (
            <>
            </>
          )}

          {mode === 'public' && (
            <>
              {/* Bars Bubble */}
              <button 
                onClick={() => toggleCategory('Nightlife')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeFilter === 'Nightlife' ? 'bg-fuchsia-900/50 border-[3px] border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🪩
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Nightlife' ? 'text-fuchsia-400' : 'text-neutral-500'}`}>Bars</span>
              </button>

              {/* Eats Bubble */}
              <button 
                onClick={() => toggleCategory('Eatery')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeFilter === 'Eatery' ? 'bg-amber-900/50 border-[3px] border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🍔
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Eatery' ? 'text-amber-400' : 'text-neutral-500'}`}>Eats</span>
              </button>

              {/* Stages Bubble */}
              <button 
                onClick={() => toggleCategory('Stage')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeFilter === 'Stage' ? 'bg-yellow-900/50 border-[3px] border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🎭
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Stage' ? 'text-yellow-400' : 'text-neutral-500'}`}>Stages</span>
              </button>

              {/* Events Sub-Filter Bubble — filters selected venue type to only those with events */}
              <button 
                onClick={() => setLayerToggles(prev => ({ ...prev, events: !prev.events }))} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${layerToggles.events ? 'bg-pink-900/50 border-[3px] border-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🎫
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.events ? 'text-pink-400' : 'text-neutral-500'}`}>Events</span>
              </button>

              {/* For You Bubble */}
              {preferences && (
                <button 
                  onClick={() => setForYou(!forYou)} 
                  className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${forYou ? 'bg-cyan-900/50 border-[3px] border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                    🎯
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${forYou ? 'text-cyan-400' : 'text-neutral-500'}`}>For You</span>
                </button>
              )}
            </>
          )}

          {/* Parking Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, parking: !prev.parking }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${layerToggles.parking ? 'bg-blue-900/50 border-[3px] border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🅿️
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.parking ? 'text-blue-400' : 'text-neutral-500'}`}>Parking</span>
          </button>

          {/* Transit Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, transit: !prev.transit }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${layerToggles.transit ? 'bg-emerald-900/50 border-[3px] border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🚌
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.transit ? 'text-emerald-400' : 'text-neutral-500'}`}>Transit</span>
          </button>

          {/* Construction Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, construction: !prev.construction }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${layerToggles.construction ? 'bg-orange-900/50 border-[3px] border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🚧
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.construction ? 'text-orange-400' : 'text-neutral-500'}`}>Road Work</span>
          </button>

          {/* Mod Pins Bubble (Visible to all M-Tiers) */}
          {userRole.startsWith('m') && (
            <button 
              onClick={() => setLayerToggles(prev => ({ ...prev, incidents: !prev.incidents }))} 
              className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${layerToggles.incidents ? 'bg-red-900/50 border-[3px] border-red-400 shadow-[0_0_15px_rgba(248,113,113,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                🚨
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.incidents ? 'text-red-400' : 'text-neutral-500'}`}>Alerts</span>
            </button>
          )}

          </div>
        </div>
      </div>

      {/* SEARCH & CALENDAR HAVE BEEN MOVED TO A SEPARATE PAGE */}
    </>
  );
}
