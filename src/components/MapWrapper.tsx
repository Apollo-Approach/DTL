'use client';

import dynamic from 'next/dynamic';

const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-neutral-900 rounded-xl border border-neutral-800 animate-pulse">
      <span className="text-neutral-500 font-semibold">Loading MapLibre WebGL Engine...</span>
    </div>
  ),
});

interface MapWrapperProps {
  venues: any[];
  incidents: any[];
  events: any[];
  mode?: 'public' | 'crisis';
}

export default function MapWrapper({ venues, incidents, events, mode = 'public' }: MapWrapperProps) {
  return <InteractiveMap venues={venues} incidents={incidents} events={events} mode={mode} />;
}
