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
  type: z.enum(['bar', 'restaurant', 'club', 'venue', 'other']).optional(),
  status: z.nativeEnum(VenueStatus).optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  name: z.string(),
  venueId: z.string(),
  description: z.string().optional(),
  startTime: z.string().datetime(), // ISO 8601
  endTime: z.string().datetime(), // ISO 8601
  pricing: z.union([z.number(), z.boolean()]),
  categories: z.array(z.enum(['live-music', 'dj', 'comedy', 'special', 'food-drink', 'other'])),
  venue: VenueSchema.optional(),
});

export enum IncidentType {
  WELLNESS_CHECK = 'WELLNESS_CHECK',
  DE_ESCALATION = 'DE_ESCALATION',
  MEDICAL_MINOR = 'MEDICAL_MINOR',
  GENERAL_ASSIST = 'GENERAL_ASSIST'
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
