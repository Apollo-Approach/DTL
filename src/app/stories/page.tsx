'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Upload, Video, Tag, CheckCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface BrollClip {
  id: string;
  venue_id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  status: string;
  uploaded_at: string;
  duration_seconds?: string;
}

export default function CommunityStoriesPage() {
  const [clips, setClips] = useState<BrollClip[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'upload'>('feed');
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.from('broll_clips')
      .select('*')
      .eq('is_approved', true)
      .order('uploaded_at', { ascending: false })
      .then((res) => setClips(res.data || []));
  }, [supabase]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      
      {/* Header */}
      <div className="w-full bg-neutral-900 border-b border-neutral-800 sticky top-0 z-10 px-4 py-4 flex justify-between items-center max-w-[1200px] mx-auto">
        <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-cyan-400">
          DTL Community Stories
        </h1>
        <div className="flex bg-neutral-800 rounded-lg p-1">
          <button 
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'feed' ? 'bg-neutral-700 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
            onClick={() => setActiveTab('feed')}
          >
            Watch Feed
          </button>
          <button 
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'upload' ? 'bg-neutral-700 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload B-Roll
          </button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[1200px] mx-auto p-4 md:p-8">
        
        {activeTab === 'feed' && (
          <div>
            <div className="mb-8 p-6 bg-gradient-to-r from-purple-900/40 to-cyan-900/40 border border-purple-500/30 rounded-2xl flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/2 aspect-video bg-black rounded-xl border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center justify-center relative overflow-hidden group">
                <span className="text-4xl">▶️</span>
                <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors flex items-center justify-center">
                  <span className="font-bold uppercase tracking-wider">Play Showcase Video</span>
                </div>
              </div>
              <div className="w-full md:w-1/2">
                <h2 className="text-2xl font-bold mb-3">London Nightlife Showcase</h2>
                <p className="text-neutral-400 mb-4">A collaborative visual diary of downtown London, curated from verified community B-Roll submissions. See the city&apos;s pulse.</p>
                <div className="flex gap-2">
                  <span className="bg-purple-900/50 text-purple-400 text-xs px-2 py-1 rounded font-bold">#LiveMusic</span>
                  <span className="bg-cyan-900/50 text-cyan-400 text-xs px-2 py-1 rounded font-bold">#NightMarket</span>
                  <span className="bg-emerald-900/50 text-emerald-400 text-xs px-2 py-1 rounded font-bold">#SafeStreets</span>
                </div>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 border-b border-neutral-800 pb-2">Verified B-Roll Assets</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {clips.length > 0 ? clips.map((clip) => (
                <div key={clip.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group cursor-pointer hover:border-purple-500 transition-colors">
                  <div className="aspect-video bg-neutral-800 flex items-center justify-center relative">
                    {clip.thumbnail_url ? (
                      <Image unoptimized fill src={clip.thumbnail_url} alt={clip.title || 'B-Roll clip'} className="object-cover" />
                    ) : (
                      <Video size={32} className="text-neutral-600 group-hover:text-purple-400 transition-colors" />
                    )}
                    <span className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {clip.duration_seconds || '0:15'}
                    </span>
                  </div>
                  <div className="p-3">
                    <h4 className="font-bold text-sm mb-1 truncate">{clip.title}</h4>
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span className="flex items-center gap-1"><Clock size={12}/> {new Date(clip.uploaded_at).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={12}/> Verified</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-12 text-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl">
                  <Video size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No verified B-Roll clips available yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Submit B-Roll</h2>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl">
              <div className="w-full aspect-video border-2 border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center text-neutral-500 hover:text-white hover:border-purple-500 transition-colors cursor-pointer mb-6 group bg-neutral-950">
                <Upload size={48} className="mb-4 group-hover:-translate-y-2 transition-transform" />
                <span className="font-bold text-lg">Click to Browse or Drag & Drop</span>
                <span className="text-sm mt-2">MP4, MOV up to 500MB (Max 30s)</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1">Clip Title</label>
                  <input type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500" placeholder="e.g., Dundas Place Street Fair crowd" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-400 mb-1">Tags (Comma separated)</label>
                  <div className="relative">
                    <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 pl-10 text-white focus:outline-none focus:border-cyan-500" placeholder="live-music, crowd, drone" />
                  </div>
                </div>
                
                <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg mt-6">
                  <h4 className="font-bold text-amber-400 text-sm mb-1">Moderation Policy</h4>
                  <p className="text-xs text-neutral-400">All uploads undergo content review before appearing in the public asset library. By uploading, you grant DTL Nightly usage rights for community promotion.</p>
                </div>

                <button className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl mt-4 shadow-lg transition-all">
                  Upload for Review
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
