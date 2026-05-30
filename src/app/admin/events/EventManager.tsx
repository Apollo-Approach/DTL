'use client';
import { saveEvent, deleteEvent } from '@/app/actions/events';
import React, { useState } from 'react';
import { Edit2, Save, X, CheckCircle, Search, Calendar, Clock, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface EventRecord {
  id: string;
  name: string;
  venue_id?: string;
  start_time: string;
  end_time?: string;
  venue_subroom?: string;
  offerings?: any;
}

export default function EventManager({ initialEvents }: { initialEvents: EventRecord[] }) {
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [search, setSearch] = useState('');
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredEvents = events.filter(e => 
    e.name?.toLowerCase().includes(search.toLowerCase()) || 
    e.venue_id?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (event: EventRecord) => {
    setEditingEvent({ ...event });
  };

  const handleSave = async () => {
    if (!editingEvent) return;
    setIsSaving(true);
    
    try {
      const payload: any = {
        name: editingEvent.name,
        venue_id: editingEvent.venue_id,
        venue_subroom: editingEvent.venue_subroom,
        start_time: editingEvent.start_time,
        end_time: editingEvent.end_time,
        offerings: editingEvent.offerings || {}
      };
      
      const result = await saveEvent(payload, editingEvent.id);
      
      if (!result.success) throw new Error(result.error);

      setEvents(events.map(e => e.id === editingEvent.id ? { ...e, ...payload } : e));
      setEditingEvent(null);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to save event: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVerified = async (event: EventRecord) => {
    const isCurrentlyVerified = event.offerings?.admin_verified === true;
    const updatedOfferings = { ...(event.offerings || {}), admin_verified: !isCurrentlyVerified };
    
    const payload = { offerings: updatedOfferings };
    const result = await saveEvent(payload, event.id);
    
    if (result.success) {
      setEvents(events.map(e => e.id === event.id ? { ...e, offerings: updatedOfferings } : e));
    } else {
      alert('Failed to verify event.');
    }
  };

  const formatEventTime = (isoString: string) => {
    try {
      return format(parseISO(isoString), 'MMM d, h:mm a');
    } catch {
      return isoString;
    }
  };

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search events or venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm text-neutral-300 min-w-[800px]">
          <thead className="bg-neutral-950 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Event Name</th>
              <th className="px-6 py-4">Host Venue</th>
              <th className="px-6 py-4">Date & Time</th>
              <th className="px-6 py-4">Verified</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filteredEvents.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-800/50 transition-colors">
                <td className="px-6 py-4 font-bold text-white max-w-xs truncate" title={e.name}>
                  {e.name}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-neutral-500" />
                    <span>{e.venue_subroom || e.venue_id || 'Unknown Venue'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-neutral-500" />
                      {formatEventTime(e.start_time)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => toggleVerified(e)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      e.offerings?.admin_verified 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 ${e.offerings?.admin_verified ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    {e.offerings?.admin_verified ? 'Verified' : 'Verify'}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => handleEdit(e)}
                    className="p-2 hover:bg-neutral-700 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors inline-flex"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                  No upcoming events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Editor Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-neutral-800">
              <h2 className="text-xl font-bold">Edit Event</h2>
              <button onClick={() => setEditingEvent(null)} className="text-neutral-400 hover:text-white p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Event Name</label>
                <input 
                  type="text"
                  value={editingEvent.name}
                  onChange={e => setEditingEvent({...editingEvent, name: e.target.value})}
                  className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Host Venue (Name or Subroom)</label>
                <input 
                  type="text"
                  value={editingEvent.venue_subroom || ''}
                  onChange={e => setEditingEvent({...editingEvent, venue_subroom: e.target.value})}
                  className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                  placeholder="e.g. London Music Hall"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Venue ID (Internal)</label>
                <input 
                  type="text"
                  value={editingEvent.venue_id || ''}
                  onChange={e => setEditingEvent({...editingEvent, venue_id: e.target.value})}
                  className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-neutral-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Start Time (ISO)</label>
                  <input 
                    type="text"
                    value={editingEvent.start_time || ''}
                    onChange={e => setEditingEvent({...editingEvent, start_time: e.target.value})}
                    className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">End Time (ISO)</label>
                  <input 
                    type="text"
                    value={editingEvent.end_time || ''}
                    onChange={e => setEditingEvent({...editingEvent, end_time: e.target.value})}
                    className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-800 flex justify-end gap-3 bg-neutral-900 rounded-b-2xl">
              <button 
                onClick={() => setEditingEvent(null)}
                disabled={isSaving}
                className="px-6 py-2 rounded-lg font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Event
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
