'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, ArrowRight, Sparkles } from 'lucide-react';
import { setInviteCookie } from '@/app/actions/invite';

export default function InviteWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Simple hardcoded codes for alpha
    const validCodes = ['APOLLO', 'DTL2026', 'NICKALPHA', 'DEVONALPHA'];
    
    if (validCodes.includes(code.toUpperCase())) {
      setIsUnlocking(true);
      
      // Call server action to set the cookie
      await setInviteCookie();
      
      setTimeout(() => {
        setStep(2);
        setIsUnlocking(false);
      }, 1500);
    } else {
      setError('Invalid sequence. Access denied.');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 selection:bg-cyan-500 selection:text-white relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/10 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        
        {step === 1 && (
          <div className="animate-in fade-in zoom-in-95 duration-700">
            <div className="mb-12 flex justify-center">
              <div className={`p-4 rounded-full border transition-all duration-1000 ${isUnlocking ? 'border-cyan-400 bg-cyan-400/20 text-cyan-400 scale-110 shadow-[0_0_40px_rgba(34,211,238,0.5)]' : 'border-white/10 bg-zinc-900 text-zinc-500'}`}>
                {isUnlocking ? <Unlock className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
              </div>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-3xl font-black uppercase tracking-widest mb-4">Classified Access</h1>
              <p className="text-zinc-500 text-sm font-medium tracking-wide">Enter your clearance sequence to proceed.</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="relative">
                <input 
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ENTER SEQUENCE"
                  disabled={isUnlocking}
                  className="w-full bg-black border-2 border-white/10 focus:border-cyan-500 rounded-xl px-6 py-4 text-center text-2xl font-mono uppercase tracking-[0.3em] outline-none transition-all disabled:opacity-50"
                  autoFocus
                />
                {error && (
                  <p className="absolute -bottom-8 left-0 right-0 text-center text-red-500 text-xs font-bold uppercase tracking-widest animate-in slide-in-from-top-2">
                    {error}
                  </p>
                )}
              </div>

              <button 
                type="submit"
                disabled={!code || isUnlocking}
                className="w-full bg-white text-black hover:bg-cyan-400 hover:text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all disabled:opacity-50 disabled:hover:bg-white"
              >
                {isUnlocking ? 'Decrypting...' : 'Authenticate'}
              </button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="mb-12 flex justify-center">
              <div className="p-4 rounded-full border border-cyan-400 bg-cyan-400/10 text-cyan-400 animate-pulse">
                <Sparkles className="w-8 h-8" />
              </div>
            </div>

            <div className="text-center mb-12 space-y-6">
              <h1 className="text-4xl font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
                Welcome to the Core
              </h1>
              <p className="text-zinc-400 text-sm font-medium leading-relaxed max-w-sm mx-auto">
                You've been invited to shape the nightlife of the city. As an early pioneer, your feedback will define the future of DTL Nightly.
              </p>
            </div>

            <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl mb-8">
              <h3 className="font-bold uppercase tracking-widest text-xs text-zinc-500 mb-4">Your Objectives</h3>
              <ul className="space-y-4 text-sm font-medium">
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Claim and manage venues
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Test the responder safety network
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Provide unfiltered feedback
                </li>
              </ul>
            </div>

            <button 
              onClick={() => router.push('/login')}
              className="w-full group bg-cyan-500 text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:bg-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] flex items-center justify-center gap-2"
            >
              Initialize Profile
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
