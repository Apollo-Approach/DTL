# DTL Civic Dashboard Roadmap

This document outlines the high-level trajectory of the London Civic Dashboard. Individual, actionable tasks and bug tracking are handled via [GitHub Issues](https://github.com/Apollo-Approach/DTL/issues).

---

## ✅ Phase 1: Foundation (Completed)
Establishing the core infrastructure for real-time visualization and anonymous reporting.
- [x] **MapLibre 3D Engine Integration**: Extruding 3D building polygons from MapTiler data.
- [x] **LTC GTFS-Realtime Ingest**: Parsing live transit feeds and rendering buses in real-time.
- [x] **Transit Metadata Expansion**: Ghost bus detection, occupancy predictions, and congestion underglow.
- [x] **Anonymous Safety Pins**: Zero-friction "Mod Pin" reporting via Supabase anonymous auth sessions.

## 🚧 Phase 2: Administrative Control (Current)
Providing verified personnel with the tools to analyze the data and manage the platform.
- [ ] **Verified Responder OAuth**: Secure login flow via Google/Apple for police, London Cares, and admins.
- [ ] **Aggregate Data Views**: Heatmaps and historical analytics for reported incidents.
- [ ] **Search & Date-Filtering UI**: Time-scrubbing capabilities for the frontend map.
- [ ] **Content Moderation Workflow**: Interface for administrators to verify, escalate, or dismiss safety pins.

## 🚀 Phase 3: Public Utility Expansion (Future)
Enhancing the citizen experience with proactive safety and accessibility features.
- [ ] **Advanced Pedestrian Routing**: Organic Maps integration for safe, well-lit nighttime corridors.
- [ ] **Accessibility Filters**: Routing that accounts for curb cuts, construction, and elevation.
- [ ] **Proactive Push Notifications**: Opt-in browser/mobile alerts for severe localized civic disruptions.
