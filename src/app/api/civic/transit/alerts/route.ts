import { NextResponse } from 'next/server';

export const revalidate = 60; // Cache for 60 seconds — alerts don't change frequently

interface TransitAlert {
  id: string;
  header: string;
  description: string;
  effect: string;
  severity: number;
  routes: string[];
  stops: string[];
}

interface GtfsAlertEntity {
  id?: string;
  alert?: {
    active_period?: Array<{ start?: number; end?: number }>;
    informed_entity?: Array<{
      route_id?: string;
      stop_id?: string;
      direction_id?: number;
    }>;
    cause?: number;
    effect?: number;
    severity_level?: number;
    header_text?: {
      translation?: Array<{ text?: string; language?: string }>;
    };
    description_text?: {
      translation?: Array<{ text?: string; language?: string }>;
    };
    effect_detail?: {
      translation?: Array<{ text?: string; language?: string }>;
    };
  };
}

/** Maps GTFS-RT effect enum to human-readable label */
function getEffectLabel(effect: number | undefined): string {
  switch (effect) {
    case 1: return 'No Service';
    case 2: return 'Reduced Service';
    case 3: return 'Significant Delays';
    case 4: return 'Detour';
    case 5: return 'Additional Service';
    case 6: return 'Modified Service';
    case 7: return 'Other Effect';
    case 8: return 'Stop Moved';
    case 9: return 'No Effect';
    default: return 'Service Alert';
  }
}

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `http://gtfs.ltconline.ca/Alert/Alerts.json?t=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`LTC Alerts Feed Error: ${response.status}`);

    const data = await response.json();
    const entities: GtfsAlertEntity[] = data.entity || [];
    const nowSec = Math.floor(Date.now() / 1000);

    // Deduplicate by description — LTC often duplicates across routes
    const seen = new Set<string>();
    const alerts: TransitAlert[] = [];

    for (const entity of entities) {
      const a = entity.alert;
      if (!a) continue;

      // Check if alert is currently active
      const isActive = !a.active_period?.length || a.active_period.some(
        (p) => (!p.start || p.start <= nowSec) && (!p.end || p.end >= nowSec)
      );
      if (!isActive) continue;

      const header = a.header_text?.translation?.[0]?.text || 'Service Alert';
      const description = a.description_text?.translation?.[0]?.text || '';
      const effectDetail = a.effect_detail?.translation?.[0]?.text || '';
      const effectLabel = effectDetail || getEffectLabel(a.effect);

      // Collect affected routes and stops
      const routes = [...new Set(
        (a.informed_entity || [])
          .map((ie) => ie.route_id)
          .filter((r): r is string => !!r)
      )];
      const stops = [...new Set(
        (a.informed_entity || [])
          .map((ie) => ie.stop_id)
          .filter((s): s is string => !!s)
      )];

      // Deduplicate by description text (LTC sends same closure for each route)
      const dedupeKey = `${description.slice(0, 80)}`;
      if (seen.has(dedupeKey)) {
        // Merge routes into existing alert
        const existing = alerts.find(
          (al) => al.description.slice(0, 80) === description.slice(0, 80)
        );
        if (existing) {
          routes.forEach((r) => {
            if (!existing.routes.includes(r)) existing.routes.push(r);
          });
        }
        continue;
      }
      seen.add(dedupeKey);

      alerts.push({
        id: entity.id || `alert-${alerts.length}`,
        header,
        description: description.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim(),
        effect: effectLabel,
        severity: a.severity_level ?? 1,
        routes,
        stops,
      });
    }

    // Sort by severity (higher = more important)
    alerts.sort((a, b) => b.severity - a.severity);

    // Build a route → alerts lookup for the frontend
    const routeAlerts: Record<string, string[]> = {};
    for (const alert of alerts) {
      for (const route of alert.routes) {
        if (!routeAlerts[route]) routeAlerts[route] = [];
        routeAlerts[route].push(`${alert.header}: ${alert.description.slice(0, 100)}`);
      }
    }

    return NextResponse.json({
      alerts,
      routeAlerts,
      meta: {
        totalRaw: entities.length,
        totalDeduplicated: alerts.length,
        routesAffected: Object.keys(routeAlerts).length,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Transit Alerts API Error:', err.message);
    return NextResponse.json(
      { alerts: [], routeAlerts: {}, error: 'LTC alerts feed offline' },
      { status: 504 }
    );
  }
}
