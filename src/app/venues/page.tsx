import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const metadata = {
  title: 'Venue Directory | DTL Nightly',
  description: 'Explore the stages, eateries, and nightlife of Downtown London.',
};

export default async function VenuesDirectory() {
  const supabase = await createClient();

  // Fetch all venues ordered by name
  const { data: venues, error } = await supabase
    .from('venues_public')
    .select('*')
    .order('name');

  if (error) {
    console.error("Error fetching venues:", error);
  }

  // Group venues by category (assuming we will infer from type or just list them all)
  // For the MVP directory, we'll list them out in a responsive grid.

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-cyan-500 selection:text-white pb-20">
      
      {/* Header Section */}
      <header className="relative pt-16 pb-12 px-6 border-b border-white/10 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            LONDON <span className="text-cyan-400">NIGHTLIFE</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl font-medium max-w-xl leading-relaxed">
            Discover the definitive directory of stages, clubs, eateries, and creative spaces driving the core.
          </p>
        </div>
      </header>

      {/* Directory Grid */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {venues?.length === 0 ? (
          <div className="text-center py-20 border border-white/10 rounded-2xl bg-zinc-900/30">
            <p className="text-zinc-500 font-medium">No venues found in the directory.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {venues?.map((venue) => {
              const isPopUp = venue.status === 'POP_UP';
              return (
                <Link 
                  href={`/venues/${venue.id}`} 
                  key={venue.id}
                  className="group block relative rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-white/20 transition-all duration-300 overflow-hidden shadow-2xl"
                >
                  {/* Glassmorphism gradient effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-purple-500/0 group-hover:from-cyan-500/10 group-hover:to-purple-500/10 transition-colors duration-500" />
                  
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-lg bg-black border border-white/10 flex items-center justify-center text-xl shadow-inner">
                        {venue.type === 'church' ? '🏛️' : venue.type === 'club' ? '🍸' : venue.type === 'restaurant' ? '🍽️' : '📍'}
                      </div>
                      {isPopUp && (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-cyan-400 bg-cyan-400/10 rounded-full border border-cyan-400/20 uppercase">
                          Pop-Up
                        </span>
                      )}
                    </div>
                    
                    <h2 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {venue.name}
                    </h2>
                    
                    <p className="text-sm text-zinc-400 font-medium line-clamp-2 mb-4 leading-relaxed">
                      {venue.description || 'Downtown London venue.'}
                    </p>
                    
                    <div className="flex items-center text-xs text-zinc-500 font-medium tracking-wide uppercase">
                      <span>{venue.type || 'VENUE'}</span>
                      <span className="mx-2">•</span>
                      <span className="truncate">{venue.address.split(',')[0]}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      
      {/* Footer CTA */}
      <section className="border-t border-white/5 py-16 px-6 text-center">
        <h3 className="text-xl font-bold text-zinc-300 mb-4">Don&apos;t see your business?</h3>
        <p className="text-zinc-500 text-sm mb-6 max-w-sm mx-auto">
          We are actively curating the definitive directory of downtown London.
        </p>
        <button className="px-6 py-3 rounded-full bg-zinc-800 text-white font-bold text-sm tracking-wide hover:bg-zinc-700 transition-colors border border-white/10">
          SUBMIT A LISTING
        </button>
      </section>
    </div>
  );
}
