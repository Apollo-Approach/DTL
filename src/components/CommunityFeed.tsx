// src/components/CommunityFeed.tsx
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { SocialPost } from '@/types';

export default function CommunityFeed({ initialPosts }: { initialPosts: SocialPost[] }) {
  const [posts, setPosts] = useState<SocialPost[]>(initialPosts);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Listen for live posts dropping into the database
    const channel = supabase.channel('realtime-social')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_posts' },
        (payload) => {
          console.log('New Social Post!', payload.new);
          setPosts((current) => [payload.new as SocialPost, ...current].slice(0, 10)); // Keep last 10
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="w-full mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-orange-400 mb-4 flex items-center gap-2">
        <span>#DTLNightly Live Feed</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
        </span>
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-hide">
        {posts.map(post => (
          <a 
            key={post.id} 
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-[200px] max-w-[200px] bg-black rounded-lg border border-neutral-800 overflow-hidden snap-center shrink-0 hover:border-pink-500 transition-colors block relative group"
          >
            <div className="relative w-full h-40">
              <Image 
                unoptimized
                fill
                src={post.media_url} 
                alt={`Post by ${post.username}`} 
                className="object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
              />
            </div>
            {post.media_type === 'VIDEO' && (
              <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full backdrop-blur-sm text-white text-xs font-bold">▶</div>
            )}
            <div className="p-3">
              <p className="text-xs font-bold text-pink-500 mb-1">@{post.username}</p>
              <p className="text-xs text-neutral-400 line-clamp-2">{post.caption}</p>
            </div>
          </a>
        ))}
        {posts.length === 0 && (
          <div className="text-sm text-neutral-500 italic p-4">No community posts yet tonight. Be the first to tag #DTLNightly!</div>
        )}
      </div>
    </div>
  );
}
