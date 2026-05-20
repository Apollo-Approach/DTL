/**
 * Dynamic Geofence Manager — Sprint 4.1
 *
 * Implements the "Dynamic Geofencing" strategy described in:
 *   Research/Geofencing Push Notifications with Capacitor.md
 *
 * Core algorithm:
 *   1. Maintain a full local cache of all venue coordinates + deal metadata
 *   2. Sort by Haversine distance from user's current position
 *   3. Register the closest 19 venues as circular geofences (iOS limit = 20)
 *   4. Register 1 macro-geofence (3km radius) centered on user
 *   5. When macro-geofence is breached → re-evaluate → swap fences
 *
 * Plugins required:
 *   - @capgo/background-geolocation (geofence monitoring)
 *   - @capacitor-community/sqlite (local venue cache)
 *   - @capacitor/local-notifications (alert composition)
 *
 * Note: This module is only loaded on native (Capacitor) builds.
 * It is tree-shaken from the web/SSR bundle because imports are dynamic.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface VenueGeofenceRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  /** Active promotional text, e.g. "$5 pints tonight" */
  deal_headline: string | null;
  deal_id: string | null;
  situation_tags: string[];
}

export interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isMacro?: boolean;
}

interface GeofenceManagerConfig {
  /** Max geofences to register (iOS = 19, Android = 99; keep 1 for macro) */
  maxFences: number;
  /** Radius of each venue geofence in meters */
  venueRadiusMeters: number;
  /** Radius of the macro re-evaluation geofence in meters */
  macroRadiusMeters: number;
  /** Minimum distance change (meters) before triggering re-evaluation */
  minReEvalDistanceMeters: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: GeofenceManagerConfig = {
  maxFences: 19, // 19 venues + 1 macro = 20 (iOS CoreLocation limit)
  venueRadiusMeters: 50, // "You're 50m from McCabe's"
  macroRadiusMeters: 3000, // 3km macro-geofence for re-evaluation
  minReEvalDistanceMeters: 500, // Don't re-evaluate for tiny movements
};

const MACRO_FENCE_ID = '__dtl_macro_geofence__';

// ─── Haversine ───────────────────────────────────────────────────────

/**
 * Calculate great-circle distance between two lat/lng points.
 * Returns distance in meters.
 */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Manager Class ───────────────────────────────────────────────────

export class DynamicGeofenceManager {
  private config: GeofenceManagerConfig;
  private venueCache: VenueGeofenceRecord[] = [];
  private activeRegions: GeofenceRegion[] = [];
  private lastEvalPosition: { lat: number; lng: number } | null = null;
  private isInitialized = false;

  constructor(config: Partial<GeofenceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the manager with the full venue dataset.
   * Call this once on app launch after fetching from Supabase or local SQLite.
   */
  initialize(venues: VenueGeofenceRecord[]): void {
    this.venueCache = venues;
    this.isInitialized = true;
    console.log(`[GeofenceManager] Initialized with ${venues.length} venues`);
  }

  /**
   * Update the local venue cache (e.g., after FCM silent push sync).
   */
  updateCache(venues: VenueGeofenceRecord[]): void {
    this.venueCache = venues;
    console.log(`[GeofenceManager] Cache updated: ${venues.length} venues`);
  }

  /**
   * Core algorithm: Given the user's current position, compute which
   * geofences should be registered with the native OS.
   *
   * Returns the list of regions to register, including the macro-geofence.
   * The caller (geofenceEventHandler) is responsible for the actual
   * addGeofence/removeGeofence calls via the Capgo plugin.
   */
  computeOptimalFences(
    userLat: number,
    userLng: number
  ): { regions: GeofenceRegion[]; shouldUpdate: boolean } {
    if (!this.isInitialized || this.venueCache.length === 0) {
      return { regions: [], shouldUpdate: false };
    }

    // Check if we've moved enough to warrant re-evaluation
    if (this.lastEvalPosition) {
      const movedMeters = haversineMeters(
        this.lastEvalPosition.lat, this.lastEvalPosition.lng,
        userLat, userLng
      );
      if (movedMeters < this.config.minReEvalDistanceMeters) {
        return { regions: this.activeRegions, shouldUpdate: false };
      }
    }

    // Sort all venues by proximity to user
    const sorted = this.venueCache
      .map(v => ({
        ...v,
        distance: haversineMeters(userLat, userLng, v.lat, v.lng),
      }))
      .sort((a, b) => a.distance - b.distance);

    // Take the closest N venues (respecting iOS 20-region limit)
    const closest = sorted.slice(0, this.config.maxFences);

    // Build venue geofence regions
    const venueRegions: GeofenceRegion[] = closest.map(v => ({
      identifier: v.id,
      latitude: v.lat,
      longitude: v.lng,
      radiusMeters: this.config.venueRadiusMeters,
      isMacro: false,
    }));

    // Build macro-geofence centered on user's current position
    const macroRegion: GeofenceRegion = {
      identifier: MACRO_FENCE_ID,
      latitude: userLat,
      longitude: userLng,
      radiusMeters: this.config.macroRadiusMeters,
      isMacro: true,
    };

    const allRegions = [...venueRegions, macroRegion];

    // Update state
    this.activeRegions = allRegions;
    this.lastEvalPosition = { lat: userLat, lng: userLng };

    console.log(
      `[GeofenceManager] Computed ${venueRegions.length} venue fences + 1 macro fence. ` +
      `Closest venue: ${closest[0]?.name} (${Math.round(closest[0]?.distance)}m)`
    );

    return { regions: allRegions, shouldUpdate: true };
  }

  /**
   * Look up a venue by its geofence identifier.
   * Used by the event handler to compose notification text.
   */
  getVenueById(id: string): VenueGeofenceRecord | undefined {
    return this.venueCache.find(v => v.id === id);
  }

  /**
   * Check if an identifier is the macro-geofence.
   */
  isMacroFence(identifier: string): boolean {
    return identifier === MACRO_FENCE_ID;
  }

  /**
   * Get current stats for debugging/logging.
   */
  getStats() {
    return {
      totalVenues: this.venueCache.length,
      activeRegions: this.activeRegions.length,
      lastEvalPosition: this.lastEvalPosition,
      maxFences: this.config.maxFences,
      venueRadius: this.config.venueRadiusMeters,
      macroRadius: this.config.macroRadiusMeters,
    };
  }
}
