# DTL Civic Dashboard — Research Opportunities Tracker

> **Last Updated:** 2026-05-20
> **Maintainer:** Apollo Approach / Devon
> **Canonical Source:** DTL Deep Research Opportunities (10 items)

This tracker maps all research work against the **original 10 research goals** defined for the DTL Deep Research phase. Additional research conducted beyond the original scope is tracked in the [Bonus Research](#bonus-research-beyond-original-10) section.

> [!NOTE]
> Entries marked **📖 Reviewed & Integrated: Yes** have been fully read and their key findings absorbed into this tracker. There is no need to re-open those source documents unless the underlying research needs updating. New entries start as `📋 No Report` until research is conducted.

---

## Legend

| Status | Meaning |
|---|---|
| ✅ Complete | Research finalized, findings documented |
| 🔨 In Progress | Research underway, partial findings available |
| 📋 Queued | Identified as a need, not yet started |
| 🚀 Implemented | Findings have been applied to the codebase |
| ⏸️ Blocked | Waiting on external dependency or decision |

---

# 🔬 Data & Pipeline

---

## 1. London Open Data Portal

| Field | Detail |
|---|---|
| **Original Goal** | Research City of London open datasets — road closures, construction permits, parking meter status, event permits, business licenses. Make Civic Advisories real instead of RSS fallbacks. |
| **Report** | [London Open Data Portal Integration.md](./London%20Open%20Data%20Portal%20Integration.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Strategic analysis of the City of London Open Data Portal (`opendata.london.ca`) for real-time civic advisories: road closures, construction permits, parking meter inventory, special event permits, business licenses. |
| **Why** | Replace basic alerts with high-fidelity, geospatially accurate civic advisories. Enable "avoid this block tonight" and "live parking availability" features. London is experiencing fastest population growth in Canada — high density of construction/closures. |
| **Key Findings** | Portal uses Socrata/CKAN-based architecture with REST API access. Datasets available: active construction zones (GeoJSON), road closures (with date ranges), parking meter locations, special event permits. Zero licensing cost. Data is spatially bounded (lat/lng polygons) enabling block-level routing advisories. |
| **Estimated Cost** | $0 — Open data, no API key required for most datasets |
| **URL** | https://opendata.london.ca |
| **Implementation** | Not yet started. |
| **Next Steps** | Integrate road closure GeoJSON layer into MapLibre map. Build construction zone overlay with date filtering. Add parking availability data to map filter panel. Create "civic advisory" notification system for active closures near user. |

---

## 2. GTFS-RT Bus Feed Deep Dive

| Field | Detail |
|---|---|
| **Original Goal** | Research the full GTFS-Realtime spec — trip updates, vehicle positions, service alerts, and critically: `OccupancyStatus` field. Fix broken bus capacity meter for empty buses. |
| **Report** | [GTFS-RT Occupancy Data Research.md](./GTFS-RT%20Occupancy%20Data%20Research.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Deep analysis of the full GTFS-Realtime spec — trip updates, vehicle positions, service alerts — with a focus on the `OccupancyStatus` enum (`EMPTY`, `MANY_SEATS`, `FEW_SEATS`, `FULL`, etc.) and `OccupancyPercentage` fields. |
| **Why** | The bus capacity meter is a flagship feature but was broken for empty buses. GTFS-RT has a dedicated occupancy enum. If LTC transmits it, estimation is unnecessary. |
| **Key Findings** | The GTFS-RT spec fully supports `OccupancyStatus` (7 enum values, integer 0–6) and `OccupancyPercentage` (0–100) within the `VehiclePosition` message. LTC's open data infrastructure and CAD/AVL hardware (Automatic Passenger Counter) were analyzed. Protobuf deserialization edge cases (default enum value `0` = `EMPTY`) were identified as the root cause of the "always empty" bug. |
| **Estimated Cost** | $0 — LTC GTFS-RT feeds are free/open data |
| **Implementation** | Phase 1 (Foundation) includes LTC GTFS-RT ingest — **already implemented**. Occupancy-specific parsing improvements are the next step. |
| **Next Steps** | Validate live LTC feed for `OccupancyStatus` field presence. Fix Protobuf deserialization to properly handle default `EMPTY` vs. absent data. Add `OccupancyPercentage` support if available. |

---

## 3. Bandsintown / Songkick Artist APIs

| Field | Detail |
|---|---|
| **Original Goal** | Free APIs that provide concert/show data by venue. Auto-populate events for LMH, Budweiser Gardens, Centennial Hall without scraping. |
| **Report** | [Venue Event API Research Strategy.md](./Venue%20Event%20API%20Research%20Strategy.md) *(scope expanded beyond original goal — see below)* |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete (evolved into broader API strategy) |
| **What** | Originally scoped as Bandsintown/Songkick evaluation. Expanded to include Ticketmaster Discovery API v2 and Eventbrite as the research revealed both Bandsintown and Songkick are no longer viable. |
| **Why** | Secondary aggregators have deprecated venue-search endpoints. Architecture must pivot to primary ticketing providers. |
| **Key Findings** | **Bandsintown:** Artist-centric only, no venue search — **unusable for DTL's venue-first model.** **Songkick:** API completely dead (acquired by Suno for AI music training). **Ticketmaster Discovery API v2:** Gold standard. 5,000 requests/day, venue-specific queries. **Eventbrite:** Organization-centric, OAuth 2.0 required. Both are $0 free tier. |
| **Outcome** | Original goal answered: Bandsintown/Songkick are dead ends. Ticketmaster + Eventbrite are the replacement strategy. |
| **API Credentials** | **Ticketmaster:** Consumer Key `XxKBLvAGXWtRU19eDezRKSDkujrKuwmb` (App: ApolloApproach-App, Approved, 5000 req/day + 100 req/min OAuth). **Eventbrite:** Needs Personal OAuth Token registration. |
| **Estimated Cost** | $0 — Both APIs are free tier |
| **Next Steps** | Build Ticketmaster Discovery API integration (query by venueId). Store API key securely in `.env`. Implement Eventbrite OAuth flow for Centennial Hall. Build unified normalization schema + 24-hour stale record purging (Ticketmaster ToS requirement). |

---

# 🧪 Technology & UX

---

## 4. MapLibre 3D Building Extrusions

| Field | Detail |
|---|---|
| **Original Goal** | Render actual 3D building footprints from OSM data in MapLibre GL. Venues glow as their actual buildings. Check if downtown London has building footprint data in OSM. |
| **Report** | [MapLibre 3D Buildings for Venues.md](./MapLibre%203D%20Buildings%20for%20Venues.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete (Research) / 🚀 Partially Implemented |
| **What** | Replace traditional pin markers with color-coded, animated 3D building extrusions using MapLibre GL JS `fill-extrusion` layer. |
| **Why** | Nick hates pins. Buildings with active deals pulse/shimmer. The "specials animation" concept. |
| **Key Findings** | London, ON has excellent OSM building footprint data (110,872+ polygons, 0.11 divergence score). Downtown structures include detailed `building:levels` and `height` tags. MapLibre's `fill-extrusion` layer supports data-driven styling for color, height, and opacity. Spatial matching uses point-in-polygon via Turf.js or `queryRenderedFeatures()`. Animation via `requestAnimationFrame` + sinusoidal opacity at 60fps. |
| **Estimated Cost** | $0 — MapLibre GL JS is open source, OSM data is free |
| **Implementation** | Phase 1 (Foundation) lists MapLibre 3D Engine Integration as **completed** ✅. POI eradication algorithm documented. Venue-to-building matching and animation are next. |
| **Next Steps** | Implement venue→building polygon matching. Add venue-type color coding (bar=amber, restaurant=teal, club=magenta). Build "specials shimmer" animation for venues with active deals. |

---

## 5. Web Speech API for Safety Voice Prompts

| Field | Detail |
|---|---|
| **Original Goal** | Browser-native speech synthesis for Safety Panel — "Can you hear me clearly?", "Alarm Set", "Are you sure?" with adjustable voice/pitch/rate. Also explore Web Speech Recognition for hands-free panic activation. |
| **Report** | [Web Speech API for Safety Prompts.md](./Web%20Speech%20API%20for%20Safety%20Prompts.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Architectural analysis of browser-native `SpeechSynthesis` for Safety Panel V1 prompts and voice recognition for hands-free panic activation ("Hey DTL, I need help"). |
| **Why** | V1 safety panel needs auditory feedback. Pre-recorded audio files bloat the bundle and limit localization. Web Speech API is zero-cost and dynamic. |
| **Key Findings** | **Synthesis:** Viable for V1 but plagued by platform-specific bugs. iOS Safari silently fails on queued utterances. Hardware mute switch suppresses alerts on mobile. Workaround: cancel-before-speak pattern, `touchstart` user-gesture unlocking. Female voice selection via `getVoices()` filtering. **Recognition:** Continuous "Hey DTL" wake-phrase is **not viable** via Web Speech Recognition API — requires cloud connectivity, no offline, no continuous background execution. Alternative: local Whisper/Vosk model in WebAssembly for offline wake-word detection. |
| **Estimated Cost** | $0 — Browser-native API |
| **Next Steps** | Implement `SpeechSynthesis` wrapper with cross-browser workarounds. Build voice selection UI (female voice preference). Defer hands-free recognition to V2 (requires WebAssembly Whisper). |

---

## 6. Geofencing + Push Notifications

| Field | Detail |
|---|---|
| **Original Goal** | Geolocation API + service workers to trigger notifications when users enter/leave venue proximity zones. "You're 50m from McCabe's — they have $5 pints tonight!" Capacitor `@capacitor/geolocation` plugin for background geofencing on iOS/Android. Firebase Cloud Messaging for push ($0 tier). |
| **Report** | [Geofencing Push Notifications with Capacitor.md](./Geofencing%20Push%20Notifications%20with%20Capacitor.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Exhaustive analysis of zero-cost background geofencing + push notification architecture using Capacitor. Covers PWA limitations, native OS geofencing constraints, dynamic fence rotation algorithms, FCM silent push economics, and 2025/2026 privacy compliance. |
| **Why** | Transform the static "Nearby Offerings" widget into a proactive, location-aware discovery engine that drives physical foot traffic. |
| **Key Findings** | **PWA impossible:** Service Workers cannot access `navigator.geolocation` (W3C blocks for privacy). **Official `@capacitor/geolocation`:** foreground-only, no background support. **`@capacitor/background-runner`:** 15-min minimum interval makes 50m fences useless (user walks 1,200m in 15 min). **Commercial `transistorsoft`:** best-in-class but requires paid license — violates $0 constraint. **Winner: `@capgo/background-geolocation`** — free, open-source, supports `addGeofence`, `geofenceTransition` ENTER/EXIT events, native HTTP webhooks, and `setupGeofencing` config. **OS limits:** iOS = 20 simultaneous regions (hardware constraint via CoreLocation CLCircularRegion), Android = 100 (GeofencingClient). iOS throttles to ~5 min / 500m significant location changes. **Dynamic Geofencing algorithm required:** Haversine formula + local `@capacitor-community/sqlite` DB to rotate active fences by proximity; 20th fence = "macro-geofence" (3km radius) that triggers re-evaluation cycle. **FCM permanently free** (Spark tier, no message caps). Silent push via `content-available: 1` APNs flag wakes app for ~30s background execution. **Warning:** Apple throttles silent pushes to ~1 per 21 min. **Zero-latency alerts:** Use `@capacitor/local-notifications` triggered by native geofence event — no server round-trip. Webhook POST is supplementary analytics only. **2026 Privacy:** Android `ACCESS_BACKGROUND_LOCATION` requires Play Store "core functionality" justification + Prominent Disclosure UX. Google Play Protect now dynamically monitors compliance. iOS "Limit Precise Location" can degrade to km-level accuracy, breaking 50m fences — requires transparent "value exchange" onboarding UX. |
| **Estimated Cost** | $0 — Capgo plugin is open source, FCM Spark tier is free, local notifications are native |
| **Implementation** | Not yet started. |
| **Architecture** | `@capgo/background-geolocation` → native OS geofence monitoring → `geofenceTransition` event → query local SQLite → `@capacitor/local-notifications` for instant alert. FCM silent push for background venue/deal data sync to SQLite. Dynamic Geofencing rotates closest 20 (iOS) or 100 (Android) fences based on Haversine proximity. |
| **Next Steps** | Install `@capgo/background-geolocation` and `@capacitor/local-notifications`. Implement Dynamic Geofencing algorithm with SQLite venue DB. Build FCM silent push pipeline for deal data sync. Design "value exchange" permission UX for iOS precise location + Android background location. Prototype 50m geofence around test venue. |

---

## 7. Web NFC for Promo Redemption

| Field | Detail |
|---|---|
| **Original Goal** | Instead of QR codes, venues tap NFC tags to redeem offers. Web NFC API supported on Android Chrome. Venues embed NFC tags in table tents or coasters. "Tap to redeem your deal." |
| **Report** | [Web NFC Promo Redemption Feasibility Study.md](./Web%20NFC%20Promo%20Redemption%20Feasibility%20Study.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Comprehensive 271-line feasibility study covering Web NFC API ecosystem, browser compatibility, NFC vs QR interaction friction analysis, NTAG 424 DNA cryptographic security architecture (AES-128 SDM/SUN), hardware procurement economics, hospitality deployment strategies, and quantified operational outcomes. |
| **Why** | QR codes require multi-step optical alignment (unlock → open camera → aim → focus → tap notification). NFC reduces this to a single physical tap — dramatically lower cognitive load, superior accessibility for visually/motor-impaired users, and resilience in low-light nightlife environments where QR fails. |
| **Key Findings** | **Browser Support:** Web NFC API fully supported on Android Chrome 89+, Samsung Internet 15+, Opera Mobile 63+, and Android WebView 89+. **iOS Blockade Crumbling:** Safari/WebKit does not support Web NFC, but EU Digital Markets Act (DMA) enforcement (iOS 17.4+) now mandates Apple allow alternative browser engines (Chromium/Gecko) in EEA — enabling Web NFC on iOS via Chromium. UK CMA projecting similar enforcement by H1 2026. Cross-platform ubiquity expected by 2026. **NFC vs QR Friction:** QR computational decode ~5.9ms vs NFC handshake ~1,074ms — but human interaction time is what matters. NFC eliminates optical alignment phase entirely. 30% of QR codes are inaccessible to color-blind users due to poor contrast. NFC is purely tactile — works in pitch darkness, through epoxy/acrylic/wood encasements. **Cryptographic Security (Critical):** Static NFC tags (NTAG213/215/216) are as vulnerable as QR codes — URL can be copied and shared globally for unlimited fraudulent redemptions. **Solution: NXP NTAG 424 DNA** — onboard AES-128 hardware coprocessor generates Secure Unique NFC (SUN) message on every tap. URL at 8:00 PM is cryptographically distinct from URL at 8:01 PM. Payload includes encrypted PICCData (7-byte hardware UID + 3-byte SDMReadCtr, max 16,777,215 taps) and 8-byte CMAC signature. Backend validates via NIST SP 800-108 key derivation → sub-session key → CMAC recalculation → replay counter check. Copied URLs instantly fail. **Key Diversification mandatory:** If all 100K coasters share same master key, extracting one compromises all. NXP AN10922 algorithm diversifies per-tag using unique 7-byte UID. **Never diversify SDM Meta Read Key** (creates decryption deadlock). **Hardware Economics:** NTAG213 (basic, static, 144 bytes): $0.10–$0.59/tag at bulk. NTAG 424 DNA (cryptographic, 416 bytes): $0.17–$0.96/tag. Epoxy tap coasters: $1.50–$3.00. Event wristbands: $1.33–$1.77. Premium oak table signs: $12–$24. Encoding service: $0.04–$0.23/tag. **On-metal tags required** for industrial/metal table surfaces (ferrite shielding layer). **Hospitality Outcomes:** 25% increase in table turnover (NFC menu stands). 30% rise in in-store digital engagement + 20% sales uplift for featured items. 25% higher order rate for specialty high-margin dishes. 10–15% increase in customer unit price. 80% reduction in paper menu/flyer usage annually. **Local Supply Chain:** GiftAFeeling (London, ON) for custom coaster/mug bases. Blue Elephant for die-cut sticker prototyping. Mouser Electronics / Atlas RFID for North American NTAG 424 DNA wet inlay sourcing. **Backend Stack:** Node.js (`ntag424-js`, `ntag424-dna-verify`) or Python (`pylibsdm`, `sdm-backend` Flask). WebCrypto API has sporadic AES-CBC/ECB IV failures — use established libraries for production. |
| **Estimated Cost** | $0.17–$0.96/tag (NTAG 424 DNA) + $0.04–$0.23/tag encoding. Prototype batch of 50 epoxy coasters: ~$75–$150 total |
| **Implementation** | Not yet started. Requires backend SDM validation endpoint + tag encoding workflow. |
| **Architecture** | NFC Coaster (NTAG 424 DNA) → tap → dynamic URL with encrypted PICCData + CMAC → smartphone browser (transport only) → HTTPS GET to backend → AES-128 decrypt PICCData → derive SesSDMFileReadMACKey via NIST SP 800-108 → recalculate CMAC → compare → check replay counter in DB → render single-use promo coupon. Hybrid deployment: QR code printed adjacent to NFC tap-point for iOS/legacy device fallback. |
| **Next Steps** | Order NTAG 424 DNA sample pack (GoToTags or Atlas RFID). Build Node.js SDM validation endpoint using `ntag424-dna-verify`. Encode prototype batch with diversified keys. Test tap-to-redeem flow on Android Chrome. Design hybrid coaster layout (NFC tap zone + QR fallback). Source epoxy coaster prototypes from local supplier. |

---

# 📊 Strategic & Competitive

---

## 8. Competitive Platform Teardown

| Field | Detail |
|---|---|
| **Original Goal** | Deep-dive analysis of similar platforms: Fever (event discovery), Dice (ticketing), Dusk (nightlife), BarSnack (bar deals), The Infatuation (restaurant curation). Understand UX patterns, monetization models, and where DTL differentiates. |
| **Report** | [Competitive Platform Analysis for DTL.md](./Competitive%20Platform%20Analysis%20for%20DTL.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Comprehensive competitive teardown and strategic positioning report covering Fever, DICE, Dusk, BarSnack category, and The Infatuation. Analyzes UX architecture, monetization models, and the London, Ontario micro-environment. Concludes with a 5-point strategic playbook for DTL. |
| **Why** | Understanding how global platforms solved local discovery, ticketing, loyalty, and monetization allows DTL to leapfrog evolutionary missteps and directly implement mature architectures adapted for a mid-size, university-anchored market. |
| **Key Findings** | **Fever:** €18M mobile-first UX rebuild compressed checkout to 8 seconds → 22% conversion lift. Curates ~2,400 events/city (artificial supply limitation → 45% less search time). AI personalization drives 35% of ticket sales. Revenue: 10–25% ticketing commissions + Fever Originals proprietary events (50%+ margin) + Secret Media Network (60M monthly uniques) + B2B analytics (raises partner ticket revenue 18%). **DICE:** "Anti-Ticketmaster" — locked dynamic QR tickets dormant until 2 hours before event, device-bound (no screenshots/PDF), eliminates ~15% scalping transactions → 95% fan retention. Spotify/Apple Music API integration pushes personalized event alerts (5x email conversion). All-in pricing (10–15% commission folded into face value, no junk fees) → 30% net checkout conversion boost, NPS 72 vs industry avg 15. Waitlist system captures secondary demand, returns at face value. B2B SaaS "DICE for Business" for venue analytics. **Dusk:** Card-linked loyalty — zero POS friction via banking API (no barcode/QR scanning). FMCG/alcohol brand sponsorship flywheel: brands subsidize free drinks as targeted on-trade sampling campaigns. Three-sided win: brand gets measurable sampling, venue gets guaranteed foot traffic, user gets free goods. **BarSnack Category:** Highly fragmented, no dominant platform. Static PDFs, basic restaurant websites, scattered app attempts. Confirms local deal aggregation is an unsolved UX problem ripe for disruption. **The Infatuation:** Rejects crowdsourced reviews entirely — anonymous paid editorial. "Perfect For" situational taxonomy ("Girls' Night Out", "Late Night Eats") aligns with real cognitive decision-making. Acquired by JPMorgan Chase → now a customer acquisition/retention engine for Chase Sapphire Reserve ($550/yr card). Exclusive Tables, EEEEEATSCON festivals, statement credits. **London, ON Micro-Environment:** Richmond Row is the epicenter. Jack's = Tuesday ($1.25 domestics), Wednesday = Jim Bob Ray's/Call The Office ($2.50–$3.50 specials), Thursday = Barking Frog/Winks (no cover/live music), Daily = El Furniture Warehouse ($6.95 everything). Digital discovery infrastructure is severely antiquated — fragmented Instagram feeds, outdated londonfoodspecials.com, Reddit threads. No unified real-time platform exists. |
| **Strategic Playbook** | **1. Situational Taxonomy (Infatuation Model):** Abandon directory approach. Filter by hyper-local use-cases: "Cheap Drinks Before a Knights Game", "Post-Exam Patios", "Half-Price Apps After 9 PM", "No Cover on Thursdays". **2. Promotional Matrix (Fever Approach):** Dynamic day-of-week algorithmic feed — open app on Tuesday at 4PM → instant $1.25 beers at Jack's, happy hour at Craft Farmacy. Cut search time from minutes to seconds. **3. Card-Linked Analytics (Dusk Model):** Incentivize debit/credit card linking for passive offline spend tracking. Closed-loop attribution: not "who looked at a bar" but "how much they spent when they arrived". Pitch to venues: "pay for guaranteed performance". Approach beverage brands: "Sponsor 500 free pints, we drive 500 students to 3 bars on slow Wednesday". **4. B2B Analytics SaaS (DICE Model):** Backend dashboard for venue operators with demand forecasting, cohort analytics, real-time intent signals. Example: "Searches for 'Live Music Patios' spiked 400% in the last hour — push a real-time patio notification?" **5. Trust & Transparency (DICE Philosophy):** All-in pricing for any ticketed events. Localized Waitlist for high-demand events (Homecoming, St. Patrick's pub crawls). |
| **Estimated Cost** | $0 — research only |
| **Implementation** | Not yet started. Strategic recommendations feed into product roadmap. |
| **Next Steps** | Implement situational taxonomy tags in venue data model. Build day-of-week promotional feed algorithm. Research card-linking API integration (Plaid/similar) for V2. Design venue owner analytics dashboard wireframes. |

---

## 9. Predictive Venue Busyness Modeling

| Field | Detail |
|---|---|
| **Original Goal** | Evaluate BestTime alternatives: PopularTimes (Google Maps scraping), PredictHQ (event impact), or building own model from LTC ridership patterns + event schedules. Can we correlate bus ridership on routes 2/6 (Richmond Row) with venue activity? |
| **Reports** | [Venue Busyness Data Research.md](./Venue%20Busyness%20Data%20Research.md) *(initial evaluation)* → **[Predictive Venue Busyness Modeling Research.md](./Predictive%20Venue%20Busyness%20Modeling%20Research.md)** *(definitive superseding report)* |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete (Research) / 🔨 Implementation Ready |
| **What** | Comprehensive academic-grade analysis of venue busyness prediction. Covers commercial ecosystem collapse (BestTime, Placer.ai), web scraping fragility, Event Gravity modeling, urban mobility proxy theory, LTC GTFS-RT stochastic delay architecture, Richmond Row feature engineering pipeline, and ML framework selection (XGBoost/LightGBM recommended for V1). |
| **Why** | Venue busyness is the #1 retention feature. "Is Joe Kool's busy right now?" The research proves LTC transit delay is a zero-cost, legally clean proxy for corridor-level busyness — and **we already have the GTFS-RT TripUpdates infrastructure built** (see `route.ts`). |
| **Key Findings** | **Commercial ecosystem:** BestTime deprecated/unstable. Placer.ai = $2,000+/mo. Google Popular Times absent from all official APIs. Scraping is legally precarious and operationally fragile (DOM changes break all scrapers). **Transit Proxy Theory (Validated):** Academic research (Cervero & Kockelman, LA MTA strike study, FTA post-pandemic data) confirms transit ridership strongly proxies pedestrian volume. **LTC APC Reality:** LTC has APCs (treadle mats since 1980s) but occupancy data is siloed offline — NOT transmitted in GTFS-RT. **Stochastic Delay Formula:** `Δ_stochastic(i) = SD(i) - SD(i-1)` — positive values = friction = crowds. Routes 2 & 6 traverse Richmond Row directly. **Event Gravity:** Canada Life Place, LMH, Victoria Park events create predictable pre/post-game busyness spikes. **Feature Engineering:** Transit delay + Event Gravity + Day/Hour + University Calendar + Weather → XGBoost model → normalized busyness index (0-100). **Polling:** 10-second GTFS-RT intervals, geofenced to Richmond Row stops only, 15-min rolling averages. |
| **Estimated Cost** | **$0** — Entirely free public data (LTC GTFS-RT + event scraping + weather APIs) |
| **Architecture** | GTFS-RT TripUpdates (10s polling, Routes 2/6, Richmond Row geofence) → stochastic delay calculation → 15-min rolling average → merge with Event Gravity scores + temporal features + weather → XGBoost/LightGBM model → busyness index per corridor segment → propagate to adjacent venues via proximity weighting |
| **ML Framework** | **V1: XGBoost/LightGBM** (fast, interpretable feature importance, ideal for tabular data). V2: Hybrid ARIMA + real-time adjustment. V3: MLP deep learning for non-linear weather×day interactions. |
| **Implementation** | Foundation already exists: `src/app/api/civic/transit/route.ts` already fetches TripUpdates.json and calculates delay via `delayMap`. Need to: (1) add corridor-specific stochastic delay aggregation, (2) build Event Gravity scoring from existing event data, (3) create busyness index endpoint, (4) train initial XGBoost model on 30 days of collected data. |
| **Next Steps** | **Immediate:** Start logging stochastic delay data per stop segment (Routes 2/6) to build training dataset. **Sprint 2-3:** Build Event Gravity scorer from Ticketmaster/LMH event data. **Sprint 3-4:** Deploy XGBoost model with temporal + weather features. **Sprint 4-5:** Add busyness indicator to venue cards and 3D building extrusions. |

---

## 10. Downtown London BIA Partnership

| Field | Detail |
|---|---|
| **Original Goal** | Research whether the Downtown London BIA has a data-sharing or digital partnership program. They maintain the official venue directory, event calendar, and pedestrian count data. Could be the single richest data source for DTL. Also legitimizes the platform. |
| **Report** | [Downtown London BIA Data Partnership Research.md](./Downtown%20London%20BIA%20Data%20Partnership%20Research.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Exhaustive 174-line strategic analysis of the Downtown London Business Improvement Area's digital architecture and data partnership ecosystem. Covers economic gravity ($2.04B assessed property value, 1,400+ businesses, 45,717 daytime population), CRM infrastructure (Vicinity), gamified foot traffic analytics (Bandwango), closed-loop digital currency (Miconex/Downtown Dollar), municipal open data comparison, event aggregation, data governance, and stakeholder mapping. |
| **Why** | The LDBA is not a traditional neighborhood marketing board — it operates the most sophisticated urban data ecosystem in the city. Partnering with a statutory Municipal Act body instantly institutionalizes DTL, converting it from an external commercial observer into integrated civic data infrastructure. This is the single richest data source available. |
| **Key Findings** | **Vicinity CRM (First Canadian BIA Deployment):** The LDBA is the first Canadian BIA to adopt Vicinity CRM (used by 120+ BIDs in the UK). Provides a verified, actively-audited ledger of all 1,400+ commercial entities within the statutory BIA boundary. Every business is validated at the financial/municipal level (levy-paying membership). This data is inherently superior to Google Maps/Yelp — zero phantom listings, zero data decay, verified at source. Public-facing directory at downtownlondon.ca/business-directory/ is the CRM frontend. **Bandwango (Gamified Foot Traffic):** The "Downtown London Trails" digital passport program drove **46,047 verified check-ins** (25,000 in first half of 2025 alone). Users earn Downtown Dollar rewards ($10/$20/$50 gift cards) for visiting curated locations. Two check-ins per location allowed → tracks return visits and loyalty. Coupon redemptions (10–30% off) directly link digital check-in to POS interaction. Conservative estimate: **$460,000+ in localized retail spending** directly generated. Won Award of Excellence for Marketing at 2025 OBIAA Awards. This data reveals not just *how many* people are downtown but *where* they deliberately go, *what incentives* drove them, and *how often* they return. **Miconex (Closed-Loop Digital Currency):** Downtown Dollar program tokenized via Miconex fintech. Digital mobile wallet + NFC contactless payment. Geofenced to 195+ registered businesses within BIA boundary only. **$400,000+ in dedicated local spend** tracked through Visa network infrastructure. Backend tracks: average transaction values, cross-shopping behavior (café → boutique patterns), sector-specific economic impact in real-time. For DTL: API integration with Downtown Dollar = closed-loop attribution. Prove digital discovery → physical purchase. **Environics Analytics + Mobile Location Data:** LDBA purchases advanced third-party analytics — anonymized credit card volumes, mobile device pings, telecom datasets. This is how they calculate the 45,717 daytime population figure. Demonstrates extreme data maturity — they are not relying on anecdotal observations. **Municipal Open Data Contrast:** City of London Open Data portal (Esri ArcGIS) provides structural datasets: 717,712 pedestrians counted across 31 sites, 307 pedestrian crossover locations, 122,976 cyclists/scooters. But this data is *static and macroscopic* — it measures volume, not intent, destination, or dwell time. The LDBA's Bandwango + Environics stack fills exactly this gap. Correlating city crossover data with LDBA check-in/transaction data → predictive economic yield per street segment per time-of-day. **Event Calendar:** LDBA produces curated monthly event calendar distributed physically (Central Library, Museum London, City Hall, Canada Life Place, Dundas Place) and digitally. Events must occur within BIA boundary to receive promotion (content amplification guidelines). Won Award of Merit for Communications at 2025 OBIAA Awards. **No Public API Exists:** The LDBA does not publish an open API. Data is held internally, governed by privacy policies, used for municipal advocacy. Access requires a **customized Data-Sharing Agreement (DSA)** negotiated directly with the Board. |
| **Stakeholder Map** | **Tristan Hughes** — Policy and Research Coordinator. Primary contact for data integration, API structure negotiation, Vicinity CRM access. Architect of the LDBA's data-driven transition. **Mackenzie Preszcator** — Digital Marketing Coordinator. Manages Bandwango trails, geospatial check-in data. Critical for co-developing location-based digital marketing. **Brent Hodson** — Marketing and Communications Manager. Leads 2025-2026 marketing plan execution. Must endorse DTL as a "distribution channel" for BIA marketing. **Vicki Smith** — Interim Executive Director. Ultimate oversight, financial strategy, formal partnership ratification. Not the first technical contact but required for sign-off. |
| **Partnership Strategy** | Align pitch with LDBA's *Interim Strategic Plan 2026* — the LDBA seeks to be the district's primary "Area Marketer" and "Policy Advocate" using data storytelling. DTL must position itself as a high-leverage distribution channel: (1) Integrating Vicinity CRM directory = amplified marketing reach to new demographics. (2) Reciprocal data: offer LDBA anonymized user routing data, search intent metrics, engagement heat maps, demographic analytics. (3) Transition from transactional data consumer → long-term civic intelligence partner. |
| **Estimated Cost** | $0 — partnership inquiry. NFC tag hardware for Downtown Dollar integration would fall under Sprint 5 NFC budget. |
| **Implementation** | Not yet started. Requires outreach to Tristan Hughes (Policy & Research Coordinator) to initiate DSA negotiation. |
| **Next Steps** | Draft partnership proposal highlighting: (a) DTL as amplified distribution for BIA venue directory and event calendar, (b) reciprocal analytics value proposition, (c) potential Downtown Dollar/NFC integration. Email Tristan Hughes at LDBA. Request exploratory meeting to discuss data-sharing framework. Prepare demo of DTL platform showing 3D building map with venue overlay to demonstrate distribution capability. |

---

# Bonus Research (Beyond Original 10)

These reports were conducted as additional deep-dives that emerged during the research phase:

---

## B1. Civic Data Pipeline Architecture — Event Scraping Sources

| Field | Detail |
|---|---|
| **Report** | [Civic Data Pipeline Architecture - Event Scraping Sources.md](./Civic%20Data%20Pipeline%20Architecture%20-%20Event%20Scraping%20Sources.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Exhaustive analysis of London, ON nightlife data sources: London Music Hall, Canada Life Place (Budweiser Gardens), Tourism London, London Free Press, Eventbrite, Facebook Events. Identified rendering technologies (SSR vs CSR), API availability, RSS feeds, DOM structures. Three-tier data accessibility framework. |
| **Key Findings** | **Tier 1 (APIs):** London Music Hall has WordPress REST API (`/wp-json/wp/v2/tm_event`) + RSS feed. **Tier 2 (JSON-LD):** Eventbrite embeds Schema.org Event structured data. **Tier 3 (DOM Scraping):** Canada Life Place (Carbonhouse), Tourism London (Velocity Studio), Facebook Events (walled garden — needs DaaS). Data normalization schema with SHA-256 deduplication defined. |
| **Estimated Cost** | $0–$5/mo for Facebook scraping via Apify |

---

## B2. Nightlife Data Pipeline Expansion (Deals & Specials)

| Field | Detail |
|---|---|
| **Report** | [Nightlife Data Pipeline Expansion Research.md](./Nightlife%20Data%20Pipeline%20Expansion%20Research.md) |
| **📖 Reviewed & Integrated** | ✅ Yes (2026-05-20) |
| **Status** | ✅ Complete |
| **What** | Evaluated strategies for aggregating ephemeral promotional data: daily specials, happy hours, deals from ~68 downtown venues. Assessed global platform APIs (Google, Yelp, TripAdvisor) and self-serve portal architecture. |
| **Key Findings** | Global platform APIs do not expose deal/special data. Self-serve venue portal is the only sustainable, zero-cost approach. Portal must be frictionless: no-login form, QR-code-based onboarding, mobile-first. |
| **Estimated Cost** | $0 — Self-serve portal approach |

---

# Priority Matrix

| # | Research Area | Category | Impact | Effort | Cost | Report? | Priority |
|---|---|---|---|---|---|---|---|
| 3 | Ticketmaster + Eventbrite APIs | 🔬 Data | 🔴 High | 🟡 Medium | $0 | ✅ | **P0** |
| 2 | GTFS-RT Occupancy Fix | 🔬 Data | 🔴 High | 🟢 Low | $0 | ✅ | **P0** |
| 4 | MapLibre 3D Venue Buildings | 🧪 Tech | 🔴 High | 🟡 Medium | $0 | ✅ | **P1** |
| 1 | London Open Data Portal | 🔬 Data | 🟡 Medium | 🟢 Low | $0 | ✅ | **P1** |
| B1 | Civic Data Pipeline (Scrapers) | 🔬 Data | 🟡 Medium | 🔴 High | $0–$5 | ✅ | **P1** |
| 10 | Downtown London BIA Partnership | 📊 Strategic | 🔴 High | 🟢 Low | $0 | ✅ | **P0** |
| 6 | Geofencing + Push Notifications | 🧪 Tech | 🟡 Medium | 🟡 Medium | $0 | ✅ | **P2** |
| B2 | Nightlife Deals Pipeline | 🔬 Data | 🟡 Medium | 🟡 Medium | $0 | ✅ | **P2** |
| 9 | Predictive Venue Busyness Modeling | 📊 Strategic | 🔴 High | 🟡 Medium | $0 | ✅✅ | **P1** |
| 5 | Web Speech Safety Prompts | 🧪 Tech | 🟢 Low | 🟢 Low | $0 | ✅ | **P3** |
| 8 | Competitive Platform Teardown | 📊 Strategic | 🟡 Medium | 🟡 Medium | $0 | ✅ | **P2** |
| 7 | Web NFC Promo Redemption | 🧪 Tech | 🟡 Medium | 🟡 Medium | $0.17–$0.96/tag | ✅ | **P3** |

---

# Key API Credentials & Rate Limits

| Service | Credential | Limit | Status |
|---|---|---|---|
| **Ticketmaster Discovery API v2** | Key: `XxKBLvAGXWtRU19eDezRKSDkujrKuwmb` | 5,000 req/day, 5 req/sec | ✅ Approved |
| **Ticketmaster OAuth** | Same app | 100 req/min | ✅ Approved |
| **London Music Hall WP API** | None required | Unauthenticated (may be rate-limited) | Untested |
| **Eventbrite API** | Needs OAuth token registration | Per-token limits | 📋 Not registered |
| **LTC GTFS-RT Feed** | None required | Open/free | ✅ Active |
| **London Open Data Portal** | None required | Open/free | ✅ Available |

---

# Venue ID Reference

| Venue | Platform | ID | Type |
|---|---|---|---|
| London Music Hall | Ticketmaster | `131820` | Venue ID |
| Canada Life Place | Ticketmaster | `340223`, `132078` | Venue ID (both needed) |
| Centennial Hall (Major) | Ticketmaster | `131548` | Venue ID |
| Centennial Hall (Civic) | Eventbrite | `17867092244` | Organization ID |
| London Music Hall | WordPress | `tm_event` (post type) | WP REST API |

---

# Research Completion Summary

| Metric | Count |
|---|---|
| **Original goals (of 10)** | **10 complete** ✅ |
| **Bonus research** | 2 complete |
| **Total reports written** | 13 (includes superseding Predictive Busyness report) |
| **Reports reviewed & integrated** | **13/13 ✅** |
| **Reports pending** | **0 — All research goals complete** 🎉 |
