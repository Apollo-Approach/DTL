import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const metadata = {
  title: 'Search & Explore | DTL Nightly',
  description: 'Search events, nightlife, eateries, and arts in Downtown London.',
};



export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string }
}) {
  const supabase = await createClient();
  const query = searchParams.q || '';
  const category = searchParams.category || 'all';

  // Fetch Venues
  let venuesQuery = supabase.from('venues_public').select('*');
  if (query) {
    venuesQuery = venuesQuery.ilike('name', `%${query}%`);
  }

  const { data: venues } = await venuesQuery.order('name');

  // Fetch Events
  let eventsQuery = supabase.from('events_public').select('*');
  if (query) {
    eventsQuery = eventsQuery.ilike('name', `%${query}%`);
  }
  const { data: events } = await eventsQuery.order('start_time', { ascending: true });



  // Client-side category filtering
  const filteredVenues = venues?.filter(v => {
    if (category === 'clubs') return v.type === 'club' || v.type === 'bar' || v.type === 'nightclub' || v.type === 'pub' || v.type === 'lounge';
    if (category === 'eateries') return v.type === 'restaurant' || v.type === 'cafe' || v.type === 'diner' || v.type === 'bakery';
    if (category === 'arts') return v.type === 'venue' || v.type === 'church' || v.type === 'theater' || v.type === 'live_music_venue';
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-cyan-500 selection:text-white pb-20">
      
      {/* Header Section */}
      <header className="relative pt-16 pb-12 px-6 border-b border-white/10 bg-gradient-to-b from-zinc-900 to-black">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            EXPLORE <span className="text-pink-500">DTL</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl font-medium max-w-xl leading-relaxed mb-8">
            Deep search into the core&apos;s events, clubs, eateries, and stages.
          </p>
          
          <form className="flex flex-col md:flex-row gap-4" action="/search">
            <input 
              type="text" 
              name="q"
              defaultValue={query}
              placeholder="Search venues, artists, or keywords..."
              className="flex-grow bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
            />
            {/* Preserve active filters when searching */}
            {category !== 'all' && <input type="hidden" name="category" value={category} />}

            <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg">
              Search
            </button>
          </form>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href={`/search?category=all`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'all' ? 'bg-white text-black border-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              Everything
            </Link>
            <Link href={`/search?category=clubs`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'clubs' ? 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🪩 Clubs/Bars
            </Link>
            <Link href={`/search?category=eateries`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'eateries' ? 'bg-amber-500/20 text-amber-400 border-amber-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🍔 Eateries
            </Link>
            <Link href={`/search?category=arts`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'arts' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🎭 Arts
            </Link>
          </div>


        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Results Grid */}
        <div className="space-y-12">
          


          {/* Upcoming Events Section */}
          {category === 'all' && events && events.length > 0 && (
            <section>
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <span className="text-pink-500">🎫</span> Upcoming Events
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {events.slice(0, 6).map((evt) => (
                  <div key={evt.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-pink-500/50 transition-colors group">
                    <div className="text-xs text-pink-400 font-bold mb-2 uppercase tracking-wide">
                      {new Date(evt.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Toronto' })}
                      {' · '}
                      {new Date(evt.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-pink-400 transition-colors">{evt.name}</h3>
                    {evt.source_platform && (
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">via {evt.source_platform}</p>
                    )}
                    {evt.ticket_url ? (
                      <a href={evt.ticket_url} target="_blank" className="inline-flex items-center gap-1 mt-4 text-sm font-bold text-pink-400 hover:text-pink-300 transition-colors">
                        🎟️ Get Tickets →
                      </a>
                    ) : (
                      <span className="inline-block mt-4 text-sm font-bold text-emerald-400">Free Entry</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Venues Directory */}
          <section>
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
              <span className="text-cyan-500">📍</span> Venues
            </h2>
            {filteredVenues.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-zinc-800 rounded-2xl">
                <p className="text-zinc-500">No venues match your current filters.</p>
                <Link href="/search" className="text-cyan-400 font-bold text-sm mt-3 inline-block hover:text-cyan-300">
                  Clear all filters →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredVenues.map((venue) => (
                  <Link href={`/venues/${venue.id}`} key={venue.id} className="group block bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:bg-zinc-800 hover:border-cyan-500/50 transition-all">
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">{venue.name}</h3>
                    <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{venue.description || 'Downtown venue.'}</p>
                    

                    
                    <div className="flex items-center text-xs text-zinc-500 font-bold uppercase tracking-wider">
                      {venue.type}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          
        </div>
      </main>
    </div>
  );
}
