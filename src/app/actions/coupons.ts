'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

export async function generatePass(promotionId: string) {
  const supabase = await createClient();

  // 1. Authenticate user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'You must be logged in to claim a pass.' };
  }

  // 2. Insert the pass
  const { data: pass, error } = await supabase
    .from('user_passes')
    .insert({
      promotion_id: promotionId,
      user_id: user.id,
      status: 'ISSUED',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      return { success: false, error: 'You have already claimed this promotion.' };
    }
    console.error('Error generating pass:', error);
    return { success: false, error: 'Failed to generate pass.' };
  }

  revalidatePath('/wallet');
  return { success: true, pass };
}

export async function redeemPass(passId: string, venueId: string) {
  const supabase = await createClient();

  // 1. Authenticate the staff member attempting to scan
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Unauthorized scan attempt.' };
  }

  // 2. RBAC check: verify the user is staff for this venue
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: isStaff } = await adminClient.rpc('is_venue_staff', {
    p_user_id: user.id,
    p_venue_id: venueId,
  });

  if (!isStaff) {
    return { success: false, error: 'You are not authorized staff for this venue.' };
  }

  // 3. Atomic redemption via RPC — pass update + ledger insert in one transaction
  const { data, error } = await adminClient.rpc('redeem_pass', {
    p_pass_id: passId,
    p_venue_id: venueId,
    p_lead_fee: 1.50,
  });

  if (error) {
    console.error('Redemption RPC error:', error);
    return { success: false, error: 'Failed to redeem pass.' };
  }

  const result = data as { success: boolean; error?: string; message?: string };

  if (!result.success) {
    return { success: false, error: result.error || 'Redemption failed.' };
  }

  return { success: true, message: result.message };
}
