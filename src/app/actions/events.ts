'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveEvent(payload: any, eventId?: string) {
  const adminSupabase = await createAdminClient();

  try {
      if (eventId) {
        const { error } = await adminSupabase
          .from('events')
          .update(payload)
          .eq('id', eventId);
        if (error) throw error;
        
        revalidatePath('/', 'layout');
        return { success: true };
      } else {
        const { data, error } = await adminSupabase
          .from('events')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        
        revalidatePath('/', 'layout');
        return { success: true, data };
      }
    } catch (error: any) {
      console.error('Error saving event:', error);
      return { success: false, error: error.message };
    }
}

export async function deleteEvent(eventId: string) {
  const adminSupabase = await createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('events')
      .delete()
      .eq('id', eventId);
    
    if (error) throw error;
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting event:', error);
    return { success: false, error: error.message };
  }
}
