import { createClient, createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect('/login');
  }

  const adminSupabase = await createAdminClient();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-12 font-sans max-w-[800px] mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400">
          Profile Settings
        </h1>
        <Link href="/" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold transition-colors">
          Back to Map
        </Link>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-neutral-800 shadow-xl bg-neutral-800">
              {profile?.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-neutral-600 uppercase">
                  {profile?.first_name?.[0] || authData.user.email?.[0] || 'U'}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-6 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">First Name</label>
                <div className="p-3 bg-black/50 border border-neutral-800 rounded-xl text-neutral-300 font-medium">
                  {profile?.first_name || 'Not set'}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Last Name</label>
                <div className="p-3 bg-black/50 border border-neutral-800 rounded-xl text-neutral-300 font-medium">
                  {profile?.last_name || 'Not set'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Email Address</label>
              <div className="p-3 bg-black/50 border border-neutral-800 rounded-xl text-neutral-300 font-medium">
                {authData.user.email}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Account Role</label>
              <div className="p-3 bg-black/50 border border-neutral-800 rounded-xl text-cyan-400 font-bold uppercase tracking-widest text-sm">
                {(profile?.role || 'citizen').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-neutral-800">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Nightlife Preferences</h2>
            <Link href="/onboarding?next=/profile" className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-sm font-bold transition-colors">
              Update Preferences
            </Link>
          </div>
          
          {profile?.preferences && Object.keys(profile.preferences).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-black/30 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Drinks</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.preferences.drinks?.map((d: string) => (
                    <span key={d} className="px-2 py-1 bg-neutral-800 text-neutral-300 text-xs rounded-md">{d}</span>
                  )) || <span className="text-neutral-600 text-sm">None</span>}
                </div>
              </div>
              <div className="p-4 bg-black/30 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Cuisine</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.preferences.cuisine?.map((c: string) => (
                    <span key={c} className="px-2 py-1 bg-neutral-800 text-neutral-300 text-xs rounded-md">{c}</span>
                  )) || <span className="text-neutral-600 text-sm">None</span>}
                </div>
              </div>
              <div className="p-4 bg-black/30 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Vibe</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.preferences.vibe?.map((v: string) => (
                    <span key={v} className="px-2 py-1 bg-purple-900/30 text-purple-400 border border-purple-500/20 text-xs rounded-md">{v}</span>
                  )) || <span className="text-neutral-600 text-sm">None</span>}
                </div>
              </div>
              <div className="p-4 bg-black/30 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Habits</h3>
                <div className="flex gap-4">
                  <span className="px-2 py-1 bg-neutral-800 text-neutral-300 text-xs rounded-md">
                    Cost: {profile.preferences.habits?.affordability || 'N/A'}
                  </span>
                  <span className="px-2 py-1 bg-neutral-800 text-neutral-300 text-xs rounded-md">
                    Hours: {profile.preferences.habits?.schedule || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-black/30 border border-neutral-800 rounded-xl text-center">
              <p className="text-neutral-500 text-sm mb-4">You haven't set up your nightlife preferences yet.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
