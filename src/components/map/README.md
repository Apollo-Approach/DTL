# Map 3D Engine & Spatial Sync Architecture

This document serves as a reference for the spatial logic and 3D building rendering architecture in the DTL application, specifically regarding how venues are mapped to municipal building footprints.

## The Problem
Mapping single point coordinates (venues) to 2D/3D building footprints is deceptively difficult in dense urban environments (like Richmond Row). 

If you use naive intersection or distance queries, several issues arise:
1. **Centroid Failures:** Massive, complex buildings (e.g., Toboggan/complex courtyards) have their geometric centroid located very far from the entrance where the venue pin actually sits. If you sort by "distance to centroid", smaller neighboring buildings (like Joe Kool's) will mathematically register as "closer", causing the venue to snap to the wrong building.
2. **Street Bounding (Jumping the Street):** If you use a broad spatial envelope query (e.g., a 50m bounding box to catch large buildings), a slightly offset pin might snap to a building across the street if the logic simply picks the "closest" geometry without enforcing a strict distance threshold.
3. **Z-Fighting in MapLibre:** If multiple venues exist within the exact same physical building (e.g., Toboggan and Joe Kool's at 585/595 Richmond), extracting their individual building polygons from the municipal dataset and pushing them to MapLibre results in identical, overlapping 3D geometries. MapLibre GL JS will experience severe Z-fighting, causing hover states, highlight effects, and click events to fail or glitch visually.

## The Solution

To resolve this, the synchronization and rendering logic is split into two robust parts:

### 1. Spatial Matching (`sync_civic_buildings.js`)
When we pull the London Open Data building outlines, we apply strict ray-casting and distance-to-edge logic to determine the correct building:

- **Ray-Casting (Point-in-Polygon):** We first check if the venue pin is physically INSIDE the building boundary. If it is, the distance is exactly `0`. This solves the "massive building centroid" issue immediately.
- **Distance to Edge:** If the pin is outside the footprint (e.g. on the sidewalk), we calculate the true geographic distance to the *closest edge* (line segment) of the polygon in meters, ignoring the centroid entirely.
- **Strict Street Bounding (30m Max):** We enforce a hard cutoff of `30 meters`. If the nearest building edge is more than 30 meters away, it is rejected entirely. This prevents the pin from jumping across the street (e.g. Budweiser Gardens), while safely accounting for massive setback distances on large properties (e.g. St. Peter's Cathedral Basilica).

### 2. Feature Deduplication (`buildingExtrusions.ts`)
To prevent MapLibre Z-fighting, the frontend dynamically deduplicates identical polygons before feeding them into the GeoJSON source:

- **Geometry Hashing:** We `JSON.stringify` the geometry coordinates and use it as a hash map key.
- **Shared Custom IDs:** If a geometry already exists, we do NOT create a new feature. Instead, we map the subsequent venue to the existing `customFeatureId`.
- **Multi-Venue State (`state.matchedBuildings`):** The state manager stores an array of `VenueMatch` objects for each building ID. If multiple venues share a building, shimmering the building or clicking it will properly evaluate all venues within it, using the highest priority color (e.g., active specials over dormant).

## Workflow for Modifications
1. If adding new venue types, update `VENUE_COLORS` in `buildingExtrusions.ts`.
2. Do not modify the 25m street-bounding logic in `sync_civic_buildings.js` unless the municipal data offset significantly shifts.
3. If MapLibre 3D building hover states break again, ensure that `sync_civic_buildings.js` is not accidentally stripping the geometries or creating subtle floating-point differences in the geojson coordinates that bypass the deduplication hash.
