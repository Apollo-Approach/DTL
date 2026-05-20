import { createClient as createBasicClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createBasicClient(supabaseUrl, supabaseKey);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseClient();
  const { data: venue } = await supabase
    .from('venues_public')
    .select('name, description')
    .eq('id', id)
    .single();

  if (!venue) return { title: 'Venue Not Found' };

  return {
    title: `${venue.name} | DTL Nightly`,
    description: venue.description,
  };
}

export async function generateStaticParams() {
  // Generate pages for all venues dynamically at build time
  const supabase = getSupabaseClient();
  const { data: venues } = await supabase.from('venues_public').select('id');
  return (venues || []).map((v: { id: string }) => ({ id: v.id }));
}

export const dynamicParams = true;

export default async function VenueProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  // Fetch the Venue
  const { data: venue, error: venueError } = await supabase
    .from('venues_public')
    .select('*')
    .eq('id', id)
    .single();

  if (venueError || !venue) {
    notFound();
  }

  // Fetch Upcoming Events for this venue
  const now = new Date().toISOString();
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('venue_id', id)
    .gte('end_time', now) // Only upcoming or currently running events
    .order('start_time', { ascending: true });

  const hasEvents = events && events.length > 0;

  // Fetch Promotions / Specials for this venue
  const { data: promotions } = await supabase
    .from('promotions')
    .select('*')
    .eq('venue_id', id)
    .order('recurring_day', { ascending: true });

  const hasPromotions = promotions && promotions.length > 0;

  // Get today's day name for highlighting current specials
  const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // Group promotions by day
  const promosByDay: Record<string, typeof promotions> = {};
  if (promotions) {
    for (const promo of promotions) {
      const day = promo.recurring_day || 'other';
      if (!promosByDay[day]) promosByDay[day] = [];
      promosByDay[day].push(promo);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans pb-24">
      {/* Brutalist/Minimal Navigation */}
      <nav className="w-full border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-50">
        <Link href="/venues" className="text-sm font-bold text-zinc-400 hover:text-white uppercase tracking-widest transition-colors">
          ← Directory
        </Link>
        <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-500 font-black">DTL Nightly</span>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Venue Header - Brutalist Typography */}
        <header className="mb-16 border-b border-white/10 pb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="px-3 py-1 text-[10px] font-bold tracking-[0.15em] text-black bg-white uppercase">
              {venue.type || 'VENUE'}
            </span>
            {venue.status === 'POP_UP' && (
              <span className="px-3 py-1 text-[10px] font-bold tracking-[0.15em] text-black bg-cyan-400 uppercase shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                POP-UP
              </span>
            )}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-4 uppercase break-words">
            {venue.name}
          </h1>
          
          {/* Google Rating Badge */}
          {venue.offerings?.maps_grounding_lite?.rating && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 px-4 py-2">
                <span className="text-yellow-400 text-lg">★</span>
                <span className="text-white font-black text-lg">{venue.offerings.maps_grounding_lite.rating}</span>
                {venue.offerings.maps_grounding_lite.user_ratings_total && (
                  <span className="text-zinc-500 text-sm font-medium ml-1">
                    ({venue.offerings.maps_grounding_lite.user_ratings_total.toLocaleString()} reviews)
                  </span>
                )}
              </div>
              {venue.offerings?.maps_grounding_lite?.price_level && (
                <span className="text-green-400 font-bold text-sm bg-zinc-900 border border-zinc-700 px-3 py-2">
                  {'$'.repeat(venue.offerings.maps_grounding_lite.price_level)}
                </span>
              )}
            </div>
          )}
          
          <p className="text-xl md:text-2xl text-zinc-400 font-medium leading-relaxed max-w-2xl mb-8">
            {venue.description}
          </p>

          {/* Meta Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-medium text-zinc-500 bg-zinc-900/40 p-6 border border-white/5">
            <div>
              <div className="uppercase tracking-widest text-[10px] text-zinc-600 mb-1">Location</div>
              <div className="text-zinc-300">{venue.address}</div>
              {/* Map link */}
              <a href={`https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 inline-block mt-2 font-bold uppercase tracking-wide text-xs">
                ↗ View on Map
              </a>
            </div>
            
            {venue.website_url && (
              <div>
                <div className="uppercase tracking-widest text-[10px] text-zinc-600 mb-1">Web</div>
                <a href={venue.website_url} target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-white transition-colors truncate block">
                  {venue.website_url.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            
            {venue.operating_hours && (
              <div className="md:col-span-2 mt-2 pt-4 border-t border-white/5">
                <div className="uppercase tracking-widest text-[10px] text-zinc-600 mb-2">Hours</div>
                <div className="text-zinc-300 font-mono text-xs whitespace-pre-wrap">
                  {JSON.stringify(venue.operating_hours, null, 2).replace(/[{}"]/g, '')}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Deep-Dive Intel (Hybrid Pipeline) */}
        {(venue.offerings?.vibe_analysis || venue.offerings?.pricing_intel || (venue.offerings?.menu_highlights && venue.offerings.menu_highlights.length > 0)) && (
          <section className="mb-16">
            <div className="flex items-end justify-between mb-8 pb-4 border-b border-white/10">
              <h2 className="text-3xl font-black uppercase tracking-tight">The Vibe & Intel</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {venue.offerings?.vibe_analysis && (
                <div className="bg-zinc-900/60 border border-zinc-800 p-6">
                  <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-4">Vibe Analysis</h3>
                  <p className="text-zinc-300 leading-relaxed">{venue.offerings.vibe_analysis}</p>
                </div>
              )}
              
              <div className="flex flex-col gap-8">
                {venue.offerings?.pricing_intel && (
                  <div className="bg-zinc-900/60 border border-zinc-800 p-6">
                    <h3 className="text-sm font-bold text-green-400 uppercase tracking-widest mb-4">Pricing & Cover</h3>
                    <p className="text-zinc-300 leading-relaxed">{venue.offerings.pricing_intel}</p>
                  </div>
                )}
                
                {venue.offerings?.menu_highlights && venue.offerings.menu_highlights.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800 p-6">
                    <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest mb-4">Menu Highlights</h3>
                    <ul className="list-none space-y-2">
                      {venue.offerings.menu_highlights.map((item: string, i: number) => (
                        <li key={i} className="text-zinc-300 flex items-start gap-2">
                          <span className="text-orange-400">❖</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Weekly Specials & Deals */}
        {hasPromotions && (
          <section className="mb-16">
            <div className="flex items-end justify-between mb-8 pb-4 border-b border-white/10">
              <h2 className="text-3xl font-black uppercase tracking-tight">Specials & Deals</h2>
              <div className="text-xs font-bold text-green-400 uppercase tracking-widest bg-green-400/10 border border-green-400/20 px-3 py-1 rounded-sm">
                Weekly
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {dayOrder.map((day) => {
                const dayPromos = promosByDay[day];
                if (!dayPromos || dayPromos.length === 0) return null;
                const isToday = day === todayDay;

                return dayPromos.map((promo, i) => (
                  <div
                    key={`${day}-${i}`}
                    className={`flex items-stretch border transition-colors ${
                      isToday
                        ? 'border-green-500/40 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.08)]'
                        : 'border-white/10 bg-black hover:border-zinc-600'
                    }`}
                  >
                    {/* Day badge */}
                    <div className={`flex items-center justify-center w-28 shrink-0 p-4 border-r ${
                      isToday ? 'border-green-500/20 bg-green-500/10' : 'border-white/10 bg-zinc-900'
                    }`}>
                      <div className="text-center">
                        <div className={`text-xs font-black uppercase tracking-widest ${
                          isToday ? 'text-green-400' : 'text-zinc-500'
                        }`}>
                          {day.slice(0, 3)}
                        </div>
                        {isToday && (
                          <div className="text-[9px] font-bold text-green-500 uppercase tracking-widest mt-1">
                            Today
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Deal content */}
                    <div className="flex-1 p-4 md:p-5">
                      <p className={`font-bold leading-snug ${
                        isToday ? 'text-white' : 'text-zinc-300'
                      }`}>
                        {promo.description}
                      </p>
                      {(promo.active_from_time || promo.active_until_time) && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            ⏰ {promo.active_from_time?.slice(0, 5) || 'Open'}
                            {' — '}
                            {promo.active_until_time?.slice(0, 5) || 'Close'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })}
            </div>

            {/* Source Attribution */}
            <div className="mt-4 text-right">
              <a
                href="https://londonfoodspecials.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Source: London Food Specials ↗
              </a>
            </div>
          </section>
        )}

        {/* Events Schedule (The Core of RA Style) */}
        <section>
          <div className="flex items-end justify-between mb-8 pb-4 border-b border-white/10">
            <h2 className="text-3xl font-black uppercase tracking-tight">Schedule</h2>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-sm">
              Upcoming
            </div>
          </div>

          {!hasEvents && (!venue.offerings?.upcoming_events || venue.offerings.upcoming_events.length === 0) ? (
            <div className="py-12 text-center bg-zinc-900/20 border border-dashed border-white/10">
              <p className="text-zinc-500 font-medium tracking-wide uppercase text-sm">No upcoming events scheduled.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Structured Database Events */}
              {events && events.map((evt) => {
                const startDate = new Date(evt.start_time);
                const day = startDate.toLocaleDateString('en-US', { weekday: 'short' });
                const dateNum = startDate.getDate().toString().padStart(2, '0');
                const month = startDate.toLocaleDateString('en-US', { month: 'short' });
                const time = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                return (
                  <div key={evt.id} className="group relative flex flex-col md:flex-row md:items-center bg-black border border-white/10 hover:border-zinc-500 transition-colors">
                    {/* Date Block */}
                    <div className="flex items-center md:flex-col md:justify-center bg-zinc-900 md:w-32 p-4 md:border-r border-white/10">
                      <div className="text-sm font-bold text-zinc-500 uppercase tracking-widest mr-4 md:mr-0 md:mb-1">{day}</div>
                      <div className="text-2xl font-black text-white">{dateNum} {month}</div>
                    </div>
                    
                    {/* Details */}
                    <div className="flex-1 p-5 md:p-6">
                      <h3 className="text-xl font-bold text-white uppercase tracking-tight mb-2 group-hover:text-cyan-400 transition-colors">
                        {evt.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-bold tracking-wider uppercase text-zinc-500">
                        <span className="text-zinc-300">{time}</span>
                        <span>•</span>
                        {evt.is_free ? (
                          <span className="text-green-400">Free Entry</span>
                        ) : (
                          <span className="text-pink-500">Tickets ${evt.price}</span>
                        )}
                        {evt.age_restriction && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">{evt.age_restriction}</span>
                          </>
                        )}
                        {evt.venue_subroom && evt.venue_subroom !== 'London Music Hall' && (
                          <>
                            <span>•</span>
                            <span className="text-purple-400">@ {evt.venue_subroom}</span>
                          </>
                        )}
                        {evt.categories && evt.categories.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{evt.categories.join(', ').replace(/_/g, ' ')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Synthesized LLM Events */}
              {venue.offerings?.upcoming_events && venue.offerings.upcoming_events.map((evt: string, i: number) => (
                  <div key={`llm-${i}`} className="group relative flex flex-col md:flex-row md:items-center bg-black border border-dashed border-white/10 hover:border-cyan-500 transition-colors">
                    <div className="flex items-center md:flex-col md:justify-center bg-zinc-900/50 md:w-32 p-4 md:border-r border-dashed border-white/10">
                      <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest text-center">Web Alert</div>
                    </div>
                    
                    <div className="flex-1 p-5 md:p-6">
                      <h3 className="text-lg font-bold text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors">
                        {evt}
                      </h3>
                      <p className="text-xs font-bold tracking-wider uppercase text-zinc-500 mt-2">
                        Source: Automatically Extracted from Website
                      </p>
                    </div>
                  </div>
              ))}
            </div>
          )}
        </section>

        {/* Claim Listing CTA */}
        <section className="mt-24 pt-12 border-t border-white/10 text-center">
          <p className="text-zinc-500 font-medium mb-6 uppercase tracking-widest text-xs">Is this your business?</p>
          <a href={`/login?next=/venues/${venue.id}/claim`} className="inline-block px-8 py-4 bg-white text-black font-black uppercase tracking-widest text-sm hover:bg-cyan-400 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            Claim This Page
          </a>
        </section>

      </main>
    </div>
  );
}
