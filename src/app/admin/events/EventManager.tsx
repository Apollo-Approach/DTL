'use client';
import { saveEvent, deleteEvent } from '@/app/actions/events';
import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Edit2, Save, X, CheckCircle, Search, Calendar, MapPin, Plus, Camera, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface EventRecord {
  id?: string;
  name?: string;
  venue_id?: string;
  start_time?: string;
  end_time?: string;
  is_free?: boolean;
  price?: number;
  categories?: string[];
  description?: string;
  ticket_url?: string;
  image_url?: string;
  age_restriction?: string;
  door_time?: string;
  admin_verified?: boolean;
}

export default function EventManager({ 
  initialEvents, 
  venues 
}: { 
  initialEvents: EventRecord[], 
  venues: { id: string, name: string }[] 
}) {
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [search, setSearch] = useState('');
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const supabase = createClient();

  const filteredEvents = events.filter(e => 
    e.name?.toLowerCase().includes(search.toLowerCase()) || 
    e.venue_id?.toLowerCase().includes(search.toLowerCase())
  );

  // Helper to get local date string (YYYY-MM-DD) from ISO
  const getLocalDateStr = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return format(d, 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  // Helper to get local time string (HH:mm) from ISO
  const getLocalTimeStr = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return format(d, 'HH:mm');
    } catch {
      return '';
    }
  };

  // Combine Date (YYYY-MM-DD) and Time (HH:mm) into an ISO string
  const combineDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return '';
    const d = new Date(`${dateStr}T${timeStr}:00`);
    return d.toISOString();
  };

  const handleEdit = (event: EventRecord) => {
    setEditingEvent({ ...event });
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingEvent({
      name: '',
      venue_id: '',
      start_time: new Date().toISOString(),
      ticket_url: '',
      image_url: '',
      description: '',
      is_free: false,
      price: 0,
      admin_verified: true
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setUploadingImage(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `posters/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);

      setEditingEvent((prev: EventRecord | null) => prev ? { ...prev, image_url: data.publicUrl } : null);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!editingEvent) return;
    setIsSaving(true);
    
    try {
      // In a real app, parse categories from a comma separated string if we expose it
      const payload: any = {
        name: editingEvent.name,
        venue_id: editingEvent.venue_id,
        start_time: editingEvent.start_time,
        end_time: editingEvent.end_time || null,
        ticket_url: editingEvent.ticket_url || null,
        image_url: editingEvent.image_url || null,
        description: editingEvent.description || null,
        is_free: editingEvent.is_free,
        price: editingEvent.price,
        admin_verified: editingEvent.admin_verified,
        age_restriction: editingEvent.age_restriction || null,
        door_time: editingEvent.door_time || null
      };
      
      const result = await saveEvent(payload, editingEvent.id);
      
      if (!result.success) throw new Error(result.error);

      if (editingEvent.id) {
        setEvents(events.map(e => e.id === editingEvent.id ? { ...e, ...payload } : e));
      } else {
        if (result.data) {
          setEvents([...events, result.data]);
        }
      }
      
      setIsModalOpen(false);
      setEditingEvent(null);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to save event: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent?.id) return;
    if (!window.confirm(`Are you sure you want to completely remove ${editingEvent.name}? This action cannot be undone.`)) return;
    setIsSaving(true);
    try {
      const result = await deleteEvent(editingEvent.id);
      if (!result.success) throw new Error(result.error);
      setEvents(events.filter(e => e.id !== editingEvent?.id));
      setIsModalOpen(false);
      setEditingEvent(null);
    } catch (err: any) {
      alert('Failed to delete event: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVerified = async (event: EventRecord) => {
    if (!event.id) return;
    const isCurrentlyVerified = event.admin_verified === true;
    
    const payload = { admin_verified: !isCurrentlyVerified };
    const result = await saveEvent(payload, event.id);
    
    if (result.success) {
      setEvents(events.map(e => e.id === event.id ? { ...e, admin_verified: !isCurrentlyVerified } : e));
    } else {
      alert('Failed to verify event.');
    }
  };

  const formatEventTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      return format(parseISO(isoString), 'MMM d, yyyy h:mm a');
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
        <button 
          onClick={handleAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Event
        </button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm text-neutral-300 min-w-[800px]">
          <thead className="bg-neutral-950 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Image</th>
              <th className="px-6 py-4">Event Name</th>
              <th className="px-6 py-4">Host Venue</th>
              <th className="px-6 py-4">Start Time</th>
              <th className="px-6 py-4">Tickets</th>
              <th className="px-6 py-4">Verified</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filteredEvents.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-800/50 transition-colors">
                <td className="px-6 py-4">
                  {e.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={e.image_url} alt={e.name} className="w-12 h-12 object-cover rounded-lg border border-neutral-700" />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-800 rounded-lg border border-neutral-700 flex items-center justify-center text-neutral-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-white line-clamp-1 max-w-[200px]" title={e.name}>{e.name}</div>
                  <div className="text-xs text-neutral-500 line-clamp-1 max-w-[200px]">{e.description || 'No description'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-neutral-500" />
                    <span className="truncate max-w-[150px]">{venues.find(v => v.id === e.venue_id)?.name || e.venue_id || 'Unknown'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatEventTime(e.start_time)}
                </td>
                <td className="px-6 py-4">
                  {e.ticket_url ? (
                    <a href={e.ticket_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 truncate max-w-[100px] inline-block">
                      Link
                    </a>
                  ) : (
                    <span className="text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => toggleVerified(e)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      e.admin_verified 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700'
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 ${e.admin_verified ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    {e.admin_verified ? 'Verified' : 'Verify'}
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
                <td colSpan={7} className="px-6 py-8 text-center text-neutral-500">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Editor Modal */}
      {isModalOpen && editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
              <h2 className="text-xl font-bold">{editingEvent.id ? 'Edit Event' : 'Add New Event'}</h2>
              <button onClick={() => {setIsModalOpen(false); setEditingEvent(null);}} className="text-neutral-400 hover:text-white p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Event Name</label>
                    <input 
                      type="text"
                      value={editingEvent.name || ''}
                      onChange={e => setEditingEvent({...editingEvent, name: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Host Venue</label>
                    <select 
                      value={editingEvent.venue_id || ''}
                      onChange={e => setEditingEvent({...editingEvent, venue_id: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 appearance-none text-white"
                    >
                      <option value="" disabled>Select a venue...</option>
                      {venues.map(v => (
                        <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Start Date</label>
                      <input 
                        type="date"
                        value={getLocalDateStr(editingEvent.start_time)}
                        onChange={e => {
                          const timeStr = getLocalTimeStr(editingEvent.start_time) || '00:00';
                          setEditingEvent({...editingEvent, start_time: combineDateTime(e.target.value, timeStr)});
                        }}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-sm [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Start Time</label>
                      <input 
                        type="time"
                        value={getLocalTimeStr(editingEvent.start_time)}
                        onChange={e => {
                          const dateStr = getLocalDateStr(editingEvent.start_time) || format(new Date(), 'yyyy-MM-dd');
                          setEditingEvent({...editingEvent, start_time: combineDateTime(dateStr, e.target.value)});
                        }}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-sm [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Description</label>
                    <textarea 
                      rows={4}
                      value={editingEvent.description || ''}
                      onChange={e => setEditingEvent({...editingEvent, description: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Ticket URL</label>
                      <input 
                        type="url"
                        value={editingEvent.ticket_url || ''}
                        onChange={e => setEditingEvent({...editingEvent, ticket_url: e.target.value})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-sm"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 mb-1">Age Restriction</label>
                      <input 
                        type="text"
                        value={editingEvent.age_restriction || ''}
                        onChange={e => setEditingEvent({...editingEvent, age_restriction: e.target.value})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-sm"
                        placeholder="e.g. 19+"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4 flex flex-col">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Event Poster / Image</label>
                    <div className="flex flex-col gap-3">
                      {editingEvent.image_url ? (
                        <div className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={editingEvent.image_url} alt="Event" className="w-full h-48 object-cover rounded-lg border border-neutral-800" />
                          <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg backdrop-blur-sm">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                              <Camera className="w-4 h-4" /> Change Image
                            </span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                          </label>
                        </div>
                      ) : (
                        <label className="w-full h-48 border-2 border-dashed border-neutral-700 hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors rounded-lg flex flex-col items-center justify-center cursor-pointer">
                          <Camera className="w-8 h-8 text-neutral-500 mb-2" />
                          <span className="text-sm font-medium text-neutral-400">
                            {uploadingImage ? 'Uploading...' : 'Click to upload poster'}
                          </span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                        </label>
                      )}
                      <input 
                        type="text"
                        placeholder="Or paste an image URL directly..."
                        value={editingEvent.image_url || ''}
                        onChange={e => setEditingEvent({...editingEvent, image_url: e.target.value})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-4">
                    <h3 className="text-sm font-bold text-neutral-300">Pricing</h3>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        id="is_free"
                        checked={editingEvent.is_free || false}
                        onChange={e => setEditingEvent({...editingEvent, is_free: e.target.checked, price: e.target.checked ? 0 : editingEvent.price})}
                        className="w-5 h-5 rounded border-neutral-700 bg-neutral-900 text-indigo-600 focus:ring-indigo-600"
                      />
                      <label htmlFor="is_free" className="text-sm font-bold text-white cursor-pointer">
                        This is a Free Event
                      </label>
                    </div>
                    {!editingEvent.is_free && (
                      <div>
                        <label className="block text-xs font-bold text-neutral-400 mb-1">Ticket Price ($)</label>
                        <input 
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingEvent.price || ''}
                          onChange={e => setEditingEvent({...editingEvent, price: parseFloat(e.target.value)})}
                          className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                          placeholder="e.g. 25.00"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-lg mt-auto">
                    <input 
                      type="checkbox"
                      id="admin_verified"
                      checked={editingEvent.admin_verified !== false}
                      onChange={e => setEditingEvent({...editingEvent, admin_verified: e.target.checked})}
                      className="w-5 h-5 rounded border-neutral-700 bg-neutral-900 text-indigo-600 focus:ring-indigo-600"
                    />
                    <label htmlFor="admin_verified" className="text-sm">
                      <span className="font-bold text-indigo-300 block">Admin Verified</span>
                      <span className="text-xs text-neutral-400">If checked, this event will show the green verified checkmark.</span>
                    </label>
                  </div>

                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-800 flex justify-end gap-3 shrink-0 bg-neutral-900 rounded-b-2xl">
              {editingEvent.id && (
                <button
                  onClick={handleDelete}
                  disabled={isSaving || uploadingImage}
                  className="mr-auto text-red-500 hover:text-red-400 font-medium px-4 py-2 flex items-center gap-2 transition-colors rounded-lg hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Event
                </button>
              )}
              <button 
                onClick={() => {setIsModalOpen(false); setEditingEvent(null);}}
                disabled={isSaving || uploadingImage}
                className="px-6 py-2 rounded-lg font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || uploadingImage}
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
