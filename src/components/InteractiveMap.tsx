// src/components/InteractiveMap.tsx
'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { calculateMatchScore } from '@/lib/matchScore';
import { Session } from '@supabase/supabase-js';
import { Venue, Event, SafetyIncident, Preferences, Promotion } from '@/types';
import { BusState, getBusPolygon, getOccupancyText, getOccupancyColor, getStatusText, getDirectionText, escapeHtml, VENUE_CATEGORIES, CATEGORY_COLORS, getVenueCategory, sanitizeUrl } from './map/mapHelpers';
import { initBuildingExtrusions, matchVenuesToBuildings, startShimmerAnimation, stopShimmerAnimation, destroyBuildingExtrusions } from './map/buildingExtrusions';
import { useVenueMarkers } from './map/hooks/useVenueMarkers';
import { useEventMarkers } from './map/hooks/useEventMarkers';
import { useIncidentMarkers } from './map/hooks/useIncidentMarkers';
import { useConstructionMarkers } from './map/hooks/useConstructionMarkers';
import { useMapInit } from './map/hooks/useMapInit';
import MapFilterBar from './map/MapFilterBar';
import ModPinModal from './map/ModPinModal';
import IncidentActionPanel from './crisis/IncidentActionPanel';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

interface InteractiveMapProps {
  venues: Venue[]; 
  incidents: SafetyIncident[];
  events?: Event[];
  promos?: Promotion[];
  preferences?: Preferences | null;
  mode?: 'public' | 'crisis';
}

export default function InteractiveMap({ venues = [], incidents = [], events = [], promos = [], preferences = null, mode = 'public' }: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  
  // SafeWalk State

  
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const busStateRef = useRef<{ [id: string]: BusState }>({});
  
  // Auth & UI State
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string>('citizen');
  
  // Crisis Cloud State
  const [selectedIncident, setSelectedIncident] = useState<SafetyIncident | null>(null);
  const [localIncidentUpdates, setLocalIncidentUpdates] = useState<Record<string, SafetyIncident>>({});

  // Map Decluttering Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(['Eatery', 'Bars', 'Stage']));
  const [forYou, setForYou] = useState(false);

  // Helper: toggle a venue category in the active set
  const toggleCategory = useCallback((cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | 'all'>('24h');
  const [layerToggles, setLayerToggles] = useState({
    transit: true,
    incidents: true,
    retail: false,
    parking: false,
    events: true,
    specials: false,
    construction: false
  });

  // Construction advisory data
  const [constructionProjects, setConstructionProjects] = useState<{id: string; title: string; description: string; impacts: string[]; location: string; source: string}[]>([]);

  // Transit route alerts (route_id → alert summaries)
  const routeAlertsRef = useRef<Record<string, string[]>>({});

  const [isPinMode, setIsPinMode] = useState(false);
  const pinModeRef = useRef(false);

  // Mod Pin Submission State
  const [pendingPinLocation, setPendingPinLocation] = useState<{lng: number, lat: number} | null>(null);
  const [pinCategory, setPinCategory] = useState<string>('');
  const [pinDescription, setPinDescription] = useState<string>('');

  const togglePinMode = useCallback(async () => {
    if (!session || session.user.is_anonymous) {
      alert("You must be logged in to report an incident.");
      return;
    }
    
    try {
      if (Capacitor.isNativePlatform()) {
        const permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
          const request = await Geolocation.requestPermissions();
          if (request.location !== 'granted') {
            alert("Location Services must be enabled to report an incident.");
            return;
          }
        }
        await Geolocation.getCurrentPosition();
      } else {
        if (!('geolocation' in navigator)) {
          alert("Geolocation is not supported by your browser.");
          return;
        }
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
      }
      
      const newState = !pinModeRef.current;
      pinModeRef.current = newState;
      setIsPinMode(newState);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = newState ? 'crosshair' : '';
      }
    } catch (err) {
      alert("Location Services must be enabled to report an incident. Please enable them and try again.");
    }
  }, [session]);

  // 0. Initialize Auth State
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously();
      } else {
        setSession(session);
        if (!session.user.is_anonymous) {
          const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
          if (data) setUserRole(data.role);
        }
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session && !session.user.is_anonymous) {
        const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (data) setUserRole(data.role);
      } else {
        setUserRole('citizen');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  // Listen for pin mode toggle from SafetyDashboard
  useEffect(() => {
    const handler = () => togglePinMode();
    window.addEventListener('dtl:toggle-pin-mode', handler);
    return () => window.removeEventListener('dtl:toggle-pin-mode', handler);
  }, [togglePinMode]);

  useMapInit({
    mapContainerRef,
    mapRef,
    busStateRef,
    routeAlertsRef,
    setConstructionProjects,
    pinModeRef,
    setIsPinMode,
    setPendingPinLocation,
    setPinCategory,
    setPinDescription
  });

  useVenueMarkers(mapRef, venues, promos, events, searchQuery, forYou, preferences, activeCategories, false);
  useEventMarkers(mapRef, events, searchQuery, dateFilter, layerToggles, preferences);
  useIncidentMarkers(mapRef, incidents, localIncidentUpdates, layerToggles, userRole, timeFilter, mode, setSelectedIncident);
  useConstructionMarkers(mapRef, constructionProjects, layerToggles);


  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    // Toggle Transit
    if (map.getLayer('bus-body-extrusion')) {
      map.setLayoutProperty('bus-body-extrusion', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('bus-roof-label', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('bus-congestion-glow', 'visibility', layerToggles.transit ? 'visible' : 'none');
      map.setLayoutProperty('ltc-shapes-layer', 'visibility', layerToggles.transit ? 'visible' : 'none');
    }

    // Toggle Parking
    if (map.getLayer('on-street-parking-layer')) {
      map.setLayoutProperty('on-street-parking-layer', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-extrusion', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-outline-glow', 'visibility', layerToggles.parking ? 'visible' : 'none');
      map.setLayoutProperty('parking-icons', 'visibility', layerToggles.parking ? 'visible' : 'none');
    }
  }, [layerToggles]);

  // 3. Supabase Realtime Subscription
  useEffect(() => {
    const channel = supabase.channel('realtime-safety')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'safety_incidents' },
        (payload) => {
          console.log('Realtime Safety Incident Update:', payload);
          // Seamlessly trigger a Server Component background refetch!
          // This queries the new PostGIS lat/lng from our View and pushes it to our props.
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  // 4. Supabase Realtime Responder Presence
  const [broadcastLocation, setBroadcastLocation] = useState(false); // Default off until they opt in
  const [responderLocations, setResponderLocations] = useState<Record<string, {lat: number, lng: number, role: string, timestamp: number}>>({});

  useEffect(() => {
    // All M-tier roles can participate in presence (M1-M5)
    const canBroadcast = ['m1_observer', 'm2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'].includes(userRole);
    // Only M3+ can SEE all other responders
    const canViewAll = ['m3_admin', 'm4_police', 'm5_sysadmin'].includes(userRole);

    if (!canBroadcast) return;

    const presenceChannel = supabase.channel('realtime-responders', {
      config: { presence: { key: session?.user?.id || 'unknown' } }
    });

    presenceChannel.on('presence', { event: 'sync' }, () => {
      if (!canViewAll) return; // M1/M2 broadcast but don't see others
      const state = presenceChannel.presenceState();
      const STALE_MS = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      const newLocations: Record<string, { timestamp: number; lat: number; lng: number; role: string }> = {};
      Object.keys(state).forEach(key => {
        if (state[key] && state[key].length > 0) {
          const entry = state[key][0] as { timestamp?: number; lat?: number; lng?: number; role?: string };
          // Prune stale presence (>5 min old)
          if (entry.timestamp && entry.lat && entry.lng && entry.role) {
            if ((now - entry.timestamp) > STALE_MS) return;
            newLocations[key] = {
              timestamp: entry.timestamp,
              lat: entry.lat,
              lng: entry.lng,
              role: entry.role
            };
          }
        }
      });
      setResponderLocations(newLocations);
    }).subscribe();

    let watchId: number;
    if (broadcastLocation && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        presenceChannel.track({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          role: userRole,
          timestamp: Date.now()
        });
      }, (err) => console.error("Geolocation watch error:", err), { enableHighAccuracy: true });
    } else {
      // Untrack if they toggle it off while channel is active
      if (presenceChannel.state === 'joined') {
        presenceChannel.untrack();
      }
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      supabase.removeChannel(presenceChannel);
    };
  }, [supabase, userRole, broadcastLocation, session]);

  // 5. Render Responder Markers (differentiated by M-tier)
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Cleanup old responder markers
    const mapExt = mapRef.current as maplibregl.Map & { _responderMarkers?: maplibregl.Marker[] };
    if (mapExt._responderMarkers) {
      mapExt._responderMarkers.forEach(m => m.remove());
    }
    const markers: maplibregl.Marker[] = [];

    const ROLE_CONFIG: Record<string, { bg: string; border: string; icon: string; label: string }> = {
      'm1_observer': { bg: '#64748b', border: '#94a3b8', icon: '👁️', label: 'Observer' },
      'm2_responder': { bg: '#0891b2', border: '#22d3ee', icon: '🛡️', label: 'Responder' },
      'm3_admin': { bg: '#6366f1', border: '#a5b4fc', icon: '⚡', label: 'Admin' },
      'm4_police': { bg: '#2563eb', border: '#93c5fd', icon: '👮', label: 'Liaison' },
      'm5_sysadmin': { bg: '#dc2626', border: '#fca5a5', icon: '💻', label: 'Sysadmin' },
    };

    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();

    Object.entries(responderLocations).forEach(([uid, data]) => {
      // Don't render ourselves (the map's native GeolocateControl handles our blue dot)
      if (uid === session?.user?.id) return;
      
      const config = ROLE_CONFIG[data.role] || ROLE_CONFIG['m2_responder'];
      const isStale = data.timestamp && (now - data.timestamp) > STALE_MS;
      
      const el = document.createElement('div');
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background: ${config.bg}; border: 3px solid ${config.border};
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; box-shadow: 0 0 12px ${config.bg}88;
        opacity: ${isStale ? '0.35' : '0.9'};
        transition: opacity 0.3s;
      `;
      el.innerText = config.icon;
      
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([data.lng, data.lat])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
          `<div style="color:black;font-size:12px;padding:4px;">
            <strong>${config.icon} ${config.label}</strong>
            ${isStale ? '<br/><span style="color:orange;font-size:10px;">⚠ Stale signal</span>' : ''}
          </div>`
        ))
        .addTo(mapRef.current!);
      
      markers.push(marker);
    });

    mapExt._responderMarkers = markers;
  }, [responderLocations, session]);

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <MapFilterBar
        layerToggles={layerToggles}
        setLayerToggles={setLayerToggles}
        activeCategories={activeCategories}
        toggleCategory={toggleCategory}
        forYou={forYou}
        setForYou={setForYou}
        preferences={preferences}
        mode={mode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        userRole={userRole}
      />

      {/* MOD BROADCAST TOGGLE (Responders only) */}
      {session && !session.user.is_anonymous && ['m1_observer', 'm2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'].includes(userRole) && (
        <div className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-700 rounded-xl">
          <div>
            <h4 className="text-white font-bold text-sm">Broadcast Location</h4>
            <p className="text-xs text-neutral-400">Share your live GPS with other Responders</p>
          </div>
          <button 
            onClick={() => setBroadcastLocation(!broadcastLocation)}
            className={`w-12 h-6 rounded-full transition-colors relative ${broadcastLocation ? 'bg-indigo-500' : 'bg-neutral-600'}`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${broadcastLocation ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      )}

      {/* Pin Mode Indicator */}
      {isPinMode && (
        <div className="w-full py-3 px-4 bg-cyan-900/40 border border-cyan-700 rounded-xl flex items-center justify-between animate-in fade-in duration-300">
          <span className="text-cyan-300 font-bold text-sm">🎯 Tap the map to drop a pin</span>
          <button onClick={togglePinMode} className="text-xs text-cyan-400 hover:text-white font-bold px-3 py-1 bg-cyan-900/50 rounded-lg transition-colors">Cancel</button>
        </div>
      )}

      {/* THE 3D MAP */}
      <div className="relative w-full aspect-square max-h-[75vh] rounded-xl overflow-hidden border border-neutral-700 shadow-2xl z-0">
        <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />
        
        {/* MOD PIN MODAL */}
        {pendingPinLocation && (
          <ModPinModal
            pendingPinLocation={pendingPinLocation}
            setPendingPinLocation={setPendingPinLocation}
            pinCategory={pinCategory}
            setPinCategory={setPinCategory}
            pinDescription={pinDescription}
            setPinDescription={setPinDescription}
            mapRef={mapRef}
            supabase={supabase}
          />
        )}

        {/* Crisis Mode: Incident Action Panel */}
        {selectedIncident && (
          <IncidentActionPanel
            incident={localIncidentUpdates[selectedIncident.id] || selectedIncident}
            onClose={() => setSelectedIncident(null)}
            onUpdate={(updatedIncident) => {
              setLocalIncidentUpdates(prev => ({ ...prev, [updatedIncident.id]: updatedIncident }));
            }}
            userRole={userRole}
            currentUserId={session?.user?.id}
          />
        )}
      </div>
    </div>
  );
}
