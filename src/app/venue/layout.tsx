import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function VenueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/login?next=/venue');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, venue_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'venue_manager' || !profile.venue_id) {
    redirect('/'); // Unauthorized users are kicked out
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-fuchsia-500 selection:text-white pb-20">
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tighter uppercase flex items-center gap-2">
          <span className="text-fuchsia-500">◆</span>
          Venue Portal
        </h1>
        <div className="flex gap-4">
          <a href="/venue" className="text-xs font-bold text-gray-400 hover:text-white uppercase transition-colors">Dashboard</a>
          <a href="/venue/scan" className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 uppercase transition-colors">Scan Pass</a>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        {children}
      </main>
    </div>
  );
}
