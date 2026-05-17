// src/lib/matchScore.ts

import { Offerings, Preferences } from '@/types';

export function calculateMatchScore(venueOfferings: Offerings | null | undefined, userPreferences: Preferences | null | undefined) {
  if (!venueOfferings || !userPreferences) return 0;
  
  let score = 0;
  let maxScore = 0;

  // 1. Drinks (30% weight)
  if (userPreferences.drinks && userPreferences.drinks.length > 0) {
    maxScore += 30;
    const vDrinks = venueOfferings.drinks || [];
    const overlap = userPreferences.drinks.filter((d: string) => vDrinks.includes(d)).length;
    if (overlap > 0) score += (overlap / userPreferences.drinks.length) * 30;
  }

  // 2. Cuisine (30% weight)
  if (userPreferences.cuisine && userPreferences.cuisine.length > 0) {
    maxScore += 30;
    const vCuisine = venueOfferings.cuisine || [];
    const overlap = userPreferences.cuisine.filter((c: string) => vCuisine.includes(c)).length;
    if (overlap > 0) score += (overlap / userPreferences.cuisine.length) * 30;
  }

  // 3. Vibe (30% weight)
  if (userPreferences.vibe && userPreferences.vibe.length > 0) {
    maxScore += 30;
    const vVibe = venueOfferings.vibe || [];
    const overlap = userPreferences.vibe.filter((v: string) => vVibe.includes(v)).length;
    if (overlap > 0) score += (overlap / userPreferences.vibe.length) * 30;
  }

  // 4. Habits: Affordability (10% weight)
  if (userPreferences.habits?.affordability) {
    maxScore += 10;
    if (venueOfferings.habits?.affordability === userPreferences.habits.affordability) {
      score += 10;
    }
  }

  // If no preferences or offerings matched the criteria, return 0
  if (maxScore === 0) return 0;
  
  return Math.round((score / maxScore) * 100);
}
