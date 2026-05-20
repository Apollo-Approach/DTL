'use server';

import { cookies } from 'next/headers';

export async function setInviteCookie() {
  const cookieStore = await cookies();
  cookieStore.set('dtl_invite_accepted', 'true', {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  
  return { success: true };
}
