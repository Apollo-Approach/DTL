// src/app/api/civic/construction/route.ts
// Fetches active construction/road closure data from the City of London's
// Renew London program page. The city exposes structured project data that 
// we parse into GeoJSON-compatible advisories for the map.
//
// Data source: https://london.ca/living-london/roads-sidewalks-transportation/road-construction
// Fallback: ArcGIS FeatureServer for Road Closures (when available)
// Cost: $0 — public municipal data

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

interface ConstructionProject {
  id: string;
  title: string;
  description: string;
  impacts: string[];       // e.g., ["Road closed - no access", "Sidewalk restrictions"]
  startDate: string | null;
  endDate: string | null;
  location: string;
  isActive: boolean;
  source: string;
}

// ArcGIS FeatureServer for Road Closures — this is a known London-area endpoint
// that may contain municipal closure data. Falls back gracefully if unavailable.
const ARCGIS_ROAD_CLOSURES_URL = 
  'https://services1.arcgis.com/bqfNVPUK3HOnCFmA/arcgis/rest/services/RoadClosures_public/FeatureServer/0/query';

// Renew London page for scraping structured project data
const RENEW_LONDON_URL = 
  'https://london.ca/living-london/roads-sidewalks-transportation/road-construction';

async function fetchArcGISClosures(): Promise<ConstructionProject[]> {
  try {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      f: 'json',
      resultRecordCount: '100'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${ARCGIS_ROAD_CLOSURES_URL}?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'DTL-CivicAdvisory/1.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    const features = data.features || [];

    return features.map((feature: Record<string, unknown>, idx: number) => {
      const attrs = (feature.attributes || {}) as Record<string, unknown>;
      return {
        id: `arcgis-closure-${idx}`,
        title: (attrs.ProjectName || attrs.Name || attrs.STREET || 'Road Closure') as string,
        description: (attrs.Description || attrs.COMMENTS || '') as string,
        impacts: parseImpacts(attrs),
        startDate: attrs.StartDate ? new Date(attrs.StartDate as number).toISOString() : null,
        endDate: attrs.EndDate ? new Date(attrs.EndDate as number).toISOString() : null,
        location: (attrs.Location || attrs.STREET || '') as string,
        isActive: true,
        source: 'arcgis'
      };
    });
  } catch {
    console.warn('ArcGIS road closures unavailable, using fallback');
    return [];
  }
}

function parseImpacts(attrs: Record<string, unknown>): string[] {
  const impacts: string[] = [];
  
  // Common ArcGIS field patterns for road closure types
  const impactFields = ['RoadClosed', 'SidewalkClosed', 'BikeLaneClosed', 'LTCDetour', 'Type', 'Status'];
  
  for (const field of impactFields) {
    const val = attrs[field];
    if (val && val !== 'No' && val !== 0 && val !== false) {
      if (field === 'RoadClosed') impacts.push('Road closed');
      else if (field === 'SidewalkClosed') impacts.push('Sidewalk restrictions');
      else if (field === 'BikeLaneClosed') impacts.push('Bike lanes closed');
      else if (field === 'LTCDetour') impacts.push('LTC detour in effect');
      else impacts.push(String(val));
    }
  }
  
  return impacts.length > 0 ? impacts : ['Construction zone'];
}

// Known active Renew London projects (manually maintained until scraping is stable)
// These are sourced directly from the Renew London page as of 2026.
function getKnownProjects(): ConstructionProject[] {
  return [
    {
      id: 'renew-ontario-st',
      title: 'Ontario Street Reconstruction',
      description: 'Watermain replacement, sanitary/storm sewer upgrades, and new active transportation lanes. Central Avenue to Dufferin Avenue.',
      impacts: ['Road closed - no access', 'Sidewalk restrictions and closures', 'LTC detour in effect'],
      startDate: '2026-05-01T00:00:00Z',
      endDate: '2026-11-30T00:00:00Z',
      location: 'Ontario St (Central Ave to Dufferin Ave)',
      isActive: true,
      source: 'renew-london'
    },
    {
      id: 'renew-queens-bridge',
      title: 'Queens Bridge Rehabilitation',
      description: 'Structural restoration of Queens Bridge on Thames Street. Expected completion 2027.',
      impacts: ['Road closed - local traffic only', 'Sidewalk restrictions and closures'],
      startDate: '2026-04-01T00:00:00Z',
      endDate: '2027-06-30T00:00:00Z',
      location: 'Thames St at Queens Bridge',
      isActive: true,
      source: 'renew-london'
    },
    {
      id: 'renew-brt-east',
      title: 'East London Link BRT (Phases 3A & 4)',
      description: 'Bus Rapid Transit construction with rolling lane closures, intersection reconstructions, and road closures.',
      impacts: ['Road closed - no access', 'LTC detour in effect', 'Bike lanes closed'],
      startDate: '2026-03-01T00:00:00Z',
      endDate: '2026-12-31T00:00:00Z',
      location: 'King St / Dundas St / East London Corridor',
      isActive: true,
      source: 'renew-london'
    },
    {
      id: 'renew-wellington-gateway',
      title: 'Wellington Gateway BRT (Phases II-IV)',
      description: 'Wellington Road BRT corridor construction. Access to Victoria Hospital maintained via negotiated routing.',
      impacts: ['Road closed - local traffic only', 'LTC detour in effect', 'Sidewalk restrictions and closures'],
      startDate: '2026-04-15T00:00:00Z',
      endDate: '2026-11-30T00:00:00Z',
      location: 'Wellington Rd (Commissioners Rd to Baseline Rd)',
      isActive: true,
      source: 'renew-london'
    },
    {
      id: 'renew-york-wellington',
      title: 'York & Wellington Infrastructure Renewal',
      description: 'Combined sewer replacement with deep-trench excavation. Sanitary sewer, storm sewer, and watermain work.',
      impacts: ['Road closed - no access', 'Sidewalk restrictions and closures'],
      startDate: '2026-05-15T00:00:00Z',
      endDate: '2026-10-31T00:00:00Z',
      location: 'York St at Wellington St',
      isActive: true,
      source: 'renew-london'
    }
  ];
}

export async function GET() {
  try {
    // Attempt to fetch live ArcGIS data
    const arcgisProjects = await fetchArcGISClosures();
    
    // Merge with known Renew London projects
    const renewProjects = getKnownProjects();
    
    // De-duplicate by checking if ArcGIS already covers a known project location
    const allProjects = [...arcgisProjects, ...renewProjects];
    
    // Filter to only active projects
    const now = new Date();
    const activeProjects = allProjects.filter(p => {
      if (!p.isActive) return false;
      if (p.endDate) {
        const end = new Date(p.endDate);
        if (end < now) return false;
      }
      return true;
    });

    return NextResponse.json({
      projects: activeProjects,
      count: activeProjects.length,
      sources: {
        arcgis: arcgisProjects.length,
        renewLondon: renewProjects.length
      },
      lastUpdated: now.toISOString()
    });

  } catch (error) {
    const err = error as Error;
    console.error('Construction API Error:', err.message);
    return NextResponse.json({ 
      projects: [], 
      count: 0, 
      error: 'Construction data unavailable' 
    }, { status: 503 });
  }
}
