# DTL Civic Dashboard - Venue Ingestion Pipeline

## Architecture Overview
As of May 2026, the venue ingestion pipeline has transitioned from a pure local LLM web scraper to a **Hybrid Pipeline**. This approach minimizes LLM hallucination and leverages the strengths of multiple intelligence systems.

The pipeline consists of two concurrent data streams for each venue:

### 1. Baseline Structural Enrichment (Google Maps Grounding Lite API)
We utilize the experimental Grounding Lite MCP/API to fetch highly accurate, verified structured data for venues:
- **Spatial Positioning:** Precise `latitude` / `longitude` for the 3D map.
- **Operating Logistics:** Verified opening hours, exact physical address, and contact links.
- **Accessibility & Features:** Wheelchair accessibility, pet-friendly status, payment options.
- **Categorization:** Baseline summary describing the venue type (e.g., "bar and grill", "nightclub").

### 2. Deep-Dive Qualitative Synthesis (Camoufox + Llamabox)
Rather than forcing local LLMs to categorize rigid checkpoints, the stealth web scraper is deployed strictly as a qualitative intelligence asset. 
`camoufox` navigates to official websites and targeted search results to extract:
- **`menu_highlights`**: Specific signature dishes, local craft beers on tap, or dietary focus (e.g., "vegan tapas").
- **`pricing_intel`**: Actionable price points (e.g., "$10 Cover Fridays", "Half-price appetizers before 6 PM").
- **`upcoming_events`**: Live shows, DJs, or recurring events (e.g., "Trivia on Tuesdays").
- **`vibe_analysis`**: Nuanced synthesis of the actual atmosphere based on the text.

## Database Integration
Both streams are executed in parallel via `scraper/main.py`. 
Upon completion, the outputs are merged and stored in the Supabase `venues` table within the `offerings` JSONB column. 
- The Grounding Lite payload is keyed under `maps_grounding_lite`.
- The Llamabox deep-dive data is merged into the root of the JSON object.

This powers the frontend `matchScore` algorithms entirely autonomously.

## Usage
The scraper is containerized to avoid environment drift.

1. Ensure `.env` contains both `LLAMABOX_API_KEY` and `MAPS_GROUNDING_LITE_API_KEY`.
2. Run the daemon via docker-compose:
   ```bash
   docker-compose up -d --build dtl-scraper
   ```

### Utility Scripts
- `update_latenight.py`: Scans the unstructured `offerings` JSON for temporal keywords ("12:00 am", "open late") and updates the `late_night_eligible` boolean on the database. This directly powers the "Late Night" neon filter on the frontend map.
