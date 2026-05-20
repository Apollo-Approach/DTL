import Link from 'next/link';
import MapWrapper from '@/components/MapWrapper';
import { createClient } from '@/lib/supabase/server';
import Script from 'next/script';
import CommunityFeed from '@/components/CommunityFeed';
import SecureQR from '@/components/SecureQR';
import SafetyDashboard from '@/components/SafetyDashboard';
import NearbyOfferings from '@/components/NearbyOfferings';
import CivicEventsPanel from '@/components/CivicEventsPanel';

// Force Next.js to dynamically render this page so it never caches stale safety data
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();

  // Fetch live spatial data, social posts, AND active promotions concurrently
  const [venuesResponse, incidentsResponse, socialResponse, promosResponse, eventsResponse, authResponse] = await Promise.all([
    supabase.from('venues_public').select('*'),
    supabase.from('safety_incidents_public').select('*').neq('status', 'RESOLVED'),
    supabase.from('social_posts').select('*').order('posted_at', { ascending: false }).limit(10),
    supabase.from('promotions').select('*').gt('active_until', new Date().toISOString()),
    supabase.from('events_public').select('*'),
    supabase.auth.getUser()
  ]);

  const venues = venuesResponse.data || [];
  const incidents = incidentsResponse.data || [];
  const socialPosts = socialResponse.data || [];
  const promos = promosResponse.data || [];
  const events = eventsResponse.data || [];
  const user = authResponse.data?.user;

  let preferences = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('preferences').eq('id', user.id).single();
    preferences = profile?.preferences;
  }

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
    <main className="min-h-screen bg-black text-white p-6 md:p-8 font-sans flex flex-col max-w-[1600px] w-full mx-auto overflow-x-hidden">
      <Script
        id="schema-org-venues"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400 mb-1">
              DTL Nightly
            </h1>
            <p className="text-neutral-400 text-sm md:text-base max-w-2xl">
              Are you Down to Love Downtown London?
            </p>
          </div>
        </div>
      </header>



      {/* Mobile-First Content Flow */}
      <div className="flex flex-col gap-8 flex-grow w-full min-w-0">
        
        {/* CHUNK 1: PROXIMAL OFFERINGS SLIDES */}
        <NearbyOfferings venues={venues} promos={promos} events={events} preferences={preferences} />

        {/* CHUNK 2 & 3: MAP, SEARCH, AND SAFETY MODERATION */}
        {/* The InteractiveMap component will handle the Neon Bubbles (Chunk 2) and Mod Pin CTA (Chunk 3) */}
        <section className="w-full max-w-full min-w-0 relative z-10 flex flex-col gap-4">
          <MapWrapper venues={venues} incidents={incidents} events={events} promos={promos} preferences={preferences} />
        </section>

        {/* SAFETY MODERATION DASHBOARD */}
        <SafetyDashboard />

        {/* CIVIC EVENTS (Ticketmaster + Local Venues) */}
        <CivicEventsPanel />

        {/* CHUNK 4: JOIN CTA */}
        <section className="w-full mt-4 bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/30 rounded-2xl p-8 text-center shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-2">Join DTL Nightly</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto">Are you a venue, promoter, or interested in becoming a safety moderator? Join the network to shape the city&apos;s flow.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login?next=/dashboard" className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-purple-900/50">
              Partner as Venue
            </Link>
            <Link href="/venues" className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold py-3 px-6 rounded-xl transition-colors text-center">
              View Venue Directory
            </Link>
            <button className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
              Apply for Street Team
            </button>
          </div>
        </section>

      </div>
    </main>
  );
}
