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

export async function saveVenue(payload: any, venueId?: string) {
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

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
        if (!payload.id && payload.name) {
          payload.id = 'v-' + payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
        }
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
  if (!(await verifyAdmin())) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

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
