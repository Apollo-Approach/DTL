'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { NativeAudio } from '@capacitor-community/native-audio';

interface SafeWalkOverlayProps {
  expiresAt: number;
  onSafe: () => void;
  onExtend: (minutes: number) => void;
}

export default function SafeWalkOverlay({ expiresAt, onSafe, onExtend }: SafeWalkOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(() => expiresAt - Date.now());
  const [isWarning, setIsWarning] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = React.useMemo(() => createClient(), []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeAudio.preload({
        assetId: 'safewalk_alarm',
        assetPath: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
        isUrl: true,
        volume: 1.0,
      }).catch(e => console.error("NativeAudio preload err:", e));
    } else {
      audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
      audioRef.current.loop = true;
    }
    
    return () => {
      if (Capacitor.isNativePlatform()) {
        NativeAudio.stop({ assetId: 'safewalk_alarm' }).catch(() => {});
        NativeAudio.unload({ assetId: 'safewalk_alarm' }).catch(() => {});
      } else if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const dispatchSOS = React.useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      NativeAudio.stop({ assetId: 'safewalk_alarm' }).catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    
    try {
      const sendSOS = async (lat: number, lng: number) => {
        const { error } = await supabase.rpc('insert_safety_incident', {
          p_type: 'SAFEWALK_SOS',
          p_description: 'Automatic SafeWalk Dispatch',
          p_lng: lng,
          p_lat: lat,
        });
        if (error) console.error("SOS Dispatch failed to insert:", error);
        setDispatched(true);
      };

      const handleFallback = () => {
        alert('SafeWalk expired, but location access was denied. Unable to dispatch SOS.');
        setDispatched(true);
      };

      if (Capacitor.isNativePlatform()) {
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          await sendSOS(pos.coords.latitude, pos.coords.longitude);
        } catch (e) {
          console.error("Native Geolocation failed:", e);
          handleFallback();
        }
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => sendSOS(pos.coords.latitude, pos.coords.longitude),
          err => {
            console.error("Web Geolocation failed:", err);
            handleFallback();
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    } catch (e) {
      console.error("SOS Dispatch error:", e);
      setDispatched(true);
    }
  }, [supabase]);

  useEffect(() => {
    if (dispatched) return;

    const interval = setInterval(() => {
      const remaining = expiresAt - Date.now();
      setTimeLeft(remaining);

      // Warning Phase (<= 30 seconds)
      if (remaining <= 30000 && remaining > 0) {
        if (!isWarning) {
            setIsWarning(true);
            if (Capacitor.isNativePlatform()) {
              NativeAudio.loop({ assetId: 'safewalk_alarm' }).catch(e => console.error(e));
            } else {
              if (audioRef.current && audioRef.current.paused) {
                audioRef.current.play().catch(e => console.error('Audio play blocked:', e));
              }
            }
        }
      } else {
        if (isWarning) {
            setIsWarning(false);
            if (Capacitor.isNativePlatform()) {
              NativeAudio.stop({ assetId: 'safewalk_alarm' }).catch(() => {});
            } else {
              if (audioRef.current && !audioRef.current.paused) {
                audioRef.current.pause();
              }
            }
        }
      }

      // Dispatch Phase (<= 0 seconds)
      if (remaining <= 0 && !isDispatching && !dispatched) {
        setIsDispatching(true);
        clearInterval(interval);
        dispatchSOS();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, dispatched, isDispatching, isWarning, supabase, dispatchSOS]);


  if (dispatched) {
    return (
      <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-500">
        <div className="bg-red-950 border-2 border-red-600 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-4">
          <span className="text-6xl animate-pulse">🚨</span>
          <h2 className="text-2xl font-black text-red-500 uppercase tracking-widest">SOS Dispatched</h2>
          <p className="text-red-200">
            DTL Street Liaisons have been alerted to your last known location. Help is on the way.
          </p>
          <button 
            onClick={onSafe}
            className="mt-6 px-6 py-3 bg-red-900 hover:bg-red-800 text-white font-bold rounded-xl border border-red-700 transition-colors"
          >
            I am Safe Now (Dismiss)
          </button>
        </div>
      </div>
    );
  }

  // Format time (MM:SS)
  const totalSeconds = Math.max(0, Math.floor(timeLeft / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <>
      {isWarning && (
        <div className="absolute inset-0 z-[55] pointer-events-none bg-red-600/20 animate-pulse duration-500" />
      )}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-3">
        {/* The Pill */}
        <div className={`
          flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl border-2 backdrop-blur-md transition-colors duration-300
          ${isWarning ? 'bg-red-950/90 border-red-500' : 'bg-emerald-950/90 border-emerald-500'}
        `}>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">SafeWalk</span>
            <span className={`text-3xl font-black tabular-nums tracking-tight ${isWarning ? 'text-red-400' : 'text-emerald-400'}`}>
              {timeStr}
            </span>
          </div>
          
          <div className="w-px h-10 bg-neutral-700 mx-2" />
          
          <button 
            onClick={() => onExtend(5)}
            className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold transition-transform active:scale-95"
            aria-label="Add 5 minutes"
          >
            <span className="text-xs">+5m</span>
          </button>
        </div>
        
        {/* Cancel Button */}
        <button 
          onClick={() => {
            if (Capacitor.isNativePlatform()) {
              NativeAudio.stop({ assetId: 'safewalk_alarm' }).catch(() => {});
            } else if (audioRef.current) {
              audioRef.current.pause();
            }
            onSafe();
          }}
          className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg rounded-full shadow-xl shadow-emerald-900/50 transition-transform active:scale-95"
        >
          I&apos;m Safe
        </button>
      </div>
    </>
  );
}
