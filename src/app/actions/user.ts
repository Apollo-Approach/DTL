'use server';

import { createAdminClient } from '@/lib/supabase/server';

export async function getCurrentUserRole(userId: string) {
  const adminClient = await createAdminClient();
  const { data, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error('Error fetching role:', error);
    return null;
  }
  return data?.role || null;
}
