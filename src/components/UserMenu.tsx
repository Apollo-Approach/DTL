'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { User, Settings, Shield, MapPin, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function UserMenu({ user, profile }: { user: any, profile: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  if (!user) {
    return (
      <Link 
        href="/login" 
        className="text-sm font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-xl border border-neutral-700 transition-colors shadow-lg shadow-black/50"
      >
        Sign In
      </Link>
    );
  }

  const role = profile?.role || 'citizen';
  const isAdmin = ['m2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'].includes(role);

  return (
    <div 
      className="relative z-[100]" 
      ref={dropdownRef} 
      onMouseEnter={() => setIsOpen(true)} 
      onMouseLeave={() => setIsOpen(false)}
    >
      <button 
        className={`w-11 h-11 bg-neutral-800 border ${isOpen ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-neutral-700'} hover:border-cyan-500 rounded-full flex items-center justify-center transition-all overflow-hidden shadow-lg`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {profile?.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <User className={`w-5 h-5 transition-colors ${isOpen ? 'text-cyan-400' : 'text-neutral-400'}`} />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-neutral-800 bg-neutral-800/30">
            <p className="text-sm font-bold text-white truncate">
              {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'User'}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">{user.email}</p>
            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-md">
              Role: {role.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="p-2 space-y-1">
            <Link href="/profile" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
              <Settings className="w-4 h-4 text-neutral-400" /> Profile Settings
            </Link>

            {isAdmin && (
              <>
                <div className="h-px bg-neutral-800 my-2 mx-2"></div>
                <div className="px-3 py-1.5 text-[10px] font-black text-neutral-500 uppercase tracking-widest">Admin Tools</div>
                
                <Link href="/admin/venues" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
                  <MapPin className="w-4 h-4 text-cyan-400" /> Venue Manager
                </Link>
                
                <Link href="/mod" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
                  <Shield className="w-4 h-4 text-purple-400" /> Moderation Console
                </Link>
              </>
            )}

            <div className="h-px bg-neutral-800 my-2 mx-2"></div>

            <button 
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-xl transition-colors text-left"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
