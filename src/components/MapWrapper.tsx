'use client';

import dynamic from 'next/dynamic';

const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full max-w-full min-w-0 h-[85svh] min-h-[500px] lg:h-[800px] flex items-center justify-center bg-neutral-900 rounded-xl border border-neutral-800 animate-pulse">
      <span className="text-neutral-500 font-semibold">Loading MapLibre WebGL Engine...</span>
    </div>
  ),
});

import { Venue, SafetyIncident, Event, Preferences, Promotion } from '@/types';

import { ErrorBoundary } from './ErrorBoundary';

interface MapWrapperProps {
  venues: Venue[];
  incidents: SafetyIncident[];
  events: Event[];
  promos?: Promotion[];
  preferences?: Preferences | null;
  mode?: 'public' | 'crisis';
}

export default function MapWrapper({ venues, incidents, events, promos = [], preferences, mode = 'public' }: MapWrapperProps) {
  return (
    <ErrorBoundary>
      <InteractiveMap venues={venues} incidents={incidents} events={events} promos={promos} preferences={preferences} mode={mode} />
    </ErrorBoundary>
  );
}
