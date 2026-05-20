'use client';

import React, { useState, useCallback } from 'react';
import { MapPin, Bell, Shield, ChevronRight, X, Zap } from 'lucide-react';

interface LocationPermissionFlowProps {
  onComplete: (granted: boolean) => void;
  onDismiss: () => void;
}

/**
 * Location Permission Flow — Sprint 4.1
 *
 * "Value Exchange" UX flow required for iOS/Android compliance (2026).
 *
 * Apple App Review Guidelines §5.1.2: Apps must explain why background
 * location is needed BEFORE requesting permission.
 *
 * Android Play Store: ACCESS_BACKGROUND_LOCATION requires "Prominent
 * Disclosure" UX + "core functionality" justification.
 *
 * This component shows a multi-step onboarding that:
 * 1. Explains WHY we need location (value proposition)
 * 2. Shows a PREVIEW of what notifications look like
 * 3. Requests permission with full transparency
 */

const STEPS = [
  {
    id: 'value',
    icon: <Zap className="w-12 h-12 text-yellow-400" />,
    title: 'Never miss a deal again',
    subtitle: 'DTL can alert you to deals, events, and happenings — right when you\'re walking past.',
    visual: (
      <div className="mt-6 bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden shadow-2xl max-w-sm mx-auto">
        {/* Simulated notification */}
        <div className="p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            DTL
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-400 font-bold">DTL Nightly · now</p>
            <p className="text-sm font-bold text-white mt-1">🍻 $5 pints at McCabe&apos;s</p>
            <p className="text-xs text-neutral-400 mt-0.5">You&apos;re 50m away — tonight only!</p>
          </div>
        </div>
        <div className="h-px bg-neutral-700" />
        <div className="p-4 flex items-start gap-3 opacity-60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            DTL
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-400 font-bold">DTL Nightly · 8 min ago</p>
            <p className="text-sm font-bold text-white mt-1">🎵 Live jazz at Chaucer&apos;s Pub</p>
            <p className="text-xs text-neutral-400 mt-0.5">Starting in 30 min — no cover tonight</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'privacy',
    icon: <Shield className="w-12 h-12 text-emerald-400" />,
    title: 'Your location stays yours',
    subtitle: 'We never sell, share, or store your location data on our servers. Everything runs on your device.',
    visual: (
      <div className="mt-6 space-y-4 max-w-sm mx-auto">
        {[
          { icon: '📱', label: 'Location processed locally on your device', desc: 'Never sent to our servers' },
          { icon: '🔒', label: 'No third-party trackers', desc: 'We don\'t use location analytics SDKs' },
          { icon: '⏹️', label: 'Turn off anytime', desc: 'In your phone\'s Settings app' },
          { icon: '🗑️', label: 'No location history stored', desc: 'When you leave an area, the data is gone' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-neutral-800/50 rounded-xl border border-neutral-700/50">
            <span className="text-xl shrink-0">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-white">{item.label}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'request',
    icon: <MapPin className="w-12 h-12 text-purple-400" />,
    title: 'Allow location access',
    subtitle: 'To detect when you\'re near participating venues, DTL needs background location access. Select "Allow Always" when prompted.',
    visual: (
      <div className="mt-6 max-w-sm mx-auto">
        <div className="bg-neutral-800/80 border-2 border-purple-500/30 rounded-2xl p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-cyan-500/5" />
          <div className="relative z-10">
            <MapPin className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <p className="text-lg font-bold text-white mb-2">Select &ldquo;Allow Always&rdquo;</p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              This lets DTL detect nearby deals even when the app is in the background.
              <br /><br />
              You can change this anytime in Settings → DTL → Location.
            </p>
          </div>
        </div>
      </div>
    ),
  },
];

export default function LocationPermissionFlow({ onComplete, onDismiss }: LocationPermissionFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  const handleNext = useCallback(async () => {
    if (!isLastStep) {
      setCurrentStep(prev => prev + 1);
      return;
    }

    // Last step → actually request permission
    setIsRequesting(true);
    try {
      // Dynamic import to prevent SSR crash
      const { Geolocation } = await import('@capacitor/geolocation');
      const result = await Geolocation.requestPermissions({
        permissions: ['location', 'coarseLocation'],
      });

      const granted = result.location === 'granted' || result.coarseLocation === 'granted';
      onComplete(granted);
    } catch (err) {
      console.error('[LocationPermission] Error requesting permissions:', err);
      onComplete(false);
    } finally {
      setIsRequesting(false);
    }
  }, [currentStep, isLastStep, onComplete]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-6 right-6 text-neutral-500 hover:text-white transition-colors p-2"
      >
        <X size={24} />
      </button>

      <div className="w-full max-w-md text-center">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-8 bg-purple-500'
                  : i < currentStep
                    ? 'w-4 bg-purple-500/50'
                    : 'w-4 bg-neutral-700'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          {step.icon}
        </div>

        {/* Title & Subtitle */}
        <h2 className="text-2xl font-black text-white mb-3">
          {step.title}
        </h2>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-xs mx-auto">
          {step.subtitle}
        </p>

        {/* Visual */}
        {step.visual}

        {/* Action buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={handleNext}
            disabled={isRequesting}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              isLastStep
                ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50'
                : 'bg-white text-black hover:bg-neutral-200'
            } ${isRequesting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRequesting ? (
              <span className="animate-spin">⏳</span>
            ) : isLastStep ? (
              <>
                <Bell size={18} /> Enable Location Alerts
              </>
            ) : (
              <>
                Continue <ChevronRight size={18} />
              </>
            )}
          </button>

          {!isLastStep && (
            <button
              onClick={onDismiss}
              className="w-full py-3 text-neutral-500 text-sm font-bold hover:text-neutral-300 transition-colors"
            >
              Not now
            </button>
          )}

          {isLastStep && (
            <button
              onClick={() => onComplete(false)}
              className="w-full py-3 text-neutral-500 text-sm font-bold hover:text-neutral-300 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
