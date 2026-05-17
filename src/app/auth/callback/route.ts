import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // `next` parameter allows us to redirect to a specific page after login
  // (e.g., redirecting back to the venue profile page after claiming)
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    const supabase = await createClient();
    
    // Exchange the code for a session
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && user) {
      // Check if the user has completed onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();
        
      if (profile && !profile.onboarding_completed) {
        // Force the user into the onboarding flow
        return NextResponse.redirect(new URL(`/onboarding?next=${encodeURIComponent(next)}`, requestUrl.origin));
      }

      // Redirect to the intended page upon successful login
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    } else {
      console.error("Auth callback error:", error?.message);
    }
  }

  // Fallback to error page or homepage if auth fails
  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin));
}
