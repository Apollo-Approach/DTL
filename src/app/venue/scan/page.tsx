'use client';

import { useState } from 'react';
import { redeemPass } from '@/app/actions/venueActions';

export default function VenueScanPage() {
  const [passId, setPassId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passId) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await redeemPass(passId);
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Pass redeemed successfully!' });
        setPassId(''); // clear on success
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to redeem pass.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/5 border border-white/10 p-8 flex flex-col items-center">
        <div className="w-16 h-16 bg-fuchsia-500/20 text-fuchsia-500 flex items-center justify-center rounded-full mb-6 border border-fuchsia-500/50">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Scan Pass</h2>
        <p className="text-gray-400 text-sm text-center mb-8">
          Enter the user&apos;s Pass Code manually to redeem their promotion.
        </p>

        <form onSubmit={handleScan} className="w-full space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Pass Code</label>
            <input 
              type="text" 
              value={passId}
              onChange={(e) => {
                const val = e.target.value;
                const formatted = val
                  .replace(/[^a-zA-Z- ]/g, '')
                  .replace(/ /g, '-')
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                  .join('-');
                setPassId(formatted);
              }}
              placeholder="e.g. Generous-Purple-Sloth"
              className="w-full bg-black border border-white/20 p-3 text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500 transition-colors font-mono text-sm"
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black uppercase tracking-wider text-sm py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Validating...' : 'Redeem Pass'}
          </button>
        </form>

        {message && (
          <div className={`mt-6 w-full p-4 border ${message.type === 'success' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400'} text-sm font-bold text-center animate-in zoom-in-95 duration-200`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
