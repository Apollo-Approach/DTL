// src/components/map/ModPinModal.tsx
'use client';

import React, { useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from './mapHelpers';
import { compressImage } from '@/lib/compressImage';
import { Camera, X, Loader2 } from 'lucide-react';

interface ModPinModalProps {
  pendingPinLocation: { lng: number; lat: number };
  setPendingPinLocation: React.Dispatch<React.SetStateAction<{ lng: number; lat: number } | null>>;
  pinCategory: string;
  setPinCategory: React.Dispatch<React.SetStateAction<string>>;
  pinDescription: string;
  setPinDescription: React.Dispatch<React.SetStateAction<string>>;
  mapRef: React.RefObject<maplibregl.Map | null>;
  supabase: SupabaseClient;
}

const INCIDENT_CATEGORIES = [
  { id: 'POSSIBLE_OD', label: 'Possible Overdose', icon: '💊' },
  { id: 'OPEN_AIR_DRUGS', label: 'Open-Air Use / Trade', icon: '🔄' },
  { id: 'CROWD_NOISE', label: 'Crowd / Noise Issue', icon: '📢' },
  { id: 'CLEANUP', label: 'Cleanup Needed', icon: '🧹' },
] as const;

export default function ModPinModal({
  pendingPinLocation, setPendingPinLocation,
  pinCategory, setPinCategory,
  pinDescription, setPinDescription,
  mapRef, supabase,
}: ModPinModalProps) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    // Create a quick preview
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancel = () => {
    removePhoto();
    setPendingPinLocation(null);
    setPinCategory('');
    setPinDescription('');
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    let imageUrl: string | null = null;

    try {
      // 1. Compress & upload photo if provided
      if (photoFile) {
        const compressed = await compressImage(photoFile, 600, 0.4);
        const ext = compressed.type === 'image/webp' ? 'webp' : 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('incident-photos')
          .upload(fileName, compressed, {
            contentType: compressed.type,
            cacheControl: '31536000', // 1 year cache — immutable content
          });

        if (uploadError) {
          console.error('Photo upload failed:', uploadError);
        } else if (uploadData) {
          const { data: urlData } = supabase.storage
            .from('incident-photos')
            .getPublicUrl(uploadData.path);
          imageUrl = urlData.publicUrl;
        }
      }

      // 2. Persist incident to Supabase
      const { error } = await supabase.rpc('insert_safety_incident', {
        p_type: pinCategory,
        p_description: pinDescription || null,
        p_lng: pendingPinLocation.lng,
        p_lat: pendingPinLocation.lat,
        p_image_url: imageUrl,
      });

      if (error) {
        console.error('Mod Pin insert failed:', error);
      }

      // 3. Render local marker for immediate visual feedback
      if (mapRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `
          <span class="relative flex h-6 w-6">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-6 w-6 bg-red-600 border-2 border-white shadow-lg flex items-center justify-center text-[10px]">⚠️</span>
          </span>
        `;
        el.className = 'cursor-pointer z-50';

        const photoHtml = imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="Incident photo" style="width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 150px; object-fit: cover;" />`
          : '';

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([pendingPinLocation.lng, pendingPinLocation.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: true }).setHTML(
              `<div style="color: #000; font-family: sans-serif; padding: 6px; min-width: 180px;">
                <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; color: #dc2626;">🚨 Mod Pin Logged</h3>
                ${photoHtml}
                <p style="margin: 0 0 4px 0; font-size: 12px; color: #444;"><strong>Type:</strong> ${escapeHtml(pinCategory)}</p>
                <p style="margin: 0 0 12px 0; font-size: 12px; color: #444;"><strong>Desc:</strong> "${escapeHtml(pinDescription) || 'No description'}"</p>
                <p style="margin: 0; font-size: 11px; color: #666; font-style: italic;">Liaison team dispatched.</p>
              </div>`
            )
          )
          .addTo(mapRef.current);

        marker.togglePopup();
      }

      handleCancel();
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-full overflow-y-auto">
        {/* 911 ESCAPE HATCH */}
        <div className="p-4 bg-red-950/40 border-b border-red-900/50">
          <h2 className="text-red-400 font-bold text-lg mb-2 text-center">Is this a violent emergency?</h2>
          <a href="tel:911" className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-lg shadow-lg shadow-red-900/50 flex items-center justify-center gap-2 text-lg no-underline">
            🚨 CALL 911
          </a>
        </div>

        <div className="p-6 space-y-6">
          {/* CODE OF CONDUCT & LPS NOTICE */}
          <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
            <p className="text-sm text-neutral-300 font-medium mb-3">
              This pin dispatches DTL Street Liaisons for <span className="text-white font-bold">low-risk disruptions</span>.
            </p>
            <div className="text-xs text-neutral-400 bg-neutral-900/50 p-3 rounded-lg">
              <span className="text-cyan-400 font-bold">LPS Notice:</span> The London Police Service relies on a data-driven model. If a crime has occurred, you must <a href="https://www.londonpolice.ca/en/services/Online-Reporting.aspx" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline font-bold">file an official report</a> to ensure adequate city funding and response.
            </div>
          </div>

          {/* CATEGORY SELECTION */}
          <div>
            <h3 className="text-sm text-neutral-400 uppercase tracking-widest font-bold mb-3">Select Category</h3>
            <div className="flex flex-col gap-2">
              {INCIDENT_CATEGORIES.map(cat => (
                <button 
                  key={cat.id}
                  onClick={() => setPinCategory(cat.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${pinCategory === cat.id ? 'bg-cyan-900/50 border-cyan-500 text-cyan-50' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'}`}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="font-bold">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3-5 WORD DESCRIPTION */}
          <div>
            <h3 className="text-sm text-neutral-400 uppercase tracking-widest font-bold mb-2">Description (Max 5 Words)</h3>
            <input 
              type="text" 
              maxLength={40}
              value={pinDescription}
              onChange={(e) => setPinDescription(e.target.value)}
              placeholder="Describe in 3 to 5 words..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* PHOTO UPLOAD */}
          <div>
            <h3 className="text-sm text-neutral-400 uppercase tracking-widest font-bold mb-2">
              Attach Photo <span className="text-neutral-500 normal-case font-normal">(optional)</span>
            </h3>
            
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-neutral-700">
                <img 
                  src={photoPreview} 
                  alt="Preview" 
                  className="w-full max-h-40 object-cover"
                />
                <button
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center transition-colors"
                  aria-label="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 text-[10px] bg-black/60 text-neutral-300 px-2 py-1 rounded-md">
                  Will compress to ~25KB before upload
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 border border-dashed border-neutral-600 rounded-xl flex items-center justify-center gap-3 text-neutral-400 hover:text-neutral-300 transition-colors"
              >
                <Camera className="w-5 h-5" />
                <span className="font-medium text-sm">Tap to add a photo</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleCancel}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl border border-neutral-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              disabled={!pinCategory || isSubmitting}
              onClick={handleSubmit}
              className={`flex-[2] py-3 font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${pinCategory && !isSubmitting ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
