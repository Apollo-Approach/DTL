import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const metadata = {
  title: 'Search & Explore | DTL Nightly',
  description: 'Search events, nightlife, eateries, and arts in Downtown London. Filter by situation — find cheap drinks, live music, late night eats, and more.',
};

// Situation tag definitions
const SITUATION_CHIPS = [
  { tag: 'cheap-drinks', icon: '🍻', label: 'Cheap Drinks Tonight', color: 'amber' },
  { tag: 'live-music', icon: '🎵', label: 'Live Music', color: 'pink' },
  { tag: 'late-night', icon: '🌙', label: 'Late Night Eats', color: 'indigo' },
  { tag: 'no-cover', icon: '🚫', label: 'No Cover', color: 'emerald' },
  { tag: 'patio', icon: '☀️', label: 'Patio Season', color: 'yellow' },
  { tag: 'date-night', icon: '💕', label: 'Date Night', color: 'rose' },
  { tag: 'student-friendly', icon: '🎓', label: 'Student Friendly', color: 'blue' },
  { tag: 'craft-beer', icon: '🍺', label: 'Craft Beer', color: 'orange' },
  { tag: 'cocktails', icon: '🍸', label: 'Cocktails', color: 'purple' },
  { tag: 'dance-floor', icon: '💃', label: 'Dance Floor', color: 'fuchsia' },
] as const;

const CHIP_ACTIVE_CLASSES: Record<string, string> = {
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
  pink: 'bg-pink-500/20 text-pink-400 border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.2)]',
  indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]',
  emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.2)]',
  rose: 'bg-rose-500/20 text-rose-400 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.2)]',
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.2)]',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.2)]',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.2)]',
  fuchsia: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500 shadow-[0_0_12px_rgba(217,70,239,0.2)]',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; situation?: string }
}) {
  const supabase = await createClient();
  const query = searchParams.q || '';
  const category = searchParams.category || 'all';
  const situation = searchParams.situation || '';

  // Fetch Venues
  let venuesQuery = supabase.from('venues_public').select('*');
  if (query) {
    venuesQuery = venuesQuery.ilike('name', `%${query}%`);
  }
  // Situation tag filter at DB level
  if (situation) {
    venuesQuery = venuesQuery.contains('situation_tags', [situation]);
  }
  const { data: venues } = await venuesQuery.order('name');

  // Fetch Events
  let eventsQuery = supabase.from('events_public').select('*');
  if (query) {
    eventsQuery = eventsQuery.ilike('name', `%${query}%`);
  }
  const { data: events } = await eventsQuery.order('start_time', { ascending: true });

  // Fetch matching promotions if situation tag active
  let matchingPromos: Array<{ id: string; title: string; discount_value: string; venue_id: string; situation_tags: string[]; recurring_day: string }> = [];
  if (situation) {
    const { data: promos } = await supabase
      .from('promotions')
      .select('id, title, discount_value, venue_id, situation_tags, recurring_day')
      .contains('situation_tags', [situation])
      .gt('active_until', new Date().toISOString())
      .limit(20);
    matchingPromos = promos || [];
  }

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
            {situation && <input type="hidden" name="situation" value={situation} />}
            <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg">
              Search
            </button>
          </form>

          {/* Category Filters */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href={`/search?category=all${situation ? `&situation=${situation}` : ''}`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'all' ? 'bg-white text-black border-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              Everything
            </Link>
            <Link href={`/search?category=clubs${situation ? `&situation=${situation}` : ''}`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'clubs' ? 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🪩 Clubs/Bars
            </Link>
            <Link href={`/search?category=eateries${situation ? `&situation=${situation}` : ''}`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'eateries' ? 'bg-amber-500/20 text-amber-400 border-amber-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🍔 Eateries
            </Link>
            <Link href={`/search?category=arts${situation ? `&situation=${situation}` : ''}`} className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${category === 'arts' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}>
              🎭 Arts
            </Link>
          </div>

          {/* Situation Chips — Sprint 3.3 */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-3">What&apos;s the vibe tonight?</p>
            <div className="flex flex-wrap gap-2">
              {SITUATION_CHIPS.map(chip => {
                const isActive = situation === chip.tag;
                const href = isActive 
                  ? `/search?category=${category}${query ? `&q=${query}` : ''}`
                  : `/search?category=${category}&situation=${chip.tag}${query ? `&q=${query}` : ''}`;
                return (
                  <Link
                    key={chip.tag}
                    href={href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border transition-all ${
                      isActive 
                        ? CHIP_ACTIVE_CLASSES[chip.color] 
                        : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:bg-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {chip.icon} {chip.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-4 gap-12">
        
        {/* Sidebar — Matching Deals (when situation active) */}
        <aside className="lg:col-span-1 space-y-8">
          {situation && matchingPromos.length > 0 ? (
            <div>
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                🔥 Deals Tonight
              </h3>
              <div className="space-y-3">
                {matchingPromos.map(promo => (
                  <div key={promo.id} className="p-3 bg-zinc-900 border border-purple-500/20 rounded-xl hover:border-purple-500/40 transition-colors">
                    <p className="text-sm font-bold text-white">{promo.discount_value}</p>
                    <p className="text-xs text-zinc-500 mt-1">{promo.title}</p>
                    {promo.recurring_day && (
                      <p className="text-[10px] text-purple-400 mt-1 capitalize">Every {promo.recurring_day}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Features & Vibes</h3>
              <div className="space-y-2">
                {['Live Music', 'Patio', 'Late Night Food', 'Cocktails', 'Craft Beer', 'Vegan Options', 'Dance Floor', 'Accessible'].map(tag => (
                  <label key={tag} className="flex items-center gap-3 text-zinc-300 hover:text-white cursor-pointer group">
                    <div className="w-5 h-5 rounded border border-zinc-600 group-hover:border-cyan-500 flex items-center justify-center bg-zinc-900">
                      {/* Checkbox stub */}
                    </div>
                    <span className="text-sm font-medium">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Results Grid */}
        <div className="lg:col-span-3 space-y-12">
          
          {/* Active Situation Banner */}
          {situation && (
            <div className="p-5 bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/20 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400 font-bold uppercase tracking-widest">Filtered by vibe</p>
                <p className="text-lg font-black text-white mt-1 capitalize">
                  {SITUATION_CHIPS.find(c => c.tag === situation)?.icon} {situation.replace(/-/g, ' ')}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {filteredVenues.length} venue{filteredVenues.length !== 1 ? 's' : ''} · {matchingPromos.length} active deal{matchingPromos.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Link 
                href={`/search?category=${category}${query ? `&q=${query}` : ''}`}
                className="text-xs text-zinc-400 hover:text-white font-bold px-4 py-2 bg-zinc-900 rounded-lg border border-zinc-700 transition-colors"
              >
                Clear Filter
              </Link>
            </div>
          )}

          {/* Upcoming Events Section */}
          {category === 'all' && !situation && events && events.length > 0 && (
            <section>
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <span className="text-pink-500">🎫</span> Upcoming Events
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {events.slice(0, 6).map((evt) => (
                  <div key={evt.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-pink-500/50 transition-colors group">
                    <div className="text-xs text-pink-400 font-bold mb-2 uppercase tracking-wide">
                      {new Date(evt.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              {situation && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full border border-purple-500/30 font-semibold ml-2">{filteredVenues.length}</span>}
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
                    
                    {/* Situation Tags */}
                    {venue.situation_tags && venue.situation_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {venue.situation_tags.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full border border-zinc-700 font-bold capitalize">
                            {tag.replace(/-/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    
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
