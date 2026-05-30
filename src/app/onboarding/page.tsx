'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { savePreferences, getPreferences } from '@/app/actions/onboarding';

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next') || '/wallet';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [preferences, setPreferences] = useState({
    drinks: [] as string[],
    cuisine: [] as string[],

    habits: { affordability: '$$', schedule: 'late-night' },
  });

  useEffect(() => {
    async function loadPreferences() {
      const { success, profile } = await getPreferences();
      if (success && profile?.preferences && Object.keys(profile.preferences).length > 0) {
        setPreferences({
          drinks: profile.preferences.drinks || [],
          cuisine: profile.preferences.cuisine || [],

          habits: profile.preferences.habits || { affordability: '$$', schedule: 'late-night' },
        });
      }
      setLoadingInitial(false);
    }
    loadPreferences();
  }, []);

  if (loadingInitial) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-cyan-400 font-bold uppercase tracking-widest text-sm animate-pulse">Loading Profile...</div>;
  }

  const handleMultiSelect = (category: 'drinks' | 'cuisine', option: string) => {
    setPreferences((prev) => {
      const current = prev[category];
      if (current.includes(option)) {
        return { ...prev, [category]: current.filter((o) => o !== option) };
      }
      return { ...prev, [category]: [...current, option] };
    });
  };

  const handleHabitSelect = (key: 'affordability' | 'schedule', value: string) => {
    setPreferences((prev) => ({
      ...prev,
      habits: { ...prev.habits, [key]: value },
    }));
  };

  const submitPreferences = async () => {
    setLoading(true);
    const { success } = await savePreferences(preferences);
    if (success) {
      router.push(nextParam);
    } else {
      setLoading(false);
      alert('Failed to save preferences. Please try again.');
    }
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
    else submitPreferences();
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      {/* Progress Bar */}
      <div className="w-full flex gap-2 mb-8 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-cyan-400' : 'bg-white/10'}`} />
        ))}
      </div>

      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-black uppercase tracking-tight mb-2">What&apos;s your poison?</h1>
            <p className="text-zinc-400 text-sm mb-8 font-medium">Select all that apply.</p>
            <div className="grid grid-cols-2 gap-4">
              {['Beer', 'Wine', 'Cocktails', 'Mocktails'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleMultiSelect('drinks', opt)}
                  className={`py-6 rounded-xl border-2 font-bold uppercase tracking-widest text-sm transition-all ${
                    preferences.drinks.includes(opt)
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                      : 'border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/30'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Food vibe?</h1>
            <p className="text-zinc-400 text-sm mb-8 font-medium">Select your preferred dining style.</p>
            <div className="grid grid-cols-1 gap-4">
              {['Quick Bites / Tapas', 'Sit-down Dinner', 'Street Food / Popups', 'None, just drinks'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleMultiSelect('cuisine', opt)}
                  className={`py-5 px-6 rounded-xl border-2 font-bold uppercase tracking-widest text-xs text-left transition-all ${
                    preferences.cuisine.includes(opt)
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                      : 'border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/30'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Your Habits</h1>
            <p className="text-zinc-400 text-sm mb-8 font-medium">Help us find the right spots for you.</p>
            
            <div className="space-y-8">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Affordability</label>
                <div className="flex gap-2">
                  {['$', '$$', '$$$', '$$$$'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleHabitSelect('affordability', opt)}
                      className={`flex-1 py-4 rounded-lg font-black text-lg transition-all ${
                        preferences.habits.affordability === opt
                          ? 'bg-white text-black'
                          : 'bg-zinc-900 text-zinc-500 border border-white/10'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Schedule</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'early-evening', label: 'Early Evening (5-9PM)' },
                    { id: 'late-night', label: 'Late Night (10PM+)' }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => handleHabitSelect('schedule', opt.id)}
                      className={`py-4 px-2 text-center rounded-lg border-2 font-bold uppercase tracking-widest text-[10px] transition-all ${
                        preferences.habits.schedule === opt.id
                          ? 'border-white bg-white/10 text-white'
                          : 'border-white/10 bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <div className="w-full max-w-md mx-auto pt-8">
        <button
          onClick={nextStep}
          disabled={loading}
          className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-sm hover:bg-cyan-400 transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]"
        >
          {loading ? 'Saving...' : step === 3 ? 'Complete Profile' : 'Next'}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-cyan-400 font-bold uppercase tracking-widest text-sm animate-pulse">Loading...</div>}>
      <OnboardingWizard />
    </Suspense>
  );
}
