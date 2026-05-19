'use server';

import { createClient } from '@supabase/supabase-js';

const DISPATCH_RADIUS_METERS = 450;

/**
 * Haversine formula: returns distance in meters between two lat/lng points.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Auto-dispatch: Find the nearest on-duty responder within 450m and assign them.
 *
 * Flow:
 * 1. Fetch all on-duty responders (active shifts)
 * 2. Read Supabase Presence for each responder's live GPS
 * 3. Calculate haversine distance to incident
 * 4. Exclude responders already assigned to another active (non-resolved) incident
 * 5. Assign the closest eligible responder
 * 6. Broadcast dispatch notification
 */
export async function autoDispatch(incidentId: string, incidentLat: number, incidentLng: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Get all on-duty responders
  const { data: activeShifts, error: shiftsError } = await supabase
    .from('responder_shifts')
    .select('user_id, zone')
    .is('ended_at', null);

  if (shiftsError || !activeShifts?.length) {
    return {
      success: false,
      error: shiftsError?.message || 'No responders currently on duty.',
      dispatched_to: null,
    };
  }

  const onDutyUserIds = activeShifts.map((s) => s.user_id);

  // 2. Get responders already assigned to active (non-resolved) incidents
  const { data: busyIncidents } = await supabase
    .from('safety_incidents')
    .select('dispatched_to')
    .not('dispatched_to', 'is', null)
    .neq('status', 'RESOLVED');

  const busyResponderIds = new Set(
    (busyIncidents || []).map((i) => i.dispatched_to).filter(Boolean)
  );

  // 3. Read presence data from the realtime-responders channel
  // We need to create a temporary channel to read current presence state
  const presenceChannel = supabase.channel('realtime-responders');

  const presenceData: Record<string, { lat: number; lng: number; role: string; timestamp: number }> = {};

  // Subscribe and wait for initial sync
  await new Promise<void>((resolve) => {
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        Object.keys(state).forEach((key) => {
          if (state[key] && state[key].length > 0) {
            const entry = state[key][0] as any;
            if (entry.lat && entry.lng) {
              presenceData[key] = {
                lat: entry.lat,
                lng: entry.lng,
                role: entry.role || 'unknown',
                timestamp: entry.timestamp || 0,
              };
            }
          }
        });
        resolve();
      })
      .subscribe();

    // Timeout fallback — don't hang forever if presence is empty
    setTimeout(resolve, 3000);
  });

  // Cleanup channel
  supabase.removeChannel(presenceChannel);

  // 4. Calculate distances and find the closest eligible responder
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  type Candidate = {
    userId: string;
    distance: number;
    lat: number;
    lng: number;
    role: string;
  };

  const candidates: Candidate[] = [];

  for (const userId of onDutyUserIds) {
    // Skip busy responders
    if (busyResponderIds.has(userId)) continue;

    // Skip responders without live presence
    const presence = presenceData[userId];
    if (!presence) continue;

    // Skip stale presence data (>5 minutes old)
    if (now - presence.timestamp > STALE_THRESHOLD_MS) continue;

    const distance = haversineDistance(
      incidentLat,
      incidentLng,
      presence.lat,
      presence.lng
    );

    // Only consider responders within the dispatch radius
    if (distance <= DISPATCH_RADIUS_METERS) {
      candidates.push({
        userId,
        distance,
        lat: presence.lat,
        lng: presence.lng,
        role: presence.role,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      success: false,
      error: `No eligible responders within ${DISPATCH_RADIUS_METERS}m. ${onDutyUserIds.length} on-duty, ${Object.keys(presenceData).length} broadcasting.`,
      dispatched_to: null,
    };
  }

  // Sort by distance — closest first
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates[0];

  // 5. Assign the responder to the incident
  const { error: updateError } = await supabase
    .from('safety_incidents')
    .update({
      dispatched_to: chosen.userId,
      dispatched_at: new Date().toISOString(),
      status: 'DISPATCHED',
    })
    .eq('id', incidentId);

  if (updateError) {
    return {
      success: false,
      error: updateError.message,
      dispatched_to: null,
    };
  }

  // 6. Broadcast dispatch notification to the chosen responder
  const dispatchChannel = supabase.channel(`dispatch:${chosen.userId}`);
  await dispatchChannel.send({
    type: 'broadcast',
    event: 'dispatch',
    payload: {
      incidentId,
      incidentLat,
      incidentLng,
      distance: Math.round(chosen.distance),
      assignedAt: new Date().toISOString(),
    },
  });
  supabase.removeChannel(dispatchChannel);

  return {
    success: true,
    dispatched_to: chosen.userId,
    distance: Math.round(chosen.distance),
    role: chosen.role,
  };
}

/**
 * Start a responder shift (go on-duty).
 */
export async function startShift(userId: string, zone: string = 'downtown') {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if they already have an active shift
  const { data: existing } = await supabase
    .from('responder_shifts')
    .select('id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: true, shiftId: existing[0].id, message: 'Already on duty.' };
  }

  const { data, error } = await supabase
    .from('responder_shifts')
    .insert({ user_id: userId, zone })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, shiftId: data.id };
}

/**
 * End a responder shift (go off-duty).
 */
export async function endShift(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('responder_shifts')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('ended_at', null);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
