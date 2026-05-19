'use server';

import { cookies } from 'next/headers';

export async function verifyCrisisPin(pin: string) {
  // Use a private server-only env variable if possible, fallback to the public one if that's all there is
  const correctPin = process.env.CRISIS_PIN || process.env.NEXT_PUBLIC_CRISIS_PIN || '';
  
  if (pin && pin === correctPin) {
    // Set an HTTP-only cookie so the unlocked state persists securely across reloads
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 12); // 12 hours
    const cookieStore = await cookies();
    cookieStore.set('crisis_unlocked', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires,
    });
    return { success: true };
  }
  
  return { success: false };
}

export async function lockCrisis() {
  const cookieStore = await cookies();
  cookieStore.delete('crisis_unlocked');
  return { success: true };
}

export async function checkCrisisStatus() {
  const cookieStore = await cookies();
  return cookieStore.has('crisis_unlocked');
}

export async function updateIncidentStatus(id: string, status: 'DISPATCHED' | 'RESOLVED') {
  if (!(await checkCrisisStatus())) {
    throw new Error('Unauthorized');
  }

  // Use service role key to bypass RLS since Crisis Cloud uses its own PIN-based auth cookie
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updates: any = { status };
  if (status === 'RESOLVED') {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('safety_incidents')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating incident status:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateIncidentResolution(id: string, resolutionCode: string, resolutionNotes: string) {
  if (!(await checkCrisisStatus())) {
    throw new Error('Unauthorized');
  }

  // Use service role key to bypass RLS since Crisis Cloud uses its own PIN-based auth cookie
  // In a real implementation with M-Tiers, we would use the authenticated user's session token here
  // to enforce the M2/M3 RLS policies, but for this demo, the cookie is our gateway.
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('safety_incidents')
    .update({ 
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
      resolution_code: resolutionCode,
      resolution_notes: resolutionNotes
    })
    .eq('id', id);

  if (error) {
    console.error('Error submitting resolution report:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
