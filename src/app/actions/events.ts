'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'sysadmin' || profile?.role === 'm5_sysadmin';
}

export async function saveEvent(payload: any, eventId?: string) {
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

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
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

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
