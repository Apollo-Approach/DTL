# Predictive Modeling of Venue Busyness: An Analysis of Proxies, APIs, and Transit-Derived Foot Traffic Signals

> **Research Type:** Deep Technical & Strategic Analysis
> **Scope:** Supersedes initial Venue Busyness Data Research (Report #9)
> **Date:** 2026-05-20
> **Status:** Complete

---

## Executive Summary

This report provides an exhaustive technical, strategic, and theoretical analysis of acquiring, modeling, and predicting venue busyness for DTL. It spans direct data scraping solutions, event-driven predictive APIs, and the construction of a custom foot traffic proxy model derived from LTC GTFS-RT transit delay signals along the Richmond Row nightlife corridor.

**Core Thesis:** Real-time stochastic transit delay on Routes 2 & 6 through Richmond Row serves as a zero-cost, legally clean proxy for venue busyness. Fused with Event Gravity scores, temporal features, and weather modifiers, this enables a robust ML prediction model that answers "Is Joe Kool's busy right now?" using entirely free, publicly accessible data.

---

## Table of Contents

1. The Commercial Ecosystem of Foot Traffic Analytics
2. Web Scraping Architectures and the Popular Times Paradigm
3. Event-Driven Demand Modeling and Predictive Gravity
4. Urban Mobility as a Proxy for Foot Traffic
5. The LTC Data Ecosystem and the "Missing Occupancy" Challenge
6. Designing the Proxy: Transit Delay as a Metric of Congestion
7. Building the Custom Richmond Row Prediction Model
8. Machine Learning Frameworks for Queue and Busyness Prediction
9. Strategic Synthesis

---

## 1. The Commercial Ecosystem of Foot Traffic Analytics

BestTime.app served as a critical developer tool providing instant foot traffic data for venues across hundreds of countries — forecasting visitor peaks, querying live updates, and executing advanced venue filtering. With its shifting availability, the market now offers enterprise-grade alternatives that are fundamentally misaligned with consumer application needs:

- **Placer.ai / Azira:** Mobile panel data providers using third-party SDK aggregation. Industry standard for accuracy but prohibitively expensive for independent developers.
- **CenterCheck:** Credit card transaction records to estimate retail sales volume. Captures economic activity but misses non-transactional busyness (queues, browsing).
- **Enterprise suites (Tableau, Qlik, SAP HANA):** Visualization tools, not foot traffic providers.

**Key Finding:** No affordable, developer-friendly venue busyness API exists in the post-BestTime market. Custom proxy models are the only viable path.

---

## 2. Web Scraping Architectures and the Popular Times Paradigm

Google "Popular Times" data is absent from all official Google Places APIs. Acquisition requires unauthorized web scraping.

### Open-Source Libraries
- **populartimes (Python):** GitHub-only install, scrapes Google Maps DOM. Unreliable, violates ToS.
- **livepopulartimes:** Functions like `get_populartimes_by_address` and `get_populartimes_by_PlaceID`. No official support.

### Commercial Managed Scrapers

| Provider | Strength | Avg Success Rate | Avg Price/1K calls |
|---|---|---|---|
| Bright Data | 150M+ IPs, AI Scraper Studio | 98.44% | $1.50 |
| Apify | 20,000+ ready-made Actors | High | Free tier available |
| ScrapingBee | Developer-friendly SERP API | 92.69% | $3.90 |
| Outscraper | Google Maps specialist | High | Pay-as-you-go |
| Oxylabs | IP quality leader | 92.52% | $6.39 |
| ZenRows | Developer-focused | 92.64% | $4.48 |

**Critical Vulnerability:** All scraping approaches are legally precarious and operationally fragile. DOM changes break all scrapers simultaneously. **Unacceptable long-term platform risk.**

---

## 3. Event-Driven Demand Modeling and Predictive Gravity

### Commercial Event Intelligence

PredictHQ maintains 100M+ events across 19 categories. Generates "Predicted Attendance" and "Predicted Event Spend" features. Their "Beam Demand Surges" algorithm identifies when multiple events converge to create non-linear impact.

### Replicating Event Gravity in London, ON

Major crowd-generating nodes:
- **Canada Life Place (Budweiser Gardens):** Multi-purpose arena — PBR, Broadway tours, major concerts (Bryan Adams, Bailey Zimmerman). Thousands of attendees per event.
- **London Music Hall:** High-capacity nightlife/music venue — Emo Night, metal tours (Alpha Wolf), local battles of the bands.
- **Victoria Park:** Summer festival epicenter — Poutine Feast, Beer Fest, Children's Festival. Tens of thousands per multi-day event.
- **The Grand Theatre:** Cultural anchor.

### DIY Event Feed Sources
- **WordPress REST API:** `/wp-json/tribe/events/v1/events` for venues using The Events Calendar plugin.
- **London Music Hall:** `/wp-json/wp/v2/tm_event` (confirmed in B1 research).
- **Trove Vault City Event Feed Scraper:** Queries Eventbrite + Songkick simultaneously.
- **LDBA Monthly Events Calendar:** Distributed physically and digitally (confirmed in #10 research).

**Event Gravity Score = f(venue_capacity, event_start_time, event_end_time, proximity_to_target_corridor)**

Pre-gaming window: 60-90 min before event start.
Egress window: event end to event end + 90 min.

---

## 4. Urban Mobility as a Proxy for Foot Traffic

### Theoretical Basis

Academic research consistently demonstrates transit ridership as a robust proxy for regional centrality and street-level pedestrian volume:

- **Cervero & Kockelman (San Francisco):** Compact development + restricted parking → reduced VMT, increased walking/transit.
- **"3Ds" Framework:** Density, Diversity (land use mix), Design (street connectivity) → dictate both transit demand and pedestrian volumes.
- **LA MTA Strike Study:** 35-day transit strike → 47% increase in peak traffic delays. Transit removes massive friction from urban environments.
- **FTA Post-Pandemic Data:** Transit ridership growing 17%+ nationally (2022→2023), driven by weekend leisure/service trips — perfectly aligning with nightlife proxy hypothesis.

**Conclusion:** Empirical, localized surge in transit activity along a commercial corridor is highly indicative of concurrent pedestrian volume and venue busyness.

---

## 5. The LTC Data Ecosystem and APC Realities

### Available Data
- **Static GTFS:** Routes, stops (lat/lng), scheduled arrival times.
- **GTFS-RT TripUpdates:** `gtfs.ltconline.ca/TripUpdate/TripUpdates.json` — real-time schedule deviation with `delay` field in `StopTimeEvent`.
- **GTFS-RT VehiclePositions:** `gtfs.ltconline.ca/Vehicle/VehiclePositions.json` — live GPS, bearing, speed.
- **GTFS-RT Alerts:** Service disruptions, detours.
- **GIS Shapefiles:** Bus route geometries, stop inventories.
- **License:** Worldwide, royalty-free, non-exclusive.

### The "Missing Occupancy" Challenge

The GTFS-RT `VehiclePosition` message supports `occupancy_status` (MANY_SEATS → CRUSHED_STANDING) but **LTC does not currently publish real-time occupancy data.**

LTC has Automatic Passenger Counters (APCs) — pressure-sensitive treadle mats from London Mat — installed since the 1980s. However, this data is **siloed offline** for route planning and ridership growth analysis. It is NOT transmitted to the GTFS-RT feed.

APC data is aggregated by schedule period (fall/winter, spring, summer) with fall being the base period for assessing arterial route crowding when post-secondary institutions are in session.

**Key Implication:** Direct passenger counts cannot serve as a real-time proxy. Must derive secondary proxy from delay signals.

---

## 6. Designing the Proxy: Transit Delay as a Metric of Congestion

### Systematic vs. Stochastic Delay

- **Systematic delay:** Predictable — rush hour traffic, signal cycles, standard dwell times. Already baked into the GTFS static schedule.
- **Stochastic delay:** Unpredictable — accidents, ride-share blockages, **unusually high passenger boardings**, heavy pedestrian crosswalk activity. THIS is the signal.

### Stochastic Delay Calculation

```
Δ_stochastic(i) = SD(i) - SD(i-1)
```

Where `SD(i)` = schedule deviation at stop `i`, `SD(i-1)` = deviation at previous stop.

- Positive Δ = bus experiencing friction (crowds, congestion)
- Negative Δ = bus recovering speed (clear segment)

When stochastic delay spikes above historical baseline for a specific segment at a specific time → high-friction environment → dense crowds → high venue busyness.

### Data Source

GTFS-RT `StopTimeEvent.delay` field quantifies arrival/departure prediction relative to static schedule. Example: `delay: 120` → bus predicted 2 minutes late at this stop.

---

## 7. Building the Custom Richmond Row Prediction Model

### Richmond Row Spatial Profile

- 200+ businesses on Richmond Row
- Extreme commercial density adjacent to Western University and Fanshawe downtown campus
- Key busyness drivers: Joe Kool's, El Furniture Warehouse, The Barking Frog, Jack's, Jim Bob Ray's, Molly Bloom's, Aura
- Peak nights: Thursday-Saturday + student Wednesdays
- Demographic engine: 80-99% student clientele at venues like Jack's

### Critical Transit Routes

**LTC Routes 2 and 6** traverse directly through the Richmond Row north-south friction corridor. Digital geofences around stops adjacent to high-density venue clusters isolate the most relevant delay signals.

### Feature Engineering Pipeline

| Feature | Source | Function |
|---|---|---|
| **Stochastic Delay** (Route 2/6) | LTC GTFS-RT TripUpdates.json | Live physical friction and crowd density |
| **Event Gravity** | Scraped event schedules | Predicts anomalous pre/post-event traffic |
| **Day of Week** | System clock | Historical baseline expectation |
| **Hour of Day** | System clock | Time-of-day busyness patterns |
| **University Term Active** | Academic calendar flags | Student population presence/absence |
| **Reading Week Status** | Academic calendar | Known demand suppressant |
| **Weather** | Meteorological API | Negative modifier for adverse conditions |

### Polling Architecture

- **Frequency:** Every 10 seconds for GTFS-RT TripUpdates
- **Filter:** Only Routes 2 and 6
- **Geofence:** Only stops within Richmond Row corridor bounding box
- **Aggregation:** 15-minute rolling average of stochastic delay
- **Output:** Normalized busyness index (0-100) or categorical ("Not Busy", "Busy", "At Capacity")

---

## 8. Machine Learning Frameworks

### Option A: Deep Learning (MLP)
- Multi-layer perceptron ingesting transit delay + event gravity + temporal matrices
- Captures hidden non-linear correlations (weather × day-of-week interactions)
- Requires most training data and compute

### Option B: Gradient Boosted Trees (XGBoost / LightGBM)
- Excellent for structured tabular data
- Faster training, less hyperparameter tuning
- Provides feature importance metrics for model interpretability
- **Recommended for V1** due to simplicity and explainability

### Option C: Hybrid ARIMA + Real-Time Adjustment
- ARIMA establishes historical baseline busyness pattern per venue
- Real-time transit delay spikes dynamically adjust the prediction
- Most sophisticated but also most complex to implement

---

## 9. Strategic Synthesis

| Approach | Cost | Reliability | Legal Risk | Accuracy | Verdict |
|---|---|---|---|---|---|
| Google Popular Times scraping | $0-$105/mo | ❌ Fragile | 🔴 High | ✅ High | **Rejected** |
| BestTime.app | $24-$29/mo | ⚠️ Uncertain (market shifts) | ✅ Clean | ✅ High | **Backup option** |
| Placer.ai / Azira | $2,000+/mo | ✅ Robust | ✅ Clean | ✅ Very High | **Rejected** (cost) |
| PredictHQ | Enterprise pricing | ✅ Robust | ✅ Clean | ⚠️ Macro only | **Rejected** (cost) |
| **LTC Transit Delay Proxy** | **$0** | **✅ Robust** | **✅ Clean** | **⚠️ Novel (unproven)** | **✅ Primary** |
| Self-reported (venue portal) | $0 | ⚠️ Adoption dependent | ✅ Clean | ⚠️ Varies | **Supplementary** |

**Recommended Architecture:**
1. **Primary signal:** LTC GTFS-RT stochastic delay (Routes 2/6 through Richmond Row)
2. **Predictive catalyst:** Event Gravity scores from scraped venue calendars
3. **Temporal baseline:** Day-of-week + hour-of-day + university calendar features
4. **Environmental modifier:** Weather API data
5. **Supplementary:** Self-reported venue busyness via owner portal
6. **Fallback:** BestTime.app free/low tier for validation during model training phase

**Total recurring cost: $0**
