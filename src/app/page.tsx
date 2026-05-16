import MapWrapper from '@/components/MapWrapper';
import { createClient } from '@/lib/supabase/server';
import Script from 'next/script';
import CommunityFeed from '@/components/CommunityFeed';
import SecureQR from '@/components/SecureQR';
import SafetyTicker from '@/components/SafetyTicker';

// Force Next.js to dynamically render this page so it never caches stale safety data
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();

  // Fetch live spatial data, social posts, AND active promotions concurrently
  const [venuesResponse, incidentsResponse, socialResponse, promosResponse] = await Promise.all([
    supabase.from('venues_public').select('*'),
    supabase.from('safety_incidents_public').select('*').neq('status', 'RESOLVED'),
    supabase.from('social_posts').select('*').order('posted_at', { ascending: false }).limit(10),
    supabase.from('promotions').select('*').gt('active_until', new Date().toISOString())
  ]);

  const venues = venuesResponse.data || [];
  const incidents = incidentsResponse.data || [];
  const socialPosts = socialResponse.data || [];
  const promos = promosResponse.data || [];

  // Generate Schema.org JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': venues.map((venue, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'LocalBusiness',
        'name': venue.name,
        'description': venue.description,
        'address': {
          '@type': 'PostalAddress',
          'streetAddress': venue.address,
          'addressLocality': 'London',
          'addressRegion': 'ON',
          'addressCountry': 'CA'
        },
        'geo': {
          '@type': 'GeoCoordinates',
          'latitude': venue.lat,
          'longitude': venue.lng
        }
      }
    }))
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-8 font-sans flex flex-col max-w-[1600px] mx-auto">
      <Script
        id="schema-org-venues"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400 mb-4">
              DTL Nightly
            </h1>
            <p className="text-neutral-400 text-lg md:text-xl max-w-2xl">
              More culture. More coordination. More safety. More fun. <br/>
              Discover venues, pop-ups, and live events in downtown London.
            </p>
          </div>
          
          {incidents.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 px-4 py-3 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <span className="text-sm font-bold uppercase tracking-wide">
                {incidents.length} Active Mediator{incidents.length > 1 ? 's' : ''} Dispatched
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Phase 3.3: Civic Safety Ticker */}
      <SafetyTicker />

      {/* Main Content Grid */}
      <div className="flex flex-col lg:flex-row gap-8 flex-grow">
        <section className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto max-h-[700px] pr-2">
          <h2 className="text-2xl font-bold border-b border-neutral-800 pb-2 flex items-center justify-between"> 
            Directory 
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full border border-purple-500/30 font-semibold uppercase tracking-wider">
              Live Network
            </span>
          </h2>
          <ul className="flex flex-col gap-4">
            {venues.map((venue: any) => {
              // Filter promotions belonging to this specific venue
              const venuePromos = promos.filter((p: any) => p.venue_id === venue.id);
              
              return (
              <li key={venue.id} className={`p-5 bg-neutral-900 border ${venue.status === 'POP_UP' ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-neutral-800'} rounded-xl hover:border-purple-500 transition-colors relative overflow-hidden`}>
                <article>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-xl font-bold text-neutral-100 pr-4">{venue.name}</h3>
                    {venue.status === 'POP_UP' && (
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded whitespace-nowrap">
                        Pop-up
                      </span>
                    )}
                  </div>
                  <address className="not-italic text-sm text-purple-400 mb-3 font-mono">
                    {venue.address}
                  </address>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    {venue.description}
                  </p>

                  {/* Phase 3: Secure Ticket Accordion */}
                  {venuePromos.map((promo: any) => (
                    <details key={promo.id} className="mt-4 group">
                      <summary className="list-none cursor-pointer bg-gradient-to-r from-purple-600/20 to-cyan-500/20 border border-purple-500/30 rounded-lg p-3 text-sm font-bold text-purple-300 hover:text-white transition-colors flex items-center justify-between outline-none">
                        🎁 {promo.discount_value}
                        <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded-full group-open:hidden shadow-lg shadow-purple-500/50">Reveal QR</span>
                      </summary>
                      <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <SecureQR 
                          promotionId={promo.id}
                          venueName={venue.name}
                          discountValue={promo.discount_value}
                          title={promo.title}
                        />
                      </div>
                    </details>
                  ))}
                </article>
              </li>
            )})}
          </ul>
          <CommunityFeed initialPosts={socialPosts} />
        </section>

        <section className="w-full lg:w-2/3 h-[500px] lg:h-[700px] relative z-10">
          <MapWrapper venues={venues} incidents={incidents} />
        </section>
      </div>
    </main>
  );
}
