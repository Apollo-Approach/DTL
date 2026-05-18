'use client';

import React from 'react';

interface SafeWalkModalProps {
  onStart: (durationMinutes: number) => void;
  onCancel: () => void;
}

export default function SafeWalkModal({ onStart, onCancel }: SafeWalkModalProps) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-6">
        
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-400 border border-emerald-900/50">
            <span className="text-3xl">🛡️</span>
          </div>
          <h2 className="text-xl font-bold text-white">SafeWalk Timer</h2>
          <p className="text-sm text-neutral-400">
            Protecting your privacy is our priority. No registration is required to use SafeWalk.
          </p>
        </div>

        <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 space-y-2">
          <h3 className="text-emerald-400 font-bold text-sm uppercase tracking-widest">How It Works</h3>
          <p className="text-xs text-neutral-300">
            1. Select a time limit for your trip.
          </p>
          <p className="text-xs text-neutral-300">
            2. If you don't tap "I'm Safe" before the timer runs out, your phone will sound an alarm.
          </p>
          <p className="text-xs text-neutral-300">
            3. If the alarm isn't disabled, an SOS pin is anonymously dropped on the Crisis Cloud with your live GPS location for DTL Street Liaisons.
          </p>
        </div>

        <div>
          <h3 className="text-sm text-neutral-400 uppercase tracking-widest font-bold mb-3 text-center">Select Duration</h3>
          <div className="grid grid-cols-3 gap-3">
            {[5, 10, 15].map((mins) => (
              <button 
                key={mins}
                onClick={() => onStart(mins)}
                className="py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl border border-neutral-700 transition-colors flex flex-col items-center justify-center gap-1"
              >
                <span className="text-2xl">{mins}</span>
                <span className="text-xs text-neutral-500 uppercase">Min</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button 
            onClick={onCancel}
            className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl border border-neutral-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
