'use client';

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

interface SafeWalkModalProps {
  onStart: (durationMinutes: number) => void;
  onCancel: () => void;
}

export default function SafeWalkModal({ onStart, onCancel }: SafeWalkModalProps) {
  const [selectedMins, setSelectedMins] = useState<number | null>(null);

  const playTestSound = () => {
    if (Capacitor.isNativePlatform()) {
      NativeAudio.preload({
        assetId: 'safewalk_test',
        assetPath: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
        isUrl: true,
        volume: 1.0,
      }).then(() => {
        NativeAudio.play({ assetId: 'safewalk_test' }).catch(e => console.error(e));
      }).catch(e => console.error("NativeAudio preload test err:", e));
      return;
    }

    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Slide up
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.error("Audio playback failed", err);
    }
  };

  const handleSelectDuration = (mins: number) => {
    setSelectedMins(mins);
    playTestSound();
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 p-6 space-y-6">
        
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-400 border border-emerald-900/50">
            <span className="text-3xl">{selectedMins ? '🔊' : '🛡️'}</span>
          </div>
          <h2 className="text-xl font-bold text-white">{selectedMins ? 'Sound Check' : 'SafeWalk Timer'}</h2>
          <p className="text-sm text-neutral-400">
            {selectedMins 
              ? "Your phone must be able to sound an alarm if you don't check in." 
              : "Protecting your privacy is our priority. No registration is required to use SafeWalk."}
          </p>
        </div>

        {!selectedMins ? (
          <>
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700 space-y-2">
              <h3 className="text-emerald-400 font-bold text-sm uppercase tracking-widest">How It Works</h3>
              <p className="text-xs text-neutral-300">
                1. Select a time limit for your trip.
              </p>
              <p className="text-xs text-neutral-300">
                2. If you don&apos;t tap &quot;I&apos;m Safe&quot; before the timer runs out, your phone will sound an alarm.
              </p>
              <p className="text-xs text-neutral-300">
                3. If the alarm isn&apos;t disabled, an SOS pin is anonymously dropped on the Crisis Cloud with your live GPS location for DTL Street Liaisons.
              </p>
            </div>

            <div>
              <h3 className="text-sm text-neutral-400 uppercase tracking-widest font-bold mb-3 text-center">Select Duration</h3>
              <div className="grid grid-cols-3 gap-3">
                {[5, 10, 15].map((mins) => (
                  <button 
                    key={mins}
                    onClick={() => handleSelectDuration(mins)}
                    className="py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl border border-neutral-700 transition-colors flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-2xl">{mins}</span>
                    <span className="text-xs text-neutral-500 uppercase">Min</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 space-y-3">
              <button 
                onClick={onCancel}
                className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl border border-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <a href="tel:911" className="flex items-center justify-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors py-1">
                <span>🚨</span>
                <span>In danger right now? Call 911</span>
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="bg-amber-900/30 border border-amber-900/50 p-4 rounded-xl mb-4 text-center">
              <p className="text-amber-400 font-bold mb-2">Did you hear the beep?</p>
              <p className="text-xs text-amber-200/70">If not, please flip your silent switch and turn your media volume up.</p>
            </div>

            <button 
              onClick={() => onStart(selectedMins)}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-colors text-lg"
            >
              Yes, Start SafeWalk
            </button>

            <div className="flex gap-2">
              <button 
                onClick={playTestSound}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-cyan-400 font-bold rounded-xl border border-neutral-700 transition-colors"
              >
                Try Again
              </button>
              <button 
                onClick={onCancel}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl border border-neutral-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
