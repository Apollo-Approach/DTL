// src/components/map/MapFilterBar.tsx
'use client';

import React from 'react';
import { Preferences } from '@/types';

interface LayerToggles {
  transit: boolean;
  incidents: boolean;
  retail: boolean;
  parking: boolean;
  events: boolean;
  specials: boolean;
}

interface MapFilterBarProps {
  layerToggles: LayerToggles;
  setLayerToggles: React.Dispatch<React.SetStateAction<LayerToggles>>;
  activeCategories: Set<string>;
  toggleCategory: (cat: string) => void;
  forYou: boolean;
  setForYou: React.Dispatch<React.SetStateAction<boolean>>;
  preferences: Preferences | null;
  mode: 'public' | 'crisis';
  userRole?: string;
  isSearchActive: boolean;
  setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
  searchBarComponent?: React.ReactNode;
}

export default function MapFilterBar({
  layerToggles, setLayerToggles,
  activeCategories, toggleCategory,
  forYou, setForYou,
  preferences, mode,
  userRole = 'citizen',
  isSearchActive, setIsSearchActive, searchBarComponent
}: MapFilterBarProps) {

  return (
    <>
      {/* NEON BUBBLES (Instagram Stories Style Map Filters) */}
      <div className="w-full min-w-0 overflow-hidden">
        <h3 className="text-xs text-neutral-400 uppercase tracking-widest font-bold mb-3 px-1">Map Filters</h3>
        
        {/* Wrapper for mask fade-out effect */}
        <div className="relative w-full [mask-image:linear-gradient(to_right,transparent_0%,black_5%,black_95%,transparent_100%)] h-[84px]">
          
          {/* SEARCH BAR OVERLAY */}
          <div className={`absolute inset-0 px-4 z-20 flex items-start pt-1 transition-all duration-300 ease-in-out ${isSearchActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
            {searchBarComponent}
          </div>

          {/* BUBBLES TRACK */}
          <div className={`absolute inset-0 flex overflow-x-auto flex-nowrap gap-3 pb-4 px-4 snap-x snap-mandatory scrollbar-hide items-start transition-all duration-300 ease-in-out ${isSearchActive ? 'opacity-0 -translate-x-8 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
            
          {/* Marketing Bubbles (Hidden for M-Tier Mods to reduce cognitive load) */}
          {!userRole.startsWith('m') && (
            <>
            </>
          )}

          {mode === 'public' && (
            <>
              {/* Bars Bubble (multi-select) */}
              <button 
                onClick={() => toggleCategory('Bars')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeCategories.has('Bars') ? 'bg-fuchsia-900/50 border-[3px] border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🪩
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeCategories.has('Bars') ? 'text-fuchsia-400' : 'text-neutral-500'}`}>Bars</span>
              </button>

              {/* Eats Bubble (multi-select) */}
              <button 
                onClick={() => toggleCategory('Eatery')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeCategories.has('Eatery') ? 'bg-amber-900/50 border-[3px] border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🍔
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeCategories.has('Eatery') ? 'text-amber-400' : 'text-neutral-500'}`}>Eats</span>
              </button>

              {/* Stages Bubble (multi-select) */}
              <button 
                onClick={() => toggleCategory('Stage')} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${activeCategories.has('Stage') ? 'bg-yellow-900/50 border-[3px] border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🎭
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeCategories.has('Stage') ? 'text-yellow-400' : 'text-neutral-500'}`}>Stages</span>
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

          {/* Search Bubble */}
          <button 
            onClick={() => setIsSearchActive(true)} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 bg-slate-900/50 border-[3px] border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.5)]`}>
              🔍
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider text-slate-400`}>Search</span>
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
