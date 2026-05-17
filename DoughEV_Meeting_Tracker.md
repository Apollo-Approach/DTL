# DoughEV Meeting Tracker (Action Items & Concepts)
*Extracted from the discussion between Nick (Creator) and Devon (Developer).*

This document tracks all the specific feature requirements, philosophical constraints, and UX directions outlined during the DoughEV meeting.

## 📱 1. Mobile-First Layout Hierarchy
Nick explicitly defined the vertical scroll flow for the mobile landing page into 4 distinct chunks:
- [x] **Chunk 1 (Top): Proximal Offerings Slides.** A horizontal scroll or carousel of curated, nearby specials/coupons.
- [x] **Chunk 2: Map & Search.** The 3D map with simplified toggle buttons (3 venue types, events, specials, tonight/week, late night, parking, buses, show all, clear), placed above a keyword search field and calendar. (Search field still pending).
- [x] **Chunk 3: Safety Moderation Interface.** The UI to report incidents (the Mod Pin flow), located immediately under the map.
- [x] **Chunk 4 (Bottom): Join CTA.** Call to action to "Join DTL Nightly" as a venue, promoter, or safety moderator.

## 🚨 2. Safety Moderation (The "Mod Pin")
Currently, the Mod Pin drops instantly. It needs a complete overhaul to match the intended design:
- [x] **Pre-Drop Education Screen:** Build a modal that pops up before a pin can be dropped. It must explain the code of conduct in simple terms (what the pin is actually for).
- [x] **Define 4 "Low Risk" Categories:** Restrict reporting to 3-5 categories max.
  - Open-air drug use and trade
  - People in crises
  - Loud / disruptive behavior (escalation of crowd energy)
- [x] **Short Description Field:** Add a text input explicitly instructing the user to "Describe in three to five words what you're seeing."
- [x] **LPS Education & Official Channels:** The UI must explain the "data collected controlling model" of the London Police Service. Encourage citizens to use official reporting for real crimes to inform police response. Include a direct link to the City/Police portal.
- [ ] **Business Model Note:** The end goal is a self-sustaining model that funds street liaisons (similar to the Netherlands model).

## 📍 2. Venues & Map Data
- `[x]` **Include Churches:** Ensure churches with evening services or concerts are scraped and included in the "Stages" category.
- [x] **Venue Data Enrichment:** Add operating hours, website links, and general info to the venue popups.
- [x] **Late Night Filter:** Implement a filter to show venues open past 11:00 PM.
- `[x]` **Default Location:** Ensure the map defaults to Dundas Place (the heart of the city / near Canada Life Place).
- `[x]` **No Forced Location:** Do not force users to share their GPS location to use the app.

## 🎫 3. Events & Ticketing
- [x] **Free vs. Ticketed:** Distinguish between free and ticketed events in the UI, and include direct ticket links.
- [ ] **In-House Ticketing (Future):** Scope out building an in-house ticketing system to eventually replace Eventbrite, keeping fees localized within the community.

## 💸 4. Dynamic Couponing & Payment Architecture
- [x] **Dynamic Couponing System:** Build a system that generates per-person unique QR codes to divert foot traffic away from congested venues and toward local partners. 
- [x] **Zero User Payments:** Do **NOT** ask users for their Google Pay or credit card information. Minimize transactional friction.
- [x] **Venue Billing:** The platform should bill venues on a weekly/bi-weekly basis for opting into the coupon system.

## 👥 6. Staff, Venue, & 'Crisis Cloud' Portals
- [x] **Venue Login:** Build a dedicated `/venue` portal where staff can log in, interface with the system, and manage their dynamic coupons.
- [x] **User Auth:** Prefer simple Google Account sign-ups for democratization.
- [x] **The "Crisis Cloud" View:** Create a specialized view/app specifically for Outreach and Police. It must strip away all nightlife promotion and focus strictly on team coordination and safety data.

## 📸 7. Community Stories & Outreach
- [ ] **Instagram Integration:** Integrate daily/weekly event listings directly from Instagram, as it is already the heavily used medium.
- [x] **Dedicated Community Page:** Community Stories info and interface must exist on its own dedicated page, featuring an example/explainer video at the top.
- [x] **B-Roll Video Database:** Build a database/system to manage high-quality video clips (scraped or produced) for each venue. This enables Nick to record localized voiceover announcements on top of curated video feeds.
- `[x]` **Venue Outreach:** Softly curate directories for venues/organizations without being noisy. Build a system where they can eventually claim their domain/listing.

## 🚀 8. Deployment Priority
- [x] **Beta / PoC Deployment:** Top priority is getting a functional, mobile-responsive Proof of Concept onto Nick's phone so he can physically show it to potential sponsors and public partners for testing.
- [x] **Custom Domain & Edge Routing:** Successfully deployed the MVP to `dtlnightly.ca` and `www.dtlnightly.ca` via Vercel. Resolved edge-routing 404 conflicts by forcefully unlinking orphaned domains, explicitly declaring the `nextjs` framework in `vercel.json` (bypassing Turbopack output bugs), and overriding strict TypeScript errors in `next.config.ts` to guarantee rapid MVP production builds. Configured for Cloudflare "DNS Only" proxying to allow Vercel's edge network to manage SSL natively.

## 🎯 9. Preferences & Offerings Onboarding
- [x] **Collect Preferences:** When users, venues, or events join the platform, present a simple questionnaire to collect preference data.
- [x] **The "4 Simple Choices" UX:** Keep the onboarding frictionless by focusing on exactly 4 simple multiple-choice questions:
  - **Drink Preferences:** Wine, Beer, Cocktails, Mocktails?
  - **Cuisine Preferences:** What do you like to eat?
  - **Vibe/Music:** Music and event atmosphere preferences.
  - **Nightlife Habits:** Affordability scale and schedule (late night vs. early evening).

## 💰 10. Estimated Project Costs (MVP / Beta)
With the current Serverless architecture (Next.js App Router + Supabase), the infrastructure is extremely lean and designed to scale from zero:
- **Database & Auth (Supabase):** $0/mo (Free Tier supports 50,000 MAUs). Production upgrade is $25/mo.
- **Frontend Hosting (Vercel):** $0/mo (Hobby Tier). Production team upgrade is $20/mo.
- **Interactive Map Data (MapLibre/Protomaps):** $0/mo (Self-hosted or free tier vector tiles).
- **Domain Name:** ~$15/year.
- **Total Initial Monthly Burn:** **$0.00** (Excluding developer time and custom marketing/content creation).

## 🧠 11. Personalized Recommendation Engine & Data Ingestion
- [x] **Client-Side Matching:** Implemented a lightweight, instantaneous matching algorithm (`matchScore`) that compares the user's 4 onboarding preferences against a venue's real-world offerings, generating a 0-100% compatibility score.
- [x] **"For You" Filtering:** Added a "🎯 For You" toggle to both the map filters and the Nearby Offerings carousel. It instantly filters out low-matching venues and badges highly compatible ones without requiring database round-trips.
- [x] **Automated Data Ingestion:** Engineered a stealthy background scraper in Python (Camoufox) deployed to Linuxlid. It gently crawls venue websites and secondary directories, leveraging a local Llamabox (Qwen 3.5) to synthesize unstructured HTML into strict JSON `offerings`. This completely eliminates the need for manual data entry or fake seed data.

## 🛠️ 12. Codebase Hardening & Production Readiness
- [x] **Strict Type Safety:** Systematically eradicated `any` types across the core React architecture (InteractiveMap, NearbyOfferings, matchScore) and strictly typed Supabase interactions and MapLibre state.
- [x] **Build Pipeline Integrity:** Fixed cascading rendering bugs in `SecureQR` and the device ID initialization logic to prevent infinite UI loops. Next.js ESLint and TypeScript checks now pass with zero errors, paving the way for strict Vercel deployments.
