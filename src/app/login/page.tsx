'use client';

import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import Link from 'next/link';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const errorParam = searchParams.get('error');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(errorParam === 'auth_failed' ? 'Authentication failed. Please try again.' : '');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    const supabase = createClient();
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setErrorMsg(err.message || 'An error occurred during sign in.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-20 p-8 bg-black border border-white/10 shadow-2xl relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 blur-3xl rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="mb-10 text-center">
          <Link href="/" className="inline-block text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-black mb-4 hover:text-cyan-300">
            DTL Nightly
          </Link>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">
            Sign In
          </h1>
          <p className="text-zinc-400 text-sm font-medium">
            Join the core to claim venues, generate coupons, and shape the city.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold rounded-lg text-center">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-black font-black uppercase tracking-widest text-sm py-4 px-6 hover:bg-zinc-200 transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] mb-8"
        >
          {loading ? (
            <span className="animate-pulse">Connecting...</span>
          ) : (
            <>
              {/* Google G Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-zinc-500 mb-2 font-medium">Local Development Note:</p>
          <p className="text-[10px] text-zinc-600 font-mono bg-zinc-900 p-2 rounded">
            To test OAuth locally, configure your Google Cloud Client ID and Secret in <span className="text-cyan-400">supabase/config.toml</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 selection:bg-cyan-500 selection:text-white">
      <Suspense fallback={<div className="text-zinc-500 uppercase tracking-widest text-xs animate-pulse">Loading secure session...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
