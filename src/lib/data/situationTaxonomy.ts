// src/lib/data/situationTaxonomy.ts
// Canonical Situational Taxonomy for DTL
// Based on "The Infatuation" Perfect-For model (Research #8)
// 
// This is the seed for the entire UX pivot away from directory-style navigation.
// Everything else (promotional feed, geofence alerts, NFC redemption, search chips)
// references these tags.

export interface SituationTag {
  /** Stable slug used in database, URLs, and API responses */
  slug: string;
  /** Human-readable display label */
  label: string;
  /** Emoji icon for UI display */
  icon: string;
  /** Category grouping for UI sections */
  category: 'social' | 'budget' | 'vibe' | 'timing' | 'occasion';
  /** Days of week when this tag is most relevant (0=Sun, 6=Sat). Empty = always relevant. */
  relevantDays: number[];
  /** Hour range [start, end) when this tag is most relevant. Null = always relevant. */
  relevantHours: [number, number] | null;
  /** Short description for tooltip/explanation */
  description: string;
}

/**
 * The canonical situational taxonomy.
 * Tags are ordered by category, then by expected usage frequency.
 * 
 * Usage in DB: stored as TEXT[] in venues.situation_tags and promotions.situation_tags
 * Usage in UI: rendered as filter chips in search, situation badges in venue cards
 * Usage in API: matched against user preferences for personalized feed
 */
export const SITUATION_TAGS: SituationTag[] = [
  // ── Social / Group ──
  {
    slug: 'girls-night',
    label: 'Girls Night',
    icon: '💃',
    category: 'social',
    relevantDays: [4, 5, 6], // Thu-Sat
    relevantHours: [20, 2],
    description: 'Perfect spots for a girls night out — cocktails, vibes, dancing',
  },
  {
    slug: 'date-night',
    label: 'Date Night',
    icon: '💕',
    category: 'social',
    relevantDays: [4, 5, 6],
    relevantHours: [18, 23],
    description: 'Intimate, romantic spots ideal for a date',
  },
  {
    slug: 'group-hangout',
    label: 'Group Hangout',
    icon: '👥',
    category: 'social',
    relevantDays: [],
    relevantHours: null,
    description: 'Large tables, group-friendly menus, good for 6+',
  },
  {
    slug: 'solo-vibes',
    label: 'Solo Vibes',
    icon: '🎧',
    category: 'social',
    relevantDays: [],
    relevantHours: null,
    description: 'Great for going out alone — bar seating, chill atmosphere',
  },

  // ── Budget / Deals ──
  {
    slug: 'cheap-drinks',
    label: 'Cheap Drinks',
    icon: '🍻',
    category: 'budget',
    relevantDays: [1, 2, 3, 4], // Mon-Thu
    relevantHours: [16, 2],
    description: 'Dollar beers, well drink specials, student-priced pitchers',
  },
  {
    slug: 'budget-eats',
    label: 'Budget Eats',
    icon: '🍔',
    category: 'budget',
    relevantDays: [],
    relevantHours: null,
    description: 'Meals under $10 — student-friendly pricing',
  },
  {
    slug: 'happy-hour',
    label: 'Happy Hour',
    icon: '🥂',
    category: 'budget',
    relevantDays: [1, 2, 3, 4, 5], // Mon-Fri
    relevantHours: [15, 19],
    description: 'After-work drink and appetizer deals',
  },
  {
    slug: 'no-cover',
    label: 'No Cover',
    icon: '🚫💰',
    category: 'budget',
    relevantDays: [3, 4, 5, 6], // Wed-Sat
    relevantHours: [20, 2],
    description: 'Free entry — no cover charge tonight',
  },

  // ── Vibe / Atmosphere ──
  {
    slug: 'live-music',
    label: 'Live Music',
    icon: '🎵',
    category: 'vibe',
    relevantDays: [],
    relevantHours: [19, 2],
    description: 'Live bands, open mics, DJ sets tonight',
  },
  {
    slug: 'chill-patio',
    label: 'Chill Patio',
    icon: '☀️',
    category: 'vibe',
    relevantDays: [],
    relevantHours: [11, 23],
    description: 'Heated or seasonal patios with a relaxed vibe',
  },
  {
    slug: 'dance-floor',
    label: 'Dance Floor',
    icon: '🪩',
    category: 'vibe',
    relevantDays: [4, 5, 6],
    relevantHours: [22, 2],
    description: 'Clubs and bars with dedicated dance floors',
  },
  {
    slug: 'craft-cocktails',
    label: 'Craft Cocktails',
    icon: '🍸',
    category: 'vibe',
    relevantDays: [],
    relevantHours: [17, 1],
    description: 'Mixology-focused bars with creative cocktail menus',
  },
  {
    slug: 'sports-bar',
    label: 'Sports Bar',
    icon: '📺',
    category: 'vibe',
    relevantDays: [],
    relevantHours: null,
    description: 'Big screens, game-day specials, wings and beer',
  },

  // ── Timing / Situational ──
  {
    slug: 'late-night-eats',
    label: 'Late Night Eats',
    icon: '🌙',
    category: 'timing',
    relevantDays: [4, 5, 6],
    relevantHours: [23, 4],
    description: 'Kitchens open past midnight',
  },
  {
    slug: 'pre-game',
    label: 'Pre-Game Spot',
    icon: '🏒',
    category: 'timing',
    relevantDays: [],
    relevantHours: [16, 20],
    description: 'Pre-game drinks before Knights or Mustangs games',
  },
  {
    slug: 'post-exam-patios',
    label: 'Post-Exam Patios',
    icon: '📚🍺',
    category: 'timing',
    relevantDays: [],
    relevantHours: [14, 22],
    description: 'Celebrate surviving exams — patios, pitchers, and good vibes',
  },
  {
    slug: 'brunch-spot',
    label: 'Brunch Spot',
    icon: '🥞',
    category: 'timing',
    relevantDays: [0, 6], // Sat-Sun
    relevantHours: [9, 14],
    description: 'Weekend brunch with cocktails or coffee',
  },

  // ── Occasion / Event ──
  {
    slug: 'first-time-visitor',
    label: 'First Time Downtown',
    icon: '🗺️',
    category: 'occasion',
    relevantDays: [],
    relevantHours: null,
    description: 'Essential spots for someone new to downtown London',
  },
  {
    slug: 'birthday-celebration',
    label: 'Birthday Celebration',
    icon: '🎂',
    category: 'occasion',
    relevantDays: [],
    relevantHours: null,
    description: 'Venues that do birthday specials, VIP tables, or group packages',
  },
  {
    slug: 'study-cafe',
    label: 'Study Café',
    icon: '☕📖',
    category: 'occasion',
    relevantDays: [1, 2, 3, 4, 5], // Weekdays
    relevantHours: [8, 18],
    description: 'Quiet cafés with WiFi, power outlets, and good coffee',
  },
];

/**
 * Quick lookup map: slug → SituationTag
 */
export const SITUATION_TAG_MAP = new Map(
  SITUATION_TAGS.map(tag => [tag.slug, tag])
);

/**
 * Returns tags that are most relevant for the current day and time.
 * Used by the promotional feed algorithm to surface time-appropriate content.
 */
export function getRelevantTags(
  date: Date = new Date()
): SituationTag[] {
  const day = date.getDay();
  const hour = date.getHours();

  return SITUATION_TAGS.filter(tag => {
    // If no day restriction, it's always relevant
    const dayMatch = tag.relevantDays.length === 0 || tag.relevantDays.includes(day);
    if (!dayMatch) return false;

    // If no hour restriction, it's always relevant
    if (!tag.relevantHours) return true;

    const [start, end] = tag.relevantHours;
    if (start < end) {
      // Normal range (e.g., 14-22)
      return hour >= start && hour < end;
    } else {
      // Wraps midnight (e.g., 22-4 means 22,23,0,1,2,3)
      return hour >= start || hour < end;
    }
  });
}

/**
 * Returns all unique categories for UI section grouping.
 */
export function getCategories(): string[] {
  return [...new Set(SITUATION_TAGS.map(t => t.category))];
}

/**
 * Category display config for UI rendering.
 */
export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  social: { label: 'Who You\'re With', icon: '👥' },
  budget: { label: 'Budget & Deals', icon: '💰' },
  vibe: { label: 'Vibe & Atmosphere', icon: '✨' },
  timing: { label: 'Time of Day', icon: '🕐' },
  occasion: { label: 'Occasion', icon: '🎉' },
};
