import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Protect login and onboarding routes with the invite system
  const isProtectedPath = pathname.startsWith('/login') || pathname.startsWith('/onboarding') || pathname.startsWith('/auth/callback');
  const hasInviteCookie = request.cookies.has('dtl_invite_accepted');
  
  if (isProtectedPath && !hasInviteCookie) {
    // Check if they are trying to access a callback, we shouldn't block the callback itself if they somehow have an invite, but wait:
    // If they go to Google OAuth, they leave the site and come back to /auth/callback. They WILL have the cookie if they set it.
    // So blocking /auth/callback if no cookie is safe.
    return NextResponse.redirect(new URL('/invite', request.url));
  }

  // Update the session, refreshing the auth token if necessary
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes, optional to skip if you do your own API auth checks)
     * Feel free to modify this pattern to match your requirements.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
