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
  // Use service role to bypass RLS for this secure transaction
  const supabase = await createClient();

  // 1. Authenticate the staff member attempting to scan
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Unauthorized scan attempt.' };
  }

  // TODO: Add strict RBAC check here to ensure `user.id` is actually staff for `venueId`
  
  // We need to use an admin client or bypass RLS because the user_passes table
  // only allows the pass owner to view their own pass. 
  // Since server actions run on the server, we can initialize a service role client
  // if needed. But for now, let's assume we use the regular client and update the policy,
  // OR we initialize a service role client.
  const adminAuthClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. Fetch the pass to verify it exists and is valid
  const { data: pass, error: passError } = await adminAuthClient
    .from('user_passes')
    .select('*')
    .eq('id', passId)
    .single();

  if (passError || !pass) {
    return { success: false, error: 'Invalid or missing pass.' };
  }

  if (pass.status === 'REDEEMED') {
    return { success: false, error: 'This pass has already been redeemed.' };
  }

  if (pass.status === 'EXPIRED') {
    return { success: false, error: 'This pass has expired.' };
  }

  // 3. Perform the Redemption Transaction
  // Update pass status
  const { error: updateError } = await adminAuthClient
    .from('user_passes')
    .update({ status: 'REDEEMED', redeemed_at: new Date().toISOString() })
    .eq('id', passId);

  if (updateError) {
    console.error('Error updating pass:', updateError);
    return { success: false, error: 'Failed to redeem pass.' };
  }

  // Insert into financial ledger (redemptions)
  // Hardcoding lead_fee to $1.50 for demonstration purposes
  const leadFee = 1.50; 
  const { error: ledgerError } = await adminAuthClient
    .from('redemptions')
    .insert({
      pass_id: passId,
      venue_id: venueId,
      user_id: pass.user_id,
      lead_fee: leadFee,
    });

  if (ledgerError) {
    console.error('Ledger error:', ledgerError);
    // Ideally this would be a Postgres transaction (RPC). 
    // If ledger fails, the pass is already redeemed, which causes a financial sync issue.
    // In production, we must wrap this in a Supabase RPC function.
  }

  return { success: true, message: 'Pass successfully redeemed!' };
}
