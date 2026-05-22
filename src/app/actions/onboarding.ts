'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { Preferences } from '@/types';

export async function savePreferences(preferencesData: Preferences) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return { success: false, error: 'Unauthorized. Please log in.' };
  }

  // Ensure the preferences object contains the 4 simple choices
  const validPreferences = {
    drinks: preferencesData.drinks || [],
    cuisine: preferencesData.cuisine || [],
    vibe: preferencesData.vibe || [],
    habits: preferencesData.habits || {},
  };

  const { error } = await supabase
    .from('profiles')
    .update({ 
      preferences: validPreferences,
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id);

  if (error) {
    console.error('Error saving preferences:', error);
    return { success: false, error: 'Failed to save preferences.' };
  }

  revalidatePath('/');
  return { success: true };
}
