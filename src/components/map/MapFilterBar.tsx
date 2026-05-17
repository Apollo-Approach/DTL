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
}

export default function MapFilterBar({
  layerToggles, setLayerToggles,
  activeFilter, setActiveFilter,
  forYou, setForYou,
  preferences, mode,
  searchQuery, setSearchQuery,
  dateFilter, setDateFilter,
}: MapFilterBarProps) {
  return (
    <>
      {/* NEON BUBBLES (Instagram Stories Style Map Filters) */}
      <div className="w-full">
        <h3 className="text-xs text-neutral-400 uppercase tracking-widest font-bold mb-3 px-1">Map Filters</h3>
        <div className="flex overflow-x-auto gap-4 pb-4 px-1 snap-x scrollbar-hide">
          
          {/* Transit Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, transit: !prev.transit }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${layerToggles.transit ? 'bg-emerald-900/50 border-[3px] border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🚌
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.transit ? 'text-emerald-400' : 'text-neutral-500'}`}>Transit</span>
          </button>

          {/* Parking Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, parking: !prev.parking }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${layerToggles.parking ? 'bg-blue-900/50 border-[3px] border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🅿️
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.parking ? 'text-blue-400' : 'text-neutral-500'}`}>Parking</span>
          </button>

          {mode === 'public' && (
            <>
              {/* For You Bubble */}
              {preferences && (
                <button 
                  onClick={() => setForYou(!forYou)} 
                  className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${forYou ? 'bg-cyan-900/50 border-[3px] border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                    🎯
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${forYou ? 'text-cyan-400' : 'text-neutral-500'}`}>For You</span>
                </button>
              )}

              {/* Nightlife Bubble */}
              <button 
                onClick={() => {
                  setLayerToggles(prev => ({ ...prev, retail: true }));
                  setActiveFilter(activeFilter === 'Nightlife' ? null : 'Nightlife');
                }} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${activeFilter === 'Nightlife' ? 'bg-fuchsia-900/50 border-[3px] border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🪩
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Nightlife' ? 'text-fuchsia-400' : 'text-neutral-500'}`}>Clubs</span>
              </button>

              {/* Eateries Bubble */}
              <button 
                onClick={() => {
                  setLayerToggles(prev => ({ ...prev, retail: true }));
                  setActiveFilter(activeFilter === 'Eatery' ? null : 'Eatery');
                }} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${activeFilter === 'Eatery' ? 'bg-amber-900/50 border-[3px] border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🍔
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Eatery' ? 'text-amber-400' : 'text-neutral-500'}`}>Eats</span>
              </button>

              {/* Stages Bubble */}
              <button 
                onClick={() => {
                  setLayerToggles(prev => ({ ...prev, retail: true }));
                  setActiveFilter(activeFilter === 'Stage' ? null : 'Stage');
                }} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${activeFilter === 'Stage' ? 'bg-yellow-900/50 border-[3px] border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🎸
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'Stage' ? 'text-yellow-400' : 'text-neutral-500'}`}>Stages</span>
              </button>

              {/* Late Night Bubble */}
              <button 
                onClick={() => {
                  setLayerToggles(prev => ({ ...prev, retail: true }));
                  setActiveFilter(activeFilter === 'LateNight' ? null : 'LateNight');
                }} 
                className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${activeFilter === 'LateNight' ? 'bg-indigo-900/50 border-[3px] border-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
                  🌙
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFilter === 'LateNight' ? 'text-indigo-400' : 'text-neutral-500'}`}>Late Night</span>
              </button>
            </>
          )}

          {/* Mod Pins Bubble */}
          <button 
            onClick={() => setLayerToggles(prev => ({ ...prev, incidents: !prev.incidents }))} 
            className={`flex flex-col items-center gap-2 min-w-[72px] shrink-0 snap-center group`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-300 ${layerToggles.incidents ? 'bg-red-900/50 border-[3px] border-red-400 shadow-[0_0_15px_rgba(248,113,113,0.5)]' : 'bg-neutral-800 border-2 border-neutral-700 opacity-50 grayscale'}`}>
              🚨
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${layerToggles.incidents ? 'text-red-400' : 'text-neutral-500'}`}>Alerts</span>
          </button>

        </div>
      </div>

      {/* SEARCH & CALENDAR */}
      {mode === 'public' && (
        <div className="w-full flex gap-2 px-1">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-neutral-500" />
            </div>
            <input
              type="text"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Search venues or events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="relative w-1/3 min-w-[120px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-neutral-500" />
            </div>
            <input
              type="date"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-3 pl-10 pr-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </div>
      )}
    </>
  );
}
