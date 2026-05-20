/**
 * Geofence Event Handler — Sprint 4.1
 *
 * Orchestrates the full geofencing lifecycle:
 *   1. Bootstraps the DynamicGeofenceManager with venue data from SQLite/API
 *   2. Registers geofences via @capgo/background-geolocation
 *   3. Handles ENTER/EXIT transitions → fires local notifications
 *   4. Handles macro-geofence breach → re-evaluates and swaps fences
 *
 * This module is the "glue" between:
 *   - DynamicGeofenceManager (pure algorithm)
 *   - @capgo/background-geolocation (native geofence API)
 *   - @capacitor/local-notifications (user-facing alerts)
 *
 * Usage:
 *   import { initGeofencing } from '@/lib/geofencing/geofenceEventHandler';
 *   await initGeofencing();
 *
 * Note: All Capacitor imports are dynamic to prevent SSR crashes.
 */

import {
  DynamicGeofenceManager,
  haversineMeters,
  type VenueGeofenceRecord,
  type GeofenceRegion,
} from './dynamicGeofenceManager';

// ─── Types ───────────────────────────────────────────────────────────

interface GeofenceTransitionEvent {
  identifier: string;
  transition: 'enter' | 'exit';
  latitude?: number;
  longitude?: number;
}

interface GeofencingState {
  manager: DynamicGeofenceManager;
  isRunning: boolean;
  lastNotificationId: number;
  /** Track active venue notifications to clear on EXIT */
  activeNotifications: Map<string, number>;
}

// ─── Singleton State ─────────────────────────────────────────────────

let state: GeofencingState | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Check if we're running inside a Capacitor native shell.
 * Returns false in SSR and browser-only contexts.
 */
function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any)?.Capacitor?.isNativePlatform?.();
}

/**
 * Detect platform for fence count limits.
 */
function getMaxFences(): number {
  if (typeof window === 'undefined') return 19;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (window as any)?.Capacitor?.getPlatform?.();
  return platform === 'android' ? 99 : 19; // iOS = 20 max (19 + 1 macro)
}

/**
 * Fetch venues from Supabase API for geofence seeding.
 * In production, this would read from local SQLite for offline support.
 */
async function fetchVenuesForGeofencing(): Promise<VenueGeofenceRecord[]> {
  try {
    // Fetch venues with active deals
    const [venuesRes, promosRes] = await Promise.all([
      fetch('/api/venues?fields=id,name,lat,lng,address,situation_tags'),
      fetch('/api/promotions/feed?limit=50'),
    ]);

    const venuesData = venuesRes.ok ? await venuesRes.json() : { venues: [] };
    const promosData = promosRes.ok ? await promosRes.json() : { feed: [] };

    // Build a map of venue_id → best deal headline
    const dealMap = new Map<string, { headline: string; id: string }>();
    for (const item of promosData.feed || []) {
      if (item.venue_id && !dealMap.has(item.venue_id)) {
        dealMap.set(item.venue_id, {
          headline: item.discount_value || item.title,
          id: item.id,
        });
      }
    }

    // Merge into geofence records
    const venues: VenueGeofenceRecord[] = (venuesData.venues || venuesData || []).map(
      (v: { id: string; name: string; lat: number; lng: number; address: string; situation_tags?: string[] }) => {
        const deal = dealMap.get(v.id);
        return {
          id: v.id,
          name: v.name,
          lat: v.lat,
          lng: v.lng,
          address: v.address,
          deal_headline: deal?.headline || null,
          deal_id: deal?.id || null,
          situation_tags: v.situation_tags || [],
        };
      }
    );

    console.log(`[GeofenceHandler] Fetched ${venues.length} venues, ${dealMap.size} with active deals`);
    return venues;
  } catch (err) {
    console.error('[GeofenceHandler] Failed to fetch venues:', err);
    return [];
  }
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Register computed geofences with the native OS via Capgo plugin.
 */
async function registerFences(regions: GeofenceRegion[]): Promise<void> {
  try {
    // Dynamic import — only loaded on native
    const { BackgroundGeolocation } = await import('@capgo/background-geolocation');

    // Clear all existing fences first
    await BackgroundGeolocation.removeAllGeofences();

    // Register each new fence
    for (const region of regions) {
      await BackgroundGeolocation.addGeofence({
        identifier: region.identifier,
        latitude: region.latitude,
        longitude: region.longitude,
        radius: region.radiusMeters,
        notifyOnEntry: true,
        notifyOnExit: !region.isMacro, // Don't notify on macro EXIT
      });
    }

    console.log(`[GeofenceHandler] Registered ${regions.length} fences with native OS`);
  } catch (err) {
    console.error('[GeofenceHandler] Failed to register fences:', err);
  }
}

/**
 * Fire a local notification when user enters a venue proximity zone.
 */
async function fireProximityNotification(
  venue: VenueGeofenceRecord,
  distanceMeters: number
): Promise<number> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    const notifId = Date.now() % 2147483647; // Keep within 32-bit int range

    const distanceText = distanceMeters < 100
      ? `${Math.round(distanceMeters)}m away`
      : `${(distanceMeters / 1000).toFixed(1)}km away`;

    const title = venue.deal_headline
      ? `🎁 ${venue.deal_headline}`
      : `📍 You're near ${venue.name}`;

    const body = venue.deal_headline
      ? `${venue.name} — ${distanceText}!`
      : `${venue.address} — ${distanceText}`;

    await LocalNotifications.schedule({
      notifications: [{
        id: notifId,
        title,
        body,
        schedule: { at: new Date() }, // Immediately
        channelId: 'dtl-proximity', // Android notification channel
        extra: {
          venue_id: venue.id,
          deal_id: venue.deal_id,
          type: 'geofence_enter',
        },
      }],
    });

    console.log(`[GeofenceHandler] 🔔 Notified: ${title}`);
    return notifId;
  } catch (err) {
    console.error('[GeofenceHandler] Failed to fire notification:', err);
    return -1;
  }
}

/**
 * Clear a notification when user exits a venue zone.
 */
async function clearNotification(notifId: number): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
  } catch (err) {
    console.error('[GeofenceHandler] Failed to clear notification:', err);
  }
}

/**
 * Handle a geofence transition event from the native layer.
 */
async function handleTransition(event: GeofenceTransitionEvent): Promise<void> {
  if (!state) return;

  const { manager, activeNotifications } = state;

  // ── Macro-geofence breach → re-evaluate ──
  if (manager.isMacroFence(event.identifier)) {
    if (event.transition === 'exit' && event.latitude != null && event.longitude != null) {
      console.log('[GeofenceHandler] 🌐 Macro-fence breached — re-evaluating fences');
      const { regions, shouldUpdate } = manager.computeOptimalFences(
        event.latitude,
        event.longitude
      );
      if (shouldUpdate) {
        await registerFences(regions);
      }
    }
    return;
  }

  // ── Venue geofence ──
  const venue = manager.getVenueById(event.identifier);
  if (!venue) {
    console.warn(`[GeofenceHandler] Unknown venue ID: ${event.identifier}`);
    return;
  }

  if (event.transition === 'enter') {
    const userLat = event.latitude ?? venue.lat;
    const userLng = event.longitude ?? venue.lng;
    const distance = haversineMeters(
      userLat, userLng,
      venue.lat, venue.lng
    );

    const notifId = await fireProximityNotification(venue, distance);
    if (notifId > 0) {
      activeNotifications.set(venue.id, notifId);
    }
  } else if (event.transition === 'exit') {
    const notifId = activeNotifications.get(venue.id);
    if (notifId) {
      await clearNotification(notifId);
      activeNotifications.delete(venue.id);
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Initialize the entire geofencing system.
 * Call this once after location permissions are granted.
 *
 * @returns true if geofencing was successfully initialized
 */
export async function initGeofencing(): Promise<boolean> {
  // Only run on native Capacitor
  if (!isNativeCapacitor()) {
    console.log('[GeofenceHandler] Not a native platform — skipping geofencing init');
    return false;
  }

  if (state?.isRunning) {
    console.log('[GeofenceHandler] Already running');
    return true;
  }

  try {
    // 1. Check & request permissions
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const requestResult = await LocalNotifications.requestPermissions();
      if (requestResult.display !== 'granted') {
        console.warn('[GeofenceHandler] Notification permissions denied');
        return false;
      }
    }

    // Create Android notification channel
    await LocalNotifications.createChannel({
      id: 'dtl-proximity',
      name: 'Nearby Deals',
      description: 'Alerts when you\'re near a venue with active deals',
      importance: 4, // HIGH
      sound: 'default',
      vibration: true,
    });

    // 2. Fetch venue data
    const venues = await fetchVenuesForGeofencing();
    if (venues.length === 0) {
      console.warn('[GeofenceHandler] No venues available — cannot start geofencing');
      return false;
    }

    // 3. Initialize manager
    const manager = new DynamicGeofenceManager({
      maxFences: getMaxFences(),
    });
    manager.initialize(venues);

    state = {
      manager,
      isRunning: true,
      lastNotificationId: 0,
      activeNotifications: new Map(),
    };

    // 4. Get current position
    const { Geolocation } = await import('@capacitor/geolocation');
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });

    // 5. Compute and register initial fences
    const { regions } = manager.computeOptimalFences(
      position.coords.latitude,
      position.coords.longitude
    );
    await registerFences(regions);

    // 6. Set up transition listener
    const { BackgroundGeolocation } = await import('@capgo/background-geolocation');
    BackgroundGeolocation.addListener('geofenceTransition', (event: GeofenceTransitionEvent) => {
      handleTransition(event).catch(err =>
        console.error('[GeofenceHandler] Transition handler error:', err)
      );
    });

    console.log('[GeofenceHandler] ✅ Geofencing system initialized');
    console.log('[GeofenceHandler] Stats:', manager.getStats());
    return true;
  } catch (err) {
    console.error('[GeofenceHandler] Initialization failed:', err);
    return false;
  }
}

/**
 * Stop all geofencing and clean up.
 */
export async function stopGeofencing(): Promise<void> {
  if (!state) return;

  try {
    const { BackgroundGeolocation } = await import('@capgo/background-geolocation');
    await BackgroundGeolocation.removeAllGeofences();

    // Clear any active notifications
    for (const [, notifId] of state.activeNotifications) {
      await clearNotification(notifId);
    }

    state.isRunning = false;
    state = null;
    console.log('[GeofenceHandler] 🛑 Geofencing stopped');
  } catch (err) {
    console.error('[GeofenceHandler] Error stopping geofencing:', err);
  }
}

/**
 * Refresh the venue cache (e.g., after FCM silent push).
 * Re-evaluates fences using the most recent known position.
 */
export async function refreshGeofenceData(): Promise<void> {
  if (!state?.isRunning) return;

  try {
    const venues = await fetchVenuesForGeofencing();
    state.manager.updateCache(venues);

    // Re-evaluate with last known position
    if (state.manager.getStats().lastEvalPosition) {
      const pos = state.manager.getStats().lastEvalPosition!;
      const { regions, shouldUpdate } = state.manager.computeOptimalFences(pos.lat, pos.lng);
      if (shouldUpdate) {
        await registerFences(regions);
      }
    }

    console.log('[GeofenceHandler] 🔄 Geofence data refreshed');
  } catch (err) {
    console.error('[GeofenceHandler] Refresh failed:', err);
  }
}

/**
 * Get current geofencing stats for debugging.
 */
export function getGeofencingStats() {
  return state?.manager.getStats() || null;
}
