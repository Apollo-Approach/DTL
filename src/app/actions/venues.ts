'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveVenue(payload: any, venueId?: string) {
  console.log("saveVenue called with venueId:", venueId);
  console.log("payload:", payload);
  const adminSupabase = await createAdminClient();
  console.log("adminSupabase created");

  try {
      if (venueId) {
        const { error } = await adminSupabase
          .from('venues')
          .update(payload)
          .eq('id', venueId);
        if (error) {
          console.error("Supabase update error:", error);
          throw error;
        }
        revalidatePath('/', 'layout');
        return { success: true };
      } else {
        const { data, error } = await adminSupabase
          .from('venues')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        revalidatePath('/', 'layout');
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Error saving venue:', error);
      return { success: false, error: error.message };
    }
}

export async function deleteVenue(venueId: string) {
  const adminSupabase = await createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('venues')
      .delete()
      .eq('id', venueId);
    
    if (error) throw error;
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting venue:', error);
    return { success: false, error: error.message };
  }
}
