'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SafetyIncident } from '@/types';
import { startShift, endShift, autoDispatch } from '@/app/actions/dispatch';
import { useRouter } from 'next/navigation';
import MapWrapper from '@/components/MapWrapper';
import { getCurrentUserRole } from '@/app/actions/user';
// M-Tier hierarchy for access control
const M_TIER_ROLES = ['m1_observer', 'm2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'];
const CAN_DISPATCH = ['m2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'];
const CAN_AUTO_DISPATCH = ['m3_admin', 'm4_police', 'm5_sysadmin'];

function getRoleBadge(role: string) {
  switch (role) {
    case 'm1_observer': return { label: 'M1 OBSERVER', color: 'bg-slate-600 text-slate-200', icon: '👁️' };
    case 'm2_responder': return { label: 'M2 RESPONDER', color: 'bg-cyan-700 text-cyan-100', icon: '🛡️' };
    case 'm3_admin': return { label: 'M3 ADMIN', color: 'bg-indigo-700 text-indigo-100', icon: '⚡' };
    case 'm4_police': return { label: 'M4 LIAISON', color: 'bg-blue-700 text-blue-100', icon: '👮' };
    case 'm5_sysadmin': return { label: 'M5 SYSADMIN', color: 'bg-red-700 text-red-100', icon: '💻' };
    default: return { label: 'UNKNOWN', color: 'bg-neutral-700 text-neutral-300', icon: '❓' };
  }
}

function getIncidentIcon(type: string) {
  switch (type) {
    case 'WELLNESS_CHECK': return '💛';
    case 'DE_ESCALATION': return '🤝';
    case 'MEDICAL_MINOR': return '🩹';
    case 'GENERAL_ASSIST': return '🔧';
    case 'PANIC_ALARM': return '🚨';
    default: return '⚠️';
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'REPORTED': return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    case 'DISPATCHED': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
    case 'RESOLVED': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    default: return 'bg-neutral-500/20 text-neutral-400 border-neutral-500/40';
  }
}

export default function SafetyModDashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('citizen');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Shift state
  const [onDuty, setOnDuty] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftStartedAt, setShiftStartedAt] = useState<string | null>(null);

  // Incident data
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [venues, setVenues] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState<'active' | 'resolved'>('active');

  // Dispatch state
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({ active: 0, dispatched: 0, resolved: 0, onDutyCount: 0 });

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.is_anonymous) {
        router.push('/login?next=/mod');
        return;
      }

      setUserId(session.user.id);

      const role = await getCurrentUserRole(session.user.id);

      if (!role || !M_TIER_ROLES.includes(role)) {
        router.push('/');
        return;
      }

      setUserRole(role);
      setAuthorized(true);

      // Check if user has an active shift
      const { data: activeShift } = await supabase
        .from('responder_shifts')
        .select('id, started_at')
        .eq('user_id', session.user.id)
        .is('ended_at', null)
        .limit(1);

      if (activeShift && activeShift.length > 0) {
        setOnDuty(true);
        setShiftStartedAt(activeShift[0].started_at);
      }

      setLoading(false);
    }

    checkAuth();
  }, [supabase, router]);

  // Fetch incident data
  const fetchData = useCallback(async () => {
    const [incRes, venueRes, shiftRes] = await Promise.all([
      supabase.from('safety_incidents_public').select('*'),
      supabase.from('venues_public').select('*'),
      supabase.from('responder_shifts').select('user_id').is('ended_at', null),
    ]);

    setIncidents(incRes.data || []);
    setVenues(venueRes.data || []);

    const allIncidents = incRes.data || [];
    setStats({
      active: allIncidents.filter((i: SafetyIncident) => i.status === 'REPORTED').length,
      dispatched: allIncidents.filter((i: SafetyIncident) => i.status === 'DISPATCHED').length,
      resolved: allIncidents.filter((i: SafetyIncident) => i.status === 'RESOLVED').length,
      onDutyCount: shiftRes.data?.length || 0,
    });
  }, [supabase]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [authorized, fetchData]);

  // Realtime subscription for live updates
  useEffect(() => {
    if (!authorized) return;

    const channel = supabase
      .channel('mod-safety-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_incidents' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, supabase, fetchData]);

  // Dispatch notification listener
  useEffect(() => {
    if (!userId) return;

    const dispatchCh = supabase.channel(`dispatch:${userId}`);
    dispatchCh.on('broadcast', { event: 'dispatch' }, (payload) => {
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 Dispatch Alert', {
          body: `You have been dispatched to an incident ${payload.payload?.distance || ''}m away.`,
          icon: '/favicon.ico',
          tag: 'dispatch-alert',
        });
      }

      // Audio alert
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 500);
      } catch {}

      fetchData();
    }).subscribe();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(dispatchCh);
    };
  }, [userId, supabase, fetchData]);

  // Toggle shift
  const toggleShift = async () => {
    if (!userId) return;
    setShiftLoading(true);
    try {
      if (onDuty) {
        await endShift(userId);
        setOnDuty(false);
        setShiftStartedAt(null);
      } else {
        const result = await startShift(userId);
        if (result.success) {
          setOnDuty(true);
          setShiftStartedAt(new Date().toISOString());
        }
      }
      fetchData();
    } finally {
      setShiftLoading(false);
    }
  };

  // Auto-dispatch handler
  const handleAutoDispatch = async (incident: SafetyIncident) => {
    if (!CAN_AUTO_DISPATCH.includes(userRole)) return;
    setDispatchingId(incident.id);
    try {
      const result = await autoDispatch(incident.id, incident.lat, incident.lng);
      if (!result.success) {
        alert(result.error || 'Auto-dispatch failed.');
      }
      fetchData();
    } finally {
      setDispatchingId(null);
    }
  };

  // Filter incidents by role
  const visibleIncidents = incidents.filter((inc) => {
    if (userRole === 'm1_observer') {
      return inc.type === 'PANIC_ALARM' || inc.type === 'SAFEWALK_SOS';
    }
    return true;
  });

  const activeIncidents = visibleIncidents.filter((i) => i.status !== 'RESOLVED');
  const resolvedIncidents = visibleIncidents.filter((i) => i.status === 'RESOLVED');
  const displayedIncidents = selectedTab === 'active' ? activeIncidents : resolvedIncidents;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 font-bold text-sm uppercase tracking-wider">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const badge = getRoleBadge(userRole);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* HEADER */}
      <header className="bg-neutral-950 border-b border-neutral-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase bg-gradient-to-r from-red-400 to-cyan-400 bg-clip-text text-transparent">
              Safety Mod
            </h1>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.color}`}>
              {badge.icon} {badge.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Shift Toggle */}
          <button
            onClick={toggleShift}
            disabled={shiftLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border-2 ${
              onDuty
                ? 'bg-emerald-900/40 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${onDuty ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
            {shiftLoading ? 'Updating...' : onDuty ? 'ON DUTY' : 'OFF DUTY'}
          </button>
        </div>
      </header>

      {/* STATS BAR */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-neutral-950/50">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-amber-400">{stats.active}</p>
          <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">Reported</p>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-cyan-400">{stats.dispatched}</p>
          <p className="text-[10px] font-bold text-cyan-500/80 uppercase tracking-wider">Dispatched</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-emerald-400">{stats.resolved}</p>
          <p className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider">Resolved</p>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-indigo-400">{stats.onDutyCount}</p>
          <p className="text-[10px] font-bold text-indigo-500/80 uppercase tracking-wider">On Duty</p>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* LEFT: INCIDENT QUEUE */}
        <div className="w-full lg:w-[400px] lg:min-w-[400px] border-r border-neutral-800 flex flex-col bg-neutral-950/80">
          {/* Tabs */}
          <div className="flex border-b border-neutral-800">
            <button
              onClick={() => setSelectedTab('active')}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                selectedTab === 'active'
                  ? 'text-red-400 border-b-2 border-red-500 bg-red-500/5'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Active ({activeIncidents.length})
            </button>
            <button
              onClick={() => setSelectedTab('resolved')}
              className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                selectedTab === 'resolved'
                  ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Resolved ({resolvedIncidents.length})
            </button>
          </div>

          {/* Incident List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {displayedIncidents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-600">
                <span className="text-4xl mb-3">{selectedTab === 'active' ? '✅' : '📋'}</span>
                <p className="font-bold text-sm">
                  {selectedTab === 'active' ? 'No active incidents' : 'No resolved incidents'}
                </p>
              </div>
            )}

            {displayedIncidents.map((incident) => (
              <div
                key={incident.id}
                className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 hover:border-neutral-600 transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getIncidentIcon(incident.type)}</span>
                    <div>
                      <p className="font-bold text-sm text-white">{incident.type.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-neutral-500">
                        {new Date(incident.reported_at).toLocaleTimeString()} · {new Date(incident.reported_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${getStatusStyle(incident.status)}`}>
                    {incident.status}
                  </span>
                </div>

                {incident.description && (
                  <p className="text-xs text-neutral-400 italic mb-3 pl-8">
                    &ldquo;{incident.description}&rdquo;
                  </p>
                )}

                {/* Action Buttons */}
                {incident.status === 'REPORTED' && CAN_DISPATCH.includes(userRole) && (
                  <div className="flex gap-2 mt-2 pl-8">
                    {CAN_AUTO_DISPATCH.includes(userRole) && (
                      <button
                        onClick={() => handleAutoDispatch(incident)}
                        disabled={dispatchingId === incident.id}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors shadow-lg shadow-cyan-900/30"
                      >
                        {dispatchingId === incident.id ? '⏳ Finding...' : '🎯 Auto-Dispatch'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: LIVE MAP */}
        <div className="flex-1 p-2 min-h-[400px] lg:min-h-0">
          <div className="h-full rounded-xl overflow-hidden border border-neutral-800">
            <MapWrapper
              venues={venues}
              incidents={activeIncidents}
              events={[]}
              mode="crisis"
            />
          </div>
        </div>
      </div>

      {/* Shift elapsed timer */}
      {onDuty && shiftStartedAt && (
        <ShiftTimer startedAt={shiftStartedAt} />
      )}
    </div>
  );
}

function ShiftTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(startedAt).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="fixed bottom-4 left-4 bg-emerald-950/90 backdrop-blur-md border border-emerald-500/40 rounded-xl px-4 py-2 shadow-lg shadow-emerald-900/30 z-50">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <div>
          <p className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider">Shift Duration</p>
          <p className="text-lg font-mono font-bold text-emerald-400">{elapsed}</p>
        </div>
      </div>
    </div>
  );
}
