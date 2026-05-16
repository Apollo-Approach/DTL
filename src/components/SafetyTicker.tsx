// src/components/SafetyTicker.tsx
'use client';

import React, { useEffect, useState } from 'react';

export default function SafetyTicker() {
  const [advisories, setAdvisories] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/safety/advisories')
      .then(res => res.json())
      .then(data => setAdvisories(data.advisories || []))
      .catch(err => console.error(err));
  }, []);

  if (advisories.length === 0) return null;

  return (
    <div className="w-full bg-blue-950/50 border-y border-blue-900 text-blue-200 overflow-hidden py-2 mb-8 relative z-10 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
      <div className="flex items-center max-w-[1600px] mx-auto">
        <div className="flex-shrink-0 font-bold text-xs uppercase tracking-widest px-4 flex items-center gap-2 border-r border-blue-900 bg-blue-950/80 z-20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Civic Advisories
        </div>
        <div className="flex-1 overflow-hidden relative flex items-center">
          <div className="whitespace-nowrap animate-[marquee_20s_linear_infinite] text-sm font-medium">
            {advisories.map((adv, idx) => (
              <span key={idx} className="mx-12 text-blue-300">
                ⚠️ {adv.title}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}} />
    </div>
  );
}
