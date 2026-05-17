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
