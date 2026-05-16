# London Civic Dashboard (DTL)

A 3D, interactive digital twin of downtown London, Ontario, designed for civic engagement, safety incident reporting, and real-time transit monitoring.

## Core Features
1. **Real-time Transit Engine**: Ingests the LTC GTFS-Realtime feed to render live 3D bus movement. Includes predictive crowd-levels, ghost bus detection (stale GPS), and dynamic congestion mapping.
2. **Anonymous Incident Reporting**: Allows zero-friction "Mod Pin" drops for civic safety issues, utilizing Supabase's anonymous sessions.
3. **Map Decluttering**: Accessible default-state that hides overwhelming venue data until explicitly queried by the user via the Filter panel.
4. **Verified Moderator Access**: Gated Google OAuth flow for verified personnel (e.g., London Cares, London Police) to view aggregate civic data.
5. **Safe Nighttime Routing**: Calculates heavily trafficked, well-lit pedestrian corridors to guide citizens home safely after nightlife events.

## Tech Stack
- **Framework**: Next.js 14 App Router
- **Map Engine**: MapLibre GL JS
- **Auth & Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **APIs**: LTC GTFS (Transit), HonkMobile (Parking)

## Getting Started
1. `npm install`
2. Ensure you have your `.env.local` configured with your Supabase URL and Anon Key.
3. Start the dev server: `npm run dev`

## Known Quirks
- **LTC Feed Caching**: The external LTC proxy servers aggressively cache their JSON payload. The backend `/api/civic/transit` route must manually append a cache-busting timestamp (`?t=${Date.now()}`) to the upstream fetch to ensure fresh coordinates every 15 seconds.
- **MapLibre 3D Math**: When generating dynamic 3D polygons (e.g., the bus bodies), the exterior coordinate ring must be mapped in a strictly CLOCKWISE winding order, otherwise MapLibre will cull the extrusion as a hole.
