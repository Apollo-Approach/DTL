'use client';

import React, { useState } from 'react';
import { SafetyIncident } from '@/types';
import { updateIncidentStatus } from '@/app/actions/crisis';
import ResolutionReportModal from './ResolutionReportModal';

interface IncidentActionPanelProps {
  incident: SafetyIncident;
  onClose: () => void;
  onUpdate: (updatedIncident: SafetyIncident) => void;
  userRole: string;
  currentUserId?: string;
}

export default function IncidentActionPanel({ incident, onClose, onUpdate, userRole, currentUserId }: IncidentActionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);

  // M2+ can resolve, OR the original citizen who reported it.
  const canResolve = ['m2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'].includes(userRole) || (currentUserId && incident.reported_by === currentUserId);

  const handleAction = async (newStatus: 'DISPATCHED' | 'RESOLVED') => {
    setLoading(true);
    setError(null);
    try {
      const res = await updateIncidentStatus(incident.id, newStatus);
      if (res.success) {
        onUpdate({ ...incident, status: newStatus as any });
        if (newStatus === 'RESOLVED') {
          onClose();
        }
      } else {
        setError(res.error || 'Failed to update status');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'REPORTED': return 'text-amber-500 bg-amber-500/20 border-amber-500/30';
      case 'DISPATCHED': return 'text-cyan-500 bg-cyan-500/20 border-cyan-500/30';
      case 'RESOLVED': return 'text-emerald-500 bg-emerald-500/20 border-emerald-500/30';
      default: return 'text-neutral-500 bg-neutral-500/20 border-neutral-500/30';
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-4 sm:bottom-8 mx-auto w-[90%] max-w-sm bg-neutral-950/90 backdrop-blur-md border border-neutral-800 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex justify-between items-start p-4 border-b border-neutral-800 bg-gradient-to-r from-red-950/30 to-neutral-900/50">
        <div>
          <h3 className="text-red-400 font-bold text-lg flex items-center gap-2">
            <span className="text-xl">🚨</span> {incident.type.replace('_', ' ')}
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Reported: {new Date(incident.reported_at).toLocaleTimeString()}
          </p>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-white p-1 rounded transition-colors">
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-neutral-300">Current Status:</span>
          <span className={`text-xs font-bold px-2 py-1 border rounded uppercase tracking-wider ${getStatusColor(incident.status)}`}>
            {incident.status}
          </span>
        </div>

        {incident.description && (
          <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/50">
            <p className="text-sm text-neutral-300 italic">"{incident.description}"</p>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs text-center font-semibold bg-red-950/30 p-2 rounded">{error}</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-2">
          {canResolve && incident.status === 'REPORTED' && (
            <button
              onClick={() => handleAction('DISPATCHED')}
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/50"
            >
              {loading ? 'Updating...' : 'Acknowledge (Dispatch)'}
            </button>
          )}

          {canResolve && incident.status === 'DISPATCHED' && (
            <button
              onClick={() => setShowResolutionModal(true)}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/50"
            >
              {loading ? 'Updating...' : 'Mark Resolved'}
            </button>
          )}
          
          <button
            onClick={onClose}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-2 rounded-xl transition-all mt-1 border border-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>

      {showResolutionModal && (
        <ResolutionReportModal
          incident={incident}
          onClose={() => setShowResolutionModal(false)}
          onSuccess={() => {
            setShowResolutionModal(false);
            onUpdate({ ...incident, status: 'RESOLVED' as any, resolved_at: new Date().toISOString() });
            onClose();
          }}
        />
      )}
    </div>
  );
}
