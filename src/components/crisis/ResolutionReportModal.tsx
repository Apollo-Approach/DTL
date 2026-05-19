'use client';

import React, { useState } from 'react';
import { SafetyIncident } from '@/types';
import { updateIncidentResolution } from '@/app/actions/crisis';

interface ResolutionReportModalProps {
  incident: SafetyIncident;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResolutionReportModal({ incident, onClose, onSuccess }: ResolutionReportModalProps) {
  const [resolutionCode, setResolutionCode] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionCode) {
      setError('Please select a resolution outcome.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await updateIncidentResolution(incident.id, resolutionCode, resolutionNotes);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.error || 'Failed to submit report.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-red-900/40 border-b border-red-900/50 p-4">
          <h2 className="text-lg font-bold text-red-400">Resolve Crisis Incident</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Incident ID: {incident.id.split('-')[0]} • {new Date(incident.reported_at).toLocaleTimeString()}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
          
          <div>
            <label className="block text-sm font-bold text-neutral-300 mb-2">Outcome / Resolution Code *</label>
            <select 
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-white focus:border-red-500 focus:outline-none"
              value={resolutionCode}
              onChange={(e) => setResolutionCode(e.target.value)}
              required
            >
              <option value="" disabled>Select outcome...</option>
              <option value="DE_ESCALATED">✅ De-escalated / Situation Calm</option>
              <option value="NALOXONE_ADMINISTERED">💉 Naloxone Administered</option>
              <option value="EMS_DISPATCHED">🚑 EMS / Paramedics Dispatched</option>
              <option value="POLICE_DISPATCHED">🚓 Police Dispatched</option>
              <option value="FALSE_ALARM">❌ False Alarm / Accidental</option>
              <option value="OTHER">❓ Other (Explain below)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-300 mb-2">Research Notes (Optional)</label>
            <textarea 
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-white focus:border-red-500 focus:outline-none min-h-[100px]"
              placeholder="Add any context for London Cares research (e.g. 'Subject refused further assistance')"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-900 text-red-400 text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
