'use client';

import React, { useState } from 'react';
import { LogIn, Ticket, Plus, Activity, LayoutDashboard, Settings, User } from 'lucide-react';

export default function VenuePortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('promotions');

  // MOCK LOGIN STATE
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <div className="w-20 h-20 bg-purple-900/30 rounded-full flex items-center justify-center text-purple-500 mb-6 border border-purple-900/50">
            <span className="text-4xl">🏢</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Venue Portal</h1>
          <p className="text-neutral-500 text-sm mb-8 text-center">Manage your DTL Nightly presence, create promotions, and track engagement.</p>
          
          <button 
            onClick={() => setIsLoggedIn(true)}
            className="w-full bg-white hover:bg-neutral-100 text-black font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.78 15.68 17.58V20.34H19.25C21.34 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4"/>
              <path d="M12 23C14.97 23 17.46 22.02 19.25 20.34L15.68 17.58C14.71 18.23 13.46 18.64 12 18.64C9.17 18.64 6.78 16.73 5.92 14.16H2.23V17.02C4.03 20.59 7.73 23 12 23Z" fill="#34A853"/>
              <path d="M5.92 14.16C5.7 13.52 5.57 12.78 5.57 12C5.57 11.22 5.7 10.48 5.92 9.84V6.98H2.23C1.49 8.46 1.07 10.18 1.07 12C1.07 13.82 1.49 15.54 2.23 17.02L5.92 14.16Z" fill="#FBBC05"/>
              <path d="M12 5.36C13.62 5.36 15.07 5.92 16.22 7.01L19.33 3.9C17.46 2.16 14.97 1 12 1C7.73 1 4.03 3.41 2.23 6.98L5.92 9.84C6.78 7.27 9.17 5.36 12 5.36Z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // MOCK DASHBOARD STATE
  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <div className="w-full md:w-64 bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-3 mb-8 px-2 mt-4">
          <span className="text-2xl">🏢</span>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">Venue Portal</h1>
        </div>
        
        <button className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${activeTab === 'dashboard' ? 'bg-purple-900/40 text-purple-400 border border-purple-500/30' : 'text-neutral-400 hover:bg-neutral-800'}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={20} /> Dashboard
        </button>
        <button className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${activeTab === 'promotions' ? 'bg-purple-900/40 text-purple-400 border border-purple-500/30' : 'text-neutral-400 hover:bg-neutral-800'}`} onClick={() => setActiveTab('promotions')}>
          <Ticket size={20} /> Promotions
        </button>
        <button className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${activeTab === 'analytics' ? 'bg-purple-900/40 text-purple-400 border border-purple-500/30' : 'text-neutral-400 hover:bg-neutral-800'}`} onClick={() => setActiveTab('analytics')}>
          <Activity size={20} /> Analytics
        </button>
        
        <div className="mt-auto">
          <button className="flex items-center gap-3 p-3 rounded-xl text-neutral-400 hover:bg-neutral-800 transition-colors w-full">
            <Settings size={20} /> Settings
          </button>
          <div className="flex items-center gap-3 p-3 mt-2 border-t border-neutral-800">
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
              <User size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">Barney&apos;s Lounge</span>
              <span className="text-xs text-neutral-500">Owner</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-white">Active Promotions</h2>
          <button className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
            <Plus size={20} /> Create New
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* MOCK PROMO CARD 1 */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-purple-900/30 text-purple-400 px-3 py-1 rounded-full text-xs font-bold border border-purple-500/30">
                ACTIVE
              </div>
              <span className="text-neutral-500 text-sm">Ends Tonight 2AM</span>
            </div>
            <h3 className="text-xl font-bold mb-2">No Cover Before 11PM</h3>
            <p className="text-neutral-400 text-sm mb-6 flex-1">Show this QR code at the door for free entry before 11:00 PM.</p>
            <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
              <div className="flex flex-col">
                <span className="text-xs text-neutral-500">Scans</span>
                <span className="text-lg font-bold text-white">124</span>
              </div>
              <button className="text-cyan-400 hover:text-cyan-300 text-sm font-bold">Edit</button>
            </div>
          </div>

          {/* MOCK PROMO CARD 2 */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-emerald-900/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
                SCHEDULED
              </div>
              <span className="text-neutral-500 text-sm">Starts Friday 9PM</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Half-Price Apps</h3>
            <p className="text-neutral-400 text-sm mb-6 flex-1">Valid for all appetizers when ordering 2+ drinks.</p>
            <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
              <div className="flex flex-col">
                <span className="text-xs text-neutral-500">Scans</span>
                <span className="text-lg font-bold text-white">0</span>
              </div>
              <button className="text-cyan-400 hover:text-cyan-300 text-sm font-bold">Edit</button>
            </div>
          </div>
          
          {/* CREATE NEW PLACEHOLDER */}
          <button className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors min-h-[200px] group">
            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Plus size={24} />
            </div>
            <span className="font-bold">Create Promotion</span>
          </button>
        </div>
      </div>
    </div>
  );
}
