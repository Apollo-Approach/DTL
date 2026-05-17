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
  ]),
  address: z.string().optional(),
  type: z.enum(['bar', 'restaurant', 'club', 'venue', 'other', 'church']).optional(),
  status: z.nativeEnum(VenueStatus).optional(),
  operating_hours: z.any().optional(), // JSONB
  website_url: z.string().optional(),
  late_night_eligible: z.boolean().optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  name: z.string(),
  venue_id: z.string(),
  start_time: z.string().datetime(), // ISO 8601
  end_time: z.string().datetime(), // ISO 8601
  is_free: z.boolean(),
  price: z.number(),
  categories: z.array(z.string()),
  description: z.string(),
  ticket_url: z.string().nullable().optional(),
  lat: z.number(),
  lng: z.number()
});

export enum IncidentType {
  OPEN_AIR_DRUGS = 'OPEN_AIR_DRUGS',
  CRISIS_PERSON = 'CRISIS_PERSON',
  CROWD_ESCALATION = 'CROWD_ESCALATION'
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
  reportedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }),
});

export type GeoJSONPoint = z.infer<typeof GeoJSONPointSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Event = z.infer<typeof EventSchema>;
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
}
