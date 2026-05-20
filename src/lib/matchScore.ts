// src/lib/matchScore.ts

import { Offerings, Preferences } from '@/types';

export function calculateMatchScore(venueOfferings: Offerings | null | undefined, userPreferences: Preferences | null | undefined) {
  if (!venueOfferings || !userPreferences) return 0;
  
  let score = 0;
  let maxScore = 0;

  const searchText = JSON.stringify(venueOfferings).toLowerCase();

  // 1. Drinks (30% weight)
  if (userPreferences.drinks && userPreferences.drinks.length > 0) {
    maxScore += 30;
    const overlap = userPreferences.drinks.filter((d: string) => searchText.includes(d.toLowerCase())).length;
    if (overlap > 0) score += (overlap / userPreferences.drinks.length) * 30;
  }

  // 2. Cuisine (30% weight)
  if (userPreferences.cuisine && userPreferences.cuisine.length > 0) {
    maxScore += 30;
    const overlap = userPreferences.cuisine.filter((c: string) => searchText.includes(c.toLowerCase())).length;
    if (overlap > 0) score += (overlap / userPreferences.cuisine.length) * 30;
  }

  // 3. Vibe (30% weight)
  if (userPreferences.vibe && userPreferences.vibe.length > 0) {
    maxScore += 30;
    const overlap = userPreferences.vibe.filter((v: string) => searchText.includes(v.toLowerCase())).length;
    if (overlap > 0) score += (overlap / userPreferences.vibe.length) * 30;
  }

  // 4. Habits: Affordability (10% weight)
  if (userPreferences.habits?.affordability) {
    maxScore += 10;
    if (searchText.includes(String(userPreferences.habits.affordability).toLowerCase())) {
      score += 10;
    }
  }

  if (maxScore === 0) return 0;
  
  return Math.round((score / maxScore) * 100);
}
