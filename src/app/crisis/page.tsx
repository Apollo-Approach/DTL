'use client';

import React, { useState, useEffect } from 'react';
import MapWrapper from '@/components/MapWrapper';
import { createClient } from '@/lib/supabase/client';

export default function CrisisCloudPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  
  const [venues, setVenues] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    if (unlocked) {
      Promise.all([
        supabase.from('venues_public').select('*'),
        supabase.from('safety_incidents_public').select('*').neq('status', 'RESOLVED'),
      ]).then(([venuesRes, incidentsRes]) => {
        setVenues(venuesRes.data || []);
        setIncidents(incidentsRes.data || []);
      });
    }
  }, [unlocked]);

  const handlePinInput = (num: string) => {
    const newPin = pin + num;
    setPin(newPin);
    if (newPin.length === 4) {
      if (newPin === '1234') { // Mock PIN for demo
        setUnlocked(true);
      } else {
        setTimeout(() => setPin(''), 500); // Reset on error
      }
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-900/50">
            <span className="text-3xl">🛡️</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Crisis Cloud</h1>
          <p className="text-neutral-500 text-sm mb-8 text-center">Authorized Personnel Only</p>
          
          {/* PIN INDICATORS */}
          <div className="flex gap-4 mb-10">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors duration-200 ${i < pin.length ? 'bg-cyan-500 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'border-neutral-700 bg-transparent'}`} />
            ))}
          </div>

          {/* KEYPAD */}
          <div className="grid grid-cols-3 gap-4 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((num) => (
              <button
                key={num}
                onClick={() => {
                  if (num === 'C') setPin('');
                  else if (num === '⌫') setPin(pin.slice(0, -1));
                  else if (pin.length < 4) handlePinInput(num.toString());
                }}
                className="h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white font-bold text-xl transition-colors border border-neutral-700/50"
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col w-full h-full">
      {/* Header */}
      <div className="bg-red-950/40 border-b border-red-900/50 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <h1 className="text-red-400 font-black tracking-widest uppercase text-lg">Crisis Cloud</h1>
        </div>
        <button onClick={() => {setUnlocked(false); setPin('');}} className="text-sm text-neutral-400 hover:text-white border border-neutral-700 px-3 py-1 rounded">Lock</button>
      </div>
      
      {/* Map Content */}
      <div className="flex-1 p-2">
        <MapWrapper venues={venues} incidents={incidents} events={[]} mode="crisis" />
      </div>
    </div>
  );
}
