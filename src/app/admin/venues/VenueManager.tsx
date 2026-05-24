'use client';
import { saveVenue } from '@/app/actions/venues';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Camera, Edit2, Plus, Save, Search, X } from 'lucide-react';

export interface Venue {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  lat?: number;
  lng?: number;
  image_url?: string;
  is_manually_curated?: boolean;
}

export default function VenueManager({ initialVenues }: { initialVenues: Venue[] }) {
  const [venues, setVenues] = useState<Venue[]>(initialVenues);
  const [search, setSearch] = useState('');
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const supabase = createClient();

  const filteredVenues = venues.filter(v => 
    v.name?.toLowerCase().includes(search.toLowerCase()) || 
    v.type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (venue: Venue) => {
    setEditingVenue({ ...venue });
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingVenue({
      name: '',
      description: '',
      type: '',
      lat: 42.9849, // Default to London ON
      lng: -81.2453,
      is_manually_curated: true,
      image_url: ''
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
      const filePath = `exteriors/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('venue-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('venue-images')
        .getPublicUrl(filePath);

      setEditingVenue((prev: Venue | null) => prev ? { ...prev, image_url: data.publicUrl } : null);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Error uploading image.');
    } finally {
      setUploadingImage(false);
    }
  };



  const handleSave = async () => {
    if (!editingVenue) return;
    setIsSaving(true);
    
    try {
      const payload: any = {
        name: editingVenue.name,
        description: editingVenue.description,
        type: editingVenue.type,
        image_url: editingVenue.image_url,
        is_manually_curated: editingVenue.is_manually_curated
      };
      
      if (editingVenue.lat !== undefined && editingVenue.lng !== undefined) {
        payload.location = `SRID=4326;POINT(${editingVenue.lng} ${editingVenue.lat})`;
      }

      const result = await saveVenue(payload, editingVenue.id);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      if (editingVenue.id) {
        setVenues(venues.map(v => v.id === editingVenue.id ? { ...v, ...payload } : v));
      } else {
        if (result.data) {
          setVenues([...venues, result.data]);
        }
      }
      
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to save venue: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || !mapContainer.current || !editingVenue) return;

    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [editingVenue.lng || -81.2453, editingVenue.lat || 42.9849],
        zoom: 15
      });
      
      mapRef.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

      markerRef.current = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([editingVenue.lng || -81.2453, editingVenue.lat || 42.9849])
        .addTo(mapRef.current);

      mapRef.current.on('click', (e) => {
        setEditingVenue((prev: Venue | null) => prev ? { ...prev, lat: e.lngLat.lat, lng: e.lngLat.lng } : null);
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]); // Only re-run if modal opens/closes

  // Update marker position if editingVenue lat/lng changes
  useEffect(() => {
    if (markerRef.current && editingVenue?.lng && editingVenue?.lat) {
      markerRef.current.setLngLat([editingVenue.lng, editingVenue.lat]);
    }
  }, [editingVenue?.lng, editingVenue?.lat]);

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search venues..."
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
          Add Venue
        </button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm text-neutral-300">
          <thead className="bg-neutral-950 text-neutral-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Image</th>
              <th className="px-6 py-4">Venue</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Curated</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filteredVenues.map((v) => (
              <tr key={v.id} className="hover:bg-neutral-800/50 transition-colors">
                <td className="px-6 py-4">
                  {v.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={v.image_url} alt={v.name} className="w-12 h-12 object-cover rounded-lg border border-neutral-700" />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-800 rounded-lg border border-neutral-700 flex items-center justify-center text-neutral-500">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-white">{v.name}</div>
                  <div className="text-xs text-neutral-500 line-clamp-1 max-w-xs">{v.description || 'No description'}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-neutral-800 px-3 py-1 rounded-full text-xs">{v.type || 'Unknown'}</span>
                </td>
                <td className="px-6 py-4">
                  {v.is_manually_curated ? (
                    <span className="text-emerald-400 font-medium">Yes</span>
                  ) : (
                    <span className="text-neutral-500">No (Scraper)</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => handleEdit(v)}
                    className="p-2 hover:bg-neutral-700 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor Modal */}
      {isModalOpen && editingVenue && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
              <h2 className="text-xl font-bold">{editingVenue.id ? 'Edit Venue' : 'Add New Venue'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white p-2">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Venue Name</label>
                    <input 
                      type="text"
                      value={editingVenue.name}
                      onChange={e => setEditingVenue({...editingVenue, name: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Venue Type</label>
                    <input 
                      type="text"
                      placeholder="e.g. Bar, Club, Stage"
                      value={editingVenue.type || ''}
                      onChange={e => setEditingVenue({...editingVenue, type: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Description</label>
                    <textarea 
                      rows={4}
                      value={editingVenue.description || ''}
                      onChange={e => setEditingVenue({...editingVenue, description: e.target.value})}
                      className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-lg mt-4">
                    <input 
                      type="checkbox"
                      id="manual_override"
                      checked={editingVenue.is_manually_curated || false}
                      onChange={e => setEditingVenue({...editingVenue, is_manually_curated: e.target.checked})}
                      className="w-5 h-5 rounded border-neutral-700 bg-neutral-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-neutral-900"
                    />
                    <label htmlFor="manual_override" className="text-sm">
                      <span className="font-bold text-indigo-300 block">Manual Override Protected</span>
                      <span className="text-xs text-neutral-400">If checked, the automated scraper will not overwrite this venue&apos;s details.</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4 flex flex-col">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 mb-1">Exterior Profile Image</label>
                    <div className="flex flex-col gap-3">
                      {editingVenue.image_url ? (
                        <div className="relative group">
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={editingVenue.image_url} alt="Venue" className="w-full h-40 object-cover rounded-lg border border-neutral-800" />
                          <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg backdrop-blur-sm">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                              <Camera className="w-4 h-4" /> Change Image
                            </span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                          </label>
                        </div>
                      ) : (
                        <label className="w-full h-40 border-2 border-dashed border-neutral-700 hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors rounded-lg flex flex-col items-center justify-center cursor-pointer">
                          <Camera className="w-8 h-8 text-neutral-500 mb-2" />
                          <span className="text-sm font-medium text-neutral-400">
                            {uploadingImage ? 'Uploading...' : 'Click to upload image'}
                          </span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                        </label>
                      )}
                      <input 
                        type="text"
                        placeholder="Or paste an image URL directly..."
                        value={editingVenue.image_url || ''}
                        onChange={e => setEditingVenue({...editingVenue, image_url: e.target.value})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="block text-xs font-bold text-neutral-400 mb-1 mt-2">Location Map (Click to set pin)</label>
                    <div ref={mapContainer} className="flex-1 min-h-[200px] bg-black border border-neutral-800 rounded-lg overflow-hidden relative">
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input 
                        type="number"
                        step="any"
                        placeholder="Latitude"
                        value={editingVenue.lat}
                        onChange={e => setEditingVenue({...editingVenue, lat: parseFloat(e.target.value)})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-1 outline-none text-xs"
                      />
                      <input 
                        type="number"
                        step="any"
                        placeholder="Longitude"
                        value={editingVenue.lng}
                        onChange={e => setEditingVenue({...editingVenue, lng: parseFloat(e.target.value)})}
                        className="w-full bg-black border border-neutral-800 rounded-lg px-3 py-1 outline-none text-xs"
                      />
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-800 flex justify-end gap-4 shrink-0 bg-neutral-900 rounded-b-2xl">
              <button 
                onClick={() => setIsModalOpen(false)}
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
                    Save Venue
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
