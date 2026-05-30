import { z } from 'zod';

export const GeoJSONPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]), // [longitude, latitude]
});

export enum VenueStatus {
  PERMANENT = 'PERMANENT',
  POP_UP = 'POP_UP',
  VACANT = 'VACANT'
}

export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // Location accepts either old GeoJSON Point or the new SQL view {lat, lng} struct
  location: z.union([
    GeoJSONPointSchema,
    z.object({ lat: z.number(), lng: z.number(), address: z.string().optional() })
  ]).optional(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
  type: z.string().optional(),
  status: z.nativeEnum(VenueStatus).optional(),
  operating_hours: z.any().optional(), // JSONB
  website_url: z.string().optional(),
  late_night_eligible: z.boolean().optional(),
  offerings: z.any().optional(),
});

export const NormalizedEventSchema = z.object({
  id: z.string(), // Internal UUID
  name: z.string(),
  venue_id: z.string().nullable().optional(),
  start_time: z.string().datetime(), // ISO 8601 UTC
  best_link: z.string().nullable().optional(),
  dedup_hash: z.string().optional(),
  admin_verified: z.boolean().optional()
});

export enum IncidentType {
  OPEN_AIR_DRUGS = 'OPEN_AIR_DRUGS',
  CRISIS_PERSON = 'CRISIS_PERSON',
  CROWD_ESCALATION = 'CROWD_ESCALATION',
  SAFEWALK_SOS = 'SAFEWALK_SOS',
  PANIC_ALARM = 'PANIC_ALARM',
  POSSIBLE_OD = 'POSSIBLE_OD',
  CROWD_NOISE = 'CROWD_NOISE',
  CLEANUP = 'CLEANUP'
}

export enum IncidentStatus {
  REPORTED = 'REPORTED',
  DISPATCHED = 'DISPATCHED',
  RESOLVED = 'RESOLVED'
}

export const SafetyIncidentSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(IncidentType),
  status: z.nativeEnum(IncidentStatus),
  description: z.string().optional(),
  reported_at: z.string().datetime(),
  reported_by: z.string().uuid().optional(),
  resolved_at: z.string().datetime().optional(),
  dispatched_to: z.string().uuid().optional(),
  dispatched_at: z.string().datetime().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  image_url: z.string().url().nullable().optional(),
  lat: z.number(),
  lng: z.number()
});

export type GeoJSONPoint = z.infer<typeof GeoJSONPointSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
export type Event = NormalizedEvent; // Alias for frontend compatibility
export type SafetyIncident = z.infer<typeof SafetyIncidentSchema>;

export enum MediaPlatform {
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  LOCAL_WEB = 'LOCAL_WEB'
}

export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  CAROUSEL = 'CAROUSEL'
}

export interface SocialPost {
  id: string;
  platform: MediaPlatform;
  external_id: string;
  username: string;
  media_type: MediaType;
  media_url: string;
  permalink: string;
  caption?: string;
  posted_at: string;
}

export interface Promotion {
  id: string;
  venue_id: string;
  title: string;
  description: string;
  discount_value: string;
  active_until: string;
  total_claims_allowed: number;
  recurring_day?: string; // 'monday', 'tuesday', etc.
  active_from_time?: string; // HH:MM
  active_until_time?: string; // HH:MM
  source_platform?: string;
  source_url?: string;
}

export interface Habits {
  affordability?: number | string; // From form inputs it arrives as a string, coerced to number server-side
  schedule?: string;
  [key: string]: unknown;
}

export interface Offerings {
  maps_grounding_lite?: Record<string, unknown>;
}

export interface Preferences {
  drinks?: string[];
  cuisine?: string[];

  habits?: Habits;
  autoRoute?: boolean;
}
