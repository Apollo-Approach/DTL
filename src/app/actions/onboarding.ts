'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
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

  const adminSupabase = await createAdminClient();
  const { error } = await adminSupabase
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

export async function getPreferences() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Unauthorized' };

  const adminSupabase = await createAdminClient();
  const { data: profile, error } = await adminSupabase
    .from('profiles')
    .select('preferences, onboarding_completed')
    .eq('id', user.id)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, profile };
}
