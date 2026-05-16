<div align="center">
  <img src="DTL.png" width="80" alt="DTL Globe Logo"/>
  <h1>London Civic Dashboard (DTL)</h1>
  <p>
    <strong>A privacy-first, 3D digital twin of downtown London, Ontario.</strong><br/>
    <em>Built for real-time transit monitoring and frictionless community safety reporting.</em>
  </p>
  
  [![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)](https://nextjs.org/)
  [![MapLibre GL](https://img.shields.io/badge/MapLibre-GL-blue?style=flat&logo=maplibre)](https://maplibre.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-Database-3ecf8e?style=flat&logo=supabase)](https://supabase.com/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg)](#)
</div>

---

## 🎯 The Vision
We believe civic engagement should be as frictionless as possible. The **London Civic Dashboard** provides citizens with a "God's Eye" 3D view of their city. It is designed to lower the barrier for reporting urban safety incidents while providing real-time utility, like transit tracking and offline pedestrian routing. 

No sign-ups. No tracking. Just the city at your fingertips.

## ✨ Core Features

### 🚍 Real-Time Transit Engine
- **Live 3D Extrusions**: Ingests the LTC GTFS-Realtime feed to render buses moving through the 3D city in real time.
- **Congestion Heatmapping**: A dynamic "underglow" system highlights traffic bottlenecks and delayed buses (stale GPS).
- **Occupancy Prediction**: Click any bus to see live crowd levels (e.g., "Standing Room Only").

### 🛡️ Anonymous Incident Reporting
- **Zero-Friction "Mod Pins"**: Drop a pin to report a safety issue instantly. 
- **Privacy-First**: Powered by Supabase Anonymous Sessions—we don't collect personal data from our users.

### 🧭 Offline Pedestrian Routing
- Deep integration with [Organic Maps](https://organicmaps.app/) allows users to calculate safe, well-lit walking routes offline, preserving battery and data when navigating downtown at night.

### 🗺️ Accessible Data
- **Clean-First UI**: Overwhelming venue data is hidden by default. The map remains uncluttered until explicitly queried via the filter panel.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | [Next.js 14](https://nextjs.org/) | Core React framework and API routing |
| **Mapping** | [MapLibre GL JS](https://maplibre.org/) | WebGL engine for rendering the 3D digital twin |
| **Backend** | [Supabase](https://supabase.com/) | PostgreSQL database and Anonymous Auth |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling for a premium UI |

---

## 🚀 Getting Started

### Prerequisites
1. Node.js 18+
2. A free [Supabase](https://supabase.com/) project.
3. A free [MapTiler](https://www.maptiler.com/) API key (for the basemap).

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/Apollo-Approach/DTL.git
   cd DTL
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Rename `.env.example` to `.env.local` and add your keys:
   ```env
   NEXT_PUBLIC_MAPTILER_KEY=your_key_here
   NEXT_PUBLIC_SUPABASE_URL=your_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Run the Dashboard**
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) to view the map.*

---

## 🧠 Architectural Quirks & Notes
- **LTC Feed Caching**: The external LTC proxy servers aggressively cache their JSON payload. The backend `/api/civic/transit` route appends a cache-busting timestamp (`?t=${Date.now()}`) to the upstream fetch to ensure fresh coordinates.
- **MapLibre 3D Math**: When generating dynamic 3D polygons (like our bus bodies), the exterior coordinate ring must be mapped in a strictly **CLOCKWISE** winding order. Counter-clockwise rings are interpreted as holes and will not extrude!

---
<div align="center">
  <em>Built for London, Ontario.</em>
</div>
