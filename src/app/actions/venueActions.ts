'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// We use the service role for ledger/pass writes to bypass the strict RLS policies.
const getAdminClient = () => createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function redeemPass(passCode: string) {
  const supabase = await createClient();

  // 1. Authenticate the staff member attempting to scan
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Unauthorized scan attempt.' };
  }

  // 2. Fetch the venue manager's profile to get their venue_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, venue_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'venue_manager' || !profile.venue_id) {
    return { success: false, error: 'You are not authorized staff for any venue.' };
  }

  const venueId = profile.venue_id;
  const adminClient = getAdminClient();

  // 3. Verify the pass by pass_code
  const { data: pass, error: passError } = await adminClient
    .from('user_passes')
    .select('*, promotions!inner(venue_id)')
    .eq('pass_code', passCode)
    .single();

  if (passError || !pass) {
    return { success: false, error: 'Pass not found or invalid QR code.' };
  }

  if (pass.status !== 'ISSUED') {
    return { success: false, error: `This pass has already been ${pass.status.toLowerCase()}.` };
  }

  // NOTE: In JS, nested joins like promotions!inner return as an object or array.
  // We need to type-cast or access it correctly. 
  // Let's assume pass.promotions is an object with venue_id
  const promoVenueId = Array.isArray(pass.promotions) ? pass.promotions[0]?.venue_id : (pass.promotions as Record<string, unknown>)?.venue_id;

  if (promoVenueId !== venueId) {
    return { success: false, error: 'This pass is for a different venue.' };
  }

  // 4. Update the pass status to REDEEMED
  const { error: updateError } = await adminClient
    .from('user_passes')
    .update({ status: 'REDEEMED', redeemed_at: new Date().toISOString() })
    .eq('id', pass.id);

  if (updateError) {
    console.error('Failed to update pass:', updateError);
    return { success: false, error: 'Failed to redeem pass status.' };
  }

  // 5. Insert the financial ledger record (Redemption)
  const leadFee = 1.00; // Hardcoded dynamic lead fee for now
  const { error: ledgerError } = await adminClient
    .from('redemptions')
    .insert({
      pass_id: pass.id,
      venue_id: venueId,
      user_id: pass.user_id,
      lead_fee: leadFee,
    });

  if (ledgerError) {
    console.error('Failed to insert redemption ledger:', ledgerError);
    // Ideally we would rollback the pass update, but for now we log it.
  }

  return { success: true, message: 'Pass successfully redeemed!' };
}

export async function getVenueDashboardStats() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, venue_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'venue_manager' || !profile.venue_id) return null;

  const adminClient = getAdminClient();

  // Get active promotions count
  const { count: activePromos } = await adminClient
    .from('promotions')
    .select('*', { count: 'exact', head: true })
    .eq('venue_id', profile.venue_id);

  // Get redemptions
  const { data: redemptions } = await adminClient
    .from('redemptions')
    .select('lead_fee, redeemed_at')
    .eq('venue_id', profile.venue_id);

  const totalScans = redemptions?.length || 0;
  const totalFees = redemptions?.reduce((sum, r) => sum + Number(r.lead_fee), 0) || 0;

  // Scans today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scansToday = redemptions?.filter(r => new Date(r.redeemed_at) >= today).length || 0;

  return {
    venueId: profile.venue_id,
    activePromos: activePromos || 0,
    totalScans,
    scansToday,
    totalFees,
  };
}
