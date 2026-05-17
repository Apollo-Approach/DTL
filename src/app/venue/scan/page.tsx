'use client';

import { useState } from 'react';
import { redeemPass } from '@/app/actions/coupons';

export default function VenueScannerStub() {
  const [passId, setPassId] = useState('');
  const [venueId, setVenueId] = useState('d3b07384-d113-4d51-a90a-a13a8b4b4555'); // Example UUID
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{success: boolean, message?: string, error?: string} | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passId) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await redeemPass(passId, venueId);
      setResult(response);
    } catch (err) {
      console.error(err);
      setResult({ success: false, error: 'Network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans">
      <div className="max-w-md mx-auto mt-20 border border-white/10 p-8 rounded-2xl bg-zinc-900/50">
        <h1 className="text-2xl font-black uppercase tracking-widest mb-2 text-cyan-400">Venue Portal</h1>
        <p className="text-sm text-zinc-400 mb-8 font-medium">Staff Scanner (MVP Stub)</p>

        <form onSubmit={handleScan} className="flex flex-col gap-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Pass ID (UUID from QR)
            </label>
            <input 
              type="text" 
              value={passId}
              onChange={(e) => setPassId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              className="w-full bg-black border border-white/20 p-3 text-sm text-white font-mono focus:border-cyan-400 outline-none transition-colors rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Venue ID (Your Venue)
            </label>
            <input 
              type="text" 
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full bg-black border border-white/20 p-3 text-sm text-zinc-500 font-mono outline-none rounded-lg"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Simulate Scan'}
          </button>
        </form>

        {result && (
          <div className={`mt-8 p-4 rounded-lg border ${result.success ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'} font-bold text-center text-sm`}>
            {result.success ? result.message : result.error}
          </div>
        )}
      </div>
    </div>
  );
}
