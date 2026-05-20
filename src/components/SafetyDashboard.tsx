// src/components/SafetyDashboard.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import SafeWalkModal from '@/components/map/SafeWalkModal';
import SafeWalkOverlay from '@/components/map/SafeWalkOverlay';
import { Shield, AlertTriangle, MapPin, Phone } from 'lucide-react';

// ─── Advisory Ticker (relocated from SafetyTicker.tsx) ───
function AdvisoryFeed() {
  const [advisories, setAdvisories] = useState<{title: string}[]>([]);

  useEffect(() => {
    fetch('/api/safety/advisories')
      .then(res => res.json())
      .then(data => setAdvisories(data.advisories || []))
      .catch(err => console.error(err));
  }, []);

  if (advisories.length === 0) return null;

  return (
    <div className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl overflow-hidden relative">
      <div className="flex items-center">
        <div className="flex-shrink-0 font-bold text-[10px] uppercase tracking-widest px-4 py-2 flex items-center gap-2 border-r border-neutral-700 bg-neutral-800/80 text-neutral-400 z-20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Advisories
        </div>
        <div className="flex-1 overflow-hidden relative flex items-center py-2">
          <div className="whitespace-nowrap animate-[marquee_25s_linear_infinite] text-xs font-medium text-neutral-300">
            {advisories.map((adv, idx) => (
              <span key={idx} className="mx-8">
                {adv.title}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}} />
    </div>
  );
}

// ─── Panic Button Dialog ───
function PanicDialog({ onClose }: { onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const supabase = React.useMemo(() => createClient(), []);

  const handleConfirm = async () => {
    setConfirmed(true);
    
    // Drop pin at current location
    try {
      const getPosition = (): Promise<GeolocationPosition> => 
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });

      const pos = await getPosition();
      await supabase.rpc('insert_safety_incident', {
        p_type: 'PANIC_ALARM',
        p_description: 'Panic button activated',
        p_lng: pos.coords.longitude,
        p_lat: pos.coords.latitude,
      });
    } catch (err) {
      console.error('Panic pin drop failed:', err);
    }

    // Prompt 911 call
    setTimeout(() => {
      window.location.href = 'tel:911';
    }, 500);
  };

  if (confirmed) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
        <div className="bg-neutral-900 border-2 border-red-600 rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center space-y-4">
          <span className="text-5xl">📍</span>
          <h2 className="text-xl font-black text-red-400 uppercase tracking-wide">Pin Dropped</h2>
          <p className="text-neutral-300 text-sm">
            Your location has been marked. Connecting you to 911...
          </p>
          <button 
            onClick={onClose}
            className="mt-4 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl border border-neutral-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center border border-red-900/50">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Are you sure?</h2>
            <p className="text-sm text-neutral-400">
              This will drop a pin at your location and prompt you to call 911.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleConfirm}
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl shadow-lg transition-colors text-lg"
            >
              Yes — I Need Help
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl border border-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Safety Dashboard ───
export default function SafetyDashboard() {
  const [activePanel, setActivePanel] = useState<'none' | 'safewalk' | 'panic'>('none');
  const [safeWalkExpiresAt, setSafeWalkExpiresAt] = useState<number | null>(null);

  // If SafeWalk is actively running, show the overlay anywhere on the page
  const safeWalkActive = safeWalkExpiresAt !== null;

  const handleSafeWalkStart = useCallback((mins: number) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(() => {
        setSafeWalkExpiresAt(Date.now() + mins * 60000);
        setActivePanel('none');
      }, () => {
        alert('SafeWalk requires Location Access. Please enable it in your browser settings.');
      });
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  }, []);

  return (
    <>
      {/* SafeWalk Overlay (fixed position, renders on top of everything when active) */}
      {safeWalkActive && (
        <div className="fixed inset-0 z-[70] pointer-events-none">
          <div className="pointer-events-auto">
            <SafeWalkOverlay
              expiresAt={safeWalkExpiresAt}
              onSafe={() => setSafeWalkExpiresAt(null)}
              onExtend={(mins) => setSafeWalkExpiresAt(prev => (prev ? prev + mins * 60000 : null))}
            />
          </div>
        </div>
      )}

      {/* SafeWalk Setup Modal */}
      {activePanel === 'safewalk' && (
        <div className="fixed inset-0 z-[80]">
          <SafeWalkModal
            onCancel={() => setActivePanel('none')}
            onStart={handleSafeWalkStart}
          />
        </div>
      )}

      {/* Panic Dialog */}
      {activePanel === 'panic' && (
        <PanicDialog onClose={() => setActivePanel('none')} />
      )}

      {/* The Dashboard Panel */}
      <section className="w-full">
        <div className="bg-neutral-900/80 border border-neutral-700 rounded-2xl overflow-hidden shadow-2xl">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-neutral-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Safety & Moderation</h3>
              <p className="text-neutral-500 text-xs">Your tools for a safer night out</p>
            </div>
          </div>

          {/* Advisory Feed */}
          <div className="px-4 pt-4">
            <AdvisoryFeed />
          </div>

          {/* Triangle Button Layout */}
          <div className="p-6">
            <div className="flex flex-col items-center gap-4">
              
              {/* Top: Request Mod (most prominent) */}
              <button
                onClick={() => {
                  // Dispatch a custom event to put the map into pin mode
                  window.dispatchEvent(new CustomEvent('dtl:toggle-pin-mode'));
                }}
                className="w-full max-w-xs py-5 px-6 bg-gradient-to-br from-neutral-800 to-neutral-900 hover:from-neutral-700 hover:to-neutral-800 text-white font-bold rounded-2xl border border-neutral-600 hover:border-neutral-500 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 group"
              >
                <div className="w-10 h-10 bg-cyan-900/40 rounded-xl flex items-center justify-center border border-cyan-800/50 group-hover:bg-cyan-900/60 transition-colors">
                  <MapPin className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="text-left">
                  <span className="block text-base font-extrabold">Request Moderator</span>
                  <span className="block text-[11px] text-neutral-400 font-medium">Drop a pin for street liaison dispatch</span>
                </div>
              </button>

              {/* Bottom Row: SafeWalk + Panic */}
              <div className="flex gap-4 w-full max-w-xs">
                
                {/* SafeWalk */}
                <button
                  onClick={() => setActivePanel('safewalk')}
                  disabled={safeWalkActive}
                  className={`flex-1 py-4 px-4 rounded-2xl border transition-all shadow-lg active:scale-[0.98] flex flex-col items-center gap-2 ${
                    safeWalkActive
                      ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400 cursor-default'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 hover:border-emerald-700 text-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                    safeWalkActive 
                      ? 'bg-emerald-900/40 border-emerald-700' 
                      : 'bg-emerald-900/20 border-emerald-900/40 group-hover:bg-emerald-900/40'
                  }`}>
                    <Shield className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {safeWalkActive ? 'Active' : 'SafeWalk'}
                  </span>
                </button>

                {/* Panic */}
                <button
                  onClick={() => setActivePanel('panic')}
                  className="flex-1 py-4 px-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl border border-neutral-700 hover:border-red-700 transition-all shadow-lg active:scale-[0.98] flex flex-col items-center gap-2"
                >
                  <div className="w-10 h-10 bg-red-900/20 rounded-xl flex items-center justify-center border border-red-900/40">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide">Panic</span>
                </button>
              </div>

              {/* 911 link — always visible */}
              <a 
                href="tel:911" 
                className="mt-1 flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors"
              >
                <Phone className="w-3 h-3" />
                <span>In a violent emergency, always call 911</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
